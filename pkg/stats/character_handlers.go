package stats

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
)

// Character List Handler
func handleCharacterList(w http.ResponseWriter, r *http.Request) {
	// Authorization Check using Menu Permission
	if !CheckMenuPermission(w, r, "ban") {
		return
	}
	// Note: cookie lookup for username moved inside CheckMenuPermission but it returns success/fail.
	// If we need logic that depends on username later, we should extract it again or refactor CheckMenuPermission to return user.
	// In handleCharacterList, username is not used after authentication block.
	// Actually no, wait.
	// `rows, err := authDB.QueryRow` used username. That's gone.
	// But username is NOT used later.
	// So we are safe.

	// Connect to characters DB
	charDSN := "root:4618@tcp(localhost:3306)/acore_characters"
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
	nameFilter := queryValues.Get("name")
	accountFilter := queryValues.Get("account")
	levelFilter := queryValues.Get("level")

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
			c.guid,
			c.name,
			c.level,
			c.race,
			c.class,
			c.money,
			c.online,
			a.username as account_name
		FROM characters c
		JOIN acore_auth.account a ON c.account = a.id
	`
	countQuery := "SELECT COUNT(*) FROM characters c JOIN acore_auth.account a ON c.account = a.id"
	whereClause := ""
	var args []interface{}

	if nameFilter != "" {
		whereClause += " WHERE c.name LIKE ?"
		args = append(args, "%"+nameFilter+"%")
	}
	if accountFilter != "" {
		if whereClause == "" {
			whereClause += " WHERE"
		} else {
			whereClause += " AND"
		}
		whereClause += " a.username LIKE ?"
		args = append(args, "%"+accountFilter+"%")
	}
	if levelFilter != "" {
		if whereClause == "" {
			whereClause += " WHERE"
		} else {
			whereClause += " AND"
		}
		whereClause += " c.level >= ?"
		args = append(args, levelFilter)
	}

	// Get Total Count
	var totalCount int
	err = charDB.QueryRow(countQuery+whereClause, args...).Scan(&totalCount)
	if err != nil {
		log.Printf("[Characters] Count Query Error: %v", err)
		http.Error(w, "캐릭터 개수 조회 오류: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Get Characters
	finalQuery := baseQuery + whereClause + " ORDER BY c.level DESC, c.name ASC LIMIT ? OFFSET ?"
	queryArgs := append(args, limit, offset)

	rows, err := charDB.Query(finalQuery, queryArgs...)
	if err != nil {
		log.Printf("[Characters] Select Query Error: %v", err)
		http.Error(w, "캐릭터 데이터 조회 오류: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	// Race and Class mappings (Korean)
	raceMap := map[int]string{
		1: "인간", 2: "오크", 3: "드워프", 4: "나이트 엘프", 5: "언데드",
		6: "타우렌", 7: "노움", 8: "트롤", 10: "블러드 엘프", 11: "드레나이",
	}
	classMap := map[int]string{
		1: "전사", 2: "성기사", 3: "사냥꾼", 4: "도적", 5: "사제",
		6: "죽음의 기사", 7: "주술사", 8: "마법사", 9: "흑마법사", 11: "드루이드",
	}

	var characters = make([]map[string]interface{}, 0)
	for rows.Next() {
		var guid, level, race, class, money, online int
		var name, accountName string
		if err := rows.Scan(&guid, &name, &level, &race, &class, &money, &online, &accountName); err != nil {
			log.Printf("[Characters] Scan Error: %v", err)
			continue
		}

		raceName := raceMap[race]
		if raceName == "" {
			raceName = fmt.Sprintf("Race %d", race)
		}
		className := classMap[class]
		if className == "" {
			className = fmt.Sprintf("Class %d", class)
		}

		// Convert copper to gold
		gold := money / 10000

		characters = append(characters, map[string]interface{}{
			"guid":    guid,
			"name":    name,
			"level":   level,
			"race":    raceName,
			"class":   className,
			"gold":    gold,
			"online":  online,
			"account": accountName,
		})
	}

	totalPages := (totalCount + limit - 1) / limit

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"characters": characters,
		"total":      totalCount,
		"totalPages": totalPages,
		"page":       page,
	})
}

// Send Mail Handler
func handleSendMail(w http.ResponseWriter, r *http.Request) {
	// Authorization Check using Menu Permission
	if !CheckMenuPermission(w, r, "ban") {
		return
	}
	// Need username for logging at the end
	cookie, _ := r.Cookie("session_user")
	username := cookie.Value

	// Parse request body
	var req struct {
		Character string `json:"character"`
		Subject   string `json:"subject"`
		Body      string `json:"body"`
		ItemEntry int    `json:"item_entry"`
		ItemCount int    `json:"item_count"`
		Gold      int    `json:"gold"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"status": "error", "message": "잘못된 요청 형식입니다."})
		return
	}

	// Connect to characters DB
	charDSN := "root:4618@tcp(localhost:3306)/acore_characters"
	charDB, err := sql.Open("mysql", charDSN)
	if err != nil {
		http.Error(w, "Characters DB Connection Error", http.StatusInternalServerError)
		return
	}
	defer charDB.Close()

	// Get character GUID
	var charGUID int
	err = charDB.QueryRow("SELECT guid FROM characters WHERE name = ?", req.Character).Scan(&charGUID)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{"status": "error", "message": "캐릭터를 찾을 수 없습니다."})
		return
	}

	// Get next mail ID
	var nextMailID int
	err = charDB.QueryRow("SELECT IFNULL(MAX(id), 0) + 1 FROM mail").Scan(&nextMailID)
	if err != nil {
		log.Printf("[SendMail] Failed to get next mail ID: %v", err)
		http.Error(w, "메일 ID 조회 오류", http.StatusInternalServerError)
		return
	}

	// Insert mail
	mailQuery := `
		INSERT INTO mail (id, messageType, stationery, mailTemplateId, sender, receiver, subject, body, has_items, expire_time, deliver_time, money, cod, checked)
		VALUES (?, 0, 41, 0, 0, ?, ?, ?, ?, UNIX_TIMESTAMP() + 2592000, UNIX_TIMESTAMP(), ?, 0, 0)
	`
	hasItems := 0
	if req.ItemEntry > 0 && req.ItemCount > 0 {
		hasItems = 1
	}

	_, err = charDB.Exec(mailQuery, nextMailID, charGUID, req.Subject, req.Body, hasItems, req.Gold)
	if err != nil {
		log.Printf("[SendMail] Failed to insert mail: %v", err)
		http.Error(w, "메일 생성 오류: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Insert item if specified
	if req.ItemEntry > 0 && req.ItemCount > 0 {
		// Get next item GUID
		var nextItemGUID int
		err = charDB.QueryRow("SELECT IFNULL(MAX(guid), 0) + 1 FROM item_instance").Scan(&nextItemGUID)
		if err != nil {
			log.Printf("[SendMail] Failed to get next item GUID: %v", err)
		} else {
			// Insert item instance
			itemQuery := `
				INSERT INTO item_instance (guid, itemEntry, owner_guid, creatorGuid, count, enchantments)
				VALUES (?, ?, ?, 0, ?, '')
			`
			_, err = charDB.Exec(itemQuery, nextItemGUID, req.ItemEntry, charGUID, req.ItemCount)
			if err != nil {
				log.Printf("[SendMail] Failed to insert item: %v", err)
			} else {
				// Link item to mail
				mailItemQuery := `INSERT INTO mail_items (mail_id, item_guid, receiver) VALUES (?, ?, ?)`
				_, err = charDB.Exec(mailItemQuery, nextMailID, nextItemGUID, charGUID)
				if err != nil {
					log.Printf("[SendMail] Failed to link item to mail: %v", err)
				}
			}
		}
	}

	// Log to web_mail_log
	logQuery := `
		INSERT INTO web_mail_log (sender_username, receiver_name, subject, body, item_entry, item_count, gold, ip_address)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`
	ip := r.RemoteAddr
	// Handle X-Forwarded-For if behind proxy (optional but good practice)
	if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
		ip = forwarded
	}

	_, err = charDB.Exec(logQuery, username, req.Character, req.Subject, req.Body, req.ItemEntry, req.ItemCount, req.Gold, ip)
	if err != nil {
		log.Printf("[SendMail] Failed to insert log: %v", err)
		// We don't fail the request if logging fails, but we log the error
	}

	log.Printf("[SendMail] Mail sent to %s by admin %s", req.Character, username)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status":  "success",
		"message": "메일이 성공적으로 발송되었습니다.",
	})
}
