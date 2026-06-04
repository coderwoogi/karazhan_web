package stats

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"karazhan/pkg/config"
	"net/http"
	"strconv"
	"strings"
	"time"

	_ "github.com/go-sql-driver/mysql"
)

var auctionCharDSN = config.CharactersDSN()

func nextAuctionTableID(tx *sql.Tx, tableName string) (int, error) {
	switch tableName {
	case "auctionhouse", "mail":
	default:
		return 0, fmt.Errorf("unsupported table: %s", tableName)
	}

	var nextID int
	if err := tx.QueryRow("SELECT IFNULL(MAX(id), 0) + 1 FROM " + tableName).Scan(&nextID); err != nil {
		return 0, err
	}
	return nextID, nil
}

func isDuplicateEntryError(err error) bool {
	if err == nil {
		return false
	}
	return strings.Contains(strings.ToLower(err.Error()), "duplicate entry")
}

func auctionHouseIDForRace(race int) int {
	switch race {
	case 1, 3, 4, 7, 11:
		return 2
	case 2, 5, 6, 8, 10:
		return 6
	default:
		return 7
	}
}

const (
	auctionItemBondWhenPickedUp = 1
	auctionItemBondWhenEquipped = 2
	auctionItemFlagSoulbound    = 0x00000001
	auctionItemFlagAccountBound = 0x08000000
)

func auctionItemBlockReason(bonding, maxCount, templateFlags, instanceFlags int) string {
	switch {
	case maxCount == 1:
		return "\uace0\uc720 \uc544\uc774\ud15c\uc740 \uacbd\ub9e4\uc7a5\uc5d0 \ub4f1\ub85d\ud560 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4."
	case bonding == auctionItemBondWhenPickedUp:
		return "\ud68d\ub4dd \uc2dc \uadc0\uc18d \uc544\uc774\ud15c\uc740 \uacbd\ub9e4\uc7a5\uc5d0 \ub4f1\ub85d\ud560 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4."
	case bonding == auctionItemBondWhenEquipped && (instanceFlags&auctionItemFlagSoulbound) != 0:
		return "\uc774\ubbf8 \ucc29\uc6a9\ud558\uc5ec \uadc0\uc18d\ub41c \ucc29\uadc0 \uc544\uc774\ud15c\uc740 \uacbd\ub9e4\uc7a5\uc5d0 \ub4f1\ub85d\ud560 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4."
	case (templateFlags & auctionItemFlagAccountBound) != 0:
		return "\uacc4\uc815 \uadc0\uc18d \uc544\uc774\ud15c\uc740 \uacbd\ub9e4\uc7a5\uc5d0 \ub4f1\ub85d\ud560 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4."
	default:
		return ""
	}
}

func insertAuctionhouseRow(tx *sql.Tx, houseID, itemGUID, ownerGUID int, buyoutPrice uint64, expireUnix int64, startBid uint64) (int, error) {
	for attempt := 0; attempt < 5; attempt++ {
		nextAuctionID, err := nextAuctionTableID(tx, "auctionhouse")
		if err != nil {
			return 0, err
		}
		_, err = tx.Exec(`
			INSERT INTO auctionhouse (id, houseid, itemguid, itemowner, buyoutprice, time, buyguid, lastbid, startbid, deposit)
			VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, 0)
		`, nextAuctionID, houseID, itemGUID, ownerGUID, buyoutPrice, expireUnix, startBid)
		if err == nil {
			return nextAuctionID, nil
		}
		if !isDuplicateEntryError(err) {
			return 0, err
		}
	}
	return 0, fmt.Errorf("failed to allocate auction id")
}

func insertMailRow(tx *sql.Tx, senderGUID, receiverGUID int, subject, body string, hasItems int) (int, error) {
	for attempt := 0; attempt < 5; attempt++ {
		nextMailID, err := nextAuctionTableID(tx, "mail")
		if err != nil {
			return 0, err
		}
		_, err = tx.Exec(`
			INSERT INTO mail (id, messageType, stationery, mailTemplateId, sender, receiver, subject, body, has_items, expire_time, deliver_time, money, cod, checked)
			VALUES (?, 0, 41, 0, ?, ?, ?, ?, ?, UNIX_TIMESTAMP()+2592000, UNIX_TIMESTAMP(), 0, 0, 0)
		`, nextMailID, senderGUID, receiverGUID, subject, body, hasItems)
		if err == nil {
			return nextMailID, nil
		}
		if !isDuplicateEntryError(err) {
			return 0, err
		}
	}
	return 0, fmt.Errorf("failed to allocate mail id")
}

func triggerAuctionReload(r *http.Request) error {
	baseURL := config.LauncherBaseURL(r)

	payload := map[string]string{"command": ".reload auctions"}
	bodyBytes, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	req, err := http.NewRequest(http.MethodPost, baseURL+"/api/launcher/command", bytes.NewReader(bodyBytes))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Caller", "auction")

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

	var result map[string]any
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return nil
	}
	if status, ok := result["status"].(string); ok && status != "success" {
		if message, ok := result["message"].(string); ok && strings.TrimSpace(message) != "" {
			return fmt.Errorf("%s", message)
		}
		return fmt.Errorf("launcher command failed")
	}

	return nil
}

