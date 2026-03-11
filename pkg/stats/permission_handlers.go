package stats

import (
	"database/sql"
	"encoding/json"
	"karazhan/pkg/auth"
	"karazhan/pkg/config"
	"log"
	"net/http"
	"strconv"

	_ "github.com/go-sql-driver/mysql"
)

// Menu Permission Structure
type MenuPermission struct {
	MenuID      string `json:"menu_id"`
	MinWebRank  int    `json:"min_web_rank"`
	Description string `json:"description"`
}

// Handle Get Menu Permissions
func handleMenuMetadata(w http.ResponseWriter, r *http.Request) {
	log.Printf("[MenuMetadata] Request received from IP: %s", r.RemoteAddr)
	// Authorization Check (Admin only, level 3)
	if !checkAdminAuth(w, r, 3) {
		log.Printf("[MenuMetadata] Admin Auth Failed")
		return
	}
	log.Printf("[MenuMetadata] Admin Auth Success")

	log.Printf("[MenuMetadata] Connecting to Auth DB...")
	authDSN := config.AuthDSN()
	authDB, err := sql.Open("mysql", authDSN)
	if err != nil {
		log.Printf("[MenuMetadata] sql.Open Error: %v", err)
		http.Error(w, "Auth DB Connection Error", http.StatusInternalServerError)
		return
	}
	defer authDB.Close()

	log.Printf("[MenuMetadata] Querying web_menu_permissions with IFNULL for description...")
	rows, err := authDB.Query("SELECT menu_id, min_web_rank, IFNULL(description, '') FROM web_menu_permissions")
	if err != nil {
		log.Printf("[MenuPermissions] Query Error: %v", err)
		http.Error(w, "Query Error: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var permissions []MenuPermission
	for rows.Next() {
		var p MenuPermission
		if err := rows.Scan(&p.MenuID, &p.MinWebRank, &p.Description); err != nil {
			log.Printf("[MenuMetadata] Scan Error for row: %v", err)
			continue
		}
		permissions = append(permissions, p)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":      "success",
		"permissions": permissions,
	})
}

// Handle Update Menu Permission
func handleUpdateMenuPermission(w http.ResponseWriter, r *http.Request) {
	// Authorization Check (Admin only, level 3)
	if !checkAdminAuth(w, r, 3) {
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	menuID := r.FormValue("menu_id")
	levelStr := r.FormValue("min_web_rank")

	if menuID == "" || levelStr == "" {
		http.Error(w, "Missing parameters", http.StatusBadRequest)
		return
	}

	level, err := strconv.Atoi(levelStr)
	if err != nil {
		http.Error(w, "Invalid level", http.StatusBadRequest)
		return
	}

	authDSN := config.AuthDSN()
	authDB, err := sql.Open("mysql", authDSN)
	if err != nil {
		http.Error(w, "Auth DB Connection Error", http.StatusInternalServerError)
		return
	}
	defer authDB.Close()

	_, err = authDB.Exec("UPDATE web_menu_permissions SET min_web_rank = ? WHERE menu_id = ?", level, menuID)
	if err != nil {
		log.Printf("[MenuPermissions] Update Error: %v", err)
		http.Error(w, "Update Error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status":  "success",
		"message": "Permission updated",
	})
}

// CheckMenuPermission validates if the current user has access to the specified menu.
// resourceType is optional, defaults to "menu" if empty
func CheckMenuPermission(w http.ResponseWriter, r *http.Request, menuID string, resourceType ...string) bool {
	cookie, err := r.Cookie("session_user")
	if err != nil || cookie.Value == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"status": "unauthorized", "message": "로그인이 필요합니다."})
		return false
	}
	username := cookie.Value

	authDSN := config.AuthDSN()
	authDB, err := sql.Open("mysql", authDSN)
	if err != nil {
		log.Printf("Auth DB Conn Error: %v", err)
		return false
	}
	defer authDB.Close()

	var userID int
	err = authDB.QueryRow("SELECT id FROM account WHERE UPPER(TRIM(username)) = UPPER(TRIM(?))", username).Scan(&userID)
	if err != nil {
		return false
	}

	webRank := 0
	updateDB, err := sql.Open("mysql", updateDSN)
	if err == nil {
		defer updateDB.Close()
		updateDB.QueryRow("SELECT IFNULL(web_rank, 0) FROM user_profiles WHERE user_id = ?", userID).Scan(&webRank)
	}

	rType := "menu"
	if len(resourceType) > 0 && resourceType[0] != "" {
		rType = resourceType[0]
	}

	// use centralized logic
	if !auth.HasPermission(webRank, rType, menuID) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusForbidden)
		json.NewEncoder(w).Encode(map[string]string{"status": "forbidden", "message": "권한이 부족합니다."})
		return false
	}

	return true
}

// Deprecated: Use CheckMenuPermission instead where applicable
func checkAdminAuth(w http.ResponseWriter, r *http.Request, minLevel int) bool {
	// minLevel is legacy. In our system, webRank 2 is admin.
	cookie, err := r.Cookie("session_user")
	if err != nil || cookie.Value == "" {
		return false
	}

	username := cookie.Value
	authDB, _ := sql.Open("mysql", config.AuthDSN())
	if authDB != nil {
		defer authDB.Close()
		var userID int
		authDB.QueryRow("SELECT id FROM account WHERE UPPER(TRIM(username)) = UPPER(TRIM(?))", username).Scan(&userID)

		updateDB, _ := sql.Open("mysql", config.UpdateDSN())
		if updateDB != nil {
			defer updateDB.Close()
			webRank := 0
			updateDB.QueryRow("SELECT IFNULL(web_rank, 0) FROM user_profiles WHERE user_id = ?", userID).Scan(&webRank)
			if webRank >= 2 {
				return true
			}
		}
	}

	// Fallback to simpler check if DB connection fails
	return CheckMenuPermission(w, r, "account")
}
