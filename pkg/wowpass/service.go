package wowpass

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"karazhan/pkg/config"
	"log"
	"math/rand"
	"net/http"
	"os/exec"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"

	_ "github.com/go-sql-driver/mysql"
)

var (
	updateDSN = config.UpdateDSN()
	authDSN   = config.AuthDSN()
	charDSN   = config.CharactersDSN()
	worldDSN  = config.WorldDSN()
)

const (
	menuNameCardDraw = "\uce74\ub4dc\ubf51\uae30"
)

type cardCharacter struct {
	Guid   int    `json:"guid"`
	Name   string `json:"name"`
	Race   int    `json:"race"`
	Class  int    `json:"class"`
	Gender int    `json:"gender"`
	Level  int    `json:"level"`
}

type carddrawPoolListItem struct {
	ItemEntry   int    `json:"itemEntry"`
	Name        string `json:"name"`
	Icon        string `json:"icon"`
	IconURL     string `json:"iconUrl"`
	Rarity      string `json:"rarity"`
	RarityLabel string `json:"rarityLabel"`
}

type carddrawReward struct {
	ItemEntry   int    `json:"itemEntry"`
	Name        string `json:"name"`
	Icon        string `json:"icon"`
	IconURL     string `json:"iconUrl"`
	Rarity      string `json:"rarity"`
	RarityLabel string `json:"rarityLabel"`
	Quantity    int    `json:"quantity"`
}

type carddrawPendingPack struct {
	PackID        string
	UserID        int
	Username      string
	TrackLevel    int
	SelectedChar  cardCharacter
	DrawCount     int
	OpenableSlots []int
	RewardsBySlot map[int]carddrawReward
	OpenedSlots   map[int]bool
	CreatedAt     time.Time
}

type carddrawPoolItem struct {
	ID            int
	ItemEntry     int
	ItemName      string
	Icon          string
	Rarity        string
	RarityLabel   string
	ChancePercent float64
	MaxCount      int
	IsActive      int
}

var (
	carddrawPackStoreMu sync.Mutex
	carddrawPackStore   = map[int]*carddrawPendingPack{}
)

func RegisterRoutes(mux *http.ServeMux) {
	ensureCardDrawMenuSeeds()
	ensureCardDrawSchema()

	mux.HandleFunc("/api/carddraw/state", handleCardDrawState)
	mux.HandleFunc("/api/carddraw/world-status", handleCardDrawWorldStatus)
	mux.HandleFunc("/api/carddraw/characters", handleCardDrawCharacters)
	mux.HandleFunc("/api/carddraw/character/select", handleCardDrawSelectCharacter)
	mux.HandleFunc("/api/carddraw/pack/create", handleCardDrawPackCreate)
	mux.HandleFunc("/api/carddraw/pack/open", handleCardDrawPackOpen)
	mux.HandleFunc("/api/carddraw/draw", handleCardDrawDraw)
	mux.HandleFunc("/api/carddraw/pool/list", handleCarddrawPoolList)

	serveStatic := func(w http.ResponseWriter, r *http.Request, strip string) {
		cookie, err := r.Cookie("session_user")
		if err != nil || strings.TrimSpace(cookie.Value) == "" {
			http.Redirect(w, r, "/", http.StatusFound)
			return
		}
		fs := http.FileServer(http.Dir("./pkg/wowpass/static"))
		http.StripPrefix(strip, fs).ServeHTTP(w, r)
	}

	mux.HandleFunc("/carddraw/", func(w http.ResponseWriter, r *http.Request) {
		serveStatic(w, r, "/carddraw/")
	})

	mux.HandleFunc("/wowpass/", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/carddraw/", http.StatusFound)
	})
}

