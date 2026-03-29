package stats

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"karazhan/pkg/config"
	"net/http"
	"strconv"
	"strings"
)

type soloArenaStageRow struct {
	StageID          int     `json:"stage_id"`
	Name             string  `json:"name"`
	ArenaMapID       int     `json:"arena_map_id"`
	PreparationMS    int     `json:"preparation_ms"`
	HealthMultiplier float64 `json:"health_multiplier"`
	DamageMultiplier float64 `json:"damage_multiplier"`
	AttackTimeMS     int     `json:"attack_time_ms"`
	SpellIntervalMS  int     `json:"spell_interval_ms"`
	MoveSpeedRate    float64 `json:"move_speed_rate"`
	Enabled          int     `json:"enabled"`
	RewardCount      int     `json:"reward_count"`
}

type soloArenaStageRewardRow struct {
	ID        int     `json:"id"`
	StageID   int     `json:"stage_id"`
	ItemEntry int     `json:"item_entry"`
	ItemName  string  `json:"item_name"`
	ItemIcon  string  `json:"item_icon"`
	ItemCount int     `json:"item_count"`
	Chance    float64 `json:"chance"`
	SortOrder int     `json:"sort_order"`
	Enabled   int     `json:"enabled"`
	Comment   string  `json:"comment"`
}

type soloArenaProgressRow struct {
	GUID                int64  `json:"guid"`
	PlayerName          string `json:"player_name"`
	HighestStageCleared int    `json:"highest_stage_cleared"`
	UpdatedAt           string `json:"updated_at"`
}

type soloArenaRunLogRow struct {
	ID              int64  `json:"id"`
	RunUID          int64  `json:"run_uid"`
	GUID            int64  `json:"guid"`
	AccountID       int    `json:"account_id"`
	PlayerName      string `json:"player_name"`
	StageID         int    `json:"stage_id"`
	StageName       string `json:"stage_name"`
	Result          int    `json:"result"`
	ResultLabel     string `json:"result_label"`
	SessionState    int    `json:"session_state"`
	StartedAt       string `json:"started_at"`
	EndedAt         string `json:"ended_at"`
	CompletedAt     string `json:"completed_at"`
	FailedAt        string `json:"failed_at"`
	AbandonedAt     string `json:"abandoned_at"`
	DurationSec     int    `json:"duration_sec"`
	ArenaMapID      int    `json:"arena_map_id"`
	ArenaInstanceID int    `json:"arena_instance_id"`
	ReturnMapID     int    `json:"return_map_id"`
}

type soloArenaEventLogRow struct {
	ID              int64  `json:"id"`
	RunUID          int64  `json:"run_uid"`
	GUID            int64  `json:"guid"`
	AccountID       int    `json:"account_id"`
	PlayerName      string `json:"player_name"`
	StageID         int    `json:"stage_id"`
	EventType       string `json:"event_type"`
	EventAt         string `json:"event_at"`
	MapID           int    `json:"map_id"`
	ArenaInstanceID int    `json:"arena_instance_id"`
	Note            string `json:"note"`
}

type soloArenaRewardLogRow struct {
	ID          int64   `json:"id"`
	RunUID      int64   `json:"run_uid"`
	GUID        int64   `json:"guid"`
	AccountID   int     `json:"account_id"`
	PlayerName  string  `json:"player_name"`
	StageID     int     `json:"stage_id"`
	ItemEntry   int     `json:"item_entry"`
	ItemName    string  `json:"item_name"`
	ItemIcon    string  `json:"item_icon"`
	ItemCount   int     `json:"item_count"`
	Chance      float64 `json:"chance"`
	GrantStatus string  `json:"grant_status"`
	GrantedAt   string  `json:"granted_at"`
}

type soloArenaStageRewardSaveRequest struct {
	StageID int                       `json:"stage_id"`
	Rewards []soloArenaStageRewardRow `json:"rewards"`
}

func openSoloArenaWorldDB() (*sql.DB, error) {
	return sql.Open("mysql", config.WorldDSN())
}

func openSoloArenaCharactersDB() (*sql.DB, error) {
	return sql.Open("mysql", config.CharactersDSN())
}

func unixTimeExpr(col string) string {
	return fmt.Sprintf("CASE WHEN IFNULL(%s, 0) > 0 THEN DATE_FORMAT(FROM_UNIXTIME(%s), '%%Y-%%m-%%d %%H:%%i:%%s') ELSE '' END", col, col)
}

