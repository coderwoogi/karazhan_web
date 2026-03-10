package gm

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"karazhan/pkg/services"
	"karazhan/pkg/stats"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	_ "github.com/go-sql-driver/mysql"
)

var dbDSN = "cpo5704:584579@tcp(121.148.127.135:3306)/update"
var modulesPath = "E:\\server\\azerothcore-wotlk\\modules"

type Memo struct {
	ID          int    `json:"id"`
	ModuleName  string `json:"module_name"` // Empty for global
	UserName    string `json:"user_name"`
	Content     string `json:"content"`
	IsCompleted bool   `json:"is_completed"`
	IsPinned    bool   `json:"is_pinned"`
	CreatedAt   string `json:"created_at"`
}

type ModuleDetail struct {
	Info       *ModuleInfo `json:"info"`
	Memos      []Memo      `json:"memos"`
	ManualDesc string      `json:"manual_description"`
	RelatedURL string      `json:"related_url"`
}

type ToDo struct {
	ID           int    `json:"id"`
	Author       string `json:"author"`
	Participants string `json:"participants"`
	Content      string `json:"content"`
	TargetDate   string `json:"target_date"`
	IsCompleted  bool   `json:"is_completed"`
	CreatedAt    string `json:"created_at"`
}

type HomeSliderItem struct {
	ID         int    `json:"id"`
	Title      string `json:"title"`
	ImageURL   string `json:"image_url"`
	LinkURL    string `json:"link_url"`
	OrderIndex int    `json:"order_index"`
	IsActive   bool   `json:"is_active"`
	CreatedAt  string `json:"created_at"`
	UpdatedAt  string `json:"updated_at"`
}

func RegisterRoutes(mux *http.ServeMux) {
	initDB()
	ensureCalendarPermissionSeeds()

	mux.HandleFunc("/api/gm/modules", handleGetModules)
	mux.HandleFunc("/api/gm/modules/detail", handleGetModuleDetail)
	mux.HandleFunc("/api/gm/memos", handleGetMemos)          // Global memos
	mux.HandleFunc("/api/gm/memos/add", handleAddMemo)       // Add memo (global or module)
	mux.HandleFunc("/api/gm/memos/update", handleUpdateMemo) // Toggle complete/pin
	mux.HandleFunc("/api/gm/memos/delete", handleDeleteMemo)
	mux.HandleFunc("/api/gm/modules/link", handleUpdateModuleLink) // Set related URL/Desc

	// To-Do Routes
	mux.HandleFunc("/api/gm/todos", handleGetTodos)
	mux.HandleFunc("/api/gm/todos/add", handleAddTodo)
	mux.HandleFunc("/api/gm/todos/update", handleUpdateTodo)
	mux.HandleFunc("/api/gm/todos/delete", handleDeleteTodo)
	// Server Event Routes
	mux.HandleFunc("/api/gm/events/list", handleGetServerEvents) // GM View
	mux.HandleFunc("/api/gm/events/add", handleAddServerEvent)
	mux.HandleFunc("/api/gm/events/update", handleUpdateServerEvent)
	mux.HandleFunc("/api/gm/events/delete", handleDeleteServerEvent)
	// User Calendar Routes
	mux.HandleFunc("/api/calendar/events/list", handleGetUserCalendarEvents)
	mux.HandleFunc("/api/calendar/events/my", handleGetMyUserCalendarEvents)
	mux.HandleFunc("/api/calendar/events/add", handleAddUserCalendarEvent)
	mux.HandleFunc("/api/calendar/events/update", handleUpdateUserCalendarEvent)
	mux.HandleFunc("/api/calendar/events/delete", handleDeleteUserCalendarEvent)
	mux.HandleFunc("/api/calendar/characters/search", handleSearchCalendarCharacters)
	mux.HandleFunc("/api/home/slider/list", handleGetHomeSliderPublic)
	mux.HandleFunc("/api/gm/home-slider/list", handleGetHomeSliderAdmin)
	mux.HandleFunc("/api/gm/home-slider/save", handleSaveHomeSliderAdmin)
	mux.HandleFunc("/api/gm/home-slider/delete", handleDeleteHomeSliderAdmin)
	mux.HandleFunc("/api/gm/home-slider/upload", handleUploadHomeSliderImage)
}

func initDB() {
	db, err := sql.Open("mysql", dbDSN)
	if err != nil {
		log.Printf("[GM] DB Connection Error: %v", err)
		return
	}
	defer db.Close()

	queries := []string{
		`CREATE TABLE IF NOT EXISTS gm_module_info (
			id INT AUTO_INCREMENT PRIMARY KEY,
			module_name VARCHAR(255) NOT NULL UNIQUE,
			display_name VARCHAR(255),
			manual_description TEXT,
			related_url VARCHAR(255),
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS gm_memos (
			id INT AUTO_INCREMENT PRIMARY KEY,
			module_name VARCHAR(255) DEFAULT NULL,
			user_name VARCHAR(100),
			content TEXT,
			is_completed BOOLEAN DEFAULT FALSE,
			is_pinned BOOLEAN DEFAULT FALSE,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (module_name) REFERENCES gm_module_info(module_name) ON DELETE CASCADE
		)`,
		`CREATE TABLE IF NOT EXISTS gm_todos (
			id INT AUTO_INCREMENT PRIMARY KEY,
			author VARCHAR(100),
			participants VARCHAR(255),
			content TEXT,
			target_date DATE,
			is_completed BOOLEAN DEFAULT FALSE,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS server_events (
			id INT AUTO_INCREMENT PRIMARY KEY,
			title VARCHAR(255),
			category VARCHAR(60) DEFAULT '',
			participants TEXT,
			content TEXT,
			target_date DATE,
			end_date DATE NULL,
			start_time TIME,
			end_time TIME,
			author VARCHAR(100),
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS home_sliders (
			id INT AUTO_INCREMENT PRIMARY KEY,
			title VARCHAR(255) NOT NULL DEFAULT '',
			image_url VARCHAR(700) NOT NULL,
			link_url VARCHAR(700) NOT NULL DEFAULT '',
			order_index INT NOT NULL DEFAULT 0,
			is_active TINYINT(1) NOT NULL DEFAULT 1,
			is_deleted TINYINT(1) NOT NULL DEFAULT 0,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
		)`,
	}

	for _, q := range queries {
		if _, err := db.Exec(q); err != nil {
			log.Printf("[GM] Table Init Error: %v", err)
		}
	}

	// Soft Delete Migrations (Ignore errors if column exists)
	db.Exec("ALTER TABLE gm_todos ADD COLUMN is_deleted BOOLEAN DEFAULT 0")
	db.Exec("ALTER TABLE server_events ADD COLUMN is_deleted BOOLEAN DEFAULT 0")
	db.Exec("ALTER TABLE server_events ADD COLUMN category VARCHAR(60) DEFAULT ''")
	db.Exec("ALTER TABLE server_events ADD COLUMN participants TEXT")
	db.Exec("ALTER TABLE server_events ADD COLUMN end_date DATE NULL")
	db.Exec("UPDATE server_events SET end_date = target_date WHERE end_date IS NULL")
	db.Exec("ALTER TABLE home_sliders ADD COLUMN is_deleted TINYINT(1) NOT NULL DEFAULT 0")
}

