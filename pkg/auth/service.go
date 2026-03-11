package auth

import (
	"crypto/rand"
	"crypto/sha1"
	"database/sql"
	"encoding/json"
	"fmt"
	"karazhan/pkg/config"
	"log"
	"math/big"
	"net"
	"net/http"
	"os"
	"strings"
	"time"

	"karazhan/pkg/utils"

	_ "github.com/go-sql-driver/mysql"
)

// WoW SRP6 Constants
const (
	N_Hex = "894B645E89E1535BBDAD5B8B290650530801B18EBFBF5E8FAB3C82872A3E9BB7"
	g_Int = 7
)

func RegisterRoutes(mux *http.ServeMux) {
	// Root handler: redirect to /home/ if already logged in
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.FileServer(http.Dir("./pkg/auth/static")).ServeHTTP(w, r)
			return
		}

		cookie, err := r.Cookie("session_user")
		if err == nil && cookie.Value != "" {
			http.Redirect(w, r, "/home/", http.StatusFound)
			return
		}

		// Prevent Caching
		w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
		w.Header().Set("Pragma", "no-cache")
		w.Header().Set("Expires", "0")

		http.ServeFile(w, r, "./pkg/auth/static/index.html")
	})

	mux.HandleFunc("/api/login", loginHandler)
	mux.HandleFunc("/api/register", registerHandler)
	mux.HandleFunc("/api/logout", logoutHandler)
	mux.HandleFunc("/api/user/status", userStatusHandler)
	mux.HandleFunc("/api/admin/users/list", adminUserListHandler)
	mux.HandleFunc("/api/admin/users/update", adminUserUpdateHandler)
	mux.HandleFunc("/api/admin/users/characters", adminUserCharactersHandler)
	mux.HandleFunc("/api/admin/users/ban", adminUserBanHandler)
	mux.HandleFunc("/api/admin/users/unban", adminUserUnbanHandler)
	mux.HandleFunc("/api/admin/users/password", adminUserPasswordHandler) // New endpoint
	mux.HandleFunc("/api/admin/bans/list", adminBanListHandler)
	mux.HandleFunc("/api/admin/bans/add", adminBanAddHandler)
	mux.HandleFunc("/api/admin/bans/remove", adminBanRemoveHandler)
	mux.HandleFunc("/api/server/events", handleGetServerEventsPublic)
	mux.HandleFunc("/api/server/game_events", handleGetGameEvents)
	mux.HandleFunc("/api/user/characters", userCharactersHandler)
	mux.HandleFunc("/api/server/online", serverOnlineHandler)
	mux.HandleFunc("/api/user/main_character", handleSetMainCharacter)
	mux.HandleFunc("/api/user/points/history", handlePointHistory)
	mux.HandleFunc("/api/admin/users/points/history", adminPointHistoryHandler)
	mux.HandleFunc("/api/admin/users/points/update", adminUpdatePointsHandler)
	mux.HandleFunc("/api/admin/users/carddraw/update", adminUpdateCardDrawCountHandler)
}

func isSecureRequest(r *http.Request) bool {
	appEnv := strings.TrimSpace(os.Getenv("APP_ENV"))
	if strings.EqualFold(appEnv, "development") || strings.EqualFold(appEnv, "dev") {
		return false
	}
	if r != nil {
		host := strings.TrimSpace(r.Host)
		if strings.Contains(host, ":") {
			if _, port, err := net.SplitHostPort(host); err == nil && port == "8080" {
				return false
			}
		}
	}
	if r != nil && r.TLS != nil {
		return true
	}
	return strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https")
}

func setSessionCookie(w http.ResponseWriter, r *http.Request, username string) {
	http.SetCookie(w, &http.Cookie{
		Name:     "session_user",
		Value:    username,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   isSecureRequest(r),
	})
}

func clearSessionCookie(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     "session_user",
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   isSecureRequest(r),
	})
}

func logoutHandler(w http.ResponseWriter, r *http.Request) {
	clearSessionCookie(w, r)
	w.WriteHeader(http.StatusOK)
}

func loginHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// 폼 데이터 파싱
	r.ParseForm()
	username := r.FormValue("username")
	password := r.FormValue("password")

	if username == "" || password == "" {
		http.Error(w, "아이디와 비밀번호를 입력해주세요.", http.StatusBadRequest)
		return
	}

	// DB 연결
	dsn := config.AuthDSN()
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		log.Printf("Auth DB Conn Error: %v", err)
		http.Error(w, "서버 오류 (DB)", http.StatusInternalServerError)
		return
	}
	defer db.Close()

	// 계정 정보 조회
	var id int
	var salt, verifier []byte
	err = db.QueryRow(`
		SELECT id, salt, verifier 
		FROM account 
		WHERE username = ?`, username).Scan(&id, &salt, &verifier)

	if err != nil {
		if err == sql.ErrNoRows {
			http.Error(w, "계정이 존재하지 않거나 권한이 없습니다.", http.StatusUnauthorized)
		} else {
			log.Printf("Auth Query Error: %v", err)
			http.Error(w, "서버 오류 (Query)", http.StatusInternalServerError)
		}
		return
	}

	// 밴 체크
	ip := getIP(r)
	isBanned, reason, unban := checkBan(db, id, ip)
	if isBanned {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusForbidden)
		response := map[string]string{
			"status":  "banned",
			"message": fmt.Sprintf("밴 된 상태입니다.\n\n사유 : %s\n해제일 : %s", reason, unban),
			"reason":  reason,
			"unban":   unban,
		}
		json.NewEncoder(w).Encode(response)
		return
	}

	// SRP6 검증
	if verifySRP6(username, password, salt, verifier) {
		// Set Session Cookie
		setSessionCookie(w, r, username)

		// Log Login
		utils.LogAction(r, username, "Login")

		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"success"}`))
	} else {
		http.Error(w, "비밀번호가 일치하지 않습니다.", http.StatusUnauthorized)
	}
}

func registerHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	r.ParseForm()
	username := strings.ToUpper(r.FormValue("username"))
	email := strings.ToUpper(r.FormValue("email"))
	password := r.FormValue("password")

	if username == "" || email == "" || password == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		w.Write([]byte(`{"status":"error", "message":"모든 항목을 입력해주세요."}`))
		return
	}

	// DB 연결
	dsn := config.AuthDSN()
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		log.Printf("Auth DB Conn Error: %v", err)
		http.Error(w, "서버 오류 (DB)", http.StatusInternalServerError)
		return
	}
	defer db.Close()

	// 중복 체크
	var count int
	err = db.QueryRow("SELECT COUNT(*) FROM account WHERE username = ? OR email = ?", username, email).Scan(&count)
	if err != nil {
		log.Printf("Auth Duplicate Check Error: %v", err)
		http.Error(w, "서버 오류 (Query)", http.StatusInternalServerError)
		return
	}
	if count > 0 {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		w.Write([]byte(`{"status":"error", "message":"이미 존재하는 아이디 또는 이메일입니다."}`))
		return
	}

	// SRP6 생성
	salt, verifier := calculateSRP6(username, password)

	// 계정 생성
	_, err = db.Exec("INSERT INTO account (username, salt, verifier, email) VALUES (?, ?, ?, ?)", username, salt, verifier, email)
	if err != nil {
		log.Printf("Auth Insert Error: %v", err)
		http.Error(w, "서버 오류 (Insert)", http.StatusInternalServerError)
		return
	}

	// Log Action
	utils.LogAction(r, username, "Register New Account")

	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"status":"success"}`))
}

