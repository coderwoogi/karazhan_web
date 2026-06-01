package admin

import (
	"database/sql"
	"html/template"
	"karazhan/pkg/config"
	"log"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"

	_ "github.com/go-sql-driver/mysql"
)

type adminAccessState int

const (
	adminAccessAllowed adminAccessState = iota
	adminAccessUnauthorized
	adminAccessForbidden
	adminAccessUnavailable
)

func RegisterRoutes(mux *http.ServeMux) {
	registerHomeSettingsRoutes(mux)
	registerWebGuardRoutes(mux)

	mux.HandleFunc("/admin", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/admin/", http.StatusFound)
	})

	mux.HandleFunc("/legacy-admin", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/legacy-admin/", http.StatusFound)
	})

	mux.HandleFunc("/legacy-admin/", func(w http.ResponseWriter, r *http.Request) {
		if !guardAdminRequest(w, r) {
			return
		}

		serveAdminStatic(w, r, "/legacy-admin/")
	})

	mux.HandleFunc("/admin/", func(w http.ResponseWriter, r *http.Request) {
		if !guardAdminRequest(w, r) {
			return
		}

		w.Header().Set("Cache-Control", "no-cache")
		if r.URL.Path == "/admin/" {
			http.ServeFile(w, r, "./pkg/admin/static/index.html")
			return
		}

		serveAdminStatic(w, r, "/admin/")
	})
}

func guardAdminRequest(w http.ResponseWriter, r *http.Request) bool {
	state := adminAccessStatus(r)
	switch state {
	case adminAccessAllowed:
		return true
	case adminAccessUnauthorized:
		renderAdminStatePage(w, http.StatusForbidden, "접근할 수 없습니다", "관리자 화면은 로그인한 관리자만 접근할 수 있습니다.")
	case adminAccessForbidden:
		renderAdminStatePage(w, http.StatusForbidden, "권한이 없습니다", "현재 계정에는 관리자 화면 접근 권한이 없습니다.")
	default:
		renderAdminStatePage(w, http.StatusServiceUnavailable, "서비스를 이용할 수 없습니다", "관리자 권한 확인 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.")
	}
	return false
}

func isAdminRequest(r *http.Request) bool {
	return adminAccessStatus(r) == adminAccessAllowed
}

func adminAccessStatus(r *http.Request) adminAccessState {
	cookie, err := r.Cookie("session_user")
	if err != nil || strings.TrimSpace(cookie.Value) == "" {
		return adminAccessUnauthorized
	}
	username := strings.TrimSpace(cookie.Value)

	authDB, err := config.OpenMySQL(config.AuthDSN())
	if err != nil {
		log.Printf("[admin] auth db open failed: %v", err)
		return adminAccessUnavailable
	}
	defer authDB.Close()

	var accountID int
	var gmLevel int
	err = authDB.QueryRow(`
		SELECT a.id, IFNULL(MAX(aa.gmlevel), 0)
		FROM account a
		LEFT JOIN account_access aa ON aa.id = a.id
		WHERE UPPER(a.username) = UPPER(?)
		GROUP BY a.id
	`, username).Scan(&accountID, &gmLevel)
	if err != nil {
		if err != sql.ErrNoRows {
			log.Printf("[admin] account permission lookup failed: %v", err)
			return adminAccessUnavailable
		}
		return adminAccessForbidden
	}
	if gmLevel > 0 {
		return adminAccessAllowed
	}

	updateDB, err := config.OpenMySQL(config.UpdateDSN())
	if err != nil {
		log.Printf("[admin] update db open failed: %v", err)
		return adminAccessUnavailable
	}
	defer updateDB.Close()

	var webRank int
	if err := updateDB.QueryRow("SELECT IFNULL(web_rank, 0) FROM user_profiles WHERE user_id = ?", accountID).Scan(&webRank); err != nil && err != sql.ErrNoRows {
		log.Printf("[admin] web rank lookup failed: %v", err)
		return adminAccessUnavailable
	}
	if webRank > 0 {
		return adminAccessAllowed
	}
	return adminAccessForbidden
}

