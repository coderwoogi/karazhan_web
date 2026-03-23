package instancebonus

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"karazhan/pkg/config"
	"karazhan/pkg/stats"
	"log"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"

	_ "github.com/go-sql-driver/mysql"
)

var worldDB *sql.DB
var updateDB *sql.DB

const menuID = "instance-bonus-admin"

type pageResult struct {
	Items any `json:"items"`
	Page  int `json:"page"`
	Limit int `json:"limit"`
	Total int `json:"total"`
}

type dashboardResponse struct {
	RecentRuns       int             `json:"recentRuns"`
	TodaySuccess     int             `json:"todaySuccess"`
	TodayFailed      int             `json:"todayFailed"`
	RecentFallbacks  int             `json:"recentFallbacks"`
	RecentFailedRuns []runHistoryRow `json:"recentFailedRuns"`
	MapRunCounts     []mapRunCount   `json:"mapRunCounts"`
}

type mapRunCount struct {
	MapID int    `json:"mapId"`
	Count int    `json:"count"`
	Name  string `json:"name"`
}

type mapConfig struct {
	MapID                int    `json:"map_id"`
	MapName              string `json:"map_name"`
	Enabled              int    `json:"enabled"`
	AllowVote            int    `json:"allow_vote"`
	AllowLLM             int    `json:"allow_llm"`
	DefaultTimeLimitSec  int    `json:"default_time_limit_sec"`
	MinPartySize         int    `json:"min_party_size"`
	MaxPartySize         int    `json:"max_party_size"`
	MaxConcurrentMission int    `json:"max_concurrent_missions"`
	Notes                string `json:"notes"`
	UpdatedBy            string `json:"updated_by"`
	UpdatedAt            string `json:"updated_at"`
}

type missionRow struct {
	MissionID               int64  `json:"mission_id"`
	MapID                   int    `json:"map_id"`
	MissionKey              string `json:"mission_key"`
	Name                    string `json:"name"`
	Description             string `json:"description"`
	BriefingText            string `json:"briefing_text"`
	MissionType             string `json:"mission_type"`
	ObjectiveType           string `json:"objective_type"`
	TargetEntry             int    `json:"target_entry"`
	TargetLabel             string `json:"target_label"`
	TargetCount             int    `json:"target_count"`
	TimeLimitSec            int    `json:"time_limit_sec"`
	FailureConditionType    string `json:"failure_condition_type"`
	RequiredBossEntry       int    `json:"required_boss_entry"`
	RequiredBeforeBossEntry int    `json:"required_before_boss_entry"`
	AllowedDeathCount       int    `json:"allowed_death_count"`
	AllowedWipeCount        int    `json:"allowed_wipe_count"`
	RewardProfileID         int64  `json:"reward_profile_id"`
	DifficultyWeight        int    `json:"difficulty_weight"`
	MinPartySize            int    `json:"min_party_size"`
	MaxPartySize            int    `json:"max_party_size"`
	MinAvgItemLevel         int    `json:"min_avg_item_level"`
	MaxAvgItemLevel         int    `json:"max_avg_item_level"`
	RequiredTank            int    `json:"required_tank"`
	RequiredHealer          int    `json:"required_healer"`
	Enabled                 int    `json:"enabled"`
	PublishStatus           string `json:"publish_status"`
	Version                 int    `json:"version"`
	UpdatedBy               string `json:"updated_by"`
	UpdatedAt               string `json:"updated_at"`
	CreatedAt               string `json:"created_at"`
}

type themeRow struct {
	ThemeID         int64  `json:"theme_id"`
	MapID           int    `json:"map_id"`
	ThemeKey        string `json:"theme_key"`
	Name            string `json:"name"`
	Description     string `json:"description"`
	BriefingStyle   string `json:"briefing_style"`
	MinPartySize    int    `json:"min_party_size"`
	MaxPartySize    int    `json:"max_party_size"`
	MinAvgItemLevel int    `json:"min_avg_item_level"`
	MaxAvgItemLevel int    `json:"max_avg_item_level"`
	RequiredTank    int    `json:"required_tank"`
	RequiredHealer  int    `json:"required_healer"`
	Weight          int    `json:"weight"`
	Enabled         int    `json:"enabled"`
	PublishStatus   string `json:"publish_status"`
	Version         int    `json:"version"`
	UpdatedBy       string `json:"updated_by"`
	UpdatedAt       string `json:"updated_at"`
	CreatedAt       string `json:"created_at"`
}

type themeMissionLink struct {
	LinkID      int64  `json:"link_id"`
	ThemeID     int64  `json:"theme_id"`
	MissionID   int64  `json:"mission_id"`
	Slot        int    `json:"slot"`
	Required    int    `json:"required"`
	Weight      int    `json:"weight"`
	MissionKey  string `json:"mission_key"`
	MissionName string `json:"mission_name"`
	UpdatedBy   string `json:"updated_by"`
	UpdatedAt   string `json:"updated_at"`
}

type rewardProfile struct {
	RewardProfileID int64               `json:"reward_profile_id"`
	MapID           int                 `json:"map_id"`
	ProfileKey      string              `json:"profile_key"`
	Name            string              `json:"name"`
	Description     string              `json:"description"`
	Enabled         int                 `json:"enabled"`
	PublishStatus   string              `json:"publish_status"`
	Version         int                 `json:"version"`
	UpdatedBy       string              `json:"updated_by"`
	UpdatedAt       string              `json:"updated_at"`
	CreatedAt       string              `json:"created_at"`
	Items           []rewardProfileItem `json:"items,omitempty"`
}

type rewardProfileItem struct {
	ItemID          int64   `json:"item_id"`
	RewardProfileID int64   `json:"reward_profile_id"`
	Grade           string  `json:"grade"`
	ItemEntry       int     `json:"item_entry"`
	ItemCount       int     `json:"item_count"`
	Chance          float64 `json:"chance"`
	SortOrder       int     `json:"sort_order"`
	UpdatedAt       string  `json:"updated_at"`
}

type runHistoryRow struct {
	RunID         int64  `json:"run_id"`
	InstanceID    int64  `json:"instance_id"`
	MapID         int    `json:"map_id"`
	ThemeID       int64  `json:"theme_id"`
	ThemeName     string `json:"theme_name"`
	MissionID     int64  `json:"mission_id"`
	MissionName   string `json:"mission_name"`
	Status        string `json:"status"`
	Grade         string `json:"grade"`
	StartedAt     string `json:"started_at"`
	EndedAt       string `json:"ended_at"`
	ClearTimeSec  int    `json:"clear_time_sec"`
	Deaths        int    `json:"deaths"`
	Wipes         int    `json:"wipes"`
	Score         int    `json:"score"`
	VoteYes       int    `json:"vote_yes"`
	VoteNo        int    `json:"vote_no"`
	LLMUsed       int    `json:"llm_used"`
	FallbackUsed  int    `json:"fallback_used"`
	FailureReason string `json:"failure_reason"`
}

type runMemberRow struct {
	MemberID      int64  `json:"member_id"`
	RunID         int64  `json:"run_id"`
	CharacterGUID int64  `json:"character_guid"`
	CharacterName string `json:"character_name"`
	AccountID     int64  `json:"account_id"`
	ClassID       int    `json:"class_id"`
	RaceID        int    `json:"race_id"`
	RoleName      string `json:"role_name"`
	ItemLevel     int    `json:"item_level"`
	JoinedAt      string `json:"joined_at"`
}

type voteLogRow struct {
	VoteID        int64  `json:"vote_id"`
	RunID         int64  `json:"run_id"`
	CharacterGUID int64  `json:"character_guid"`
	CharacterName string `json:"character_name"`
	VoteValue     string `json:"vote_value"`
	VotedAt       string `json:"voted_at"`
}

