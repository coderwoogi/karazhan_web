package home

import (
	"encoding/json"
	"karazhan/pkg/config"
	"net/http"
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
		env := config.RequestEnv(r)
		isDev := config.IsDevelopmentRequest(r)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"env":            env,
			"is_development": isDev,
			"dev_domain":     config.DevDomain(),
			"prod_domain":    config.ProdDomain(),
		})
	})
}
