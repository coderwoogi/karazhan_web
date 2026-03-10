package auth

import (
	"database/sql"
	"log"
)

const (
	AuthDSN   = "root:4618@tcp(localhost:3306)/acore_auth"
	UpdateDSN = "cpo5704:584579@tcp(121.148.127.135:3306)/update"
)

// GetEffectivePermissions returns a map of all permissions for a given web rank
func GetEffectivePermissions(webRank int) map[string]bool {
	perms := make(map[string]bool)

	// Admin (rank 2 or higher) always has all permissions
	if webRank >= 2 {
		// We could query all resources, but it's more efficient to just handle "superuser" logic in frontend
		// However, for consistency, let's fetch all known resources from web_role_permissions
		db, err := sql.Open("mysql", UpdateDSN)
		if err == nil {
			defer db.Close()
			rows, err := db.Query("SELECT resource_type, resource_id FROM web_role_permissions")
			if err == nil {
				defer rows.Close()
				for rows.Next() {
					var rType, rID string
					if err := rows.Scan(&rType, &rID); err == nil {
						perms[rType+"_"+rID] = true
					}
				}
			}
		}
		// Also add some explicit ones if not in DB yet
		perms["admin_all"] = true
		return perms
	}

	// Normal User (rank 0) or GM (rank 1)
	db, err := sql.Open("mysql", UpdateDSN)
	if err != nil {
		log.Printf("[Permissions] Failed to open update DB: %v", err)
		return perms
	}
	defer db.Close()

	col := "rank_1" // Rank 0 (User)
	if webRank == 1 {
		col = "rank_2" // Rank 1 (GM)
	}

	log.Printf("[Permissions] Fetching permissions for WebRank %d using column %s", webRank, col)

	rows, err := db.Query("SELECT resource_type, resource_id FROM web_role_permissions WHERE " + col + " = 1")
	if err != nil {
		log.Printf("[Permissions] Query Error: %v", err)
		return perms
	}
	defer rows.Close()

	count := 0
	for rows.Next() {
		var rType, rID string
		if err := rows.Scan(&rType, &rID); err == nil {
			perms[rType+"_"+rID] = true
			count++
		}
	}
	log.Printf("[Permissions] Loaded %d permissions for WebRank %d", count, webRank)

	// Always add public fallbacks to the perms map
	perms["menu_home"] = true
	perms["menu_mypage"] = true
	perms["menu_board"] = true

	return perms
}

// HasPermission checks if a given web rank has a specific resource permission
func HasPermission(webRank int, resourceType, resourceID string) bool {
	if webRank >= 2 {
		return true
	}

	db, err := sql.Open("mysql", UpdateDSN)
	if err != nil {
		return false
	}
	defer db.Close()

	col := "rank_1"
	if webRank == 1 {
		col = "rank_2"
	}

	var allowed int
	err = db.QueryRow(
		"SELECT IFNULL("+col+", 0) FROM web_role_permissions WHERE resource_type = ? AND resource_id = ?",
		resourceType, resourceID,
	).Scan(&allowed)

	if err != nil {
		// Fallback for public menus if rank 0
		if webRank == 0 && resourceType == "menu" {
			// Some menus might be public by default (home, mypage)
			if resourceID == "home" || resourceID == "mypage" || resourceID == "board" {
				return true
			}
		}
		return false
	}

	return allowed == 1
}
