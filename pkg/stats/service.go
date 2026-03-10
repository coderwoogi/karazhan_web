package stats

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	_ "github.com/go-sql-driver/mysql"
)

type DailyCount struct {
	Date  string `json:"date"`
	Count int    `json:"count"`
}

type RecentItem struct {
	Name string `json:"name"`
	Date string `json:"date"`
}

type StatsResponse struct {
	Accounts struct {
		Total       int          `json:"total"`
		DailyCounts []DailyCount `json:"daily_counts"`
		Recent      []RecentItem `json:"recent"`
	} `json:"accounts"`
	Characters struct {
		Total       int          `json:"total"`
		DailyCounts []DailyCount `json:"daily_counts"`
		Recent      []RecentItem `json:"recent"`
	} `json:"characters"`
}

func RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/stats/summary", statsHandler)
	mux.HandleFunc("/api/stats/dashboard", handleStatsDashboard)
	mux.HandleFunc("/api/logs/list", handleLogsList)
	mux.HandleFunc("/api/logs/blackmarket", handleBlackMarketLogs)
	mux.HandleFunc("/api/logs/karazhan", handleKarazhanLogs)
	mux.HandleFunc("/api/logs/playtime", handlePlaytimeLogs)
	mux.HandleFunc("/api/logs/mail", handleMailLogs)
	mux.HandleFunc("/api/characters/list", handleCharacterList)
	mux.HandleFunc("/api/characters/sendmail", handleSendMail)
	mux.HandleFunc("/api/characters/items", handleCharacterItems)

	// Menu Permissions (legacy - min_web_rank)
	mux.HandleFunc("/api/admin/menus", handleMenuMetadata)
	mux.HandleFunc("/api/admin/menus/update", handleUpdateMenuPermission)

	// Role-based Permissions (new - individual allow/deny per rank)
	mux.HandleFunc("/api/admin/role-permissions", handleGetRolePermissions)
	mux.HandleFunc("/api/admin/role-permissions/save", handleSaveRolePermissions)
	mux.HandleFunc("/api/admin/menu-order/list", handleAdminMenuOrderList)
	mux.HandleFunc("/api/admin/menu-order/update", handleAdminMenuOrderUpdate)

	// Content - BlackMarket
	mux.HandleFunc("/api/content/blackmarket/list", handleBlackMarketItemList)
	mux.HandleFunc("/api/content/blackmarket/add", handleBlackMarketItemAdd)
	mux.HandleFunc("/api/content/blackmarket/update", handleBlackMarketItemUpdate)
	mux.HandleFunc("/api/content/blackmarket/delete", handleBlackMarketItemDelete)
	mux.HandleFunc("/api/content/carddraw/list", handleCarddrawContentList)
	mux.HandleFunc("/api/content/carddraw/add", handleCarddrawContentAdd)
	mux.HandleFunc("/api/content/carddraw/update", handleCarddrawContentUpdate)
	mux.HandleFunc("/api/content/carddraw/delete", handleCarddrawContentDelete)
	mux.HandleFunc("/api/carddraw/pool/random", handleCarddrawRandomPack)

	// Item Search
	mux.HandleFunc("/api/content/item/search", handleItemSearch)
	mux.HandleFunc("/api/content/item/tooltip", handleItemTooltip)

	// Point Shop
	mux.HandleFunc("/api/shop/items", handleShopItems)
	mux.HandleFunc("/api/shop/world-status", handleShopWorldStatus)
	mux.HandleFunc("/api/shop/coin-market/list", handleShopCoinMarketList)
	mux.HandleFunc("/api/shop/coin-market/my-characters", handleShopCoinMarketMyCharacters)
	mux.HandleFunc("/api/shop/coin-market/create", handleShopCoinMarketCreate)
	mux.HandleFunc("/api/shop/coin-market/buy", handleShopCoinMarketBuy)
	mux.HandleFunc("/api/shop/coin-market/cancel", handleShopCoinMarketCancel)
	mux.HandleFunc("/api/shop/orders/create", handleShopCreateOrder)
	mux.HandleFunc("/api/shop/my-orders", handleShopMyOrders)
	mux.HandleFunc("/api/shop/subscription/status", handleShopSubscriptionStatus)
	mux.HandleFunc("/api/admin/shop/items", handleAdminShopItems)
	mux.HandleFunc("/api/admin/shop/item/save", handleAdminShopItemSave)
	mux.HandleFunc("/api/admin/shop/icon/upload", handleAdminShopIconUpload)
	mux.HandleFunc("/api/admin/shop/item/toggle", handleAdminShopItemToggle)
	mux.HandleFunc("/api/admin/shop/iconpack/list", handleAdminShopIconPackList)
	mux.HandleFunc("/api/admin/shop/orders", handleAdminShopOrders)
	mux.HandleFunc("/api/admin/shop/order/status", handleAdminShopOrderStatus)
	mux.HandleFunc("/api/auction/list", handleAuctionList)
	mux.HandleFunc("/api/auction/my-characters", handleAuctionMyCharacters)
	mux.HandleFunc("/api/auction/my-items", handleAuctionMyItems)
	mux.HandleFunc("/api/auction/create", handleAuctionCreate)
	mux.HandleFunc("/api/auction/my-list", handleAuctionMyList)
	mux.HandleFunc("/api/auction/cancel", handleAuctionCancel)
	mux.HandleFunc("/api/auction/buyout", handleAuctionBuyout)
	mux.HandleFunc("/api/auction/bid", handleAuctionBid)

	ensureShopPermissionSeeds()
	ensureAuctionPermissionSeeds()
	ensureStatsPermissionSeeds()
	ensureCarddrawPoolSchema()
}

