package home

import (
	"encoding/json"
	"karazhan/pkg/config"
	"net/http"
)

func RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/public/home", handlePublicHomeSettings)

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/home/" {
			http.Redirect(w, r, "/", http.StatusMovedPermanently)
			return
		}
		if r.URL.Path != "/" {
			http.FileServer(http.Dir("./pkg/home/static")).ServeHTTP(w, r)
			return
		}

		w.Header().Set("Cache-Control", "no-cache")
		http.ServeFile(w, r, "./pkg/home/static/index.html")
	})

	mux.HandleFunc("/home/", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/", http.StatusMovedPermanently)
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
