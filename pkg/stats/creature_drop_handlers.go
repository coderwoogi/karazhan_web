package stats

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"karazhan/pkg/config"
	"net/http"
	"strconv"
	"strings"
	"time"

	_ "github.com/go-sql-driver/mysql"
)

type creatureDropCreature struct {
	Entry    int    `json:"entry"`
	Name     string `json:"name"`
	SubName  string `json:"sub_name"`
	MinLevel int    `json:"min_level"`
	MaxLevel int    `json:"max_level"`
	Rank     int    `json:"rank"`
}

type creatureDropItem struct {
	Entry         int     `json:"entry"`
	ItemEntry     int     `json:"item_entry"`
	ItemName      string  `json:"item_name"`
	ItemQuality   int     `json:"item_quality"`
	Reference     int     `json:"reference"`
	IsReference   bool    `json:"is_reference"`
	ReferenceName string  `json:"reference_name"`
	Chance        float64 `json:"chance"`
	QuestRequired int     `json:"quest_required"`
	LootMode      int     `json:"loot_mode"`
	GroupID       int     `json:"group_id"`
	MinCount      int     `json:"min_count"`
	MaxCount      int     `json:"max_count"`
	Comment       string  `json:"comment"`
}

func openWorldDBForContent() (*sql.DB, error) {
	return sql.Open("mysql", config.WorldDSN())
}

func triggerCreatureDropReload(r *http.Request, commands ...string) error {
	baseURL := "http://127.0.0.1:8080"
	if r != nil && strings.TrimSpace(r.Host) != "" {
		scheme := "http"
		if r.TLS != nil {
			scheme = "https"
		}
		baseURL = scheme + "://" + r.Host
	}

	client := &http.Client{Timeout: 8 * time.Second}
	for _, command := range commands {
		command = strings.TrimSpace(command)
		if command == "" {
			continue
		}

		payload := map[string]string{"command": command}
		bodyBytes, err := json.Marshal(payload)
		if err != nil {
			return err
		}

		req, err := http.NewRequest(http.MethodPost, baseURL+"/api/launcher/command", bytes.NewReader(bodyBytes))
		if err != nil {
			return err
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Cookie", r.Header.Get("Cookie"))
		req.Header.Set("X-Internal-Caller", "creature-drop")

		resp, err := client.Do(req)
		if err != nil {
			return err
		}
		respBytes, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			return fmt.Errorf("월드서버 명령 실패(%s): %s", command, strings.TrimSpace(string(respBytes)))
		}

		var result map[string]any
		if err := json.Unmarshal(respBytes, &result); err != nil {
			continue
		}
		if status, ok := result["status"].(string); ok && status != "success" {
			if message, ok := result["message"].(string); ok && strings.TrimSpace(message) != "" {
				return fmt.Errorf("월드서버 명령 실패(%s): %s", command, message)
			}
			return fmt.Errorf("월드서버 명령 실패(%s)", command)
		}
	}

	return nil
}

func writeCreatureDropReloadResult(w http.ResponseWriter, reloadErr error) {
	response := map[string]string{
		"status": "success",
		"reload": "success",
	}
	if reloadErr != nil {
		response["reload"] = "failed"
		response["reload_message"] = reloadErr.Error()
	}
	writeJSON(w, http.StatusOK, response)
}

func handleCreatureDropCreatureSearch(w http.ResponseWriter, r *http.Request) {
	if !CheckMenuPermission(w, r, "content") {
		return
	}

	q := strings.TrimSpace(r.URL.Query().Get("q"))
	page := atoiDefault(r.URL.Query().Get("page"), 1)
	if page < 1 {
		page = 1
	}
	limit := atoiDefault(r.URL.Query().Get("limit"), 20)
	if limit < 1 || limit > 100 {
		limit = 20
	}
	offset := (page - 1) * limit

	db, err := openWorldDBForContent()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "월드 DB 연결에 실패했습니다."})
		return
	}
	defer db.Close()

	where := "1=1"
	args := make([]interface{}, 0, 4)
	if q != "" {
		like := "%" + q + "%"
		where = "(CAST(ct.entry AS CHAR) LIKE ? OR ct.name LIKE ? OR ctl.Name LIKE ?)"
		args = append(args, like, like, like)
	}

	var total int
	countSQL := fmt.Sprintf(`
		SELECT COUNT(*)
		FROM creature_template ct
		LEFT JOIN creature_template_locale ctl ON ctl.Entry = ct.entry AND ctl.locale = 'koKR'
		WHERE %s
	`, where)
	if err := db.QueryRow(countSQL, args...).Scan(&total); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": err.Error()})
		return
	}

	listArgs := append(args, limit, offset)
	query := fmt.Sprintf(`
		SELECT
			ct.entry,
			COALESCE(NULLIF(ctl.Name, ''), ct.name, CONCAT('Creature ', ct.entry)) AS creature_name,
			COALESCE(ct.subname, '') AS sub_name,
			COALESCE(ct.minlevel, 0) AS min_level,
			COALESCE(ct.maxlevel, 0) AS max_level,
			COALESCE(ct.rank, 0) AS creature_rank
		FROM creature_template ct
		LEFT JOIN creature_template_locale ctl ON ctl.Entry = ct.entry AND ctl.locale = 'koKR'
		WHERE %s
		ORDER BY ct.entry ASC
		LIMIT ? OFFSET ?
	`, where)
	rows, err := db.Query(query, listArgs...)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": err.Error()})
		return
	}
	defer rows.Close()

	items := make([]creatureDropCreature, 0, limit)
	for rows.Next() {
		var item creatureDropCreature
		if err := rows.Scan(&item.Entry, &item.Name, &item.SubName, &item.MinLevel, &item.MaxLevel, &item.Rank); err == nil {
			items = append(items, item)
		}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"items":      items,
		"total":      total,
		"totalPages": (total + limit - 1) / limit,
		"page":       page,
	})
}