type rewardLogRow struct {
	RewardLogID   int64  `json:"reward_log_id"`
	RunID         int64  `json:"run_id"`
	CharacterGUID int64  `json:"character_guid"`
	CharacterName string `json:"character_name"`
	Grade         string `json:"grade"`
	ItemEntry     int    `json:"item_entry"`
	ItemCount     int    `json:"item_count"`
	GrantedAt     string `json:"granted_at"`
}

type eventLogRow struct {
	EventID      int64  `json:"event_id"`
	RunID        int64  `json:"run_id"`
	EventType    string `json:"event_type"`
	EventMessage string `json:"event_message"`
	EventData    string `json:"event_data"`
	CreatedAt    string `json:"created_at"`
}

type llmLogRow struct {
	LLMLogID         int64  `json:"llm_log_id"`
	RunID            int64  `json:"run_id"`
	CandidateTheme   string `json:"candidate_theme"`
	CandidateMission string `json:"candidate_mission"`
	SelectedTheme    string `json:"selected_theme"`
	SelectedMission  string `json:"selected_mission"`
	PromptText       string `json:"prompt_text"`
	ResponseText     string `json:"response_text"`
	FallbackUsed     int    `json:"fallback_used"`
	CreatedAt        string `json:"created_at"`
}

func RegisterRoutes(mux *http.ServeMux) {
	var err error
	worldDB, err = sql.Open("mysql", config.WorldDSNWithParams("parseTime=true"))
	if err != nil {
		log.Printf("[instance-bonus] world db open error: %v", err)
	}
	updateDB, err = sql.Open("mysql", config.UpdateDSNWithParams("parseTime=true"))
	if err != nil {
		log.Printf("[instance-bonus] update db open error: %v", err)
	}
	ensureSchema()
	ensurePermissionSeeds()

	fs := http.FileServer(http.Dir("./pkg/instancebonus/static"))
	mux.Handle("/instance-bonus-admin/", http.StripPrefix("/instance-bonus-admin/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !stats.CheckMenuPermission(w, r, menuID) {
			return
		}
		fs.ServeHTTP(w, r)
	})))

	mux.HandleFunc("/instance-bonus/dashboard", handleDashboard)
	mux.HandleFunc("/instance-bonus/maps", handleMaps)
	mux.HandleFunc("/instance-bonus/maps/", handleMapByID)
	mux.HandleFunc("/instance-bonus/missions", handleMissions)
	mux.HandleFunc("/instance-bonus/missions/", handleMissionByID)
	mux.HandleFunc("/instance-bonus/themes", handleThemes)
	mux.HandleFunc("/instance-bonus/themes/", handleThemeRoutes)
	mux.HandleFunc("/instance-bonus/reward-profiles", handleRewardProfiles)
	mux.HandleFunc("/instance-bonus/reward-profiles/", handleRewardProfileByID)
	mux.HandleFunc("/instance-bonus/runs", handleRuns)
	mux.HandleFunc("/instance-bonus/runs/", handleRunRoutes)
}