func serveAdminStatic(w http.ResponseWriter, r *http.Request, prefix string) {
	relPath := strings.TrimPrefix(r.URL.Path, prefix)
	relPath = strings.TrimPrefix(relPath, "/")
	if relPath == "" {
		http.ServeFile(w, r, "./pkg/admin/static/index.html")
		return
	}

	cleanPath := path.Clean("/" + relPath)
	if cleanPath == "/" {
		http.ServeFile(w, r, "./pkg/admin/static/index.html")
		return
	}

	staticRoot, err := filepath.Abs("./pkg/admin/static")
	if err != nil {
		log.Printf("[admin] static root resolve failed: %v", err)
		renderAdminStatePage(w, http.StatusServiceUnavailable, "서비스를 이용할 수 없습니다", "관리자 정적 파일 경로를 확인하지 못했습니다.")
		return
	}

	targetPath := filepath.Join(staticRoot, filepath.FromSlash(strings.TrimPrefix(cleanPath, "/")))
	targetAbs, err := filepath.Abs(targetPath)
	if err != nil {
		log.Printf("[admin] static target resolve failed: %v", err)
		renderAdminStatePage(w, http.StatusServiceUnavailable, "서비스를 이용할 수 없습니다", "관리자 정적 파일 경로를 확인하지 못했습니다.")
		return
	}
	if !strings.HasPrefix(targetAbs, staticRoot) {
		renderAdminStatePage(w, http.StatusNotFound, "페이지를 찾을 수 없습니다", "요청한 관리자 리소스를 찾을 수 없습니다.")
		return
	}

	info, err := os.Stat(targetAbs)
	if err != nil || info.IsDir() {
		renderAdminStatePage(w, http.StatusNotFound, "페이지를 찾을 수 없습니다", "요청한 관리자 리소스를 찾을 수 없습니다.")
		return
	}
	http.ServeFile(w, r, targetAbs)
}

func renderAdminStatePage(w http.ResponseWriter, status int, title, description string) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(status)

	tpl := template.Must(template.New("admin-state").Parse(`<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{{.Title}}</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #09060f;
      --panel: rgba(20, 14, 31, 0.92);
      --line: rgba(218, 183, 109, 0.24);
      --gold: #f4d58a;
      --text: #f4ecdc;
      --muted: #b8ad95;
      --accent: linear-gradient(135deg, rgba(153, 92, 255, 0.95), rgba(86, 42, 170, 0.95));
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
        radial-gradient(circle at top, rgba(106, 53, 173, 0.24), transparent 42%),
        linear-gradient(180deg, #120c1d 0%, #08050d 100%);
      font-family: "Noto Sans KR", "Malgun Gothic", sans-serif;
      color: var(--text);
    }
    .state-card {
      width: min(100%, 720px);
      padding: 40px 36px;
      border: 1px solid var(--line);
      background: var(--panel);
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45);
      position: relative;
      overflow: hidden;
    }
    .state-card::before {
      content: "";
      position: absolute;
      inset: 0 0 auto 0;
      height: 3px;
      background: var(--accent);
    }
    .badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 78px;
      height: 34px;
      padding: 0 14px;
      border: 1px solid rgba(218, 183, 109, 0.28);
      color: var(--gold);
      background: rgba(255, 255, 255, 0.03);
      font-size: 13px;
      letter-spacing: 0.08em;
    }
    h1 {
      margin: 18px 0 12px;
      font-size: clamp(30px, 5vw, 42px);
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
    .actions {
      margin-top: 28px;
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }
    .button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 148px;
      height: 44px;
      padding: 0 18px;
      border: 1px solid rgba(218, 183, 109, 0.24);
      color: var(--text);
      text-decoration: none;
      background: rgba(255, 255, 255, 0.04);
    }
    .button.primary {
      color: #fff5da;
      background: linear-gradient(135deg, rgba(119, 56, 224, 0.95), rgba(82, 37, 170, 0.95));
      border-color: rgba(187, 140, 255, 0.42);
      box-shadow: 0 12px 28px rgba(64, 21, 135, 0.35);
    }
  </style>
</head>
<body>
  <main class="state-card">
    <div class="badge">ADMIN</div>
    <h1>{{.Title}}</h1>
    <p>{{.Description}}</p>
    <div class="actions">
      <a class="button primary" href="/">메인으로 이동</a>
      <a class="button" href="/login/">로그인 화면</a>
    </div>
  </main>
</body>
</html>`))

	_ = tpl.Execute(w, map[string]string{
		"Title":       title,
		"Description": description,
	})
}