func handleCreatureDropList(w http.ResponseWriter, r *http.Request) {
	if !CheckMenuPermission(w, r, "content") {
		return
	}
	entry := atoiDefault(r.URL.Query().Get("entry"), 0)
	if entry <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "크리처를 먼저 선택해주세요."})
		return
	}

	db, err := openWorldDBForContent()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "월드 DB 연결에 실패했습니다."})
		return
	}
	defer db.Close()

	rows, err := db.Query(`
		SELECT
			clt.Entry,
			clt.Item,
			CASE
				WHEN COALESCE(clt.Reference, 0) > 0 THEN CONCAT('참조 묶음 ', clt.Reference)
				ELSE COALESCE(NULLIF(itl.Name, ''), it.name, CONCAT('Item ', clt.Item))
			END AS item_name,
			COALESCE(it.Quality, 0) AS item_quality,
			COALESCE(clt.Reference, 0) AS reference_id,
			CASE WHEN COALESCE(clt.Reference, 0) > 0 THEN 1 ELSE 0 END AS is_reference,
			CASE WHEN COALESCE(clt.Reference, 0) > 0 THEN CONCAT('reference_loot_template #', clt.Reference) ELSE '' END AS reference_name,
			COALESCE(clt.Chance, 0) AS chance,
			COALESCE(clt.QuestRequired, 0) AS quest_required,
			COALESCE(clt.LootMode, 1) AS loot_mode,
			COALESCE(clt.GroupId, 0) AS group_id,
			COALESCE(clt.MinCount, 1) AS min_count,
			COALESCE(clt.MaxCount, 1) AS max_count,
			COALESCE(clt.Comment, '') AS comment
		FROM creature_loot_template clt
		LEFT JOIN item_template it ON it.entry = clt.Item
		LEFT JOIN item_template_locale itl ON itl.ID = clt.Item AND itl.locale = 'koKR'
		WHERE clt.Entry = ?
		ORDER BY clt.GroupId ASC, clt.Chance DESC, clt.Item ASC
	`, entry)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": err.Error()})
		return
	}
	defer rows.Close()

	items := make([]creatureDropItem, 0, 32)
	for rows.Next() {
		var item creatureDropItem
		var isReference int
		if err := rows.Scan(&item.Entry, &item.ItemEntry, &item.ItemName, &item.ItemQuality, &item.Reference, &isReference, &item.ReferenceName, &item.Chance, &item.QuestRequired, &item.LootMode, &item.GroupID, &item.MinCount, &item.MaxCount, &item.Comment); err == nil {
			item.IsReference = isReference == 1
			items = append(items, item)
		}
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"items": items})
}

