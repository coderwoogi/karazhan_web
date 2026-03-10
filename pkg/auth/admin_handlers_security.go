package auth

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"strings"
)

// Password Change Request Struct
type PasswordChangeRequest struct {
	UserID      int    `json:"user_id"`
	NewPassword string `json:"new_password"`
}

func adminUserPasswordHandler(w http.ResponseWriter, r *http.Request) {
	if !checkSubMenuPermission(w, r, "account-permissions") {
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req PasswordChangeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.UserID == 0 || req.NewPassword == "" {
		http.Error(w, "User ID and New Password are required", http.StatusBadRequest)
		return
	}

	dsn := "root:4618@tcp(localhost:3306)/acore_auth"
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		http.Error(w, "DB Error", http.StatusInternalServerError)
		return
	}
	defer db.Close()

	// 1. Get Username (Needed for SRP6 calculation)
	var username string
	err = db.QueryRow("SELECT username FROM account WHERE id = ?", req.UserID).Scan(&username)
	if err != nil {
		if err == sql.ErrNoRows {
			http.Error(w, "User not found", http.StatusNotFound)
		} else {
			log.Printf("DB Query Error: %v", err)
			http.Error(w, "Server Error", http.StatusInternalServerError)
		}
		return
	}

	// 2. Calculate SRP6
	salt, verifier := calculateSRP6(strings.ToUpper(username), req.NewPassword)

	// 3. Update Account
	_, err = db.Exec("UPDATE account SET salt = ?, verifier = ? WHERE id = ?", salt, verifier, req.UserID)
	if err != nil {
		log.Printf("Password Update Error: %v", err)
		http.Error(w, "Failed to update password", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "success", "message": "Password updated successfully"})
}
