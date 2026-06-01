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
)

const soloArenaFallbackItemPrefix = "\uc544\uc774\ud15c "

type soloArenaStageRow struct {
	StageID             int     `json:"stage_id"`
	Name                string  `json:"name"`
	ArenaMapID          int     `json:"arena_map_id"`
	PlayerX             float64 `json:"player_x"`
	PlayerY             float64 `json:"player_y"`
	PlayerZ             float64 `json:"player_z"`
	PlayerO             float64 `json:"player_o"`
	BotX                float64 `json:"bot_x"`
	BotY                float64 `json:"bot_y"`
	BotZ                float64 `json:"bot_z"`
	BotO                float64 `json:"bot_o"`
	PreparationMS       int     `json:"preparation_ms"`
	HealthMultiplier    float64 `json:"health_multiplier"`
	DamageMultiplier    float64 `json:"damage_multiplier"`
	AttackTimeMS        int     `json:"attack_time_ms"`
	SpellIntervalMS     int     `json:"spell_interval_ms"`
	MoveSpeedRate       float64 `json:"move_speed_rate"`
	MeleeTargetGS       int     `json:"melee_target_gs"`
	MeleeHealth         int     `json:"melee_health"`
	MeleeAttackPower    int     `json:"melee_attack_power"`
	MeleeCritPct        float64 `json:"melee_crit_pct"`
	MeleeArmorPenRating int     `json:"melee_armor_pen_rating"`
	CasterTargetGS      int     `json:"caster_target_gs"`
	CasterHealth        int     `json:"caster_health"`
	CasterMana          int     `json:"caster_mana"`
	CasterSpellPower    int     `json:"caster_spell_power"`
	CasterCritPct       float64 `json:"caster_crit_pct"`
	CasterHasteRating   int     `json:"caster_haste_rating"`
	RankSSeconds        int     `json:"rank_s_seconds"`
	RankASeconds        int     `json:"rank_a_seconds"`
	RankBSeconds        int     `json:"rank_b_seconds"`
	RankCSeconds        int     `json:"rank_c_seconds"`
	Enabled             int     `json:"enabled"`
	RewardCount         int     `json:"reward_count"`
}

type soloArenaStageRewardRow struct {
	ID              int     `json:"id"`
	StageID         int     `json:"stage_id"`
	ItemEntry       int     `json:"item_entry"`
	ItemName        string  `json:"item_name"`
	ItemIcon        string  `json:"item_icon"`
	ItemCount       int     `json:"item_count"`
	Chance          float64 `json:"chance"`
	RewardGold      int     `json:"reward_gold"`
	RewardRankValue int     `json:"reward_rank_value"`
	RewardRankLabel string  `json:"reward_rank_label"`
	SortOrder       int     `json:"sort_order"`
	Enabled         int     `json:"enabled"`
	Comment         string  `json:"comment"`
}

type soloArenaProgressRow struct {
	GUID                int64  `json:"guid"`
	PlayerName          string `json:"player_name"`
	AccountID           int    `json:"account_id"`
	AccountName         string `json:"account_name"`
	Race                int    `json:"race"`
	RaceName            string `json:"race_name"`
	Class               int    `json:"class"`
	ClassName           string `json:"class_name"`
	Level               int    `json:"level"`
	HighestStageCleared int    `json:"highest_stage_cleared"`
	UpdatedAt           string `json:"updated_at"`
}

type soloArenaStageRecordRow struct {
	GUID          int64  `json:"guid"`
	StageID       int    `json:"stage_id"`
	StageName     string `json:"stage_name"`
	BestRank      int    `json:"best_rank"`
	BestRankLabel string `json:"best_rank_label"`
	BestTimeSec   int    `json:"best_time_sec"`
	UpdatedAt     string `json:"updated_at"`
}

type soloArenaCharacterDetail struct {
	Character    soloArenaProgressRow      `json:"character"`
	StageRecords []soloArenaStageRecordRow `json:"stage_records"`
}

type soloArenaProgressSaveRequest struct {
	GUID                 int64  `json:"guid"`
	HighestStageCleared  int    `json:"highest_stage_cleared"`
	SyncRecords          bool   `json:"sync_records"`
	AdjustmentNote       string `json:"adjustment_note"`
	TargetStageIDForSync int    `json:"target_stage_id_for_sync"`
}

type soloArenaStageRecordSaveRequest struct {
	GUID          int64  `json:"guid"`
	StageID       int    `json:"stage_id"`
	BestRank      int    `json:"best_rank"`
	BestRankLabel string `json:"best_rank_label"`
	BestTimeSec   int    `json:"best_time_sec"`
}

type soloArenaStageRecordDeleteRequest struct {
	GUID               int64 `json:"guid"`
	StageID            int   `json:"stage_id"`
	AdjustHighestStage bool  `json:"adjust_highest_stage"`
}

