package stats

import (
	"database/sql"
	"fmt"
	"math/rand"
	"net/http"
	"strconv"
	"strings"
	"time"
)

const (
	updateDSNCarddraw = "cpo5704:584579@tcp(121.148.127.135:3306)/update"
	worldDSNCarddraw  = "root:4618@tcp(localhost:3306)/acore_world"
)

type carddrawPoolItem struct {
	ID          int    `json:"id"`
	ItemEntry   int    `json:"item_entry"`
	ItemName    string `json:"item_name"`
	Icon        string `json:"icon"`
	Rarity      string `json:"rarity"`
	RarityLabel string `json:"rarity_label"`
	ChancePercent float64 `json:"chance_percent"`
	MaxCount    int    `json:"max_count"`
	IsActive    int    `json:"is_active"`
}

func ensureCarddrawPoolSchema() {
	db, err := sql.Open("mysql", updateDSNCarddraw)
	if err != nil {
		return
	}
	defer db.Close()

	_, _ = db.Exec(`
		CREATE TABLE IF NOT EXISTS web_carddraw_items (
			id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
			item_entry INT NOT NULL,
			item_name VARCHAR(255) NOT NULL DEFAULT '',
			item_icon VARCHAR(120) NOT NULL DEFAULT '',
			rarity VARCHAR(20) NOT NULL DEFAULT 'common',
			chance_percent DECIMAL(6,3) NOT NULL DEFAULT 1.000,
			max_count INT NOT NULL DEFAULT 1,
			is_active TINYINT(1) NOT NULL DEFAULT 1,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			INDEX idx_carddraw_active (is_active),
			INDEX idx_carddraw_rarity (rarity),
			INDEX idx_carddraw_entry (item_entry)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
	`)
	_, _ = db.Exec("ALTER TABLE web_carddraw_items ADD COLUMN item_name VARCHAR(255) NOT NULL DEFAULT ''")
	_, _ = db.Exec("ALTER TABLE web_carddraw_items ADD COLUMN item_icon VARCHAR(120) NOT NULL DEFAULT ''")
	_, _ = db.Exec("ALTER TABLE web_carddraw_items ADD COLUMN chance_percent DECIMAL(6,3) NOT NULL DEFAULT 1.000")
	_, _ = db.Exec("ALTER TABLE web_carddraw_items MODIFY COLUMN chance_percent DECIMAL(6,3) NOT NULL DEFAULT 1.000")
	_, _ = db.Exec("ALTER TABLE web_carddraw_items ADD COLUMN max_count INT NOT NULL DEFAULT 1")
	_, _ = db.Exec("ALTER TABLE web_carddraw_items MODIFY COLUMN max_count INT NOT NULL DEFAULT 1")
	backfillCarddrawStoredMeta(db)
}

func normalizeMaxCount(v int) int {
	if v <= 0 {
		return 1
	}
	if v > 100000 {
		return 100000
	}
	return v
}

func normalizeChancePercent(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 100 {
		return 100
	}
	return v
}

func rarityLabel(code string) string {
	switch strings.ToLower(strings.TrimSpace(code)) {
	case "common":
		return "일반"
	case "uncommon":
		return "희귀"
	case "rare":
		return "레어"
	case "legendary":
		return "전설"
	default:
		return "일반"
	}
}

func normalizeRarity(code string) string {
	switch strings.ToLower(strings.TrimSpace(code)) {
	case "common", "uncommon", "rare", "legendary":
		return strings.ToLower(strings.TrimSpace(code))
	default:
		return "common"
	}
}

func findEntriesByKeyword(keyword string) ([]int, error) {
	db, err := sql.Open("mysql", worldDSNCarddraw)
	if err != nil {
		return nil, err
	}
	defer db.Close()

	rows, err := db.Query(`
		SELECT it.entry
		FROM item_template it
		LEFT JOIN item_template_locale itl ON itl.ID = it.entry AND itl.locale = 'koKR'
		WHERE COALESCE(NULLIF(itl.Name,''), it.name, '') LIKE ?
		ORDER BY it.entry DESC
		LIMIT 500
	`, "%"+keyword+"%")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]int, 0)
	for rows.Next() {
		var entry int
		if err := rows.Scan(&entry); err == nil {
			out = append(out, entry)
		}
	}
	return out, nil
}