func ensureSchema() {
	if worldDB == nil {
		return
	}
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS instance_bonus_map_config (
            map_id INT UNSIGNED NOT NULL PRIMARY KEY,
            map_name VARCHAR(120) NOT NULL DEFAULT '',
            enabled TINYINT(1) NOT NULL DEFAULT 1,
            allow_vote TINYINT(1) NOT NULL DEFAULT 1,
            allow_llm TINYINT(1) NOT NULL DEFAULT 0,
            default_time_limit_sec INT NOT NULL DEFAULT 1800,
            min_party_size TINYINT UNSIGNED NOT NULL DEFAULT 1,
            max_party_size TINYINT UNSIGNED NOT NULL DEFAULT 5,
            max_concurrent_missions TINYINT UNSIGNED NOT NULL DEFAULT 3,
            notes TEXT NULL,
            updated_by VARCHAR(60) NOT NULL DEFAULT '',
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
		`CREATE TABLE IF NOT EXISTS instance_bonus_mission (
            mission_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            map_id INT UNSIGNED NOT NULL,
            mission_key VARCHAR(80) NOT NULL,
            name VARCHAR(160) NOT NULL,
            description TEXT NULL,
            briefing_text TEXT NULL,
            mission_type VARCHAR(40) NOT NULL DEFAULT 'general',
            objective_type VARCHAR(40) NOT NULL DEFAULT 'kill',
            target_entry INT UNSIGNED NOT NULL DEFAULT 0,
            target_label VARCHAR(160) NOT NULL DEFAULT '',
            target_count INT UNSIGNED NOT NULL DEFAULT 0,
            time_limit_sec INT UNSIGNED NOT NULL DEFAULT 0,
            failure_condition_type VARCHAR(40) NOT NULL DEFAULT 'none',
            required_boss_entry INT UNSIGNED NOT NULL DEFAULT 0,
            required_before_boss_entry INT UNSIGNED NOT NULL DEFAULT 0,
            allowed_death_count INT NOT NULL DEFAULT 0,
            allowed_wipe_count INT NOT NULL DEFAULT 0,
            reward_profile_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
            difficulty_weight INT NOT NULL DEFAULT 100,
            min_party_size TINYINT UNSIGNED NOT NULL DEFAULT 1,
            max_party_size TINYINT UNSIGNED NOT NULL DEFAULT 5,
            min_avg_item_level INT NOT NULL DEFAULT 0,
            max_avg_item_level INT NOT NULL DEFAULT 9999,
            required_tank TINYINT(1) NOT NULL DEFAULT 0,
            required_healer TINYINT(1) NOT NULL DEFAULT 0,
            enabled TINYINT(1) NOT NULL DEFAULT 1,
            publish_status VARCHAR(20) NOT NULL DEFAULT 'draft',
            version INT NOT NULL DEFAULT 1,
            updated_by VARCHAR(60) NOT NULL DEFAULT '',
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_instance_bonus_mission_key (mission_key),
            KEY idx_instance_bonus_mission_map (map_id),
            KEY idx_instance_bonus_mission_status (publish_status, enabled)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
		`CREATE TABLE IF NOT EXISTS instance_bonus_theme (
            theme_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            map_id INT UNSIGNED NOT NULL,
            theme_key VARCHAR(80) NOT NULL,
            name VARCHAR(160) NOT NULL,
            description TEXT NULL,
            briefing_style VARCHAR(80) NOT NULL DEFAULT '',
            min_party_size TINYINT UNSIGNED NOT NULL DEFAULT 1,
            max_party_size TINYINT UNSIGNED NOT NULL DEFAULT 5,
            min_avg_item_level INT NOT NULL DEFAULT 0,
            max_avg_item_level INT NOT NULL DEFAULT 9999,
            required_tank TINYINT(1) NOT NULL DEFAULT 0,
            required_healer TINYINT(1) NOT NULL DEFAULT 0,
            weight INT NOT NULL DEFAULT 100,
            enabled TINYINT(1) NOT NULL DEFAULT 1,
            publish_status VARCHAR(20) NOT NULL DEFAULT 'draft',
            version INT NOT NULL DEFAULT 1,
            updated_by VARCHAR(60) NOT NULL DEFAULT '',
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_instance_bonus_theme_key (theme_key),
            KEY idx_instance_bonus_theme_map (map_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
		`CREATE TABLE IF NOT EXISTS instance_bonus_theme_mission_link (
            link_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            theme_id BIGINT UNSIGNED NOT NULL,
            mission_id BIGINT UNSIGNED NOT NULL,
            slot INT NOT NULL DEFAULT 1,
            required TINYINT(1) NOT NULL DEFAULT 0,
            weight INT NOT NULL DEFAULT 100,
            updated_by VARCHAR(60) NOT NULL DEFAULT '',
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_theme_mission (theme_id, mission_id),
            KEY idx_theme_slot (theme_id, slot)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
		`CREATE TABLE IF NOT EXISTS instance_bonus_reward_profile (
            reward_profile_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            map_id INT UNSIGNED NOT NULL DEFAULT 0,
            profile_key VARCHAR(80) NOT NULL,
            name VARCHAR(160) NOT NULL,
            description TEXT NULL,
            enabled TINYINT(1) NOT NULL DEFAULT 1,
            publish_status VARCHAR(20) NOT NULL DEFAULT 'draft',
            version INT NOT NULL DEFAULT 1,
            updated_by VARCHAR(60) NOT NULL DEFAULT '',
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_reward_profile_key (profile_key)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
		`CREATE TABLE IF NOT EXISTS instance_bonus_reward_profile_item (
            item_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            reward_profile_id BIGINT UNSIGNED NOT NULL,
            grade CHAR(1) NOT NULL,
            item_entry INT UNSIGNED NOT NULL DEFAULT 0,
            item_count INT UNSIGNED NOT NULL DEFAULT 1,
            chance DECIMAL(5,2) NOT NULL DEFAULT 100.00,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            KEY idx_reward_profile_grade (reward_profile_id, grade)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
		`CREATE TABLE IF NOT EXISTS instance_bonus_run_live (
            run_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            instance_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
            map_id INT UNSIGNED NOT NULL DEFAULT 0,
            theme_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
            mission_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
            status VARCHAR(20) NOT NULL DEFAULT 'live',
            started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            score INT NOT NULL DEFAULT 0,
            grade CHAR(1) NOT NULL DEFAULT '',
            llm_used TINYINT(1) NOT NULL DEFAULT 0,
            fallback_used TINYINT(1) NOT NULL DEFAULT 0
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
		`CREATE TABLE IF NOT EXISTS instance_bonus_run_history (
            run_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            instance_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
            map_id INT UNSIGNED NOT NULL DEFAULT 0,
            theme_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
            theme_name VARCHAR(160) NOT NULL DEFAULT '',
            mission_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
            mission_name VARCHAR(160) NOT NULL DEFAULT '',
            status VARCHAR(20) NOT NULL DEFAULT 'pending',
            grade CHAR(1) NOT NULL DEFAULT '',
            started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            ended_at DATETIME NULL,
            clear_time_sec INT NOT NULL DEFAULT 0,
            deaths INT NOT NULL DEFAULT 0,
            wipes INT NOT NULL DEFAULT 0,
            score INT NOT NULL DEFAULT 0,
            vote_yes INT NOT NULL DEFAULT 0,
            vote_no INT NOT NULL DEFAULT 0,
            llm_used TINYINT(1) NOT NULL DEFAULT 0,
            fallback_used TINYINT(1) NOT NULL DEFAULT 0,
            failure_reason VARCHAR(255) NOT NULL DEFAULT '',
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            KEY idx_run_history_map (map_id),
            KEY idx_run_history_status (status),
            KEY idx_run_history_started (started_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
		`CREATE TABLE IF NOT EXISTS instance_bonus_run_member (
            member_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            run_id BIGINT UNSIGNED NOT NULL,
            character_guid BIGINT UNSIGNED NOT NULL DEFAULT 0,
            character_name VARCHAR(80) NOT NULL DEFAULT '',
            account_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
            class_id INT NOT NULL DEFAULT 0,
            race_id INT NOT NULL DEFAULT 0,
            role_name VARCHAR(32) NOT NULL DEFAULT '',
            item_level INT NOT NULL DEFAULT 0,
            joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            KEY idx_run_member_run (run_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
		`CREATE TABLE IF NOT EXISTS instance_bonus_vote_log (
            vote_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            run_id BIGINT UNSIGNED NOT NULL,
            character_guid BIGINT UNSIGNED NOT NULL DEFAULT 0,
            character_name VARCHAR(80) NOT NULL DEFAULT '',
            vote_value VARCHAR(16) NOT NULL DEFAULT 'unknown',
            voted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            KEY idx_vote_log_run (run_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
		`CREATE TABLE IF NOT EXISTS instance_bonus_reward_log (
            reward_log_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            run_id BIGINT UNSIGNED NOT NULL,
            character_guid BIGINT UNSIGNED NOT NULL DEFAULT 0,
            character_name VARCHAR(80) NOT NULL DEFAULT '',
            grade CHAR(1) NOT NULL DEFAULT '',
            item_entry INT UNSIGNED NOT NULL DEFAULT 0,
            item_count INT UNSIGNED NOT NULL DEFAULT 0,
            granted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            KEY idx_reward_log_run (run_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
		`CREATE TABLE IF NOT EXISTS instance_bonus_event_log (
            event_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            run_id BIGINT UNSIGNED NOT NULL,
            event_type VARCHAR(60) NOT NULL DEFAULT '',
            event_message VARCHAR(255) NOT NULL DEFAULT '',
            event_data TEXT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            KEY idx_event_log_run (run_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
		`CREATE TABLE IF NOT EXISTS instance_bonus_llm_log (
            llm_log_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            run_id BIGINT UNSIGNED NOT NULL,
            candidate_theme TEXT NULL,
            candidate_mission TEXT NULL,
            selected_theme VARCHAR(160) NOT NULL DEFAULT '',
            selected_mission VARCHAR(160) NOT NULL DEFAULT '',
            prompt_text MEDIUMTEXT NULL,
            response_text MEDIUMTEXT NULL,
            fallback_used TINYINT(1) NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            KEY idx_llm_log_run (run_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
	}
	for _, stmt := range stmts {
		if _, err := worldDB.Exec(stmt); err != nil {
			log.Printf("[instance-bonus] schema error: %v", err)
		}
	}
}

func ensurePermissionSeeds() {
	if updateDB == nil {
		return
	}
	_, _ = updateDB.Exec(`INSERT IGNORE INTO web_menu_registry (id, type, name, order_index) VALUES (?, 'menu', '던전/레이드', 97)`, menuID)
	_, _ = updateDB.Exec(`UPDATE web_menu_registry SET name='던전/레이드', order_index=97 WHERE id=? AND type='menu'`, menuID)
	_, _ = updateDB.Exec(`INSERT IGNORE INTO web_role_permissions (resource_type, resource_id, resource_name, rank_1, rank_2, rank_3, order_index) VALUES ('menu', ?, '던전/레이드', 0, 1, 1, 97)`, menuID)
	_, _ = updateDB.Exec(`UPDATE web_role_permissions SET resource_name='던전/레이드', rank_1=0, rank_2=1, rank_3=1, order_index=97 WHERE resource_type='menu' AND resource_id=?`, menuID)
}

func requireAdmin(w http.ResponseWriter, r *http.Request) bool {
	return stats.CheckMenuPermission(w, r, menuID)
}

func currentUser(r *http.Request) string {
	c, err := r.Cookie("session_user")
	if err == nil && strings.TrimSpace(c.Value) != "" {
		return strings.TrimSpace(c.Value)
	}
	return "system"
}

func parsePage(r *http.Request) (int, int, int) {
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if page < 1 {
		page = 1
	}
	if limit <= 0 {
		limit = 10
	}
	if limit > 100 {
		limit = 100
	}
	return page, limit, (page - 1) * limit
}

func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

func decodeJSON(r *http.Request, dest any) error {
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	return dec.Decode(dest)
}

func handleDashboard(w http.ResponseWriter, r *http.Request) {
	if !requireAdmin(w, r) || worldDB == nil {
		return
	}
	var resp dashboardResponse
	_ = worldDB.QueryRow(`SELECT COUNT(*) FROM instance_bonus_run_history WHERE started_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`).Scan(&resp.RecentRuns)
	_ = worldDB.QueryRow(`SELECT COUNT(*) FROM instance_bonus_run_history WHERE DATE(started_at)=CURDATE() AND status='success'`).Scan(&resp.TodaySuccess)
	_ = worldDB.QueryRow(`SELECT COUNT(*) FROM instance_bonus_run_history WHERE DATE(started_at)=CURDATE() AND status='failed'`).Scan(&resp.TodayFailed)
	_ = worldDB.QueryRow(`SELECT COUNT(*) FROM instance_bonus_run_history WHERE started_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) AND fallback_used=1`).Scan(&resp.RecentFallbacks)

	rows, err := worldDB.Query(`
		SELECT run_id, instance_id, map_id, theme_id, IFNULL(theme_name,''), mission_id, IFNULL(mission_name,''), status, grade,
		       DATE_FORMAT(started_at, '%Y-%m-%d %H:%i:%s'), DATE_FORMAT(ended_at, '%Y-%m-%d %H:%i:%s'),
		       clear_time_sec, deaths, wipes, score, vote_yes, vote_no, llm_used, fallback_used, IFNULL(failure_reason,'')
		FROM instance_bonus_run_history
		WHERE status <> 'success'
		ORDER BY started_at DESC
		LIMIT 10`)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var row runHistoryRow
			_ = rows.Scan(&row.RunID, &row.InstanceID, &row.MapID, &row.ThemeID, &row.ThemeName, &row.MissionID, &row.MissionName, &row.Status, &row.Grade,
				&row.StartedAt, &row.EndedAt, &row.ClearTimeSec, &row.Deaths, &row.Wipes, &row.Score, &row.VoteYes, &row.VoteNo, &row.LLMUsed, &row.FallbackUsed, &row.FailureReason)
			resp.RecentFailedRuns = append(resp.RecentFailedRuns, row)
		}
	}

	rows, err = worldDB.Query(`
		SELECT h.map_id, COUNT(*) AS cnt, IFNULL(m.map_name, CONCAT('Map ', h.map_id)) AS map_name
		FROM instance_bonus_run_history h
		LEFT JOIN instance_bonus_map_config m ON m.map_id = h.map_id
		GROUP BY h.map_id, map_name
		ORDER BY cnt DESC, h.map_id ASC
		LIMIT 20`)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var item mapRunCount
			_ = rows.Scan(&item.MapID, &item.Count, &item.Name)
			resp.MapRunCounts = append(resp.MapRunCounts, item)
		}
	}
	writeJSON(w, http.StatusOK, resp)
}

func handleMaps(w http.ResponseWriter, r *http.Request) {
	if !requireAdmin(w, r) || worldDB == nil {
		return
	}
	switch r.Method {
	case http.MethodGet:
		page, limit, offset := parsePage(r)
		mapFilter := strings.TrimSpace(r.URL.Query().Get("map_id"))
		query := `SELECT map_id, IFNULL(map_name,''), enabled, allow_vote, allow_llm, default_time_limit_sec, min_party_size, max_party_size, max_concurrent_missions, IFNULL(notes,''), IFNULL(updated_by,''), DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') FROM instance_bonus_map_config`
		countQuery := `SELECT COUNT(*) FROM instance_bonus_map_config`
		args := []any{}
		where := ""
		if mapFilter != "" {
			where = " WHERE CAST(map_id AS CHAR) LIKE ?"
			args = append(args, "%"+mapFilter+"%")
		}
		var total int
		_ = worldDB.QueryRow(countQuery+where, args...).Scan(&total)
		rows, err := worldDB.Query(query+where+` ORDER BY map_id ASC LIMIT ? OFFSET ?`, append(args, limit, offset)...)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		items := make([]mapConfig, 0)
		for rows.Next() {
			var item mapConfig
			_ = rows.Scan(&item.MapID, &item.MapName, &item.Enabled, &item.AllowVote, &item.AllowLLM, &item.DefaultTimeLimitSec, &item.MinPartySize, &item.MaxPartySize, &item.MaxConcurrentMission, &item.Notes, &item.UpdatedBy, &item.UpdatedAt)
			items = append(items, item)
		}
		writeJSON(w, http.StatusOK, pageResult{Items: items, Page: page, Limit: limit, Total: total})
	case http.MethodPost:
		var item mapConfig
		if err := decodeJSON(r, &item); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if item.MapID <= 0 {
			http.Error(w, "map_id는 필수입니다.", http.StatusBadRequest)
			return
		}
		if item.MaxPartySize <= 0 {
			item.MaxPartySize = 5
		}
		if item.MinPartySize <= 0 {
			item.MinPartySize = 1
		}
		_, err := worldDB.Exec(`INSERT INTO instance_bonus_map_config
			(map_id, map_name, enabled, allow_vote, allow_llm, default_time_limit_sec, min_party_size, max_party_size, max_concurrent_missions, notes, updated_by)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON DUPLICATE KEY UPDATE
				map_name=VALUES(map_name), enabled=VALUES(enabled), allow_vote=VALUES(allow_vote), allow_llm=VALUES(allow_llm),
				default_time_limit_sec=VALUES(default_time_limit_sec), min_party_size=VALUES(min_party_size), max_party_size=VALUES(max_party_size),
				max_concurrent_missions=VALUES(max_concurrent_missions), notes=VALUES(notes), updated_by=VALUES(updated_by), updated_at=CURRENT_TIMESTAMP`,
			item.MapID, item.MapName, item.Enabled, item.AllowVote, item.AllowLLM, item.DefaultTimeLimitSec, item.MinPartySize, item.MaxPartySize, item.MaxConcurrentMission, item.Notes, currentUser(r))
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"success": true})
	default:
		http.Error(w, "Invalid method", http.StatusMethodNotAllowed)
	}
}

func handleMapByID(w http.ResponseWriter, r *http.Request) {
	if !requireAdmin(w, r) || worldDB == nil {
		return
	}
	mapID, err := mustIDFromPath(r.URL.Path, "/instance-bonus/maps/")
	if err != nil {
		http.Error(w, "invalid map id", http.StatusBadRequest)
		return
	}
	if r.Method != http.MethodPut {
		http.Error(w, "Invalid method", http.StatusMethodNotAllowed)
		return
	}
	var item mapConfig
	if err := decodeJSON(r, &item); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	_, err = worldDB.Exec(`UPDATE instance_bonus_map_config
		SET map_name=?, enabled=?, allow_vote=?, allow_llm=?, default_time_limit_sec=?, min_party_size=?, max_party_size=?, max_concurrent_missions=?, notes=?, updated_by=?, updated_at=CURRENT_TIMESTAMP
		WHERE map_id=?`,
		item.MapName, item.Enabled, item.AllowVote, item.AllowLLM, item.DefaultTimeLimitSec, item.MinPartySize, item.MaxPartySize, item.MaxConcurrentMission, item.Notes, currentUser(r), mapID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"success": true})
}

func handleMissions(w http.ResponseWriter, r *http.Request) {
	if !requireAdmin(w, r) || worldDB == nil {
		return
	}
	switch r.Method {
	case http.MethodGet:
		page, limit, offset := parsePage(r)
		args := []any{}
		conds := []string{"1=1"}
		for key, col := range map[string]string{
			"map_id":         "CAST(map_id AS CHAR)",
			"publish_status": "publish_status",
			"enabled":        "CAST(enabled AS CHAR)",
			"mission_type":   "mission_type",
			"objective_type": "objective_type",
		} {
			v := strings.TrimSpace(r.URL.Query().Get(key))
			if v != "" {
				conds = append(conds, col+" = ?")
				args = append(args, v)
			}
		}
		search := strings.TrimSpace(r.URL.Query().Get("search"))
		if search != "" {
			conds = append(conds, "(name LIKE ? OR mission_key LIKE ? OR target_label LIKE ?)")
			args = append(args, "%"+search+"%", "%"+search+"%", "%"+search+"%")
		}
		where := " WHERE " + strings.Join(conds, " AND ")
		var total int
		_ = worldDB.QueryRow(`SELECT COUNT(*) FROM instance_bonus_mission`+where, args...).Scan(&total)
		rows, err := worldDB.Query(`
			SELECT mission_id, map_id, mission_key, name, IFNULL(description,''), IFNULL(briefing_text,''), mission_type, objective_type, target_entry, IFNULL(target_label,''), target_count, time_limit_sec,
			       failure_condition_type, required_boss_entry, required_before_boss_entry, allowed_death_count, allowed_wipe_count, reward_profile_id, difficulty_weight, min_party_size, max_party_size,
			       min_avg_item_level, max_avg_item_level, required_tank, required_healer, enabled, publish_status, version, IFNULL(updated_by,''), DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s'), DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s')
			FROM instance_bonus_mission`+where+` ORDER BY updated_at DESC, mission_id DESC LIMIT ? OFFSET ?`, append(args, limit, offset)...)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		items := make([]missionRow, 0)
		for rows.Next() {
			var item missionRow
			_ = rows.Scan(&item.MissionID, &item.MapID, &item.MissionKey, &item.Name, &item.Description, &item.BriefingText, &item.MissionType, &item.ObjectiveType, &item.TargetEntry, &item.TargetLabel, &item.TargetCount, &item.TimeLimitSec,
				&item.FailureConditionType, &item.RequiredBossEntry, &item.RequiredBeforeBossEntry, &item.AllowedDeathCount, &item.AllowedWipeCount, &item.RewardProfileID, &item.DifficultyWeight, &item.MinPartySize, &item.MaxPartySize,
				&item.MinAvgItemLevel, &item.MaxAvgItemLevel, &item.RequiredTank, &item.RequiredHealer, &item.Enabled, &item.PublishStatus, &item.Version, &item.UpdatedBy, &item.UpdatedAt, &item.CreatedAt)
			items = append(items, item)
		}
		writeJSON(w, http.StatusOK, pageResult{Items: items, Page: page, Limit: limit, Total: total})
	case http.MethodPost:
		var item missionRow
		if err := decodeJSON(r, &item); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if strings.TrimSpace(item.MissionKey) == "" || strings.TrimSpace(item.Name) == "" {
			http.Error(w, "mission_key와 name은 필수입니다.", http.StatusBadRequest)
			return
		}
		if item.PublishStatus == "" {
			item.PublishStatus = "draft"
		}
		res, err := worldDB.Exec(`INSERT INTO instance_bonus_mission
			(map_id, mission_key, name, description, briefing_text, mission_type, objective_type, target_entry, target_label, target_count, time_limit_sec, failure_condition_type,
			 required_boss_entry, required_before_boss_entry, allowed_death_count, allowed_wipe_count, reward_profile_id, difficulty_weight, min_party_size, max_party_size, min_avg_item_level,
			 max_avg_item_level, required_tank, required_healer, enabled, publish_status, version, updated_by)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
			item.MapID, item.MissionKey, item.Name, item.Description, item.BriefingText, item.MissionType, item.ObjectiveType, item.TargetEntry, item.TargetLabel, item.TargetCount, item.TimeLimitSec, item.FailureConditionType,
			item.RequiredBossEntry, item.RequiredBeforeBossEntry, item.AllowedDeathCount, item.AllowedWipeCount, item.RewardProfileID, item.DifficultyWeight, item.MinPartySize, item.MaxPartySize, item.MinAvgItemLevel,
			item.MaxAvgItemLevel, item.RequiredTank, item.RequiredHealer, item.Enabled, item.PublishStatus, currentUser(r))
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		id, _ := res.LastInsertId()
		writeJSON(w, http.StatusOK, map[string]any{"success": true, "mission_id": id})
	default:
		http.Error(w, "Invalid method", http.StatusMethodNotAllowed)
	}
}

func handleMissionByID(w http.ResponseWriter, r *http.Request) {
	if !requireAdmin(w, r) || worldDB == nil {
		return
	}
	id, err := mustIDFromPath(r.URL.Path, "/instance-bonus/missions/")
	if err != nil {
		http.Error(w, "invalid mission id", http.StatusBadRequest)
		return
	}
	switch r.Method {
	case http.MethodGet:
		var item missionRow
		err = worldDB.QueryRow(`
			SELECT mission_id, map_id, mission_key, name, IFNULL(description,''), IFNULL(briefing_text,''), mission_type, objective_type, target_entry, IFNULL(target_label,''), target_count, time_limit_sec,
			       failure_condition_type, required_boss_entry, required_before_boss_entry, allowed_death_count, allowed_wipe_count, reward_profile_id, difficulty_weight, min_party_size, max_party_size,
			       min_avg_item_level, max_avg_item_level, required_tank, required_healer, enabled, publish_status, version, IFNULL(updated_by,''), DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s'), DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s')
			FROM instance_bonus_mission WHERE mission_id=?`, id).
			Scan(&item.MissionID, &item.MapID, &item.MissionKey, &item.Name, &item.Description, &item.BriefingText, &item.MissionType, &item.ObjectiveType, &item.TargetEntry, &item.TargetLabel, &item.TargetCount, &item.TimeLimitSec,
				&item.FailureConditionType, &item.RequiredBossEntry, &item.RequiredBeforeBossEntry, &item.AllowedDeathCount, &item.AllowedWipeCount, &item.RewardProfileID, &item.DifficultyWeight, &item.MinPartySize, &item.MaxPartySize,
				&item.MinAvgItemLevel, &item.MaxAvgItemLevel, &item.RequiredTank, &item.RequiredHealer, &item.Enabled, &item.PublishStatus, &item.Version, &item.UpdatedBy, &item.UpdatedAt, &item.CreatedAt)
		if err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		writeJSON(w, http.StatusOK, item)
	case http.MethodPut:
		var item missionRow
		if err := decodeJSON(r, &item); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if item.PublishStatus == "" {
			item.PublishStatus = "draft"
		}
		_, err = worldDB.Exec(`UPDATE instance_bonus_mission SET
			map_id=?, mission_key=?, name=?, description=?, briefing_text=?, mission_type=?, objective_type=?, target_entry=?, target_label=?, target_count=?, time_limit_sec=?, failure_condition_type=?,
			required_boss_entry=?, required_before_boss_entry=?, allowed_death_count=?, allowed_wipe_count=?, reward_profile_id=?, difficulty_weight=?, min_party_size=?, max_party_size=?, min_avg_item_level=?,
			max_avg_item_level=?, required_tank=?, required_healer=?, enabled=?, publish_status=?, version=version+1, updated_by=?, updated_at=CURRENT_TIMESTAMP
			WHERE mission_id=?`,
			item.MapID, item.MissionKey, item.Name, item.Description, item.BriefingText, item.MissionType, item.ObjectiveType, item.TargetEntry, item.TargetLabel, item.TargetCount, item.TimeLimitSec, item.FailureConditionType,
			item.RequiredBossEntry, item.RequiredBeforeBossEntry, item.AllowedDeathCount, item.AllowedWipeCount, item.RewardProfileID, item.DifficultyWeight, item.MinPartySize, item.MaxPartySize, item.MinAvgItemLevel,
			item.MaxAvgItemLevel, item.RequiredTank, item.RequiredHealer, item.Enabled, item.PublishStatus, currentUser(r), id)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"success": true})
	default:
		http.Error(w, "Invalid method", http.StatusMethodNotAllowed)
	}
}
func handleThemes(w http.ResponseWriter, r *http.Request) {
	if !requireAdmin(w, r) || worldDB == nil {
		return
	}
	switch r.Method {
	case http.MethodGet:
		page, limit, offset := parsePage(r)
		args := []any{}
		conds := []string{"1=1"}
		for key, col := range map[string]string{"map_id": "CAST(map_id AS CHAR)", "publish_status": "publish_status", "enabled": "CAST(enabled AS CHAR)"} {
			v := strings.TrimSpace(r.URL.Query().Get(key))
			if v != "" {
				conds = append(conds, col+" = ?")
				args = append(args, v)
			}
		}
		search := strings.TrimSpace(r.URL.Query().Get("search"))
		if search != "" {
			conds = append(conds, "(name LIKE ? OR theme_key LIKE ?)")
			args = append(args, "%"+search+"%", "%"+search+"%")
		}
		where := " WHERE " + strings.Join(conds, " AND ")
		var total int
		_ = worldDB.QueryRow(`SELECT COUNT(*) FROM instance_bonus_theme`+where, args...).Scan(&total)
		rows, err := worldDB.Query(`SELECT theme_id, map_id, theme_key, name, IFNULL(description,''), IFNULL(briefing_style,''), min_party_size, max_party_size, min_avg_item_level, max_avg_item_level, required_tank, required_healer,
		       weight, enabled, publish_status, version, IFNULL(updated_by,''), DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s'), DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s')
			FROM instance_bonus_theme`+where+` ORDER BY updated_at DESC, theme_id DESC LIMIT ? OFFSET ?`, append(args, limit, offset)...)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		items := make([]themeRow, 0)
		for rows.Next() {
			var item themeRow
			_ = rows.Scan(&item.ThemeID, &item.MapID, &item.ThemeKey, &item.Name, &item.Description, &item.BriefingStyle, &item.MinPartySize, &item.MaxPartySize, &item.MinAvgItemLevel, &item.MaxAvgItemLevel,
				&item.RequiredTank, &item.RequiredHealer, &item.Weight, &item.Enabled, &item.PublishStatus, &item.Version, &item.UpdatedBy, &item.UpdatedAt, &item.CreatedAt)
			items = append(items, item)
		}
		writeJSON(w, http.StatusOK, pageResult{Items: items, Page: page, Limit: limit, Total: total})
	case http.MethodPost:
		var item themeRow
		if err := decodeJSON(r, &item); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if strings.TrimSpace(item.ThemeKey) == "" || strings.TrimSpace(item.Name) == "" {
			http.Error(w, "theme_key와 name은 필수입니다.", http.StatusBadRequest)
			return
		}
		if item.PublishStatus == "" {
			item.PublishStatus = "draft"
		}
		res, err := worldDB.Exec(`INSERT INTO instance_bonus_theme
			(map_id, theme_key, name, description, briefing_style, min_party_size, max_party_size, min_avg_item_level, max_avg_item_level, required_tank, required_healer, weight, enabled, publish_status, version, updated_by)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
			item.MapID, item.ThemeKey, item.Name, item.Description, item.BriefingStyle, item.MinPartySize, item.MaxPartySize, item.MinAvgItemLevel, item.MaxAvgItemLevel, item.RequiredTank, item.RequiredHealer, item.Weight, item.Enabled, item.PublishStatus, currentUser(r))
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		id, _ := res.LastInsertId()
		writeJSON(w, http.StatusOK, map[string]any{"success": true, "theme_id": id})
	default:
		http.Error(w, "Invalid method", http.StatusMethodNotAllowed)
	}
}

func handleThemeRoutes(w http.ResponseWriter, r *http.Request) {
	if !requireAdmin(w, r) || worldDB == nil {
		return
	}
	path := strings.TrimPrefix(r.URL.Path, "/instance-bonus/themes/")
	path = strings.Trim(path, "/")
	parts := strings.Split(path, "/")
	if len(parts) == 0 || parts[0] == "" {
		http.Error(w, "invalid theme id", http.StatusBadRequest)
		return
	}
	themeID, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		http.Error(w, "invalid theme id", http.StatusBadRequest)
		return
	}
	if len(parts) == 1 {
		switch r.Method {
		case http.MethodGet:
			var item themeRow
			err = worldDB.QueryRow(`SELECT theme_id, map_id, theme_key, name, IFNULL(description,''), IFNULL(briefing_style,''), min_party_size, max_party_size, min_avg_item_level, max_avg_item_level, required_tank, required_healer,
			       weight, enabled, publish_status, version, IFNULL(updated_by,''), DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s'), DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s')
				FROM instance_bonus_theme WHERE theme_id=?`, themeID).
				Scan(&item.ThemeID, &item.MapID, &item.ThemeKey, &item.Name, &item.Description, &item.BriefingStyle, &item.MinPartySize, &item.MaxPartySize, &item.MinAvgItemLevel, &item.MaxAvgItemLevel,
					&item.RequiredTank, &item.RequiredHealer, &item.Weight, &item.Enabled, &item.PublishStatus, &item.Version, &item.UpdatedBy, &item.UpdatedAt, &item.CreatedAt)
			if err != nil {
				http.Error(w, err.Error(), http.StatusNotFound)
				return
			}
			writeJSON(w, http.StatusOK, item)
		case http.MethodPut:
			var item themeRow
			if err := decodeJSON(r, &item); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			if item.PublishStatus == "" {
				item.PublishStatus = "draft"
			}
			_, err = worldDB.Exec(`UPDATE instance_bonus_theme SET
				map_id=?, theme_key=?, name=?, description=?, briefing_style=?, min_party_size=?, max_party_size=?, min_avg_item_level=?, max_avg_item_level=?, required_tank=?, required_healer=?, weight=?, enabled=?, publish_status=?, version=version+1, updated_by=?, updated_at=CURRENT_TIMESTAMP
				WHERE theme_id=?`,
				item.MapID, item.ThemeKey, item.Name, item.Description, item.BriefingStyle, item.MinPartySize, item.MaxPartySize, item.MinAvgItemLevel, item.MaxAvgItemLevel, item.RequiredTank, item.RequiredHealer, item.Weight, item.Enabled, item.PublishStatus, currentUser(r), themeID)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{"success": true})
		default:
			http.Error(w, "Invalid method", http.StatusMethodNotAllowed)
		}
		return
	}
	if parts[1] != "missions" {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	if len(parts) == 2 {
		switch r.Method {
		case http.MethodGet:
			rows, err := worldDB.Query(`SELECT l.link_id, l.theme_id, l.mission_id, l.slot, l.required, l.weight, IFNULL(m.mission_key,''), IFNULL(m.name,''), IFNULL(l.updated_by,''), DATE_FORMAT(l.updated_at, '%Y-%m-%d %H:%i:%s')
				FROM instance_bonus_theme_mission_link l
				LEFT JOIN instance_bonus_mission m ON m.mission_id = l.mission_id
				WHERE l.theme_id=? ORDER BY l.slot ASC, l.link_id ASC`, themeID)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			defer rows.Close()
			items := make([]themeMissionLink, 0)
			for rows.Next() {
				var item themeMissionLink
				_ = rows.Scan(&item.LinkID, &item.ThemeID, &item.MissionID, &item.Slot, &item.Required, &item.Weight, &item.MissionKey, &item.MissionName, &item.UpdatedBy, &item.UpdatedAt)
				items = append(items, item)
			}
			writeJSON(w, http.StatusOK, items)
		case http.MethodPost:
			var item themeMissionLink
			if err := decodeJSON(r, &item); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			_, err := worldDB.Exec(`INSERT INTO instance_bonus_theme_mission_link (theme_id, mission_id, slot, required, weight, updated_by)
				VALUES (?, ?, ?, ?, ?, ?)
				ON DUPLICATE KEY UPDATE slot=VALUES(slot), required=VALUES(required), weight=VALUES(weight), updated_by=VALUES(updated_by), updated_at=CURRENT_TIMESTAMP`,
				themeID, item.MissionID, item.Slot, item.Required, item.Weight, currentUser(r))
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{"success": true})
		default:
			http.Error(w, "Invalid method", http.StatusMethodNotAllowed)
		}
		return
	}
	missionID, err := strconv.ParseInt(parts[2], 10, 64)
	if err != nil {
		http.Error(w, "invalid mission id", http.StatusBadRequest)
		return
	}
	if r.Method != http.MethodDelete {
		http.Error(w, "Invalid method", http.StatusMethodNotAllowed)
		return
	}
	_, err = worldDB.Exec(`DELETE FROM instance_bonus_theme_mission_link WHERE theme_id=? AND mission_id=?`, themeID, missionID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"success": true})
}