type soloArenaForceClearRequest struct {
	GUID          int64  `json:"guid"`
	StageID       int    `json:"stage_id"`
	BestRank      int    `json:"best_rank"`
	BestRankLabel string `json:"best_rank_label"`
	BestTimeSec   int    `json:"best_time_sec"`
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

type soloArenaStageSaveRequest struct {
	StageID             int     `json:"stage_id"`
	Name                string  `json:"name"`
	ArenaMapID          int     `json:"arena_map_id"`
	PlayerX             float64 `json:"player_x"`
	PlayerY             float64 `json:"player_y"`
	PlayerZ             float64 `json:"player_z"`
	PlayerO             float64 `json:"player_o"`
	BotX                float64 `json:"bot_x"`
	BotY                float64 `json:"bot_y"`
	BotZ                float64 `json:"bot_z"`
	BotO                float64 `json:"bot_o"`
	HealthMultiplier    float64 `json:"health_multiplier"`
	DamageMultiplier    float64 `json:"damage_multiplier"`
	AttackTimeMS        int     `json:"attack_time_ms"`
	SpellIntervalMS     int     `json:"spell_interval_ms"`
	MoveSpeedRate       float64 `json:"move_speed_rate"`
	PreparationMS       int     `json:"preparation_ms"`
	MeleeTargetGS       int     `json:"melee_target_gs"`
	MeleeHealth         int     `json:"melee_health"`
	MeleeAttackPower    int     `json:"melee_attack_power"`
	MeleeCritPct        float64 `json:"melee_crit_pct"`
	MeleeArmorPenRating int     `json:"melee_armor_pen_rating"`
	CasterTargetGS      int     `json:"caster_target_gs"`
	CasterHealth        int     `json:"caster_health"`
	CasterMana          int     `json:"caster_mana"`
	CasterSpellPower    int     `json:"caster_spell_power"`
	CasterCritPct       float64 `json:"caster_crit_pct"`
	CasterHasteRating   int     `json:"caster_haste_rating"`
	RankSSeconds        int     `json:"rank_s_seconds"`
	RankASeconds        int     `json:"rank_a_seconds"`
	RankBSeconds        int     `json:"rank_b_seconds"`
	RankCSeconds        int     `json:"rank_c_seconds"`
	Enabled             int     `json:"enabled"`
}

func openSoloArenaWorldDB() (*sql.DB, error) {
	return sql.Open("mysql", config.WorldDSN())
}

func openSoloArenaCharactersDB() (*sql.DB, error) {
	return sql.Open("mysql", config.CharactersDSN())
}

func loadSoloArenaStageNameMap() map[int]string {
	db, err := openSoloArenaWorldDB()
	if err != nil {
		return map[int]string{}
	}
	defer db.Close()

	rows, err := db.Query(`
		SELECT
			stage_id,
			COALESCE(NULLIF(name, ''), CONCAT(CONVERT(0xEC8B9CEBA0A8 USING utf8mb4), stage_id, CONVERT(0xEB8BA8EAB384 USING utf8mb4))) AS stage_name
		FROM solo_arena_stage
	`)
	if err != nil {
		return map[int]string{}
	}
	defer rows.Close()

	result := make(map[int]string)
	for rows.Next() {
		var stageID int
		var stageName string
		if err := rows.Scan(&stageID, &stageName); err == nil {
			result[stageID] = strings.TrimSpace(stageName)
		}
	}
	return result
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
		return "\uc131\uacf5"
	case 2:
		return "\uc2e4\ud328"
	case 3:
		return "\ucde8\uc18c"
	default:
		return "\uc54c \uc218 \uc5c6\uc74c"
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

func hasColumnForDB(db *sql.DB, tableName, columnName string) bool {
	var count int
	err := db.QueryRow(`
		SELECT COUNT(*)
		FROM information_schema.columns
		WHERE table_schema = DATABASE()
		  AND table_name = ?
		  AND column_name = ?`,
		tableName, columnName,
	).Scan(&count)
	return err == nil && count > 0
}

func ensureSoloArenaStageRewardRankColumns(db *sql.DB) error {
	if !hasColumnForDB(db, "solo_arena_stage_reward", "reward_rank_value") {
		if _, err := db.Exec("ALTER TABLE solo_arena_stage_reward ADD COLUMN reward_rank_value TINYINT UNSIGNED NOT NULL DEFAULT 3 AFTER chance"); err != nil {
			return err
		}
	}
	if !hasColumnForDB(db, "solo_arena_stage_reward", "reward_rank_label") {
		if _, err := db.Exec("ALTER TABLE solo_arena_stage_reward ADD COLUMN reward_rank_label VARCHAR(8) NOT NULL DEFAULT 'B' AFTER reward_rank_value"); err != nil {
			return err
		}
	}
	if _, err := db.Exec("UPDATE solo_arena_stage_reward SET reward_rank_value = 3 WHERE reward_rank_value = 0"); err != nil {
		return err
	}
	if _, err := db.Exec("UPDATE solo_arena_stage_reward SET reward_rank_label = 'B' WHERE reward_rank_label = ''"); err != nil {
		return err
	}
	if !hasColumnForDB(db, "solo_arena_stage_reward", "reward_gold") {
		if _, err := db.Exec("ALTER TABLE solo_arena_stage_reward ADD COLUMN reward_gold INT UNSIGNED NOT NULL DEFAULT 0 AFTER chance"); err != nil {
			return err
		}
	}
	return nil
}

func ensureSoloArenaStageColumns(db *sql.DB) error {
	defs := map[string]string{
		"player_x":               "DOUBLE NOT NULL DEFAULT 0",
		"player_y":               "DOUBLE NOT NULL DEFAULT 0",
		"player_z":               "DOUBLE NOT NULL DEFAULT 0",
		"player_o":               "FLOAT NOT NULL DEFAULT 0",
		"bot_x":                  "DOUBLE NOT NULL DEFAULT 0",
		"bot_y":                  "DOUBLE NOT NULL DEFAULT 0",
		"bot_z":                  "DOUBLE NOT NULL DEFAULT 0",
		"bot_o":                  "FLOAT NOT NULL DEFAULT 0",
		"health_multiplier":      "FLOAT NOT NULL DEFAULT 1",
		"damage_multiplier":      "FLOAT NOT NULL DEFAULT 1",
		"attack_time_ms":         "INT UNSIGNED NOT NULL DEFAULT 2000",
		"spell_interval_ms":      "INT UNSIGNED NOT NULL DEFAULT 4000",
		"move_speed_rate":        "FLOAT NOT NULL DEFAULT 1",
		"preparation_ms":         "INT UNSIGNED NOT NULL DEFAULT 6000",
		"melee_target_gs":        "INT UNSIGNED NOT NULL DEFAULT 0",
		"melee_health":           "INT UNSIGNED NOT NULL DEFAULT 1",
		"melee_attack_power":     "INT NOT NULL DEFAULT 0",
		"melee_crit_pct":         "FLOAT NOT NULL DEFAULT 0",
		"melee_armor_pen_rating": "INT UNSIGNED NOT NULL DEFAULT 0",
		"caster_target_gs":       "INT UNSIGNED NOT NULL DEFAULT 0",
		"caster_health":          "INT UNSIGNED NOT NULL DEFAULT 1",
		"caster_mana":            "INT UNSIGNED NOT NULL DEFAULT 0",
		"caster_spell_power":     "INT NOT NULL DEFAULT 0",
		"caster_crit_pct":        "FLOAT NOT NULL DEFAULT 0",
		"caster_haste_rating":    "INT UNSIGNED NOT NULL DEFAULT 0",
		"rank_s_seconds":         "INT UNSIGNED NOT NULL DEFAULT 45",
		"rank_a_seconds":         "INT UNSIGNED NOT NULL DEFAULT 75",
		"rank_b_seconds":         "INT UNSIGNED NOT NULL DEFAULT 105",
		"rank_c_seconds":         "INT UNSIGNED NOT NULL DEFAULT 135",
		"enabled":                "TINYINT UNSIGNED NOT NULL DEFAULT 1",
	}
	for column, ddl := range defs {
		if hasColumnForDB(db, "solo_arena_stage", column) {
			continue
		}
		if _, err := db.Exec(fmt.Sprintf("ALTER TABLE solo_arena_stage ADD COLUMN %s %s", column, ddl)); err != nil {
			return err
		}
	}
	return nil
}

func validateSoloArenaStage(req *soloArenaStageSaveRequest) string {
	if req.StageID <= 0 {
		return "??壤굿?????癲ル슢???ъ쒜筌믡굥夷???쎛 ????嶺?? ??????????딅젩."
	}
	if strings.TrimSpace(req.Name) == "" {
		return "??壤굿?????????? ????썹땟??????뉖뤁??"
	}
	if req.MeleeHealth < 1 || req.CasterHealth < 1 {
		return "?熬곣뫖????? ???????꿔꺂?????? 1 ?????壤????ㅿ폎?????嶺뚮ㅎ????"
	}
	if req.MeleeAttackPower < 0 || req.CasterSpellPower < 0 {
		return "??????轝꿸섣??????녿뮝?筌믡굥利??? 0 ?????壤????ㅿ폎?????嶺뚮ㅎ????"
	}
	if req.CasterMana < 0 {
		return "???????꿔꺂???熬곻퐢夷??0 ?????壤????ㅿ폎?????嶺뚮ㅎ????"
	}
	if req.RankSSeconds <= 0 || req.RankASeconds <= 0 || req.RankBSeconds <= 0 || req.RankCSeconds <= 0 {
		return "??????????? ?꿔꺂??袁ㅻ븶?癲?1???????壤????ㅿ폎?????嶺뚮ㅎ????"
	}
	if !(req.RankSSeconds <= req.RankASeconds && req.RankASeconds <= req.RankBSeconds && req.RankBSeconds <= req.RankCSeconds) {
		return "??????????? S <= A <= B <= C ??嶺?筌?????繹먮냱?????ㅿ폑????嶺뚮ㅎ????"
	}
	if req.MeleeArmorPenRating < 0 || req.CasterHasteRating < 0 {
		return "?熬곣뫖?삥납? ????볥옖??? ??醫딆쓧???????볥옖???0 ?????壤????ㅿ폎?????嶺뚮ㅎ????"
	}
	if req.MeleeCritPct < 0 || req.MeleeCritPct > 100 || req.CasterCritPct < 0 || req.CasterCritPct > 100 {
		return "??⑤㈇???レ뵛??? ?癲ル슢????? 0?????100 ?????????嶺뚮ㅎ????"
	}
	if req.AttackTimeMS > 0 && req.AttackTimeMS < 500 {
		return "???뚯?????????????戮?덫??500ms ?????壤????Β?????繹먮냱?????κ땁??癲ル슢????"
	}
	if req.SpellIntervalMS > 0 && req.SpellIntervalMS < 500 {
		return "???녿뮝?筌믡굥利???醫딆┣??醫딅??? 500ms ?????壤????Β?????繹먮냱?????κ땁??癲ル슢????"
	}
	if req.MoveSpeedRate > 0 && req.MoveSpeedRate < 0.1 {
		return "????????戮?덫??0.1 ?????壤????Β?????繹먮냱?????κ땁??癲ル슢????"
	}
	return ""
}

func soloArenaRewardRankLabel(value int, label string) string {
	switch strings.ToUpper(strings.TrimSpace(label)) {
	case "S", "A", "B", "C", "D":
		return strings.ToUpper(strings.TrimSpace(label))
	}
	switch value {
	case 5:
		return "S"
	case 4:
		return "A"
	case 3:
		return "B"
	case 2:
		return "C"
	case 1:
		return "D"
	default:
		return "B"
	}
}

func soloArenaRewardRankValue(value int, label string) int {
	if value >= 1 && value <= 5 {
		return value
	}
	switch strings.ToUpper(strings.TrimSpace(label)) {
	case "S":
		return 5
	case "A":
		return 4
	case "B":
		return 3
	case "C":
		return 2
	case "D":
		return 1
	default:
		return 3
	}
}

func soloArenaRankPreset(value int, label string) (int, string) {
	switch strings.ToUpper(strings.TrimSpace(label)) {
	case "S":
		return 6, "S"
	case "A":
		return 5, "A"
	case "B":
		return 4, "B"
	case "C":
		return 3, "C"
	case "D":
		return 2, "D"
	case "F":
		return 1, "F"
	}
	switch value {
	case 6:
		return 6, "S"
	case 5:
		return 5, "A"
	case 4:
		return 4, "B"
	case 3:
		return 3, "C"
	case 2:
		return 2, "D"
	case 1:
		return 1, "F"
	default:
		return 4, "B"
	}
}

func soloArenaRaceName(race int) string {
	switch race {
	case 1:
		return "\uc778\uac04"
	case 2:
		return "\uc624\ud06c"
	case 3:
		return "\ub4dc\uc6cc\ud504"
	case 4:
		return "\ub098\uc774\ud2b8 \uc5d8\ud504"
	case 5:
		return "\uc5b8\ub370\ub4dc"
	case 6:
		return "\ud0c0\uc6b0\ub80c"
	case 7:
		return "\ub178\uc6c0"
	case 8:
		return "\ud2b8\ub864"
	case 10:
		return "\ube14\ub7ec\ub4dc \uc5d8\ud504"
	case 11:
		return "\ub4dc\ub808\ub098\uc774"
	default:
		return "\uc54c \uc218 \uc5c6\uc74c"
	}
}

func soloArenaClassName(classID int) string {
	switch classID {
	case 1:
		return "\uc804\uc0ac"
	case 2:
		return "\uc131\uae30\uc0ac"
	case 3:
		return "\uc0ac\ub0e5\uafbc"
	case 4:
		return "\ub3c4\uc801"
	case 5:
		return "\uc0ac\uc81c"
	case 6:
		return "\uc8fd\uc74c\uc758 \uae30\uc0ac"
	case 7:
		return "\uc8fc\uc220\uc0ac"
	case 8:
		return "\ub9c8\ubc95\uc0ac"
	case 9:
		return "\ud751\ub9c8\ubc95\uc0ac"
	case 11:
		return "\ub4dc\ub8e8\uc774\ub4dc"
	default:
		return "\uc54c \uc218 \uc5c6\uc74c"
	}
}

func soloArenaNowUnix() uint64 {
	return uint64(time.Now().Unix())
}

func fetchSoloArenaAccountNames(accountIDs []int) map[int]string {
	result := map[int]string{}
	if len(accountIDs) == 0 {
		return result
	}
	authDB, err := sql.Open("mysql", config.AuthDSN())
	if err != nil {
		return result
	}
	defer authDB.Close()

	seen := map[int]bool{}
	args := make([]any, 0, len(accountIDs))
	holders := make([]string, 0, len(accountIDs))
	for _, id := range accountIDs {
		if id <= 0 || seen[id] {
			continue
		}
		seen[id] = true
		args = append(args, id)
		holders = append(holders, "?")
	}
	if len(args) == 0 {
		return result
	}

	rows, err := authDB.Query(`SELECT id, username FROM account WHERE id IN (`+strings.Join(holders, ",")+`)`, args...)
	if err != nil {
		return result
	}
	defer rows.Close()

	for rows.Next() {
		var id int
		var username string
		if err := rows.Scan(&id, &username); err == nil {
			result[id] = strings.TrimSpace(username)
		}
	}
	return result
}

func getSoloArenaHighestRecordedStage(tx *sql.Tx, guid int64) int {
	var highest int
	_ = tx.QueryRow(`SELECT IFNULL(MAX(stage_id), 0) FROM solo_arena_stage_record WHERE guid = ?`, guid).Scan(&highest)
	return highest
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

	query := fmt.Sprintf(`
		SELECT it.entry,
		       COALESCE(NULLIF(itl.Name, ''), NULLIF(it.name, ''), CONCAT('%s', it.entry)) AS item_name
		FROM item_template it
		LEFT JOIN item_template_locale itl ON itl.ID = it.entry AND itl.locale = 'koKR'
		WHERE it.entry IN (%s)`,
		soloArenaFallbackItemPrefix,
		strings.Join(placeholders, ","),
	)
	rows, err := db.Query(query, entries...)
	if err != nil {
		return
	}
	defer rows.Close()

	type meta struct {
		Name string
	}
	metaMap := map[int]meta{}
	for rows.Next() {
		var entry int
		var name string
		if err := rows.Scan(&entry, &name); err == nil {
			metaMap[entry] = meta{Name: name}
		}
	}
	for i := range items {
		if m, ok := metaMap[items[i].ItemEntry]; ok {
			if strings.TrimSpace(items[i].ItemName) == "" || strings.HasPrefix(items[i].ItemName, soloArenaFallbackItemPrefix) {
				items[i].ItemName = m.Name
			}
		}
	}
}

func handleTrialStageList(w http.ResponseWriter, r *http.Request) {
	if !CheckMenuPermission(w, r, "content") {
		return
	}
	db, err := openSoloArenaWorldDB()
	if err != nil {
		http.Error(w, "???꿔꺂??틝???????傭?끆???????DB ?????怨뺤르?????????⑤슣?????????????놁졄.", http.StatusInternalServerError)
		return
	}
	defer db.Close()
	if err := ensureSoloArenaStageColumns(db); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

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
			IFNULL(s.name, CONCAT(CONVERT(0xEC8B9CEBA0A8 USING utf8mb4), s.stage_id, CONVERT(0xEB8BA8EAB384 USING utf8mb4))) AS name,
			s.arena_map_id,
			IFNULL(s.player_x, 0),
			IFNULL(s.player_y, 0),
			IFNULL(s.player_z, 0),
			IFNULL(s.player_o, 0),
			IFNULL(s.bot_x, 0),
			IFNULL(s.bot_y, 0),
			IFNULL(s.bot_z, 0),
			IFNULL(s.bot_o, 0),
			IFNULL(s.preparation_ms, 0),
			IFNULL(s.health_multiplier, 1),
			IFNULL(s.damage_multiplier, 1),
			IFNULL(s.attack_time_ms, 0),
			IFNULL(s.spell_interval_ms, 0),
			IFNULL(s.move_speed_rate, 1),
			IFNULL(s.melee_target_gs, 0),
			IFNULL(s.melee_health, 0),
			IFNULL(s.melee_attack_power, 0),
			IFNULL(s.melee_crit_pct, 0),
			IFNULL(s.melee_armor_pen_rating, 0),
			IFNULL(s.caster_target_gs, 0),
			IFNULL(s.caster_health, 0),
			IFNULL(s.caster_mana, 0),
			IFNULL(s.caster_spell_power, 0),
			IFNULL(s.caster_crit_pct, 0),
			IFNULL(s.caster_haste_rating, 0),
			IFNULL(s.rank_s_seconds, 45),
			IFNULL(s.rank_a_seconds, 75),
			IFNULL(s.rank_b_seconds, 105),
			IFNULL(s.rank_c_seconds, 135),
			IFNULL(s.enabled, 0),
			COUNT(r.id) AS reward_count
		FROM solo_arena_stage s
		LEFT JOIN solo_arena_stage_reward r ON r.stage_id = s.stage_id AND IFNULL(r.enabled, 1) = 1
		WHERE `+where+`
		GROUP BY s.stage_id, s.name, s.arena_map_id, s.player_x, s.player_y, s.player_z, s.player_o, s.bot_x, s.bot_y, s.bot_z, s.bot_o, s.preparation_ms, s.health_multiplier, s.damage_multiplier, s.attack_time_ms, s.spell_interval_ms, s.move_speed_rate, s.melee_target_gs, s.melee_health, s.melee_attack_power, s.melee_crit_pct, s.melee_armor_pen_rating, s.caster_target_gs, s.caster_health, s.caster_mana, s.caster_spell_power, s.caster_crit_pct, s.caster_haste_rating, s.rank_s_seconds, s.rank_a_seconds, s.rank_b_seconds, s.rank_c_seconds, s.enabled
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
		if err := rows.Scan(
			&row.StageID,
			&row.Name,
			&row.ArenaMapID,
			&row.PlayerX,
			&row.PlayerY,
			&row.PlayerZ,
			&row.PlayerO,
			&row.BotX,
			&row.BotY,
			&row.BotZ,
			&row.BotO,
			&row.PreparationMS,
			&row.HealthMultiplier,
			&row.DamageMultiplier,
			&row.AttackTimeMS,
			&row.SpellIntervalMS,
			&row.MoveSpeedRate,
			&row.MeleeTargetGS,
			&row.MeleeHealth,
			&row.MeleeAttackPower,
			&row.MeleeCritPct,
			&row.MeleeArmorPenRating,
			&row.CasterTargetGS,
			&row.CasterHealth,
			&row.CasterMana,
			&row.CasterSpellPower,
			&row.CasterCritPct,
			&row.CasterHasteRating,
			&row.RankSSeconds,
			&row.RankASeconds,
			&row.RankBSeconds,
			&row.RankCSeconds,
			&row.Enabled,
			&row.RewardCount,
		); err == nil {
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

func handleTrialStageDetail(w http.ResponseWriter, r *http.Request) {
	if !CheckMenuPermission(w, r, "content") {
		return
	}
	stageID, _ := strconv.Atoi(strings.TrimSpace(r.URL.Query().Get("stage_id")))
	if stageID <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "??傭?끆????????癲?????????? ??????? ????????????놁졄."})
		return
	}
	db, err := openSoloArenaWorldDB()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "???꿔꺂??틝???????傭?끆?????????轅붽틓????????????⑥ル럯????? ?饔낅떽???壤??얜?裕?傭??????"})
		return
	}
	defer db.Close()
	if err := ensureSoloArenaStageColumns(db); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": err.Error()})
		return
	}

	var row soloArenaStageRow
	err = db.QueryRow(`
		SELECT
			stage_id,
			IFNULL(name, CONCAT(CONVERT(0xEC8B9CEBA0A8 USING utf8mb4), stage_id, CONVERT(0xEB8BA8EAB384 USING utf8mb4))) AS name,
			IFNULL(arena_map_id, 0),
			IFNULL(player_x, 0),
			IFNULL(player_y, 0),
			IFNULL(player_z, 0),
			IFNULL(player_o, 0),
			IFNULL(bot_x, 0),
			IFNULL(bot_y, 0),
			IFNULL(bot_z, 0),
			IFNULL(bot_o, 0),
			IFNULL(preparation_ms, 0),
			IFNULL(health_multiplier, 1),
			IFNULL(damage_multiplier, 1),
			IFNULL(attack_time_ms, 0),
			IFNULL(spell_interval_ms, 0),
			IFNULL(move_speed_rate, 1),
			IFNULL(melee_target_gs, 0),
			IFNULL(melee_health, 0),
			IFNULL(melee_attack_power, 0),
			IFNULL(melee_crit_pct, 0),
			IFNULL(melee_armor_pen_rating, 0),
			IFNULL(caster_target_gs, 0),
			IFNULL(caster_health, 0),
			IFNULL(caster_mana, 0),
			IFNULL(caster_spell_power, 0),
			IFNULL(caster_crit_pct, 0),
			IFNULL(caster_haste_rating, 0),
			IFNULL(rank_s_seconds, 45),
			IFNULL(rank_a_seconds, 75),
			IFNULL(rank_b_seconds, 105),
			IFNULL(rank_c_seconds, 135),
			IFNULL(enabled, 0)
		FROM solo_arena_stage
		WHERE stage_id = ?`, stageID).Scan(
		&row.StageID, &row.Name, &row.ArenaMapID,
		&row.PlayerX, &row.PlayerY, &row.PlayerZ, &row.PlayerO,
		&row.BotX, &row.BotY, &row.BotZ, &row.BotO,
		&row.PreparationMS, &row.HealthMultiplier, &row.DamageMultiplier,
		&row.AttackTimeMS, &row.SpellIntervalMS, &row.MoveSpeedRate,
		&row.MeleeTargetGS, &row.MeleeHealth, &row.MeleeAttackPower, &row.MeleeCritPct, &row.MeleeArmorPenRating,
		&row.CasterTargetGS, &row.CasterHealth, &row.CasterMana, &row.CasterSpellPower, &row.CasterCritPct, &row.CasterHasteRating,
		&row.RankSSeconds, &row.RankASeconds, &row.RankBSeconds, &row.RankCSeconds,
		&row.Enabled,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			writeJSON(w, http.StatusNotFound, map[string]string{"status": "error", "message": "??傭?끆???????汝뷴젆?????饔낅떽???????????????깅즽????????놁졄."})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, row)
}