func fillCarddrawItemMeta(items []carddrawPoolItem) {
	if len(items) == 0 {
		return
	}
	db, err := sql.Open("mysql", worldDSNCarddraw)
	if err != nil {
		return
	}
	defer db.Close()

	entries := make([]interface{}, 0, len(items))
	placeholder := make([]string, 0, len(items))
	seen := map[int]bool{}
	for _, it := range items {
		if it.ItemEntry <= 0 || seen[it.ItemEntry] {
			continue
		}
		seen[it.ItemEntry] = true
		entries = append(entries, it.ItemEntry)
		placeholder = append(placeholder, "?")
	}
	if len(entries) == 0 {
		return
	}

	query := `
		SELECT
			it.entry,
			COALESCE(NULLIF(itl.Name,''), it.name, CONCAT('Unknown Item ', it.entry)) AS item_name,
			COALESCE(NULLIF(it.icon,''), '') AS icon
		FROM item_template it
		LEFT JOIN item_template_locale itl ON itl.ID = it.entry AND itl.locale = 'koKR'
		WHERE it.entry IN (` + strings.Join(placeholder, ",") + `)
	`
	rows, err := db.Query(query, entries...)
	if err != nil {
		return
	}
	defer rows.Close()

	nameMap := map[int]string{}
	iconMap := map[int]string{}
	for rows.Next() {
		var entry int
		var name, icon string
		if err := rows.Scan(&entry, &name, &icon); err != nil {
			continue
		}
		nameMap[entry] = name
		iconMap[entry] = icon
	}

	for i := range items {
		if v, ok := nameMap[items[i].ItemEntry]; ok && strings.TrimSpace(v) != "" {
			items[i].ItemName = v
		} else if strings.TrimSpace(items[i].ItemName) == "" {
			items[i].ItemName = fmt.Sprintf("Unknown Item %d", items[i].ItemEntry)
		}
		if v, ok := iconMap[items[i].ItemEntry]; ok {
			items[i].Icon = v
		}
	}
}

func getWorldItemMeta(entry int) (string, string, error) {
	if entry <= 0 {
		return "", "", fmt.Errorf("invalid item entry")
	}
	db, err := sql.Open("mysql", worldDSNCarddraw)
	if err != nil {
		return "", "", err
	}
	defer db.Close()

	// 1) Base table is authoritative for this request.
	var baseName, icon string
	if err := db.QueryRow("SELECT IFNULL(name,''), IFNULL(icon,'') FROM item_template WHERE entry = ? LIMIT 1", entry).Scan(&baseName, &icon); err != nil {
		return "", "", err
	}
	baseName = strings.TrimSpace(baseName)
	icon = strings.TrimSpace(icon)
	if baseName != "" {
		return baseName, icon, nil
	}

	// 2) Optional locale fallback when base name is blank.
	var localeName string
	if err := db.QueryRow("SELECT IFNULL(Name,'') FROM item_template_locale WHERE ID = ? AND locale = 'koKR' LIMIT 1", entry).Scan(&localeName); err == nil {
		localeName = strings.TrimSpace(localeName)
		if localeName != "" {
			return localeName, icon, nil
		}
	}

	return "", icon, fmt.Errorf("item name empty")
}

func backfillCarddrawStoredMeta(updateDB *sql.DB) {
	rows, err := updateDB.Query(`
		SELECT id, item_entry
		FROM web_carddraw_items
		WHERE IFNULL(item_name, '') = '' OR item_name LIKE '아이템 %'
		ORDER BY id DESC
		LIMIT 300
	`)
	if err != nil {
		return
	}
	defer rows.Close()

	type rowItem struct {
		ID    int
		Entry int
	}
	pending := make([]rowItem, 0)
	for rows.Next() {
		var r rowItem
		if err := rows.Scan(&r.ID, &r.Entry); err == nil && r.Entry > 0 {
			pending = append(pending, r)
		}
	}
	for _, r := range pending {
		name, icon, err := getWorldItemMeta(r.Entry)
		if err != nil || name == "" {
			continue
		}
		_, _ = updateDB.Exec("UPDATE web_carddraw_items SET item_name = ?, item_icon = ? WHERE id = ?", name, icon, r.ID)
	}
}

