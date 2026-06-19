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
	Image       string `json:"image"` // 썸네일(이미지 항목은 본문 겸용)
	Type        string `json:"type"`  // "image" | "html"
	URL         string `json:"url"`   // html 항목의 본문 경로
}

func handlePublicContents(w http.ResponseWriter, r *http.Request) {
	entries, err := os.ReadDir("./img/contents")
	if err != nil {
		http.Error(w, "{\"status\":\"error\",\"message\":\"\\ucee8\\ud150\\uce20 \\uc774\\ubbf8\\uc9c0\\ub97c \\ubd88\\ub7ec\\uc624\\uc9c0 \\ubabb\\ud588\\uc2b5\\ub2c8\\ub2e4.\"}", http.StatusInternalServerError)
		return
	}

	// HTML \ud30c\uc77c \ubca0\uc774\uc2a4\uba85 \uc9d1\ud569 \u2014 \uac19\uc740 \uc774\ub984\uc758 \uc774\ubbf8\uc9c0\ub294 HTML \uc378\ub124\uc77c\ub85c \uac04\uc8fc(\ub2e8\ub3c5 \ub178\ucd9c \uc548 \ud568)
	htmlBases := make(map[string]bool)
	for _, entry := range entries {
		if entry.IsDir() || strings.HasPrefix(entry.Name(), ".") {
			continue
		}
		if strings.EqualFold(filepath.Ext(entry.Name()), ".html") {
			htmlBases[strings.TrimSuffix(entry.Name(), filepath.Ext(entry.Name()))] = true
		}
	}

	items := make([]publicContentItem, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}

		name := entry.Name()
		if strings.HasPrefix(name, ".") {
			continue
		}

		isHTML := strings.EqualFold(filepath.Ext(name), ".html")
		if !isHTML && !isContentImageFile(name) {
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

		ver := contentVersion(info.ModTime())

		if isHTML {
			items = append(items, publicContentItem{
				ID:          title,
				Title:       title,
				Description: title + " \ucee8\ud150\uce20 \uc548\ub0b4\ub97c \ud655\uc778\ud560 \uc218 \uc788\uc2b5\ub2c8\ub2e4.",
				Type:        "html",
				URL:         "/img/contents/" + url.PathEscape(name) + "?v=" + ver,
				Image:       contentHTMLThumb(entries, title, ver),
			})
			continue
		}

		// \uc774\ubbf8\uc9c0: HTML \ucef4\ud328\ub2c8\uc5b8 \uc378\ub124\uc77c\uc774\uba74 \ub2e8\ub3c5 \ud56d\ubaa9\uc73c\ub85c \ub178\ucd9c\ud558\uc9c0 \uc54a\uc74c
		if htmlBases[title] {
			continue
		}
		items = append(items, publicContentItem{
			ID:          title,
			Title:       title,
			Description: title + " \ucee8\ud150\uce20 \uc548\ub0b4 \uc774\ubbf8\uc9c0\ub97c \ud655\uc778\ud560 \uc218 \uc788\uc2b5\ub2c8\ub2e4.",
			Type:        "image",
			Image:       "/img/contents/" + url.PathEscape(name) + "?v=" + ver,
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

// HTML 컨텐츠 썸네일: 같은 이름의 이미지(예: "X.png")가 있으면 그것을, 없으면 기본 썸네일.
const defaultContentThumb = "/img/wowlogo_white.png"

func contentHTMLThumb(entries []os.DirEntry, base, ver string) string {
	for _, ext := range []string{".png", ".jpg", ".jpeg", ".webp", ".gif"} {
		cand := base + ext
		for _, entry := range entries {
			if !entry.IsDir() && strings.EqualFold(entry.Name(), cand) {
				return "/img/contents/" + url.PathEscape(entry.Name()) + "?v=" + ver
			}
		}
	}
	return defaultContentThumb
}

func contentVersion(modTime time.Time) string {
	if modTime.IsZero() {
		return "1"
	}
	return strconv.FormatInt(modTime.Unix(), 10)
}
