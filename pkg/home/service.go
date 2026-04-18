package home

import (
	"encoding/json"
	"karazhan/pkg/config"
	"net/http"
	"strings"
)

func RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/public/home", handlePublicHomeSettings)

	mux.HandleFunc("/react-home/", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "./frontend/dist/index.html")
	})

	mux.HandleFunc("/legacy-home/", func(w http.ResponseWriter, r *http.Request) {
		fs := http.FileServer(http.Dir("./pkg/home/static"))
		http.StripPrefix("/legacy-home/", fs).ServeHTTP(w, r)
	})

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
		http.ServeFile(w, r, "./frontend/dist/index.html")
	})

	mux.HandleFunc("/home/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/home/" {
			http.Redirect(w, r, "/", http.StatusMovedPermanently)
			return
		}

		fs := http.FileServer(http.Dir("./pkg/admin/static"))
		http.StripPrefix("/home/", fs).ServeHTTP(w, r)
	})

	mux.HandleFunc("/user/", func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie("session_user")
		if err != nil || strings.TrimSpace(cookie.Value) == "" {
			http.Redirect(w, r, "/login/", http.StatusFound)
			return
		}

		fs := http.FileServer(http.Dir("./pkg/admin/static"))
		http.StripPrefix("/user/", fs).ServeHTTP(w, r)
	})

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
