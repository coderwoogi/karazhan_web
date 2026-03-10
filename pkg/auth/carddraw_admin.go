package auth

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"

	_ "github.com/go-sql-driver/mysql"
)

func adminUpdateCardDrawCountHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !checkSubMenuPermission(w, r, "account-list") {
		return
	}

	_ = r.ParseForm()
	idStr := r.FormValue("id")
	countStr := r.FormValue("count")

	userID, err := strconv.Atoi(idStr)
	if err != nil || userID <= 0 {
		http.Error(w, "Invalid user id", http.StatusBadRequest)
		return
	}
	count, err := strconv.Atoi(countStr)
	if err != nil || count < 0 {
		http.Error(w, "Invalid count", http.StatusBadRequest)
		return
	}

	updateDB, err := sql.Open("mysql", "cpo5704:584579@tcp(121.148.127.135:3306)/update")
	if err != nil {
		http.Error(w, "Update DB Error", http.StatusInternalServerError)
		return
	}
	defer updateDB.Close()

	// Carddraw column only.
	_, _ = updateDB.Exec("ALTER TABLE user_profiles ADD COLUMN carddraw_draw_count INT NOT NULL DEFAULT 0")
	_, _ = updateDB.Exec("ALTER TABLE user_profiles MODIFY COLUMN carddraw_draw_count INT NOT NULL DEFAULT 0")
	_, _ = updateDB.Exec("INSERT INTO user_profiles (user_id, carddraw_draw_count) VALUES (?, ?) ON DUPLICATE KEY UPDATE carddraw_draw_count = VALUES(carddraw_draw_count)", userID, count)

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"status": "success",
		"count":  count,
	})
}
