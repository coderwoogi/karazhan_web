package stats

import (
	"bufio"
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"karazhan/pkg/config"
	"karazhan/pkg/services"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"time"

	_ "github.com/go-sql-driver/mysql"
)

func ensureShopPermissionSeeds() {
	db, err := sql.Open("mysql", updateDSN)
	if err != nil {
		return
	}
	defer db.Close()

	_, _ = db.Exec(`CREATE TABLE IF NOT EXISTS web_menu_registry (
		id VARCHAR(100) PRIMARY KEY,
		type VARCHAR(20) NOT NULL DEFAULT 'menu',
		name VARCHAR(120) NOT NULL,
		order_index INT DEFAULT 0
	) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
	_, _ = db.Exec(`INSERT IGNORE INTO web_menu_registry (id, type, name, order_index) VALUES ('shop', 'menu', '선술집', 13)`)
	_, _ = db.Exec(`INSERT IGNORE INTO web_menu_registry (id, type, name, order_index) VALUES ('shop-admin', 'menu', '선술집관리', 96)`)
	_, _ = db.Exec(`UPDATE web_menu_registry SET name = '선술집' WHERE id = 'shop'`)
	_, _ = db.Exec(`UPDATE web_menu_registry SET name = '선술집관리' WHERE id = 'shop-admin'`)

	_, _ = db.Exec(`INSERT IGNORE INTO web_role_permissions (resource_type, resource_id, resource_name, rank_1, rank_2, rank_3, order_index) VALUES ('menu', 'shop', '선술집', 1, 1, 1, 13)`)
	_, _ = db.Exec(`INSERT IGNORE INTO web_role_permissions (resource_type, resource_id, resource_name, rank_1, rank_2, rank_3, order_index) VALUES ('menu', 'shop-admin', '선술집관리', 0, 1, 1, 96)`)
	_, _ = db.Exec(`UPDATE web_role_permissions SET resource_name='선술집', rank_1=1, rank_2=1, rank_3=1, order_index=13 WHERE resource_type='menu' AND resource_id='shop'`)
	_, _ = db.Exec(`UPDATE web_role_permissions SET resource_name='선술집관리', rank_1=0, rank_2=1, rank_3=1, order_index=96 WHERE resource_type='menu' AND resource_id='shop-admin'`)
}

func getSessionUserIDAndName(r *http.Request) (int, string, error) {
	cookie, err := r.Cookie("session_user")
	if err != nil || cookie.Value == "" {
		return 0, "", http.ErrNoCookie
	}
	username := cookie.Value

	authDB, err := sql.Open("mysql", config.AuthDSN())
	if err != nil {
		return 0, "", err
	}
	defer authDB.Close()

	var userID int
	if err := authDB.QueryRow("SELECT id FROM account WHERE username = ?", username).Scan(&userID); err != nil {
		return 0, "", err
	}
	return userID, username, nil
}

func getSenderDisplayNameForShop(updateDB *sql.DB, userID int, username string) string {
	if updateDB != nil && userID > 0 {
		var mainCharName string
		_ = updateDB.QueryRow("SELECT IFNULL(main_char_name, '') FROM user_profiles WHERE user_id = ?", userID).Scan(&mainCharName)
		if strings.TrimSpace(mainCharName) != "" {
			return mainCharName
		}
	}
	if strings.TrimSpace(username) != "" {
		return username
	}
	return "system"
}

func ensurePointShopTables(db *sql.DB) {
	_, _ = db.Exec(`
		CREATE TABLE IF NOT EXISTS point_shop_items (
			id INT AUTO_INCREMENT PRIMARY KEY,
			name VARCHAR(120) NOT NULL,
			item_type VARCHAR(20) NOT NULL DEFAULT 'game',
			item_entry INT NULL,
			function_code VARCHAR(50) NULL,
			icon_path VARCHAR(255) NULL,
			description TEXT NULL,
			price_points INT NOT NULL DEFAULT 0,
			stock_qty INT NOT NULL DEFAULT -1,
			is_visible TINYINT(1) NOT NULL DEFAULT 1,
			is_deleted TINYINT(1) NOT NULL DEFAULT 0,
			created_by INT NULL,
			updated_by INT NULL,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
	`)

	_, _ = db.Exec(`
		CREATE TABLE IF NOT EXISTS point_shop_orders (
			id BIGINT AUTO_INCREMENT PRIMARY KEY,
			user_id INT NOT NULL,
			item_id INT NOT NULL,
			item_name VARCHAR(120) NOT NULL,
			qty INT NOT NULL DEFAULT 1,
			unit_price INT NOT NULL,
			total_price INT NOT NULL,
			status VARCHAR(20) NOT NULL DEFAULT 'pending',
			is_refunded TINYINT(1) NOT NULL DEFAULT 0,
			request_note VARCHAR(500) NULL,
			admin_note VARCHAR(500) NULL,
			processed_by INT NULL,
			processed_at DATETIME NULL,
			is_deleted TINYINT(1) NOT NULL DEFAULT 0,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			INDEX idx_shop_orders_user (user_id, created_at),
			INDEX idx_shop_orders_status (status, created_at)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
	`)

	_, _ = db.Exec(`
		CREATE TABLE IF NOT EXISTS point_shop_order_logs (
			id BIGINT AUTO_INCREMENT PRIMARY KEY,
			order_id BIGINT NOT NULL,
			action VARCHAR(40) NOT NULL,
			actor_user_id INT NULL,
			before_status VARCHAR(20) NULL,
			after_status VARCHAR(20) NULL,
			memo VARCHAR(500) NULL,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			INDEX idx_shop_order_logs_order (order_id, created_at)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
	`)
	_, _ = db.Exec(`
		CREATE TABLE IF NOT EXISTS point_coin_market_listings (
			id BIGINT AUTO_INCREMENT PRIMARY KEY,
			seller_user_id INT NOT NULL,
			seller_username VARCHAR(50) NOT NULL DEFAULT '',
			seller_character VARCHAR(32) NOT NULL,
			gold_copper BIGINT NOT NULL,
			price_points INT NOT NULL,
			status VARCHAR(20) NOT NULL DEFAULT 'active',
			buyer_user_id INT NOT NULL DEFAULT 0,
			buyer_character VARCHAR(32) NOT NULL DEFAULT '',
			points_before_buyer INT NOT NULL DEFAULT 0,
			points_after_buyer INT NOT NULL DEFAULT 0,
			points_before_seller INT NOT NULL DEFAULT 0,
			points_after_seller INT NOT NULL DEFAULT 0,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			INDEX idx_coin_market_status (status, created_at),
			INDEX idx_coin_market_seller (seller_user_id, created_at),
			INDEX idx_coin_market_buyer (buyer_user_id, created_at)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
	`)

	_, _ = db.Exec("ALTER TABLE point_shop_items ADD COLUMN is_deleted TINYINT(1) NOT NULL DEFAULT 0")
	_, _ = db.Exec("ALTER TABLE point_shop_items ADD COLUMN is_visible TINYINT(1) NOT NULL DEFAULT 1")
	_, _ = db.Exec("ALTER TABLE point_shop_items ADD COLUMN item_type VARCHAR(20) NOT NULL DEFAULT 'game'")
	_, _ = db.Exec("ALTER TABLE point_shop_items ADD COLUMN item_entry INT NULL")
	_, _ = db.Exec("ALTER TABLE point_shop_items ADD COLUMN function_code VARCHAR(50) NULL")
	_, _ = db.Exec("ALTER TABLE point_shop_items ADD COLUMN icon_path VARCHAR(255) NULL")
	_, _ = db.Exec("ALTER TABLE point_shop_orders ADD COLUMN is_refunded TINYINT(1) NOT NULL DEFAULT 0")
	_, _ = db.Exec("ALTER TABLE point_shop_orders ADD COLUMN is_deleted TINYINT(1) NOT NULL DEFAULT 0")
	_, _ = db.Exec("ALTER TABLE point_shop_orders ADD COLUMN target_character VARCHAR(20) NULL")
	_, _ = db.Exec("ALTER TABLE point_shop_orders ADD COLUMN points_before INT NOT NULL DEFAULT 0")
	_, _ = db.Exec("ALTER TABLE point_shop_orders ADD COLUMN points_after INT NOT NULL DEFAULT 0")
	_, _ = db.Exec(`
		CREATE TABLE IF NOT EXISTS web_second_account_purchases (
			id BIGINT AUTO_INCREMENT PRIMARY KEY,
			user_id INT NOT NULL,
			order_id BIGINT NOT NULL,
			purchased_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			is_active TINYINT(1) NOT NULL DEFAULT 1,
			admin_note VARCHAR(255) NULL,
			UNIQUE KEY uq_user_second_account (user_id),
			KEY idx_order_id (order_id)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
	`)
	_, _ = db.Exec(`
		CREATE TABLE IF NOT EXISTS web_feature_subscriptions (
			id BIGINT AUTO_INCREMENT PRIMARY KEY,
			user_id INT NOT NULL,
			feature_code VARCHAR(50) NOT NULL,
			started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			expires_at DATETIME NOT NULL,
			last_order_id BIGINT NOT NULL DEFAULT 0,
			total_months INT NOT NULL DEFAULT 0,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			UNIQUE KEY uq_user_feature (user_id, feature_code),
			KEY idx_feature_expires (feature_code, expires_at),
			KEY idx_user_expires (user_id, expires_at)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
	`)
	_, _ = db.Exec("ALTER TABLE web_feature_subscriptions ADD COLUMN last_order_id BIGINT NOT NULL DEFAULT 0")
	_, _ = db.Exec("ALTER TABLE web_feature_subscriptions ADD COLUMN total_months INT NOT NULL DEFAULT 0")
	// 카드뽑기 기능 상품 지급 시 사용하는 계정 횟수 컬럼 보정
	_, _ = db.Exec("ALTER TABLE user_profiles ADD COLUMN carddraw_draw_count INT NOT NULL DEFAULT 0")
	_, _ = db.Exec("ALTER TABLE user_profiles MODIFY COLUMN carddraw_draw_count INT NOT NULL DEFAULT 0")
}
func writeJSON(w http.ResponseWriter, status int, body interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func handleAdminShopIconPackList(w http.ResponseWriter, r *http.Request) {
	if !CheckMenuPermission(w, r, "shop-admin") {
		return
	}
	root := `E:\xampp\htdocs\karazhan\img\iconpack`
	var icons []map[string]string

	_ = filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil || d == nil || d.IsDir() {
			return nil
		}
		ext := strings.ToLower(filepath.Ext(d.Name()))
		if ext != ".png" && ext != ".jpg" && ext != ".jpeg" && ext != ".webp" && ext != ".gif" {
			return nil
		}

		rel, err := filepath.Rel(root, path)
		if err != nil {
			return nil
		}
		rel = filepath.ToSlash(rel)
		urlPath := "/img/iconpack/" + rel
		icons = append(icons, map[string]string{
			"name": d.Name(),
			"path": urlPath,
		})
		return nil
	})

	sort.Slice(icons, func(i, j int) bool {
		return icons[i]["path"] < icons[j]["path"]
	})
	writeJSON(w, http.StatusOK, map[string]interface{}{"status": "success", "icons": icons})
}

type shopWorldSOAPConfig struct {
	Enabled bool
	IP      string
	Port    string
}

func readShopWorldSOAPConfig(path string) shopWorldSOAPConfig {
	cfg := shopWorldSOAPConfig{
		Enabled: false,
		IP:      "127.0.0.1",
		Port:    "7878",
	}
	f, err := os.Open(path)
	if err != nil {
		return cfg
	}
	defer f.Close()

	reKV := regexp.MustCompile(`^\s*([A-Za-z0-9\.\_]+)\s*=\s*(.+?)\s*$`)
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		m := reKV.FindStringSubmatch(line)
		if len(m) != 3 {
			continue
		}
		key := m[1]
		val := strings.Trim(strings.TrimSpace(m[2]), `"`)
		switch key {
		case "SOAP.Enabled":
			cfg.Enabled = val == "1" || strings.EqualFold(val, "true")
		case "SOAP.IP":
			if val != "" {
				cfg.IP = val
			}
		case "SOAP.Port":
			if val != "" {
				cfg.Port = val
			}
		}
	}
	return cfg
}

func escapeShopXML(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	s = strings.ReplaceAll(s, `"`, "&quot;")
	return strings.ReplaceAll(s, "'", "&apos;")
}

func sendShopSOAPCommand(cfg shopWorldSOAPConfig, user, pass, cmd string) error {
	endpoint := fmt.Sprintf("http://%s:%s/", cfg.IP, cfg.Port)
	xmlBody := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<SOAP-ENV:Envelope SOAP-ENV:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"
 xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/"
 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
 xmlns:xsd="http://www.w3.org/2001/XMLSchema">
 <SOAP-ENV:Body>
  <executeCommand xmlns="urn:AC">
   <command>%s</command>
  </executeCommand>
 </SOAP-ENV:Body>
</SOAP-ENV:Envelope>`, escapeShopXML(cmd))

	req, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewBufferString(xmlBody))
	if err != nil {
		return err
	}
	req.SetBasicAuth(user, pass)
	req.Header.Set("Content-Type", "text/xml; charset=utf-8")
	req.Header.Set("SOAPAction", "urn:AC#executeCommand")

	client := &http.Client{Timeout: 8 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	bodyBytes, _ := io.ReadAll(resp.Body)
	body := string(bodyBytes)

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("HTTP %d: %s", resp.StatusCode, strings.TrimSpace(body))
	}
	if strings.Contains(strings.ToLower(body), "fault") {
		return fmt.Errorf("\uc694\uccad \ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4.")
	}
	return nil
}

func runShopFunctionCommand(functionCode, characterName string, r *http.Request) error {
	character := strings.TrimSpace(characterName)
	if character == "" {
		return fmt.Errorf("\uc694\uccad \ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4.")
	}

	code := strings.ToLower(strings.TrimSpace(functionCode))
	var cmd string
	switch code {
	case "level_up", "level80", "level_80":
		cmd = ".character level " + character + " 80"
	case "race_change", "change_race":
		cmd = ".character changerace " + character
	case "rename", "rename_character", "name_change":
		cmd = ".character rename " + character
	default:
		return fmt.Errorf("\uc9c0\uc6d0\ud558\uc9c0 \uc54a\ub294 \uae30\ub2a5 \ucf54\ub4dc\uc785\ub2c8\ub2e4: %s", functionCode)
	}

	baseURL := "http://127.0.0.1:8080"
	if r != nil && strings.TrimSpace(r.Host) != "" {
		scheme := "http"
		if r.TLS != nil {
			scheme = "https"
		}
		baseURL = scheme + "://" + r.Host
	}

	payload := map[string]string{"command": cmd}
	bodyBytes, _ := json.Marshal(payload)
	req, err := http.NewRequest(http.MethodPost, baseURL+"/api/launcher/command", strings.NewReader(string(bodyBytes)))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Caller", "shop")

	client := &http.Client{Timeout: 8 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	respBytes, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("launcher command failed: %s", strings.TrimSpace(string(respBytes)))
	}

	var result map[string]interface{}
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return nil
	}
	if status, ok := result["status"].(string); ok && status != "success" {
		if msg, ok := result["message"].(string); ok && strings.TrimSpace(msg) != "" {
			return fmt.Errorf("%s", msg)
		}
		return fmt.Errorf("launcher command failed")
	}

	return nil
}

func extendFeatureSubscription(tx *sql.Tx, userID int, featureCode string, months int, orderID int64) (time.Time, error) {
	if tx == nil || userID <= 0 || strings.TrimSpace(featureCode) == "" || months <= 0 {
		return time.Time{}, fmt.Errorf("invalid subscription arguments")
	}

	// Ensure schema with broad MySQL/MariaDB compatibility.
	_, _ = tx.Exec(`
		CREATE TABLE IF NOT EXISTS web_feature_subscriptions (
			user_id INT NOT NULL,
			feature_code VARCHAR(50) NOT NULL,
			started_at DATETIME NULL,
			expires_at DATETIME NOT NULL,
			last_order_id BIGINT NOT NULL DEFAULT 0,
			total_months INT NOT NULL DEFAULT 0,
			created_at DATETIME NULL,
			updated_at DATETIME NULL,
			PRIMARY KEY (user_id, feature_code)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
	`)
	_, _ = tx.Exec("ALTER TABLE web_feature_subscriptions ADD COLUMN started_at DATETIME NULL")
	_, _ = tx.Exec("ALTER TABLE web_feature_subscriptions ADD COLUMN last_order_id BIGINT NOT NULL DEFAULT 0")
	_, _ = tx.Exec("ALTER TABLE web_feature_subscriptions ADD COLUMN total_months INT NOT NULL DEFAULT 0")
	_, _ = tx.Exec("ALTER TABLE web_feature_subscriptions ADD COLUMN created_at DATETIME NULL")
	_, _ = tx.Exec("ALTER TABLE web_feature_subscriptions ADD COLUMN updated_at DATETIME NULL")

	now := time.Now()
	var currentExpRaw sql.NullString
	parseDateTime := func(s string) (time.Time, bool) {
		s = strings.TrimSpace(s)
		if s == "" || s == "0000-00-00 00:00:00" {
			return time.Time{}, false
		}
		layouts := []string{
			"2006-01-02 15:04:05",
			time.RFC3339,
			"2006-01-02T15:04:05Z07:00",
		}
		for _, layout := range layouts {
			if t, err := time.ParseInLocation(layout, s, time.Local); err == nil {
				return t, true
			}
		}
		return time.Time{}, false
	}

	var currentExp time.Time
	hasCurrentExp := false
	err := tx.QueryRow(
		"SELECT expires_at FROM web_feature_subscriptions WHERE user_id = ? AND feature_code = ? FOR UPDATE",
		userID, featureCode,
	).Scan(&currentExpRaw)
	if err == nil && currentExpRaw.Valid {
		if parsed, ok := parseDateTime(currentExpRaw.String); ok {
			currentExp = parsed
			hasCurrentExp = true
		}
	}

	base := now
	if err == nil {
		if hasCurrentExp && currentExp.After(now) {
			base = currentExp
		}
		newExp := base.AddDate(0, months, 0)
		if _, uerr := tx.Exec(
			"UPDATE web_feature_subscriptions SET expires_at = ?, last_order_id = ?, total_months = total_months + ?, updated_at = NOW() WHERE user_id = ? AND feature_code = ?",
			newExp, orderID, months, userID, featureCode,
		); uerr != nil {
			return time.Time{}, uerr
		}
		return newExp, nil
	}
	if err != sql.ErrNoRows {
		log.Printf("[shop/extendFeatureSubscription] select error user_id=%d feature=%s err=%v", userID, featureCode, err)
		return time.Time{}, err
	}

	newExp := base.AddDate(0, months, 0)
	if _, ierr := tx.Exec(
		"INSERT INTO web_feature_subscriptions (user_id, feature_code, started_at, expires_at, last_order_id, total_months, created_at, updated_at) VALUES (?, ?, NOW(), ?, ?, ?, NOW(), NOW())",
		userID, featureCode, newExp, orderID, months,
	); ierr != nil {
		return time.Time{}, ierr
	}
	return newExp, nil
}

func isShopWorldServerRunning() bool {
	if strings.EqualFold(strings.TrimSpace(runtime.GOOS), "windows") {
		cmd := exec.Command("tasklist", "/FI", "IMAGENAME eq worldserver.exe", "/NH")
		out, err := cmd.Output()
		if err != nil {
			return false
		}
		return strings.Contains(strings.ToLower(string(out)), "worldserver.exe")
	}

	// Non-Windows fallback
	cmd := exec.Command("pgrep", "-f", "worldserver")
	if err := cmd.Run(); err != nil {
		return false
	}
	return true
}

func getCharacterLevelForUser(userID int, characterName string) (int, error) {
	charName := strings.TrimSpace(characterName)
	if charName == "" {
		return 0, fmt.Errorf("캐릭터가 선택되지 않았습니다")
	}

	charDSN := config.CharactersDSN()
	charDB, err := sql.Open("mysql", charDSN)
	if err != nil {
		return 0, err
	}
	defer charDB.Close()

	var level int
	err = charDB.QueryRow("SELECT level FROM characters WHERE name = ? AND account = ? LIMIT 1", charName, userID).Scan(&level)
	if err != nil {
		if err == sql.ErrNoRows {
			return 0, fmt.Errorf("캐릭터 정보를 찾을 수 없습니다")
		}
		return 0, err
	}
	return level, nil
}

func sendShopItemMail(receiverName, subject, body string, itemEntry, itemCount int, senderUserID int, senderUsername string, r *http.Request) error {
	if strings.TrimSpace(receiverName) == "" || itemEntry <= 0 || itemCount <= 0 {
		return fmt.Errorf("\uc694\uccad \ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4.")
	}

	charDSN := config.CharactersDSN()
	charDB, err := sql.Open("mysql", charDSN)
	if err != nil {
		return err
	}
	defer charDB.Close()

	var charGUID int
	if err := charDB.QueryRow("SELECT guid FROM characters WHERE name = ? AND account = ?", receiverName, senderUserID).Scan(&charGUID); err != nil {
		if err == sql.ErrNoRows {
			return fmt.Errorf("\uc694\uccad \ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4.")
		}
		return err
	}

	var nextMailID int
	if err := charDB.QueryRow("SELECT IFNULL(MAX(id), 0) + 1 FROM mail").Scan(&nextMailID); err != nil {
		return err
	}

	mailQuery := `
		INSERT INTO mail (id, messageType, stationery, mailTemplateId, sender, receiver, subject, body, has_items, expire_time, deliver_time, money, cod, checked)
		VALUES (?, 0, 41, 0, 0, ?, ?, ?, 1, UNIX_TIMESTAMP() + 2592000, UNIX_TIMESTAMP(), 0, 0, 0)
	`
	if _, err := charDB.Exec(mailQuery, nextMailID, charGUID, subject, body); err != nil {
		return err
	}

	var nextItemGUID int
	if err := charDB.QueryRow("SELECT IFNULL(MAX(guid), 0) + 1 FROM item_instance").Scan(&nextItemGUID); err != nil {
		return err
	}
	itemQuery := `
		INSERT INTO item_instance (guid, itemEntry, owner_guid, creatorGuid, count, enchantments)
		VALUES (?, ?, ?, 0, ?, '')
	`
	if _, err := charDB.Exec(itemQuery, nextItemGUID, itemEntry, charGUID, itemCount); err != nil {
		return err
	}
	if _, err := charDB.Exec("INSERT INTO mail_items (mail_id, item_guid, receiver) VALUES (?, ?, ?)", nextMailID, nextItemGUID, charGUID); err != nil {
		return err
	}

	ip := ""
	if r != nil {
		ip = r.RemoteAddr
		if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
			ip = forwarded
		}
	}
	if senderUsername == "" {
		senderUsername = "shop_system"
	}
	_, _ = charDB.Exec(`
		INSERT INTO web_mail_log (sender_username, receiver_name, subject, body, item_entry, item_count, gold, ip_address)
		VALUES (?, ?, ?, ?, ?, ?, 0, ?)
	`, senderUsername, receiverName, subject, body, itemEntry, itemCount, ip)
	return nil
}

func getUserCharactersWithGold(userID int) ([]map[string]interface{}, error) {
	charDB, err := sql.Open("mysql", config.CharactersDSN())
	if err != nil {
		return nil, err
	}
	defer charDB.Close()

	rows, err := charDB.Query(`
		SELECT name, level, money
		FROM characters
		WHERE account = ?
		ORDER BY level DESC, name ASC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make([]map[string]interface{}, 0)
	for rows.Next() {
		var name string
		var level int
		var money int64
		if err := rows.Scan(&name, &level, &money); err != nil {
			continue
		}
		result = append(result, map[string]interface{}{
			"name":        name,
			"level":       level,
			"gold_copper": money,
			"gold":        money / 10000,
		})
	}
	return result, nil
}

func getCharacterMoneyByUserID(userID int, characterName string) (int64, error) {
	charDB, err := sql.Open("mysql", config.CharactersDSN())
	if err != nil {
		return 0, err
	}
	defer charDB.Close()
	var money int64
	err = charDB.QueryRow(`
		SELECT money
		FROM characters
		WHERE account = ? AND name = ?
	`, userID, characterName).Scan(&money)
	return money, err
}

func adjustCharacterGoldByUserID(userID int, characterName string, deltaCopper int64) error {
	charDB, err := sql.Open("mysql", config.CharactersDSN())
	if err != nil {
		return err
	}
	defer charDB.Close()
	_, err = charDB.Exec(`
		UPDATE characters
		SET money = money + ?
		WHERE account = ? AND name = ?
	`, deltaCopper, userID, characterName)
	return err
}

func sendShopGoldMail(receiverName, subject, body string, goldCopper int64, senderUserID int, senderUsername string, r *http.Request) error {
	charDSN := config.CharactersDSN()
	charDB, err := sql.Open("mysql", charDSN)
	if err != nil {
		return err
	}
	defer charDB.Close()

	var charGUID int
	err = charDB.QueryRow("SELECT guid FROM characters WHERE name = ?", receiverName).Scan(&charGUID)
	if err != nil {
		return err
	}

	var nextMailID int64
	if err := charDB.QueryRow("SELECT IFNULL(MAX(id), 0) + 1 FROM mail").Scan(&nextMailID); err != nil {
		return err
	}

	mailQuery := `
		INSERT INTO mail (id, messageType, stationery, mailTemplateId, sender, receiver, subject, body, has_items, expire_time, deliver_time, money, cod, checked)
		VALUES (?, 0, 41, 0, 0, ?, ?, ?, 0, 2592000, UNIX_TIMESTAMP(), ?, 0, 0)
	`
	if _, err := charDB.Exec(mailQuery, nextMailID, charGUID, subject, body, goldCopper); err != nil {
		return err
	}

	ip := ""
	if r != nil {
		ip = r.RemoteAddr
		if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
			ip = forwarded
		}
	}
	if senderUsername == "" {
		senderUsername = "shop_system"
	}
	_, _ = charDB.Exec(`
		INSERT INTO web_mail_log (sender_username, receiver_name, subject, body, item_entry, item_count, gold, ip_address)
		VALUES (?, ?, ?, ?, 0, 0, ?, ?)
	`, senderUsername, receiverName, subject, body, int(goldCopper), ip)
	return nil
}

func handleShopItems(w http.ResponseWriter, r *http.Request) {
	if !CheckMenuPermission(w, r, "shop") {
		return
	}

	db, err := sql.Open("mysql", updateDSN)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "\uc694\uccad \ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4."})
		return
	}
	defer db.Close()
	ensurePointShopTables(db)

	q := strings.TrimSpace(r.URL.Query().Get("q"))
	args := []interface{}{}
	sqlQuery := `
		SELECT id, name, IFNULL(item_type,'game'), IFNULL(item_entry,0), IFNULL(function_code,''), IFNULL(icon_path,''), IFNULL(description,''), price_points, stock_qty, is_visible, created_at
		FROM point_shop_items
		WHERE is_deleted = 0 AND is_visible = 1
	`
	if q != "" {
		sqlQuery += " AND name LIKE ?"
		args = append(args, "%"+q+"%")
	}
	sqlQuery += " ORDER BY id DESC"

	rows, err := db.Query(sqlQuery, args...)
	if err != nil {
		log.Printf("[Shop] item list query error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "\uc694\uccad \ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4."})
		return
	}
	defer rows.Close()
	var authDB *sql.DB
	if adb, e := sql.Open("mysql", config.AuthDSN()); e == nil {
		authDB = adb
		defer authDB.Close()
	}

	var items []map[string]interface{}
	for rows.Next() {
		var id, price, stock, isVisible, itemEntry int
		var name, itemType, functionCode, iconPath, desc, createdAt string
		if err := rows.Scan(&id, &name, &itemType, &itemEntry, &functionCode, &iconPath, &desc, &price, &stock, &isVisible, &createdAt); err == nil {
			items = append(items, map[string]interface{}{
				"id":            id,
				"name":          name,
				"item_type":     itemType,
				"item_entry":    itemEntry,
				"function_code": functionCode,
				"icon_path":     iconPath,
				"description":   desc,
				"price_points":  price,
				"stock_qty":     stock,
				"is_visible":    isVisible == 1,
				"created_at":    createdAt,
			})
		}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"status": "success", "items": items})
}

func handleShopCoinMarketList(w http.ResponseWriter, r *http.Request) {
	if !CheckMenuPermission(w, r, "shop") {
		return
	}
	db, err := sql.Open("mysql", updateDSN)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "코인시장 목록을 불러오지 못했습니다."})
		return
	}
	defer db.Close()
	ensurePointShopTables(db)

	rows, err := db.Query(`
		SELECT id, seller_user_id, IFNULL(seller_username,''), IFNULL(seller_character,''), gold_copper, price_points, status, created_at
		FROM point_coin_market_listings
		WHERE status = 'active'
		ORDER BY id DESC
		LIMIT 300
	`)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "코인시장 목록을 불러오지 못했습니다."})
		return
	}
	defer rows.Close()

	charDB, _ := sql.Open("mysql", config.CharactersDSN())
	if charDB != nil {
		defer charDB.Close()
	}
	getFactionByRace := func(race int) (string, int) {
		switch race {
		case 1, 3, 4, 7, 11:
			return "얼라이언스", 0
		case 2, 5, 6, 8, 10:
			return "호드", 1
		default:
			return "중립", -1
		}
	}

	listings := make([]map[string]interface{}, 0)
	for rows.Next() {
		var id, sellerUserID, price int
		var sellerUsername, sellerCharacter, status, createdAt string
		var goldCopper int64
		if err := rows.Scan(&id, &sellerUserID, &sellerUsername, &sellerCharacter, &goldCopper, &price, &status, &createdAt); err != nil {
			continue
		}
		sellerLevel := 0
		sellerFaction := "중립"
		sellerFactionCode := -1
		if charDB != nil {
			var race int
			_ = charDB.QueryRow("SELECT level, race FROM characters WHERE account = ? AND name = ? LIMIT 1", sellerUserID, sellerCharacter).
				Scan(&sellerLevel, &race)
			if race > 0 {
				sellerFaction, sellerFactionCode = getFactionByRace(race)
			}
		}

		listings = append(listings, map[string]interface{}{
			"id":                  id,
			"seller_user_id":      sellerUserID,
			"seller_username":     sellerUsername,
			"seller_character":    sellerCharacter,
			"seller_level":        sellerLevel,
			"seller_faction":      sellerFaction,
			"seller_faction_code": sellerFactionCode,
			"gold_copper":         goldCopper,
			"gold":                goldCopper / 10000,
			"price_points":        price,
			"status":              status,
			"created_at":          createdAt,
		})
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"status": "success", "listings": listings})
}

