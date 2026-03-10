package stats

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	_ "github.com/go-sql-driver/mysql"
)

const auctionCharDSN = "root:4618@tcp(localhost:3306)/acore_characters"

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

	_, _ = db.Exec(`INSERT IGNORE INTO web_menu_registry (id, type, name, order_index) VALUES ('auction', 'menu', '경매장', 15)`)
	_, _ = db.Exec(`UPDATE web_menu_registry SET name='경매장', order_index=15 WHERE id='auction'`)

	_, _ = db.Exec(`INSERT IGNORE INTO web_role_permissions (resource_type, resource_id, resource_name, rank_1, rank_2, rank_3, order_index) VALUES ('menu', 'auction', '경매장', 1, 1, 1, 15)`)
	_, _ = db.Exec(`UPDATE web_role_permissions SET resource_name='경매장', rank_1=1, rank_2=1, rank_3=1, order_index=15 WHERE resource_type='menu' AND resource_id='auction'`)
}

func handleAuctionMyCharacters(w http.ResponseWriter, r *http.Request) {
	if !CheckMenuPermission(w, r, "auction") {
		return
	}
	userID, _, err := getSessionUserIDAndName(r)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"status": "error", "message": "로그인이 필요합니다."})
		return
	}

	db, err := sql.Open("mysql", auctionCharDSN)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "요청 처리 중 오류가 발생했습니다."})
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
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "요청 처리 중 오류가 발생했습니다."})
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
		writeJSON(w, http.StatusUnauthorized, map[string]string{"status": "error", "message": "로그인이 필요합니다."})
		return
	}

	charGUID, _ := strconv.Atoi(strings.TrimSpace(r.URL.Query().Get("char_guid")))
	if charGUID <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "캐릭터 정보가 올바르지 않습니다."})
		return
	}

	db, err := sql.Open("mysql", auctionCharDSN)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "요청 처리 중 오류가 발생했습니다."})
		return
	}
	defer db.Close()

	var ownerCheck int
	if err := db.QueryRow("SELECT COUNT(*) FROM characters WHERE guid = ? AND account = ?", charGUID, userID).Scan(&ownerCheck); err != nil || ownerCheck == 0 {
		writeJSON(w, http.StatusForbidden, map[string]string{"status": "error", "message": "내 캐릭터만 조회할 수 있습니다."})
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
			IFNULL(it.subclass, 0) AS item_subclass
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
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "요청 처리 중 오류가 발생했습니다."})
		return
	}
	defer rows.Close()

	items := make([]map[string]interface{}, 0, 64)
	for rows.Next() {
		var itemGUID, itemEntry, count, quality, itemClass, itemSubclass int
		var name sql.NullString
		if err := rows.Scan(&itemGUID, &itemEntry, &count, &name, &quality, &itemClass, &itemSubclass); err != nil {
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
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"status": "error", "message": "잘못된 요청입니다."})
		return
	}
	if !CheckMenuPermission(w, r, "auction") {
		return
	}
	userID, _, err := getSessionUserIDAndName(r)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"status": "error", "message": "로그인이 필요합니다."})
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
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "요청 값이 올바르지 않습니다."})
		return
	}
	if req.CharGUID <= 0 || req.ItemGUID <= 0 || req.StartBid <= 0 || req.BuyoutPrice <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "입력 값을 확인해 주세요."})
		return
	}
	if req.BuyoutPrice < req.StartBid {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "즉구가는 시작가보다 크거나 같아야 합니다."})
		return
	}
	if req.DurationHours != 12 && req.DurationHours != 24 && req.DurationHours != 48 {
		req.DurationHours = 24
	}

	db, err := sql.Open("mysql", auctionCharDSN)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "요청 처리 중 오류가 발생했습니다."})
		return
	}
	defer db.Close()

	tx, err := db.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "요청 처리 중 오류가 발생했습니다."})
		return
	}
	defer tx.Rollback()

	var online int
	err = tx.QueryRow(`
		SELECT online
		FROM characters
		WHERE guid = ? AND account = ?
		FOR UPDATE
	`, req.CharGUID, userID).Scan(&online)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusForbidden, map[string]string{"status": "error", "message": "내 캐릭터만 등록할 수 있습니다."})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "요청 처리 중 오류가 발생했습니다."})
		return
	}
	if online == 1 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "접속 중인 캐릭터는 경매 등록이 불가합니다."})
		return
	}

	var itemEntry, itemCount int
	err = tx.QueryRow(`
		SELECT ii.itemEntry, ii.count
		FROM character_inventory ci
		JOIN item_instance ii ON ii.guid = ci.item
		WHERE ci.guid = ? AND ci.item = ? AND ci.slot >= 23
		FOR UPDATE
	`, req.CharGUID, req.ItemGUID).Scan(&itemEntry, &itemCount)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "등록 가능한 가방 아이템만 선택해 주세요."})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "요청 처리 중 오류가 발생했습니다."})
		return
	}

	var exists int
	if err := tx.QueryRow("SELECT COUNT(*) FROM auctionhouse WHERE itemguid = ?", req.ItemGUID).Scan(&exists); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "요청 처리 중 오류가 발생했습니다."})
		return
	}
	if exists > 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "이미 등록된 아이템입니다."})
		return
	}

	var nextAuctionID int
	if err := tx.QueryRow("SELECT IFNULL(MAX(id), 0) + 1 FROM auctionhouse").Scan(&nextAuctionID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "요청 처리 중 오류가 발생했습니다."})
		return
	}

	expireUnix := time.Now().Unix() + int64(req.DurationHours*3600)
	_, err = tx.Exec(`
		INSERT INTO auctionhouse (id, houseid, itemguid, itemowner, buyoutprice, time, buyguid, lastbid, startbid, deposit)
		VALUES (?, 7, ?, ?, ?, ?, 0, 0, ?, 0)
	`, nextAuctionID, req.ItemGUID, req.CharGUID, req.BuyoutPrice, expireUnix, req.StartBid)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "경매 등록에 실패했습니다."})
		return
	}

	res, err := tx.Exec("DELETE FROM character_inventory WHERE guid = ? AND item = ? LIMIT 1", req.CharGUID, req.ItemGUID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "경매 등록에 실패했습니다."})
		return
	}
	affected, _ := res.RowsAffected()
	if affected == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "아이템 이동 처리에 실패했습니다."})
		return
	}

	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "요청 처리 중 오류가 발생했습니다."})
		return
	}

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
		writeJSON(w, http.StatusUnauthorized, map[string]string{"status": "error", "message": "로그인이 필요합니다."})
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
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "요청 처리 중 오류가 발생했습니다."})
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
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "요청 처리 중 오류가 발생했습니다."})
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
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "요청 처리 중 오류가 발생했습니다."})
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
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"status": "error", "message": "잘못된 요청입니다."})
		return
	}
	if !CheckMenuPermission(w, r, "auction") {
		return
	}
	userID, _, err := getSessionUserIDAndName(r)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"status": "error", "message": "로그인이 필요합니다."})
		return
	}

	var req struct {
		AuctionID int `json:"auction_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.AuctionID <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "요청 값이 올바르지 않습니다."})
		return
	}

	db, err := sql.Open("mysql", auctionCharDSN)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "요청 처리 중 오류가 발생했습니다."})
		return
	}
	defer db.Close()

	tx, err := db.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "요청 처리 중 오류가 발생했습니다."})
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
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "취소 가능한 경매가 없습니다."})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "요청 처리 중 오류가 발생했습니다."})
		return
	}
	if lastBid > 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "입찰이 진행된 경매는 취소할 수 없습니다."})
		return
	}

	var nextMailID int
	if err := tx.QueryRow("SELECT IFNULL(MAX(id), 0) + 1 FROM mail").Scan(&nextMailID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "요청 처리 중 오류가 발생했습니다."})
		return
	}
	if _, err := tx.Exec(`
		INSERT INTO mail (id, messageType, stationery, mailTemplateId, sender, receiver, subject, body, has_items, expire_time, deliver_time, money, cod, checked)
		VALUES (?, 0, 41, 0, ?, ?, ?, ?, 1, UNIX_TIMESTAMP()+2592000, UNIX_TIMESTAMP(), 0, 0, 0)
	`, nextMailID, ownerGUID, ownerGUID, "[경매장] 등록 취소", "등록한 경매 아이템이 반환되었습니다."); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "우편 생성에 실패했습니다."})
		return
	}

	if _, err := tx.Exec("UPDATE item_instance SET owner_guid = ? WHERE guid = ?", ownerGUID, itemGUID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "아이템 반환에 실패했습니다."})
		return
	}
	if _, err := tx.Exec("INSERT INTO mail_items (mail_id, item_guid, receiver) VALUES (?, ?, ?)", nextMailID, itemGUID, ownerGUID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "아이템 연결에 실패했습니다."})
		return
	}
	if _, err := tx.Exec("DELETE FROM auctionhouse WHERE id = ?", req.AuctionID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "경매 취소 처리에 실패했습니다."})
		return
	}

	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "요청 처리 중 오류가 발생했습니다."})
		return
	}
	_ = ownerName
	writeJSON(w, http.StatusOK, map[string]interface{}{"status": "success"})
}

func handleAuctionBuyout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"status": "error", "message": "잘못된 요청입니다."})
		return
	}
	if !CheckMenuPermission(w, r, "auction") {
		return
	}
	userID, _, err := getSessionUserIDAndName(r)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"status": "error", "message": "로그인이 필요합니다."})
		return
	}

	var req struct {
		AuctionID     int `json:"auction_id"`
		BuyerCharGUID int `json:"buyer_char_guid"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.AuctionID <= 0 || req.BuyerCharGUID <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "요청 값이 올바르지 않습니다."})
		return
	}

	db, err := sql.Open("mysql", auctionCharDSN)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "요청 처리 중 오류가 발생했습니다."})
		return
	}
	defer db.Close()

	tx, err := db.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "요청 처리 중 오류가 발생했습니다."})
		return
	}
	defer tx.Rollback()

	var itemGUID, sellerGUID int
	var buyoutPrice uint64
	var startBid uint64
	var endUnix uint32
	err = tx.QueryRow(`
		SELECT itemguid, itemowner, buyoutprice, startbid, time
		FROM auctionhouse
		WHERE id = ?
		FOR UPDATE
	`, req.AuctionID).Scan(&itemGUID, &sellerGUID, &buyoutPrice, &startBid, &endUnix)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "해당 경매가 존재하지 않습니다."})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "요청 처리 중 오류가 발생했습니다."})
		return
	}
	payPrice := buyoutPrice
	if payPrice <= 0 {
		payPrice = startBid
	}
	if payPrice <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "구매 가능한 금액 정보가 없습니다."})
		return
	}
	if int64(endUnix) <= time.Now().Unix() {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "이미 종료된 경매입니다."})
		return
	}
	if sellerGUID == req.BuyerCharGUID {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "본인 경매는 구매할 수 없습니다."})
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
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "구매 캐릭터가 올바르지 않습니다."})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "요청 처리 중 오류가 발생했습니다."})
		return
	}
	if buyerOnline == 1 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "접속 중인 캐릭터로는 구매할 수 없습니다."})
		return
	}
	if buyerMoney < payPrice {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "보유 골드가 부족합니다."})
		return
	}

	if _, err := tx.Exec("UPDATE characters SET money = money - ? WHERE guid = ?", payPrice, req.BuyerCharGUID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "골드 차감에 실패했습니다."})
		return
	}
	if _, err := tx.Exec("UPDATE characters SET money = money + ? WHERE guid = ?", payPrice, sellerGUID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "판매자 골드 지급에 실패했습니다."})
		return
	}

	var nextMailID int
	if err := tx.QueryRow("SELECT IFNULL(MAX(id), 0) + 1 FROM mail").Scan(&nextMailID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "요청 처리 중 오류가 발생했습니다."})
		return
	}
	if _, err := tx.Exec(`
		INSERT INTO mail (id, messageType, stationery, mailTemplateId, sender, receiver, subject, body, has_items, expire_time, deliver_time, money, cod, checked)
		VALUES (?, 0, 41, 0, ?, ?, ?, ?, 1, UNIX_TIMESTAMP()+2592000, UNIX_TIMESTAMP(), 0, 0, 0)
	`, nextMailID, sellerGUID, req.BuyerCharGUID, "[경매장] 즉시구매", "구매한 아이템이 도착했습니다."); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "우편 생성에 실패했습니다."})
		return
	}

	if _, err := tx.Exec("UPDATE item_instance SET owner_guid = ? WHERE guid = ?", req.BuyerCharGUID, itemGUID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "아이템 이전에 실패했습니다."})
		return
	}
	if _, err := tx.Exec("INSERT INTO mail_items (mail_id, item_guid, receiver) VALUES (?, ?, ?)", nextMailID, itemGUID, req.BuyerCharGUID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "아이템 연결에 실패했습니다."})
		return
	}

	if _, err := tx.Exec("DELETE FROM auctionhouse WHERE id = ?", req.AuctionID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "경매 종료 처리에 실패했습니다."})
		return
	}

	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "요청 처리 중 오류가 발생했습니다."})
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"status": "success"})
}