func soloArenaResultLabel(code int, label string) string {
	if strings.TrimSpace(label) != "" {
		return label
	}
	switch code {
	case 1:
		return "성공"
	case 2:
		return "실패"
	case 3:
		return "포기"
	default:
		return "기타"
	}
}

func isAutoIncrementColumnForDB(db *sql.DB, tableName, columnName string) bool {
	var count int
	err := db.QueryRow(`
		SELECT COUNT(*)
		FROM information_schema.columns
		WHERE table_schema = DATABASE()
		  AND table_name = ?
		  AND column_name = ?
		  AND extra LIKE '%auto_increment%'`,
		tableName, columnName,
	).Scan(&count)
	return err == nil && count > 0
}

func fillSoloArenaRewardItemMeta(items []soloArenaRewardLogRow) {
	if len(items) == 0 {
		return
	}
	db, err := openSoloArenaWorldDB()
	if err != nil {
		return
	}
	defer db.Close()

	seen := map[int]bool{}
	entries := make([]any, 0, len(items))
	placeholders := make([]string, 0, len(items))
	for _, item := range items {
		if item.ItemEntry <= 0 || seen[item.ItemEntry] {
			continue
		}
		seen[item.ItemEntry] = true
		entries = append(entries, item.ItemEntry)
		placeholders = append(placeholders, "?")
	}
	if len(entries) == 0 {
		return
	}

	query := `
		SELECT it.entry,
		       COALESCE(NULLIF(itl.name, ''), NULLIF(it.name, ''), CONCAT('아이템 ', it.entry)) AS item_name,
		       IFNULL(it.icon, '') AS item_icon
		FROM item_template it
		LEFT JOIN item_template_locale itl ON itl.ID = it.entry AND itl.locale = 'koKR'
		WHERE it.entry IN (` + strings.Join(placeholders, ",") + `)`
	rows, err := db.Query(query, entries...)
	if err != nil {
		return
	}
	defer rows.Close()

	type meta struct {
		Name string
		Icon string
	}
	metaMap := map[int]meta{}
	for rows.Next() {
		var entry int
		var name, icon string
		if err := rows.Scan(&entry, &name, &icon); err == nil {
			metaMap[entry] = meta{Name: name, Icon: icon}
		}
	}
	for i := range items {
		if m, ok := metaMap[items[i].ItemEntry]; ok {
			if strings.TrimSpace(items[i].ItemName) == "" || strings.HasPrefix(items[i].ItemName, "아이템 ") {
				items[i].ItemName = m.Name
			}
			items[i].ItemIcon = m.Icon
		}
	}
}