func ensureCardDrawMenuSeeds() {
	db, err := sql.Open("mysql", updateDSN)
	if err != nil {
		return
	}
	defer db.Close()

	_, _ = db.Exec(`CREATE TABLE IF NOT EXISTS web_menu_registry (
        id VARCHAR(100) PRIMARY KEY,
        type VARCHAR(20) NOT NULL DEFAULT 'menu',
        name VARCHAR(120) NOT NULL,
        order_index INT DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)

	// New id
	_, _ = db.Exec("INSERT IGNORE INTO web_menu_registry (id, type, name, order_index) VALUES ('carddraw', 'menu', ?, 14)", menuNameCardDraw)
	_, _ = db.Exec("UPDATE web_menu_registry SET name=?, order_index=14 WHERE id='carddraw'", menuNameCardDraw)

	_, _ = db.Exec("INSERT IGNORE INTO web_role_permissions (resource_type, resource_id, resource_name, rank_1, rank_2, rank_3, order_index) VALUES ('menu', 'carddraw', ?, 1, 1, 1, 14)", menuNameCardDraw)
	_, _ = db.Exec("UPDATE web_role_permissions SET resource_name=?, rank_1=1, rank_2=1, rank_3=1, order_index=14 WHERE resource_type='menu' AND resource_id='carddraw'", menuNameCardDraw)
	_, _ = db.Exec("DELETE FROM web_role_permissions WHERE resource_type='menu' AND resource_id='wowpass'")
	_, _ = db.Exec("DELETE FROM web_menu_registry WHERE id='wowpass'")
}

func ensureCardDrawSchema() {
	db, err := sql.Open("mysql", updateDSN)
	if err != nil {
		return
	}
	defer db.Close()

	// New naming
	_, _ = db.Exec("ALTER TABLE user_profiles ADD COLUMN carddraw_draw_count INT NOT NULL DEFAULT 0")
	_, _ = db.Exec("ALTER TABLE user_profiles MODIFY COLUMN carddraw_draw_count INT NOT NULL DEFAULT 0")
	_, _ = db.Exec("ALTER TABLE user_profiles ADD COLUMN carddraw_selected_char_guid INT NOT NULL DEFAULT 0")
	_, _ = db.Exec("ALTER TABLE user_profiles ADD COLUMN carddraw_selected_char_name VARCHAR(32) NOT NULL DEFAULT ''")
	_, _ = db.Exec("ALTER TABLE user_profiles ADD COLUMN carddraw_selected_char_race INT NOT NULL DEFAULT 0")
	_, _ = db.Exec("ALTER TABLE user_profiles ADD COLUMN carddraw_selected_char_class INT NOT NULL DEFAULT 0")
	_, _ = db.Exec("ALTER TABLE user_profiles ADD COLUMN carddraw_selected_char_gender INT NOT NULL DEFAULT 0")
	_, _ = db.Exec("ALTER TABLE user_profiles ADD COLUMN carddraw_selected_char_level INT NOT NULL DEFAULT 0")

	_, _ = db.Exec(`
        CREATE TABLE IF NOT EXISTS carddraw_draw_logs (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            username VARCHAR(50) NOT NULL DEFAULT '',
            selected_char_guid INT NOT NULL DEFAULT 0,
            selected_char_name VARCHAR(32) NOT NULL DEFAULT '',
            selected_char_race INT NOT NULL DEFAULT 0,
            selected_char_class INT NOT NULL DEFAULT 0,
            selected_char_gender INT NOT NULL DEFAULT 0,
            selected_char_level INT NOT NULL DEFAULT 0,
            track_level INT NOT NULL DEFAULT 0,
            reward_name VARCHAR(120) NOT NULL DEFAULT '',
            reward_icon VARCHAR(120) NOT NULL DEFAULT '',
            reward_rarity VARCHAR(20) NOT NULL DEFAULT '',
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_carddraw_draw_logs_user_created (user_id, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)

}

func writeJSON(w http.ResponseWriter, status int, body interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func getSessionUsername(r *http.Request) (string, error) {
	cookie, err := r.Cookie("session_user")
	if err != nil || strings.TrimSpace(cookie.Value) == "" {
		return "", http.ErrNoCookie
	}
	return strings.TrimSpace(cookie.Value), nil
}

func getSessionUserID(r *http.Request) (int, string, error) {
	username, err := getSessionUsername(r)
	if err != nil {
		return 0, "", err
	}

	db, err := sql.Open("mysql", authDSN)
	if err != nil {
		return 0, "", err
	}
	defer db.Close()

	var userID int
	if err := db.QueryRow("SELECT id FROM account WHERE UPPER(TRIM(username)) = UPPER(TRIM(?))", username).Scan(&userID); err != nil {
		return 0, "", err
	}
	return userID, username, nil
}

func ensureUserProfileRow(db *sql.DB, userID int) error {
	if userID <= 0 {
		return fmt.Errorf("invalid user id")
	}

	_, err := db.Exec(`
        INSERT INTO user_profiles (user_id)
        VALUES (?)
        ON DUPLICATE KEY UPDATE user_id = user_id
    `, userID)
	if err != nil {
		return err
	}

	_, _ = db.Exec(`
        UPDATE user_profiles
        SET carddraw_draw_count = IFNULL(carddraw_draw_count, 0)
        WHERE user_id = ?
    `, userID)

	return nil
}

func fetchUserCharacters(accountID int) ([]cardCharacter, error) {
	charDB, err := sql.Open("mysql", charDSN)
	if err != nil {
		return nil, err
	}
	defer charDB.Close()

	rows, err := charDB.Query(`
        SELECT guid, name, race, class, gender, level
        FROM characters
        WHERE account = ?
        ORDER BY level DESC, name ASC
    `, accountID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]cardCharacter, 0)
	for rows.Next() {
		var c cardCharacter
		if err := rows.Scan(&c.Guid, &c.Name, &c.Race, &c.Class, &c.Gender, &c.Level); err != nil {
			continue
		}
		out = append(out, c)
	}
	return out, nil
}

func findCharacterByGuid(accountID, guid int) (cardCharacter, error) {
	charDB, err := sql.Open("mysql", charDSN)
	if err != nil {
		return cardCharacter{}, err
	}
	defer charDB.Close()

	var c cardCharacter
	err = charDB.QueryRow(`
        SELECT guid, name, race, class, gender, level
        FROM characters
        WHERE account = ? AND guid = ?
        LIMIT 1
    `, accountID, guid).Scan(&c.Guid, &c.Name, &c.Race, &c.Class, &c.Gender, &c.Level)
	if err != nil {
		return cardCharacter{}, err
	}
	return c, nil
}

func loadSelectedCharacter(updateDB *sql.DB, userID int) cardCharacter {
	var c cardCharacter
	_ = updateDB.QueryRow(`
        SELECT
            IFNULL(carddraw_selected_char_guid, 0),
            IFNULL(carddraw_selected_char_name, ''),
            IFNULL(carddraw_selected_char_race, 0),
            IFNULL(carddraw_selected_char_class, 0),
            IFNULL(carddraw_selected_char_gender, 0),
            IFNULL(carddraw_selected_char_level, 0)
        FROM user_profiles
        WHERE user_id = ?
    `, userID).Scan(&c.Guid, &c.Name, &c.Race, &c.Class, &c.Gender, &c.Level)
	return c
}

func handleCardDrawState(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"status": "error", "message": "허용되지 않은 요청입니다."})
		return
	}

	userID, username, err := getSessionUserID(r)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"status": "error", "message": "로그인이 필요합니다."})
		return
	}

	updateDB, err := sql.Open("mysql", updateDSN)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "상태 조회에 실패했습니다."})
		return
	}
	defer updateDB.Close()

	if err := ensureUserProfileRow(updateDB, userID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "상태 조회에 실패했습니다."})
		return
	}

	drawCount := 0
	var mainGuid int
	var mainName string
	err = updateDB.QueryRow(`
        SELECT
            IFNULL(carddraw_draw_count, 0),
            IFNULL(main_char_guid, 0),
            IFNULL(main_char_name, '')
        FROM user_profiles
        WHERE user_id = ?
    `, userID).Scan(&drawCount, &mainGuid, &mainName)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "상태 조회에 실패했습니다."})
		return
	}

	selected := loadSelectedCharacter(updateDB, userID)
	if selected.Guid == 0 && mainGuid > 0 {
		if c, e := findCharacterByGuid(userID, mainGuid); e == nil {
			selected = c
		} else {
			selected = cardCharacter{Guid: mainGuid, Name: mainName}
		}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":            "success",
		"username":          username,
		"drawCount":         drawCount,
		"selectedCharacter": selected,
	})
}

