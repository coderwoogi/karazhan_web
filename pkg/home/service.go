package home

import (
	"encoding/json"
	"net"
	"net/http"
	"os"
	"strings"
)

func RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/home/", func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie("session_user")
		if err != nil || cookie.Value == "" {
			http.Redirect(w, r, "/", http.StatusFound)
			return
		}

		fs := http.FileServer(http.Dir("./pkg/home/static"))
		http.StripPrefix("/home/", fs).ServeHTTP(w, r)
	})

	// Icon Proxy
	mux.HandleFunc("/api/external/item_icon", handleItemIcon)
	mux.HandleFunc("/api/meta/environment", func(w http.ResponseWriter, r *http.Request) {
		env := strings.TrimSpace(os.Getenv("APP_ENV"))
		if env == "" {
			host := strings.TrimSpace(r.Host)
			if strings.Contains(host, ":") {
				if _, port, err := net.SplitHostPort(host); err == nil && port == "8080" {
					env = "development"
				} else {
					env = "production"
				}
			} else {
				env = "production"
			}
		}
		isDev := strings.EqualFold(env, "development") || strings.EqualFold(env, "dev")
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"env":            env,
			"is_development": isDev,
		})
	})
}