func handleTrialStageSave(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"status": "error", "message": "???????????嫄????????戮?Ĳ??"})
		return
	}
	if !CheckMenuPermission(w, r, "content") {
		return
	}
	var req soloArenaStageSaveRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "??????ㅼ굣塋?????ル늉??????????? ????????????놁졄."})
		return
	}
	if msg := validateSoloArenaStage(&req); msg != "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": msg})
		return
	}

	db, err := openSoloArenaWorldDB()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "???꿔꺂??틝???????傭?끆?????????轅붽틓????????????關??濡녹춻???? ?饔낅떽???壤??얜?裕?傭??????"})
		return
	}
	defer db.Close()
	if err := ensureSoloArenaStageColumns(db); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": err.Error()})
		return
	}

	_, err = db.Exec(`
		UPDATE solo_arena_stage
		SET
			name = ?,
			arena_map_id = ?,
			player_x = ?, player_y = ?, player_z = ?, player_o = ?,
			bot_x = ?, bot_y = ?, bot_z = ?, bot_o = ?,
			health_multiplier = ?,
			damage_multiplier = ?,
			attack_time_ms = ?,
			spell_interval_ms = ?,
			move_speed_rate = ?,
			preparation_ms = ?,
			melee_target_gs = ?,
			melee_health = ?,
			melee_attack_power = ?,
			melee_crit_pct = ?,
			melee_armor_pen_rating = ?,
			caster_target_gs = ?,
			caster_health = ?,
			caster_mana = ?,
			caster_spell_power = ?,
			caster_crit_pct = ?,
			caster_haste_rating = ?,
			rank_s_seconds = ?,
			rank_a_seconds = ?,
			rank_b_seconds = ?,
			rank_c_seconds = ?,
			enabled = ?
		WHERE stage_id = ?`,
		strings.TrimSpace(req.Name), req.ArenaMapID,
		req.PlayerX, req.PlayerY, req.PlayerZ, req.PlayerO,
		req.BotX, req.BotY, req.BotZ, req.BotO,
		req.HealthMultiplier, req.DamageMultiplier,
		req.AttackTimeMS, req.SpellIntervalMS, req.MoveSpeedRate, req.PreparationMS,
		req.MeleeTargetGS, req.MeleeHealth, req.MeleeAttackPower, req.MeleeCritPct, req.MeleeArmorPenRating,
		req.CasterTargetGS, req.CasterHealth, req.CasterMana, req.CasterSpellPower, req.CasterCritPct, req.CasterHasteRating,
		req.RankSSeconds, req.RankASeconds, req.RankBSeconds, req.RankCSeconds,
		req.Enabled, req.StageID,
	)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": err.Error()})
		return
	}

	reloadErr := triggerSoloArenaReload(r)
	message := "???꿔꺂??틝???????傭?끆????????????影?ろ???? ????關??濡㏓븶??듬㎦??????"
	if reloadErr == nil {
		message = "???꿔꺂??틝???????傭?끆????????????影?ろ???? ????關??濡녹춻????????嫄?????꿔꺂??틝???彛???????饔낅떽???嶺뚮슢梨뜹ㅇ?????????諛몃마嶺뚮칾?고뒌????????????놁졄."
	} else {
		message = fmt.Sprintf("???꿔꺂??틝???????傭?끆????????????影?ろ???? ????關??濡㏓븶??듬㎦?????? ??????ㅿ폍??????嫄?????꿔꺂??틝???彛???????饔낅떽???嶺뚮슢梨뜹ㅇ????????諛몃마嶺뚮칾?고뒌????????⑤슣?????????????놁졄: %s", reloadErr.Error())
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "success", "message": message})
}