func handleCreatureDropSave(w http.ResponseWriter, r *http.Request) {
	if !CheckMenuPermission(w, r, "content") {
		return
	}
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"status": "error", "message": "허용되지 않은 요청입니다."})
		return
	}
	if err := r.ParseForm(); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "요청 값을 읽지 못했습니다."})
		return
	}

	entry := atoiDefault(r.FormValue("entry"), 0)
	itemEntry := atoiDefault(r.FormValue("item_entry"), 0)
	reference := atoiDefault(r.FormValue("reference"), 0)
	chance := atofDefault(r.FormValue("chance"), 0)
	questRequired := atoiDefault(r.FormValue("quest_required"), 0)
	lootMode := atoiDefault(r.FormValue("loot_mode"), 1)
	groupID := atoiDefault(r.FormValue("group_id"), 0)
	minCount := atoiDefault(r.FormValue("min_count"), 1)
	maxCount := atoiDefault(r.FormValue("max_count"), 1)
	comment := strings.TrimSpace(r.FormValue("comment"))

	if entry <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "크리처를 먼저 선택해주세요."})
		return
	}
	if itemEntry <= 0 && reference <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "아이템 또는 참조 ID가 필요합니다."})
		return
	}
	if reference > 0 && itemEntry <= 0 {
		itemEntry = reference
	}
	if chance < 0 || chance > 100 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "드랍 확률은 0~100 사이여야 합니다."})
		return
	}
	if minCount < 1 || maxCount < 1 || minCount > maxCount {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "수량 범위가 올바르지 않습니다."})
		return
	}
	if lootMode < 1 {
		lootMode = 1
	}
	if questRequired != 0 {
		questRequired = 1
	}

	db, err := openWorldDBForContent()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "월드 DB 연결에 실패했습니다."})
		return
	}
	defer db.Close()

	_, err = db.Exec(`
		INSERT INTO creature_loot_template
			(Entry, Item, Reference, Chance, QuestRequired, LootMode, GroupId, MinCount, MaxCount, Comment)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON DUPLICATE KEY UPDATE
			Reference=VALUES(Reference), Chance=VALUES(Chance), QuestRequired=VALUES(QuestRequired), LootMode=VALUES(LootMode),
			GroupId=VALUES(GroupId), MinCount=VALUES(MinCount), MaxCount=VALUES(MaxCount), Comment=VALUES(Comment)
	`, entry, itemEntry, reference, chance, questRequired, lootMode, groupID, minCount, maxCount, comment)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": err.Error()})
		return
	}
	reloadErr := triggerCreatureDropReload(r, ".reload creature_loot_template")
	writeCreatureDropReloadResult(w, reloadErr)
}

func handleCreatureDropReferenceList(w http.ResponseWriter, r *http.Request) {
	if !CheckMenuPermission(w, r, "content") {
		return
	}
	entry := atoiDefault(r.URL.Query().Get("entry"), 0)
	if entry <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "참조 묶음 번호가 올바르지 않습니다."})
		return
	}

	db, err := openWorldDBForContent()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "월드 DB 연결에 실패했습니다."})
		return
	}
	defer db.Close()

	rows, err := db.Query(`
		SELECT
			rlt.Entry,
			rlt.Item,
			COALESCE(NULLIF(itl.Name, ''), it.name, CONCAT('Item ', rlt.Item)) AS item_name,
			COALESCE(it.Quality, 0) AS item_quality,
			COALESCE(rlt.Reference, 0) AS reference_id,
			CASE WHEN COALESCE(rlt.Reference, 0) > 0 THEN 1 ELSE 0 END AS is_reference,
			CASE WHEN COALESCE(rlt.Reference, 0) > 0 THEN CONCAT('reference_loot_template #', rlt.Reference) ELSE '' END AS reference_name,
			COALESCE(rlt.Chance, 0) AS chance,
			COALESCE(rlt.QuestRequired, 0) AS quest_required,
			COALESCE(rlt.LootMode, 1) AS loot_mode,
			COALESCE(rlt.GroupId, 0) AS group_id,
			COALESCE(rlt.MinCount, 1) AS min_count,
			COALESCE(rlt.MaxCount, 1) AS max_count,
			COALESCE(rlt.Comment, '') AS comment
		FROM reference_loot_template rlt
		LEFT JOIN item_template it ON it.entry = rlt.Item
		LEFT JOIN item_template_locale itl ON itl.ID = rlt.Item AND itl.locale = 'koKR'
		WHERE rlt.Entry = ?
		ORDER BY rlt.GroupId ASC, rlt.Chance DESC, rlt.Item ASC
	`, entry)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": err.Error()})
		return
	}
	defer rows.Close()

	items := make([]creatureDropItem, 0, 32)
	for rows.Next() {
		var item creatureDropItem
		var isReference int
		if err := rows.Scan(&item.Entry, &item.ItemEntry, &item.ItemName, &item.ItemQuality, &item.Reference, &isReference, &item.ReferenceName, &item.Chance, &item.QuestRequired, &item.LootMode, &item.GroupID, &item.MinCount, &item.MaxCount, &item.Comment); err == nil {
			item.IsReference = isReference == 1
			items = append(items, item)
		}
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"items": items, "entry": entry})
}

