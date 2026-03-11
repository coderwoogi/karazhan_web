package stats

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"karazhan/pkg/config"
	"log"
	"net/http"
)

// Black Market Logs Handler
func handleBlackMarketLogs(w http.ResponseWriter, r *http.Request) {
	// Authorization Check using Menu Permission AND Submenu Permission
	if !CheckMenuPermission(w, r, "logs") {
		return
	}
	if !CheckMenuPermission(w, r, "log-blackmarket", "submenu") {
		return
	}

	// Connect to characters DB
	charDSN := config.CharactersDSN()
	charDB, err := sql.Open("mysql", charDSN)
	if err != nil {
		http.Error(w, "Characters DB Connection Error", http.StatusInternalServerError)
		return
	}
	defer charDB.Close()

	// Parse Query Params
	queryValues := r.URL.Query()
	pageStr := queryValues.Get("page")
	limitStr := queryValues.Get("limit")
	charFilter := queryValues.Get("character")
	itemFilter := queryValues.Get("item")

	page := 1
	if pageStr != "" {
		fmt.Sscanf(pageStr, "%d", &page)
	}
	limit := 20
	if limitStr != "" {
		fmt.Sscanf(limitStr, "%d", &limit)
	}
	if page < 1 {
		page = 1
	}
	offset := (page - 1) * limit

	// Build Query - Join with characters table and item_template from world DB
	baseQuery := `
		SELECT 
			bm.id,
			COALESCE(c.name, 'Unknown') as character_name,
			COALESCE(itl.Name, it.name, CONCAT('Item ', bm.item_entry)) as item_name,
			0 as price,
			FROM_UNIXTIME(bm.purchase_time) as purchase_date,
			bm.item_entry
		FROM blackmarket_purchase_log bm
		LEFT JOIN characters c ON bm.character_guid = c.guid
		LEFT JOIN acore_world.item_template it ON bm.item_entry = it.entry
		LEFT JOIN acore_world.item_template_locale itl ON it.entry = itl.ID AND itl.locale = 'koKR'
	`
	countQuery := "SELECT COUNT(*) FROM blackmarket_purchase_log bm"
	whereClause := ""
	var args []interface{}

	if charFilter != "" {
		whereClause += " WHERE c.name LIKE ?"
		args = append(args, "%"+charFilter+"%")
	}
	if itemFilter != "" {
		if whereClause == "" {
			whereClause += " WHERE"
		} else {
			whereClause += " AND"
		}
		whereClause += " (it.name LIKE ? OR itl.Name LIKE ?)"
		args = append(args, "%"+itemFilter+"%", "%"+itemFilter+"%")
	}

	// Get Total Count
	var totalCount int
	countQueryFull := countQuery
	if charFilter != "" || itemFilter != "" {
		countQueryFull += " LEFT JOIN characters c ON bm.character_guid = c.guid LEFT JOIN acore_world.item_template it ON bm.item_entry = it.entry LEFT JOIN acore_world.item_template_locale itl ON it.entry = itl.ID AND itl.locale = 'koKR'" + whereClause
	}
	err = charDB.QueryRow(countQueryFull, args...).Scan(&totalCount)
	if err != nil {
		log.Printf("[BlackMarket] Count Query Error: %v", err)
		http.Error(w, "로그 개수 조회 오류: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Get Logs
	finalQuery := baseQuery + whereClause + " ORDER BY bm.id DESC LIMIT ? OFFSET ?"
	queryArgs := append(args, limit, offset)

	rows, err := charDB.Query(finalQuery, queryArgs...)
	if err != nil {
		log.Printf("[BlackMarket] Select Query Error: %v", err)
		http.Error(w, "로그 데이터 조회 오류: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var logs = make([]map[string]interface{}, 0)
	for rows.Next() {
		var id, price, itemEntry int
		var charName, itemName, purchaseDate string
		if err := rows.Scan(&id, &charName, &itemName, &price, &purchaseDate, &itemEntry); err != nil {
			log.Printf("[BlackMarket] Scan Error: %v", err)
			continue
		}
		logs = append(logs, map[string]interface{}{
			"id": id, "character": charName, "item": itemName, "price": price, "purchase_date": purchaseDate, "item_entry": itemEntry,
		})
	}

	totalPages := (totalCount + limit - 1) / limit

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"logs":       logs,
		"total":      totalCount,
		"totalPages": totalPages,
		"page":       page,
	})
}

// Karazhan Enchantment Logs Handler
func handleKarazhanLogs(w http.ResponseWriter, r *http.Request) {
	// Authorization Check using Menu Permission AND Submenu Permission
	if !CheckMenuPermission(w, r, "logs") {
		return
	}
	if !CheckMenuPermission(w, r, "log-karazhan", "submenu") {
		return
	}

	// Connect to characters DB
	charDSN := config.CharactersDSN()
	charDB, err := sql.Open("mysql", charDSN)
	if err != nil {
		http.Error(w, "Characters DB Connection Error", http.StatusInternalServerError)
		return
	}
	defer charDB.Close()

	// Parse Query Params
	queryValues := r.URL.Query()
	pageStr := queryValues.Get("page")
	limitStr := queryValues.Get("limit")
	charFilter := queryValues.Get("character")
	itemFilter := queryValues.Get("item")

	page := 1
	if pageStr != "" {
		fmt.Sscanf(pageStr, "%d", &page)
	}
	limit := 20
	if limitStr != "" {
		fmt.Sscanf(limitStr, "%d", &limit)
	}
	if page < 1 {
		page = 1
	}
	offset := (page - 1) * limit

	// Build Query
	baseQuery := `
		SELECT 
			kz.log_id,
			kz.player_name as character_name,
			kz.item_name,
			kz.enhance_level_after,
			kz.result,
			kz.timestamp as enhance_date
		FROM karazhan_enhance_log kz
	`
	countQuery := "SELECT COUNT(*) FROM karazhan_enhance_log kz"
	whereClause := ""
	var args []interface{}

	if charFilter != "" {
		whereClause += " WHERE kz.player_name LIKE ?"
		args = append(args, "%"+charFilter+"%")
	}
	if itemFilter != "" {
		if whereClause == "" {
			whereClause += " WHERE"
		} else {
			whereClause += " AND"
		}
		whereClause += " kz.item_name LIKE ?"
		args = append(args, "%"+itemFilter+"%")
	}

	// Get Total Count
	var totalCount int
	countQueryFull := countQuery + whereClause
	err = charDB.QueryRow(countQueryFull, args...).Scan(&totalCount)
	if err != nil {
		log.Printf("[Karazhan] Count Query Error: %v", err)
		http.Error(w, "로그 개수 조회 오류: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Get Logs
	finalQuery := baseQuery + whereClause + " ORDER BY kz.log_id DESC LIMIT ? OFFSET ?"
	queryArgs := append(args, limit, offset)

	rows, err := charDB.Query(finalQuery, queryArgs...)
	if err != nil {
		log.Printf("[Karazhan] Select Query Error: %v", err)
		http.Error(w, "로그 데이터 조회 오류: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var logs = make([]map[string]interface{}, 0)
	for rows.Next() {
		var id, level int
		var charName, itemName, enhanceDate, resultStr string
		if err := rows.Scan(&id, &charName, &itemName, &level, &resultStr, &enhanceDate); err != nil {
			log.Printf("[Karazhan] Scan Error: %v", err)
			continue
		}
		resultText := "Failed"
		if resultStr == "SUCCESS" {
			resultText = "Success"
		}
		logs = append(logs, map[string]interface{}{
			"id": id, "character": charName, "item": itemName, "level": level, "result": resultText, "enhance_date": enhanceDate,
		})
	}

	totalPages := (totalCount + limit - 1) / limit

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"logs":       logs,
		"total":      totalCount,
		"totalPages": totalPages,
		"page":       page,
	})
}

// Playtime Reward Logs Handler
func handlePlaytimeLogs(w http.ResponseWriter, r *http.Request) {
	// Authorization Check using Menu Permission AND Submenu Permission
	if !CheckMenuPermission(w, r, "logs") {
		return
	}
	if !CheckMenuPermission(w, r, "log-playtime", "submenu") {
		return
	}

	// Connect to characters DB
	charDSN := config.CharactersDSN()
	charDB, err := sql.Open("mysql", charDSN)
	if err != nil {
		http.Error(w, "Characters DB Connection Error", http.StatusInternalServerError)
		return
	}
	defer charDB.Close()

	// Parse Query Params
	queryValues := r.URL.Query()
	pageStr := queryValues.Get("page")
	limitStr := queryValues.Get("limit")
	charFilter := queryValues.Get("character")
	itemFilter := queryValues.Get("item")

	page := 1
	if pageStr != "" {
		fmt.Sscanf(pageStr, "%d", &page)
	}
	limit := 20
	if limitStr != "" {
		fmt.Sscanf(limitStr, "%d", &limit)
	}
	if page < 1 {
		page = 1
	}
	offset := (page - 1) * limit

	// Build Query
	baseQuery := `
		SELECT 
			pt.id,
			pt.character_name,
			pt.reward_items,
			pt.reward_level,
			pt.claimed_at
		FROM playtime_reward_log pt
	`
	countQuery := "SELECT COUNT(*) FROM playtime_reward_log pt"
	whereClause := ""
	var args []interface{}

	if charFilter != "" {
		whereClause += " WHERE pt.character_name LIKE ?"
		args = append(args, "%"+charFilter+"%")
	}
	if itemFilter != "" {
		if whereClause == "" {
			whereClause += " WHERE"
		} else {
			whereClause += " AND"
		}
		whereClause += " pt.reward_items LIKE ?"
		args = append(args, "%"+itemFilter+"%")
	}

	// Get Total Count
	var totalCount int
	countQueryFull := countQuery + whereClause
	err = charDB.QueryRow(countQueryFull, args...).Scan(&totalCount)
	if err != nil {
		log.Printf("[Playtime] Count Query Error: %v", err)
		http.Error(w, "로그 개수 조회 오류: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Get Logs
	finalQuery := baseQuery + whereClause + " ORDER BY pt.id DESC LIMIT ? OFFSET ?"
	queryArgs := append(args, limit, offset)

	rows, err := charDB.Query(finalQuery, queryArgs...)
	if err != nil {
		log.Printf("[Playtime] Select Query Error: %v", err)
		http.Error(w, "로그 데이터 조회 오류: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var logs = make([]map[string]interface{}, 0)
	for rows.Next() {
		var id, rewardLevel int
		var charName, rewardItems, claimedAt string
		if err := rows.Scan(&id, &charName, &rewardItems, &rewardLevel, &claimedAt); err != nil {
			log.Printf("[Playtime] Scan Error: %v", err)
			continue
		}
		// Parse reward_items JSON to get first item name
		itemDisplay := "Various Items"
		if rewardItems != "" && rewardItems != "null" {
			itemDisplay = rewardItems // You can parse JSON here if needed
		}
		logs = append(logs, map[string]interface{}{
			"id": id, "character": charName, "item": itemDisplay, "quantity": rewardLevel, "reward_date": claimedAt,
		})
	}

	totalPages := (totalCount + limit - 1) / limit

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"logs":       logs,
		"total":      totalCount,
		"totalPages": totalPages,
		"page":       page,
	})
}

// Mail Logs Handler
func handleMailLogs(w http.ResponseWriter, r *http.Request) {
	// Authorization Check using Menu Permission AND Submenu Permission
	if !CheckMenuPermission(w, r, "logs") {
		return
	}
	if !CheckMenuPermission(w, r, "log-mail", "submenu") {
		return
	}

	// Connect to characters DB
	charDSN := config.CharactersDSN()
	charDB, err := sql.Open("mysql", charDSN)
	if err != nil {
		http.Error(w, "Characters DB Connection Error", http.StatusInternalServerError)
		return
	}
	defer charDB.Close()

	// Parse Query Params
	queryValues := r.URL.Query()
	pageStr := queryValues.Get("page")
	limitStr := queryValues.Get("limit")
	senderFilter := queryValues.Get("sender")
	receiverFilter := queryValues.Get("receiver")

	page := 1
	if pageStr != "" {
		fmt.Sscanf(pageStr, "%d", &page)
	}
	limit := 20
	if limitStr != "" {
		fmt.Sscanf(limitStr, "%d", &limit)
	}
	if page < 1 {
		page = 1
	}
	offset := (page - 1) * limit

	// Build Query
	baseQuery := `
		SELECT 
			id,
			sender_username,
			receiver_name,
			subject,
			body,
			item_entry,
			item_count,
			gold,
			sent_at,
			ip_address
		FROM web_mail_log
	`
	countQuery := "SELECT COUNT(*) FROM web_mail_log"
	whereClause := ""
	var args []interface{}

	if senderFilter != "" {
		whereClause += " WHERE sender_username LIKE ?"
		args = append(args, "%"+senderFilter+"%")
	}
	if receiverFilter != "" {
		if whereClause == "" {
			whereClause += " WHERE"
		} else {
			whereClause += " AND"
		}
		whereClause += " receiver_name LIKE ?"
		args = append(args, "%"+receiverFilter+"%")
	}

	// Get Total Count
	var totalCount int
	err = charDB.QueryRow(countQuery+whereClause, args...).Scan(&totalCount)
	if err != nil {
		log.Printf("[MailLogs] Count Query Error: %v", err)
		http.Error(w, "로그 개수 조회 오류: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Get Logs
	finalQuery := baseQuery + whereClause + " ORDER BY id DESC LIMIT ? OFFSET ?"
	queryArgs := append(args, limit, offset)

	rows, err := charDB.Query(finalQuery, queryArgs...)
	if err != nil {
		log.Printf("[MailLogs] Select Query Error: %v", err)
		http.Error(w, "로그 데이터 조회 오류: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var logs = make([]map[string]interface{}, 0)
	for rows.Next() {
		var id, itemEntry, itemCount, gold int
		var sender, receiver, subject, body, sentAt, ip string
		if err := rows.Scan(&id, &sender, &receiver, &subject, &body, &itemEntry, &itemCount, &gold, &sentAt, &ip); err != nil {
			log.Printf("[MailLogs] Scan Error: %v", err)
			continue
		}

		itemDisplay := "No Item"
		if itemEntry > 0 {
			itemDisplay = fmt.Sprintf("Entry: %d (x%d)", itemEntry, itemCount)
		}

		logs = append(logs, map[string]interface{}{
			"id": id, "sender": sender, "receiver": receiver, "subject": subject, "body": body,
			"item": itemDisplay, "item_entry": itemEntry, "gold": gold, "sent_at": sentAt, "ip": ip,
		})
	}

	totalPages := (totalCount + limit - 1) / limit

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"logs":       logs,
		"total":      totalCount,
		"totalPages": totalPages,
		"page":       page,
	})
}