func ensureAuctionPermissionSeeds() {
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

	_, _ = db.Exec(`INSERT IGNORE INTO web_menu_registry (id, type, name, order_index) VALUES ('auction', 'menu', '?롪퍔????, 15)`)
	_, _ = db.Exec(`UPDATE web_menu_registry SET name='?롪퍔????, order_index=15 WHERE id='auction'`)

	_, _ = db.Exec(`INSERT IGNORE INTO web_role_permissions (resource_type, resource_id, resource_name, rank_1, rank_2, rank_3, order_index) VALUES ('menu', 'auction', '?롪퍔????, 1, 1, 1, 15)`)
	_, _ = db.Exec(`UPDATE web_role_permissions SET resource_name='?롪퍔????, rank_1=1, rank_2=1, rank_3=1, order_index=15 WHERE resource_type='menu' AND resource_id='auction'`)
}

func handleAuctionMyCharacters(w http.ResponseWriter, r *http.Request) {
	if !CheckMenuPermission(w, r, "auction") {
		return
	}
	userID, _, err := getSessionUserIDAndName(r)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"status": "error", "message": "?β돦裕??筌뤾쑴逾??熬곣뫗???紐껊퉵??"})
		return
	}

	db, err := sql.Open("mysql", auctionCharDSN)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "??븐슙??嶺뚳퐣瑗??繞????댁쾼?띠럾? ?꾩룇裕뉑틦???곕????덈펲."})
		return
	}
	defer db.Close()

	rows, err := db.Query(`
		SELECT guid, name, level, online, money
		FROM characters
		WHERE account = ? AND deleteDate IS NULL
		ORDER BY name ASC
	`, userID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "??븐슙??嶺뚳퐣瑗??繞????댁쾼?띠럾? ?꾩룇裕뉑틦???곕????덈펲."})
		return
	}
	defer rows.Close()

	chars := make([]map[string]interface{}, 0, 8)
	for rows.Next() {
		var guid, level, online int
		var money uint64
		var name string
		if err := rows.Scan(&guid, &name, &level, &online, &money); err != nil {
			continue
		}
		chars = append(chars, map[string]interface{}{
			"guid":   guid,
			"name":   name,
			"level":  level,
			"online": online == 1,
			"money":  money,
		})
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":     "success",
		"characters": chars,
	})
}

func handleAuctionMyItems(w http.ResponseWriter, r *http.Request) {
	if !CheckMenuPermission(w, r, "auction") {
		return
	}
	userID, _, err := getSessionUserIDAndName(r)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"status": "error", "message": "?β돦裕??筌뤾쑴逾??熬곣뫗???紐껊퉵??"})
		return
	}

	charGUID, _ := strconv.Atoi(strings.TrimSpace(r.URL.Query().Get("char_guid")))
	if charGUID <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "嶺?큔????筌먲퐢沅뽪뤆?쎛 ????紐?? ???용????덈펲."})
		return
	}

	db, err := sql.Open("mysql", auctionCharDSN)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "??븐슙??嶺뚳퐣瑗??繞????댁쾼?띠럾? ?꾩룇裕뉑틦???곕????덈펲."})
		return
	}
	defer db.Close()

	var ownerCheck int
	if err := db.QueryRow("SELECT COUNT(*) FROM characters WHERE guid = ? AND account = ?", charGUID, userID).Scan(&ownerCheck); err != nil || ownerCheck == 0 {
		writeJSON(w, http.StatusForbidden, map[string]string{"status": "error", "message": "??嶺?큔???⑤벡異??브퀗?????????곕????덈펲."})
		return
	}

	rows, err := db.Query(`
		SELECT
			ci.item,
			ii.itemEntry,
			ii.count,
			IFNULL(itl.name, it.name) AS item_name,
			IFNULL(it.Quality, 1) AS quality,
			IFNULL(it.class, 0) AS item_class,
			IFNULL(it.subclass, 0) AS item_subclass,
			IFNULL(it.Bonding, 0) AS bonding,
			IFNULL(it.maxcount, 0) AS max_count,
			IFNULL(it.Flags, 0) AS template_flags,
			IFNULL(ii.flags, 0) AS instance_flags
		FROM character_inventory ci
		JOIN item_instance ii ON ii.guid = ci.item
		LEFT JOIN acore_world.item_template it ON it.entry = ii.itemEntry
		LEFT JOIN acore_world.item_template_locale itl ON itl.ID = ii.itemEntry AND itl.locale = 'koKR'
		WHERE ci.guid = ?
		  AND ci.slot >= 23
		  AND NOT EXISTS (SELECT 1 FROM auctionhouse a WHERE a.itemguid = ci.item)
		ORDER BY item_name ASC, ci.item ASC
	`, charGUID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "??븐슙??嶺뚳퐣瑗??繞????댁쾼?띠럾? ?꾩룇裕뉑틦???곕????덈펲."})
		return
	}
	defer rows.Close()

	items := make([]map[string]interface{}, 0, 64)
	for rows.Next() {
		var itemGUID, itemEntry, count, quality, itemClass, itemSubclass int
		var bonding, maxCount, templateFlags, instanceFlags int
		var name sql.NullString
		if err := rows.Scan(&itemGUID, &itemEntry, &count, &name, &quality, &itemClass, &itemSubclass, &bonding, &maxCount, &templateFlags, &instanceFlags); err != nil {
			continue
		}
		if auctionItemBlockReason(bonding, maxCount, templateFlags, instanceFlags) != "" {
			continue
		}
		itemName := "Unknown Item"
		if name.Valid && strings.TrimSpace(name.String) != "" {
			itemName = name.String
		}
		items = append(items, map[string]interface{}{
			"item_guid":     itemGUID,
			"item_entry":    itemEntry,
			"item_count":    count,
			"item_name":     itemName,
			"item_quality":  quality,
			"item_class":    itemClass,
			"item_subclass": itemSubclass,
		})
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status": "success",
		"items":  items,
	})
}