func handleCreatureDropReferenceSave(w http.ResponseWriter, r *http.Request) {
	if !CheckMenuPermission(w, r, "content") {
		return
	}
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"status": "error", "message": "허용되지 않은 요청입니다."})
		return
	}
	if err := r.ParseForm(); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "요청 값을 읽지 못했습니다."})
		return
	}

	entry := atoiDefault(r.FormValue("entry"), 0)
	itemEntry := atoiDefault(r.FormValue("item_entry"), 0)
	reference := atoiDefault(r.FormValue("reference"), 0)
	chance := atofDefault(r.FormValue("chance"), 0)
	questRequired := atoiDefault(r.FormValue("quest_required"), 0)
	lootMode := atoiDefault(r.FormValue("loot_mode"), 1)
	groupID := atoiDefault(r.FormValue("group_id"), 0)
	minCount := atoiDefault(r.FormValue("min_count"), 1)
	maxCount := atoiDefault(r.FormValue("max_count"), 1)
	comment := strings.TrimSpace(r.FormValue("comment"))

	if entry <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "참조 묶음 번호가 올바르지 않습니다."})
		return
	}
	if itemEntry <= 0 && reference <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "아이템 또는 하위 참조 번호가 필요합니다."})
		return
	}
	if reference > 0 && itemEntry <= 0 {
		itemEntry = reference
	}
	if chance < 0 || chance > 100 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "드랍 확률은 0~100 사이여야 합니다."})
		return
	}
	if minCount < 1 || maxCount < 1 || minCount > maxCount {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "수량 범위가 올바르지 않습니다."})
		return
	}
	if lootMode < 1 {
		lootMode = 1
	}
	if questRequired != 0 {
		questRequired = 1
	}

	db, err := openWorldDBForContent()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "월드 DB 연결에 실패했습니다."})
		return
	}
	defer db.Close()

	_, err = db.Exec(`
		INSERT INTO reference_loot_template
			(Entry, Item, Reference, Chance, QuestRequired, LootMode, GroupId, MinCount, MaxCount, Comment)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON DUPLICATE KEY UPDATE
			Reference=VALUES(Reference), Chance=VALUES(Chance), QuestRequired=VALUES(QuestRequired), LootMode=VALUES(LootMode),
			GroupId=VALUES(GroupId), MinCount=VALUES(MinCount), MaxCount=VALUES(MaxCount), Comment=VALUES(Comment)
	`, entry, itemEntry, reference, chance, questRequired, lootMode, groupID, minCount, maxCount, comment)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": err.Error()})
		return
	}
	reloadErr := triggerCreatureDropReload(r, ".reload reference_loot_template", ".reload creature_loot_template")
	writeCreatureDropReloadResult(w, reloadErr)
}

func handleCreatureDropReferenceDelete(w http.ResponseWriter, r *http.Request) {
	if !CheckMenuPermission(w, r, "content") {
		return
	}
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"status": "error", "message": "허용되지 않은 요청입니다."})
		return
	}
	if err := r.ParseForm(); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "요청 값을 읽지 못했습니다."})
		return
	}
	entry := atoiDefault(r.FormValue("entry"), 0)
	itemEntry := atoiDefault(r.FormValue("item_entry"), 0)
	if entry <= 0 || itemEntry <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "삭제할 참조 묶음 아이템 정보가 올바르지 않습니다."})
		return
	}

	db, err := openWorldDBForContent()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "월드 DB 연결에 실패했습니다."})
		return
	}
	defer db.Close()

	if _, err := db.Exec("DELETE FROM reference_loot_template WHERE Entry = ? AND Item = ?", entry, itemEntry); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": err.Error()})
		return
	}
	reloadErr := triggerCreatureDropReload(r, ".reload reference_loot_template", ".reload creature_loot_template")
	writeCreatureDropReloadResult(w, reloadErr)
}

func handleCreatureDropDelete(w http.ResponseWriter, r *http.Request) {
	if !CheckMenuPermission(w, r, "content") {
		return
	}
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"status": "error", "message": "허용되지 않은 요청입니다."})
		return
	}
	if err := r.ParseForm(); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "요청 값을 읽지 못했습니다."})
		return
	}
	entry := atoiDefault(r.FormValue("entry"), 0)
	itemEntry := atoiDefault(r.FormValue("item_entry"), 0)
	if entry <= 0 || itemEntry <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "삭제할 드랍 정보가 올바르지 않습니다."})
		return
	}

	db, err := openWorldDBForContent()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "월드 DB 연결에 실패했습니다."})
		return
	}
	defer db.Close()

	if _, err := db.Exec("DELETE FROM creature_loot_template WHERE Entry = ? AND Item = ?", entry, itemEntry); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": err.Error()})
		return
	}
	reloadErr := triggerCreatureDropReload(r, ".reload creature_loot_template")
	writeCreatureDropReloadResult(w, reloadErr)
}

func atoiDefault(value string, fallback int) int {
	value = strings.TrimSpace(value)
	if value == "" {
		return fallback
	}
	n, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return n
}

func atofDefault(value string, fallback float64) float64 {
	value = strings.TrimSpace(value)
	if value == "" {
		return fallback
	}
	n, err := strconv.ParseFloat(value, 64)
	if err != nil {
		return fallback
	}
	return n
}
