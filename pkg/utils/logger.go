package utils

import (
	"database/sql"
	"karazhan/pkg/config"
	"log"
	"net/http"
	"strings"
	"time"

	_ "github.com/go-sql-driver/mysql"
)

func LogAction(r *http.Request, userOverride string, button string) {
	dsn := config.UpdateDSN()
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		log.Printf("Logger Error (DB Open): %v", err)
		return
	}
	defer db.Close()

	// 1. Get User
	user := "unknown"
	if userOverride != "" {
		user = userOverride
	} else {
		cookie, err := r.Cookie("session_user")
		if err == nil {
			user = cookie.Value
		}
	}

	// 2. Determine Role (Admin if in account_access)
	role := "User"
	authDSN := config.AuthDSN()
	authDB, err := sql.Open("mysql", authDSN)
	if err == nil {
		var exists bool
		err = authDB.QueryRow(`
			SELECT EXISTS(
				SELECT 1 FROM account_access aa
				JOIN account a ON a.id = aa.id
				WHERE UPPER(a.username) = UPPER(?)
			)`, user).Scan(&exists)
		if err == nil && exists {
			role = "Admin"
		}
		authDB.Close()
	}

	// 3. Get IP
	ip := r.RemoteAddr
	if strings.Contains(ip, ":") {
		parts := strings.Split(ip, ":")
		if len(parts) > 1 {
			if strings.HasPrefix(ip, "[") && strings.Contains(ip, "]") {
				ip = ip[1:strings.Index(ip, "]")]
			} else {
				ip = parts[0]
			}
		}
	}
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		ip = strings.Split(xff, ",")[0]
	}

	log.Printf("[Logger] Recording: User=%s, Role=%s, IP=%s, Button=%s", user, role, ip, button)

	// 4. Insert into Logs
	_, err = db.Exec("INSERT INTO logs (user, role, ip, date, button) VALUES (?, ?, ?, ?, ?)",
		user, role, ip, time.Now(), button)
	if err != nil {
		log.Printf("Logger Error (Insert Failure): %v", err)
	} else {
		log.Printf("[Logger] Successfully inserted logs entry.")
	}
}
