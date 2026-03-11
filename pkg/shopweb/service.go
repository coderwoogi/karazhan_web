package shopweb

import (
	"net/http"
	"strings"
)

func RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/shop/", func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie("session_user")
		if err != nil || strings.TrimSpace(cookie.Value) == "" {
			http.Redirect(w, r, "/", http.StatusFound)
			return
		}

		fs := http.FileServer(http.Dir("./pkg/shopweb/static"))
		http.StripPrefix("/shop/", fs).ServeHTTP(w, r)
	})
}