func handleCarddrawContentList(w http.ResponseWriter, r *http.Request) {
	if !CheckMenuPermission(w, r, "content") {
		return
	}
	ensureCarddrawPoolSchema()

	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if page < 1 {
		page = 1
	}
	limit := 20
	offset := (page - 1) * limit

	keyword := strings.TrimSpace(r.URL.Query().Get("q"))
	rarity := normalizeRarity(r.URL.Query().Get("rarity"))
	activeStr := strings.TrimSpace(r.URL.Query().Get("active"))
	useRarityFilter := strings.TrimSpace(r.URL.Query().Get("rarity")) != ""
	useActiveFilter := activeStr == "0" || activeStr == "1"

	updateDB, err := sql.Open("mysql", updateDSNCarddraw)
	if err != nil {
		http.Error(w, "DB Conn Error", http.StatusInternalServerError)
		return
	}
	defer updateDB.Close()

	where := " WHERE 1=1 "
	args := make([]interface{}, 0)
	if keyword != "" {
		if _, err := strconv.Atoi(keyword); err == nil {
			where += " AND CAST(ci.item_entry AS CHAR) LIKE ? "
			args = append(args, "%"+keyword+"%")
		} else {
			entries, err := findEntriesByKeyword(keyword)
			if err != nil {
				http.Error(w, "Query Error", http.StatusInternalServerError)
				return
			}
			if len(entries) == 0 {
				writeJSON(w, http.StatusOK, map[string]interface{}{
					"status":     "success",
					"items":      []carddrawPoolItem{},
					"total":      0,
					"page":       page,
					"totalPages": 0,
				})
				return
			}
			parts := make([]string, 0, len(entries))
			for _, e := range entries {
				parts = append(parts, "?")
				args = append(args, e)
			}
			where += " AND ci.item_entry IN (" + strings.Join(parts, ",") + ") "
		}
	}
	if useRarityFilter {
		where += " AND ci.rarity = ? "
		args = append(args, rarity)
	}
	if useActiveFilter {
		where += " AND ci.is_active = ? "
		args = append(args, activeStr)
	}

	countQuery := `SELECT COUNT(*) FROM web_carddraw_items ci ` + where
	var total int
	if err := updateDB.QueryRow(countQuery, args...).Scan(&total); err != nil {
		http.Error(w, "Count Error", http.StatusInternalServerError)
		return
	}

	listQuery := `
		SELECT
			ci.id,
			ci.item_entry,
			ci.item_name,
			ci.item_icon,
			ci.rarity,
			ci.chance_percent,
			ci.max_count,
			ci.is_active
		FROM web_carddraw_items ci
	` + where + `
		ORDER BY ci.id DESC
		LIMIT ? OFFSET ?
	`
	args = append(args, limit, offset)
	rows, err := updateDB.Query(listQuery, args...)
	if err != nil {
		http.Error(w, "Query Error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	items := make([]carddrawPoolItem, 0)
	for rows.Next() {
		var item carddrawPoolItem
		if err := rows.Scan(&item.ID, &item.ItemEntry, &item.ItemName, &item.Icon, &item.Rarity, &item.ChancePercent, &item.MaxCount, &item.IsActive); err != nil {
			continue
		}
		item.Rarity = normalizeRarity(item.Rarity)
		item.RarityLabel = rarityLabel(item.Rarity)
		item.ChancePercent = normalizeChancePercent(item.ChancePercent)
		item.MaxCount = normalizeMaxCount(item.MaxCount)
		items = append(items, item)
	}
	fillCarddrawItemMeta(items)

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":     "success",
		"items":      items,
		"total":      total,
		"page":       page,
		"totalPages": (total + limit - 1) / limit,
	})
}