func statsHandler(w http.ResponseWriter, r *http.Request) {
	// auth DSN
	authDSN := "root:4618@tcp(localhost:3306)/acore_auth"
	charDSN := "root:4618@tcp(localhost:3306)/acore_characters"

	stats := &StatsResponse{}
	stats.Accounts.DailyCounts = make([]DailyCount, 0)
	stats.Characters.DailyCounts = make([]DailyCount, 0)
	stats.Accounts.Recent = make([]RecentItem, 0)
	stats.Characters.Recent = make([]RecentItem, 0)

	// 1. Account Stats
	authDB, err := sql.Open("mysql", authDSN)
	if err == nil {
		defer authDB.Close()
		// Total
		authDB.QueryRow("SELECT COUNT(*) FROM account").Scan(&stats.Accounts.Total)
		// Daily (Last 14 days)
		rows, err := authDB.Query(`
			SELECT DATE(joindate) as d, COUNT(*) as c 
			FROM account 
			GROUP BY d 
			ORDER BY d DESC 
			LIMIT 14`)
		if err == nil && rows != nil {
			defer rows.Close()
			for rows.Next() {
				var d string
				var c int
				if err := rows.Scan(&d, &c); err == nil {
					stats.Accounts.DailyCounts = append(stats.Accounts.DailyCounts, DailyCount{Date: d, Count: c})
				}
			}
		} else if err != nil {
			log.Printf("Stats: Auth Daily Query Error: %v", err)
		}

		// Recent 10 Accounts
		recentRows, err := authDB.Query("SELECT username, joindate FROM account ORDER BY joindate DESC LIMIT 10")
		if err == nil && recentRows != nil {
			defer recentRows.Close()
			for recentRows.Next() {
				var name, date string
				if err := recentRows.Scan(&name, &date); err == nil {
					stats.Accounts.Recent = append(stats.Accounts.Recent, RecentItem{Name: name, Date: date})
				}
			}
		}
	}

	// 2. Character Stats
	charDB, err := sql.Open("mysql", charDSN)
	if err == nil {
		defer charDB.Close()
		// Total
		charDB.QueryRow("SELECT COUNT(*) FROM characters").Scan(&stats.Characters.Total)
		// Daily (Last 14 days)
		rows, err := charDB.Query(`
			SELECT DATE(creation_date) as d, COUNT(*) as c 
			FROM characters 
			GROUP BY d 
			ORDER BY d DESC 
			LIMIT 14`)
		if err == nil && rows != nil {
			defer rows.Close()
			for rows.Next() {
				var d string
				var c int
				if err := rows.Scan(&d, &c); err == nil {
					stats.Characters.DailyCounts = append(stats.Characters.DailyCounts, DailyCount{Date: d, Count: c})
				}
			}
		} else if err != nil {
			log.Printf("Stats: Char Daily Query Error: %v", err)
		}

		// Recent 10 Characters
		recentRows, err := charDB.Query("SELECT name, creation_date FROM characters ORDER BY creation_date DESC LIMIT 10")
		if err == nil && recentRows != nil {
			defer recentRows.Close()
			for recentRows.Next() {
				var name, date string
				if err := recentRows.Scan(&name, &date); err == nil {
					stats.Characters.Recent = append(stats.Characters.Recent, RecentItem{Name: name, Date: date})
				}
			}
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}

func handleLogsList(w http.ResponseWriter, r *http.Request) {
	// 1. Authorization Check: Use Centralized Permission Check
	if !CheckMenuPermission(w, r, "logs") {
		return
	}
	if !CheckMenuPermission(w, r, "log-action", "submenu") {
		return
	}

	cookie, _ := r.Cookie("session_user")
	username := cookie.Value
	log.Printf("[Stats] Loading logs for user: %s", username)

	// 2. Fetch Logs
	dsn := "cpo5704:584579@tcp(121.148.127.135:3306)/update"
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		log.Printf("[Stats] DB Open Error: %v", err)
		http.Error(w, "Logs DB 접속 오류: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		log.Printf("[Stats] DB Ping Error: %v", err)
		http.Error(w, "Logs DB 연결 실패: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Parse Query Params
	queryValues := r.URL.Query()
	pageStr := queryValues.Get("page")
	limitStr := queryValues.Get("limit")
	userFilter := queryValues.Get("user")
	roleFilter := queryValues.Get("role")
	ipFilter := queryValues.Get("ip")
	btnFilter := queryValues.Get("button")

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
	baseQuery := "SELECT no, user, role, ip, date, button FROM logs"
	countQuery := "SELECT COUNT(*) FROM logs"
	whereClause := ""
	var args []interface{}

	if userFilter != "" {
		whereClause += " WHERE user LIKE ?"
		args = append(args, "%"+userFilter+"%")
	}
	if roleFilter != "" {
		if whereClause == "" {
			whereClause += " WHERE"
		} else {
			whereClause += " AND"
		}
		whereClause += " role LIKE ?"
		args = append(args, "%"+roleFilter+"%")
	}
	if ipFilter != "" {
		if whereClause == "" {
			whereClause += " WHERE"
		} else {
			whereClause += " AND"
		}
		whereClause += " ip LIKE ?"
		args = append(args, "%"+ipFilter+"%")
	}
	if btnFilter != "" {
		if whereClause == "" {
			whereClause += " WHERE"
		} else {
			whereClause += " AND"
		}
		whereClause += " button LIKE ?"
		args = append(args, "%"+btnFilter+"%")
	}

	// Get Total Count
	var totalCount int
	err = db.QueryRow(countQuery+whereClause, args...).Scan(&totalCount)
	if err != nil {
		log.Printf("[Stats] Count Query Error: %v", err)
		http.Error(w, "로그 개수 조회 오류: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Get Logs
	finalQuery := baseQuery + whereClause + " ORDER BY no DESC LIMIT ? OFFSET ?"
	queryArgs := append(args, limit, offset)

	log.Printf("[Stats] Executing: %s | Args: %v", finalQuery, queryArgs)

	rows, err := db.Query(finalQuery, queryArgs...)
	if err != nil {
		log.Printf("[Stats] Select Query Error: %v", err)
		http.Error(w, "로그 데이터 조회 오류: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var logs = make([]map[string]interface{}, 0)
	for rows.Next() {
		var no int
		var user, role, ip, date, button string
		if err := rows.Scan(&no, &user, &role, &ip, &date, &button); err != nil {
			log.Printf("[Stats] Scan Error: %v", err)
			continue
		}
		logs = append(logs, map[string]interface{}{
			"no": no, "user": user, "role": role, "ip": ip, "date": date, "button": button,
		})
	}

	totalPages := (totalCount + limit - 1) / limit
	log.Printf("[Stats] Finished loading %d logs (Total: %d, Pages: %d)", len(logs), totalCount, totalPages)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"logs":       logs,
		"total":      totalCount,
		"totalPages": totalPages,
		"page":       page,
		"debug_user": username,
	})
}