func handleAuctionBid(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"status": "error", "message": "잘못된 요청입니다."})
		return
	}
	if !CheckMenuPermission(w, r, "auction") {
		return
	}
	userID, _, err := getSessionUserIDAndName(r)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"status": "error", "message": "로그인이 필요합니다."})
		return
	}

	var req struct {
		AuctionID     int `json:"auction_id"`
		BuyerCharGUID int `json:"buyer_char_guid"`
		BidPrice      int `json:"bid_price"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.AuctionID <= 0 || req.BuyerCharGUID <= 0 || req.BidPrice <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "요청 값이 올바르지 않습니다."})
		return
	}

	db, err := sql.Open("mysql", auctionCharDSN)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "요청 처리 중 오류가 발생했습니다."})
		return
	}
	defer db.Close()

	tx, err := db.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "요청 처리 중 오류가 발생했습니다."})
		return
	}
	defer tx.Rollback()

	var sellerGUID, prevBidderGUID int
	var buyoutPrice, startBid, lastBid uint64
	var endUnix uint32
	err = tx.QueryRow(`
		SELECT itemowner, buyoutprice, startbid, lastbid, buyguid, time
		FROM auctionhouse
		WHERE id = ?
		FOR UPDATE
	`, req.AuctionID).Scan(&sellerGUID, &buyoutPrice, &startBid, &lastBid, &prevBidderGUID, &endUnix)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "해당 경매가 존재하지 않습니다."})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "요청 처리 중 오류가 발생했습니다."})
		return
	}
	if int64(endUnix) <= time.Now().Unix() {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "이미 종료된 경매입니다."})
		return
	}
	if sellerGUID == req.BuyerCharGUID {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "본인 경매에는 입찰할 수 없습니다."})
		return
	}

	minBid := startBid
	if lastBid > 0 {
		minBid = lastBid + 1
	}
	if uint64(req.BidPrice) < minBid {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "최소 입찰가보다 높은 금액을 입력하세요."})
		return
	}
	if buyoutPrice > 0 && uint64(req.BidPrice) >= buyoutPrice {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "즉구가 이상은 구매 버튼을 이용해 주세요."})
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
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "입찰 캐릭터가 올바르지 않습니다."})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "요청 처리 중 오류가 발생했습니다."})
		return
	}
	if buyerOnline == 1 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "접속 중인 캐릭터로는 입찰할 수 없습니다."})
		return
	}
	if buyerMoney < uint64(req.BidPrice) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "보유 골드가 부족합니다."})
		return
	}

	// Refund previous highest bidder before applying new bid.
	if prevBidderGUID > 0 && lastBid > 0 {
		if _, err := tx.Exec("UPDATE characters SET money = money + ? WHERE guid = ?", lastBid, prevBidderGUID); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "이전 입찰자 환불 처리에 실패했습니다."})
			return
		}
	}

	if _, err := tx.Exec("UPDATE characters SET money = money - ? WHERE guid = ?", req.BidPrice, req.BuyerCharGUID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "골드 차감에 실패했습니다."})
		return
	}

	if _, err := tx.Exec("UPDATE auctionhouse SET buyguid = ?, lastbid = ? WHERE id = ?", req.BuyerCharGUID, req.BidPrice, req.AuctionID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "입찰 반영에 실패했습니다."})
		return
	}

	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "요청 처리 중 오류가 발생했습니다."})
		return
	}

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
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "요청 처리 중 오류가 발생했습니다."})
		return
	}
	defer db.Close()

	where := []string{"a.houseid = 7"}
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
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "요청 처리 중 오류가 발생했습니다."})
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
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "요청 처리 중 오류가 발생했습니다."})
		return
	}
	defer rows.Close()

	result := make([]map[string]interface{}, 0, limit)
	for rows.Next() {
		var auctionID, itemGUID, itemEntry, itemCount int
		var itemName string
		var itemQuality, itemClassValue, itemSubclassValue int
		var startBid, lastBid, buyoutPrice uint64
		var ownerGUID, bidderGUID, endUnix uint32
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