func handleAuctionCreate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"status": "error", "message": "??濡?굘????븐슙????낅퉵??"})
		return
	}
	if !CheckMenuPermission(w, r, "auction") {
		return
	}
	userID, _, err := getSessionUserIDAndName(r)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"status": "error", "message": "?β돦裕??筌뤾쑴逾??熬곣뫗???紐껊퉵??"})
		return
	}

	var req struct {
		CharGUID      int `json:"char_guid"`
		ItemGUID      int `json:"item_guid"`
		StartBid      int `json:"start_bid"`
		BuyoutPrice   int `json:"buyout_price"`
		DurationHours int `json:"duration_hours"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "??븐슙???띠룆???????紐?? ???용????덈펲."})
		return
	}
	if req.CharGUID <= 0 || req.ItemGUID <= 0 || req.StartBid <= 0 || req.BuyoutPrice <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "???놁졑 ?띠룆????筌먦끉逾???낅슣?섋땻??"})
		return
	}
	if req.BuyoutPrice < req.StartBid {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "嶺뚯빖留?袁?쾸?????戮곗굚?띠럾??곌랜?????????띠룇?욥뇡????紐껊퉵??"})
		return
	}
	if req.DurationHours != 12 && req.DurationHours != 24 && req.DurationHours != 48 {
		req.DurationHours = 24
	}

	db, err := sql.Open("mysql", auctionCharDSN)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "??븐슙??嶺뚳퐣瑗??繞????댁쾼?띠럾? ?꾩룇裕뉑틦???곕????덈펲."})
		return
	}
	defer db.Close()

	tx, err := db.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "??븐슙??嶺뚳퐣瑗??繞????댁쾼?띠럾? ?꾩룇裕뉑틦???곕????덈펲."})
		return
	}
	defer tx.Rollback()

	var online, charRace int
	err = tx.QueryRow(`
		SELECT race, online
		FROM characters
		WHERE guid = ? AND account = ?
		FOR UPDATE
	`, req.CharGUID, userID).Scan(&charRace, &online)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusForbidden, map[string]string{"status": "error", "message": "??嶺?큔???⑤벡異??繹먮굞夷???????곕????덈펲."})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "??븐슙??嶺뚳퐣瑗??繞????댁쾼?띠럾? ?꾩룇裕뉑틦???곕????덈펲."})
		return
	}
	if online == 1 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "??얜?爰?繞벿살탳??嶺?큔???⑤베裕??롪퍔????繹먮굞夷???釉띾쐝???紐껊퉵??"})
		return
	}

	var itemEntry, itemCount int
	var bonding, maxCount, templateFlags, instanceFlags int
	err = tx.QueryRow(`
		SELECT
			ii.itemEntry,
			ii.count,
			IFNULL(it.Bonding, 0) AS bonding,
			IFNULL(it.maxcount, 0) AS max_count,
			IFNULL(it.Flags, 0) AS template_flags,
			IFNULL(ii.flags, 0) AS instance_flags
		FROM character_inventory ci
		JOIN item_instance ii ON ii.guid = ci.item
		LEFT JOIN acore_world.item_template it ON it.entry = ii.itemEntry
		WHERE ci.guid = ? AND ci.item = ? AND ci.slot >= 23
		FOR UPDATE
	`, req.CharGUID, req.ItemGUID).Scan(&itemEntry, &itemCount, &bonding, &maxCount, &templateFlags, &instanceFlags)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "?繹먮굞夷??띠럾??繞③뇡??띠럾????熬곣뫗逾??類ㅼ떳 ??ルㅎ臾???낅슣?섋땻??"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "??븐슙??嶺뚳퐣瑗??繞????댁쾼?띠럾? ?꾩룇裕뉑틦???곕????덈펲."})
		return
	}
	if blockReason := auctionItemBlockReason(bonding, maxCount, templateFlags, instanceFlags); blockReason != "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": blockReason})
		return
	}

	var exists int
	if err := tx.QueryRow("SELECT COUNT(*) FROM auctionhouse WHERE itemguid = ?", req.ItemGUID).Scan(&exists); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "??븐슙??嶺뚳퐣瑗??繞????댁쾼?띠럾? ?꾩룇裕뉑틦???곕????덈펲."})
		return
	}
	if exists > 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "???? ?繹먮굞夷???熬곣뫗逾??戮곕엷???덈펲."})
		return
	}

	expireUnix := time.Now().Unix() + int64(req.DurationHours*3600)
	nextAuctionID, err := insertAuctionhouseRow(tx, 7, req.ItemGUID, req.CharGUID, uint64(req.BuyoutPrice), expireUnix, uint64(req.StartBid))
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "?롪퍔????繹먮굞夷?????덉넮???곕????덈펲."})
		return
	}

	res, err := tx.Exec("DELETE FROM character_inventory WHERE guid = ? AND item = ? LIMIT 1", req.CharGUID, req.ItemGUID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "?롪퍔????繹먮굞夷?????덉넮???곕????덈펲."})
		return
	}
	affected, _ := res.RowsAffected()
	if affected == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "?熬곣뫗逾???????嶺뚳퐣瑗??????덉넮???곕????덈펲."})
		return
	}
	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "??븐슙??嶺뚳퐣瑗??繞????댁쾼?띠럾? ?꾩룇裕뉑틦???곕????덈펲."})
		return
	}
	_ = triggerAuctionReload(r)

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":      "success",
		"auction_id":  nextAuctionID,
		"item_entry":  itemEntry,
		"item_count":  itemCount,
		"expire_unix": expireUnix,
	})
}

func handleAuctionMyList(w http.ResponseWriter, r *http.Request) {
	if !CheckMenuPermission(w, r, "auction") {
		return
	}
	userID, _, err := getSessionUserIDAndName(r)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"status": "error", "message": "?β돦裕??筌뤾쑴逾??熬곣뫗???紐껊퉵??"})
		return
	}

	page, _ := strconv.Atoi(strings.TrimSpace(r.URL.Query().Get("page")))
	if page < 1 {
		page = 1
	}
	limit := 10
	offset := (page - 1) * limit

	db, err := sql.Open("mysql", auctionCharDSN)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "??븐슙??嶺뚳퐣瑗??繞????댁쾼?띠럾? ?꾩룇裕뉑틦???곕????덈펲."})
		return
	}
	defer db.Close()

	var total int
	if err := db.QueryRow(`
		SELECT COUNT(*)
		FROM auctionhouse a
		JOIN characters c ON c.guid = a.itemowner
		WHERE c.account = ?
	`, userID).Scan(&total); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "??븐슙??嶺뚳퐣瑗??繞????댁쾼?띠럾? ?꾩룇裕뉑틦???곕????덈펲."})
		return
	}

	rows, err := db.Query(`
		SELECT
			a.id,
			a.itemguid,
			IFNULL(ii.itemEntry, 0),
			IFNULL(ii.count, 1),
			IFNULL(itl.name, IFNULL(it.name, '')),
			IFNULL(it.Quality, 0),
			IFNULL(it.class, 0),
			IFNULL(it.subclass, 0),
			a.startbid,
			a.lastbid,
			a.buyoutprice,
			IFNULL(c.name, ''),
			a.time
		FROM auctionhouse a
		JOIN characters c ON c.guid = a.itemowner
		LEFT JOIN item_instance ii ON ii.guid = a.itemguid
		LEFT JOIN acore_world.item_template it ON it.entry = ii.itemEntry
		LEFT JOIN acore_world.item_template_locale itl ON itl.ID = ii.itemEntry AND itl.locale = 'koKR'
		WHERE c.account = ?
		ORDER BY a.id DESC
		LIMIT ? OFFSET ?
	`, userID, limit, offset)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "??븐슙??嶺뚳퐣瑗??繞????댁쾼?띠럾? ?꾩룇裕뉑틦???곕????덈펲."})
		return
	}
	defer rows.Close()

	result := make([]map[string]interface{}, 0, limit)
	for rows.Next() {
		var auctionID, itemGUID, itemEntry, itemCount int
		var itemName, ownerName string
		var itemQuality, itemClass, itemSubclass int
		var startBid, lastBid, buyoutPrice uint64
		var endUnix uint32

		if err := rows.Scan(
			&auctionID,
			&itemGUID,
			&itemEntry,
			&itemCount,
			&itemName,
			&itemQuality,
			&itemClass,
			&itemSubclass,
			&startBid,
			&lastBid,
			&buyoutPrice,
			&ownerName,
			&endUnix,
		); err != nil {
			continue
		}
		result = append(result, map[string]interface{}{
			"id":            auctionID,
			"item_guid":     itemGUID,
			"item_entry":    itemEntry,
			"item_count":    itemCount,
			"item_name":     itemName,
			"item_quality":  itemQuality,
			"item_class":    itemClass,
			"item_subclass": itemSubclass,
			"start_bid":     startBid,
			"last_bid":      lastBid,
			"buyout_price":  buyoutPrice,
			"owner_name":    ownerName,
			"end_unix":      endUnix,
		})
	}

	totalPages := 1
	if total > 0 {
		totalPages = (total + limit - 1) / limit
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":     "success",
		"page":       page,
		"total":      total,
		"totalPages": totalPages,
		"rows":       result,
	})
}

func handleAuctionCancel(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"status": "error", "message": "??濡?굘????븐슙????낅퉵??"})
		return
	}
	if !CheckMenuPermission(w, r, "auction") {
		return
	}
	userID, _, err := getSessionUserIDAndName(r)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"status": "error", "message": "?β돦裕??筌뤾쑴逾??熬곣뫗???紐껊퉵??"})
		return
	}

	var req struct {
		AuctionID int `json:"auction_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.AuctionID <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "??븐슙???띠룆???????紐?? ???용????덈펲."})
		return
	}

	db, err := sql.Open("mysql", auctionCharDSN)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "??븐슙??嶺뚳퐣瑗??繞????댁쾼?띠럾? ?꾩룇裕뉑틦???곕????덈펲."})
		return
	}
	defer db.Close()

	tx, err := db.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "??븐슙??嶺뚳퐣瑗??繞????댁쾼?띠럾? ?꾩룇裕뉑틦???곕????덈펲."})
		return
	}
	defer tx.Rollback()

	var itemGUID, ownerGUID, lastBid int
	var ownerName string
	err = tx.QueryRow(`
		SELECT a.itemguid, a.itemowner, a.lastbid, IFNULL(c.name, '')
		FROM auctionhouse a
		JOIN characters c ON c.guid = a.itemowner
		WHERE a.id = ? AND c.account = ?
		FOR UPDATE
	`, req.AuctionID, userID).Scan(&itemGUID, &ownerGUID, &lastBid, &ownerName)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "???쳛???띠럾??繞③뇡??롪퍔??蹂잛쾸? ??怨룸????덈펲."})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "??븐슙??嶺뚳퐣瑗??繞????댁쾼?띠럾? ?꾩룇裕뉑틦???곕????덈펲."})
		return
	}
	if lastBid > 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "???얠뺙??嶺뚯쉳?듸쭛???롪퍔???????쳛???????怨룸????덈펲."})
		return
	}

	nextMailID, err := insertMailRow(tx, ownerGUID, ownerGUID, "[寃쎈ℓ?? ?꾩씠??諛섑솚", "?깅줉???꾩씠?쒖쓣 ?고렪?쇰줈 諛섑솚?덉뒿?덈떎.", 1)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "??⑥쥓????諛댁뎽?????덉넮???곕????덈펲."})
		return
	}

	if _, err := tx.Exec("UPDATE item_instance SET owner_guid = ? WHERE guid = ?", ownerGUID, itemGUID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "?熬곣뫗逾???꾩룇瑗??????덉넮???곕????덈펲."})
		return
	}
	if _, err := tx.Exec("INSERT INTO mail_items (mail_id, item_guid, receiver) VALUES (?, ?, ?)", nextMailID, itemGUID, ownerGUID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "?熬곣뫗逾????⑤슡??????덉넮???곕????덈펲."})
		return
	}
	if _, err := tx.Exec("DELETE FROM auctionhouse WHERE id = ?", req.AuctionID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "?롪퍔??????쳛??嶺뚳퐣瑗??????덉넮???곕????덈펲."})
		return
	}
	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "??븐슙??嶺뚳퐣瑗??繞????댁쾼?띠럾? ?꾩룇裕뉑틦???곕????덈펲."})
		return
	}
	_ = triggerAuctionReload(r)
	_ = ownerName
	writeJSON(w, http.StatusOK, map[string]interface{}{"status": "success"})
}

