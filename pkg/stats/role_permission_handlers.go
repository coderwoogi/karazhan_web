package stats

import (
	"database/sql"
	"encoding/json"
	"karazhan/pkg/auth"
	"log"
	"net/http"

	_ "github.com/go-sql-driver/mysql"
)

const updateDSN = "cpo5704:584579@tcp(121.148.127.135:3306)/update"

// RolePermission represents a single resource's role-based access
type RolePermission struct {
	ResourceType string `json:"resource_type"` // "menu", "board_read", "board_write"
	ResourceID   string `json:"resource_id"`
	ResourceName string `json:"resource_name"`
	Rank1        bool   `json:"rank_1"` // ?좎?
	Rank2        bool   `json:"rank_2"` // GM
	Rank3        bool   `json:"rank_3"` // 理쒓퀬愿由ъ옄 (??긽 true, 蹂寃?遺덇?)
	OrderIndex   int    `json:"order_index"`
}

// openUpdateDBForPerm opens the update DB
func openUpdateDBForPerm() (*sql.DB, error) {
	return sql.Open("mysql", updateDSN)
}

func ensureMenuRegistryDefaults(db *sql.DB) {
	_, _ = db.Exec(`CREATE TABLE IF NOT EXISTS web_menu_registry (
		id VARCHAR(100) PRIMARY KEY,
		type VARCHAR(20) NOT NULL DEFAULT 'menu',
		name VARCHAR(120) NOT NULL,
		order_index INT DEFAULT 0
	) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)

	// Core/public menus
	_, _ = db.Exec(`INSERT IGNORE INTO web_menu_registry (id, type, name, order_index) VALUES ('home', 'menu', 'Home', 1)`)
	_, _ = db.Exec(`INSERT IGNORE INTO web_menu_registry (id, type, name, order_index) VALUES ('mailbox', 'menu', 'Mailbox', 12)`)
	// Admin menus
	_, _ = db.Exec(`INSERT IGNORE INTO web_menu_registry (id, type, name, order_index) VALUES ('gm', 'menu', 'GM', 20)`)
	_, _ = db.Exec(`INSERT IGNORE INTO web_menu_registry (id, type, name, order_index) VALUES ('remote', 'menu', 'Remote', 30)`)
	_, _ = db.Exec(`INSERT IGNORE INTO web_menu_registry (id, type, name, order_index) VALUES ('update', 'menu', 'Update', 40)`)
	_, _ = db.Exec(`INSERT IGNORE INTO web_menu_registry (id, type, name, order_index) VALUES ('account', 'menu', 'Account', 50)`)
	_, _ = db.Exec(`INSERT IGNORE INTO web_menu_registry (id, type, name, order_index) VALUES ('ban', 'menu', 'Ban', 60)`)
	_, _ = db.Exec(`INSERT IGNORE INTO web_menu_registry (id, type, name, order_index) VALUES ('logs', 'menu', 'Logs', 70)`)
	_, _ = db.Exec(`INSERT IGNORE INTO web_menu_registry (id, type, name, order_index) VALUES ('stats', 'menu', '통계', 75)`)
	_, _ = db.Exec(`INSERT IGNORE INTO web_menu_registry (id, type, name, order_index) VALUES ('content', 'menu', 'Content', 80)`)
	_, _ = db.Exec(`INSERT IGNORE INTO web_menu_registry (id, type, name, order_index) VALUES ('board-admin', 'menu', 'Board Admin', 90)`)
	_, _ = db.Exec(`INSERT IGNORE INTO web_menu_registry (id, type, name, order_index) VALUES ('shop', 'menu', '선술집', 13)`)
	_, _ = db.Exec(`INSERT IGNORE INTO web_menu_registry (id, type, name, order_index) VALUES ('shop-admin', 'menu', '선술집관리', 96)`)
	_, _ = db.Exec(`UPDATE web_menu_registry SET name = '선술집' WHERE id = 'shop'`)
	_, _ = db.Exec(`UPDATE web_menu_registry SET name = '선술집관리' WHERE id = 'shop-admin'`)
	_, _ = db.Exec(`INSERT IGNORE INTO web_menu_registry (id, type, name, order_index) VALUES ('notification-admin', 'menu', '알림발송', 95)`)
	_, _ = db.Exec(`UPDATE web_menu_registry SET name = '알림발송' WHERE id = 'notification-admin'`)
}

// handleGetRolePermissions returns all role permissions (menus + boards)
func handleGetRolePermissions(w http.ResponseWriter, r *http.Request) {
	if !CheckMenuPermission(w, r, "account") {
		return
	}

	db, err := openUpdateDBForPerm()
	if err != nil {
		http.Error(w, "DB Error: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer db.Close()

	// Ensure menu registry exists and includes default menu rows.
	ensureMenuRegistryDefaults(db)

	// Ensure all menu entries exist in web_role_permissions from web_menu_registry
	registryRows, err := db.Query("SELECT id, type, name, order_index FROM web_menu_registry ORDER BY order_index")
	if err == nil {
		defer registryRows.Close()
		for registryRows.Next() {
			var rid, rtype, rname string
			var rorder int
			if err := registryRows.Scan(&rid, &rtype, &rname, &rorder); err == nil {
				db.Exec(`INSERT IGNORE INTO web_role_permissions (resource_type, resource_id, resource_name, rank_1, rank_2, rank_3, order_index) VALUES (?, ?, ?, 1, 1, 1, ?)`, rtype, rid, rname, rorder)
			}
		}
	} else {
		log.Printf("[RolePermissions] Failed to fetch menu registry: %v", err)
	}

	// Safety insert so the permission row exists even if registry query fails.
	_, _ = db.Exec(`INSERT IGNORE INTO web_role_permissions (resource_type, resource_id, resource_name, rank_1, rank_2, rank_3, order_index) VALUES ('menu', 'mailbox', 'Mailbox', 1, 1, 1, 12)`)
	_, _ = db.Exec(`INSERT IGNORE INTO web_role_permissions (resource_type, resource_id, resource_name, rank_1, rank_2, rank_3, order_index) VALUES ('menu', 'shop', '선술집', 1, 1, 1, 13)`)
	_, _ = db.Exec(`INSERT IGNORE INTO web_role_permissions (resource_type, resource_id, resource_name, rank_1, rank_2, rank_3, order_index) VALUES ('menu', 'shop-admin', '선술집관리', 0, 1, 1, 96)`)
	_, _ = db.Exec(`UPDATE web_role_permissions SET resource_name = '선술집' WHERE resource_type = 'menu' AND resource_id = 'shop'`)
	_, _ = db.Exec(`UPDATE web_role_permissions SET resource_name = '선술집관리' WHERE resource_type = 'menu' AND resource_id = 'shop-admin'`)
	_, _ = db.Exec(`INSERT IGNORE INTO web_role_permissions (resource_type, resource_id, resource_name, rank_1, rank_2, rank_3, order_index) VALUES ('menu', 'notification-admin', '알림발송', 0, 1, 1, 95)`)
	_, _ = db.Exec(`UPDATE web_role_permissions SET resource_name = '알림발송' WHERE resource_type = 'menu' AND resource_id = 'notification-admin'`)
	_, _ = db.Exec(`INSERT IGNORE INTO web_role_permissions (resource_type, resource_id, resource_name, rank_1, rank_2, rank_3, order_index) VALUES ('menu', 'stats', '통계', 0, 1, 1, 75)`)
	_, _ = db.Exec(`UPDATE web_role_permissions SET resource_name = '통계', rank_1=0, rank_2=1, rank_3=1, order_index=75 WHERE resource_type = 'menu' AND resource_id = 'stats'`)

	// Ensure all board entries exist
	boardRows, err := db.Query("SELECT id, name FROM web_boards ORDER BY id")
	if err == nil {
		defer boardRows.Close()
		for boardRows.Next() {
			var bid, bname string
			if err := boardRows.Scan(&bid, &bname); err != nil {
				continue
			}
			db.Exec(`INSERT IGNORE INTO web_role_permissions (resource_type, resource_id, resource_name, rank_1, rank_2, rank_3) VALUES ('board_read', ?, ?, 1, 1, 1)`, bid, bname+" (?쎄린)")
			db.Exec(`INSERT IGNORE INTO web_role_permissions (resource_type, resource_id, resource_name, rank_1, rank_2, rank_3) VALUES ('board_write', ?, ?, 0, 1, 1)`, bid, bname+" (?곌린)")
		}
	}

	// Fetch all permissions
	rows, err := db.Query("SELECT resource_type, resource_id, resource_name, rank_1, rank_2, rank_3, order_index FROM web_role_permissions ORDER BY order_index ASC, resource_type, resource_id")
	if err != nil {
		log.Printf("[RolePermissions] Query Error: %v", err)
		http.Error(w, "Query Error: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var permissions []RolePermission
	foundMailbox := false
	foundNotificationAdmin := false
	foundShop := false
	foundShopAdmin := false
	for rows.Next() {
		var p RolePermission
		var r1, r2, r3 int
		if err := rows.Scan(&p.ResourceType, &p.ResourceID, &p.ResourceName, &r1, &r2, &r3, &p.OrderIndex); err != nil {
			log.Printf("[RolePermissions] Scan Error: %v", err)
			continue
		}
		p.Rank1 = r1 == 1
		p.Rank2 = r2 == 1
		p.Rank3 = true // always true
		if p.ResourceType == "menu" && p.ResourceID == "mailbox" {
			foundMailbox = true
		}
		if p.ResourceType == "menu" && p.ResourceID == "notification-admin" {
			foundNotificationAdmin = true
		}
		if p.ResourceType == "menu" && p.ResourceID == "shop" {
			foundShop = true
		}
		if p.ResourceType == "menu" && p.ResourceID == "shop-admin" {
			foundShopAdmin = true
		}
		permissions = append(permissions, p)
	}
	if !foundMailbox {
		permissions = append(permissions, RolePermission{
			ResourceType: "menu",
			ResourceID:   "mailbox",
			ResourceName: "Mailbox",
			Rank1:        true,
			Rank2:        true,
			Rank3:        true,
			OrderIndex:   12,
		})
	}
	if !foundNotificationAdmin {
		permissions = append(permissions, RolePermission{
			ResourceType: "menu",
			ResourceID:   "notification-admin",
			ResourceName: "알림발송",
			Rank1:        false,
			Rank2:        true,
			Rank3:        true,
			OrderIndex:   95,
		})
	}
	if !foundShop {
		permissions = append(permissions, RolePermission{
			ResourceType: "menu",
			ResourceID:   "shop",
			ResourceName: "선술집",
			Rank1:        true,
			Rank2:        true,
			Rank3:        true,
			OrderIndex:   13,
		})
	}
	if !foundShopAdmin {
		permissions = append(permissions, RolePermission{
			ResourceType: "menu",
			ResourceID:   "shop-admin",
			ResourceName: "선술집관리",
			Rank1:        false,
			Rank2:        true,
			Rank3:        true,
			OrderIndex:   96,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":      "success",
		"permissions": permissions,
	})
}

// handleSaveRolePermissions saves role permissions in bulk
func handleSaveRolePermissions(w http.ResponseWriter, r *http.Request) {
	if !CheckMenuPermission(w, r, "account") {
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var body struct {
		Permissions []struct {
			ResourceType string `json:"resource_type"`
			ResourceID   string `json:"resource_id"`
			Rank1        bool   `json:"rank_1"`
			Rank2        bool   `json:"rank_2"`
		} `json:"permissions"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	db, err := openUpdateDBForPerm()
	if err != nil {
		http.Error(w, "DB Error: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer db.Close()

	for _, p := range body.Permissions {
		if p.ResourceType == "" || p.ResourceID == "" {
			continue
		}
		r1 := 0
		if p.Rank1 {
			r1 = 1
		}
		r2 := 0
		if p.Rank2 {
			r2 = 1
		}
		// rank_3 is always 1 ??never update it
		_, err := db.Exec(
			"UPDATE web_role_permissions SET rank_1 = ?, rank_2 = ? WHERE resource_type = ? AND resource_id = ?",
			r1, r2, p.ResourceType, p.ResourceID,
		)
		if err != nil {
			log.Printf("[RolePermissions] Update Error: %v", err)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "success"})
}

type MenuOrderItem struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Order int    `json:"order"`
}

func handleAdminMenuOrderList(w http.ResponseWriter, r *http.Request) {
	if !CheckMenuPermission(w, r, "board-admin") {
		return
	}

	db, err := openUpdateDBForPerm()
	if err != nil {
		http.Error(w, "DB Error: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer db.Close()

	ensureMenuRegistryDefaults(db)

	rows, err := db.Query(`
		SELECT id, name, order_index
		FROM web_menu_registry
		WHERE type = 'menu'
		  AND id IN ('mailbox','gm','remote','update','account','ban','logs','content','board-admin','notification-admin','shop-admin')
		ORDER BY order_index ASC, id ASC`)
	if err != nil {
		http.Error(w, "Query Error: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var items []MenuOrderItem
	for rows.Next() {
		var it MenuOrderItem
		if err := rows.Scan(&it.ID, &it.Name, &it.Order); err == nil {
			items = append(items, it)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status": "success",
		"menus":  items,
	})
}

func handleAdminMenuOrderUpdate(w http.ResponseWriter, r *http.Request) {
	if !CheckMenuPermission(w, r, "board-admin") {
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var ids []string
	if err := json.NewDecoder(r.Body).Decode(&ids); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}
	if len(ids) == 0 {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "success"})
		return
	}

	db, err := openUpdateDBForPerm()
	if err != nil {
		http.Error(w, "DB Error: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer db.Close()

	ensureMenuRegistryDefaults(db)

	tx, err := db.Begin()
	if err != nil {
		http.Error(w, "Tx Error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	base := 200
	for i, id := range ids {
		_, err = tx.Exec("UPDATE web_menu_registry SET order_index = ? WHERE id = ? AND type = 'menu'", base+i, id)
		if err != nil {
			_ = tx.Rollback()
			http.Error(w, "Update failed: "+err.Error(), http.StatusInternalServerError)
			return
		}
	}
	if err := tx.Commit(); err != nil {
		http.Error(w, "Commit failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "success"})
}

// CheckRolePermission checks if the current user's web_rank has access to a resource
// Returns true if allowed, false if denied (and writes HTTP error)
func CheckRolePermission(w http.ResponseWriter, r *http.Request, resourceType, resourceID string) bool {
	cookie, err := r.Cookie("session_user")
	if err != nil || cookie.Value == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"status": "unauthorized"})
		return false
	}
	username := cookie.Value

	authDB, err := sql.Open("mysql", "root:4618@tcp(localhost:3306)/acore_auth")
	if err != nil {
		return false
	}
	defer authDB.Close()

	var userID int
	if err := authDB.QueryRow("SELECT id FROM account WHERE UPPER(TRIM(username)) = UPPER(TRIM(?))", username).Scan(&userID); err != nil {
		return false
	}

	updateDB, err := sql.Open("mysql", updateDSN)
	if err != nil {
		return false
	}
	defer updateDB.Close()

	webRank := 0
	updateDB.QueryRow("SELECT IFNULL(web_rank,0) FROM user_profiles WHERE user_id = ?", userID).Scan(&webRank)

	// use centralized logic
	if !auth.HasPermission(webRank, resourceType, resourceID) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusForbidden)
		json.NewEncoder(w).Encode(map[string]string{"status": "forbidden", "message": "?묎렐 沅뚰븳???놁뒿?덈떎."})
		return false
	}

	return true
}