func handleRewardProfiles(w http.ResponseWriter, r *http.Request) {
	if !requireAdmin(w, r) || worldDB == nil {
		return
	}
	switch r.Method {
	case http.MethodGet:
		page, limit, offset := parsePage(r)
		args := []any{}
		conds := []string{"1=1"}
		for key, col := range map[string]string{"map_id": "CAST(map_id AS CHAR)", "publish_status": "publish_status", "enabled": "CAST(enabled AS CHAR)"} {
			v := strings.TrimSpace(r.URL.Query().Get(key))
			if v != "" {
				conds = append(conds, col+" = ?")
				args = append(args, v)
			}
		}
		search := strings.TrimSpace(r.URL.Query().Get("search"))
		if search != "" {
			conds = append(conds, "(name LIKE ? OR profile_key LIKE ?)")
			args = append(args, "%"+search+"%", "%"+search+"%")
		}
		where := " WHERE " + strings.Join(conds, " AND ")
		var total int
		_ = worldDB.QueryRow(`SELECT COUNT(*) FROM instance_bonus_reward_profile`+where, args...).Scan(&total)
		rows, err := worldDB.Query(`SELECT reward_profile_id, map_id, profile_key, name, IFNULL(description,''), enabled, publish_status, version, IFNULL(updated_by,''), DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s'), DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s')
			FROM instance_bonus_reward_profile`+where+` ORDER BY updated_at DESC, reward_profile_id DESC LIMIT ? OFFSET ?`, append(args, limit, offset)...)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		items := make([]rewardProfile, 0)
		for rows.Next() {
			var item rewardProfile
			_ = rows.Scan(&item.RewardProfileID, &item.MapID, &item.ProfileKey, &item.Name, &item.Description, &item.Enabled, &item.PublishStatus, &item.Version, &item.UpdatedBy, &item.UpdatedAt, &item.CreatedAt)
			items = append(items, item)
		}
		writeJSON(w, http.StatusOK, pageResult{Items: items, Page: page, Limit: limit, Total: total})
	case http.MethodPost:
		var item rewardProfile
		if err := decodeJSON(r, &item); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if item.PublishStatus == "" {
			item.PublishStatus = "draft"
		}
		res, err := worldDB.Exec(`INSERT INTO instance_bonus_reward_profile (map_id, profile_key, name, description, enabled, publish_status, version, updated_by)
			VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
			item.MapID, item.ProfileKey, item.Name, item.Description, item.Enabled, item.PublishStatus, currentUser(r))
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		id, _ := res.LastInsertId()
		replaceRewardProfileItems(id, item.Items)
		writeJSON(w, http.StatusOK, map[string]any{"success": true, "reward_profile_id": id})
	default:
		http.Error(w, "Invalid method", http.StatusMethodNotAllowed)
	}
}

func handleRewardProfileByID(w http.ResponseWriter, r *http.Request) {
	if !requireAdmin(w, r) || worldDB == nil {
		return
	}
	id, err := mustIDFromPath(r.URL.Path, "/instance-bonus/reward-profiles/")
	if err != nil {
		http.Error(w, "invalid profile id", http.StatusBadRequest)
		return
	}
	switch r.Method {
	case http.MethodGet:
		var item rewardProfile
		err = worldDB.QueryRow(`SELECT reward_profile_id, map_id, profile_key, name, IFNULL(description,''), enabled, publish_status, version, IFNULL(updated_by,''), DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s'), DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s')
			FROM instance_bonus_reward_profile WHERE reward_profile_id=?`, id).
			Scan(&item.RewardProfileID, &item.MapID, &item.ProfileKey, &item.Name, &item.Description, &item.Enabled, &item.PublishStatus, &item.Version, &item.UpdatedBy, &item.UpdatedAt, &item.CreatedAt)
		if err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		rows, _ := worldDB.Query(`SELECT item_id, reward_profile_id, grade, item_entry, item_count, chance, sort_order, DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') FROM instance_bonus_reward_profile_item WHERE reward_profile_id=? ORDER BY FIELD(grade,'S','A','B','C','D'), sort_order ASC, item_id ASC`, id)
		if rows != nil {
			defer rows.Close()
			for rows.Next() {
				var sub rewardProfileItem
				_ = rows.Scan(&sub.ItemID, &sub.RewardProfileID, &sub.Grade, &sub.ItemEntry, &sub.ItemCount, &sub.Chance, &sub.SortOrder, &sub.UpdatedAt)
				item.Items = append(item.Items, sub)
			}
		}
		writeJSON(w, http.StatusOK, item)
	case http.MethodPut:
		var item rewardProfile
		if err := decodeJSON(r, &item); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if item.PublishStatus == "" {
			item.PublishStatus = "draft"
		}
		_, err = worldDB.Exec(`UPDATE instance_bonus_reward_profile SET map_id=?, profile_key=?, name=?, description=?, enabled=?, publish_status=?, version=version+1, updated_by=?, updated_at=CURRENT_TIMESTAMP WHERE reward_profile_id=?`,
			item.MapID, item.ProfileKey, item.Name, item.Description, item.Enabled, item.PublishStatus, currentUser(r), id)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		replaceRewardProfileItems(id, item.Items)
		writeJSON(w, http.StatusOK, map[string]any{"success": true})
	default:
		http.Error(w, "Invalid method", http.StatusMethodNotAllowed)
	}
}