func handleCardDrawCharacters(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"status": "error", "message": "허용되지 않은 요청입니다."})
		return
	}

	userID, _, err := getSessionUserID(r)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"status": "error", "message": "로그인이 필요합니다."})
		return
	}

	chars, err := fetchUserCharacters(userID)
	if err != nil {
		log.Printf("[carddraw] character list error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "캐릭터 목록 조회에 실패했습니다."})
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":     "success",
		"characters": chars,
	})
}

func handleCardDrawSelectCharacter(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"status": "error", "message": "허용되지 않은 요청입니다."})
		return
	}

	userID, _, err := getSessionUserID(r)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"status": "error", "message": "로그인이 필요합니다."})
		return
	}

	var req struct {
		Guid int `json:"guid"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Guid <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "캐릭터 선택 정보가 올바르지 않습니다."})
		return
	}

	char, err := findCharacterByGuid(userID, req.Guid)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "선택한 캐릭터 정보를 찾을 수 없습니다."})
		return
	}

	updateDB, err := sql.Open("mysql", updateDSN)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "캐릭터 저장에 실패했습니다."})
		return
	}
	defer updateDB.Close()

	if err := ensureUserProfileRow(updateDB, userID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "캐릭터 저장에 실패했습니다."})
		return
	}

	_, err = updateDB.Exec(`
        UPDATE user_profiles
        SET carddraw_selected_char_guid = ?,
            carddraw_selected_char_name = ?,
            carddraw_selected_char_race = ?,
            carddraw_selected_char_class = ?,
            carddraw_selected_char_gender = ?,
            carddraw_selected_char_level = ?
        WHERE user_id = ?
    `, char.Guid, char.Name, char.Race, char.Class, char.Gender, char.Level, userID)
	if err != nil {
		log.Printf("[carddraw/select] update error user_id=%d guid=%d err=%v", userID, char.Guid, err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "캐릭터 저장에 실패했습니다."})
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":            "success",
		"selectedCharacter": char,
	})
}

func handleCardDrawPackCreate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"status": "error", "message": "허용되지 않은 요청입니다."})
		return
	}
	if !isCardDrawWorldServerRunning() {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "월드서버가 가동 중이 아닙니다. 서버 가동 후 카드뽑기가 가능합니다."})
		return
	}

	userID, username, err := getSessionUserID(r)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"status": "error", "message": "로그인이 필요합니다."})
		return
	}

	var req struct {
		TrackLevel int `json:"trackLevel"`
		DrawCount  int `json:"drawCount"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "카드팩 생성 요청이 올바르지 않습니다."})
		return
	}
	if req.TrackLevel <= 0 {
		req.TrackLevel = 1
	}
	if req.DrawCount <= 0 {
		req.DrawCount = 1
	}
	if req.DrawCount > 5 {
		req.DrawCount = 5
	}

	carddrawPackStoreMu.Lock()
	existing := carddrawPackStore[userID]
	if existing != nil {
		hasUnopened := false
		for _, slot := range existing.OpenableSlots {
			if !existing.OpenedSlots[slot] {
				hasUnopened = true
				break
			}
		}
		if hasUnopened {
			openable := append([]int(nil), existing.OpenableSlots...)
			sort.Ints(openable)
			carddrawPackStoreMu.Unlock()
			writeJSON(w, http.StatusOK, map[string]interface{}{
				"status":        "success",
				"packId":        existing.PackID,
				"drawCount":     req.DrawCount,
				"remainingDraw": -1,
				"openableSlots": openable,
				"selectedCharacter": map[string]interface{}{
					"guid":   existing.SelectedChar.Guid,
					"name":   existing.SelectedChar.Name,
					"race":   existing.SelectedChar.Race,
					"class":  existing.SelectedChar.Class,
					"gender": existing.SelectedChar.Gender,
					"level":  existing.SelectedChar.Level,
				},
			})
			return
		}
		delete(carddrawPackStore, userID)
	}
	carddrawPackStoreMu.Unlock()

	updateDB, err := sql.Open("mysql", updateDSN)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "카드팩 생성에 실패했습니다."})
		return
	}
	defer updateDB.Close()

	if err := ensureUserProfileRow(updateDB, userID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "카드팩 생성에 실패했습니다."})
		return
	}

	tx, err := updateDB.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "카드팩 생성에 실패했습니다."})
		return
	}
	defer tx.Rollback()

	var drawCount int
	var selected cardCharacter
	err = tx.QueryRow(`
        SELECT
            IFNULL(carddraw_draw_count, 0),
            IFNULL(carddraw_selected_char_guid, 0),
            IFNULL(carddraw_selected_char_name, ''),
            IFNULL(carddraw_selected_char_race, 0),
            IFNULL(carddraw_selected_char_class, 0),
            IFNULL(carddraw_selected_char_gender, 0),
            IFNULL(carddraw_selected_char_level, 0)
        FROM user_profiles
        WHERE user_id = ?
        FOR UPDATE
    `, userID).Scan(&drawCount, &selected.Guid, &selected.Name, &selected.Race, &selected.Class, &selected.Gender, &selected.Level)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "카드팩 생성에 실패했습니다."})
		return
	}

	if selected.Guid <= 0 || strings.TrimSpace(selected.Name) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "대표 캐릭터를 먼저 선택해주세요."})
		return
	}
	if drawCount < req.DrawCount {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "선택한 횟수만큼 카드 뽑기 가능 횟수가 없습니다."})
		return
	}

	rewards, err := loadCarddrawRandomRewards(req.DrawCount)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "카드뽑기 품목을 불러오지 못했습니다."})
		return
	}

	newCount := drawCount - req.DrawCount
	if _, err := tx.Exec("UPDATE user_profiles SET carddraw_draw_count = ? WHERE user_id = ?", newCount, userID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "카드팩 생성에 실패했습니다."})
		return
	}
	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "카드팩 생성에 실패했습니다."})
		return
	}

	slotOrder := pickCarddrawSlotOrder(req.DrawCount)
	rewardsBySlot := make(map[int]carddrawReward, len(slotOrder))
	for idx, slot := range slotOrder {
		if idx >= len(rewards) {
			break
		}
		rewardsBySlot[slot] = rewards[idx]
	}
	pack := &carddrawPendingPack{
		PackID:        fmt.Sprintf("%d-%d", userID, time.Now().UnixNano()),
		UserID:        userID,
		Username:      username,
		TrackLevel:    req.TrackLevel,
		SelectedChar:  selected,
		DrawCount:     req.DrawCount,
		OpenableSlots: append([]int(nil), slotOrder...),
		RewardsBySlot: rewardsBySlot,
		OpenedSlots:   map[int]bool{},
		CreatedAt:     time.Now(),
	}

	carddrawPackStoreMu.Lock()
	carddrawPackStore[userID] = pack
	carddrawPackStoreMu.Unlock()

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":        "success",
		"packId":        pack.PackID,
		"drawCount":     req.DrawCount,
		"remainingDraw": newCount,
		"openableSlots": slotOrder,
		"selectedCharacter": map[string]interface{}{
			"guid":   selected.Guid,
			"name":   selected.Name,
			"race":   selected.Race,
			"class":  selected.Class,
			"gender": selected.Gender,
			"level":  selected.Level,
		},
	})
}

