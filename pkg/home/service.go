package home

import (
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
}
