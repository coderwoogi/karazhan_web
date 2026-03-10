package main

import (
	"flag"
	"fmt"
	"karazhan/pkg/auth"
	"karazhan/pkg/board"
	"karazhan/pkg/gm"
	"karazhan/pkg/home"
	"karazhan/pkg/inspect"
	"karazhan/pkg/launcher"
	"karazhan/pkg/notification"
	"karazhan/pkg/shopweb"
	"karazhan/pkg/stats"
	"karazhan/pkg/update"
	"karazhan/pkg/wowpass"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
)

func main() {
	inspectFlag := flag.Bool("inspect", false, "Run DB inspection")
	flag.Parse()

	if *inspectFlag {
		inspect.Run()
		return
	}

	mux := http.NewServeMux()

	// Register Services
	auth.RegisterRoutes(mux)
	home.RegisterRoutes(mux)
	launcher.RegisterRoutes(mux)
	update.RegisterRoutes(mux)
	stats.RegisterRoutes(mux)
	gm.RegisterRoutes(mux)
	board.RegisterRoutes(mux)
	notification.RegisterRoutes(mux)
	wowpass.RegisterRoutes(mux)
	shopweb.RegisterRoutes(mux)

	// Static Assets
	mux.Handle("/img/", http.StripPrefix("/img/", http.FileServer(http.Dir("./img"))))
	mux.Handle("/sounds/", http.StripPrefix("/sounds/", http.FileServer(http.Dir("./sounds"))))
	mux.HandleFunc("/favicon.ico", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "./img/favicon.ico")
	})

	// PHP Proxy for /work/ (Assuming Apache is on port 80)
	apacheURL, _ := url.Parse("http://localhost:80")
	proxy := httputil.NewSingleHostReverseProxy(apacheURL)
	mux.HandleFunc("/work/", func(w http.ResponseWriter, r *http.Request) {
		log.Printf("[Proxy] Forwarding %s to Apache", r.URL.Path)
		proxy.ServeHTTP(w, r)
	})

	port := "8080"

	fmt.Printf("Starting Karazhan Unified Server on port %s...\n", port)
	fmt.Printf("- Launcher API: http://localhost:%s/api/launcher/latest\n", port)
	fmt.Printf("- Update Web:   http://localhost:%s/update/\n", port)

	handler := withRecovery(withSecurityHeaders(mux))

	if err := http.ListenAndServe(":"+port, handler); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}

func withSecurityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Basic browser hardening headers.
		w.Header().Set("X-Content-Type-Options", "nosniff")
		// Allow same-origin iframe usage (e.g. /update/ embedded in admin tab).
		w.Header().Set("X-Frame-Options", "SAMEORIGIN")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		w.Header().Set("Permissions-Policy", "geolocation=(), microphone=(), camera=()")
		w.Header().Set("Cross-Origin-Resource-Policy", "same-origin")
		next.ServeHTTP(w, r)
	})
}

func withRecovery(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				log.Printf("[PANIC] %s %s: %v", r.Method, r.URL.Path, rec)
				http.Error(w, "요청 처리 중 오류가 발생했습니다.", http.StatusInternalServerError)
			}
		}()
		next.ServeHTTP(w, r)
	})
}
