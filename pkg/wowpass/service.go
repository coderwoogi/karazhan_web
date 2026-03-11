package wowpass

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"karazhan/pkg/config"
	"log"
	"net/http"
	"os/exec"
	"runtime"
	"strings"

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

func RegisterRoutes(mux *http.ServeMux) {
	ensureCardDrawMenuSeeds()
	ensureCardDrawSchema()

	mux.HandleFunc("/api/carddraw/state", handleCardDrawState)
	mux.HandleFunc("/api/carddraw/world-status", handleCardDrawWorldStatus)
	mux.HandleFunc("/api/carddraw/characters", handleCardDrawCharacters)
	mux.HandleFunc("/api/carddraw/character/select", handleCardDrawSelectCharacter)
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
		RewardEntry  int    `json:"rewardEntry"`
		RewardName   string `json:"rewardName"`
		RewardIcon   string `json:"rewardIcon"`
		RewardRarity string `json:"rewardRarity"`
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

	if req.RewardEntry > 0 {
		if worldName, e := fetchWorldItemName(req.RewardEntry); e == nil && strings.TrimSpace(worldName) != "" {
			req.RewardName = strings.TrimSpace(worldName)
		}
	}
	if strings.TrimSpace(req.RewardName) == "" {
		req.RewardName = "알 수 없는 아이템"
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

	newCount := drawCount - 1
	if _, err := tx.Exec("UPDATE user_profiles SET carddraw_draw_count = ? WHERE user_id = ?", newCount, userID); err != nil {
		log.Printf("[carddraw/draw] draw_count update error user_id=%d err=%v", userID, err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "카드 뽑기에 실패했습니다."})
		return
	}

	if _, err := tx.Exec(`
        INSERT INTO carddraw_draw_logs
        (
            user_id, username,
            selected_char_guid, selected_char_name, selected_char_race, selected_char_class, selected_char_gender, selected_char_level,
            track_level, reward_name, reward_icon, reward_rarity
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, userID, username, selected.Guid, selected.Name, selected.Race, selected.Class, selected.Gender, selected.Level, req.TrackLevel, req.RewardName, req.RewardIcon, req.RewardRarity); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "카드 뽑기 로그 기록에 실패했습니다."})
		return
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