// ... (Existing Modules/Memos Handlers) ...

// --- Server Events Handlers ---

type ServerEvent struct {
	ID               int                       `json:"id"`
	Title            string                    `json:"title"`
	Category         string                    `json:"category"`
	Participants     string                    `json:"participants"`
	ParticipantsMeta []CalendarParticipantInfo `json:"participants_meta,omitempty"`
	CanDelete        bool                      `json:"can_delete"`
	Content          string                    `json:"content"`
	TargetDate       string                    `json:"target_date"`
	EndDate          string                    `json:"end_date"`
	StartTime        string                    `json:"start_time"`
	EndTime          string                    `json:"end_time"`
	Author           string                    `json:"author"`
	CreatedAt        string                    `json:"created_at"`
}

type CalendarParticipantInfo struct {
	GUID  int    `json:"guid"`
	Name  string `json:"name"`
	Level int    `json:"level"`
	Race  int    `json:"race"`
	Class int    `json:"class"`
}

func handleGetServerEvents(w http.ResponseWriter, r *http.Request) {
	if !stats.CheckMenuPermission(w, r, "gm-events", "submenu") {
		return
	}

	db, _ := sql.Open("mysql", dbDSN)
	defer db.Close()

	var rows *sql.Rows
	var err error

	targetMonth := r.URL.Query().Get("month") // Format: YYYY-MM
	if targetMonth != "" {
		rows, err = db.Query("SELECT id, title, IFNULL(category, ''), IFNULL(participants, ''), content, target_date, IFNULL(end_date, target_date), IFNULL(start_time, ''), IFNULL(end_time, ''), author, created_at FROM server_events WHERE is_deleted = 0 AND (DATE_FORMAT(target_date, '%Y-%m') = ? OR DATE_FORMAT(IFNULL(end_date, target_date), '%Y-%m') = ?) ORDER BY target_date ASC, start_time ASC", targetMonth, targetMonth)
	} else {
		// Default: Recent 30 days + Future
		rows, err = db.Query("SELECT id, title, IFNULL(category, ''), IFNULL(participants, ''), content, target_date, IFNULL(end_date, target_date), IFNULL(start_time, ''), IFNULL(end_time, ''), author, created_at FROM server_events WHERE is_deleted = 0 AND IFNULL(end_date, target_date) >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) ORDER BY target_date ASC, start_time ASC")
	}

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var events []ServerEvent
	for rows.Next() {
		var e ServerEvent
		rows.Scan(&e.ID, &e.Title, &e.Category, &e.Participants, &e.Content, &e.TargetDate, &e.EndDate, &e.StartTime, &e.EndTime, &e.Author, &e.CreatedAt)
		events = append(events, e)
	}

	if events == nil {
		events = []ServerEvent{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(events)
}

func handleAddServerEvent(w http.ResponseWriter, r *http.Request) {
	if !stats.CheckMenuPermission(w, r, "gm-events", "submenu") {
		return
	}
	var e ServerEvent
	if err := json.NewDecoder(r.Body).Decode(&e); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Get Author
	cookie, err := r.Cookie("session_user")
	if err == nil && cookie.Value != "" {
		username := cookie.Value
		e.Author = username // Default

		// Try to resolve Main Character from user_profiles
		// 1. Get Account ID from Auth DB
		authDSN := "root:4618@tcp(localhost:3306)/acore_auth"
		authDB, err := sql.Open("mysql", authDSN)
		if err == nil {
			defer authDB.Close()
			var accountID int
			err = authDB.QueryRow("SELECT id FROM account WHERE username = ?", username).Scan(&accountID)
			if err == nil {
				// 2. Get Main Character Name from Update DB
				// dbDSN is already defined in this package for 'update' DB
				updateDB, err := sql.Open("mysql", dbDSN)
				if err == nil {
					defer updateDB.Close()
					var mainCharName string
					err = updateDB.QueryRow("SELECT main_char_name FROM user_profiles WHERE user_id = ?", accountID).Scan(&mainCharName)
					if err == nil && mainCharName != "" {
						e.Author = mainCharName
					}
				}
			}
		}
	}

	db, _ := sql.Open("mysql", dbDSN)
	defer db.Close()

	// Handle empty time strings as NULL if needed, or just let them be empty string/00:00:00
	// For simplicity, we store string. DB type TIME handles H:M:S.

	if strings.TrimSpace(e.EndDate) == "" {
		e.EndDate = e.TargetDate
	}
	res, err := db.Exec("INSERT INTO server_events (title, category, participants, content, target_date, end_date, start_time, end_time, author, is_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)",
		e.Title, e.Category, e.Participants, e.Content, e.TargetDate, e.EndDate, e.StartTime, e.EndTime, e.Author)

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	id, _ := res.LastInsertId()
	e.ID = int(id)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(e)
}

func handleUpdateServerEvent(w http.ResponseWriter, r *http.Request) {
	if !stats.CheckMenuPermission(w, r, "gm-events", "submenu") {
		return
	}
	var e ServerEvent
	if err := json.NewDecoder(r.Body).Decode(&e); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	db, _ := sql.Open("mysql", dbDSN)
	defer db.Close()

	if strings.TrimSpace(e.EndDate) == "" {
		e.EndDate = e.TargetDate
	}
	_, err := db.Exec("UPDATE server_events SET title=?, category=?, participants=?, content=?, target_date=?, end_date=?, start_time=?, end_time=? WHERE id=?",
		e.Title, e.Category, e.Participants, e.Content, e.TargetDate, e.EndDate, e.StartTime, e.EndTime, e.ID)

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}

func handleDeleteServerEvent(w http.ResponseWriter, r *http.Request) {
	if !stats.CheckMenuPermission(w, r, "gm-events", "submenu") {
		return
	}
	var req struct {
		ID int `json:"id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	db, _ := sql.Open("mysql", dbDSN)
	defer db.Close()

	// Soft Delete
	db.Exec("UPDATE server_events SET is_deleted = 1 WHERE id = ?", req.ID)
	w.WriteHeader(http.StatusOK)
}

func ensureCalendarPermissionSeeds() {
	db, err := sql.Open("mysql", dbDSN)
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
	_, _ = db.Exec(`CREATE TABLE IF NOT EXISTS web_role_permissions (
        resource_type VARCHAR(40) NOT NULL,
        resource_id VARCHAR(120) NOT NULL,
        resource_name VARCHAR(200) NOT NULL,
        rank_1 TINYINT(1) NOT NULL DEFAULT 1,
        rank_2 TINYINT(1) NOT NULL DEFAULT 1,
        rank_3 TINYINT(1) NOT NULL DEFAULT 1,
        order_index INT DEFAULT 0,
        PRIMARY KEY (resource_type, resource_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)

	_, _ = db.Exec(`INSERT IGNORE INTO web_menu_registry (id, type, name, order_index) VALUES ('calendar', 'menu', '캘린더', 14)`)
	_, _ = db.Exec(`UPDATE web_menu_registry SET name='캘린더', order_index=14 WHERE id='calendar'`)
	_, _ = db.Exec(`INSERT IGNORE INTO web_role_permissions (resource_type, resource_id, resource_name, rank_1, rank_2, rank_3, order_index) VALUES ('menu', 'calendar', '캘린더', 1, 1, 1, 14)`)
	_, _ = db.Exec(`UPDATE web_role_permissions SET resource_name='캘린더', rank_1=1, rank_2=1, rank_3=1, order_index=14 WHERE resource_type='menu' AND resource_id='calendar'`)

	_, _ = db.Exec(`INSERT IGNORE INTO web_role_permissions (resource_type, resource_id, resource_name, rank_1, rank_2, rank_3, order_index) VALUES ('submenu', 'calendar-write', '캘린더 일정 작성', 0, 1, 1, 141)`)
	_, _ = db.Exec(`UPDATE web_role_permissions SET resource_name='캘린더 일정 작성', rank_1=0, rank_2=1, rank_3=1, order_index=141 WHERE resource_type='submenu' AND resource_id='calendar-write'`)
	_, _ = db.Exec(`INSERT IGNORE INTO web_role_permissions (resource_type, resource_id, resource_name, rank_1, rank_2, rank_3, order_index) VALUES ('submenu', 'gm-home-slider', '홈슬라이더 관리', 0, 1, 1, 146)`)
	_, _ = db.Exec(`UPDATE web_role_permissions SET resource_name='홈슬라이더 관리', rank_1=0, rank_2=1, rank_3=1, order_index=146 WHERE resource_type='submenu' AND resource_id='gm-home-slider'`)
}

func handleGetHomeSliderPublic(w http.ResponseWriter, r *http.Request) {
	if !stats.CheckMenuPermission(w, r, "home") {
		return
	}
	db, err := sql.Open("mysql", dbDSN)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer db.Close()

	rows, err := db.Query(`SELECT id, IFNULL(title,''), IFNULL(image_url,''), IFNULL(link_url,''), IFNULL(order_index,0), IFNULL(is_active,0), created_at, updated_at
		FROM home_sliders
		WHERE is_deleted = 0 AND is_active = 1
		ORDER BY order_index ASC, id ASC`)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	out := make([]HomeSliderItem, 0)
	for rows.Next() {
		var item HomeSliderItem
		if err := rows.Scan(&item.ID, &item.Title, &item.ImageURL, &item.LinkURL, &item.OrderIndex, &item.IsActive, &item.CreatedAt, &item.UpdatedAt); err == nil {
			out = append(out, item)
		}
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(out)
}

func handleGetHomeSliderAdmin(w http.ResponseWriter, r *http.Request) {
	if !stats.CheckMenuPermission(w, r, "gm-home-slider", "submenu") {
		return
	}
	db, err := sql.Open("mysql", dbDSN)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer db.Close()

	rows, err := db.Query(`SELECT id, IFNULL(title,''), IFNULL(image_url,''), IFNULL(link_url,''), IFNULL(order_index,0), IFNULL(is_active,0), created_at, updated_at
		FROM home_sliders
		WHERE is_deleted = 0
		ORDER BY order_index ASC, id ASC`)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	out := make([]HomeSliderItem, 0)
	for rows.Next() {
		var item HomeSliderItem
		if err := rows.Scan(&item.ID, &item.Title, &item.ImageURL, &item.LinkURL, &item.OrderIndex, &item.IsActive, &item.CreatedAt, &item.UpdatedAt); err == nil {
			out = append(out, item)
		}
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(out)
}

func handleSaveHomeSliderAdmin(w http.ResponseWriter, r *http.Request) {
	if !stats.CheckMenuPermission(w, r, "gm-home-slider", "submenu") {
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req HomeSliderItem
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	req.Title = strings.TrimSpace(req.Title)
	req.ImageURL = strings.TrimSpace(req.ImageURL)
	req.LinkURL = strings.TrimSpace(req.LinkURL)
	if req.ImageURL == "" {
		http.Error(w, "image_url required", http.StatusBadRequest)
		return
	}

	db, err := sql.Open("mysql", dbDSN)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer db.Close()

	if req.ID > 0 {
		_, err = db.Exec(`UPDATE home_sliders
			SET title = ?, image_url = ?, link_url = ?, order_index = ?, is_active = ?
			WHERE id = ? AND is_deleted = 0`,
			req.Title, req.ImageURL, req.LinkURL, req.OrderIndex, req.IsActive, req.ID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	} else {
		res, err := db.Exec(`INSERT INTO home_sliders (title, image_url, link_url, order_index, is_active, is_deleted)
			VALUES (?, ?, ?, ?, ?, 0)`,
			req.Title, req.ImageURL, req.LinkURL, req.OrderIndex, req.IsActive)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		lastID, _ := res.LastInsertId()
		req.ID = int(lastID)
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"status": "success", "id": req.ID})
}

func handleDeleteHomeSliderAdmin(w http.ResponseWriter, r *http.Request) {
	if !stats.CheckMenuPermission(w, r, "gm-home-slider", "submenu") {
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		ID int `json:"id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if req.ID <= 0 {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}

	db, err := sql.Open("mysql", dbDSN)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer db.Close()

	if _, err := db.Exec("UPDATE home_sliders SET is_deleted = 1 WHERE id = ?", req.ID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"status": "success"})
}

func handleUploadHomeSliderImage(w http.ResponseWriter, r *http.Request) {
	if !stats.CheckMenuPermission(w, r, "gm-home-slider", "submenu") {
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if err := r.ParseMultipartForm(20 << 20); err != nil {
		http.Error(w, "invalid multipart form", http.StatusBadRequest)
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "file required", http.StatusBadRequest)
		return
	}
	defer file.Close()

	ext := strings.ToLower(filepath.Ext(header.Filename))
	switch ext {
	case ".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".bmp":
	default:
		http.Error(w, "unsupported image extension", http.StatusBadRequest)
		return
	}

	dateDir := time.Now().Format("20060102")
	targetDir := filepath.Join(".", "uploads", "home-slider", dateDir)
	if err := os.MkdirAll(targetDir, 0755); err != nil {
		http.Error(w, "failed to create upload dir", http.StatusInternalServerError)
		return
	}

	filename := fmt.Sprintf("slider_%d%s", time.Now().UnixNano(), ext)
	fullPath := filepath.Join(targetDir, filename)
	out, err := os.Create(fullPath)
	if err != nil {
		http.Error(w, "failed to create file", http.StatusInternalServerError)
		return
	}
	defer out.Close()

	if _, err := io.Copy(out, file); err != nil {
		http.Error(w, "failed to save file", http.StatusInternalServerError)
		return
	}

	publicURL := "/uploads/home-slider/" + dateDir + "/" + filename
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"status":    "success",
		"image_url": publicURL,
	})
}

func handleGetUserCalendarEvents(w http.ResponseWriter, r *http.Request) {
	if !stats.CheckMenuPermission(w, r, "calendar") {
		return
	}

	db, err := sql.Open("mysql", dbDSN)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer db.Close()

	targetMonth := strings.TrimSpace(r.URL.Query().Get("month"))
	var rows *sql.Rows
	if targetMonth != "" {
		rows, err = db.Query("SELECT id, title, IFNULL(category,''), IFNULL(participants,''), IFNULL(content,''), target_date, IFNULL(end_date, target_date), IFNULL(start_time,''), IFNULL(end_time,''), IFNULL(author,''), created_at FROM server_events WHERE is_deleted = 0 AND (DATE_FORMAT(target_date, '%Y-%m') = ? OR DATE_FORMAT(IFNULL(end_date,target_date), '%Y-%m') = ?) ORDER BY target_date ASC, start_time ASC", targetMonth, targetMonth)
	} else {
		rows, err = db.Query("SELECT id, title, IFNULL(category,''), IFNULL(participants,''), IFNULL(content,''), target_date, IFNULL(end_date, target_date), IFNULL(start_time,''), IFNULL(end_time,''), IFNULL(author,''), created_at FROM server_events WHERE is_deleted = 0 AND IFNULL(end_date, target_date) >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) ORDER BY target_date ASC, start_time ASC")
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	out := make([]ServerEvent, 0)
	for rows.Next() {
		var e ServerEvent
		if err := rows.Scan(&e.ID, &e.Title, &e.Category, &e.Participants, &e.Content, &e.TargetDate, &e.EndDate, &e.StartTime, &e.EndTime, &e.Author, &e.CreatedAt); err == nil {
			e.Author = normalizeCalendarStoredAuthor(e.Author)
			out = append(out, e)
		}
	}
	cookie, _ := r.Cookie("session_user")
	sessionUser := ""
	if cookie != nil {
		sessionUser = strings.TrimSpace(cookie.Value)
	}
	canDeleteAuthorSet := map[string]bool{}
	for _, v := range resolveCalendarAuthorCandidates(sessionUser) {
		key := strings.TrimSpace(v)
		if key != "" {
			canDeleteAuthorSet[key] = true
			nk := strings.TrimSpace(normalizeCalendarStoredAuthor(key))
			if nk != "" {
				canDeleteAuthorSet[nk] = true
			}
		}
	}
	for i := range out {
		author := strings.TrimSpace(out[i].Author)
		out[i].CanDelete = canDeleteAuthorSet[author]
	}
	attachCalendarParticipantsMeta(out)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(out)
}

func handleAddUserCalendarEvent(w http.ResponseWriter, r *http.Request) {
	if !stats.CheckMenuPermission(w, r, "calendar-write", "submenu") {
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var e ServerEvent
	if err := json.NewDecoder(r.Body).Decode(&e); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	e.Title = strings.TrimSpace(e.Title)
	e.Category = strings.TrimSpace(e.Category)
	e.TargetDate = strings.TrimSpace(e.TargetDate)
	e.EndDate = strings.TrimSpace(e.EndDate)
	e.StartTime = strings.TrimSpace(e.StartTime)
	e.EndTime = strings.TrimSpace(e.EndTime)
	e.Participants = strings.TrimSpace(e.Participants)
	if e.Title == "" || e.TargetDate == "" || e.Category == "" {
		http.Error(w, "제목/날짜/카테고리는 필수입니다.", http.StatusBadRequest)
		return
	}
	if e.EndDate == "" {
		e.EndDate = e.TargetDate
	}
	if !isValidCategoryForUserCalendar(e.Category) {
		http.Error(w, "카테고리는 자유, 레이드, 영던, 기타만 가능합니다.", http.StatusBadRequest)
		return
	}
	if (e.Category == "레이드" || e.Category == "영던") && e.Participants == "" {
		http.Error(w, "레이드/영던은 참여 캐릭터를 1명 이상 추가해야 합니다.", http.StatusBadRequest)
		return
	}
	if !isValidDateStr(e.TargetDate) || !isValidDateStr(e.EndDate) {
		http.Error(w, "날짜 형식이 올바르지 않습니다.", http.StatusBadRequest)
		return
	}
	if e.EndDate < e.TargetDate {
		http.Error(w, "종료일은 시작일보다 빠를 수 없습니다.", http.StatusBadRequest)
		return
	}
	if e.StartTime != "" && !isValidTimeStr(e.StartTime) {
		http.Error(w, "시작 시간 형식이 올바르지 않습니다.", http.StatusBadRequest)
		return
	}
	if e.EndTime != "" && !isValidTimeStr(e.EndTime) {
		http.Error(w, "종료 시간 형식이 올바르지 않습니다.", http.StatusBadRequest)
		return
	}

	cookie, _ := r.Cookie("session_user")
	e.Author = "SYSTEM"
	sessionUser := ""
	if cookie != nil && strings.TrimSpace(cookie.Value) != "" {
		sessionUser = strings.TrimSpace(cookie.Value)
	}
	e.Author = resolveCalendarAuthorDisplayName(sessionUser)
	if strings.TrimSpace(e.StartTime) == "" {
		e.StartTime = "00:00:00"
	}
	if strings.TrimSpace(e.EndTime) == "" {
		e.EndTime = "00:00:00"
	}

	db, err := sql.Open("mysql", dbDSN)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer db.Close()

	res, err := db.Exec("INSERT INTO server_events (title, category, participants, content, target_date, end_date, start_time, end_time, author, is_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)",
		e.Title, e.Category, e.Participants, e.Content, e.TargetDate, e.EndDate, e.StartTime, e.EndTime, e.Author)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	id, _ := res.LastInsertId()
	e.ID = int(id)

	// Notify selected participants for raid/heroic schedules.
	notifyCalendarParticipants(db, e, sessionUser)

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(e)
}

func handleGetMyUserCalendarEvents(w http.ResponseWriter, r *http.Request) {
	if !stats.CheckMenuPermission(w, r, "calendar") {
		return
	}
	cookie, _ := r.Cookie("session_user")
	sessionUser := ""
	if cookie != nil {
		sessionUser = strings.TrimSpace(cookie.Value)
	}
	if sessionUser == "" {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	candidates := resolveCalendarAuthorCandidates(sessionUser)
	if len(candidates) == 0 {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode([]ServerEvent{})
		return
	}

	db, err := sql.Open("mysql", dbDSN)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer db.Close()

	placeholders := make([]string, len(candidates))
	args := make([]interface{}, 0, len(candidates))
	for i, v := range candidates {
		placeholders[i] = "?"
		args = append(args, strings.TrimSpace(v))
	}
	query := "SELECT id, title, IFNULL(category,''), IFNULL(participants,''), IFNULL(content,''), target_date, IFNULL(end_date, target_date), IFNULL(start_time,''), IFNULL(end_time,''), IFNULL(author,''), created_at FROM server_events WHERE is_deleted = 0 AND author IN (" + strings.Join(placeholders, ",") + ") ORDER BY target_date DESC, start_time DESC, id DESC LIMIT 500"
	rows, err := db.Query(query, args...)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	out := make([]ServerEvent, 0)
	canDeleteAuthorSet := map[string]bool{}
	for _, v := range candidates {
		key := strings.TrimSpace(v)
		if key != "" {
			canDeleteAuthorSet[key] = true
			nk := strings.TrimSpace(normalizeCalendarStoredAuthor(key))
			if nk != "" {
				canDeleteAuthorSet[nk] = true
			}
		}
	}
	for rows.Next() {
		var e ServerEvent
		if err := rows.Scan(&e.ID, &e.Title, &e.Category, &e.Participants, &e.Content, &e.TargetDate, &e.EndDate, &e.StartTime, &e.EndTime, &e.Author, &e.CreatedAt); err == nil {
			e.Author = normalizeCalendarStoredAuthor(e.Author)
			e.CanDelete = canDeleteAuthorSet[strings.TrimSpace(e.Author)]
			out = append(out, e)
		}
	}
	attachCalendarParticipantsMeta(out)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(out)
}

func handleUpdateUserCalendarEvent(w http.ResponseWriter, r *http.Request) {
	if !stats.CheckMenuPermission(w, r, "calendar-write", "submenu") {
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	cookie, _ := r.Cookie("session_user")
	sessionUser := ""
	if cookie != nil {
		sessionUser = strings.TrimSpace(cookie.Value)
	}
	if sessionUser == "" {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var e ServerEvent
	if err := json.NewDecoder(r.Body).Decode(&e); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if e.ID <= 0 {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	e.Title = strings.TrimSpace(e.Title)
	e.Category = strings.TrimSpace(e.Category)
	e.TargetDate = strings.TrimSpace(e.TargetDate)
	e.EndDate = strings.TrimSpace(e.EndDate)
	e.StartTime = strings.TrimSpace(e.StartTime)
	e.EndTime = strings.TrimSpace(e.EndTime)
	e.Participants = strings.TrimSpace(e.Participants)
	if e.Title == "" || e.TargetDate == "" || e.Category == "" {
		http.Error(w, "title/date/category required", http.StatusBadRequest)
		return
	}
	if e.EndDate == "" {
		e.EndDate = e.TargetDate
	}
	if !isValidCategoryForUserCalendar(e.Category) {
		http.Error(w, "invalid category", http.StatusBadRequest)
		return
	}
	if (e.Category == "레이드" || e.Category == "영던") && e.Participants == "" {
		http.Error(w, "participants required", http.StatusBadRequest)
		return
	}
	if !isValidDateStr(e.TargetDate) || !isValidDateStr(e.EndDate) {
		http.Error(w, "invalid date", http.StatusBadRequest)
		return
	}
	if e.EndDate < e.TargetDate {
		http.Error(w, "invalid end date", http.StatusBadRequest)
		return
	}
	if e.StartTime != "" && !isValidTimeStr(e.StartTime) {
		http.Error(w, "invalid start time", http.StatusBadRequest)
		return
	}
	if e.EndTime != "" && !isValidTimeStr(e.EndTime) {
		http.Error(w, "invalid end time", http.StatusBadRequest)
		return
	}
	if e.StartTime == "" {
		e.StartTime = "00:00:00"
	}
	if e.EndTime == "" {
		e.EndTime = "00:00:00"
	}

	db, err := sql.Open("mysql", dbDSN)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer db.Close()

	var author string
	if err := db.QueryRow("SELECT IFNULL(author,'') FROM server_events WHERE id = ? AND is_deleted = 0", e.ID).Scan(&author); err != nil {
		if err == sql.ErrNoRows {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	allowed := map[string]bool{}
	for _, v := range resolveCalendarAuthorCandidates(sessionUser) {
		key := strings.TrimSpace(v)
		if key != "" {
			allowed[key] = true
		}
	}
	if !allowed[strings.TrimSpace(author)] {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	if _, err := db.Exec("UPDATE server_events SET title=?, category=?, participants=?, content=?, target_date=?, end_date=?, start_time=?, end_time=? WHERE id=? AND is_deleted = 0",
		e.Title, e.Category, e.Participants, e.Content, e.TargetDate, e.EndDate, e.StartTime, e.EndTime, e.ID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"status": "success"})
}

func handleDeleteUserCalendarEvent(w http.ResponseWriter, r *http.Request) {
	if !stats.CheckMenuPermission(w, r, "calendar-write", "submenu") {
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	cookie, _ := r.Cookie("session_user")
	sessionUser := ""
	if cookie != nil {
		sessionUser = strings.TrimSpace(cookie.Value)
	}
	if sessionUser == "" {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		ID int `json:"id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if req.ID <= 0 {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}

	db, err := sql.Open("mysql", dbDSN)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer db.Close()

	var author string
	if err := db.QueryRow("SELECT IFNULL(author,'') FROM server_events WHERE id = ? AND is_deleted = 0", req.ID).Scan(&author); err != nil {
		if err == sql.ErrNoRows {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	allowed := map[string]bool{}
	for _, v := range resolveCalendarAuthorCandidates(sessionUser) {
		key := strings.TrimSpace(v)
		if key != "" {
			allowed[key] = true
		}
	}
	if !allowed[strings.TrimSpace(author)] {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	if _, err := db.Exec("UPDATE server_events SET is_deleted = 1 WHERE id = ? AND is_deleted = 0", req.ID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"status": "success"})
}

var timeRe = regexp.MustCompile(`^\d{2}:\d{2}:\d{2}$`)
var digitsRe = regexp.MustCompile(`^\d+$`)

func isValidDateStr(v string) bool {
	_, err := time.Parse("2006-01-02", strings.TrimSpace(v))
	return err == nil
}

func isValidTimeStr(v string) bool {
	return timeRe.MatchString(strings.TrimSpace(v))
}

func isValidCategoryForUserCalendar(v string) bool {
	switch strings.TrimSpace(v) {
	case "자유", "레이드", "영던", "기타":
		return true
	default:
		return false
	}
}

func handleSearchCalendarCharacters(w http.ResponseWriter, r *http.Request) {
	if !stats.CheckMenuPermission(w, r, "calendar-write", "submenu") {
		return
	}
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if q == "" {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode([]map[string]interface{}{})
		return
	}

	charDB, err := sql.Open("mysql", "root:4618@tcp(localhost:3306)/acore_characters")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer charDB.Close()

	rows, err := charDB.Query(`
		SELECT guid, name, level, race, class
		FROM characters
		WHERE name LIKE ?
		ORDER BY name ASC
		LIMIT 30
	`, "%"+q+"%")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	out := make([]map[string]interface{}, 0, 30)
	for rows.Next() {
		var guid, level, race, class int
		var name string
		if err := rows.Scan(&guid, &name, &level, &race, &class); err == nil {
			out = append(out, map[string]interface{}{
				"guid":  guid,
				"name":  name,
				"level": level,
				"race":  race,
				"class": class,
			})
		}
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(out)
}

func resolveCalendarAuthorDisplayName(sessionUser string) string {
	sessionUser = strings.TrimSpace(sessionUser)
	if sessionUser == "" {
		return "SYSTEM"
	}

	authDB, err := sql.Open("mysql", "root:4618@tcp(localhost:3306)/acore_auth")
	if err != nil {
		return sessionUser
	}
	defer authDB.Close()

	var accountID int
	if err := authDB.QueryRow("SELECT id FROM account WHERE UPPER(username) = UPPER(?)", sessionUser).Scan(&accountID); err != nil || accountID <= 0 {
		return sessionUser
	}
	if name := resolveMainCharNameByUserID(accountID); strings.TrimSpace(name) != "" {
		return strings.TrimSpace(name)
	}
	return strconv.Itoa(accountID)
}

func resolveMainCharNameByUserID(accountID int) string {
	if accountID <= 0 {
		return ""
	}
	updateDB, err := sql.Open("mysql", dbDSN)
	if err != nil {
		return ""
	}
	defer updateDB.Close()

	var mainCharName string
	var mainCharGUID int
	if err := updateDB.QueryRow("SELECT IFNULL(main_char_name, ''), IFNULL(main_char_guid, 0) FROM user_profiles WHERE user_id = ?", accountID).Scan(&mainCharName, &mainCharGUID); err == nil {
		mainCharName = strings.TrimSpace(mainCharName)
		if mainCharName != "" {
			return mainCharName
		}
		if mainCharGUID > 0 {
			if fromGUID := resolveCharacterNameByGUID(mainCharGUID); strings.TrimSpace(fromGUID) != "" {
				return strings.TrimSpace(fromGUID)
			}
		}
	}
	return ""
}

func resolveCharacterNameByGUID(guid int) string {
	if guid <= 0 {
		return ""
	}
	charDB, err := sql.Open("mysql", "root:4618@tcp(localhost:3306)/acore_characters")
	if err != nil {
		return ""
	}
	defer charDB.Close()
	var name string
	if err := charDB.QueryRow("SELECT IFNULL(name,'') FROM characters WHERE guid = ?", guid).Scan(&name); err != nil {
		return ""
	}
	return strings.TrimSpace(name)
}

func normalizeCalendarStoredAuthor(author string) string {
	v := strings.TrimSpace(author)
	if v == "" {
		return "SYSTEM"
	}
	if strings.EqualFold(v, "SYSTEM") {
		return "SYSTEM"
	}
	if digitsRe.MatchString(v) {
		if uid, err := strconv.Atoi(v); err == nil && uid > 0 {
			if name := resolveMainCharNameByUserID(uid); strings.TrimSpace(name) != "" {
				return strings.TrimSpace(name)
			}
		}
		return v
	}
	// Username/other identifier path
	if name := resolveCalendarAuthorDisplayName(v); strings.TrimSpace(name) != "" && !digitsRe.MatchString(strings.TrimSpace(name)) {
		return strings.TrimSpace(name)
	}
	return v
}

func resolveCalendarAuthorCandidates(sessionUser string) []string {
	out := make([]string, 0, 8)
	seen := map[string]bool{}
	add := func(v string) {
		s := strings.TrimSpace(v)
		if s == "" || seen[s] {
			return
		}
		seen[s] = true
		out = append(out, s)
	}

	sessionUser = strings.TrimSpace(sessionUser)
	add(sessionUser)
	add(resolveCalendarAuthorDisplayName(sessionUser))
	if sessionUser == "" {
		return out
	}

	authDB, err := sql.Open("mysql", "root:4618@tcp(localhost:3306)/acore_auth")
	if err != nil {
		return out
	}
	defer authDB.Close()

	var accountID int
	if err := authDB.QueryRow("SELECT id FROM account WHERE UPPER(username) = UPPER(?)", sessionUser).Scan(&accountID); err != nil || accountID <= 0 {
		return out
	}
	add(strconv.Itoa(accountID))

	updateDB, err := sql.Open("mysql", dbDSN)
	if err == nil {
		defer updateDB.Close()
		var mainCharName string
		if err := updateDB.QueryRow("SELECT IFNULL(main_char_name, '') FROM user_profiles WHERE user_id = ?", accountID).Scan(&mainCharName); err == nil {
			add(mainCharName)
		}
	}

	charDB, err := sql.Open("mysql", "root:4618@tcp(localhost:3306)/acore_characters")
	if err == nil {
		defer charDB.Close()
		rows, err := charDB.Query("SELECT name FROM characters WHERE account = ? LIMIT 300", accountID)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var charName string
				if rows.Scan(&charName) == nil {
					add(charName)
				}
			}
		}
	}
	return out
}

func parseParticipantNames(raw string) []string {
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	seen := map[string]bool{}
	for _, p := range parts {
		name := strings.TrimSpace(p)
		if name == "" {
			continue
		}
		key := strings.ToLower(name)
		if seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, name)
	}
	return out
}

func attachCalendarParticipantsMeta(events []ServerEvent) {
	if len(events) == 0 {
		return
	}
	uniqueByLower := map[string]string{}
	for _, e := range events {
		for _, name := range parseParticipantNames(e.Participants) {
			lower := strings.ToLower(strings.TrimSpace(name))
			if lower == "" {
				continue
			}
			if _, exists := uniqueByLower[lower]; !exists {
				uniqueByLower[lower] = name
			}
		}
	}
	if len(uniqueByLower) == 0 {
		return
	}

	names := make([]string, 0, len(uniqueByLower))
	for _, original := range uniqueByLower {
		names = append(names, original)
	}

	charDB, err := sql.Open("mysql", "root:4618@tcp(localhost:3306)/acore_characters")
	if err != nil {
		return
	}
	defer charDB.Close()

	placeholders := make([]string, len(names))
	args := make([]interface{}, 0, len(names))
	for i, n := range names {
		placeholders[i] = "?"
		args = append(args, n)
	}

	query := "SELECT guid, name, level, race, class FROM characters WHERE name IN (" + strings.Join(placeholders, ",") + ")"
	rows, err := charDB.Query(query, args...)
	if err != nil {
		return
	}
	defer rows.Close()

	metaMap := map[string]CalendarParticipantInfo{}
	for rows.Next() {
		var p CalendarParticipantInfo
		if err := rows.Scan(&p.GUID, &p.Name, &p.Level, &p.Race, &p.Class); err == nil {
			key := strings.ToLower(strings.TrimSpace(p.Name))
			if key != "" {
				metaMap[key] = p
			}
		}
	}

	for i := range events {
		names := parseParticipantNames(events[i].Participants)
		if len(names) == 0 {
			continue
		}
		meta := make([]CalendarParticipantInfo, 0, len(names))
		for _, n := range names {
			key := strings.ToLower(strings.TrimSpace(n))
			if v, ok := metaMap[key]; ok {
				meta = append(meta, v)
			} else {
				meta = append(meta, CalendarParticipantInfo{Name: n})
			}
		}
		events[i].ParticipantsMeta = meta
	}
}

func notifyCalendarParticipants(updateDB *sql.DB, e ServerEvent, sessionUser string) {
	if updateDB == nil {
		return
	}
	names := parseParticipantNames(e.Participants)
	if len(names) == 0 {
		return
	}

	charDB, err := sql.Open("mysql", "root:4618@tcp(localhost:3306)/acore_characters")
	if err != nil {
		return
	}
	defer charDB.Close()

	placeholders := make([]string, len(names))
	args := make([]interface{}, 0, len(names))
	for i, n := range names {
		placeholders[i] = "?"
		args = append(args, n)
	}

	query := "SELECT DISTINCT account, name FROM characters WHERE name IN (" + strings.Join(placeholders, ",") + ")"
	rows, err := charDB.Query(query, args...)
	if err != nil {
		return
	}
	defer rows.Close()

	targets := map[int]string{}
	for rows.Next() {
		var accountID int
		var charName string
		if err := rows.Scan(&accountID, &charName); err == nil && accountID > 0 {
			targets[accountID] = charName
		}
	}
	if len(targets) == 0 {
		return
	}

	sender := resolveCalendarAuthorDisplayName(sessionUser)
	ns := services.NewNotificationService(updateDB)
	for userID, charName := range targets {
		title := "캘린더 일정 참여 알림"
		msg := "일정 [" + e.Title + "]에 참여자로 등록되었습니다."
		if strings.TrimSpace(charName) != "" {
			msg = "캐릭터 [" + charName + "]이 일정 [" + e.Title + "]에 참여자로 등록되었습니다."
		}
		_ = ns.CreateNotification(userID, "admin_msg", title, msg, "", sender)
	}
}

// ... request handler functions ...

func handleGetModules(w http.ResponseWriter, r *http.Request) {
	if !stats.CheckMenuPermission(w, r, "gm-modules", "submenu") {
		log.Println("[GM] Permission denied for user")
		return
	}

	// 1. Scan Files
	log.Printf("[GM] Scanning modules at: %s", modulesPath)
	scannedModules, err := ScanModules(modulesPath)
	if err != nil {
		log.Printf("[GM] Scan error: %v", err)
		http.Error(w, "Failed to scan modules: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Ensure we return [] not null if empty
	if scannedModules == nil {
		scannedModules = make([]*ModuleInfo, 0)
	}

	log.Printf("[GM] Found %d modules", len(scannedModules))

	// 2. Scan DB for extra info (ensure all exist in DB)
	db, err := sql.Open("mysql", dbDSN)
	if err != nil {
		log.Printf("[GM] DB open error: %v", err)
	} else {
		defer db.Close()
		for _, mod := range scannedModules {
			// Insert ignore to ensure existence
			_, err := db.Exec("INSERT IGNORE INTO gm_module_info (module_name) VALUES (?)", mod.Name)
			if err != nil {
				log.Printf("[GM] DB insert error for %s: %v", mod.Name, err)
			}
		}
	}

	// 3. Return list
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(scannedModules)
}

func handleGetModuleDetail(w http.ResponseWriter, r *http.Request) {
	if !stats.CheckMenuPermission(w, r, "gm-modules", "submenu") {
		return
	}
	moduleName := r.URL.Query().Get("name")
	if moduleName == "" {
		http.Error(w, "Module name required", http.StatusBadRequest)
		return
	}

	// Scan specific module directory again to get full tree/SQL (or reuse cache if we implemented one)
	// For now, re-scanning the specific folder is fast enough.
	modPath := filepath.Join(modulesPath, moduleName)
	scannedInfo := scanSingleModule(modPath, moduleName)

	db, _ := sql.Open("mysql", dbDSN)
	defer db.Close()

	// Get DB Info
	var manualDesc, relatedURL sql.NullString
	db.QueryRow("SELECT manual_description, related_url FROM gm_module_info WHERE module_name = ?", moduleName).Scan(&manualDesc, &relatedURL)

	// Get Memos
	rows, _ := db.Query("SELECT id, user_name, content, is_completed, is_pinned, created_at FROM gm_memos WHERE module_name = ? ORDER BY is_pinned DESC, created_at DESC", moduleName)
	var memos []Memo
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			var m Memo
			m.ModuleName = moduleName
			rows.Scan(&m.ID, &m.UserName, &m.Content, &m.IsCompleted, &m.IsPinned, &m.CreatedAt)
			memos = append(memos, m)
		}
	}

	detail := ModuleDetail{
		Info:       scannedInfo,
		Memos:      memos,
		ManualDesc: manualDesc.String,
		RelatedURL: relatedURL.String,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(detail)
}

func handleGetMemos(w http.ResponseWriter, r *http.Request) {
	if !stats.CheckMenuPermission(w, r, "gm-memos", "submenu") {
		return
	}
	db, _ := sql.Open("mysql", dbDSN)
	defer db.Close()

	rows, err := db.Query("SELECT id, module_name, user_name, content, is_completed, is_pinned, created_at FROM gm_memos WHERE module_name IS NULL ORDER BY is_pinned DESC, created_at DESC")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var memos []Memo
	for rows.Next() {
		var m Memo
		var modName sql.NullString
		rows.Scan(&m.ID, &modName, &m.UserName, &m.Content, &m.IsCompleted, &m.IsPinned, &m.CreatedAt)
		m.ModuleName = modName.String
		memos = append(memos, m)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(memos)
}

func handleAddMemo(w http.ResponseWriter, r *http.Request) {
	if !stats.CheckMenuPermission(w, r, "gm-memos", "submenu") {
		return
	}
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var m Memo
	if err := json.NewDecoder(r.Body).Decode(&m); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Get User from Cookie
	cookie, err := r.Cookie("session_user")
	if err == nil && cookie.Value != "" {
		m.UserName = cookie.Value
	} else {
		m.UserName = "Anonymous"
	}

	db, _ := sql.Open("mysql", dbDSN)
	defer db.Close()

	var res sql.Result
	if m.ModuleName != "" {
		res, err = db.Exec("INSERT INTO gm_memos (module_name, user_name, content, is_pinned) VALUES (?, ?, ?, ?)", m.ModuleName, m.UserName, m.Content, m.IsPinned)
	} else {
		res, err = db.Exec("INSERT INTO gm_memos (module_name, user_name, content, is_pinned) VALUES (NULL, ?, ?, ?)", m.UserName, m.Content, m.IsPinned)
	}

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	id, _ := res.LastInsertId()
	m.ID = int(id)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(m)
}

func handleUpdateMemo(w http.ResponseWriter, r *http.Request) {
	if !stats.CheckMenuPermission(w, r, "gm-memos", "submenu") {
		return
	}
	// Logic for toggling complete or pinning
	var req struct {
		ID     int    `json:"id"`
		Action string `json:"action"` // "complete", "pin", "delete"
		Value  bool   `json:"value"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	db, _ := sql.Open("mysql", dbDSN)
	defer db.Close()

	if req.Action == "complete" {
		db.Exec("UPDATE gm_memos SET is_completed = ? WHERE id = ?", req.Value, req.ID)
	} else if req.Action == "pin" {
		db.Exec("UPDATE gm_memos SET is_pinned = ? WHERE id = ?", req.Value, req.ID)
	}

	w.WriteHeader(http.StatusOK)
}

func handleDeleteMemo(w http.ResponseWriter, r *http.Request) {
	if !stats.CheckMenuPermission(w, r, "gm-memos", "submenu") {
		return
	}
	var req struct {
		ID int `json:"id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	db, _ := sql.Open("mysql", dbDSN)
	defer db.Close()

	db.Exec("DELETE FROM gm_memos WHERE id = ?", req.ID)
	w.WriteHeader(http.StatusOK)
}

func handleUpdateModuleLink(w http.ResponseWriter, r *http.Request) {
	if !stats.CheckMenuPermission(w, r, "gm-modules", "submenu") {
		return
	}
	var req struct {
		ModuleName string `json:"module_name"`
		RelatedURL string `json:"related_url"`
		ManualDesc string `json:"manual_description"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	db, _ := sql.Open("mysql", dbDSN)
	defer db.Close()

	_, err := db.Exec("UPDATE gm_module_info SET related_url = ?, manual_description = ? WHERE module_name = ?", req.RelatedURL, req.ManualDesc, req.ModuleName)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}

func handleGetTodos(w http.ResponseWriter, r *http.Request) {
	if !stats.CheckMenuPermission(w, r, "gm-todos", "submenu") {
		return
	}

	db, _ := sql.Open("mysql", dbDSN)
	defer db.Close()

	var rows *sql.Rows
	var err error

	targetDate := r.URL.Query().Get("date")
	targetMonth := r.URL.Query().Get("month") // Format: YYYY-MM

	if targetDate != "" {
		rows, err = db.Query("SELECT id, author, participants, content, target_date, is_completed, created_at FROM gm_todos WHERE is_deleted = 0 AND target_date = ? ORDER BY is_completed ASC, created_at DESC", targetDate)
	} else if targetMonth != "" {
		// Fetch all todos for the month
		rows, err = db.Query("SELECT id, author, participants, content, target_date, is_completed, created_at FROM gm_todos WHERE is_deleted = 0 AND DATE_FORMAT(target_date, '%Y-%m') = ? ORDER BY target_date ASC, created_at ASC", targetMonth)
	} else {
		http.Error(w, "Date or Month required", http.StatusBadRequest)
		return
	}

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var todos []ToDo
	for rows.Next() {
		var t ToDo
		rows.Scan(&t.ID, &t.Author, &t.Participants, &t.Content, &t.TargetDate, &t.IsCompleted, &t.CreatedAt)
		todos = append(todos, t)
	}

	// Ensure empty array instead of null
	if todos == nil {
		todos = []ToDo{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(todos)
}

func handleAddTodo(w http.ResponseWriter, r *http.Request) {
	if !stats.CheckMenuPermission(w, r, "gm-todos", "submenu") {
		return
	}
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var t ToDo
	if err := json.NewDecoder(r.Body).Decode(&t); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	db, _ := sql.Open("mysql", dbDSN)
	defer db.Close()

	res, err := db.Exec("INSERT INTO gm_todos (author, participants, content, target_date) VALUES (?, ?, ?, ?)", t.Author, t.Participants, t.Content, t.TargetDate)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	id, _ := res.LastInsertId()
	t.ID = int(id)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(t)
}

func handleUpdateTodo(w http.ResponseWriter, r *http.Request) {
	if !stats.CheckMenuPermission(w, r, "gm-todos", "submenu") {
		return
	}
	var req struct {
		ID     int  `json:"id"`
		Status bool `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	db, _ := sql.Open("mysql", dbDSN)
	defer db.Close()

	db.Exec("UPDATE gm_todos SET is_completed = ? WHERE id = ?", req.Status, req.ID)
	w.WriteHeader(http.StatusOK)
}

func handleDeleteTodo(w http.ResponseWriter, r *http.Request) {
	if !stats.CheckMenuPermission(w, r, "gm-todos", "submenu") {
		return
	}
	var req struct {
		ID int `json:"id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	db, _ := sql.Open("mysql", dbDSN)
	defer db.Close()

	db.Exec("DELETE FROM gm_todos WHERE id = ?", req.ID)
	w.WriteHeader(http.StatusOK)
}