func handleAuctionBuyout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"status": "error", "message": "??濡?굘????븐슙????낅퉵??"})
		return
	}
	if !CheckMenuPermission(w, r, "auction") {
		return
	}
	userID, _, err := getSessionUserIDAndName(r)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"status": "error", "message": "?β돦裕??筌뤾쑴逾??熬곣뫗???紐껊퉵??"})
		return
	}

	var req struct {
		AuctionID     int `json:"auction_id"`
		BuyerCharGUID int `json:"buyer_char_guid"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.AuctionID <= 0 || req.BuyerCharGUID <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "??븐슙???띠룆???????紐?? ???용????덈펲."})
		return
	}

	db, err := sql.Open("mysql", auctionCharDSN)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "??븐슙??嶺뚳퐣瑗??繞????댁쾼?띠럾? ?꾩룇裕뉑틦???곕????덈펲."})
		return
	}
	defer db.Close()

	tx, err := db.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "??븐슙??嶺뚳퐣瑗??繞????댁쾼?띠럾? ?꾩룇裕뉑틦???곕????덈펲."})
		return
	}
	defer tx.Rollback()

	var itemGUID, sellerGUID, sellerAccountID int
	var buyoutPrice uint64
	var startBid uint64
	var endUnix uint32
	err = tx.QueryRow(`
		SELECT a.itemguid, a.itemowner, IFNULL(c.account, 0), a.buyoutprice, a.startbid, a.time
		FROM auctionhouse a
		LEFT JOIN characters c ON c.guid = a.itemowner
		WHERE a.id = ?
		FOR UPDATE
	`, req.AuctionID).Scan(&itemGUID, &sellerGUID, &sellerAccountID, &buyoutPrice, &startBid, &endUnix)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "??????롪퍔??蹂잛쾸? ?브퀡????? ???용????덈펲."})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "??븐슙??嶺뚳퐣瑗??繞????댁쾼?띠럾? ?꾩룇裕뉑틦???곕????덈펲."})
		return
	}
	payPrice := buyoutPrice
	if payPrice <= 0 {
		payPrice = startBid
	}
	if payPrice <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "??뚮맍瑗??띠럾??繞③뇡??ル?녽뇡??筌먲퐢沅뽪뤆?쎛 ??怨룸????덈펲."})
		return
	}
	if int64(endUnix) <= time.Now().Unix() {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "???? ??リ턁筌???롪퍔?????낅퉵??"})
		return
	}
	if sellerAccountID == userID {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "?곌랜梨???롪퍔??????뚮맍瑗??????怨룸????덈펲."})
		return
	}

	var buyerMoney uint64
	var buyerOnline int
	err = tx.QueryRow(`
		SELECT money, online
		FROM characters
		WHERE guid = ? AND account = ?
		FOR UPDATE
	`, req.BuyerCharGUID, userID).Scan(&buyerMoney, &buyerOnline)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "??뚮맍瑗?嶺?큔???? ????紐?? ???용????덈펲."})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "??븐슙??嶺뚳퐣瑗??繞????댁쾼?띠럾? ?꾩룇裕뉑틦???곕????덈펲."})
		return
	}
	if buyerOnline == 1 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "??얜?爰?繞벿살탳??嶺?큔???⑤벡夷????뚮맍瑗??????怨룸????덈펲."})
		return
	}
	if buyerMoney < payPrice {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "?곌랜??? ??λ?獄?쑚泥? ?遊붋?브퀗?꿴뜮????덈펲."})
		return
	}

	if _, err := tx.Exec("UPDATE characters SET money = money - ? WHERE guid = ?", payPrice, req.BuyerCharGUID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "??λ?獄?嶺뚢뼰紐욤?????덉넮???곕????덈펲."})
		return
	}
	if _, err := tx.Exec("UPDATE characters SET money = money + ? WHERE guid = ?", payPrice, sellerGUID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "???瑗????λ?獄?嶺뚯솘??ル留⑵굢????덉넮???곕????덈펲."})
		return
	}

	nextMailID, err := insertMailRow(tx, sellerGUID, req.BuyerCharGUID, "[寃쎈ℓ?? 利됱떆援щℓ", "援щℓ???꾩씠?쒖쓣 ?고렪?쇰줈 諛쒖넚?덉뒿?덈떎.", 1)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "??⑥쥓????諛댁뎽?????덉넮???곕????덈펲."})
		return
	}

	if _, err := tx.Exec("UPDATE item_instance SET owner_guid = ? WHERE guid = ?", req.BuyerCharGUID, itemGUID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "?熬곣뫗逾????怨몄쓧?????덉넮???곕????덈펲."})
		return
	}
	if _, err := tx.Exec("INSERT INTO mail_items (mail_id, item_guid, receiver) VALUES (?, ?, ?)", nextMailID, itemGUID, req.BuyerCharGUID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "?熬곣뫗逾????⑤슡??????덉넮???곕????덈펲."})
		return
	}

	if _, err := tx.Exec("DELETE FROM auctionhouse WHERE id = ?", req.AuctionID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "?롪퍔?????リ턁筌?嶺뚳퐣瑗??????덉넮???곕????덈펲."})
		return
	}
	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "??븐슙??嶺뚳퐣瑗??繞????댁쾼?띠럾? ?꾩룇裕뉑틦???곕????덈펲."})
		return
	}
	_ = triggerAuctionReload(r)

	writeJSON(w, http.StatusOK, map[string]interface{}{"status": "success"})
}

func handleAuctionBid(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"status": "error", "message": "??濡?굘????븐슙????낅퉵??"})
		return
	}
	if !CheckMenuPermission(w, r, "auction") {
		return
	}
	userID, _, err := getSessionUserIDAndName(r)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"status": "error", "message": "?β돦裕??筌뤾쑴逾??熬곣뫗???紐껊퉵??"})
		return
	}

	var req struct {
		AuctionID     int `json:"auction_id"`
		BuyerCharGUID int `json:"buyer_char_guid"`
		BidPrice      int `json:"bid_price"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.AuctionID <= 0 || req.BuyerCharGUID <= 0 || req.BidPrice <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "??븐슙???띠룆???????紐?? ???용????덈펲."})
		return
	}

	db, err := sql.Open("mysql", auctionCharDSN)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "??븐슙??嶺뚳퐣瑗??繞????댁쾼?띠럾? ?꾩룇裕뉑틦???곕????덈펲."})
		return
	}
	defer db.Close()

	tx, err := db.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "??븐슙??嶺뚳퐣瑗??繞????댁쾼?띠럾? ?꾩룇裕뉑틦???곕????덈펲."})
		return
	}
	defer tx.Rollback()

	var sellerGUID, sellerAccountID, prevBidderGUID int
	var buyoutPrice, startBid, lastBid uint64
	var endUnix uint32
	err = tx.QueryRow(`
		SELECT a.itemowner, IFNULL(c.account, 0), a.buyoutprice, a.startbid, a.lastbid, a.buyguid, a.time
		FROM auctionhouse a
		LEFT JOIN characters c ON c.guid = a.itemowner
		WHERE a.id = ?
		FOR UPDATE
	`, req.AuctionID).Scan(&sellerGUID, &sellerAccountID, &buyoutPrice, &startBid, &lastBid, &prevBidderGUID, &endUnix)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "??????롪퍔??蹂잛쾸? ?브퀡????? ???용????덈펲."})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "??븐슙??嶺뚳퐣瑗??繞????댁쾼?띠럾? ?꾩룇裕뉑틦???곕????덈펲."})
		return
	}
	if int64(endUnix) <= time.Now().Unix() {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "???? ??リ턁筌???롪퍔?????낅퉵??"})
		return
	}
	if sellerAccountID == userID {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "?곌랜梨???롪퍔?????裕????얠뺙??????怨룸????덈펲."})
		return
	}

	minBid := startBid
	if lastBid > 0 {
		minBid = lastBid + 1
	}
	if uint64(req.BidPrice) < minBid {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "嶺뚣끉裕?????얠뺙?띠럾??곌랜????沃? ?ル?녽뇡?????놁졑??琉얠돪??"})
		return
	}
	if buyoutPrice > 0 && uint64(req.BidPrice) >= buyoutPrice {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "嶺뚯빖留?袁?쾸? ??怨대쭜?? ??뚮맍瑗??뺢퀗??????怨몃뮔???낅슣?섋땻??"})
		return
	}

	var buyerMoney uint64
	var buyerOnline int
	err = tx.QueryRow(`
		SELECT money, online
		FROM characters
		WHERE guid = ? AND account = ?
		FOR UPDATE
	`, req.BuyerCharGUID, userID).Scan(&buyerMoney, &buyerOnline)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "???얠뺙 嶺?큔???? ????紐?? ???용????덈펲."})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "??븐슙??嶺뚳퐣瑗??繞????댁쾼?띠럾? ?꾩룇裕뉑틦???곕????덈펲."})
		return
	}
	if buyerOnline == 1 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "??얜?爰?繞벿살탳??嶺?큔???⑤벡夷?????얠뺙??????怨룸????덈펲."})
		return
	}
	if buyerMoney < uint64(req.BidPrice) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "?곌랜??? ??λ?獄?쑚泥? ?遊붋?브퀗?꿴뜮????덈펲."})
		return
	}

	// Refund previous highest bidder before applying new bid.
	if prevBidderGUID > 0 && lastBid > 0 {
		if _, err := tx.Exec("UPDATE characters SET money = money + ? WHERE guid = ?", lastBid, prevBidderGUID); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "??怨몄쓧 ???얠뺙????濡곕?嶺뚳퐣瑗??????덉넮???곕????덈펲."})
			return
		}
	}

	if _, err := tx.Exec("UPDATE characters SET money = money - ? WHERE guid = ?", req.BidPrice, req.BuyerCharGUID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "??λ?獄?嶺뚢뼰紐욤?????덉넮???곕????덈펲."})
		return
	}

	if _, err := tx.Exec("UPDATE auctionhouse SET buyguid = ?, lastbid = ? WHERE id = ?", req.BuyerCharGUID, req.BidPrice, req.AuctionID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "???얠뺙 ?꾩룇瑗??????덉넮???곕????덈펲."})
		return
	}
	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "??븐슙??嶺뚳퐣瑗??繞????댁쾼?띠럾? ?꾩룇裕뉑틦???곕????덈펲."})
		return
	}
	_ = triggerAuctionReload(r)

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":  "success",
		"lastbid": req.BidPrice,
		"min_bid": minBid,
	})
}