func handleTrialStageRewards(w http.ResponseWriter, r *http.Request) {
	if !CheckMenuPermission(w, r, "content") {
		return
	}
	stageID, _ := strconv.Atoi(r.URL.Query().Get("stage_id"))
	if stageID <= 0 {
		http.Error(w, "???????????????????????? ??????? ?????????????곸죩.", http.StatusBadRequest)
		return
	}

	db, err := openSoloArenaWorldDB()
	if err != nil {
		http.Error(w, "???轅붽틓?????????????곕츥???逆곷틳源??DB ??????⑤벡瑜??????????ㅼ뒩??????????????곸죩.", http.StatusInternalServerError)
		return
	}
	defer db.Close()
	if err := ensureSoloArenaStageRewardRankColumns(db); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	rows, err := db.Query(fmt.Sprintf(`
		SELECT
			r.id,
			r.stage_id,
			r.item_entry,
			COALESCE(NULLIF(itl.Name, ''), NULLIF(it.name, ''), CONCAT('%s', r.item_entry)) AS item_name,
			'' AS item_icon,
			IFNULL(r.item_count, 0),
			IFNULL(r.chance, 0),
			IFNULL(r.reward_gold, 0),
			IFNULL(r.reward_rank_value, 3),
			IFNULL(r.reward_rank_label, 'B'),
			IFNULL(r.sort_order, 0),
			IFNULL(r.enabled, 1),
			IFNULL(r.comment, '')
		FROM solo_arena_stage_reward r
		LEFT JOIN item_template it ON it.entry = r.item_entry
		LEFT JOIN item_template_locale itl ON itl.ID = r.item_entry AND itl.locale = 'koKR'
		WHERE r.stage_id = ?
		ORDER BY IFNULL(r.sort_order, 0) ASC, r.id ASC`, soloArenaFallbackItemPrefix), stageID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	items := make([]soloArenaStageRewardRow, 0)
	for rows.Next() {
		var row soloArenaStageRewardRow
		if err := rows.Scan(&row.ID, &row.StageID, &row.ItemEntry, &row.ItemName, &row.ItemIcon, &row.ItemCount, &row.Chance, &row.RewardGold, &row.RewardRankValue, &row.RewardRankLabel, &row.SortOrder, &row.Enabled, &row.Comment); err == nil {
			row.RewardRankValue = soloArenaRewardRankValue(row.RewardRankValue, row.RewardRankLabel)
			row.RewardRankLabel = soloArenaRewardRankLabel(row.RewardRankValue, row.RewardRankLabel)
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
		http.Error(w, "\ud5c8\uc6a9\ub418\uc9c0 \uc54a\uc740 \uc694\uccad \ubc29\uc2dd\uc785\ub2c8\ub2e4.", http.StatusMethodNotAllowed)
		return
	}
	var req soloArenaStageRewardSaveRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "\uc785\ub825 \ub370\uc774\ud130\uac00 \uc62c\ubc14\ub974\uc9c0 \uc54a\uc2b5\ub2c8\ub2e4.", http.StatusBadRequest)
		return
	}
	if req.StageID <= 0 {
		http.Error(w, "\ub2e8\uacc4 \uc815\ubcf4\uac00 \uc62c\ubc14\ub974\uc9c0 \uc54a\uc2b5\ub2c8\ub2e4.", http.StatusBadRequest)
		return
	}
	for _, row := range req.Rewards {
		if row.RewardGold < 0 {
			http.Error(w, "\uae08\uc561 \ubcf4\uc0c1\uc740 0 \uc774\uc0c1\uc774\uc5b4\uc57c \ud569\ub2c8\ub2e4.", http.StatusBadRequest)
			return
		}
		if row.ItemEntry > 0 && row.RewardGold > 0 {
			http.Error(w, "\uc544\uc774\ud15c \ubcf4\uc0c1\uacfc \uae08\uc561 \ubcf4\uc0c1\uc740 \ub3d9\uc2dc\uc5d0 \uc124\uc815\ud560 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4.", http.StatusBadRequest)
			return
		}
		if row.ItemEntry <= 0 && row.RewardGold <= 0 {
			http.Error(w, "\uc544\uc774\ud15c \ubcf4\uc0c1 \ub610\ub294 \uae08\uc561 \ubcf4\uc0c1 \uc911 \ud558\ub098\ub294 \ubc18\ub4dc\uc2dc \uc124\uc815\ud574\uc57c \ud569\ub2c8\ub2e4.", http.StatusBadRequest)
			return
		}
		if row.ItemEntry > 0 && row.ItemCount <= 0 {
			http.Error(w, "\uc544\uc774\ud15c \uc218\ub7c9\uc740 1 \uc774\uc0c1\uc774\uc5b4\uc57c \ud569\ub2c8\ub2e4.", http.StatusBadRequest)
			return
		}
		if row.Chance < 0 || row.Chance > 100 {
			http.Error(w, "\ud655\ub960\uc740 0\uc5d0\uc11c 100 \uc0ac\uc774\uc5b4\uc57c \ud569\ub2c8\ub2e4.", http.StatusBadRequest)
			return
		}
	}

	db, err := openSoloArenaWorldDB()
	if err != nil {
		http.Error(w, "\uc2dc\ub828 \ubcf4\uc0c1 DB\uc5d0 \uc5f0\uacb0\ud558\uc9c0 \ubabb\ud588\uc2b5\ub2c8\ub2e4.", http.StatusInternalServerError)
		return
	}
	defer db.Close()
	if err := ensureSoloArenaStageRewardRankColumns(db); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

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
		rankValue := soloArenaRewardRankValue(row.RewardRankValue, row.RewardRankLabel)
		rankLabel := soloArenaRewardRankLabel(rankValue, row.RewardRankLabel)
		sortOrder := row.SortOrder
		if sortOrder <= 0 {
			sortOrder = idx + 1
		}
		if autoID {
			_, err = tx.Exec(`
				INSERT INTO solo_arena_stage_reward
				(stage_id, item_entry, item_count, chance, reward_gold, reward_rank_value, reward_rank_label, sort_order, enabled, comment)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				req.StageID, row.ItemEntry, row.ItemCount, row.Chance, row.RewardGold, rankValue, rankLabel, sortOrder, row.Enabled, strings.TrimSpace(row.Comment),
			)
		} else {
			_, err = tx.Exec(`
				INSERT INTO solo_arena_stage_reward
				(id, stage_id, item_entry, item_count, chance, reward_gold, reward_rank_value, reward_rank_label, sort_order, enabled, comment)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				nextID, req.StageID, row.ItemEntry, row.ItemCount, row.Chance, row.RewardGold, rankValue, rankLabel, sortOrder, row.Enabled, strings.TrimSpace(row.Comment),
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

	reloadErr := triggerSoloArenaReload(r)
	message := "???꿔꺂??틝???????傭?끆???????????쇰뮛???潁뺛깾???????關??濡㏓븶??듬㎦??????"
	if reloadErr == nil {
		message = "???꿔꺂??틝???????傭?끆???????????쇰뮛???潁뺛깾???????關??濡녹춻????????嫄?????꿔꺂??틝???彛???????饔낅떽???嶺뚮슢梨뜹ㅇ?????????諛몃마嶺뚮칾?고뒌????????????놁졄."
	} else {
		message = fmt.Sprintf("???꿔꺂??틝???????傭?끆???????????쇰뮛???潁뺛깾???????關??濡㏓븶??듬㎦?????? ??????ㅿ폍??????嫄?????꿔꺂??틝???彛???????饔낅떽???嶺뚮슢梨뜹ㅇ????????諛몃마嶺뚮칾?고뒌????????⑤슣?????????????놁졄: %s", reloadErr.Error())
	}
	writeJSON(w, http.StatusOK, map[string]any{"status": "success", "message": message})
}

func triggerSoloArenaReload(r *http.Request) error {
	baseURL := "http://127.0.0.1:8080"
	if r != nil && strings.TrimSpace(r.Host) != "" {
		scheme := "http"
		if r.TLS != nil {
			scheme = "https"
		}
		baseURL = scheme + "://" + r.Host
	}

	payload := map[string]string{"command": ".trial reload"}
	bodyBytes, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	req, err := http.NewRequest(http.MethodPost, baseURL+"/api/launcher/command", bytes.NewReader(bodyBytes))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Caller", "soloarena")

	client := &http.Client{Timeout: 8 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	respBytes, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("launcher command failed: %s", strings.TrimSpace(string(respBytes)))
	}

	var result map[string]any
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return nil
	}
	if status, ok := result["status"].(string); ok && status != "success" {
		if message, ok := result["message"].(string); ok && strings.TrimSpace(message) != "" {
			return fmt.Errorf("%s", message)
		}
		return fmt.Errorf("launcher command failed")
	}

	return nil
}

func handleTrialProgressList(w http.ResponseWriter, r *http.Request) {
	if !CheckMenuPermission(w, r, "content") {
		return
	}
	db, err := openSoloArenaCharactersDB()
	if err != nil {
		http.Error(w, "???꿔꺂??틝??????饔낅떽?????嶺뚮ㅎ???DB ?????怨뺤르?????????⑤슣?????????????놁졄.", http.StatusInternalServerError)
		return
	}
	defer db.Close()

	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if page < 1 {
		page = 1
	}
	limit, _ := strconv.Atoi(strings.TrimSpace(r.URL.Query().Get("limit")))
	if limit <= 0 {
		limit = 20
	}
	offset := (page - 1) * limit
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	accountQ := strings.TrimSpace(r.URL.Query().Get("account"))
	classID := strings.TrimSpace(r.URL.Query().Get("class"))
	raceID := strings.TrimSpace(r.URL.Query().Get("race"))
	levelMin := strings.TrimSpace(r.URL.Query().Get("level_min"))
	levelMax := strings.TrimSpace(r.URL.Query().Get("level_max"))
	stageID := strings.TrimSpace(r.URL.Query().Get("stage_id"))
	clearedStage := strings.TrimSpace(r.URL.Query().Get("cleared_stage"))

	accountIDs := make([]int, 0)
	if accountQ != "" {
		if accountNum, convErr := strconv.Atoi(accountQ); convErr == nil && accountNum > 0 {
			accountIDs = append(accountIDs, accountNum)
		} else if authDB, authErr := sql.Open("mysql", config.AuthDSN()); authErr == nil {
			defer authDB.Close()
			rows, qErr := authDB.Query("SELECT id FROM account WHERE username LIKE ? ORDER BY username ASC LIMIT 100", "%"+accountQ+"%")
			if qErr == nil {
				defer rows.Close()
				for rows.Next() {
					var id int
					if rows.Scan(&id) == nil {
						accountIDs = append(accountIDs, id)
					}
				}
			}
		}
	}

	conds := []string{"1=1"}
	args := make([]any, 0, 24)
	if q != "" {
		conds = append(conds, "(CAST(c.guid AS CHAR) LIKE ? OR COALESCE(NULLIF(c.name,''), '') LIKE ?)")
		like := "%" + q + "%"
		args = append(args, like, like)
	}
	if len(accountIDs) > 0 {
		holders := make([]string, 0, len(accountIDs))
		for _, id := range accountIDs {
			holders = append(holders, "?")
			args = append(args, id)
		}
		conds = append(conds, "c.account IN ("+strings.Join(holders, ",")+")")
	} else if accountQ != "" {
		conds = append(conds, "1=0")
	}
	if classID != "" {
		conds = append(conds, "c.class = ?")
		args = append(args, classID)
	}
	if raceID != "" {
		conds = append(conds, "c.race = ?")
		args = append(args, raceID)
	}
	if levelMin != "" {
		conds = append(conds, "c.level >= ?")
		args = append(args, levelMin)
	}
	if levelMax != "" {
		conds = append(conds, "c.level <= ?")
		args = append(args, levelMax)
	}
	if stageID != "" {
		conds = append(conds, "IFNULL(p.highest_stage_cleared, 0) = ?")
		args = append(args, stageID)
	}
	if clearedStage != "" {
		conds = append(conds, "EXISTS (SELECT 1 FROM solo_arena_stage_record sr WHERE sr.guid = c.guid AND sr.stage_id = ?)")
		args = append(args, clearedStage)
	}
	where := strings.Join(conds, " AND ")

	var total int
	if err := db.QueryRow(`
		SELECT COUNT(*)
		FROM characters c
		LEFT JOIN solo_arena_progress p ON p.guid = c.guid
		WHERE `+where, args...).Scan(&total); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	queryArgs := append(append([]any{}, args...), limit, offset)
	rows, err := db.Query(`
		SELECT
			c.guid,
			COALESCE(NULLIF(c.name, ''), CONCAT('GUID ', c.guid)) AS player_name,
			IFNULL(c.account, 0) AS account_id,
			IFNULL(c.race, 0) AS race,
			IFNULL(c.class, 0) AS class,
			IFNULL(c.level, 0) AS level,
			IFNULL(p.highest_stage_cleared, 0) AS highest_stage_cleared,
			`+unixTimeExpr("p.updated_at")+` AS updated_at
		FROM characters c
		LEFT JOIN solo_arena_progress p ON p.guid = c.guid
		WHERE `+where+`
		ORDER BY IFNULL(p.updated_at, 0) DESC, c.name ASC
		LIMIT ? OFFSET ?`, queryArgs...)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	items := make([]soloArenaProgressRow, 0)
	accountIDList := make([]int, 0)
	for rows.Next() {
		var row soloArenaProgressRow
		if err := rows.Scan(&row.GUID, &row.PlayerName, &row.AccountID, &row.Race, &row.Class, &row.Level, &row.HighestStageCleared, &row.UpdatedAt); err == nil {
			row.RaceName = soloArenaRaceName(row.Race)
			row.ClassName = soloArenaClassName(row.Class)
			accountIDList = append(accountIDList, row.AccountID)
			items = append(items, row)
		}
	}
	accountNames := fetchSoloArenaAccountNames(accountIDList)
	for i := range items {
		if name := strings.TrimSpace(accountNames[items[i].AccountID]); name != "" {
			items[i].AccountName = name
		} else if items[i].AccountID > 0 {
			items[i].AccountName = fmt.Sprintf("??鶯ㅺ동??????%d", items[i].AccountID)
		} else {
			items[i].AccountName = "-"
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"items":      items,
		"page":       page,
		"total":      total,
		"totalPages": (total + limit - 1) / limit,
	})
}

func handleTrialCharacterDetail(w http.ResponseWriter, r *http.Request) {
	if !CheckMenuPermission(w, r, "content") {
		return
	}
	guid, _ := strconv.ParseInt(strings.TrimSpace(r.URL.Query().Get("guid")), 10, 64)
	if guid <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "????????轅붽틓???????먯땡沃섃넄?곈툣?????쎛 ??????? ????????????놁졄."})
		return
	}

	db, err := openSoloArenaCharactersDB()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "???꿔꺂??틝?????????????轅붽틓????????????⑥ル럯????? ?饔낅떽???壤??얜?裕?傭??????"})
		return
	}
	defer db.Close()

	var detail soloArenaCharacterDetail
	err = db.QueryRow(`
		SELECT
			c.guid,
			COALESCE(NULLIF(c.name, ''), CONCAT('GUID ', c.guid)) AS player_name,
			IFNULL(c.account, 0) AS account_id,
			IFNULL(c.race, 0) AS race,
			IFNULL(c.class, 0) AS class,
			IFNULL(c.level, 0) AS level,
			IFNULL(p.highest_stage_cleared, 0) AS highest_stage_cleared,
			`+unixTimeExpr("p.updated_at")+` AS updated_at
		FROM characters c
		LEFT JOIN solo_arena_progress p ON p.guid = c.guid
		WHERE c.guid = ?`, guid).Scan(
		&detail.Character.GUID,
		&detail.Character.PlayerName,
		&detail.Character.AccountID,
		&detail.Character.Race,
		&detail.Character.Class,
		&detail.Character.Level,
		&detail.Character.HighestStageCleared,
		&detail.Character.UpdatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			writeJSON(w, http.StatusNotFound, map[string]string{"status": "error", "message": "??????? ?饔낅떽???????????????깅즽????????놁졄."})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": err.Error()})
		return
	}
	detail.Character.RaceName = soloArenaRaceName(detail.Character.Race)
	detail.Character.ClassName = soloArenaClassName(detail.Character.Class)
	if name := strings.TrimSpace(fetchSoloArenaAccountNames([]int{detail.Character.AccountID})[detail.Character.AccountID]); name != "" {
		detail.Character.AccountName = name
	} else if detail.Character.AccountID > 0 {
		detail.Character.AccountName = fmt.Sprintf("??鶯ㅺ동??????%d", detail.Character.AccountID)
	} else {
		detail.Character.AccountName = "-"
	}

	stageNameMap := loadSoloArenaStageNameMap()
	rows, err := db.Query(`
		SELECT
			sr.guid,
			sr.stage_id,
			IFNULL(sr.best_rank, 0),
			IFNULL(sr.best_rank_label, ''),
			IFNULL(sr.best_time_sec, 0),
			`+unixTimeExpr("sr.updated_at")+`
		FROM solo_arena_stage_record sr
		WHERE sr.guid = ?
		ORDER BY sr.stage_id ASC`, guid)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": err.Error()})
		return
	}
	defer rows.Close()

	detail.StageRecords = make([]soloArenaStageRecordRow, 0)
	for rows.Next() {
		var row soloArenaStageRecordRow
		if err := rows.Scan(&row.GUID, &row.StageID, &row.BestRank, &row.BestRankLabel, &row.BestTimeSec, &row.UpdatedAt); err == nil {
			row.StageName = strings.TrimSpace(stageNameMap[row.StageID])
			if row.StageName == "" {
				row.StageName = fmt.Sprintf("\uc2dc\ub828 %d\ub2e8\uacc4", row.StageID)
			}
			row.BestRank, row.BestRankLabel = soloArenaRankPreset(row.BestRank, row.BestRankLabel)
			detail.StageRecords = append(detail.StageRecords, row)
		}
	}
	writeJSON(w, http.StatusOK, detail)
}

