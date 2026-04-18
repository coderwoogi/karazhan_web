package admin

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"karazhan/pkg/config"
	"net/http"
	"strings"
)

func registerHomeSettingsRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/admin/home/settings", handleHomeSettingsGet)
	mux.HandleFunc("/api/admin/home/draft", handleHomeSettingsDraft)
	mux.HandleFunc("/api/admin/home/publish", handleHomeSettingsPublish)
}

func handleHomeSettingsGet(w http.ResponseWriter, r *http.Request) {
	if !isAdminRequest(r) {
		http.Error(w, "관리자 권한이 필요합니다.", http.StatusForbidden)
		return
	}
	db, err := config.OpenMySQL(config.UpdateDSN())
	if err != nil {
		http.Error(w, "설정 DB 연결에 실패했습니다.", http.StatusInternalServerError)
		return
	}
	defer db.Close()
	ensureHomeSettingsTable(db)

	draft, _ := loadHomeSetting(db, "draft")
	published, _ := loadHomeSetting(db, "published")
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"defaultContent": json.RawMessage(defaultAdminHomeJSON),
		"draft":          draft,
		"published":      published,
	})
}

func handleHomeSettingsDraft(w http.ResponseWriter, r *http.Request) {
	saveHomeSetting(w, r, "draft")
}

func handleHomeSettingsPublish(w http.ResponseWriter, r *http.Request) {
	saveHomeSetting(w, r, "published")
}

