package auth

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"karazhan/pkg/services"
	"log"
	"net/http"
	"strconv"
)

// GetPoints returns the current points for a user. Returns 0 if not found.
func GetPoints(userID int) int {
	dsn := "cpo5704:584579@tcp(121.148.127.135:3306)/update"
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		log.Printf("GetPoints DB Conn Error: %v", err)
		return 0
	}
	defer db.Close()

	var points int
	err = db.QueryRow("SELECT points FROM user_points WHERE user_id = ?", userID).Scan(&points)
	if err != nil {
		if err == sql.ErrNoRows {
			return 0
		}
		log.Printf("GetPoints Query Error: %v", err)
		return 0
	}
	return points
}

// AddPoints adds (or subtracts) points for a user and logs the transaction.
func AddPoints(userID int, amount int, reason string, adminName string) error {
	dsn := "cpo5704:584579@tcp(121.148.127.135:3306)/update"
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		log.Printf("[ERROR] AddPoints DB Conn Error: %v", err)
		return fmt.Errorf("DB connection failed: %v", err)
	}
	defer db.Close()

	tx, err := db.Begin()
	if err != nil {
		log.Printf("[ERROR] AddPoints Tx Begin Error: %v", err)
		return fmt.Errorf("transaction begin failed: %v", err)
	}

	// 1. Get Current Points (with lock)
	var currentPoints int
	err = tx.QueryRow("SELECT points FROM user_points WHERE user_id = ? FOR UPDATE", userID).Scan(&currentPoints)
	if err != nil {
		if err == sql.ErrNoRows {
			currentPoints = 0
		} else {
			tx.Rollback()
			log.Printf("[ERROR] AddPoints Fetch Current Points Error: %v", err)
			return fmt.Errorf("fetch points failed: %v", err)
		}
	}

	// 2. Check if result would be negative
	if currentPoints+amount < 0 {
		tx.Rollback()
		return fmt.Errorf("포인트가 부족합니다. (현재: %d, 필요: %d)", currentPoints, -amount)
	}

	// 3. Update Points
	log.Printf("[DEBUG] AddPoints: Updating user %d points by %d (Current: %d)", userID, amount, currentPoints)
	_, err = tx.Exec(`
		INSERT INTO user_points (user_id, points) VALUES (?, ?)
		ON DUPLICATE KEY UPDATE points = points + ?
	`, userID, amount, amount)
	if err != nil {
		tx.Rollback()
		log.Printf("[ERROR] AddPoints Update Query Error: %v", err)
		return fmt.Errorf("update points failed: %v", err)
	}

	// 4. Log Transaction
	log.Printf("[DEBUG] AddPoints: Logging transaction for user %d (Admin: %s, Reason: %s)", userID, adminName, reason)
	_, err = tx.Exec("INSERT INTO user_point_logs (user_id, amount, reason, admin_name, created_at) VALUES (?, ?, ?, ?, NOW())", userID, amount, reason, adminName)
	if err != nil {
		tx.Rollback()
		log.Printf("[ERROR] AddPoints Log Query Error: %v", err)
		return fmt.Errorf("log transaction failed: %v", err)
	}

	if err := tx.Commit(); err != nil {
		log.Printf("[ERROR] AddPoints Commit Error: %v", err)
		return fmt.Errorf("commit failed: %v", err)
	}

	log.Printf("[SUCCESS] AddPoints: User %d points updated successfully", userID)

	// Send Notification
	updateDSN := "cpo5704:584579@tcp(121.148.127.135:3306)/update"
	updateDB, err := sql.Open("mysql", updateDSN)
	if err == nil {
		defer updateDB.Close()
		ns := services.NewNotificationService(updateDB)
		title := "포인트 변경 알림"
		msg := fmt.Sprintf("관리자(%s)에 의해 %d 포인트가 %s되었습니다. (사유: %s)", adminName, abs(amount), getActionString(amount), reason)
		// Point notifications should always be sent as "system".
		ns.CreateNotification(userID, "point", title, msg, "", "시스템")
	} else {
		log.Printf("[ERROR] AddPoints: Failed to connect to update DB for notification: %v", err)
	}

	return nil
}

func abs(n int) int {
	if n < 0 {
		return -n
	}
	return n
}

func getActionString(n int) string {
	if n >= 0 {
		return "지급"
	}
	return "차감"
}

