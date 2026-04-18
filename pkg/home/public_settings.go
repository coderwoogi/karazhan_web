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
    "background": "/img/main_bg.png?v=20260416_1",
    "eyebrow": "\uC804\uC124\uC758 \uC131\uCC44\uAC00 \uB2F9\uC2E0\uC744 \uBD80\uB978\uB2E4",
    "title": "\uCE74\uB77C\uC794",
    "subtitle": "\uBAA8\uD5D8\uC758 \uC2DC\uAC04, \uC6B4\uBA85\uC758 \uC138\uACC4\uB85C",
    "description": "\uC5B4\uB460\uC774 \uAE43\uB4E0 \uC131\uCC44\uC640 \uBCF4\uB78F\uBE5B \uB9C8\uB825\uC758 \uADE0\uC5F4 \uC18D\uC5D0\uC11C \uC0C8\uB85C\uC6B4 \uB3C4\uC804\uC774 \uC2DC\uC791\uB429\uB2C8\uB2E4. \uC811\uC18D \uBC29\uBC95\uBD80\uD130 \uB358\uC804 \uBCF4\uC0C1, \uCE74\uB4DC \uBF51\uAE30, \uC120\uC220\uC9D1\uAE4C\uC9C0 \uD544\uC694\uD55C \uC815\uBCF4\uB97C \uD55C \uD654\uBA74\uC5D0\uC11C \uBE60\uB974\uAC8C \uD655\uC778\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4."
  },
  "nav": [
    {"label": "\uACF5\uC9C0\uC0AC\uD56D", "url": "#notice-section"},
    {"label": "\uC811\uC18D\uBC29\uBC95", "url": "#connect-section"},
    {"label": "\uCE74\uB4DC\uBF51\uAE30", "url": "/carddraw/"},
    {"label": "\uC120\uC220\uC9D1", "url": "/shop/"},
    {"label": "\uCEE4\uBBA4\uB2C8\uD2F0", "url": "#community-section"},
    {"label": "\uAC00\uC774\uB4DC", "url": "#guide-section"},
    {"label": "\uACBD\uB9E4\uC7A5", "url": "#auction-section"}
  ],
  "cards": [
    {"title": "\uADF8\uB9BC\uC790 \uC2DC\uB828", "description": "\uB0B4 \uCE90\uB9AD\uD130\uC758 \uD55C\uACC4\uB97C \uC2DC\uD5D8\uD558\uACE0 \uB2E8\uACC4\uBCC4 \uAE30\uB85D\uC744 \uACBD\uC2E0\uD558\uC138\uC694.", "image": "/img/shop_bg.jpg", "url": "#"},
    {"title": "\uC7A5\uBE44 \uAC15\uD654 \uC2DC\uC2A4\uD15C", "description": "\uC7A5\uBE44 \uC131\uC7A5\uACFC \uD2B9\uC218 \uC635\uC158\uC73C\uB85C \uCE90\uB9AD\uD130\uB97C \uB354 \uAC15\uD558\uAC8C \uB9CC\uB4DC\uC138\uC694.", "image": "/img/carddraw.png", "url": "#"},
    {"title": "\uC778\uC2A4\uD134\uC2A4 \uBCF4\uB108\uC2A4 \uBBF8\uC158", "description": "\uB358\uC804\uACFC \uB808\uC774\uB4DC\uB9C8\uB2E4 \uCD94\uAC00 \uBAA9\uD45C\uB97C \uB2EC\uC131\uD558\uACE0 \uBCF4\uC0C1\uC744 \uD68D\uB4DD\uD558\uC138\uC694.", "image": "/img/hearthstone-heroes-warcraft-2015-04-27.webp", "url": "#"}
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

