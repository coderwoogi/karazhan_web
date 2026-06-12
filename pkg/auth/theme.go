package auth

import (
	"database/sql"
	"encoding/json"
	"karazhan/pkg/config"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

// 계정별 디자인 테마(스톰윈드/오그리마 등) 저장·조회·요청별 해석.
// 저장처: update DB의 user_profiles.web_theme (user_id 기준).
// /theme/ 정적 서빙이 매 요청 호출하므로, username→theme 를 메모리 캐시한다.

const fallbackTheme = "stormwind"

var themeCache sync.Map // key: lower(username) -> theme(string)

// availableThemes: theme.css 를 가진 themes/<name> 디렉토리 목록(화이트리스트).
func availableThemes() map[string]bool {
	set := map[string]bool{}
	entries, err := os.ReadDir("./themes")
	if err != nil {
		return set
	}
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		if _, err := os.Stat(filepath.Join("./themes", e.Name(), "theme.css")); err == nil {
			set[e.Name()] = true
		}
	}
	return set
}

func defaultTheme() string {
	d := strings.TrimSpace(config.ThemeName())
	if d == "" {
		d = fallbackTheme
	}
	return d
}

// sanitizeTheme: 실존하는 테마 디렉토리명일 때만 그대로 반환(경로 조작 차단), 아니면 "".
func sanitizeTheme(name string) string {
	name = strings.TrimSpace(name)
	if name == "" || strings.ContainsAny(name, "/\\.") {
		return ""
	}
	if availableThemes()[name] {
		return name
	}
	return ""
}

// ensureThemeColumn: user_profiles 에 web_theme 컬럼 보강(이미 있으면 무시).
func ensureThemeColumn() {
	updateDB, err := sql.Open("mysql", config.UpdateDSN())
	if err != nil {
		return
	}
	defer updateDB.Close()
	_, _ = updateDB.Exec("ALTER TABLE user_profiles ADD COLUMN web_theme VARCHAR(32) NOT NULL DEFAULT ''")
}

func accountIDByUsername(username string) (int, bool) {
	authDB, err := sql.Open("mysql", config.AuthDSN())
	if err != nil {
		return 0, false
	}
	defer authDB.Close()
	var id int
	if err := authDB.QueryRow("SELECT id FROM account WHERE UPPER(username) = UPPER(?)", username).Scan(&id); err != nil {
		return 0, false
	}
	return id, true
}

// resolveUserThemeByID: 저장된 테마(검증 통과)만 반환, 없으면 "".
func resolveUserThemeByID(updateDB *sql.DB, id int) string {
	if updateDB == nil || id <= 0 {
		return ""
	}
	var t string
	_ = updateDB.QueryRow("SELECT IFNULL(web_theme, '') FROM user_profiles WHERE user_id = ?", id).Scan(&t)
	return sanitizeTheme(t)
}

// UserThemeForStatus: /api/user/status 응답용 — 저장값 없으면 기본 테마.
func UserThemeForStatus(updateDB *sql.DB, id int) string {
	if t := resolveUserThemeByID(updateDB, id); t != "" {
		return t
	}
	return defaultTheme()
}

// ThemeForRequest: /theme/ 정적 서빙 시 세션 기반으로 활성 테마 결정(비로그인=기본).
func ThemeForRequest(r *http.Request) string {
	def := defaultTheme()
	if r == nil {
		return def
	}
	c, err := r.Cookie("session_user")
	if err != nil || strings.TrimSpace(c.Value) == "" {
		return def
	}
	username := strings.TrimSpace(c.Value)
	key := strings.ToLower(username)
	if v, ok := themeCache.Load(key); ok {
		if s, _ := v.(string); s != "" {
			return s
		}
	}
	id, ok := accountIDByUsername(username)
	if !ok {
		return def
	}
	updateDB, err := sql.Open("mysql", config.UpdateDSN())
	if err != nil {
		return def
	}
	defer updateDB.Close()
	t := resolveUserThemeByID(updateDB, id)
	if t == "" {
		t = def
	}
	themeCache.Store(key, t)
	return t
}

// handleSetUserTheme: POST /api/user/theme  body: {"theme":"orgrimmar"}
func handleSetUserTheme(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	c, err := r.Cookie("session_user")
	if err != nil || strings.TrimSpace(c.Value) == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	username := strings.TrimSpace(c.Value)

	var req struct {
		Theme string `json:"theme"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}
	theme := sanitizeTheme(req.Theme)
	if theme == "" {
		http.Error(w, "Unknown theme", http.StatusBadRequest)
		return
	}

	id, ok := accountIDByUsername(username)
	if !ok {
		http.Error(w, "Account not found", http.StatusUnauthorized)
		return
	}
	updateDB, err := sql.Open("mysql", config.UpdateDSN())
	if err != nil {
		http.Error(w, "Update DB Error", http.StatusInternalServerError)
		return
	}
	defer updateDB.Close()

	if _, err := updateDB.Exec(
		`INSERT INTO user_profiles (user_id, web_theme) VALUES (?, ?)
		 ON DUPLICATE KEY UPDATE web_theme = VALUES(web_theme)`, id, theme,
	); err != nil {
		log.Printf("Set Theme Error: %v", err)
		http.Error(w, "Save failed", http.StatusInternalServerError)
		return
	}
	themeCache.Store(strings.ToLower(username), theme)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"ok": true, "theme": theme})
}
