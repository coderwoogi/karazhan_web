package auth

import (
	"database/sql"
	"encoding/json"
	"karazhan/pkg/config"
	"log"
	"net/http"
	"time"
)

// Ban Request Struct
type BanRequest struct {
	UserID   int    `json:"user_id"`
	Duration int    `json:"duration"` // Days. -1 for permanent
	Reason   string `json:"reason"`
}

// Unban Request Struct
type UnbanRequest struct {
	UserID int `json:"user_id"`
}

func adminUserBanHandler(w http.ResponseWriter, r *http.Request) {
	if !checkSubMenuPermission(w, r, "ban-accountban") {
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req BanRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.UserID == 0 || req.Reason == "" {
		http.Error(w, "User ID and Reason are required", http.StatusBadRequest)
		return
	}

	// Calculate Unban Date
	var unbanDate int64
	if req.Duration == -1 {
		unbanDate = 4294967295 // Max Int32 approx (Year 2106), effectively permanent
		// Or creating a very far future date.
	} else {
		unbanDate = time.Now().AddDate(0, 0, req.Duration).Unix()
	}

	// Get BannedBy (Current Admin)
	cookie, _ := r.Cookie("session_user")
	bannedBy := "Admin"
	if cookie != nil {
		bannedBy = cookie.Value
	}

	// 1. Deactivate existing bans (optional, but good practice to allow new ban to override)
	// Actually TrinityCore/AzerothCore usually supports multiple, but active=1 matches.
	// We'll just insert a new one.

	dsn := config.AuthDSN()
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		http.Error(w, "DB Error", http.StatusInternalServerError)
		return
	}
	defer db.Close()

	// Insert Ban
	_, err = db.Exec(`
		INSERT INTO account_banned (id, bandate, unbandate, bannedby, banreason, active)
		VALUES (?, ?, ?, ?, ?, 1)
	`, req.UserID, time.Now().Unix(), unbanDate, bannedBy, req.Reason)

	if err != nil {
		log.Printf("Ban Error: %v", err)
		http.Error(w, "Failed to ban user", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "success", "message": "User banned successfully"})
}

func adminUserUnbanHandler(w http.ResponseWriter, r *http.Request) {
	if !checkSubMenuPermission(w, r, "ban-accountban") {
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req UnbanRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	dsn := config.AuthDSN()
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		http.Error(w, "DB Error", http.StatusInternalServerError)
		return
	}
	defer db.Close()

	// Unban: Set active = 0 for all active bans of this user
	_, err = db.Exec(`
		UPDATE account_banned 
		SET active = 0 
		WHERE id = ? AND active = 1
	`, req.UserID)

	if err != nil {
		log.Printf("Unban Error: %v", err)
		http.Error(w, "Failed to unban user", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "success", "message": "User unbanned successfully"})
}