func handleTrialStageList(w http.ResponseWriter, r *http.Request) {
	if !CheckMenuPermission(w, r, "content") {
		return
	}
	db, err := openSoloArenaWorldDB()
	if err != nil {
		http.Error(w, "시련 단계 DB 연결에 실패했습니다.", http.StatusInternalServerError)
		return
	}
	defer db.Close()

	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if page < 1 {
		page = 1
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 {
		limit = 20
	}
	offset := (page - 1) * limit
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	active := strings.TrimSpace(r.URL.Query().Get("active"))

	conds := []string{"1=1"}
	args := make([]any, 0, 8)
	if q != "" {
		conds = append(conds, "(CAST(s.stage_id AS CHAR) LIKE ? OR s.name LIKE ?)")
		like := "%" + q + "%"
		args = append(args, like, like)
	}
	if active == "0" || active == "1" {
		conds = append(conds, "s.enabled = ?")
		args = append(args, active)
	}
	where := strings.Join(conds, " AND ")

	var total int
	if err := db.QueryRow("SELECT COUNT(*) FROM solo_arena_stage s WHERE "+where, args...).Scan(&total); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	queryArgs := append(append([]any{}, args...), limit, offset)
	rows, err := db.Query(`
		SELECT
			s.stage_id,
			IFNULL(s.name, CONCAT('시련 ', s.stage_id, '단계')) AS name,
			s.arena_map_id,
			IFNULL(s.preparation_ms, 0),
			IFNULL(s.health_multiplier, 1),
			IFNULL(s.damage_multiplier, 1),
			IFNULL(s.attack_time_ms, 0),
			IFNULL(s.spell_interval_ms, 0),
			IFNULL(s.move_speed_rate, 1),
			IFNULL(s.enabled, 0),
			COUNT(r.id) AS reward_count
		FROM solo_arena_stage s
		LEFT JOIN solo_arena_stage_reward r ON r.stage_id = s.stage_id AND IFNULL(r.enabled, 1) = 1
		WHERE `+where+`
		GROUP BY s.stage_id, s.name, s.arena_map_id, s.preparation_ms, s.health_multiplier, s.damage_multiplier, s.attack_time_ms, s.spell_interval_ms, s.move_speed_rate, s.enabled
		ORDER BY s.stage_id ASC
		LIMIT ? OFFSET ?`, queryArgs...)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	items := make([]soloArenaStageRow, 0)
	for rows.Next() {
		var row soloArenaStageRow
		if err := rows.Scan(&row.StageID, &row.Name, &row.ArenaMapID, &row.PreparationMS, &row.HealthMultiplier, &row.DamageMultiplier, &row.AttackTimeMS, &row.SpellIntervalMS, &row.MoveSpeedRate, &row.Enabled, &row.RewardCount); err == nil {
			items = append(items, row)
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"items":      items,
		"page":       page,
		"total":      total,
		"totalPages": (total + limit - 1) / limit,
	})
}

func handleTrialStageRewards(w http.ResponseWriter, r *http.Request) {
	if !CheckMenuPermission(w, r, "content") {
		return
	}
	stageID, _ := strconv.Atoi(r.URL.Query().Get("stage_id"))
	if stageID <= 0 {
		http.Error(w, "단계 번호가 올바르지 않습니다.", http.StatusBadRequest)
		return
	}

	db, err := openSoloArenaWorldDB()
	if err != nil {
		http.Error(w, "시련 보상 DB 연결에 실패했습니다.", http.StatusInternalServerError)
		return
	}
	defer db.Close()

	rows, err := db.Query(`
		SELECT
			r.id,
			r.stage_id,
			r.item_entry,
			COALESCE(NULLIF(itl.name, ''), NULLIF(it.name, ''), CONCAT('아이템 ', r.item_entry)) AS item_name,
			IFNULL(it.icon, '') AS item_icon,
			IFNULL(r.item_count, 0),
			IFNULL(r.chance, 0),
			IFNULL(r.sort_order, 0),
			IFNULL(r.enabled, 1),
			IFNULL(r.comment, '')
		FROM solo_arena_stage_reward r
		LEFT JOIN item_template it ON it.entry = r.item_entry
		LEFT JOIN item_template_locale itl ON itl.ID = r.item_entry AND itl.locale = 'koKR'
		WHERE r.stage_id = ?
		ORDER BY IFNULL(r.sort_order, 0) ASC, r.id ASC`, stageID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	items := make([]soloArenaStageRewardRow, 0)
	for rows.Next() {
		var row soloArenaStageRewardRow
		if err := rows.Scan(&row.ID, &row.StageID, &row.ItemEntry, &row.ItemName, &row.ItemIcon, &row.ItemCount, &row.Chance, &row.SortOrder, &row.Enabled, &row.Comment); err == nil {
			items = append(items, row)
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func handleTrialStageRewardSave(w http.ResponseWriter, r *http.Request) {
	if !CheckMenuPermission(w, r, "content") {
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "지원하지 않는 요청 방식입니다.", http.StatusMethodNotAllowed)
		return
	}
	var req soloArenaStageRewardSaveRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "요청 형식이 올바르지 않습니다.", http.StatusBadRequest)
		return
	}
	if req.StageID <= 0 {
		http.Error(w, "단계 번호는 필수입니다.", http.StatusBadRequest)
		return
	}
	for _, row := range req.Rewards {
		if row.ItemEntry <= 0 {
			http.Error(w, "보상 아이템은 모두 선택되어야 합니다.", http.StatusBadRequest)
			return
		}
		if row.ItemCount <= 0 {
			http.Error(w, "보상 수량은 1 이상이어야 합니다.", http.StatusBadRequest)
			return
		}
		if row.Chance < 0 || row.Chance > 100 {
			http.Error(w, "보상 확률은 0 이상 100 이하로 입력해주세요.", http.StatusBadRequest)
			return
		}
	}

	db, err := openSoloArenaWorldDB()
	if err != nil {
		http.Error(w, "시련 보상 DB 연결에 실패했습니다.", http.StatusInternalServerError)
		return
	}
	defer db.Close()

	tx, err := db.Begin()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	if _, err := tx.Exec("DELETE FROM solo_arena_stage_reward WHERE stage_id = ?", req.StageID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	autoID := isAutoIncrementColumnForDB(db, "solo_arena_stage_reward", "id")
	nextID := 0
	if !autoID && len(req.Rewards) > 0 {
		if err := tx.QueryRow("SELECT IFNULL(MAX(id), 0) + 1 FROM solo_arena_stage_reward").Scan(&nextID); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if nextID <= 0 {
			nextID = 1
		}
	}

	for idx, row := range req.Rewards {
		sortOrder := row.SortOrder
		if sortOrder <= 0 {
			sortOrder = idx + 1
		}
		if autoID {
			_, err = tx.Exec(`
				INSERT INTO solo_arena_stage_reward
					(stage_id, item_entry, item_count, chance, sort_order, enabled, comment)
				VALUES (?, ?, ?, ?, ?, ?, ?)`,
				req.StageID, row.ItemEntry, row.ItemCount, row.Chance, sortOrder, row.Enabled, strings.TrimSpace(row.Comment),
			)
		} else {
			_, err = tx.Exec(`
				INSERT INTO solo_arena_stage_reward
					(id, stage_id, item_entry, item_count, chance, sort_order, enabled, comment)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
				nextID, req.StageID, row.ItemEntry, row.ItemCount, row.Chance, sortOrder, row.Enabled, strings.TrimSpace(row.Comment),
			)
			nextID++
		}
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}

	if err := tx.Commit(); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"status": "success"})
}

func handleTrialProgressList(w http.ResponseWriter, r *http.Request) {
	if !CheckMenuPermission(w, r, "content") {
		return
	}
	db, err := openSoloArenaCharactersDB()
	if err != nil {
		http.Error(w, "시련 진행 DB 연결에 실패했습니다.", http.StatusInternalServerError)
		return
	}
	defer db.Close()

	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if page < 1 {
		page = 1
	}
	limit := 20
	offset := (page - 1) * limit
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	stageID := strings.TrimSpace(r.URL.Query().Get("stage_id"))

	conds := []string{"1=1"}
	args := make([]any, 0, 8)
	if q != "" {
		conds = append(conds, "(CAST(p.guid AS CHAR) LIKE ? OR COALESCE(NULLIF(c.name,''), '') LIKE ?)")
		like := "%" + q + "%"
		args = append(args, like, like)
	}
	if stageID != "" {
		conds = append(conds, "p.highest_stage_cleared = ?")
		args = append(args, stageID)
	}
	where := strings.Join(conds, " AND ")

	var total int
	if err := db.QueryRow(`
		SELECT COUNT(*)
		FROM solo_arena_progress p
		LEFT JOIN characters c ON c.guid = p.guid
		WHERE `+where, args...).Scan(&total); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	queryArgs := append(append([]any{}, args...), limit, offset)
	rows, err := db.Query(`
		SELECT
			p.guid,
			COALESCE(NULLIF(c.name, ''), CONCAT('GUID ', p.guid)) AS player_name,
			p.highest_stage_cleared,
			`+unixTimeExpr("p.updated_at")+` AS updated_at
		FROM solo_arena_progress p
		LEFT JOIN characters c ON c.guid = p.guid
		WHERE `+where+`
		ORDER BY p.updated_at DESC
		LIMIT ? OFFSET ?`, queryArgs...)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	items := make([]soloArenaProgressRow, 0)
	for rows.Next() {
		var row soloArenaProgressRow
		if err := rows.Scan(&row.GUID, &row.PlayerName, &row.HighestStageCleared, &row.UpdatedAt); err == nil {
			items = append(items, row)
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"items":      items,
		"page":       page,
		"total":      total,
		"totalPages": (total + limit - 1) / limit,
	})
}

func handleTrialRunLogList(w http.ResponseWriter, r *http.Request) {
	if !CheckMenuPermission(w, r, "content") {
		return
	}
	db, err := openSoloArenaCharactersDB()
	if err != nil {
		http.Error(w, "시련 런 로그 DB 연결에 실패했습니다.", http.StatusInternalServerError)
		return
	}
	defer db.Close()

	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if page < 1 {
		page = 1
	}
	limit := 20
	offset := (page - 1) * limit
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	stageID := strings.TrimSpace(r.URL.Query().Get("stage_id"))
	result := strings.TrimSpace(r.URL.Query().Get("result"))

	conds := []string{"1=1"}
	args := make([]any, 0, 10)
	if q != "" {
		conds = append(conds, "(CAST(rl.guid AS CHAR) LIKE ? OR CAST(rl.run_uid AS CHAR) LIKE ? OR COALESCE(NULLIF(rl.player_name,''), NULLIF(c.name,''), '') LIKE ?)")
		like := "%" + q + "%"
		args = append(args, like, like, like)
	}
	if stageID != "" {
		conds = append(conds, "rl.stage_id = ?")
		args = append(args, stageID)
	}
	if result != "" {
		conds = append(conds, "rl.result = ?")
		args = append(args, result)
	}
	where := strings.Join(conds, " AND ")

	var total int
	if err := db.QueryRow(`
		SELECT COUNT(*)
		FROM solo_arena_run_log rl
		LEFT JOIN characters c ON c.guid = rl.guid
		WHERE `+where, args...).Scan(&total); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	queryArgs := append(append([]any{}, args...), limit, offset)
	rows, err := db.Query(`
		SELECT
			rl.id, rl.run_uid, rl.guid, rl.account_id,
			COALESCE(NULLIF(rl.player_name, ''), NULLIF(c.name, ''), CONCAT('GUID ', rl.guid)) AS player_name,
			rl.stage_id,
			IFNULL(NULLIF(rl.stage_name, ''), CONCAT('시련 ', rl.stage_id, '단계')) AS stage_name,
			rl.result,
			IFNULL(rl.result_label, ''),
			IFNULL(rl.session_state, 0),
			`+unixTimeExpr("rl.started_at")+`,
			`+unixTimeExpr("rl.ended_at")+`,
			`+unixTimeExpr("rl.completed_at")+`,
			`+unixTimeExpr("rl.failed_at")+`,
			`+unixTimeExpr("rl.abandoned_at")+`,
			IFNULL(rl.duration_sec, 0),
			IFNULL(rl.arena_map_id, 0),
			IFNULL(rl.arena_instance_id, 0),
			IFNULL(rl.return_map_id, 0)
		FROM solo_arena_run_log rl
		LEFT JOIN characters c ON c.guid = rl.guid
		WHERE `+where+`
		ORDER BY rl.id DESC
		LIMIT ? OFFSET ?`, queryArgs...)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	items := make([]soloArenaRunLogRow, 0)
	for rows.Next() {
		var row soloArenaRunLogRow
		var rawLabel string
		if err := rows.Scan(&row.ID, &row.RunUID, &row.GUID, &row.AccountID, &row.PlayerName, &row.StageID, &row.StageName, &row.Result, &rawLabel, &row.SessionState, &row.StartedAt, &row.EndedAt, &row.CompletedAt, &row.FailedAt, &row.AbandonedAt, &row.DurationSec, &row.ArenaMapID, &row.ArenaInstanceID, &row.ReturnMapID); err == nil {
			row.ResultLabel = soloArenaResultLabel(row.Result, rawLabel)
			items = append(items, row)
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"items":      items,
		"page":       page,
		"total":      total,
		"totalPages": (total + limit - 1) / limit,
	})
}

func handleTrialEventLogList(w http.ResponseWriter, r *http.Request) {
	if !CheckMenuPermission(w, r, "content") {
		return
	}
	db, err := openSoloArenaCharactersDB()
	if err != nil {
		http.Error(w, "시련 이벤트 로그 DB 연결에 실패했습니다.", http.StatusInternalServerError)
		return
	}
	defer db.Close()

	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if page < 1 {
		page = 1
	}
	limit := 20
	offset := (page - 1) * limit
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	stageID := strings.TrimSpace(r.URL.Query().Get("stage_id"))
	eventType := strings.TrimSpace(r.URL.Query().Get("event_type"))

	conds := []string{"1=1"}
	args := make([]any, 0, 10)
	if q != "" {
		conds = append(conds, "(CAST(el.guid AS CHAR) LIKE ? OR CAST(el.run_uid AS CHAR) LIKE ? OR COALESCE(NULLIF(el.player_name,''), NULLIF(c.name,''), '') LIKE ? OR IFNULL(el.note,'') LIKE ?)")
		like := "%" + q + "%"
		args = append(args, like, like, like, like)
	}
	if stageID != "" {
		conds = append(conds, "el.stage_id = ?")
		args = append(args, stageID)
	}
	if eventType != "" {
		conds = append(conds, "el.event_type = ?")
		args = append(args, eventType)
	}
	where := strings.Join(conds, " AND ")

	var total int
	if err := db.QueryRow(`
		SELECT COUNT(*)
		FROM solo_arena_event_log el
		LEFT JOIN characters c ON c.guid = el.guid
		WHERE `+where, args...).Scan(&total); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	queryArgs := append(append([]any{}, args...), limit, offset)
	rows, err := db.Query(`
		SELECT
			el.id, el.run_uid, el.guid, el.account_id,
			COALESCE(NULLIF(el.player_name, ''), NULLIF(c.name, ''), CONCAT('GUID ', el.guid)) AS player_name,
			el.stage_id, IFNULL(el.event_type, ''), `+unixTimeExpr("el.event_at")+`,
			IFNULL(el.map_id, 0), IFNULL(el.arena_instance_id, 0), IFNULL(el.note, '')
		FROM solo_arena_event_log el
		LEFT JOIN characters c ON c.guid = el.guid
		WHERE `+where+`
		ORDER BY el.id DESC
		LIMIT ? OFFSET ?`, queryArgs...)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	items := make([]soloArenaEventLogRow, 0)
	for rows.Next() {
		var row soloArenaEventLogRow
		if err := rows.Scan(&row.ID, &row.RunUID, &row.GUID, &row.AccountID, &row.PlayerName, &row.StageID, &row.EventType, &row.EventAt, &row.MapID, &row.ArenaInstanceID, &row.Note); err == nil {
			items = append(items, row)
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"items":      items,
		"page":       page,
		"total":      total,
		"totalPages": (total + limit - 1) / limit,
	})
}

func handleTrialRewardLogList(w http.ResponseWriter, r *http.Request) {
	if !CheckMenuPermission(w, r, "content") {
		return
	}
	db, err := openSoloArenaCharactersDB()
	if err != nil {
		http.Error(w, "시련 보상 로그 DB 연결에 실패했습니다.", http.StatusInternalServerError)
		return
	}
	defer db.Close()

	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if page < 1 {
		page = 1
	}
	limit := 20
	offset := (page - 1) * limit
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	stageID := strings.TrimSpace(r.URL.Query().Get("stage_id"))

	conds := []string{"1=1"}
	args := make([]any, 0, 10)
	if q != "" {
		conds = append(conds, "(CAST(rl.guid AS CHAR) LIKE ? OR CAST(rl.run_uid AS CHAR) LIKE ? OR COALESCE(NULLIF(rl.player_name,''), NULLIF(c.name,''), '') LIKE ? OR CAST(rl.item_entry AS CHAR) LIKE ?)")
		like := "%" + q + "%"
		args = append(args, like, like, like, like)
	}
	if stageID != "" {
		conds = append(conds, "rl.stage_id = ?")
		args = append(args, stageID)
	}
	where := strings.Join(conds, " AND ")

	var total int
	if err := db.QueryRow(`
		SELECT COUNT(*)
		FROM solo_arena_reward_log rl
		LEFT JOIN characters c ON c.guid = rl.guid
		WHERE `+where, args...).Scan(&total); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	queryArgs := append(append([]any{}, args...), limit, offset)
	rows, err := db.Query(`
		SELECT
			rl.id, rl.run_uid, rl.guid, rl.account_id,
			COALESCE(NULLIF(rl.player_name, ''), NULLIF(c.name, ''), CONCAT('GUID ', rl.guid)) AS player_name,
			rl.stage_id, rl.item_entry,
			CONCAT('아이템 ', rl.item_entry) AS item_name,
			'' AS item_icon,
			IFNULL(rl.item_count, 0),
			IFNULL(rl.chance, 0),
			IFNULL(rl.grant_status, ''),
			`+unixTimeExpr("rl.granted_at")+`
		FROM solo_arena_reward_log rl
		LEFT JOIN characters c ON c.guid = rl.guid
		WHERE `+where+`
		ORDER BY rl.id DESC
		LIMIT ? OFFSET ?`, queryArgs...)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	items := make([]soloArenaRewardLogRow, 0)
	for rows.Next() {
		var row soloArenaRewardLogRow
		if err := rows.Scan(&row.ID, &row.RunUID, &row.GUID, &row.AccountID, &row.PlayerName, &row.StageID, &row.ItemEntry, &row.ItemName, &row.ItemIcon, &row.ItemCount, &row.Chance, &row.GrantStatus, &row.GrantedAt); err == nil {
			items = append(items, row)
		}
	}
	fillSoloArenaRewardItemMeta(items)
	writeJSON(w, http.StatusOK, map[string]any{
		"items":      items,
		"page":       page,
		"total":      total,
		"totalPages": (total + limit - 1) / limit,
	})
}