// handlePointHistory handles the API request for point history.
func handlePointHistory(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie("session_user")
	if err != nil || cookie.Value == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	username := cookie.Value

	// Get User ID
	authDSN := "root:4618@tcp(localhost:3306)/acore_auth"
	authDB, err := sql.Open("mysql", authDSN)
	if err != nil {
		http.Error(w, "Auth DB Error", http.StatusInternalServerError)
		return
	}
	defer authDB.Close()

	var userID int
	err = authDB.QueryRow("SELECT id FROM account WHERE username = ?", username).Scan(&userID)
	if err != nil {
		http.Error(w, "User not found", http.StatusUnauthorized)
		return
	}

	// Pagination
	pageStr := r.URL.Query().Get("page")
	page, _ := strconv.Atoi(pageStr)
	if page < 1 {
		page = 1
	}
	limit := 10
	offset := (page - 1) * limit

	// Query Logs
	updateDSN := "cpo5704:584579@tcp(121.148.127.135:3306)/update"
	db, err := sql.Open("mysql", updateDSN)
	if err != nil {
		http.Error(w, "Update DB Error", http.StatusInternalServerError)
		return
	}
	defer db.Close()

	// Get Total Count
	var total int
	db.QueryRow("SELECT COUNT(*) FROM user_point_logs WHERE user_id = ?", userID).Scan(&total)

	// Get Logs
	rows, err := db.Query(`
		SELECT amount, reason, created_at 
		FROM user_point_logs 
		WHERE user_id = ? 
		ORDER BY id DESC 
		LIMIT ? OFFSET ?`, userID, limit, offset)
	if err != nil {
		log.Printf("Point History Query Error: %v", err)
		http.Error(w, "Query Error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var logs []map[string]interface{}
	for rows.Next() {
		var amount int
		var reason, createdAt sql.NullString
		if err := rows.Scan(&amount, &reason, &createdAt); err != nil {
			log.Printf("[ERROR] Scan Log Entry Error: %v", err)
			continue
		}
		log.Printf("[DEBUG] Found Log: Amount=%d, Reason=%s, Date=%v", amount, reason.String, createdAt.String)
		logs = append(logs, map[string]interface{}{
			"amount":    amount,
			"reason":    reason.String,
			"createdAt": createdAt.String,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"logs":       logs,
		"page":       page,
		"total":      total,
		"totalPages": (total + limit - 1) / limit,
	})
}

func adminPointHistoryHandler(w http.ResponseWriter, r *http.Request) {
	if !checkSubMenuPermission(w, r, "account-list") {
		return
	}

	targetIDStr := r.URL.Query().Get("id")
	targetID, _ := strconv.Atoi(targetIDStr)
	if targetID == 0 {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}

	// Pagination
	pageStr := r.URL.Query().Get("page")
	page, _ := strconv.Atoi(pageStr)
	if page < 1 {
		page = 1
	}
	limit := 10
	offset := (page - 1) * limit

	updateDSN := "cpo5704:584579@tcp(121.148.127.135:3306)/update"
	db, err := sql.Open("mysql", updateDSN)
	if err != nil {
		log.Printf("[ERROR] adminPointHistoryHandler: DB Connection Error: %v", err)
		http.Error(w, "DB Error", http.StatusInternalServerError)
		return
	}
	defer db.Close()

	log.Printf("[DEBUG] adminPointHistoryHandler: Request for ID=%d Page=%d", targetID, page)

	var total int
	err = db.QueryRow("SELECT COUNT(*) FROM user_point_logs WHERE user_id = ?", targetID).Scan(&total)
	if err != nil {
		log.Printf("[ERROR] adminPointHistoryHandler: Count Query Error: %v", err)
	}

	rows, err := db.Query(`
		SELECT amount, reason, admin_name, created_at 
		FROM user_point_logs 
		WHERE user_id = ? 
		ORDER BY id DESC 
		LIMIT ? OFFSET ?`, targetID, limit, offset)
	if err != nil {
		log.Printf("[ERROR] adminPointHistoryHandler: Query Error: %v", err)
		http.Error(w, "Query Error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var logs []map[string]interface{}
	for rows.Next() {
		var amount int
		var reason, adminName, createdAt sql.NullString
		if err := rows.Scan(&amount, &reason, &adminName, &createdAt); err != nil {
			log.Printf("[ERROR] adminPointHistoryHandler Scan Error: %v", err)
			continue
		}
		log.Printf("[DEBUG] adminPointHistoryHandler: Row: Amt=%d, Admin=%s, Date=%v", amount, adminName.String, createdAt.String)
		logs = append(logs, map[string]interface{}{
			"amount":    amount,
			"reason":    reason.String,
			"admin":     adminName.String,
			"createdAt": createdAt.String,
		})
	}

	log.Printf("[DEBUG] adminPointHistoryHandler: Found %d logs (Total: %d) for user %d", len(logs), total, targetID)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"logs":       logs,
		"page":       page,
		"total":      total,
		"totalPages": (total + limit - 1) / limit,
	})
}

func adminUpdatePointsHandler(w http.ResponseWriter, r *http.Request) {
	if !checkSubMenuPermission(w, r, "account-list") {
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	r.ParseForm()
	targetID, _ := strconv.Atoi(r.FormValue("id"))
	amount, _ := strconv.Atoi(r.FormValue("amount"))
	reason := r.FormValue("reason")

	if targetID == 0 || amount == 0 || reason == "" {
		http.Error(w, "Missing fields", http.StatusBadRequest)
		return
	}

	// Get admin name from session
	adminName := "System"
	cookie, err := r.Cookie("session_user")
	if err == nil && cookie.Value != "" {
		adminName = cookie.Value
	}

	err = AddPoints(targetID, amount, reason, adminName)
	if err != nil {
		log.Printf("[ERROR] adminUpdatePointsHandler: %v", err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status":  "error",
			"message": err.Error(),
		})
		return
	}

	currentPoints := GetPoints(targetID)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status": "success",
		"userId": targetID,
		"points": currentPoints,
	})
}
