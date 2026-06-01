package home

import (
	"encoding/json"
	"karazhan/pkg/config"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"
)

func servePublicHomeEntry(w http.ResponseWriter, r *http.Request) {
	distPath := "./frontend/dist/index.html"
	if _, err := os.Stat(distPath); err == nil {
		w.Header().Set("Cache-Control", "no-cache")
		http.ServeFile(w, r, distPath)
		return
	}

	http.ServeFile(w, r, "./pkg/home/static/index.html")
}

func RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/public/home", handlePublicHomeSettings)
	mux.HandleFunc("/api/public/contents", handlePublicContents)

	mux.HandleFunc("/react-home/", func(w http.ResponseWriter, r *http.Request) {
		servePublicHomeEntry(w, r)
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

		servePublicHomeEntry(w, r)
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

type publicContentItem struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Image       string `json:"image"`
}

func handlePublicContents(w http.ResponseWriter, r *http.Request) {
	entries, err := os.ReadDir("./img/contents")
	if err != nil {
		http.Error(w, "{\"status\":\"error\",\"message\":\"\\ucee8\\ud150\\uce20 \\uc774\\ubbf8\\uc9c0\\ub97c \\ubd88\\ub7ec\\uc624\\uc9c0 \\ubabb\\ud588\\uc2b5\\ub2c8\\ub2e4.\"}", http.StatusInternalServerError)
		return
	}

	items := make([]publicContentItem, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}

		name := entry.Name()
		if strings.HasPrefix(name, ".") || !isContentImageFile(name) {
			continue
		}

		info, err := entry.Info()
		if err != nil {
			continue
		}

		title := strings.TrimSpace(strings.TrimSuffix(name, filepath.Ext(name)))
		if title == "" {
			continue
		}

		items = append(items, publicContentItem{
			ID:          title,
			Title:       title,
			Description: title + " \ucee8\ud150\uce20 \uc548\ub0b4 \uc774\ubbf8\uc9c0\ub97c \ud655\uc778\ud560 \uc218 \uc788\uc2b5\ub2c8\ub2e4.",
			Image:       "/img/contents/" + url.PathEscape(name) + "?v=" + contentVersion(info.ModTime()),
		})
	}

	sort.Slice(items, func(i, j int) bool {
		if items[i].Title == items[j].Title {
			return items[i].ID < items[j].ID
		}
		return items[i].Title < items[j].Title
	})

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(items)
}

func isContentImageFile(name string) bool {
	switch strings.ToLower(filepath.Ext(name)) {
	case ".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif":
		return true
	default:
		return false
	}
}

func contentVersion(modTime time.Time) string {
	if modTime.IsZero() {
		return "1"
	}
	return strconv.FormatInt(modTime.Unix(), 10)
}