func handleTrialProgressSave(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"status": "error", "message": "???????????嫄????????戮?Ĳ??"})
		return
	}
	if !CheckMenuPermission(w, r, "content") {
		return
	}
	var req soloArenaProgressSaveRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "??????ㅼ굣塋?????ル늉??????????? ????????????놁졄."})
		return
	}
	if req.GUID <= 0 || req.HighestStageCleared < 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "?饔낅떽?????嶺뚮ㅎ????????ル늉??????轅붽틓??????????????⑹름??????뭽??"})
		return
	}

	db, err := openSoloArenaCharactersDB()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "???꿔꺂??틝??????饔낅떽?????嶺뚮ㅎ????? ????關??濡녹춻???? ?饔낅떽???壤??얜?裕?傭??????"})
		return
	}
	defer db.Close()

	tx, err := db.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "???꿔꺂??틝??????饔낅떽?????嶺뚮ㅎ????? ????關??濡녹춻???? ?饔낅떽???壤??얜?裕?傭??????"})
		return
	}
	defer tx.Rollback()

	_, err = tx.Exec(`
		INSERT INTO solo_arena_progress (guid, highest_stage_cleared, updated_at)
		VALUES (?, ?, ?)
		ON DUPLICATE KEY UPDATE
			highest_stage_cleared = VALUES(highest_stage_cleared),
			updated_at = VALUES(updated_at)
	`, req.GUID, req.HighestStageCleared, soloArenaNowUnix())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": err.Error()})
		return
	}

	if req.SyncRecords {
		if _, err := tx.Exec(`DELETE FROM solo_arena_stage_record WHERE guid = ? AND stage_id > ?`, req.GUID, req.HighestStageCleared); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": err.Error()})
			return
		}
	}

	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "???꿔꺂??틝??????饔낅떽?????嶺뚮ㅎ????? ????關??濡녹춻???? ?饔낅떽???壤??얜?裕?傭??????"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "success", "message": "?饔낅떽?????壤??????????傭?끆???????汝??繹?? ?????얜궙??뷀떐??궰????????????놁졄."})
}