func replaceRewardProfileItems(profileID int64, items []rewardProfileItem) error {
	if worldDB == nil {
		return fmt.Errorf("world db not initialized")
	}

	tx, err := worldDB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`DELETE FROM instance_bonus_reward_profile_item WHERE reward_profile_id=?`, profileID); err != nil {
		return err
	}

	for _, item := range items {
		grade := strings.TrimSpace(item.Grade)
		if grade == "" || item.ItemEntry == 0 || item.ItemCount <= 0 {
			continue
		}
		if _, err := tx.Exec(`
			INSERT INTO instance_bonus_reward_profile_item (
				reward_profile_id, grade, item_entry, item_count, chance, sort_order
			) VALUES (?, ?, ?, ?, ?, ?)`,
			profileID, grade, item.ItemEntry, item.ItemCount, item.Chance, item.SortOrder,
		); err != nil {
			return err
		}
	}

	return tx.Commit()
}

func handleRuns(w http.ResponseWriter, r *http.Request) {
	if !requireAdmin(w, r) || worldDB == nil {
		return
	}
	if r.Method != http.MethodGet {
		http.Error(w, "Invalid method", http.StatusMethodNotAllowed)
		return
	}
	page, limit, offset := parsePage(r)
	args := []any{}
	conds := []string{"1=1"}
	for key, col := range map[string]string{
		"map_id":     "CAST(map_id AS CHAR)",
		"theme_id":   "CAST(theme_id AS CHAR)",
		"mission_id": "CAST(mission_id AS CHAR)",
		"status":     "status",
		"grade":      "grade",
	} {
		v := strings.TrimSpace(r.URL.Query().Get(key))
		if v != "" {
			conds = append(conds, col+" = ?")
			args = append(args, v)
		}
	}
	if from := strings.TrimSpace(r.URL.Query().Get("started_from")); from != "" {
		conds = append(conds, "started_at >= ?")
		args = append(args, from+" 00:00:00")
	}
	if to := strings.TrimSpace(r.URL.Query().Get("started_to")); to != "" {
		conds = append(conds, "started_at <= ?")
		args = append(args, to+" 23:59:59")
	}
	if llm := strings.TrimSpace(r.URL.Query().Get("llm_used")); llm != "" {
		conds = append(conds, "CAST(llm_used AS CHAR)=?")
		args = append(args, llm)
	}
	if keyword := strings.TrimSpace(r.URL.Query().Get("keyword")); keyword != "" {
		conds = append(conds, `(CAST(run_id AS CHAR) LIKE ? OR mission_name LIKE ? OR theme_name LIKE ? OR EXISTS (SELECT 1 FROM instance_bonus_run_member m WHERE m.run_id=instance_bonus_run_history.run_id AND (CAST(m.character_guid AS CHAR) LIKE ? OR m.character_name LIKE ?)))`)
		args = append(args, "%"+keyword+"%", "%"+keyword+"%", "%"+keyword+"%", "%"+keyword+"%", "%"+keyword+"%")
	}
	where := " WHERE " + strings.Join(conds, " AND ")
	var total int
	_ = worldDB.QueryRow(`SELECT COUNT(*) FROM instance_bonus_run_history`+where, args...).Scan(&total)
	rows, err := worldDB.Query(`
		SELECT run_id, instance_id, map_id, theme_id, IFNULL(theme_name,''), mission_id, IFNULL(mission_name,''), status, grade,
		       DATE_FORMAT(started_at, '%Y-%m-%d %H:%i:%s'), DATE_FORMAT(ended_at, '%Y-%m-%d %H:%i:%s'),
		       clear_time_sec, deaths, wipes, score, vote_yes, vote_no, llm_used, fallback_used, IFNULL(failure_reason,'')
		FROM instance_bonus_run_history`+where+` ORDER BY started_at DESC, run_id DESC LIMIT ? OFFSET ?`, append(args, limit, offset)...)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	items := make([]runHistoryRow, 0)
	for rows.Next() {
		var row runHistoryRow
		_ = rows.Scan(&row.RunID, &row.InstanceID, &row.MapID, &row.ThemeID, &row.ThemeName, &row.MissionID, &row.MissionName, &row.Status, &row.Grade,
			&row.StartedAt, &row.EndedAt, &row.ClearTimeSec, &row.Deaths, &row.Wipes, &row.Score, &row.VoteYes, &row.VoteNo, &row.LLMUsed, &row.FallbackUsed, &row.FailureReason)
		items = append(items, row)
	}
	writeJSON(w, http.StatusOK, pageResult{Items: items, Page: page, Limit: limit, Total: total})
}