func handleCardDrawPackOpen(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"status": "error", "message": "허용되지 않은 요청입니다."})
		return
	}

	userID, username, err := getSessionUserID(r)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"status": "error", "message": "로그인이 필요합니다."})
		return
	}

	var req struct {
		PackID string `json:"packId"`
		Slot   int    `json:"slot"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "카드 오픈 요청이 올바르지 않습니다."})
		return
	}
	req.PackID = strings.TrimSpace(req.PackID)
	if req.PackID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "카드팩 정보가 올바르지 않습니다."})
		return
	}

	carddrawPackStoreMu.Lock()
	pack := carddrawPackStore[userID]
	if pack == nil || pack.PackID != req.PackID {
		carddrawPackStoreMu.Unlock()
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "오픈 가능한 카드팩 정보가 없습니다."})
		return
	}
	reward, ok := pack.RewardsBySlot[req.Slot]
	if !ok {
		carddrawPackStoreMu.Unlock()
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "해당 카드는 오픈할 수 없습니다."})
		return
	}
	if pack.OpenedSlots[req.Slot] {
		carddrawPackStoreMu.Unlock()
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "이미 오픈한 카드입니다."})
		return
	}
	pack.OpenedSlots[req.Slot] = true
	selected := pack.SelectedChar
	trackLevel := pack.TrackLevel
	carddrawPackStoreMu.Unlock()

	updateDB, err := sql.Open("mysql", updateDSN)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "카드 오픈에 실패했습니다."})
		return
	}
	defer updateDB.Close()

	if _, err := updateDB.Exec(`
        INSERT INTO carddraw_draw_logs
        (
            user_id, username,
            selected_char_guid, selected_char_name, selected_char_race, selected_char_class, selected_char_gender, selected_char_level,
            track_level, reward_name, reward_icon, reward_rarity
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, userID, username, selected.Guid, selected.Name, selected.Race, selected.Class, selected.Gender, selected.Level, trackLevel, reward.Name, reward.Icon, reward.RarityLabel); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "카드 뽑기 로그 기록에 실패했습니다."})
		return
	}

	clearCompletedCarddrawPack(userID)

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status": "success",
		"reward": map[string]interface{}{
			"itemEntry":   reward.ItemEntry,
			"name":        reward.Name,
			"icon":        reward.Icon,
			"iconUrl":     reward.IconURL,
			"rarity":      reward.Rarity,
			"rarityLabel": reward.RarityLabel,
			"quantity":    reward.Quantity,
		},
	})
}