func handleCarddrawContentAdd(w http.ResponseWriter, r *http.Request) {
	if !CheckMenuPermission(w, r, "content") {
		return
	}
	ensureCarddrawPoolSchema()
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	_ = r.ParseForm()
	itemEntry, _ := strconv.Atoi(strings.TrimSpace(r.FormValue("item_entry")))
	inputName := strings.TrimSpace(r.FormValue("item_name"))
	rarity := normalizeRarity(r.FormValue("rarity"))
	chancePercent, _ := strconv.ParseFloat(strings.TrimSpace(r.FormValue("chance_percent")), 64)
	maxCount, _ := strconv.Atoi(strings.TrimSpace(r.FormValue("max_count")))
	isActive := 1
	if strings.TrimSpace(r.FormValue("is_active")) == "0" {
		isActive = 0
	}
	if itemEntry <= 0 {
		http.Error(w, "Invalid item entry", http.StatusBadRequest)
		return
	}
	chancePercent = normalizeChancePercent(chancePercent)
	maxCount = normalizeMaxCount(maxCount)
	itemName, itemIcon, _ := getWorldItemMeta(itemEntry)
	if strings.TrimSpace(inputName) != "" {
		itemName = inputName
	}
	if strings.TrimSpace(itemName) == "" {
		itemName = fmt.Sprintf("아이템 %d", itemEntry)
	}

	db, err := sql.Open("mysql", updateDSNCarddraw)
	if err != nil {
		http.Error(w, "DB Conn Error", http.StatusInternalServerError)
		return
	}
	defer db.Close()

	_, err = db.Exec(`
		INSERT INTO web_carddraw_items (item_entry, item_name, item_icon, rarity, chance_percent, max_count, is_active)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`, itemEntry, itemName, itemIcon, rarity, chancePercent, maxCount, isActive)
	if err != nil {
		http.Error(w, "Insert Error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "success"})
}

func handleCarddrawContentUpdate(w http.ResponseWriter, r *http.Request) {
	if !CheckMenuPermission(w, r, "content") {
		return
	}
	ensureCarddrawPoolSchema()
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	_ = r.ParseForm()
	id, _ := strconv.Atoi(strings.TrimSpace(r.FormValue("id")))
	itemEntry, _ := strconv.Atoi(strings.TrimSpace(r.FormValue("item_entry")))
	inputName := strings.TrimSpace(r.FormValue("item_name"))
	rarity := normalizeRarity(r.FormValue("rarity"))
	chancePercent, _ := strconv.ParseFloat(strings.TrimSpace(r.FormValue("chance_percent")), 64)
	maxCount, _ := strconv.Atoi(strings.TrimSpace(r.FormValue("max_count")))
	isActive := 1
	if strings.TrimSpace(r.FormValue("is_active")) == "0" {
		isActive = 0
	}
	if id <= 0 || itemEntry <= 0 {
		http.Error(w, "Invalid value", http.StatusBadRequest)
		return
	}
	chancePercent = normalizeChancePercent(chancePercent)
	maxCount = normalizeMaxCount(maxCount)
	itemName, itemIcon, _ := getWorldItemMeta(itemEntry)
	if strings.TrimSpace(inputName) != "" {
		itemName = inputName
	}
	if strings.TrimSpace(itemName) == "" {
		itemName = fmt.Sprintf("아이템 %d", itemEntry)
	}

	db, err := sql.Open("mysql", updateDSNCarddraw)
	if err != nil {
		http.Error(w, "DB Conn Error", http.StatusInternalServerError)
		return
	}
	defer db.Close()

	_, err = db.Exec(`
		UPDATE web_carddraw_items
		SET item_entry = ?, item_name = ?, item_icon = ?, rarity = ?, chance_percent = ?, max_count = ?, is_active = ?
		WHERE id = ?
	`, itemEntry, itemName, itemIcon, rarity, chancePercent, maxCount, isActive, id)
	if err != nil {
		http.Error(w, "Update Error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "success"})
}

func handleCarddrawContentDelete(w http.ResponseWriter, r *http.Request) {
	if !CheckMenuPermission(w, r, "content") {
		return
	}
	ensureCarddrawPoolSchema()
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	id, _ := strconv.Atoi(strings.TrimSpace(r.FormValue("id")))
	if id <= 0 {
		http.Error(w, "Invalid id", http.StatusBadRequest)
		return
	}
	db, err := sql.Open("mysql", updateDSNCarddraw)
	if err != nil {
		http.Error(w, "DB Conn Error", http.StatusInternalServerError)
		return
	}
	defer db.Close()
	_, err = db.Exec("DELETE FROM web_carddraw_items WHERE id = ?", id)
	if err != nil {
		http.Error(w, "Delete Error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "success"})
}

func weightedPickIndexByChance(items []carddrawPoolItem) (int, bool) {
	if len(items) == 0 {
		return -1, false
	}
	total := 0.0
	for _, it := range items {
		ch := normalizeChancePercent(it.ChancePercent)
		if ch <= 0 {
			continue
		}
		total += ch
	}
	if total <= 0 {
		return -1, false
	}
	p := rand.Float64() * total
	run := 0.0
	for i, it := range items {
		ch := normalizeChancePercent(it.ChancePercent)
		if ch <= 0 {
			continue
		}
		run += ch
		if p <= run {
			return i, true
		}
	}
	return len(items) - 1, true
}

func handleCarddrawRandomPack(w http.ResponseWriter, r *http.Request) {
	if _, _, err := getSessionUserIDAndName(r); err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"status": "error", "message": "로그인이 필요합니다."})
		return
	}
	ensureCarddrawPoolSchema()

	count := 5
	if v, err := strconv.Atoi(strings.TrimSpace(r.URL.Query().Get("count"))); err == nil && v > 0 && v <= 5 {
		count = v
	}

	db, err := sql.Open("mysql", updateDSNCarddraw)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "요청 처리 중 오류가 발생했습니다."})
		return
	}
	defer db.Close()

	rows, err := db.Query(`
		SELECT
			ci.id,
			ci.item_entry,
			ci.item_name,
			ci.item_icon,
			ci.rarity,
			ci.chance_percent,
			ci.max_count,
			ci.is_active
		FROM web_carddraw_items ci
		WHERE ci.is_active = 1
	`)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "요청 처리 중 오류가 발생했습니다."})
		return
	}
	defer rows.Close()

	all := make([]carddrawPoolItem, 0)
	for rows.Next() {
		var item carddrawPoolItem
		if err := rows.Scan(&item.ID, &item.ItemEntry, &item.ItemName, &item.Icon, &item.Rarity, &item.ChancePercent, &item.MaxCount, &item.IsActive); err != nil {
			continue
		}
		item.Rarity = normalizeRarity(item.Rarity)
		item.RarityLabel = rarityLabel(item.Rarity)
		item.ChancePercent = normalizeChancePercent(item.ChancePercent)
		item.MaxCount = normalizeMaxCount(item.MaxCount)
		all = append(all, item)
	}
	fillCarddrawItemMeta(all)
	if len(all) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]interface{}{
			"status":  "error",
			"message": "카드뽑기 품목 설정에 활성 아이템이 없습니다.",
			"rewards": []map[string]interface{}{},
		})
		return
	}
	rewards := make([]map[string]interface{}, 0, count)
	working := make([]carddrawPoolItem, len(all))
	copy(working, all)
	for i := 0; i < count; i++ {
		candidates := working
		useWorking := true
		if len(candidates) == 0 {
			candidates = all
			useWorking = false
		}
		pickIdx, ok := weightedPickIndexByChance(candidates)
		if !ok || pickIdx < 0 || pickIdx >= len(candidates) {
			pickIdx = rand.Intn(len(candidates))
		}
		picked := candidates[pickIdx]
		quantity := 1
		if picked.MaxCount > 1 {
			quantity = rand.Intn(picked.MaxCount) + 1
		}
		rewards = append(rewards, map[string]interface{}{
			"id":          picked.ID,
			"itemEntry":   picked.ItemEntry,
			"name":        picked.ItemName,
			"icon":        picked.Icon,
			"rarity":      picked.Rarity,
			"rarityLabel": picked.RarityLabel,
			"chancePercent": picked.ChancePercent,
			"maxCount":    picked.MaxCount,
			"quantity":    quantity,
		})
		if useWorking {
			working = append(working[:pickIdx], working[pickIdx+1:]...)
		}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":  "success",
		"rewards": rewards,
	})
}

func init() {
	rand.Seed(time.Now().UnixNano())
}
