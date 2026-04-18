package admin

import (
	"database/sql"
	"karazhan/pkg/config"
	"log"
	"net/http"
	"strings"

	_ "github.com/go-sql-driver/mysql"
)

func RegisterRoutes(mux *http.ServeMux) {
	registerHomeSettingsRoutes(mux)

	mux.HandleFunc("/admin", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/admin/", http.StatusFound)
	})

	mux.HandleFunc("/legacy-admin", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/legacy-admin/", http.StatusFound)
	})

	mux.HandleFunc("/legacy-admin/", func(w http.ResponseWriter, r *http.Request) {
		if !isAdminRequest(r) {
			if _, err := r.Cookie("session_user"); err != nil {
				http.Redirect(w, r, "/login/", http.StatusFound)
				return
			}
			http.Error(w, "관리자 권한이 필요합니다.", http.StatusForbidden)
			return
		}

		fs := http.FileServer(http.Dir("./pkg/admin/static"))
		http.StripPrefix("/legacy-admin/", fs).ServeHTTP(w, r)
	})

	mux.HandleFunc("/admin/", func(w http.ResponseWriter, r *http.Request) {
		if !isAdminRequest(r) {
			if _, err := r.Cookie("session_user"); err != nil {
				http.Redirect(w, r, "/login/", http.StatusFound)
				return
			}
			http.Error(w, "관리자 권한이 필요합니다.", http.StatusForbidden)
			return
		}

		w.Header().Set("Cache-Control", "no-cache")
		if r.URL.Path == "/admin/" {
			http.ServeFile(w, r, "./pkg/admin/static/index.html")
			return
		}

		fs := http.FileServer(http.Dir("./pkg/admin/static"))
		http.StripPrefix("/admin/", fs).ServeHTTP(w, r)
	})
}

func isAdminRequest(r *http.Request) bool {
	cookie, err := r.Cookie("session_user")
	if err != nil || strings.TrimSpace(cookie.Value) == "" {
		return false
	}
	username := strings.TrimSpace(cookie.Value)

	authDB, err := config.OpenMySQL(config.AuthDSN())
	if err != nil {
		log.Printf("[admin] auth db open failed: %v", err)
		return false
	}
	defer authDB.Close()

	var accountID int
	var gmLevel int
	err = authDB.QueryRow(`
		SELECT a.id, IFNULL(MAX(aa.gmlevel), 0)
		FROM account a
		LEFT JOIN account_access aa ON aa.id = a.id
		WHERE UPPER(a.username) = UPPER(?)
		GROUP BY a.id
	`, username).Scan(&accountID, &gmLevel)
	if err != nil {
		if err != sql.ErrNoRows {
			log.Printf("[admin] account permission lookup failed: %v", err)
		}
		return false
	}
	if gmLevel > 0 {
		return true
	}

	updateDB, err := config.OpenMySQL(config.UpdateDSN())
	if err != nil {
		log.Printf("[admin] update db open failed: %v", err)
		return false
	}
	defer updateDB.Close()

	var webRank int
	_ = updateDB.QueryRow("SELECT IFNULL(web_rank, 0) FROM user_profiles WHERE user_id = ?", accountID).Scan(&webRank)
	return webRank > 0
}
