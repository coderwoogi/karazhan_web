package admin

import (
	"database/sql"
	"encoding/json"
	"html/template"
	"karazhan/pkg/config"
	"log"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

type webGuardSettings struct {
	Enabled     bool     `json:"enabled"`
	AllowedIP   []string `json:"allowedIps"`
	DisplayMode string   `json:"displayMode"`
	Title       string   `json:"title"`
	Message     string   `json:"message"`
	UpdatedBy   string   `json:"updatedBy"`
	UpdatedAt   string   `json:"updatedAt"`
}

var (
	webGuardState   webGuardSettings
	webGuardStateMu sync.RWMutex
)

func registerWebGuardRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/admin/web-guard", handleWebGuard)
}

func WithPublicAccessGuard(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if shouldBypassWebGuard(r) {
			next.ServeHTTP(w, r)
			return
		}

		settings, err := loadWebGuardState()
		if err != nil {
			log.Printf("[web-guard] load failed: %v", err)
			next.ServeHTTP(w, r)
			return
		}
		if !settings.Enabled {
			next.ServeHTTP(w, r)
			return
		}

		clientIP := extractClientIP(r)
		if clientIP == "" || !isAllowedIP(settings.AllowedIP, clientIP) {
			renderWebGuardBlockedPage(w, settings)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func handleWebGuard(w http.ResponseWriter, r *http.Request) {
	if !isAdminRequest(r) {
		http.Error(w, "관리자 권한이 필요합니다.", http.StatusForbidden)
		return
	}

	switch r.Method {
	case http.MethodGet:
		settings, err := loadWebGuardState()
		if err != nil {
			http.Error(w, "웹 접근 제어 정보를 불러오지 못했습니다.", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"enabled":     settings.Enabled,
			"allowedIps":  settings.AllowedIP,
			"displayMode": settings.DisplayMode,
			"title":       settings.Title,
			"message":     settings.Message,
			"updatedBy":   settings.UpdatedBy,
			"updatedAt":   settings.UpdatedAt,
			"clientIp":    extractClientIP(r),
		})
	case http.MethodPost:
		var req struct {
			Enabled     bool   `json:"enabled"`
			AllowedIPs  string `json:"allowedIps"`
			DisplayMode string `json:"displayMode"`
			Title       string `json:"title"`
			Message     string `json:"message"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "요청 형식이 올바르지 않습니다.", http.StatusBadRequest)
			return
		}

		parsedIPs, invalid := parseAllowedIPInput(req.AllowedIPs)
		if invalid != "" {
			http.Error(w, "허용 IP 형식이 올바르지 않습니다: "+invalid, http.StatusBadRequest)
			return
		}
		if req.Enabled && len(parsedIPs) == 0 {
			http.Error(w, "웹 접근 제한을 켜려면 최소 1개의 허용 IP가 필요합니다.", http.StatusBadRequest)
			return
		}
		mode := normalizeWebGuardMode(req.DisplayMode)
		title := strings.TrimSpace(req.Title)
		message := strings.TrimSpace(req.Message)
		if title == "" {
			title = defaultWebGuardTitle(mode)
		}
		if message == "" {
			message = defaultWebGuardMessage(mode)
		}

		db, err := config.OpenMySQL(config.UpdateDSN())
		if err != nil {
			http.Error(w, "설정 DB 연결에 실패했습니다.", http.StatusInternalServerError)
			return
		}
		defer db.Close()
		ensureWebGuardTable(db)

		username := currentAdminUsername(r)
		joined := strings.Join(parsedIPs, "\n")
		_, err = db.Exec(`
			INSERT INTO web_access_guard_settings (id, enabled, allowed_ips, display_mode, title_text, message_text, updated_by)
			VALUES (1, ?, ?, ?, ?, ?, ?)
			ON DUPLICATE KEY UPDATE enabled=VALUES(enabled), allowed_ips=VALUES(allowed_ips), display_mode=VALUES(display_mode), title_text=VALUES(title_text), message_text=VALUES(message_text), updated_by=VALUES(updated_by), updated_at=NOW()
		`, boolToTinyInt(req.Enabled), joined, mode, title, message, username)
		if err != nil {
			http.Error(w, "웹 접근 제어 저장에 실패했습니다.", http.StatusInternalServerError)
			return
		}

		settings := webGuardSettings{
			Enabled:     req.Enabled,
			AllowedIP:   parsedIPs,
			DisplayMode: mode,
			Title:       title,
			Message:     message,
			UpdatedBy:   username,
			UpdatedAt:   time.Now().Format("2006-01-02 15:04:05"),
		}
		setCachedWebGuardState(settings)

		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"ok":          true,
			"enabled":     settings.Enabled,
			"allowedIps":  settings.AllowedIP,
			"displayMode": settings.DisplayMode,
			"title":       settings.Title,
			"message":     settings.Message,
			"updatedBy":   settings.UpdatedBy,
			"updatedAt":   settings.UpdatedAt,
		})
	default:
		http.Error(w, "허용되지 않은 요청 방식입니다.", http.StatusMethodNotAllowed)
	}
}

func shouldBypassWebGuard(r *http.Request) bool {
	if r == nil {
		return true
	}
	if isAdminRequest(r) {
		return true
	}
	path := strings.ToLower(r.URL.Path)
	switch {
	case strings.HasPrefix(path, "/admin"),
		strings.HasPrefix(path, "/legacy-admin"),
		strings.HasPrefix(path, "/login"),
		strings.HasPrefix(path, "/register"),
		strings.HasPrefix(path, "/api/login"),
		strings.HasPrefix(path, "/api/logout"),
		strings.HasPrefix(path, "/favicon.ico"):
		return true
	default:
		return false
	}
}

func loadWebGuardState() (webGuardSettings, error) {
	webGuardStateMu.RLock()
	cached := webGuardState
	webGuardStateMu.RUnlock()
	if cached.UpdatedAt != "" || cached.Enabled || len(cached.AllowedIP) > 0 || cached.DisplayMode != "" || cached.Title != "" || cached.Message != "" {
		return cached, nil
	}

	db, err := config.OpenMySQL(config.UpdateDSN())
	if err != nil {
		return webGuardSettings{}, err
	}
	defer db.Close()
	ensureWebGuardTable(db)

	state, err := queryWebGuardState(db)
	if err != nil {
		return webGuardSettings{}, err
	}
	setCachedWebGuardState(state)
	return state, nil
}

func queryWebGuardState(db *sql.DB) (webGuardSettings, error) {
	var enabled int
	var allowedRaw string
	var displayMode string
	var title string
	var message string
	var updatedBy string
	var updatedAt string
	err := db.QueryRow(`
		SELECT enabled, IFNULL(allowed_ips, ''), IFNULL(display_mode, ''), IFNULL(title_text, ''), IFNULL(message_text, ''), IFNULL(updated_by, ''), IFNULL(DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s'), '')
		FROM web_access_guard_settings
		WHERE id = 1
		LIMIT 1
	`).Scan(&enabled, &allowedRaw, &displayMode, &title, &message, &updatedBy, &updatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return webGuardSettings{
				Enabled:     false,
				AllowedIP:   []string{},
				DisplayMode: "maintenance",
				Title:       defaultWebGuardTitle("maintenance"),
				Message:     defaultWebGuardMessage("maintenance"),
			}, nil
		}
		return webGuardSettings{}, err
	}
	ips, _ := parseAllowedIPInput(allowedRaw)
	mode := normalizeWebGuardMode(displayMode)
	if strings.TrimSpace(title) == "" {
		title = defaultWebGuardTitle(mode)
	}
	if strings.TrimSpace(message) == "" {
		message = defaultWebGuardMessage(mode)
	}
	return webGuardSettings{
		Enabled:     enabled == 1,
		AllowedIP:   ips,
		DisplayMode: mode,
		Title:       title,
		Message:     message,
		UpdatedBy:   updatedBy,
		UpdatedAt:   updatedAt,
	}, nil
}

func setCachedWebGuardState(state webGuardSettings) {
	webGuardStateMu.Lock()
	defer webGuardStateMu.Unlock()
	webGuardState = state
}

func ensureWebGuardTable(db *sql.DB) {
	_, _ = db.Exec(`
		CREATE TABLE IF NOT EXISTS web_access_guard_settings (
			id TINYINT NOT NULL PRIMARY KEY,
			enabled TINYINT(1) NOT NULL DEFAULT 0,
			allowed_ips LONGTEXT NOT NULL,
			display_mode VARCHAR(32) NOT NULL DEFAULT 'maintenance',
			title_text VARCHAR(255) NOT NULL DEFAULT '',
			message_text TEXT NOT NULL,
			updated_by VARCHAR(64) NOT NULL DEFAULT '',
			updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
	`)
	_, _ = db.Exec("ALTER TABLE web_access_guard_settings ADD COLUMN display_mode VARCHAR(32) NOT NULL DEFAULT 'maintenance' AFTER allowed_ips")
	_, _ = db.Exec("ALTER TABLE web_access_guard_settings ADD COLUMN title_text VARCHAR(255) NOT NULL DEFAULT '' AFTER display_mode")
	_, _ = db.Exec("ALTER TABLE web_access_guard_settings ADD COLUMN message_text TEXT NOT NULL AFTER title_text")
	_, _ = db.Exec(`
		INSERT INTO web_access_guard_settings (id, enabled, allowed_ips, display_mode, title_text, message_text, updated_by)
		VALUES (1, 0, '', 'maintenance', '서비스 점검 중입니다', '현재 웹 접근이 제한되어 있습니다. 관리자에게 허용된 IP에서만 접속할 수 있습니다.', '')
		ON DUPLICATE KEY UPDATE id=id
	`)
}

func parseAllowedIPInput(raw string) ([]string, string) {
	fields := strings.FieldsFunc(raw, func(r rune) bool {
		return r == '\n' || r == '\r' || r == ',' || r == ';' || r == '\t'
	})
	ips := make([]string, 0, len(fields))
	seen := make(map[string]struct{})
	for _, field := range fields {
		item := strings.TrimSpace(field)
		if item == "" {
			continue
		}
		if _, _, err := net.ParseCIDR(item); err != nil {
			if net.ParseIP(item) == nil {
				return nil, item
			}
		}
		if _, ok := seen[item]; ok {
			continue
		}
		seen[item] = struct{}{}
		ips = append(ips, item)
	}
	return ips, ""
}

func extractClientIP(r *http.Request) string {
	if r == nil {
		return ""
	}
	if forwarded := strings.TrimSpace(r.Header.Get("X-Forwarded-For")); forwarded != "" {
		parts := strings.Split(forwarded, ",")
		if len(parts) > 0 {
			ip := strings.TrimSpace(parts[0])
			if parsed := net.ParseIP(ip); parsed != nil {
				return parsed.String()
			}
		}
	}
	if realIP := strings.TrimSpace(r.Header.Get("X-Real-IP")); realIP != "" {
		if parsed := net.ParseIP(realIP); parsed != nil {
			return parsed.String()
		}
	}
	host, _, err := net.SplitHostPort(strings.TrimSpace(r.RemoteAddr))
	if err == nil {
		if parsed := net.ParseIP(host); parsed != nil {
			return parsed.String()
		}
	}
	if parsed := net.ParseIP(strings.TrimSpace(r.RemoteAddr)); parsed != nil {
		return parsed.String()
	}
	return ""
}

func isAllowedIP(allowed []string, ip string) bool {
	parsed := net.ParseIP(strings.TrimSpace(ip))
	if parsed == nil {
		return false
	}
	for _, item := range allowed {
		item = strings.TrimSpace(item)
		if item == "" {
			continue
		}
		if _, cidr, err := net.ParseCIDR(item); err == nil {
			if cidr.Contains(parsed) {
				return true
			}
			continue
		}
		if allowedIP := net.ParseIP(item); allowedIP != nil && allowedIP.Equal(parsed) {
			return true
		}
	}
	return false
}

func boolToTinyInt(v bool) int {
	if v {
		return 1
	}
	return 0
}

func renderWebGuardBlockedPage(w http.ResponseWriter, settings webGuardSettings) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(webGuardStatusCode(settings.DisplayMode))

	tpl := template.Must(template.New("web-guard-blocked").Parse(`<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{{.Title}}</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #09060f;
      --panel: rgba(20, 14, 31, 0.94);
      --line: rgba(218, 183, 109, 0.22);
      --text: #f4ecdc;
      --muted: #baad92;
      --gold: #f4d58a;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      background:
        radial-gradient(circle at top, rgba(127, 69, 205, 0.22), transparent 42%),
        linear-gradient(180deg, #140c20 0%, #08050d 100%);
      font-family: "Noto Sans KR", "Malgun Gothic", sans-serif;
      color: var(--text);
    }
    .panel {
      width: min(100%, 760px);
      padding: 42px 36px;
      border: 1px solid var(--line);
      background: var(--panel);
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.4);
      position: relative;
      overflow: hidden;
    }
    .panel::before {
      content: "";
      position: absolute;
      inset: 0 0 auto 0;
      height: 3px;
      background: linear-gradient(135deg, rgba(153, 92, 255, 0.95), rgba(86, 42, 170, 0.95));
    }
    .badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 98px;
      height: 34px;
      padding: 0 14px;
      border: 1px solid rgba(218, 183, 109, 0.3);
      color: var(--gold);
      background: rgba(255, 255, 255, 0.03);
      font-size: 13px;
      letter-spacing: 0.08em;
    }
    h1 {
      margin: 18px 0 14px;
      font-size: clamp(30px, 5vw, 44px);
      line-height: 1.2;
      color: #fff3d0;
    }
    p {
      margin: 0;
      font-size: 16px;
      line-height: 1.8;
      color: var(--muted);
      word-break: keep-all;
    }
  </style>
</head>
<body>
  <main class="panel">
    <div class="badge">WEB ACCESS</div>
    <h1>{{.Title}}</h1>
    <p>{{.Message}}</p>
  </main>
</body>
</html>`))
	_ = tpl.Execute(w, map[string]string{
		"Title":   settings.Title,
		"Message": settings.Message,
	})
}

func normalizeWebGuardMode(v string) string {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "404", "notfound":
		return "404"
	case "403", "forbidden":
		return "403"
	case "503":
		return "503"
	case "maintenance", "점검":
		return "maintenance"
	default:
		return "maintenance"
	}
}

func webGuardStatusCode(mode string) int {
	switch normalizeWebGuardMode(mode) {
	case "404":
		return http.StatusNotFound
	case "403":
		return http.StatusForbidden
	case "503", "maintenance":
		return http.StatusServiceUnavailable
	default:
		return http.StatusServiceUnavailable
	}
}

func defaultWebGuardTitle(mode string) string {
	switch normalizeWebGuardMode(mode) {
	case "404":
		return "페이지를 찾을 수 없습니다"
	case "403":
		return "권한이 없습니다"
	case "503":
		return "서비스를 이용할 수 없습니다"
	default:
		return "서비스 점검 중입니다"
	}
}

func defaultWebGuardMessage(mode string) string {
	switch normalizeWebGuardMode(mode) {
	case "404":
		return "요청한 페이지를 찾을 수 없습니다."
	case "403":
		return "현재 접속은 허용되지 않습니다."
	case "503":
		return "현재 웹 접근이 일시적으로 제한되어 있습니다."
	default:
		return "현재 웹 접근이 제한되어 있습니다. 관리자에게 허용된 IP에서만 접속할 수 있습니다."
	}
}