func handleShopCoinMarketMyCharacters(w http.ResponseWriter, r *http.Request) {
	if !CheckMenuPermission(w, r, "shop") {
		return
	}
	userID, _, err := getSessionUserIDAndName(r)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"status": "error", "message": "로그인이 필요합니다."})
		return
	}
	characters, err := getUserCharactersWithGold(userID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "캐릭터 정보를 불러오지 못했습니다."})
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"status": "success", "characters": characters})
}

func handleShopCoinMarketCreate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"status": "error", "message": "잘못된 요청입니다."})
		return
	}
	if !CheckMenuPermission(w, r, "shop") {
		return
	}

	userID, username, err := getSessionUserIDAndName(r)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"status": "error", "message": "로그인이 필요합니다."})
		return
	}
	var req struct {
		Character   string `json:"character"`
		GoldAmount  int64  `json:"gold_amount"`
		PricePoints int    `json:"price_points"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "입력값이 올바르지 않습니다."})
		return
	}
	req.Character = strings.TrimSpace(req.Character)
	if req.Character == "" || req.GoldAmount <= 0 || req.PricePoints <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "입력값을 확인해주세요."})
		return
	}
	goldCopper := req.GoldAmount * 10000

	currentMoney, err := getCharacterMoneyByUserID(userID, req.Character)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "판매 캐릭터 정보를 확인할 수 없습니다."})
		return
	}
	if currentMoney < goldCopper {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "캐릭터 보유 골드가 부족합니다."})
		return
	}
	if err := adjustCharacterGoldByUserID(userID, req.Character, -goldCopper); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "골드 차감 처리에 실패했습니다."})
		return
	}

	db, err := sql.Open("mysql", updateDSN)
	if err != nil {
		_ = adjustCharacterGoldByUserID(userID, req.Character, goldCopper)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "코인시장 등록에 실패했습니다."})
		return
	}
	defer db.Close()
	ensurePointShopTables(db)

	_, err = db.Exec(`
		INSERT INTO point_coin_market_listings (seller_user_id, seller_username, seller_character, gold_copper, price_points, status)
		VALUES (?, ?, ?, ?, ?, 'active')
	`, userID, username, req.Character, goldCopper, req.PricePoints)
	if err != nil {
		_ = adjustCharacterGoldByUserID(userID, req.Character, goldCopper)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "코인시장 등록에 실패했습니다."})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "success"})
}

func handleShopCoinMarketCancel(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"status": "error", "message": "잘못된 요청입니다."})
		return
	}
	if !CheckMenuPermission(w, r, "shop") {
		return
	}
	userID, _, err := getSessionUserIDAndName(r)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"status": "error", "message": "로그인이 필요합니다."})
		return
	}
	var req struct {
		ListingID int `json:"listing_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.ListingID <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "입력값이 올바르지 않습니다."})
		return
	}

	db, err := sql.Open("mysql", updateDSN)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "취소 처리에 실패했습니다."})
		return
	}
	defer db.Close()
	ensurePointShopTables(db)

	var sellerUserID int
	var sellerCharacter, status string
	var goldCopper int64
	if err := db.QueryRow(`
		SELECT seller_user_id, IFNULL(seller_character,''), gold_copper, status
		FROM point_coin_market_listings
		WHERE id = ?
	`, req.ListingID).Scan(&sellerUserID, &sellerCharacter, &goldCopper, &status); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "대상을 찾을 수 없습니다."})
		return
	}
	if sellerUserID != userID || status != "active" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "취소 가능한 상태가 아닙니다."})
		return
	}

	if err := adjustCharacterGoldByUserID(userID, strings.TrimSpace(sellerCharacter), goldCopper); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "골드 복구에 실패했습니다."})
		return
	}
	_, _ = db.Exec("UPDATE point_coin_market_listings SET status = 'cancelled' WHERE id = ? AND status = 'active'", req.ListingID)
	writeJSON(w, http.StatusOK, map[string]string{"status": "success"})
}