func handleAuctionList(w http.ResponseWriter, r *http.Request) {
	if !CheckMenuPermission(w, r, "auction") {
		return
	}

	page, _ := strconv.Atoi(strings.TrimSpace(r.URL.Query().Get("page")))
	if page < 1 {
		page = 1
	}
	limit, _ := strconv.Atoi(strings.TrimSpace(r.URL.Query().Get("limit")))
	if limit <= 0 {
		limit = 10
	}
	if limit > 50 {
		limit = 50
	}
	offset := (page - 1) * limit

	search := strings.TrimSpace(r.URL.Query().Get("search"))
	status := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("status")))
	owner := strings.TrimSpace(r.URL.Query().Get("owner"))
	bidder := strings.TrimSpace(r.URL.Query().Get("bidder"))
	quality, qErr := strconv.Atoi(strings.TrimSpace(r.URL.Query().Get("quality")))
	itemClass, cErr := strconv.Atoi(strings.TrimSpace(r.URL.Query().Get("item_class")))
	itemSubclass, sErr := strconv.Atoi(strings.TrimSpace(r.URL.Query().Get("item_subclass")))

	db, err := sql.Open("mysql", auctionCharDSN)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "??븐슙??嶺뚳퐣瑗??繞????댁쾼?띠럾? ?꾩룇裕뉑틦???곕????덈펲."})
		return
	}
	defer db.Close()

	where := []string{"a.houseid IN (2, 6, 7)"}
	args := make([]interface{}, 0, 16)

	if search != "" {
		where = append(where, "(IFNULL(itl.name, IFNULL(it.name, '')) LIKE ? OR CAST(a.id AS CHAR) LIKE ? OR c_owner.name LIKE ? OR c_bid.name LIKE ?)")
		like := "%" + search + "%"
		args = append(args, like, like, like, like)
	}
	if status == "active" {
		where = append(where, "a.time > UNIX_TIMESTAMP()")
	} else if status == "expired" {
		where = append(where, "a.time <= UNIX_TIMESTAMP()")
	}
	if owner != "" {
		where = append(where, "c_owner.name LIKE ?")
		args = append(args, "%"+owner+"%")
	}
	if bidder != "" {
		where = append(where, "c_bid.name LIKE ?")
		args = append(args, "%"+bidder+"%")
	}
	if qErr == nil && quality >= 0 {
		where = append(where, "it.Quality = ?")
		args = append(args, quality)
	}
	if cErr == nil && itemClass >= 0 {
		where = append(where, "it.class = ?")
		args = append(args, itemClass)
	}
	if sErr == nil && itemSubclass >= 0 {
		where = append(where, "it.subclass = ?")
		args = append(args, itemSubclass)
	}
	whereSQL := strings.Join(where, " AND ")

	countQuery := `
		SELECT COUNT(*)
		FROM auctionhouse a
		LEFT JOIN item_instance ii ON ii.guid = a.itemguid
		LEFT JOIN acore_world.item_template it ON it.entry = ii.itemEntry
		LEFT JOIN acore_world.item_template_locale itl ON itl.ID = ii.itemEntry AND itl.locale = 'koKR'
		LEFT JOIN characters c_owner ON c_owner.guid = a.itemowner
		LEFT JOIN characters c_bid ON c_bid.guid = a.buyguid
		WHERE ` + whereSQL

	var total int
	if err := db.QueryRow(countQuery, args...).Scan(&total); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "??븐슙??嶺뚳퐣瑗??繞????댁쾼?띠럾? ?꾩룇裕뉑틦???곕????덈펲."})
		return
	}

	query := `
		SELECT
			a.id,
			a.itemguid,
			IFNULL(ii.itemEntry, 0) AS item_entry,
			IFNULL(ii.count, 1) AS item_count,
			IFNULL(itl.name, IFNULL(it.name, '')) AS item_name,
			IFNULL(it.Quality, 0) AS item_quality,
			IFNULL(it.class, 0) AS item_class,
			IFNULL(it.subclass, 0) AS item_subclass,
			a.startbid,
			a.lastbid,
			a.buyoutprice,
			a.itemowner,
			IFNULL(c_owner.account, 0) AS owner_account,
			IFNULL(c_owner.name, '') AS owner_name,
			a.buyguid,
			IFNULL(c_bid.name, '') AS bidder_name,
			a.time
		FROM auctionhouse a
		LEFT JOIN item_instance ii ON ii.guid = a.itemguid
		LEFT JOIN acore_world.item_template it ON it.entry = ii.itemEntry
		LEFT JOIN acore_world.item_template_locale itl ON itl.ID = ii.itemEntry AND itl.locale = 'koKR'
		LEFT JOIN characters c_owner ON c_owner.guid = a.itemowner
		LEFT JOIN characters c_bid ON c_bid.guid = a.buyguid
		WHERE ` + whereSQL + `
		ORDER BY a.id DESC
		LIMIT ? OFFSET ?`

	queryArgs := append([]interface{}{}, args...)
	queryArgs = append(queryArgs, limit, offset)
	rows, err := db.Query(query, queryArgs...)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "??븐슙??嶺뚳퐣瑗??繞????댁쾼?띠럾? ?꾩룇裕뉑틦???곕????덈펲."})
		return
	}
	defer rows.Close()

	result := make([]map[string]interface{}, 0, limit)
	for rows.Next() {
		var auctionID, itemGUID, itemEntry, itemCount int
		var itemName string
		var itemQuality, itemClassValue, itemSubclassValue int
		var startBid, lastBid, buyoutPrice uint64
		var ownerGUID, ownerAccount, bidderGUID, endUnix uint32
		var ownerName, bidderName string

		if err := rows.Scan(
			&auctionID,
			&itemGUID,
			&itemEntry,
			&itemCount,
			&itemName,
			&itemQuality,
			&itemClassValue,
			&itemSubclassValue,
			&startBid,
			&lastBid,
			&buyoutPrice,
			&ownerGUID,
			&ownerAccount,
			&ownerName,
			&bidderGUID,
			&bidderName,
			&endUnix,
		); err != nil {
			continue
		}

		result = append(result, map[string]interface{}{
			"id":            auctionID,
			"item_guid":     itemGUID,
			"item_entry":    itemEntry,
			"item_count":    itemCount,
			"item_name":     itemName,
			"item_quality":  itemQuality,
			"item_class":    itemClassValue,
			"item_subclass": itemSubclassValue,
			"start_bid":     startBid,
			"last_bid":      lastBid,
			"buyout_price":  buyoutPrice,
			"owner_guid":    ownerGUID,
			"owner_account": ownerAccount,
			"owner_name":    ownerName,
			"bidder_guid":   bidderGUID,
			"bidder_name":   bidderName,
			"end_unix":      endUnix,
		})
	}

	totalPages := 1
	if total > 0 {
		totalPages = (total + limit - 1) / limit
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":     "success",
		"page":       page,
		"limit":      limit,
		"total":      total,
		"totalPages": totalPages,
		"rows":       result,
	})
}