func handleTrialStageRecordSave(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"status": "error", "message": "???????????嫄????????戮?Ĳ??"})
		return
	}
	if !CheckMenuPermission(w, r, "content") {
		return
	}
	var req soloArenaStageRecordSaveRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "??????ㅼ굣塋?????ル늉??????????? ????????????놁졄."})
		return
	}
	if req.GUID <= 0 || req.StageID <= 0 || req.BestTimeSec < 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "??傭?끆?????????????????됰븗?????ル늉??????轅붽틓??????????????⑹름??????뭽??"})
		return
	}
	req.BestRank, req.BestRankLabel = soloArenaRankPreset(req.BestRank, req.BestRankLabel)

	db, err := openSoloArenaCharactersDB()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "??傭?끆?????????????????됰븗??????關??濡녹춻???? ?饔낅떽???壤??얜?裕?傭??????"})
		return
	}
	defer db.Close()

	tx, err := db.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "??傭?끆?????????????????됰븗??????關??濡녹춻???? ?饔낅떽???壤??얜?裕?傭??????"})
		return
	}
	defer tx.Rollback()

	_, err = tx.Exec(`
		INSERT INTO solo_arena_stage_record (guid, stage_id, best_rank, best_rank_label, best_time_sec, updated_at)
		VALUES (?, ?, ?, ?, ?, ?)
		ON DUPLICATE KEY UPDATE
			best_rank = VALUES(best_rank),
			best_rank_label = VALUES(best_rank_label),
			best_time_sec = VALUES(best_time_sec),
			updated_at = VALUES(updated_at)
	`, req.GUID, req.StageID, req.BestRank, req.BestRankLabel, req.BestTimeSec, soloArenaNowUnix())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": err.Error()})
		return
	}

	highest := getSoloArenaHighestRecordedStage(tx, req.GUID)
	if highest < req.StageID {
		highest = req.StageID
	}
	_, err = tx.Exec(`
		INSERT INTO solo_arena_progress (guid, highest_stage_cleared, updated_at)
		VALUES (?, ?, ?)
		ON DUPLICATE KEY UPDATE
			highest_stage_cleared = GREATEST(IFNULL(highest_stage_cleared, 0), VALUES(highest_stage_cleared)),
			updated_at = VALUES(updated_at)
	`, req.GUID, highest, soloArenaNowUnix())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": err.Error()})
		return
	}

	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "??傭?끆?????????????????됰븗??????關??濡녹춻???? ?饔낅떽???壤??얜?裕?傭??????"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "success", "message": "??傭?끆?????????????????됰븗???????얜궙??뷀떐??궰????????????놁졄."})
}