func handleShopCoinMarketBuy(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"status": "error", "message": "잘못된 요청입니다."})
		return
	}
	if !CheckMenuPermission(w, r, "shop") {
		return
	}
	buyerUserID, buyerUsername, err := getSessionUserIDAndName(r)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"status": "error", "message": "로그인이 필요합니다."})
		return
	}
	var req struct {
		ListingID      int    `json:"listing_id"`
		BuyerCharacter string `json:"buyer_character"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.ListingID <= 0 || strings.TrimSpace(req.BuyerCharacter) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "입력값이 올바르지 않습니다."})
		return
	}
	if _, err := getCharacterMoneyByUserID(buyerUserID, strings.TrimSpace(req.BuyerCharacter)); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "선택한 캐릭터를 확인할 수 없습니다."})
		return
	}

	db, err := sql.Open("mysql", updateDSN)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "구매 처리에 실패했습니다."})
		return
	}
	defer db.Close()
	ensurePointShopTables(db)

	tx, err := db.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "구매 처리에 실패했습니다."})
		return
	}
	defer tx.Rollback()

	var sellerUserID int
	var sellerUsername, sellerCharacter, status string
	var goldCopper int64
	var pricePoints int
	if err := tx.QueryRow(`
		SELECT seller_user_id, IFNULL(seller_username,''), IFNULL(seller_character,''), gold_copper, price_points, status
		FROM point_coin_market_listings
		WHERE id = ? FOR UPDATE
	`, req.ListingID).Scan(&sellerUserID, &sellerUsername, &sellerCharacter, &goldCopper, &pricePoints, &status); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "판매글을 찾을 수 없습니다."})
		return
	}
	if status != "active" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "이미 거래 완료되었거나 취소된 항목입니다."})
		return
	}
	if sellerUserID == buyerUserID {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "본인 판매글은 구매할 수 없습니다."})
		return
	}

	var buyerPoints int
	if err := tx.QueryRow("SELECT points FROM user_points WHERE user_id = ? FOR UPDATE", buyerUserID).Scan(&buyerPoints); err == sql.ErrNoRows {
		buyerPoints = 0
	} else if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "포인트 확인에 실패했습니다."})
		return
	}
	if buyerPoints < pricePoints {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "포인트가 부족합니다."})
		return
	}

	var sellerPoints int
	if err := tx.QueryRow("SELECT points FROM user_points WHERE user_id = ? FOR UPDATE", sellerUserID).Scan(&sellerPoints); err == sql.ErrNoRows {
		sellerPoints = 0
	} else if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "판매자 포인트 확인에 실패했습니다."})
		return
	}

	buyerBefore := buyerPoints
	buyerAfter := buyerPoints - pricePoints
	sellerBefore := sellerPoints
	sellerAfter := sellerPoints + pricePoints

	if _, err := tx.Exec(`
		INSERT INTO user_points (user_id, points) VALUES (?, ?)
		ON DUPLICATE KEY UPDATE points = points - ?
	`, buyerUserID, buyerAfter, pricePoints); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "포인트 차감에 실패했습니다."})
		return
	}
	if _, err := tx.Exec(`
		INSERT INTO user_points (user_id, points) VALUES (?, ?)
		ON DUPLICATE KEY UPDATE points = points + ?
	`, sellerUserID, sellerAfter, pricePoints); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "판매자 포인트 지급에 실패했습니다."})
		return
	}
	_, _ = tx.Exec("INSERT INTO user_point_logs (user_id, amount, reason, admin_name, created_at) VALUES (?, ?, ?, ?, NOW())", buyerUserID, -pricePoints, "[코인시장] 골드 구매", "system")
	_, _ = tx.Exec("INSERT INTO user_point_logs (user_id, amount, reason, admin_name, created_at) VALUES (?, ?, ?, ?, NOW())", sellerUserID, pricePoints, "[코인시장] 골드 판매", "system")

	if _, err := tx.Exec(`
		UPDATE point_coin_market_listings
		SET status='sold', buyer_user_id=?, buyer_character=?, points_before_buyer=?, points_after_buyer=?, points_before_seller=?, points_after_seller=?
		WHERE id=? AND status='active'
	`, buyerUserID, strings.TrimSpace(req.BuyerCharacter), buyerBefore, buyerAfter, sellerBefore, sellerAfter, req.ListingID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "거래 상태 업데이트에 실패했습니다."})
		return
	}

	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "거래 완료 처리에 실패했습니다."})
		return
	}

	goldText := fmt.Sprintf("%dG", goldCopper/10000)
	mailSubject := "[코인시장] 골드 구매 지급"
	mailBody := fmt.Sprintf("코인시장에서 구매한 골드가 지급되었습니다.\n수량: %s", goldText)
	if err := sendShopGoldMail(strings.TrimSpace(req.BuyerCharacter), mailSubject, mailBody, goldCopper, buyerUserID, buyerUsername, r); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "구매는 완료되었지만 골드 우편 발송에 실패했습니다: " + err.Error()})
		return
	}

	notify := services.NewNotificationService(db)
	_ = notify.CreateNotification(buyerUserID, "point", "코인시장 구매 완료", fmt.Sprintf("%s 골드를 구매했습니다. (%d 포인트 사용)", goldText, pricePoints), "", "시스템")
	_ = notify.CreateNotification(sellerUserID, "point", "코인시장 판매 완료", fmt.Sprintf("%s 골드 판매가 완료되었습니다. (%d 포인트 획득)", goldText, pricePoints), "", "시스템")

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":          "success",
		"points_after":    buyerAfter,
		"gold_copper":     goldCopper,
		"gold_amount":     goldCopper / 10000,
		"price_points":    pricePoints,
		"buyer_character": strings.TrimSpace(req.BuyerCharacter),
	})
}

func handleShopWorldStatus(w http.ResponseWriter, r *http.Request) {
	if !CheckMenuPermission(w, r, "shop") {
		return
	}
	running := isShopWorldServerRunning()
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":        "success",
		"world_running": running,
	})
}

func handleShopCreateOrder(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"status": "error", "message": "\uc694\uccad \ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4."})
		return
	}
	if !CheckMenuPermission(w, r, "shop") {
		return
	}
	userID, username, err := getSessionUserIDAndName(r)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"status": "error", "message": "\uc694\uccad \ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4."})
		return
	}

	var req struct {
		ItemID    int    `json:"item_id"`
		Qty       int    `json:"qty"`
		Note      string `json:"note"`
		Character string `json:"character"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "\uc694\uccad \ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4."})
		return
	}
	if req.ItemID <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "\uc694\uccad \ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4."})
		return
	}
	if req.Qty <= 0 {
		req.Qty = 1
	}
	if !isShopWorldServerRunning() {
		writeJSON(w, http.StatusBadRequest, map[string]string{
			"status":  "error",
			"message": "월드서버가 가동 중이 아닙니다. 서버 가동 후 다시 시도해주세요.",
		})
		return
	}

	db, err := sql.Open("mysql", updateDSN)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "\uc694\uccad \ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4."})
		return
	}
	defer db.Close()
	ensurePointShopTables(db)

	tx, err := db.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "\uc694\uccad \ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4."})
		return
	}
	defer tx.Rollback()

	var itemName, itemDesc, itemType, functionCode string
	var unitPrice, stock, isVisible, isDeleted, itemEntry int
	err = tx.QueryRow(`
		SELECT name, IFNULL(description,''), IFNULL(item_type,'game'), IFNULL(item_entry,0), IFNULL(function_code,''), price_points, stock_qty, is_visible, is_deleted
		FROM point_shop_items WHERE id = ? FOR UPDATE
	`, req.ItemID).Scan(&itemName, &itemDesc, &itemType, &itemEntry, &functionCode, &unitPrice, &stock, &isVisible, &isDeleted)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "\uc694\uccad \ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4."})
		return
	}
	if isDeleted == 1 || isVisible == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "\uc694\uccad \ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4."})
		return
	}
	if stock >= 0 && stock < req.Qty {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "\uc694\uccad \ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4."})
		return
	}
	if itemType == "game" && strings.TrimSpace(req.Character) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "\uc694\uccad \ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4."})
		return
	}
	funcCode := strings.ToLower(strings.TrimSpace(functionCode))
	// Normalize aliases for subscription-style feature items.
	switch funcCode {
	case "shining_hero_stone", "bright_hero_stone", "hero_stone", "enhanced_stone":
		funcCode = "enhanced_enchant_stone"
	}
	itemNameNormalized := strings.TrimSpace(itemName)
	if itemType == "function" && (itemNameNormalized == "빛나는 영웅석" || itemNameNormalized == "강화된 강화석" || strings.Contains(itemNameNormalized, "영웅석")) {
		funcCode = "enhanced_enchant_stone"
	}
	if itemType == "function" && funcCode != "dual_account" && funcCode != "enhanced_enchant_stone" && funcCode != "carddraw_count" && strings.TrimSpace(req.Character) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "\uc694\uccad \ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4."})
		return
	}
	if itemType == "game" && itemEntry <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "\uc694\uccad \ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4."})
		return
	}
	if itemType == "function" {
		if funcCode == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "\uc694\uccad \ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4."})
			return
		}
		allowed := map[string]bool{
			"level_up":               true,
			"level80":                true,
			"level_80":               true,
			"race_change":            true,
			"change_race":            true,
			"rename":                 true,
			"rename_character":       true,
			"name_change":            true,
			"dual_account":           true,
			"carddraw_count":         true,
			"enhanced_enchant_stone": true,
		}
		if !allowed[funcCode] {
			writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "\uc694\uccad \ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4."})
			return
		}
		if funcCode == "level_up" || funcCode == "level80" || funcCode == "level_80" {
			charLevel, lvErr := getCharacterLevelForUser(userID, req.Character)
			if lvErr != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{
					"status":  "error",
					"message": "캐릭터 정보를 확인할 수 없습니다.",
				})
				return
			}
			if charLevel >= 80 {
				writeJSON(w, http.StatusBadRequest, map[string]string{
					"status":  "error",
					"message": "이미 만렙(80레벨) 캐릭터입니다. 레벨업 상품은 구매할 수 없습니다.",
				})
				return
			}
		}
	}

	total := unitPrice * req.Qty
	var currentPoints int
	err = tx.QueryRow("SELECT points FROM user_points WHERE user_id = ? FOR UPDATE", userID).Scan(&currentPoints)
	if err == sql.ErrNoRows {
		currentPoints = 0
	} else if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "\uc694\uccad \ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4."})
		return
	}
	if currentPoints < total {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "\uc694\uccad \ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4."})
		return
	}

	pointsBefore := currentPoints
	pointsAfter := currentPoints - total
	_, err = tx.Exec(`
		INSERT INTO user_points (user_id, points) VALUES (?, ?)
		ON DUPLICATE KEY UPDATE points = points - ?
	`, userID, pointsAfter, total)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "\uc694\uccad \ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4."})
		return
	}

	reason := fmt.Sprintf("[\uc120\uc220\uc9d1] %s x%d \uad6c\ub9e4", itemName, req.Qty)
	_, _ = tx.Exec("INSERT INTO user_point_logs (user_id, amount, reason, admin_name, created_at) VALUES (?, ?, ?, ?, NOW())", userID, -total, reason, "system")

	if stock >= 0 {
		if _, err = tx.Exec("UPDATE point_shop_items SET stock_qty = stock_qty - ? WHERE id = ?", req.Qty, req.ItemID); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "\uc694\uccad \ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4."})
			return
		}
	}

	orderStatus := "pending"
	if itemType == "game" || itemType == "function" {
		orderStatus = "completed"
	}

	res, err := tx.Exec(`
		INSERT INTO point_shop_orders (user_id, item_id, item_name, target_character, qty, unit_price, total_price, points_before, points_after, status, request_note)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, userID, req.ItemID, itemName, strings.TrimSpace(req.Character), req.Qty, unitPrice, total, pointsBefore, pointsAfter, orderStatus, strings.TrimSpace(req.Note))
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "\uc694\uccad \ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4."})
		return
	}
	orderID, _ := res.LastInsertId()

	_, _ = tx.Exec(`
		INSERT INTO point_shop_order_logs (order_id, action, actor_user_id, before_status, after_status, memo)
		VALUES (?, 'create', ?, '', ?, ?)
    `, orderID, userID, orderStatus, "\uc0ac\uc6a9\uc790 \uc8fc\ubb38 \uc0dd\uc131")

	if itemType == "game" {
		mailSubject := fmt.Sprintf("[\uc120\uc220\uc9d1] %s", itemName)
		mailBody := "\uc120\uc220\uc9d1 \uad6c\ub9e4 \uc544\uc774\ud15c\uc774 \ub3c4\ucc29\ud588\uc2b5\ub2c8\ub2e4."
		if strings.TrimSpace(req.Note) != "" {
			mailBody += "\n" + strings.TrimSpace(req.Note)
		}
		if err := sendShopItemMail(strings.TrimSpace(req.Character), mailSubject, mailBody, itemEntry, req.Qty, userID, username, r); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "\uc694\uccad \ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4." + err.Error()})
			return
		}
	}

	var enhancedStoneExpiresAt time.Time
	if itemType == "function" {
		if funcCode == "dual_account" {
			_, err = tx.Exec(`
				INSERT INTO web_second_account_purchases (user_id, order_id, is_active)
				VALUES (?, ?, 1)
				ON DUPLICATE KEY UPDATE is_active = 1, order_id = VALUES(order_id), purchased_at = NOW()
			`, userID, orderID)
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "\uc694\uccad \ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4."})
				return
			}
		} else if funcCode == "carddraw_count" {
			_, err = tx.Exec(`
				INSERT INTO user_profiles (user_id, carddraw_draw_count)
				VALUES (?, ?)
				ON DUPLICATE KEY UPDATE carddraw_draw_count = IFNULL(carddraw_draw_count, 0) + VALUES(carddraw_draw_count)
			`, userID, req.Qty)
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "\uc694\uccad \ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4."})
				return
			}
		} else if funcCode == "enhanced_enchant_stone" {
			enhancedStoneExpiresAt, err = extendFeatureSubscription(tx, userID, funcCode, req.Qty, orderID)
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "\uc694\uccad \ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4."})
				return
			}
		} else {
			if err := runShopFunctionCommand(funcCode, strings.TrimSpace(req.Character), r); err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "\uc694\uccad \ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4." + err.Error()})
				return
			}
		}
	}
	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "\uc694\uccad \ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4."})
		return
	}

	notify := services.NewNotificationService(db)
	senderName := getSenderDisplayNameForShop(db, userID, username)
	notifMsg := fmt.Sprintf("%s \uc0c1\ud488 \uad6c\ub9e4\uac00 \uc644\ub8cc\ub418\uc5c8\uc2b5\ub2c8\ub2e4. (%d \ud3ec\uc778\ud2b8)", itemName, total)
	if itemType == "game" {
		notifMsg = fmt.Sprintf("%s \uc544\uc774\ud15c\uc774 %s \uce90\ub9ad\ud130 \uc6b0\ud3b8\uc73c\ub85c \ubc1c\uc1a1\ub418\uc5c8\uc2b5\ub2c8\ub2e4. (%d \ud3ec\uc778\ud2b8)", itemName, strings.TrimSpace(req.Character), total)
	} else if itemType == "function" {
		if funcCode == "dual_account" {
			notifMsg = fmt.Sprintf("%s \uad6c\ub9e4\uac00 \uc644\ub8cc\ub418\uc5c8\uc2b5\ub2c8\ub2e4. 2\uacc4\uc815 \uad6c\ub9e4 \uad8c\ud55c\uc774 \ud65c\uc131\ud654\ub418\uc5c8\uc2b5\ub2c8\ub2e4. (%d \ud3ec\uc778\ud2b8)", itemName, total)
		} else if funcCode == "carddraw_count" {
			notifMsg = fmt.Sprintf("%s \uad6c\ub9e4\uac00 \uc644\ub8cc\ub418\uc5c8\uc2b5\ub2c8\ub2e4. \uce74\ub4dc \ubf51\uae30 \ud69f\uc218 %d\ud68c\uac00 \uc9c0\uae09\ub418\uc5c8\uc2b5\ub2c8\ub2e4. (%d \ud3ec\uc778\ud2b8)", itemName, req.Qty, total)
		} else if funcCode == "enhanced_enchant_stone" {
			expText := enhancedStoneExpiresAt.Format("2006-01-02 15:04:05")
			notifMsg = fmt.Sprintf("%s \uad6c\ub9e4\uac00 \uc644\ub8cc\ub418\uc5c8\uc2b5\ub2c8\ub2e4. \ud2b9\uc218 \uc544\uc774\ucf58 \ud6a8\uacfc \uc720\ud6a8\uae30\uac04: %s (%d \ud3ec\uc778\ud2b8)", itemName, expText, total)
		} else {
			notifMsg = fmt.Sprintf("%s \uae30\ub2a5\uc774 %s \uce90\ub9ad\ud130\uc5d0 \uc801\uc6a9\ub418\uc5c8\uc2b5\ub2c8\ub2e4. (%d \ud3ec\uc778\ud2b8)", itemName, strings.TrimSpace(req.Character), total)
		}
	}
	_ = notify.CreateNotification(userID, "point", "선술집 구매 완료", notifMsg, "", senderName)

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":       "success",
		"message":      "Order completed.",
		"order_id":     orderID,
		"used_points":  total,
		"points_after": pointsAfter,
	})
}
func handleShopMyOrders(w http.ResponseWriter, r *http.Request) {
	if !CheckMenuPermission(w, r, "shop") {
		return
	}
	userID, _, err := getSessionUserIDAndName(r)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"status": "error", "message": "\uc694\uccad \ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4."})
		return
	}

	db, err := sql.Open("mysql", updateDSN)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "\uc694\uccad \ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4."})
		return
	}
	defer db.Close()
	ensurePointShopTables(db)

	rows, err := db.Query(`
		SELECT 
			o.id,
			o.item_name,
			o.qty,
			o.total_price,
			o.status,
			IFNULL(o.admin_note,''),
			o.created_at,
			o.updated_at,
			IFNULL(s.item_type,'game') AS item_type,
			IFNULL(s.item_entry,0) AS item_entry,
			IFNULL(s.icon_path,'') AS icon_path
		FROM point_shop_orders o
		LEFT JOIN point_shop_items s ON s.id = o.item_id
		WHERE o.user_id = ? AND o.is_deleted = 0
		ORDER BY o.id DESC
		LIMIT 200
	`, userID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "\uc694\uccad \ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4."})
		return
	}
	defer rows.Close()

	var orders []map[string]interface{}
	for rows.Next() {
		var id, qty, totalPrice, itemEntry int
		var itemName, status, adminNote, createdAt, updatedAt, itemType, iconPath string
		if err := rows.Scan(&id, &itemName, &qty, &totalPrice, &status, &adminNote, &createdAt, &updatedAt, &itemType, &itemEntry, &iconPath); err == nil {
			orders = append(orders, map[string]interface{}{
				"id":          id,
				"item_name":   itemName,
				"qty":         qty,
				"total_price": totalPrice,
				"status":      status,
				"admin_note":  adminNote,
				"created_at":  createdAt,
				"updated_at":  updatedAt,
				"item_type":   itemType,
				"item_entry":  itemEntry,
				"icon_path":   iconPath,
			})
		}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"status": "success", "orders": orders})
}

func handleShopSubscriptionStatus(w http.ResponseWriter, r *http.Request) {
	userID, _, err := getSessionUserIDAndName(r)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"status": "error", "message": "로그인이 필요합니다."})
		return
	}

	code := strings.TrimSpace(r.URL.Query().Get("code"))
	if code == "" {
		code = "enhanced_enchant_stone"
	}
	if code == "shining_hero_stone" || code == "bright_hero_stone" || code == "hero_stone" || code == "enhanced_stone" {
		code = "enhanced_enchant_stone"
	}

	db, err := sql.Open("mysql", updateDSN)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "요청 처리 중 오류가 발생했습니다."})
		return
	}
	defer db.Close()
	ensurePointShopTables(db)

	var startedRaw sql.NullString
	var expiresRaw sql.NullString
	q := `
		SELECT started_at, expires_at
		FROM web_feature_subscriptions
		WHERE user_id = ?
		  AND feature_code IN ('enhanced_enchant_stone', 'shining_hero_stone', 'bright_hero_stone', 'hero_stone', 'enhanced_stone')
		ORDER BY expires_at DESC
		LIMIT 1
	`
	if err := db.QueryRow(q, userID).Scan(&startedRaw, &expiresRaw); err != nil {
		if err == sql.ErrNoRows {
			writeJSON(w, http.StatusOK, map[string]interface{}{
				"status":     "success",
				"subscribed": false,
				"active":     false,
			})
			return
		}
		log.Printf("[shop/subscription/status] query error user_id=%d code=%s err=%v", userID, code, err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "요청 처리 중 오류가 발생했습니다."})
		return
	}

	now := time.Now()
	parseDateTime := func(s string) (time.Time, bool) {
		s = strings.TrimSpace(s)
		if s == "" || s == "0000-00-00 00:00:00" {
			return time.Time{}, false
		}
		layouts := []string{
			"2006-01-02 15:04:05",
			time.RFC3339,
			"2006-01-02T15:04:05Z07:00",
		}
		for _, layout := range layouts {
			if t, err := time.ParseInLocation(layout, s, time.Local); err == nil {
				return t, true
			}
		}
		return time.Time{}, false
	}

	startAt := now.AddDate(0, -1, 0)
	if startedRaw.Valid {
		if t, ok := parseDateTime(startedRaw.String); ok {
			startAt = t
		}
	}

	expAt := now
	if expiresRaw.Valid {
		if t, ok := parseDateTime(expiresRaw.String); ok {
			expAt = t
		}
	}

	active := expAt.After(now)
	remainingDays := 0
	progressPercent := 0
	if active {
		remainingDays = int(expAt.Sub(now).Hours()/24) + 1
		if remainingDays < 0 {
			remainingDays = 0
		}
		totalSeconds := expAt.Sub(startAt).Seconds()
		remainSeconds := expAt.Sub(now).Seconds()
		if totalSeconds > 0 && remainSeconds > 0 {
			progressPercent = int((remainSeconds / totalSeconds) * 100.0)
			if progressPercent < 1 {
				progressPercent = 1
			}
			if progressPercent > 100 {
				progressPercent = 100
			}
		}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":          "success",
		"subscribed":      true,
		"active":          active,
		"startedAt":       startAt.Format("2006-01-02 15:04:05"),
		"expiresAt":       expAt.Format("2006-01-02 15:04:05"),
		"remainingDays":   remainingDays,
		"progressPercent": progressPercent,
	})
}

func handleAdminShopItems(w http.ResponseWriter, r *http.Request) {
	if !CheckMenuPermission(w, r, "shop-admin") {
		return
	}

	db, err := sql.Open("mysql", updateDSN)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "\uc694\uccad \ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4."})
		return
	}
	defer db.Close()
	ensurePointShopTables(db)

	rows, err := db.Query(`
		SELECT id, name, IFNULL(item_type,'game'), IFNULL(item_entry,0), IFNULL(function_code,''), IFNULL(icon_path,''), IFNULL(description,''), price_points, stock_qty, is_visible, is_deleted, created_at, updated_at
		FROM point_shop_items
		ORDER BY id DESC
	`)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "\uc694\uccad \ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4."})
		return
	}
	defer rows.Close()

	var items []map[string]interface{}
	for rows.Next() {
		var id, price, stock, isVisible, isDeleted, itemEntry int
		var name, itemType, functionCode, iconPath, desc, createdAt, updatedAt string
		if err := rows.Scan(&id, &name, &itemType, &itemEntry, &functionCode, &iconPath, &desc, &price, &stock, &isVisible, &isDeleted, &createdAt, &updatedAt); err == nil {
			items = append(items, map[string]interface{}{
				"id":            id,
				"name":          name,
				"item_type":     itemType,
				"item_entry":    itemEntry,
				"function_code": functionCode,
				"icon_path":     iconPath,
				"description":   desc,
				"price_points":  price,
				"stock_qty":     stock,
				"is_visible":    isVisible == 1,
				"is_deleted":    isDeleted == 1,
				"created_at":    createdAt,
				"updated_at":    updatedAt,
			})
		}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"status": "success", "items": items})
}

func handleAdminShopItemSave(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"status": "error", "message": "\uc694\uccad \ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4."})
		return
	}
	if !CheckMenuPermission(w, r, "shop-admin") {
		return
	}
	adminID, _, err := getSessionUserIDAndName(r)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"status": "error", "message": "\uc694\uccad \ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4."})
		return
	}

	var req struct {
		ID           int    `json:"id"`
		Name         string `json:"name"`
		ItemType     string `json:"item_type"`
		ItemEntry    int    `json:"item_entry"`
		FunctionCode string `json:"function_code"`
		IconPath     string `json:"icon_path"`
		Description  string `json:"description"`
		PricePoints  int    `json:"price_points"`
		StockQty     int    `json:"stock_qty"`
		IsVisible    bool   `json:"is_visible"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "\uc694\uccad \ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4."})
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	req.ItemType = strings.TrimSpace(req.ItemType)
	req.FunctionCode = strings.TrimSpace(req.FunctionCode)
	req.IconPath = strings.TrimSpace(req.IconPath)
	if req.ItemType == "" {
		req.ItemType = "game"
	}
	if req.ItemType != "game" && req.ItemType != "function" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "\uc694\uccad \ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4."})
		return
	}
	if req.ItemType == "game" && req.ItemEntry <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "\uc694\uccad \ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4."})
		return
	}
	if req.ItemType == "function" && req.FunctionCode == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "\uc694\uccad \ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4."})
		return
	}
	if req.IconPath != "" {
		isIconPack := strings.HasPrefix(req.IconPath, "/img/iconpack/")
		isUploaded := strings.HasPrefix(req.IconPath, "/uploads/shop-icons/")
		if strings.Contains(req.IconPath, "..") || (!isIconPack && !isUploaded) {
			writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "\uc694\uccad \ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4."})
			return
		}
	}
	if req.Name == "" || req.PricePoints < 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "\uc694\uccad \ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4."})
		return
	}

	db, err := sql.Open("mysql", updateDSN)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "\uc694\uccad \ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4."})
		return
	}
	defer db.Close()
	ensurePointShopTables(db)

	visible := 0
	if req.IsVisible {
		visible = 1
	}

	if req.ID > 0 {
		_, err = db.Exec(`
			UPDATE point_shop_items
			SET name = ?, item_type = ?, item_entry = ?, function_code = ?, icon_path = ?, description = ?, price_points = ?, stock_qty = ?, is_visible = ?, updated_by = ?
			WHERE id = ?
		`, req.Name, req.ItemType, req.ItemEntry, req.FunctionCode, req.IconPath, req.Description, req.PricePoints, req.StockQty, visible, adminID, req.ID)
	} else {
		_, err = db.Exec(`
			INSERT INTO point_shop_items (name, item_type, item_entry, function_code, icon_path, description, price_points, stock_qty, is_visible, is_deleted, created_by, updated_by)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
		`, req.Name, req.ItemType, req.ItemEntry, req.FunctionCode, req.IconPath, req.Description, req.PricePoints, req.StockQty, visible, adminID, adminID)
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "\uc694\uccad \ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4."})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "success"})
}