func handleCardDrawDraw(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"status": "error", "message": "허용되지 않은 요청입니다."})
		return
	}

	if !isCardDrawWorldServerRunning() {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "월드서버가 가동 중이 아닙니다. 서버 가동 후 카드뽑기가 가능합니다."})
		return
	}

	userID, username, err := getSessionUserID(r)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"status": "error", "message": "로그인이 필요합니다."})
		return
	}

	var req struct {
		TrackLevel   int    `json:"trackLevel"`
		DrawCount    int    `json:"drawCount"`
		RewardEntry  int    `json:"rewardEntry"`
		RewardName   string `json:"rewardName"`
		RewardIcon   string `json:"rewardIcon"`
		RewardRarity string `json:"rewardRarity"`
		Rewards      []struct {
			RewardEntry  int    `json:"rewardEntry"`
			RewardName   string `json:"rewardName"`
			RewardIcon   string `json:"rewardIcon"`
			RewardRarity string `json:"rewardRarity"`
		} `json:"rewards"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "카드 뽑기 요청이 올바르지 않습니다."})
		return
	}
	req.RewardName = strings.TrimSpace(req.RewardName)
	req.RewardIcon = strings.TrimSpace(req.RewardIcon)
	req.RewardRarity = strings.TrimSpace(req.RewardRarity)
	if req.TrackLevel <= 0 {
		req.TrackLevel = 1
	}

	type drawRewardLog struct {
		Entry  int
		Name   string
		Icon   string
		Rarity string
	}

	rewardLogs := make([]drawRewardLog, 0, 5)
	for _, reward := range req.Rewards {
		row := drawRewardLog{
			Entry:  reward.RewardEntry,
			Name:   strings.TrimSpace(reward.RewardName),
			Icon:   strings.TrimSpace(reward.RewardIcon),
			Rarity: strings.TrimSpace(reward.RewardRarity),
		}
		if row.Entry > 0 {
			if worldName, e := fetchWorldItemName(row.Entry); e == nil && strings.TrimSpace(worldName) != "" {
				row.Name = strings.TrimSpace(worldName)
			}
		}
		if row.Name == "" {
			row.Name = "알 수 없는 아이템"
		}
		if row.Rarity == "" {
			row.Rarity = "일반"
		}
		rewardLogs = append(rewardLogs, row)
	}
	if len(rewardLogs) == 0 {
		row := drawRewardLog{
			Entry:  req.RewardEntry,
			Name:   strings.TrimSpace(req.RewardName),
			Icon:   strings.TrimSpace(req.RewardIcon),
			Rarity: strings.TrimSpace(req.RewardRarity),
		}
		if row.Entry > 0 {
			if worldName, e := fetchWorldItemName(row.Entry); e == nil && strings.TrimSpace(worldName) != "" {
				row.Name = strings.TrimSpace(worldName)
			}
		}
		if row.Name == "" {
			row.Name = "알 수 없는 아이템"
		}
		if row.Rarity == "" {
			row.Rarity = "일반"
		}
		rewardLogs = append(rewardLogs, row)
	}

	requestedDrawCount := req.DrawCount
	if requestedDrawCount <= 0 {
		requestedDrawCount = len(rewardLogs)
	}
	if requestedDrawCount <= 0 {
		requestedDrawCount = 1
	}
	if requestedDrawCount > 5 {
		requestedDrawCount = 5
	}
	if len(rewardLogs) > requestedDrawCount {
		rewardLogs = rewardLogs[:requestedDrawCount]
	}
	if len(rewardLogs) < requestedDrawCount {
		requestedDrawCount = len(rewardLogs)
	}
	if requestedDrawCount <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "카드 뽑기 요청이 올바르지 않습니다."})
		return
	}

	updateDB, err := sql.Open("mysql", updateDSN)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "카드 뽑기에 실패했습니다."})
		return
	}
	defer updateDB.Close()

	if err := ensureUserProfileRow(updateDB, userID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "카드 뽑기에 실패했습니다."})
		return
	}

	tx, err := updateDB.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "카드 뽑기에 실패했습니다."})
		return
	}
	defer tx.Rollback()

	var drawCount int
	var selected cardCharacter
	err = tx.QueryRow(`
        SELECT
            IFNULL(carddraw_draw_count, 0),
            IFNULL(carddraw_selected_char_guid, 0),
            IFNULL(carddraw_selected_char_name, ''),
            IFNULL(carddraw_selected_char_race, 0),
            IFNULL(carddraw_selected_char_class, 0),
            IFNULL(carddraw_selected_char_gender, 0),
            IFNULL(carddraw_selected_char_level, 0)
        FROM user_profiles
        WHERE user_id = ?
        FOR UPDATE
    `, userID).Scan(&drawCount, &selected.Guid, &selected.Name, &selected.Race, &selected.Class, &selected.Gender, &selected.Level)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "카드 뽑기에 실패했습니다."})
		return
	}

	if selected.Guid <= 0 || strings.TrimSpace(selected.Name) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "대표 캐릭터를 먼저 선택해주세요."})
		return
	}
	if drawCount <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "카드 뽑기 가능 횟수가 없습니다."})
		return
	}
	if drawCount < requestedDrawCount {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "선택한 횟수만큼 카드 뽑기 가능 횟수가 없습니다."})
		return
	}

	newCount := drawCount - requestedDrawCount
	if _, err := tx.Exec("UPDATE user_profiles SET carddraw_draw_count = ? WHERE user_id = ?", newCount, userID); err != nil {
		log.Printf("[carddraw/draw] draw_count update error user_id=%d err=%v", userID, err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "카드 뽑기에 실패했습니다."})
		return
	}

	for _, reward := range rewardLogs {
		if _, err := tx.Exec(`
        INSERT INTO carddraw_draw_logs
        (
            user_id, username,
            selected_char_guid, selected_char_name, selected_char_race, selected_char_class, selected_char_gender, selected_char_level,
            track_level, reward_name, reward_icon, reward_rarity
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, userID, username, selected.Guid, selected.Name, selected.Race, selected.Class, selected.Gender, selected.Level, req.TrackLevel, reward.Name, reward.Icon, reward.Rarity); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "카드 뽑기 로그 기록에 실패했습니다."})
			return
		}
	}

	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "카드 뽑기에 실패했습니다."})
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":            "success",
		"drawCount":         newCount,
		"selectedCharacter": selected,
	})
}

