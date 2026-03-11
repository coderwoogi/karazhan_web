package main

import (
	"database/sql"
	"fmt"
	"karazhan/pkg/config"

	_ "github.com/go-sql-driver/mysql"
)

func main() {
	db, err := sql.Open("mysql", config.UpdateDSN())
	if err != nil {
		panic(err)
	}
	defer db.Close()

	// List of sub-menus to ensure exist
	// Order index logic:
	// GM Panel (2000) -> 2100+
	// Server Control (3000) -> 3100+
	// User Management (4000) -> 4100+
	submenus := []struct {
		ID    string
		Name  string
		Type  string
		Order int
	}{
		// GM Management Sub-menus
		{"todo", "업무 관리", "submenu", 2101},
		{"schedule", "서버 일정", "submenu", 2102},
		{"module-analysis", "모듈 분석", "submenu", 2103},
		{"memo", "전체 메모", "submenu", 2104},

		// Remote Control Sub-menus
		{"remote-control", "서버 제어", "submenu", 3101},
		{"server-status", "상태 모니터링", "submenu", 3102},

		// Account Management Sub-menus
		{"account-list", "계정 목록", "submenu", 4101},
		{"ip-ban", "IP 차단 관리", "submenu", 4102},
	}

	fmt.Println("Seeding sub-menus...")
	for _, sm := range submenus {
		// Use INSERT ON DUPLICATE KEY UPDATE to ensure values are correct
		_, err := db.Exec(`
			INSERT INTO web_role_permissions (resource_id, resource_name, resource_type, order_index, rank_1, rank_2)
			VALUES (?, ?, ?, ?, 0, 0)
			ON DUPLICATE KEY UPDATE 
				resource_name = VALUES(resource_name),
				resource_type = VALUES(resource_type),
				order_index = VALUES(order_index)
		`, sm.ID, sm.Name, sm.Type, sm.Order)

		if err != nil {
			fmt.Printf("Error seeding %s: %v\n", sm.ID, err)
		} else {
			fmt.Printf("Seeded/Updated: %s (%s)\n", sm.ID, sm.Name)
		}
	}
	fmt.Println("Seeding complete.")
}