func userStatusHandler(w http.ResponseWriter, r *http.Request) {
	// Prevent Caching
	w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Expires", "0")

	cookie, err := r.Cookie("session_user")
	if err != nil || cookie.Value == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	username := cookie.Value

	// DB 연결
	dsn := config.AuthDSN()
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		log.Printf("Auth DB Conn Error: %v", err)
		http.Error(w, "서버 오류 (DB)", http.StatusInternalServerError)
		return
	}
	defer db.Close()

	// 1. Get Account ID & GM Level & Email
	var id int
	var gmLevel int
	var email string
	err = db.QueryRow(`
		SELECT a.id, IFNULL(aa.gmlevel, 0), IFNULL(a.email, '')
		FROM account a
		LEFT JOIN account_access aa ON a.id = aa.id
		WHERE UPPER(a.username) = UPPER(?)
	`, username).Scan(&id, &gmLevel, &email)

	if err != nil {
		if err == sql.ErrNoRows {
			http.Error(w, "User not found", http.StatusUnauthorized)
			return
		}
		log.Printf("GM Level Check Error: %v", err)
		gmLevel = 0
	}

	// 1-1. Get Web Rank (from update DB)
	webRank := 0
	updateDSN := config.UpdateDSN()
	updateDB, err := sql.Open("mysql", updateDSN)
	if err == nil {
		defer updateDB.Close()
		updateDB.QueryRow("SELECT web_rank FROM user_profiles WHERE user_id = ?", id).Scan(&webRank)
	} else {
		log.Printf("Update DB Conn Error (WebRank): %v", err)
	}

	isAdmin := webRank >= 2 // Web Rank 2 is Admin
	isSecondAccountUser := false
	enhancedStoneSubscribed := false
	enhancedStoneActive := false
	enhancedStoneStartedAt := ""
	enhancedStoneExpiresAt := ""
	enhancedStoneRemainingDays := 0
	enhancedStoneProgressPercent := 0
	if updateDB != nil {
		var secondCount int
		if err := updateDB.QueryRow("SELECT COUNT(*) FROM web_second_account_purchases WHERE user_id = ? AND is_active = 1", id).Scan(&secondCount); err == nil && secondCount > 0 {
			isSecondAccountUser = true
		}
		var started sql.NullTime
		var exp sql.NullTime
		if err := updateDB.QueryRow(
			`SELECT started_at, expires_at
			 FROM web_feature_subscriptions
			 WHERE user_id = ?
			   AND feature_code IN ('enhanced_enchant_stone', 'shining_hero_stone', 'bright_hero_stone', 'hero_stone', 'enhanced_stone')
			 ORDER BY expires_at DESC
			 LIMIT 1`,
			id,
		).Scan(&started, &exp); err == nil && exp.Valid {
			enhancedStoneSubscribed = true
			now := time.Now()
			expTime := exp.Time
			enhancedStoneActive = expTime.After(now)
			enhancedStoneExpiresAt = expTime.Format("2006-01-02 15:04:05")
			if started.Valid {
				enhancedStoneStartedAt = started.Time.Format("2006-01-02 15:04:05")
			} else {
				estimatedStart := expTime.AddDate(0, -1, 0)
				enhancedStoneStartedAt = estimatedStart.Format("2006-01-02 15:04:05")
			}
			if expTime.After(now) {
				enhancedStoneRemainingDays = int(expTime.Sub(now).Hours()/24) + 1
				if enhancedStoneRemainingDays < 0 {
					enhancedStoneRemainingDays = 0
				}
			}
			startAt := now
			if started.Valid {
				startAt = started.Time
			} else {
				startAt = expTime.AddDate(0, -1, 0)
			}
			totalSeconds := expTime.Sub(startAt).Seconds()
			remainSeconds := expTime.Sub(now).Seconds()
			if totalSeconds > 0 && remainSeconds > 0 {
				pct := int((remainSeconds / totalSeconds) * 100.0)
				if pct < 1 {
					pct = 1
				}
				if pct > 100 {
					pct = 100
				}
				enhancedStoneProgressPercent = pct
			}
		}
	}

	// 2. Ban Check
	ip := getIP(r)
	isBanned, reason, unban := checkBan(db, id, ip)
	if isBanned {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"username": username,
			"isAdmin":  false,
			"isBanned": true,
			"reason":   reason,
			"unban":    unban,
		})
		return
	}

	// 3. Get Main Character (from update DB)
	mainCharName := ""
	mainCharGUID := 0
	var charRace, charClass, charGender, charLevel int

	if updateDB != nil {
		updateDB.QueryRow("SELECT main_char_name, main_char_guid FROM user_profiles WHERE user_id = ?", id).Scan(&mainCharName, &mainCharGUID)
	}

	// 3-1. Get Character Details (from characters DB)
	if mainCharGUID > 0 {
		charsDSN := config.CharactersDSN()
		charsDB, err := sql.Open("mysql", charsDSN)
		if err == nil {
			defer charsDB.Close()
			err = charsDB.QueryRow("SELECT race, class, gender, level FROM characters WHERE guid = ?", mainCharGUID).Scan(&charRace, &charClass, &charGender, &charLevel)
			if err != nil {
				log.Printf("Char Details Error: %v", err)
			}
		} else {
			log.Printf("Chars DB Conn Error: %v", err)
		}
	}

	// 4. Get Effective Permissions Details
	permissions := GetEffectivePermissions(webRank)

	log.Printf("[DEBUG] userStatusHandler: User=%s (ID=%d), GMLevel=%d, WebRank=%d", username, id, gmLevel, webRank)
	log.Printf("[DEBUG] userStatusHandler: Found %d effective permissions", len(permissions))

	w.Header().Set("Content-Type", "application/json")
	response := map[string]interface{}{
		"username":                     username,
		"email":                        email,
		"points":                       GetPoints(id),
		"isAdmin":                      isAdmin,
		"isBanned":                     false,
		"gmLevel":                      gmLevel,
		"webRank":                      webRank,
		"isSecondAccountUser":          isSecondAccountUser,
		"enhancedStoneSubscribed":      enhancedStoneSubscribed,
		"enhancedStoneActive":          enhancedStoneActive,
		"enhancedStoneStartedAt":       enhancedStoneStartedAt,
		"enhancedStoneExpiresAt":       enhancedStoneExpiresAt,
		"enhancedStoneRemainingDays":   enhancedStoneRemainingDays,
		"enhancedStoneProgressPercent": enhancedStoneProgressPercent,
		"permissions":                  permissions, // Send full map instead of just allowedMenus
		"mainCharacter": map[string]interface{}{
			"name":   mainCharName,
			"guid":   mainCharGUID,
			"race":   charRace,
			"class":  charClass,
			"gender": charGender,
			"level":  charLevel,
		},
	}
	json.NewEncoder(w).Encode(response)
}