func handleAdminShopIconUpload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"status": "error", "message": "요청 처리 중 오류가 발생했습니다."})
		return
	}
	if !CheckMenuPermission(w, r, "shop-admin") {
		return
	}
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "업로드 파일을 확인해주세요."})
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "아이콘 파일을 선택해주세요."})
		return
	}
	defer file.Close()

	ext := strings.ToLower(filepath.Ext(header.Filename))
	switch ext {
	case ".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".bmp":
	default:
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "지원하지 않는 이미지 형식입니다."})
		return
	}

	dateDir := time.Now().Format("20060102")
	targetDir := filepath.Join(".", "uploads", "shop-icons", dateDir)
	if err := os.MkdirAll(targetDir, 0755); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "업로드 경로를 생성하지 못했습니다."})
		return
	}

	filename := fmt.Sprintf("shop_icon_%d%s", time.Now().UnixNano(), ext)
	fullPath := filepath.Join(targetDir, filename)
	out, err := os.Create(fullPath)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "업로드 파일을 저장하지 못했습니다."})
		return
	}
	defer out.Close()

	if _, err := io.Copy(out, file); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "업로드 파일 저장에 실패했습니다."})
		return
	}

	publicURL := "/uploads/shop-icons/" + dateDir + "/" + filename
	writeJSON(w, http.StatusOK, map[string]string{
		"status":    "success",
		"image_url": publicURL,
	})
}

