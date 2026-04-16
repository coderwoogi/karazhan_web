package home

import (
	"database/sql"
	"encoding/json"
	"karazhan/pkg/config"
	"log"
	"net/http"

	_ "github.com/go-sql-driver/mysql"
)

const defaultPublicHomeJSON = `{
  "logo": "/img/wowlogo_white.png",
  "hero": {
    "background": "/img/karazhan-purple-web-bg-wide.jpeg",
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

func handlePublicHomeSettings(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	content := defaultPublicHomeJSON

	db, err := config.OpenMySQL(config.UpdateDSN())
	if err != nil {
		log.Printf("[public-home] update db open failed, using default: %v", err)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"content": rawJSON(content), "source": "default"})
		return
	}
	defer db.Close()

	ensurePublicHomeSettingsTable(db)
	var dbContent string
	err = db.QueryRow(`
		SELECT content_json
		FROM web_home_settings
		WHERE status = 'published'
		ORDER BY version DESC, id DESC
		LIMIT 1
	`).Scan(&dbContent)
	if err == nil && json.Valid([]byte(dbContent)) {
		content = dbContent
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"content": rawJSON(content), "source": "published"})
		return
	}
	if err != nil && err != sql.ErrNoRows {
		log.Printf("[public-home] load published setting failed: %v", err)
	}
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"content": rawJSON(content), "source": "default"})
}

type rawJSON string

func (r rawJSON) MarshalJSON() ([]byte, error) {
	if !json.Valid([]byte(r)) {
		return []byte("null"), nil
	}
	return []byte(r), nil
}

func ensurePublicHomeSettingsTable(db *sql.DB) {
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