func handleTrialStageRecordDelete(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"status": "error", "message": "???????????嫄????????戮?Ĳ??"})
		return
	}
	if !CheckMenuPermission(w, r, "content") {
		return
	}
	var req soloArenaStageRecordDeleteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "??????ㅼ굣塋?????ル늉??????????? ????????????놁졄."})
		return
	}
	if req.GUID <= 0 || req.StageID <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "???????傭?끆?????????????????됰븗????????? ????????????놁졄."})
		return
	}

	db, err := openSoloArenaCharactersDB()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "??傭?끆?????????????????됰븗???????? ?饔낅떽???壤??얜?裕?傭??????"})
		return
	}
	defer db.Close()

	tx, err := db.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "??傭?끆?????????????????됰븗???????? ?饔낅떽???壤??얜?裕?傭??????"})
		return
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`DELETE FROM solo_arena_stage_record WHERE guid = ? AND stage_id = ?`, req.GUID, req.StageID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": err.Error()})
		return
	}

	if req.AdjustHighestStage {
		highest := getSoloArenaHighestRecordedStage(tx, req.GUID)
		if _, err := tx.Exec(`
			INSERT INTO solo_arena_progress (guid, highest_stage_cleared, updated_at)
			VALUES (?, ?, ?)
			ON DUPLICATE KEY UPDATE
				highest_stage_cleared = VALUES(highest_stage_cleared),
				updated_at = VALUES(updated_at)
		`, req.GUID, highest, soloArenaNowUnix()); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": err.Error()})
			return
		}
	}

	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "??傭?끆?????????????????됰븗???????? ?饔낅떽???壤??얜?裕?傭??????"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "success", "message": "??傭?끆?????????????????됰븗???????????????"})
}