func handleAdminShopItemToggle(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"status": "error", "message": "\uc694\uccad \ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4."})
		return
	}
	if !CheckMenuPermission(w, r, "shop-admin") {
		return
	}

	var req struct {
		ID        int   `json:"id"`
		IsDeleted bool  `json:"is_deleted"`
		IsVisible *bool `json:"is_visible,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.ID <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "\uc694\uccad \ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4."})
		return
	}

	db, err := sql.Open("mysql", updateDSN)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "\uc694\uccad \ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4."})
		return
	}
	defer db.Close()
	ensurePointShopTables(db)

	deleted := 0
	if req.IsDeleted {
		deleted = 1
	}
	if req.IsVisible != nil {
		visible := 0
		if *req.IsVisible {
			visible = 1
		}
		_, err = db.Exec("UPDATE point_shop_items SET is_deleted = ?, is_visible = ? WHERE id = ?", deleted, visible, req.ID)
	} else {
		_, err = db.Exec("UPDATE point_shop_items SET is_deleted = ? WHERE id = ?", deleted, req.ID)
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "\uc694\uccad \ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4."})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "success"})
}

func handleAdminShopOrders(w http.ResponseWriter, r *http.Request) {
	if !CheckMenuPermission(w, r, "shop-admin") {
		return
	}

	db, err := sql.Open("mysql", updateDSN)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "\uc694\uccad \ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4."})
		return
	}
	defer db.Close()
	ensurePointShopTables(db)

	status := strings.TrimSpace(r.URL.Query().Get("status"))
	sqlQuery := `
		SELECT id, user_id, item_name, IFNULL(target_character,''), qty, total_price, points_before, points_after, status, IFNULL(request_note,''), IFNULL(admin_note,''), is_refunded, created_at, updated_at
		FROM point_shop_orders
		WHERE is_deleted = 0
	`
	args := []interface{}{}
	if status != "" {
		sqlQuery += " AND status = ?"
		args = append(args, status)
	}
	sqlQuery += " ORDER BY id DESC LIMIT 500"

	rows, err := db.Query(sqlQuery, args...)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "\uc694\uccad \ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4."})
		return
	}
	defer rows.Close()
	var authDB *sql.DB
	if adb, e := sql.Open("mysql", config.AuthDSN()); e == nil {
		authDB = adb
		defer authDB.Close()
	}

	var orders []map[string]interface{}
	for rows.Next() {
		var id, userID, qty, totalPrice, pointsBefore, pointsAfter, isRefunded int
		var itemName, targetCharacter, statusVal, requestNote, adminNote, createdAt, updatedAt string
		if err := rows.Scan(&id, &userID, &itemName, &targetCharacter, &qty, &totalPrice, &pointsBefore, &pointsAfter, &statusVal, &requestNote, &adminNote, &isRefunded, &createdAt, &updatedAt); err == nil {
			username := fmt.Sprintf("ID:%d", userID)
			if authDB != nil {
				_ = authDB.QueryRow("SELECT username FROM account WHERE id = ?", userID).Scan(&username)
			}
			orders = append(orders, map[string]interface{}{
				"id":               id,
				"user_id":          userID,
				"username":         username,
				"item_name":        itemName,
				"target_character": targetCharacter,
				"qty":              qty,
				"total_price":      totalPrice,
				"points_before":    pointsBefore,
				"points_after":     pointsAfter,
				"status":           statusVal,
				"request_note":     requestNote,
				"admin_note":       adminNote,
				"is_refunded":      isRefunded == 1,
				"created_at":       createdAt,
				"updated_at":       updatedAt,
			})
		}
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"status": "success", "orders": orders})
}

func handleAdminShopOrderStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"status": "error", "message": "\uc694\uccad \ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4."})
		return
	}
	if !CheckMenuPermission(w, r, "shop-admin") {
		return
	}
	adminID, adminUsername, err := getSessionUserIDAndName(r)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"status": "error", "message": "\uc694\uccad \ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4."})
		return
	}

	var req struct {
		OrderID   int    `json:"order_id"`
		Status    string `json:"status"`
		AdminNote string `json:"admin_note"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.OrderID <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "\uc694\uccad \ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4."})
		return
	}
	req.Status = strings.TrimSpace(req.Status)
	allowed := map[string]bool{"pending": true, "processing": true, "completed": true, "rejected": true, "refunded": true}
	if !allowed[req.Status] {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "\uc694\uccad \ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4."})
		return
	}

	db, err := sql.Open("mysql", updateDSN)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "\uc694\uccad \ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4."})
		return
	}
	defer db.Close()
	ensurePointShopTables(db)

	tx, err := db.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "\uc694\uccad \ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4."})
		return
	}
	defer tx.Rollback()

	var userID, totalPrice, isRefunded int
	var beforeStatus, itemName string
	if err := tx.QueryRow(`
		SELECT user_id, total_price, status, is_refunded, item_name
		FROM point_shop_orders
		WHERE id = ? FOR UPDATE
	`, req.OrderID).Scan(&userID, &totalPrice, &beforeStatus, &isRefunded, &itemName); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "\uc694\uccad \ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4."})
		return
	}

	if _, err := tx.Exec(`
		UPDATE point_shop_orders
		SET status = ?, admin_note = ?, processed_by = ?, processed_at = NOW()
		WHERE id = ?
	`, req.Status, strings.TrimSpace(req.AdminNote), adminID, req.OrderID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "\uc694\uccad \ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4."})
		return
	}

	if req.Status == "refunded" && isRefunded == 0 {
		var currentPoints int
		err = tx.QueryRow("SELECT points FROM user_points WHERE user_id = ? FOR UPDATE", userID).Scan(&currentPoints)
		if err == sql.ErrNoRows {
			currentPoints = 0
		} else if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "\uc694\uccad \ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4."})
			return
		}

		if _, err := tx.Exec(`
			INSERT INTO user_points (user_id, points) VALUES (?, ?)
			ON DUPLICATE KEY UPDATE points = points + ?
		`, userID, currentPoints+totalPrice, totalPrice); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "\uc694\uccad \ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4."})
			return
		}

		reason := fmt.Sprintf("[\uc120\uc220\uc9d1 \ud658\ubd88] \uc8fc\ubb38 #%d %s", req.OrderID, itemName)
		_, _ = tx.Exec("INSERT INTO user_point_logs (user_id, amount, reason, admin_name, created_at) VALUES (?, ?, ?, ?, NOW())", userID, totalPrice, reason, adminUsername)
		_, _ = tx.Exec("UPDATE point_shop_orders SET is_refunded = 1 WHERE id = ?", req.OrderID)
	}

	_, _ = tx.Exec(`
		INSERT INTO point_shop_order_logs (order_id, action, actor_user_id, before_status, after_status, memo)
		VALUES (?, 'status_change', ?, ?, ?, ?)
	`, req.OrderID, adminID, beforeStatus, req.Status, strings.TrimSpace(req.AdminNote))

	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "\uc694\uccad \ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4."})
		return
	}

	notify := services.NewNotificationService(db)
	adminDisplay := getSenderDisplayNameForShop(db, adminID, adminUsername)
	msg := fmt.Sprintf("\uc8fc\ubb38 #%d \uc0c1\ud0dc\uac00 %s \ub85c \ubcc0\uacbd\ub418\uc5c8\uc2b5\ub2c8\ub2e4.", req.OrderID, req.Status)
	if req.Status == "refunded" {
		msg = fmt.Sprintf("Order #%d refunded. %d points restored.", req.OrderID, totalPrice)
	}
	_ = notify.CreateNotification(userID, "admin_msg", "Tavern order status changed", msg, "", adminDisplay)

	writeJSON(w, http.StatusOK, map[string]string{"status": "success"})
}

func parseIntOrDefault(v string, def int) int {
	i, err := strconv.Atoi(v)
	if err != nil {
		return def
	}
	return i
}