func fetchWorldItemName(entry int) (string, error) {
	if entry <= 0 {
		return "", fmt.Errorf("invalid item entry")
	}
	db, err := sql.Open("mysql", worldDSN)
	if err != nil {
		return "", err
	}
	defer db.Close()

	var name string
	if err := db.QueryRow("SELECT name FROM item_template WHERE entry = ? LIMIT 1", entry).Scan(&name); err != nil {
		return "", err
	}
	return name, nil
}

func normalizeCarddrawChance(v float64) float64 {
	if v < 0 {
		return 0
	}
	return v
}

func normalizeCarddrawMaxCount(v int) int {
	if v <= 0 {
		return 1
	}
	return v
}

func pickCarddrawSlotOrder(count int) []int {
	switch count {
	case 1:
		return []int{0}
	case 2:
		return []int{1, 2}
	case 3:
		return []int{0, 1, 2}
	case 4:
		return []int{1, 2, 3, 4}
	default:
		return []int{0, 1, 2, 3, 4}
	}
}

func weightedPickCarddrawIndex(items []carddrawPoolItem) int {
	if len(items) == 0 {
		return -1
	}
	total := 0.0
	for _, item := range items {
		total += normalizeCarddrawChance(item.ChancePercent)
	}
	if total <= 0 {
		return rand.Intn(len(items))
	}
	roll := rand.Float64() * total
	acc := 0.0
	for idx, item := range items {
		acc += normalizeCarddrawChance(item.ChancePercent)
		if roll <= acc {
			return idx
		}
	}
	return len(items) - 1
}