func handleTrialCharacterReset(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"status": "error", "message": "???????????嫄????????戮?Ĳ??"})
		return
	}
	if !CheckMenuPermission(w, r, "content") {
		return
	}
	var req struct {
		GUID int64 `json:"guid"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.GUID <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "??????멸괜????????????????轅붽틓???????먯땡沃섃넄?곈툣?????쎛 ??????? ????????????놁졄."})
		return
	}

	db, err := openSoloArenaCharactersDB()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "???꿔꺂??틝???????????????됰븗????????멸괜?????????? ?饔낅떽???壤??얜?裕?傭??????"})
		return
	}
	defer db.Close()

	tx, err := db.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "???꿔꺂??틝???????????????됰븗????????멸괜?????????? ?饔낅떽???壤??얜?裕?傭??????"})
		return
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`DELETE FROM solo_arena_stage_record WHERE guid = ?`, req.GUID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": err.Error()})
		return
	}
	if _, err := tx.Exec(`DELETE FROM solo_arena_progress WHERE guid = ?`, req.GUID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": err.Error()})
		return
	}
	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "???꿔꺂??틝???????????????됰븗????????멸괜?????????? ?饔낅떽???壤??얜?裕?傭??????"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "success", "message": "???꿔꺂??틝??????饔낅떽?????嶺뚮ㅎ????? ??傭?끆?????????????????됰븗????????멸괜?????????????"})
}

func handleTrialCharacterForceClear(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"status": "error", "message": "???????????嫄????????戮?Ĳ??"})
		return
	}
	if !CheckMenuPermission(w, r, "content") {
		return
	}
	var req soloArenaForceClearRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "??????ㅼ굣塋?????ル늉??????????? ????????????놁졄."})
		return
	}
	if req.GUID <= 0 || req.StageID <= 0 || req.BestTimeSec < 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "????ル늉?????????????ル늉??????????? ????????????놁졄."})
		return
	}
	req.BestRank, req.BestRankLabel = soloArenaRankPreset(req.BestRank, req.BestRankLabel)

	db, err := openSoloArenaCharactersDB()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "????ル늉??????????????關??濡녹춻???? ?饔낅떽???壤??얜?裕?傭??????"})
		return
	}
	defer db.Close()

	tx, err := db.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "????ル늉??????????????關??濡녹춻???? ?饔낅떽???壤??얜?裕?傭??????"})
		return
	}
	defer tx.Rollback()

	_, err = tx.Exec(`
		INSERT INTO solo_arena_stage_record (guid, stage_id, best_rank, best_rank_label, best_time_sec, updated_at)
		VALUES (?, ?, ?, ?, ?, ?)
		ON DUPLICATE KEY UPDATE
			best_rank = VALUES(best_rank),
			best_rank_label = VALUES(best_rank_label),
			best_time_sec = VALUES(best_time_sec),
			updated_at = VALUES(updated_at)
	`, req.GUID, req.StageID, req.BestRank, req.BestRankLabel, req.BestTimeSec, soloArenaNowUnix())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": err.Error()})
		return
	}
	_, err = tx.Exec(`
		INSERT INTO solo_arena_progress (guid, highest_stage_cleared, updated_at)
		VALUES (?, ?, ?)
		ON DUPLICATE KEY UPDATE
			highest_stage_cleared = GREATEST(IFNULL(highest_stage_cleared, 0), VALUES(highest_stage_cleared)),
			updated_at = VALUES(updated_at)
	`, req.GUID, req.StageID, soloArenaNowUnix())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": err.Error()})
		return
	}
	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "????ル늉??????????????關??濡녹춻???? ?饔낅떽???壤??얜?裕?傭??????"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "success", "message": "??傭?끆?????????????????됰븗??????ル늉???傭?끆?????ㅿ폑獄?????썹땟戮녹???????????????놁졄."})
}

func handleTrialRunLogList(w http.ResponseWriter, r *http.Request) {
	if !CheckMenuPermission(w, r, "content") {
		return
	}
	db, err := openSoloArenaCharactersDB()
	if err != nil {
		http.Error(w, "???轅붽틓??????????????癲??DB ??????⑤벡瑜??????????ㅼ뒩??????????????곸죩.", http.StatusInternalServerError)
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
			COALESCE(NULLIF(rl.stage_name, ''), CONCAT(CONVERT(0xEC8B9CEBA0A8 USING utf8mb4), rl.stage_id, CONVERT(0xEB8BA8EAB384 USING utf8mb4))) AS stage_name,
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
		} else {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}
	if err := rows.Err(); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
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
		http.Error(w, "???轅붽틓??????????????????癲??DB ??????⑤벡瑜??????????ㅼ뒩??????????????곸죩.", http.StatusInternalServerError)
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
		http.Error(w, "???轅붽틓?????????????곕츥???逆곷틳源??????癲??DB ??????⑤벡瑜??????????ㅼ뒩??????????????곸죩.", http.StatusInternalServerError)
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
	rows, err := db.Query(fmt.Sprintf(`
		SELECT
			rl.id, rl.run_uid, rl.guid, rl.account_id,
			COALESCE(NULLIF(rl.player_name, ''), NULLIF(c.name, ''), CONCAT('GUID ', rl.guid)) AS player_name,
			rl.stage_id, rl.item_entry,
			CONCAT('%s', rl.item_entry) AS item_name,
			'' AS item_icon,
			IFNULL(rl.item_count, 0),
			IFNULL(rl.chance, 0),
			IFNULL(rl.grant_status, ''),
			`+unixTimeExpr("rl.granted_at")+`
		FROM solo_arena_reward_log rl
		LEFT JOIN characters c ON c.guid = rl.guid
		WHERE `+where+`
		ORDER BY rl.id DESC
		LIMIT ? OFFSET ?`, soloArenaFallbackItemPrefix), queryArgs...)
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