func handleRunRoutes(w http.ResponseWriter, r *http.Request) {
	if !requireAdmin(w, r) || worldDB == nil {
		return
	}
	path := strings.TrimPrefix(r.URL.Path, "/instance-bonus/runs/")
	path = strings.Trim(path, "/")
	parts := strings.Split(path, "/")
	if len(parts) == 0 || parts[0] == "" {
		http.Error(w, "invalid run id", http.StatusBadRequest)
		return
	}
	runID, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		http.Error(w, "invalid run id", http.StatusBadRequest)
		return
	}
	if len(parts) == 1 {
		var row runHistoryRow
		err = worldDB.QueryRow(`
			SELECT run_id, instance_id, map_id, theme_id, IFNULL(theme_name,''), mission_id, IFNULL(mission_name,''), status, grade,
			       DATE_FORMAT(started_at, '%Y-%m-%d %H:%i:%s'), DATE_FORMAT(ended_at, '%Y-%m-%d %H:%i:%s'),
			       clear_time_sec, deaths, wipes, score, vote_yes, vote_no, llm_used, fallback_used, IFNULL(failure_reason,'')
			FROM instance_bonus_run_history WHERE run_id=?`, runID).
			Scan(&row.RunID, &row.InstanceID, &row.MapID, &row.ThemeID, &row.ThemeName, &row.MissionID, &row.MissionName, &row.Status, &row.Grade,
				&row.StartedAt, &row.EndedAt, &row.ClearTimeSec, &row.Deaths, &row.Wipes, &row.Score, &row.VoteYes, &row.VoteNo, &row.LLMUsed, &row.FallbackUsed, &row.FailureReason)
		if err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		writeJSON(w, http.StatusOK, row)
		return
	}
	switch parts[1] {
	case "members":
		rows, err := worldDB.Query(`SELECT member_id, run_id, character_guid, IFNULL(character_name,''), account_id, class_id, race_id, IFNULL(role_name,''), item_level, DATE_FORMAT(joined_at, '%Y-%m-%d %H:%i:%s') FROM instance_bonus_run_member WHERE run_id=? ORDER BY member_id ASC`, runID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		items := make([]runMemberRow, 0)
		for rows.Next() {
			var v runMemberRow
			_ = rows.Scan(&v.MemberID, &v.RunID, &v.CharacterGUID, &v.CharacterName, &v.AccountID, &v.ClassID, &v.RaceID, &v.RoleName, &v.ItemLevel, &v.JoinedAt)
			items = append(items, v)
		}
		writeJSON(w, http.StatusOK, items)
	case "votes":
		rows, err := worldDB.Query(`SELECT vote_id, run_id, character_guid, IFNULL(character_name,''), vote_value, DATE_FORMAT(voted_at, '%Y-%m-%d %H:%i:%s') FROM instance_bonus_vote_log WHERE run_id=? ORDER BY vote_id ASC`, runID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		items := make([]voteLogRow, 0)
		for rows.Next() {
			var v voteLogRow
			_ = rows.Scan(&v.VoteID, &v.RunID, &v.CharacterGUID, &v.CharacterName, &v.VoteValue, &v.VotedAt)
			items = append(items, v)
		}
		writeJSON(w, http.StatusOK, items)
	case "rewards":
		rows, err := worldDB.Query(`SELECT reward_log_id, run_id, character_guid, IFNULL(character_name,''), grade, item_entry, item_count, DATE_FORMAT(granted_at, '%Y-%m-%d %H:%i:%s') FROM instance_bonus_reward_log WHERE run_id=? ORDER BY reward_log_id ASC`, runID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		items := make([]rewardLogRow, 0)
		for rows.Next() {
			var v rewardLogRow
			_ = rows.Scan(&v.RewardLogID, &v.RunID, &v.CharacterGUID, &v.CharacterName, &v.Grade, &v.ItemEntry, &v.ItemCount, &v.GrantedAt)
			items = append(items, v)
		}
		writeJSON(w, http.StatusOK, items)
	case "events":
		rows, err := worldDB.Query(`SELECT event_id, run_id, event_type, IFNULL(event_message,''), IFNULL(event_data,''), DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') FROM instance_bonus_event_log WHERE run_id=? ORDER BY event_id ASC`, runID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		items := make([]eventLogRow, 0)
		for rows.Next() {
			var v eventLogRow
			_ = rows.Scan(&v.EventID, &v.RunID, &v.EventType, &v.EventMessage, &v.EventData, &v.CreatedAt)
			items = append(items, v)
		}
		writeJSON(w, http.StatusOK, items)
	case "llm":
		rows, err := worldDB.Query(`SELECT llm_log_id, run_id, IFNULL(candidate_theme,''), IFNULL(candidate_mission,''), IFNULL(selected_theme,''), IFNULL(selected_mission,''), IFNULL(prompt_text,''), IFNULL(response_text,''), fallback_used, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') FROM instance_bonus_llm_log WHERE run_id=? ORDER BY llm_log_id ASC`, runID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		items := make([]llmLogRow, 0)
		for rows.Next() {
			var v llmLogRow
			_ = rows.Scan(&v.LLMLogID, &v.RunID, &v.CandidateTheme, &v.CandidateMission, &v.SelectedTheme, &v.SelectedMission, &v.PromptText, &v.ResponseText, &v.FallbackUsed, &v.CreatedAt)
			items = append(items, v)
		}
		writeJSON(w, http.StatusOK, items)
	default:
		http.Error(w, "not found", http.StatusNotFound)
	}
}

func mustIDFromPath(path, prefix string) (int64, error) {
	s := strings.TrimPrefix(path, prefix)
	s = strings.Trim(s, "/")
	if s == "" {
		return 0, fmt.Errorf("missing id")
	}
	idPart := strings.Split(s, "/")[0]
	return strconv.ParseInt(idPart, 10, 64)
}

func staticAssetPath(parts ...string) string {
	items := append([]string{"./pkg/instancebonus/static"}, parts...)
	return filepath.Join(items...)
}