func fillSingleCarddrawRewardMeta(reward *carddrawReward) {
	if reward == nil {
		return
	}
	items := []carddrawPoolListItem{{
		ItemEntry:   reward.ItemEntry,
		Name:        strings.TrimSpace(reward.Name),
		Icon:        strings.TrimSpace(reward.Icon),
		Rarity:      strings.TrimSpace(strings.ToLower(reward.Rarity)),
		RarityLabel: strings.TrimSpace(reward.RarityLabel),
	}}
	fillCarddrawPoolMetaFromWorld(items)
	if len(items) == 0 {
		return
	}
	reward.Name = strings.TrimSpace(items[0].Name)
	reward.Icon = strings.TrimSpace(items[0].Icon)
	reward.IconURL = strings.TrimSpace(items[0].IconURL)
	if reward.IconURL == "" {
		reward.IconURL = buildCarddrawIconURL(reward.Icon)
	}
	if reward.RarityLabel == "" {
		reward.RarityLabel = carddrawRarityLabel(reward.Rarity)
	}
	if reward.Quantity <= 0 {
		reward.Quantity = 1
	}
}

func loadCarddrawRandomRewards(count int) ([]carddrawReward, error) {
	if count <= 0 {
		count = 1
	}
	if count > 5 {
		count = 5
	}

	updateDB, err := sql.Open("mysql", updateDSN)
	if err != nil {
		return nil, err
	}
	defer updateDB.Close()

	rows, err := updateDB.Query(`
		SELECT
			ci.id,
			ci.item_entry,
			ci.item_name,
			ci.item_icon,
			ci.rarity,
			ci.chance_percent,
			ci.max_count,
			ci.is_active
		FROM web_carddraw_items ci
		WHERE ci.is_active = 1
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	all := make([]carddrawPoolItem, 0)
	for rows.Next() {
		var item carddrawPoolItem
		if err := rows.Scan(&item.ID, &item.ItemEntry, &item.ItemName, &item.Icon, &item.Rarity, &item.ChancePercent, &item.MaxCount, &item.IsActive); err != nil {
			continue
		}
		item.Rarity = strings.ToLower(strings.TrimSpace(item.Rarity))
		if item.Rarity == "" {
			item.Rarity = "common"
		}
		item.RarityLabel = carddrawRarityLabel(item.Rarity)
		item.ChancePercent = normalizeCarddrawChance(item.ChancePercent)
		item.MaxCount = normalizeCarddrawMaxCount(item.MaxCount)
		all = append(all, item)
	}
	if len(all) == 0 {
		return nil, fmt.Errorf("활성 카드뽑기 아이템이 없습니다")
	}

	rewards := make([]carddrawReward, 0, count)
	working := make([]carddrawPoolItem, len(all))
	copy(working, all)
	for i := 0; i < count; i++ {
		candidates := working
		useWorking := true
		if len(candidates) == 0 {
			candidates = all
			useWorking = false
		}
		pickIdx := weightedPickCarddrawIndex(candidates)
		if pickIdx < 0 || pickIdx >= len(candidates) {
			pickIdx = rand.Intn(len(candidates))
		}
		picked := candidates[pickIdx]
		quantity := 1
		if picked.MaxCount > 1 {
			quantity = rand.Intn(picked.MaxCount) + 1
		}
		reward := carddrawReward{
			ItemEntry:   picked.ItemEntry,
			Name:        strings.TrimSpace(picked.ItemName),
			Icon:        strings.TrimSpace(picked.Icon),
			Rarity:      picked.Rarity,
			RarityLabel: picked.RarityLabel,
			Quantity:    quantity,
		}
		fillSingleCarddrawRewardMeta(&reward)
		if reward.Name == "" {
			reward.Name = "알 수 없는 아이템"
		}
		rewards = append(rewards, reward)
		if useWorking {
			working = append(working[:pickIdx], working[pickIdx+1:]...)
		}
	}
	return rewards, nil
}

func clearCompletedCarddrawPack(userID int) {
	carddrawPackStoreMu.Lock()
	defer carddrawPackStoreMu.Unlock()
	pack := carddrawPackStore[userID]
	if pack == nil {
		return
	}
	for _, slot := range pack.OpenableSlots {
		if !pack.OpenedSlots[slot] {
			return
		}
	}
	delete(carddrawPackStore, userID)
}

func handleCardDrawWorldStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"status": "error", "message": "method not allowed"})
		return
	}
	if _, _, err := getSessionUserID(r); err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"status": "error", "message": "login required"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":        "success",
		"world_running": isCardDrawWorldServerRunning(),
	})
}

func isCardDrawWorldServerRunning() bool {
	if runtime.GOOS == "windows" {
		out, err := exec.Command("tasklist", "/FI", "IMAGENAME eq worldserver.exe").Output()
		if err != nil {
			return false
		}
		return strings.Contains(strings.ToLower(string(out)), "worldserver.exe")
	}
	out, err := exec.Command("pgrep", "-f", "worldserver").Output()
	return err == nil && strings.TrimSpace(string(out)) != ""
}

func carddrawRarityLabel(rarity string) string {
	switch strings.ToLower(strings.TrimSpace(rarity)) {
	case "legendary":
		return "전설"
	case "rare":
		return "레어"
	case "uncommon":
		return "희귀"
	default:
		return "일반"
	}
}

func buildCarddrawIconURL(icon string) string {
	clean := strings.TrimSpace(icon)
	if clean == "" {
		return "https://wow.zamimg.com/images/wow/icons/large/inv_misc_questionmark.jpg"
	}
	lower := strings.ToLower(clean)
	if strings.HasPrefix(lower, "http://") || strings.HasPrefix(lower, "https://") || strings.HasPrefix(clean, "/") {
		return clean
	}
	return fmt.Sprintf("https://wow.zamimg.com/images/wow/icons/large/%s.jpg", lower)
}

func fillCarddrawPoolMetaFromWorld(items []carddrawPoolListItem) {
	if len(items) == 0 {
		return
	}
	worldDB, err := sql.Open("mysql", worldDSN)
	if err != nil {
		return
	}
	defer worldDB.Close()

	entries := make([]interface{}, 0, len(items))
	holders := make([]string, 0, len(items))
	seen := map[int]bool{}
	for _, it := range items {
		if it.ItemEntry <= 0 || seen[it.ItemEntry] {
			continue
		}
		seen[it.ItemEntry] = true
		entries = append(entries, it.ItemEntry)
		holders = append(holders, "?")
	}
	if len(entries) == 0 {
		return
	}

	rows, err := worldDB.Query(`
		SELECT
			it.entry,
			COALESCE(NULLIF(itl.Name, ''), NULLIF(it.name, ''), CONCAT('아이템 ', it.entry)) AS item_name,
			COALESCE(NULLIF(it.icon, ''), '') AS icon
		FROM item_template it
		LEFT JOIN item_template_locale itl ON itl.ID = it.entry AND itl.locale = 'koKR'
		WHERE it.entry IN (`+strings.Join(holders, ",")+`)
	`, entries...)
	if err != nil {
		return
	}
	defer rows.Close()

	nameByEntry := map[int]string{}
	iconByEntry := map[int]string{}
	for rows.Next() {
		var entry int
		var name, icon string
		if err := rows.Scan(&entry, &name, &icon); err != nil {
			continue
		}
		nameByEntry[entry] = strings.TrimSpace(name)
		iconByEntry[entry] = strings.TrimSpace(icon)
	}

	for i := range items {
		if strings.TrimSpace(items[i].Name) == "" {
			if n, ok := nameByEntry[items[i].ItemEntry]; ok && n != "" {
				items[i].Name = n
			}
		}
		if strings.TrimSpace(items[i].Icon) == "" {
			if ic, ok := iconByEntry[items[i].ItemEntry]; ok {
				items[i].Icon = ic
			}
		}
		items[i].IconURL = buildCarddrawIconURL(items[i].Icon)
	}
}

func handleCarddrawPoolList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"status": "error", "message": "method not allowed"})
		return
	}
	if _, _, err := getSessionUserID(r); err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"status": "error", "message": "login required"})
		return
	}

	updateDB, err := sql.Open("mysql", updateDSN)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "db connection failed"})
		return
	}
	defer updateDB.Close()

	rows, err := updateDB.Query(`
		SELECT
			ci.item_entry,
			ci.item_name,
			ci.item_icon,
			ci.rarity
		FROM web_carddraw_items ci
		WHERE ci.is_active = 1
		ORDER BY ci.id DESC
		LIMIT 500
	`)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "list query failed"})
		return
	}
	defer rows.Close()

	items := make([]carddrawPoolListItem, 0)
	for rows.Next() {
		var it carddrawPoolListItem
		var rarity string
		if err := rows.Scan(&it.ItemEntry, &it.Name, &it.Icon, &rarity); err != nil {
			continue
		}
		it.Name = strings.TrimSpace(it.Name)
		it.Icon = strings.TrimSpace(it.Icon)
		it.Rarity = strings.ToLower(strings.TrimSpace(rarity))
		it.RarityLabel = carddrawRarityLabel(it.Rarity)
		it.IconURL = buildCarddrawIconURL(it.Icon)
		items = append(items, it)
	}

	fillCarddrawPoolMetaFromWorld(items)

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status": "success",
		"items":  items,
	})
}