func saveHomeSetting(w http.ResponseWriter, r *http.Request, status string) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST 요청만 허용됩니다.", http.StatusMethodNotAllowed)
		return
	}
	if !isAdminRequest(r) {
		http.Error(w, "관리자 권한이 필요합니다.", http.StatusForbidden)
		return
	}

	var req struct {
		Content json.RawMessage `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "요청 본문을 읽을 수 없습니다.", http.StatusBadRequest)
		return
	}
	if !json.Valid(req.Content) || len(req.Content) == 0 {
		http.Error(w, "홈 설정 JSON 형식이 올바르지 않습니다.", http.StatusBadRequest)
		return
	}

	db, err := config.OpenMySQL(config.UpdateDSN())
	if err != nil {
		http.Error(w, "설정 DB 연결에 실패했습니다.", http.StatusInternalServerError)
		return
	}
	defer db.Close()
	ensureHomeSettingsTable(db)

	username := currentAdminUsername(r)
	tx, err := db.Begin()
	if err != nil {
		http.Error(w, "저장 트랜잭션을 시작할 수 없습니다.", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	if status == "published" {
		if _, err := tx.Exec("UPDATE web_home_settings SET status = 'archived' WHERE status = 'published'"); err != nil {
			http.Error(w, "기존 배포 설정 정리에 실패했습니다.", http.StatusInternalServerError)
			return
		}
	}

	version, err := nextHomeVersion(tx)
	if err != nil {
		http.Error(w, "버전 계산에 실패했습니다.", http.StatusInternalServerError)
		return
	}
	publishedAt := "NULL"
	if status == "published" {
		publishedAt = "NOW()"
	}
	query := fmt.Sprintf(`
		INSERT INTO web_home_settings
			(version, status, content_json, created_by, updated_by, published_by, published_at)
		VALUES (?, ?, ?, ?, ?, ?, %s)
	`, publishedAt)
	publishedBy := ""
	if status == "published" {
		publishedBy = username
	}
	if _, err := tx.Exec(query, version, status, string(req.Content), username, username, publishedBy); err != nil {
		http.Error(w, "홈 설정 저장에 실패했습니다.", http.StatusInternalServerError)
		return
	}
	if err := tx.Commit(); err != nil {
		http.Error(w, "홈 설정 저장 완료에 실패했습니다.", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"ok": true, "status": status, "version": version})
}

func loadHomeSetting(db *sql.DB, status string) (map[string]interface{}, error) {
	row := db.QueryRow(`
		SELECT id, version, status, content_json, IFNULL(updated_by, ''), IFNULL(DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s'), ''),
		       IFNULL(published_by, ''), IFNULL(DATE_FORMAT(published_at, '%Y-%m-%d %H:%i:%s'), '')
		FROM web_home_settings
		WHERE status = ?
		ORDER BY version DESC, id DESC
		LIMIT 1
	`, status)
	var id int64
	var version int
	var st, content, updatedBy, updatedAt, publishedBy, publishedAt string
	if err := row.Scan(&id, &version, &st, &content, &updatedBy, &updatedAt, &publishedBy, &publishedAt); err != nil {
		return nil, err
	}
	if !json.Valid([]byte(content)) {
		content = defaultAdminHomeJSON
	}
	return map[string]interface{}{
		"id":          id,
		"version":     version,
		"status":      st,
		"content":     json.RawMessage(content),
		"updatedBy":   updatedBy,
		"updatedAt":   updatedAt,
		"publishedBy": publishedBy,
		"publishedAt": publishedAt,
	}, nil
}

func nextHomeVersion(tx *sql.Tx) (int, error) {
	var current sql.NullInt64
	if err := tx.QueryRow("SELECT MAX(version) FROM web_home_settings").Scan(&current); err != nil {
		return 0, err
	}
	if !current.Valid || current.Int64 < 1 {
		return 1, nil
	}
	return int(current.Int64) + 1, nil
}

func currentAdminUsername(r *http.Request) string {
	cookie, err := r.Cookie("session_user")
	if err != nil {
		return ""
	}
	return strings.TrimSpace(cookie.Value)
}

func ensureHomeSettingsTable(db *sql.DB) {
	_, _ = db.Exec(`
		CREATE TABLE IF NOT EXISTS web_home_settings (
			id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
			version INT NOT NULL DEFAULT 1,
			status VARCHAR(20) NOT NULL DEFAULT 'draft',
			content_json LONGTEXT NOT NULL,
			created_by VARCHAR(64) NOT NULL DEFAULT '',
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_by VARCHAR(64) NOT NULL DEFAULT '',
			updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			published_by VARCHAR(64) NOT NULL DEFAULT '',
			published_at DATETIME NULL,
			KEY idx_status_version (status, version)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
	`)
}

const defaultAdminHomeJSON = `{
  "logo": "/img/wowlogo_white.png",
  "hero": {
    "background": "/img/bg.jpeg?v=20260416_1",
    "eyebrow": "전설의 성채가 당신을 부른다",
    "title": "카라잔",
    "subtitle": "모험의 시간, 운명의 세계로",
    "description": "어둠이 깃든 성채와 보랏빛 마력의 균열 속에서 새로운 도전이 시작됩니다. 접속 방법부터 던전 보상, 카드 뽑기, 선술집까지 필요한 정보를 한 화면에서 빠르게 확인할 수 있습니다."
  },
  "nav": [
    {"label": "공지사항", "url": "#notice-section"},
    {"label": "접속방법", "url": "#connect-section"},
    {"label": "카드뽑기", "url": "/carddraw/"},
    {"label": "선술집", "url": "/shop/"},
    {"label": "커뮤니티", "url": "#community-section"},
    {"label": "가이드", "url": "#guide-section"},
    {"label": "경매장", "url": "#auction-section"}
  ],
  "cards": [
    {"title": "그림자 시련", "description": "내 캐릭터의 한계를 시험하고 단계별 기록을 경신하세요.", "image": "/img/shop_bg.jpg", "url": "#"},
    {"title": "장비 강화 시스템", "description": "장비 성장과 특수 옵션으로 캐릭터를 더 강하게 만드세요.", "image": "/img/carddraw.png", "url": "#"},
    {"title": "인스턴스 보너스 미션", "description": "던전과 레이드마다 추가 목표를 달성하고 보상을 획득하세요.", "image": "/img/hearthstone-heroes-warcraft-2015-04-27.webp", "url": "#"}
  ]
}`