func userCharactersHandler(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie("session_user")
	if err != nil || cookie.Value == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	username := cookie.Value

	// 1. Get Account ID
	authDSN := config.AuthDSN()
	authDB, err := sql.Open("mysql", authDSN)
	if err != nil {
		log.Printf("[ERROR] Auth DB Connect: %v", err)
		http.Error(w, "Auth DB Error", http.StatusInternalServerError)
		return
	}
	defer authDB.Close()

	var accountID int
	err = authDB.QueryRow("SELECT id FROM account WHERE username = ?", username).Scan(&accountID)
	if err != nil {
		log.Printf("[ERROR] Account not found for user %s: %v", username, err)
		http.Error(w, "Account not found", http.StatusUnauthorized)
		return
	}

	// 2. Fetch Characters
	charDSN := config.CharactersDSN()
	charDB, err := sql.Open("mysql", charDSN)
	if err != nil {
		log.Printf("[ERROR] Char DB Connect: %v", err)
		http.Error(w, "Char DB Error", http.StatusInternalServerError)
		return
	}
	defer charDB.Close()

	// Removed 'zone' to ensure compatibility and prevent errors
	rows, err := charDB.Query("SELECT guid, name, race, class, level, gender, map FROM characters WHERE account = ?", accountID)
	if err != nil {
		log.Printf("[ERROR] Character Query Failed: %v", err)
		http.Error(w, "Char Query Error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var chars = make([]map[string]interface{}, 0)

	for rows.Next() {
		var guid int
		var name string
		var race, class, level, gender, mapId int

		err := rows.Scan(&guid, &name, &race, &class, &level, &gender, &mapId)
		if err != nil {
			log.Printf("[ERROR] Character Scan Failed: %v", err)
			continue
		}

		chars = append(chars, map[string]interface{}{
			"guid":   guid,
			"name":   name,
			"race":   race,
			"class":  class,
			"level":  level,
			"gender": gender,
			"map":    mapId,
		})
	}

	log.Printf("[DEBUG] userCharactersHandler: found %d characters for account %d (User: %s)", len(chars), accountID, username)

	if chars == nil {
		chars = []map[string]interface{}{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(chars)
}

func handleSetMainCharacter(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	cookie, err := r.Cookie("session_user")
	if err != nil || cookie.Value == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	username := cookie.Value

	var req struct {
		Guid int    `json:"guid"`
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	// 1. Get Account ID
	authDSN := config.AuthDSN()
	authDB, err := sql.Open("mysql", authDSN)
	if err != nil {
		http.Error(w, "Auth DB Error", http.StatusInternalServerError)
		return
	}
	defer authDB.Close()

	var accountID int
	err = authDB.QueryRow("SELECT id FROM account WHERE username = ?", username).Scan(&accountID)
	if err != nil {
		http.Error(w, "Account not found", http.StatusUnauthorized)
		return
	}

	// 2. Verify Ownership (Optional but recommended)
	// We trust the GUID if it comes from our list, but strictly should verify.
	// For now, assuming client sends valid GUID from the list we gave them.

	// 3. Update User Profile
	updateDSN := config.UpdateDSN()
	updateDB, err := sql.Open("mysql", updateDSN)
	if err != nil {
		http.Error(w, "Update DB Error", http.StatusInternalServerError)
		return
	}
	defer updateDB.Close()

	_, err = updateDB.Exec(`
		INSERT INTO user_profiles (user_id, main_char_guid, main_char_name)
		VALUES (?, ?, ?)
		ON DUPLICATE KEY UPDATE main_char_guid = ?, main_char_name = ?
	`, accountID, req.Guid, req.Name, req.Guid, req.Name)

	if err != nil {
		log.Printf("Set Main Char Error: %v", err)
		http.Error(w, fmt.Sprintf("Failed to set main character: %v", err), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func adminUserListHandler(w http.ResponseWriter, r *http.Request) {
	// Authorization Check using Menu Permission
	if !checkSubMenuPermission(w, r, "account-list") {
		return
	}
	// We might need requester username for logging, so we get it from cookie.
	// cookie, _ := r.Cookie("session_user")
	// requester := cookie.Value
	// Not used anymore.
	// Actually list handler didn't use requester for anything else than admin check.
	// But let's check if 'requester' variable is used later.
	// In adminUserListHandler: `err = db.QueryRow(..., requester).Scan(&isRequesterAdmin)`
	// After that, `requester` is NOT used.
	// So we can remove the variable definition if not used.
	// Wait, CheckMenuPermission handles response.
	// So we just return.

	// DB 연결
	dsn := config.AuthDSN()
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		http.Error(w, "Auth DB Connection Error", http.StatusInternalServerError)
		return
	}
	defer db.Close()

	// Filters and Pagination
	queryValues := r.URL.Query()
	pageStr := queryValues.Get("page")
	limitStr := queryValues.Get("limit")
	userFilter := queryValues.Get("username")
	emailFilter := queryValues.Get("email")
	ipFilter := queryValues.Get("ip")
	rankFilter := queryValues.Get("gmlevel")
	webRankFilter := queryValues.Get("webrank")

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
	baseWhere := " WHERE 1=1"
	var args []interface{}
	if userFilter != "" {
		baseWhere += " AND a.username LIKE ?"
		args = append(args, "%"+userFilter+"%")
	}
	if emailFilter != "" {
		baseWhere += " AND a.email LIKE ?"
		args = append(args, "%"+emailFilter+"%")
	}
	if ipFilter != "" {
		baseWhere += " AND a.last_ip LIKE ?"
		args = append(args, "%"+ipFilter+"%")
	}
	if rankFilter != "" {
		if rankFilter == "0" {
			baseWhere += " AND (aa.gmlevel IS NULL OR aa.gmlevel = 0)"
		} else {
			baseWhere += " AND aa.gmlevel = ?"
			args = append(args, rankFilter)
		}
	}

	if webRankFilter != "" {
		baseWhere += " AND IFNULL(up.web_rank, 0) = ?"
		args = append(args, webRankFilter)
	}

	// Get total count
	var totalCount int
	countQuery := `
		SELECT COUNT(DISTINCT a.id)
		FROM account a
		LEFT JOIN account_access aa ON a.id = aa.id
		LEFT JOIN update.user_profiles up ON a.id = up.user_id
	` + baseWhere
	err = db.QueryRow(countQuery, args...).Scan(&totalCount)
	if err != nil {
		log.Printf("Admin User Count Error: %v (Query: %s)", err, countQuery)
		http.Error(w, "Count Error", http.StatusInternalServerError)
		return
	}

	// Get user list
	mainQuery := `
		SELECT a.id, a.username, a.email, MAX(IFNULL(aa.gmlevel, 0)) as gmlevel,
		MAX(CASE WHEN ab.active = 1 AND ab.unbandate > UNIX_TIMESTAMP() THEN 1 ELSE 0 END) as is_banned,
		IFNULL(a.last_ip, '') as last_ip, IFNULL(a.online, 0) as online
		FROM account a
		LEFT JOIN account_access aa ON a.id = aa.id
		LEFT JOIN account_banned ab ON a.id = ab.id
		LEFT JOIN update.user_profiles up ON a.id = up.user_id
	` + baseWhere + `
		GROUP BY a.id, a.username, a.email, a.last_ip, a.online
		ORDER BY a.id DESC
		LIMIT ? OFFSET ?
	`
	argsList := append(args, limit, offset)

	log.Printf("Executing User List Query: %s | Args: %v", mainQuery, argsList)

	rows, err := db.Query(mainQuery, argsList...)
	if err != nil {
		log.Printf("Admin User List Query Error: %v", err)
		http.Error(w, "Query Error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var users = make([]map[string]interface{}, 0)
	var userIDs []interface{}

	for rows.Next() {
		var id int
		var username, email string
		var gmlevel int
		var isBanned int
		var lastIp string
		var online int
		rows.Scan(&id, &username, &email, &gmlevel, &isBanned, &lastIp, &online)
		users = append(users, map[string]interface{}{
			"id": id, "username": username, "email": email, "gmlevel": gmlevel,
			"webRank": 0, "points": 0, "carddrawCount": 0, "charCount": 0, "is_banned": isBanned,
			"last_ip": lastIp, "online": online,
		})
		userIDs = append(userIDs, id)
	}

	if len(userIDs) > 0 {
		// 1. Fetch Points & Web Rank (Update DB)
		updateDSN := config.UpdateDSN()
		uDB, err := sql.Open("mysql", updateDSN)
		if err == nil {
			defer uDB.Close()
			placeholders := strings.Repeat("?,", len(userIDs))
			placeholders = placeholders[:len(placeholders)-1]

			// Fetch Points
			query := fmt.Sprintf("SELECT user_id, points FROM user_points WHERE user_id IN (%s)", placeholders)
			pRows, err := uDB.Query(query, userIDs...)
			if err == nil {
				defer pRows.Close()
				pointsMap := make(map[int]int)
				for pRows.Next() {
					var uid, p int
					pRows.Scan(&uid, &p)
					pointsMap[uid] = p
				}
				for i, u := range users {
					uid := u["id"].(int)
					if p, ok := pointsMap[uid]; ok {
						users[i]["points"] = p
					}
				}
			}

			// Fetch Web Rank + Card Draw Count
			wrQuery := fmt.Sprintf("SELECT user_id, web_rank, IFNULL(carddraw_draw_count, 0) FROM user_profiles WHERE user_id IN (%s)", placeholders)
			wrRows, err := uDB.Query(wrQuery, userIDs...)
			if err == nil {
				defer wrRows.Close()
				wrMap := make(map[int]int)
				carddrawMap := make(map[int]int)
				for wrRows.Next() {
					var uid, wr, carddrawCount int
					wrRows.Scan(&uid, &wr, &carddrawCount)
					wrMap[uid] = wr
					carddrawMap[uid] = carddrawCount
				}
				for i, u := range users {
					uid := u["id"].(int)
					if wr, ok := wrMap[uid]; ok {
						users[i]["webRank"] = wr
					}
					if cd, ok := carddrawMap[uid]; ok {
						users[i]["carddrawCount"] = cd
					}
				}
			}
		}

		// 2. Fetch Character Counts (Characters DB)
		charDSN := config.CharactersDSN()
		cDB, err := sql.Open("mysql", charDSN)
		if err == nil {
			defer cDB.Close()
			placeholders := strings.Repeat("?,", len(userIDs))
			placeholders = placeholders[:len(placeholders)-1]
			query := fmt.Sprintf("SELECT account, COUNT(*) FROM characters WHERE account IN (%s) GROUP BY account", placeholders)

			cRows, err := cDB.Query(query, userIDs...)
			if err == nil {
				defer cRows.Close()
				charCountMap := make(map[int]int)
				for cRows.Next() {
					var accId, count int
					cRows.Scan(&accId, &count)
					charCountMap[accId] = count
				}
				for i, u := range users {
					uid := u["id"].(int)
					if c, ok := charCountMap[uid]; ok {
						users[i]["charCount"] = c
					}
				}
			} else {
				log.Printf("Char Count Batch Query Error: %v", err)
			}
		} else {
			log.Printf("Char DB Connect Error: %v", err)
		}
	}

	log.Printf("Fetched %d users for Account Management", len(users))

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"users":      users,
		"page":       page,
		"total":      totalCount,
		"totalPages": (totalCount + limit - 1) / limit,
	})
}

func adminUserUpdateHandler(w http.ResponseWriter, r *http.Request) {
	// Authorization Check using Menu Permission
	if !checkSubMenuPermission(w, r, "account-permissions") {
		return
	}
	// Get requester for logging
	cookie, _ := r.Cookie("session_user")
	requester := cookie.Value

	r.ParseForm()
	targetID := r.FormValue("id")
	newRank := r.FormValue("rank")       // In-game Rank (GM Level)
	newWebRank := r.FormValue("webRank") // Web Rank (0, 1, 2)

	if targetID == "" {
		http.Error(w, "Bad Request: Missing ID", http.StatusBadRequest)
		return
	}

	// DB 연결
	dsn := config.AuthDSN()
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		http.Error(w, "Auth DB Connection Error", http.StatusInternalServerError)
		return
	}
	defer db.Close()

	// Resolve targetID if it's a username
	var finalID int
	err = db.QueryRow("SELECT id FROM account WHERE id = ? OR UPPER(username) = UPPER(?)", targetID, targetID).Scan(&finalID)
	if err != nil {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}

	// 1. Update In-game Rank (if provided)
	if newRank != "" {
		if newRank == "0" {
			_, err = db.Exec("DELETE FROM account_access WHERE id = ?", finalID)
		} else {
			_, err = db.Exec("INSERT INTO account_access (id, gmlevel, RealmID) VALUES (?, ?, -1) ON DUPLICATE KEY UPDATE gmlevel = ?", finalID, newRank, newRank)
		}
		if err != nil {
			log.Printf("In-game Rank Update Error: %v (ID=%d, Rank=%s)", err, finalID, newRank)
		} else {
			utils.LogAction(r, requester, fmt.Sprintf("Update User %d In-game Rank to %s", finalID, newRank))
		}
	}

	// 2. Update Web Rank (if provided)
	if newWebRank != "" {
		updateDSN := config.UpdateDSN()
		uDB, err := sql.Open("mysql", updateDSN)
		if err == nil {
			defer uDB.Close()
			_, err = uDB.Exec(`
				INSERT INTO user_profiles (user_id, web_rank) 
				VALUES (?, ?) 
				ON DUPLICATE KEY UPDATE web_rank = ?`,
				finalID, newWebRank, newWebRank)
			if err != nil {
				log.Printf("Web Rank Update Error: %v (ID=%d, Rank=%s)", err, finalID, newWebRank)
			} else {
				utils.LogAction(r, requester, fmt.Sprintf("Update User %d Web Rank to %s", finalID, newWebRank))
			}
		}
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"status":"success"}`))
}

func adminBanListHandler(w http.ResponseWriter, r *http.Request) {
	if !checkSubMenuPermission(w, r, "ban-accountban") {
		return
	}

	dsn := config.AuthDSN()
	db, _ := sql.Open("mysql", dsn)
	defer db.Close()

	// Pagination
	queryValues := r.URL.Query()
	accPageStr := queryValues.Get("accPage")
	ipPageStr := queryValues.Get("ipPage")
	limit := 10 // Smaller limit since they are side-by-side

	accPage := 1
	if accPageStr != "" {
		fmt.Sscanf(accPageStr, "%d", &accPage)
	}
	ipPage := 1
	if ipPageStr != "" {
		fmt.Sscanf(ipPageStr, "%d", &ipPage)
	}

	accOffset := (accPage - 1) * limit
	ipOffset := (ipPage - 1) * limit

	// Account Bans
	var totalAccBans int
	db.QueryRow("SELECT COUNT(*) FROM account_banned").Scan(&totalAccBans)

	accRows, _ := db.Query(`
		SELECT ab.id, a.username, FROM_UNIXTIME(ab.bandate), FROM_UNIXTIME(ab.unbandate), ab.bannedby, ab.banreason, ab.active
		FROM account_banned ab
		JOIN account a ON a.id = ab.id
		ORDER BY ab.bandate DESC
		LIMIT ? OFFSET ?
	`, limit, accOffset)
	defer accRows.Close()

	var accountBans = make([]map[string]interface{}, 0)
	for accRows.Next() {
		var id, active int
		var user, bdate, udate, bby, reason string
		accRows.Scan(&id, &user, &bdate, &udate, &bby, &reason, &active)
		accountBans = append(accountBans, map[string]interface{}{
			"id": id, "username": user, "bandate": bdate, "unbandate": udate, "bannedby": bby, "reason": reason, "active": active,
		})
	}

	// IP Bans
	var totalIpBans int
	db.QueryRow("SELECT COUNT(*) FROM ip_banned").Scan(&totalIpBans)

	ipRows, _ := db.Query(`
		SELECT ip, FROM_UNIXTIME(bandate), FROM_UNIXTIME(unbandate), bannedby, banreason
		FROM ip_banned
		ORDER BY bandate DESC
		LIMIT ? OFFSET ?
	`, limit, ipOffset)
	defer ipRows.Close()

	var ipBans = make([]map[string]interface{}, 0)
	for ipRows.Next() {
		var ip, bdate, udate, bby, reason string
		ipRows.Scan(&ip, &bdate, &udate, &bby, &reason)
		ipBans = append(ipBans, map[string]interface{}{
			"ip": ip, "bandate": bdate, "unbandate": udate, "bannedby": bby, "reason": reason,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"accountBans":   accountBans,
		"ipBans":        ipBans,
		"accTotalPages": (totalAccBans + limit - 1) / limit,
		"ipTotalPages":  (totalIpBans + limit - 1) / limit,
		"accPage":       accPage,
		"ipPage":        ipPage,
	})
}

func adminBanAddHandler(w http.ResponseWriter, r *http.Request) {
	if !checkSubMenuPermission(w, r, "ban-accountban") {
		return
	}
	cookie, _ := r.Cookie("session_user")
	username := cookie.Value

	r.ParseForm()
	banType := r.FormValue("type")      // "account" or "ip"
	target := r.FormValue("target")     // ID or IP
	duration := r.FormValue("duration") // seconds
	reason := r.FormValue("reason")

	dsn := config.AuthDSN()
	db, _ := sql.Open("mysql", dsn)
	defer db.Close()

	var finalID interface{}
	finalID = target
	if banType == "account" {
		// Check if target is a username or ID
		var accID int
		err := db.QueryRow("SELECT id FROM account WHERE id = ? OR UPPER(username) = UPPER(?)", target, target).Scan(&accID)
		if err != nil {
			if err == sql.ErrNoRows {
				http.Error(w, "존재하지 않는 계정 또는 ID입니다.", http.StatusNotFound)
			} else {
				http.Error(w, "계정 확인 중 오류 발생", http.StatusInternalServerError)
			}
			return
		}
		finalID = accID

		_, err = db.Exec(`
			INSERT INTO account_banned (id, bandate, unbandate, bannedby, banreason, active)
			VALUES (?, UNIX_TIMESTAMP(), UNIX_TIMESTAMP() + ?, ?, ?, 1)
		`, finalID, duration, username, reason)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	} else {
		_, err := db.Exec(`
			INSERT INTO ip_banned (ip, bandate, unbandate, bannedby, banreason)
			VALUES (?, UNIX_TIMESTAMP(), UNIX_TIMESTAMP() + ?, ?, ?)
		`, target, duration, username, reason)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}

	utils.LogAction(r, username, fmt.Sprintf("Add %s Ban: %s (Reason: %s)", banType, target, reason))
	w.Write([]byte(`{"status":"success"}`))
}

func adminBanRemoveHandler(w http.ResponseWriter, r *http.Request) {
	if !checkSubMenuPermission(w, r, "ban-accountban") {
		return
	}
	cookie, _ := r.Cookie("session_user")
	username := cookie.Value

	r.ParseForm()
	banType := r.FormValue("type")
	target := r.FormValue("target")

	dsn := config.AuthDSN()
	db, _ := sql.Open("mysql", dsn)
	defer db.Close()

	if banType == "account" {
		_, err := db.Exec("UPDATE account_banned SET active = 0 WHERE id = ? AND active = 1", target)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	} else {
		_, err := db.Exec("DELETE FROM ip_banned WHERE ip = ?", target)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}

	utils.LogAction(r, username, fmt.Sprintf("Remove %s Ban: %s", banType, target))
	w.Write([]byte(`{"status":"success"}`))
}

// 밴 여부 확인 헬퍼
func checkBan(db *sql.DB, userID int, ip string) (bool, string, string) {
	// 1. IP 밴 확인
	var ipReason, ipUnban string
	err := db.QueryRow(`
		SELECT banreason, FROM_UNIXTIME(unbandate) 
		FROM ip_banned 
		WHERE ip = ? AND unbandate > UNIX_TIMESTAMP()
		ORDER BY unbandate DESC LIMIT 1`, ip).Scan(&ipReason, &ipUnban)
	if err == nil {
		return true, ipReason, ipUnban
	}

	// 2. 계정 밴 확인
	var accReason, accUnban string
	err = db.QueryRow(`
		SELECT banreason, FROM_UNIXTIME(unbandate) 
		FROM account_banned 
		WHERE id = ? AND active = 1 AND unbandate > UNIX_TIMESTAMP()
		ORDER BY unbandate DESC LIMIT 1`, userID).Scan(&accReason, &accUnban)
	if err == nil {
		return true, accReason, accUnban
	}

	return false, "", ""
}

func getIP(r *http.Request) string {
	ip := r.RemoteAddr
	if strings.Contains(ip, ":") {
		parts := strings.Split(ip, ":")
		if len(parts) > 1 {
			if strings.HasPrefix(ip, "[") && strings.Contains(ip, "]") {
				ip = ip[1:strings.Index(ip, "]")]
			} else {
				ip = parts[0]
			}
		}
	}
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		ip = strings.Split(xff, ",")[0]
	}
	return ip
}

func calculateSRP6(username, password string) ([]byte, []byte) {
	// Salt generation (32 random bytes)
	salt := make([]byte, 32)
	rand.Read(salt)

	// I = SHA1(UPPER(user) + ":" + UPPER(pass))
	userPass := strings.ToUpper(username) + ":" + strings.ToUpper(password)
	h1 := sha1.Sum([]byte(userPass))

	// x = SHA1(salt | h1)
	h2Ctx := sha1.New()
	h2Ctx.Write(salt)
	h2Ctx.Write(h1[:])
	h2 := h2Ctx.Sum(nil)

	// x to BigInt (Little Endian)
	x := new(big.Int).SetBytes(reverse(h2))

	// v = g^x % N
	N := new(big.Int)
	N.SetString(N_Hex, 16)
	g := big.NewInt(g_Int)
	v := new(big.Int).Exp(g, x, N)

	// Verifier in Little Endian, padded to 32 bytes
	verifier := reverse(v.Bytes())
	if len(verifier) < 32 {
		padding := make([]byte, 32-len(verifier))
		verifier = append(verifier, padding...)
	}

	return salt, verifier
}

func verifySRP6(username, password string, salt, storedVerifier []byte) bool {
	// 1. I = SHA1(UPPER(username) + ":" + UPPER(password))
	userPass := strings.ToUpper(username) + ":" + strings.ToUpper(password)
	h1 := sha1.Sum([]byte(userPass))

	// 2. x = SHA1(salt | h1)
	h2Ctx := sha1.New()
	h2Ctx.Write(salt)
	h2Ctx.Write(h1[:])
	h2 := h2Ctx.Sum(nil)

	// x를 Little Endian으로 해석하여 BigInt로 변환
	// WoW Core는 OpenSSL BN_bin2bn(reversed) 사용 -> Little Endian
	x := new(big.Int).SetBytes(reverse(h2))

	// 3. v = g^x % N
	N := new(big.Int)
	N.SetString(N_Hex, 16)
	g := big.NewInt(g_Int)

	v := new(big.Int).Exp(g, x, N)

	// Calculated Verifier in Little Endian Bytes
	calcVerifier := reverse(v.Bytes())

	// Compare (Length check first, then content)
	// Stored verifier is usually 32 bytes. v.Bytes() might be 32 bytes or less.
	// We need to pad properly if verifying strict equality, but usually simple hex compare works if sized correctly.
	// Let's just compare bytes.

	// Normalize lengths to 32 bytes for comparison if needed, but usually exact match is expected.
	if len(calcVerifier) != len(storedVerifier) {
		// Log for debug (remove int prod)
		// log.Printf("Length mismatch: Calc %d vs Stored %d", len(calcVerifier), len(storedVerifier))

		// Some implementations might strict pad.
		// If calc is shorter (leading zeros in Big Endian -> trailing zeros in Little Endian? No.
		// Leading zeros in BigInt value mean smaller number.
		// When converting to Bytes (BigEndian), leading zeros are stripped.
		// Reversing means we get them at the end.
		// Stored verifier is fixed 32 bytes.
		// So we should pad calcVerifier to 32 bytes.
		if len(calcVerifier) < 32 {
			padding := make([]byte, 32-len(calcVerifier))
			calcVerifier = append(calcVerifier, padding...)
		}
	}

	// Compare
	return string(calcVerifier) == string(storedVerifier)
}

// checkMenuPermission validates if the current user has access to the specified menu.
func checkMenuPermission(w http.ResponseWriter, r *http.Request, menuID string) bool {
	cookie, err := r.Cookie("session_user")
	if err != nil || cookie.Value == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"status": "unauthorized", "message": "로그인이 필요합니다."})
		return false
	}
	username := cookie.Value

	authDSN := config.AuthDSN()
	authDB, err := sql.Open("mysql", authDSN)
	if err != nil {
		log.Printf("Auth DB Conn Error: %v", err)
		http.Error(w, "Auth DB Connection Error", http.StatusInternalServerError)
		return false
	}
	defer authDB.Close()

	// 1. Get Account ID
	var userID int
	err = authDB.QueryRow("SELECT id FROM account WHERE UPPER(TRIM(username)) = UPPER(TRIM(?))", username).Scan(&userID)
	if err != nil {
		log.Printf("User ID Query Error: %v", err)
		return false
	}

	// 2. Get User's Web Rank (from update DB)
	webRank := 0
	updateDSN := config.UpdateDSN()
	updateDB, err := sql.Open("mysql", updateDSN)
	if err == nil {
		defer updateDB.Close()
		updateDB.QueryRow("SELECT IFNULL(web_rank, 0) FROM user_profiles WHERE user_id = ?", userID).Scan(&webRank)
	}

	// 3. Use Centralized HasPermission
	if !HasPermission(webRank, "menu", menuID) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusForbidden)
		json.NewEncoder(w).Encode(map[string]string{"status": "forbidden", "message": "권한이 부족합니다."})
		return false
	}

	return true
}

// checkSubMenuPermission validates if the current user has access to the specified submenu.
func checkSubMenuPermission(w http.ResponseWriter, r *http.Request, submenuID string) bool {
	cookie, err := r.Cookie("session_user")
	if err != nil || cookie.Value == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"status": "unauthorized", "message": "로그인이 필요합니다."})
		return false
	}
	username := cookie.Value

	authDSN := config.AuthDSN()
	authDB, err := sql.Open("mysql", authDSN)
	if err != nil {
		log.Printf("Auth DB Conn Error: %v", err)
		http.Error(w, "Auth DB Connection Error", http.StatusInternalServerError)
		return false
	}
	defer authDB.Close()

	var userID int
	err = authDB.QueryRow("SELECT id FROM account WHERE UPPER(TRIM(username)) = UPPER(TRIM(?))", username).Scan(&userID)
	if err != nil {
		log.Printf("User ID Query Error: %v", err)
		return false
	}

	webRank := 0
	updateDSN := config.UpdateDSN()
	updateDB, err := sql.Open("mysql", updateDSN)
	if err == nil {
		defer updateDB.Close()
		updateDB.QueryRow("SELECT IFNULL(web_rank, 0) FROM user_profiles WHERE user_id = ?", userID).Scan(&webRank)
	}

	if !HasPermission(webRank, "submenu", submenuID) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusForbidden)
		json.NewEncoder(w).Encode(map[string]string{"status": "forbidden", "message": "권한이 부족합니다."})
		return false
	}

	return true
}

func serverOnlineHandler(w http.ResponseWriter, r *http.Request) {
	// Character DB 연결 (온라인 여부는 characters 테이블의 online 컬럼 활용)
	dsn := config.CharactersDSN()
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		http.Error(w, "DB Conn Error", http.StatusInternalServerError)
		return
	}
	defer db.Close()

	// 1. Get Online Count (Excluding Banned Accounts AND GM Accounts)
	var count int
	countQuery := `
		SELECT COUNT(*) 
		FROM acore_characters.characters c
		LEFT JOIN acore_auth.account_banned b ON c.account = b.id AND b.active = 1
		LEFT JOIN acore_auth.account_access aa ON c.account = aa.id
		WHERE c.online = 1 
		AND b.id IS NULL
		AND aa.id IS NULL
	`
	err = db.QueryRow(countQuery).Scan(&count)
	if err != nil {
		log.Printf("[ERROR] Online Count Query Failed: %v", err)
		count = 0
	}

	// 2. Get Online Character List (All, ordered by Name, Excluding Banned AND GM Accounts)
	rows, err := db.Query(`
		SELECT c.name, c.race, c.class, c.gender, c.level, c.zone
		FROM acore_characters.characters c
		LEFT JOIN acore_auth.account_banned b ON c.account = b.id AND b.active = 1
		LEFT JOIN acore_auth.account_access aa ON c.account = aa.id
		WHERE c.online = 1 
		AND b.id IS NULL
		AND aa.id IS NULL
		ORDER BY c.name ASC
	`)

	var onlineChars []map[string]interface{}
	if err != nil {
		log.Printf("[ERROR] Online List Query Failed: %v", err)
	} else {
		defer rows.Close()
		for rows.Next() {
			var name string
			var race, class, gender, level, zone int
			if err := rows.Scan(&name, &race, &class, &gender, &level, &zone); err == nil {
				onlineChars = append(onlineChars, map[string]interface{}{
					"name":   name,
					"race":   race,
					"class":  class,
					"gender": gender,
					"level":  level,
					"zone":   zone,
				})
			}
		}
	}
	if onlineChars == nil {
		onlineChars = []map[string]interface{}{} // Return empty array instead of null
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"onlineCount":      count,
		"onlineCharacters": onlineChars,
	})
}

func reverse(b []byte) []byte {
	r := make([]byte, len(b))
	for i := range b {
		r[i] = b[len(b)-1-i]
	}
	return r
}

// Reuse ServerEvent struct from gm package if possible, but simpler to redefine or using map for decoupled public API
type PublicServerEvent struct {
	ID         int    `json:"id"`
	Title      string `json:"title"`
	Content    string `json:"content"`
	TargetDate string `json:"target_date"`
	StartTime  string `json:"start_time"`
	EndTime    string `json:"end_time"`
	Author     string `json:"author"`
}

func handleGetServerEventsPublic(w http.ResponseWriter, r *http.Request) {
	// Require Login (Check Cookie)
	cookie, err := r.Cookie("session_user")
	if err != nil || cookie.Value == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Connect to Update DB
	dbDSN := config.UpdateDSN()
	db, err := sql.Open("mysql", dbDSN)
	if err != nil {
		log.Printf("[ServerEvents] DB Connection Error: %v", err)
		http.Error(w, "DB Error", http.StatusInternalServerError)
		return
	}
	defer db.Close()

	// Ensure table exists so calendar API does not fail on fresh/legacy DBs.
	_, _ = db.Exec(`CREATE TABLE IF NOT EXISTS server_events (
		id INT AUTO_INCREMENT PRIMARY KEY,
		title VARCHAR(255) NOT NULL,
		content TEXT,
		target_date DATE NOT NULL,
		start_time TIME NULL,
		end_time TIME NULL,
		author VARCHAR(100) DEFAULT '',
		is_deleted TINYINT(1) DEFAULT 0
	) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)

	var rows *sql.Rows

	targetMonth := r.URL.Query().Get("month") // Optional: YYYY-MM
	if targetMonth != "" {
		rows, err = db.Query("SELECT id, title, content, target_date, IFNULL(start_time, ''), IFNULL(end_time, ''), author FROM server_events WHERE is_deleted = 0 AND DATE_FORMAT(target_date, '%Y-%m') = ? ORDER BY target_date ASC, start_time ASC", targetMonth)
	} else {
		// Default: Recent 30 days + Future 60 Days
		rows, err = db.Query("SELECT id, title, content, target_date, IFNULL(start_time, ''), IFNULL(end_time, ''), author FROM server_events WHERE is_deleted = 0 AND target_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) AND target_date <= DATE_ADD(CURDATE(), INTERVAL 60 DAY) ORDER BY target_date ASC, start_time ASC")
	}

	if err != nil {
		log.Printf("[ServerEvents] Query Error (Table might be missing): %v", err)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode([]PublicServerEvent{})
		return
	}
	defer rows.Close()

	var events []PublicServerEvent
	for rows.Next() {
		var e PublicServerEvent
		rows.Scan(&e.ID, &e.Title, &e.Content, &e.TargetDate, &e.StartTime, &e.EndTime, &e.Author)
		events = append(events, e)
	}

	if events == nil {
		events = []PublicServerEvent{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(events)
}

// Game Event Handler
type GameEvent struct {
	EventEntry  int    `json:"eventEntry"`
	Description string `json:"description"` // Localized Title
	StartTime   string `json:"start"`
	EndTime     string `json:"end"`
}

func handleGetGameEvents(w http.ResponseWriter, r *http.Request) {
	// Connect to World DB
	dbDSN := config.WorldDSN()
	db, err := sql.Open("mysql", dbDSN)
	if err != nil {
		log.Printf("[GameEvents] DB Connection Error: %v", err)
		http.Error(w, "DB Error", http.StatusInternalServerError)
		return
	}
	defer db.Close()

	// Parse Target Month
	targetMonthStr := r.URL.Query().Get("month") // YYYY-MM
	if targetMonthStr == "" {
		targetMonthStr = time.Now().Format("2006-01")
	}

	// Calculate Month Start and End
	layout := "2006-01"
	parsedMonth, err := time.Parse(layout, targetMonthStr)
	if err != nil {
		parsedMonth = time.Now()
	}
	monthStart := time.Date(parsedMonth.Year(), parsedMonth.Month(), 1, 0, 0, 0, 0, time.Local)
	monthEnd := monthStart.AddDate(0, 1, 0).Add(-time.Second)

	// Query Game Events
	// Note: start_time and end_time in game_event are often 0 for recurring events or specific timestamps?
	// Actually in TrinityCore/AC:
	// start_time: Absolute start date (e.g. 2000-01-01)
	// end_time: Absolute end date
	// occurrence: Repeat interval in minutes (e.g. 10080 for weekly)
	// length: Duration in minutes
	// holiday: ID of holiday (optional)
	// description: Text description

	rows, err := db.Query(`
		SELECT eventEntry, description, start_time, end_time, occurence, length 
		FROM game_event 
		WHERE description != ''
	`)
	if err != nil {
		log.Printf("[GameEvents] Query Error: %v", err)
		json.NewEncoder(w).Encode([]GameEvent{})
		return
	}
	defer rows.Close()

	var events []GameEvent

	for rows.Next() {
		var entry int
		var desc string
		var startStr, endStr string  // MySQL DateTime as string
		var occurrence, length int64 // minutes

		if err := rows.Scan(&entry, &desc, &startStr, &endStr, &occurrence, &length); err != nil {
			continue
		}

		// Localize Description
		koreanTitle := getKoreanEventName(desc)
		if koreanTitle == "" {
			// Optional: Log unmatched descriptions for debugging
			// log.Printf("[GameEvents] Unmatched Event: %s", desc)
			continue
		}

		// Parse Start/End Times
		// MySQL DateTime format: "2006-01-02 15:04:05"
		dbLayout := "2006-01-02 15:04:05"
		startTime, err := time.ParseInLocation(dbLayout, startStr, time.Local)
		if err != nil {
			log.Printf("[GameEvents] Date Parse Error for %s: %v (Str: %s)", desc, err, startStr)
			continue
		}

		// Calculate Occurrences within the target month
		eventDuration := time.Duration(length) * time.Minute

		if occurrence == 0 {
			// One-time event check
			myEnd := startTime.Add(eventDuration)
			if startTime.Before(monthEnd) && myEnd.After(monthStart) {
				events = append(events, GameEvent{
					EventEntry:  entry,
					Description: koreanTitle,
					StartTime:   startTime.Format("2006-01-02 15:04:05"),
					EndTime:     myEnd.Format("2006-01-02 15:04:05"),
				})
			}
		} else {
			// Recurring Event Calculation
			recurrenceDuration := time.Duration(occurrence) * time.Minute

			// If event never confirms start, skip. But game_events usually start way back.

			// Calculate first instance near monthStart
			diff := monthStart.Sub(startTime)
			var n int64 = 0
			if diff > 0 {
				n = int64(diff / recurrenceDuration)
			}

			// Check current N and N+1...
			for i := 0; i < 50; i++ { // Limit iterations
				thisStart := startTime.Add(time.Duration(n) * recurrenceDuration)
				thisEnd := thisStart.Add(eventDuration)

				if thisStart.After(monthEnd) {
					break
				}

				// Check overlapping
				if thisStart.Before(monthEnd) && thisEnd.After(monthStart) {
					events = append(events, GameEvent{
						EventEntry:  entry,
						Description: koreanTitle,
						StartTime:   thisStart.Format("2006-01-02 15:04:05"),
						EndTime:     thisEnd.Format("2006-01-02 15:04:05"),
					})
				}
				n++
			}
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(events)
}

func getKoreanEventName(desc string) string {
	// Map English descriptions to Korean
	// Based on common WoW events
	lowerDesc := strings.ToLower(desc)

	switch {
	case strings.Contains(lowerDesc, "darkmoon"):
		return "다크문 축제"
	case strings.Contains(lowerDesc, "lunar festival"):
		return "달의 축제"
	case strings.Contains(lowerDesc, "love is in the air"):
		return "온누리에 사랑을"
	case strings.Contains(lowerDesc, "noblegarden"):
		return "귀족의 정원"
	case strings.Contains(lowerDesc, "children's week"):
		return "어린이 주간"
	case strings.Contains(lowerDesc, "midsummer"):
		return "한여름 불꽃축제"
	case strings.Contains(lowerDesc, "pirates' day"):
		return "해적의 날"
	case strings.Contains(lowerDesc, "harvest festival"):
		return "가을 축제 (Harvest)"
	case strings.Contains(lowerDesc, "brewfest"):
		return "가을 축제 (Brewfest)"
	case strings.Contains(lowerDesc, "hallow's end"):
		return "할로윈 축제"
	case strings.Contains(lowerDesc, "day of the dead"):
		return "망자의 날"
	case strings.Contains(lowerDesc, "pilgrim's bounty"):
		return "순례자의 감사절"
	case strings.Contains(lowerDesc, "winter veil"):
		return "겨울맞이 축제"
	case strings.Contains(lowerDesc, "fishing extravaganza"):
		return "가시덤불 낚시왕 대회"
	case strings.Contains(lowerDesc, "kalu'ak fishing derby"):
		return "칼루아크 낚시 대회"
	case strings.Contains(lowerDesc, "elemental invasion"):
		return "정령의 침공"
	case strings.Contains(lowerDesc, "call to arms: alterac"):
		return "전장 모병: 알터랙 계곡"
	case strings.Contains(lowerDesc, "call to arms: warsong"):
		return "전장 모병: 전쟁노래 협곡"
	case strings.Contains(lowerDesc, "call to arms: arathi"):
		return "전장 모병: 아라시 분지"
	case strings.Contains(lowerDesc, "call to arms: eye of the storm"):
		return "전장 모병: 폭풍의 눈"
	case strings.Contains(lowerDesc, "strand of the ancients"):
		return "전장 모병: 고대 해변"
	case strings.Contains(lowerDesc, "isle of conquest"):
		return "전장 모병: 정복의 섬"
	}

	// Default: return empty to skip unknown events or return original
	return ""
}
