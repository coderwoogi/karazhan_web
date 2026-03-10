package main

import (
	"database/sql"
	"fmt"
	"log"
	"strings"

	_ "github.com/go-sql-driver/mysql"
)

const dsn = "cpo5704:584579@tcp(121.148.127.135:3306)/update"

type Menu struct {
	Type     string
	ID       string
	ParentID sql.NullString
	Name     string
	Order    int
}

func main() {
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		log.Fatalf("Failed to ping database: %v", err)
	}

	fmt.Println("Starting menu migration...")

	// 1. Create web_menu_registry table
	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS web_menu_registry (
			id VARCHAR(50) PRIMARY KEY,
			type VARCHAR(20) NOT NULL,
			parent_id VARCHAR(50),
			name VARCHAR(100) NOT NULL,
			order_index INT DEFAULT 0
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
	`)
	if err != nil {
		log.Fatalf("Failed to create web_menu_registry table: %v", err)
	}
	fmt.Println("- Created web_menu_registry table.")

	// 2. Define correct, deduplicated menus
	menus := []Menu{
		{"menu", "home", sql.NullString{}, "홈", 100},
		{"menu", "gm", sql.NullString{}, "GM 업무 관리", 200},
		{"submenu", "gm-todos", sql.NullString{String: "gm", Valid: true}, "업무 관리", 201},
		{"submenu", "gm-events", sql.NullString{String: "gm", Valid: true}, "서버 일정", 202},
		{"submenu", "gm-modules", sql.NullString{String: "gm", Valid: true}, "모듈 분석", 203},
		{"submenu", "gm-memos", sql.NullString{String: "gm", Valid: true}, "전체 메모", 204},
		{"menu", "remote", sql.NullString{}, "서버 제어", 300},
		{"submenu", "remote-control", sql.NullString{String: "remote", Valid: true}, "서버 제어", 301},
		{"submenu", "remote-schedule", sql.NullString{String: "remote", Valid: true}, "서버 점검 예약", 302},
		{"menu", "update", sql.NullString{}, "업데이트", 400},
		{"menu", "account", sql.NullString{}, "계정 관리", 500},
		{"submenu", "account-list", sql.NullString{String: "account", Valid: true}, "계정 목록", 501},
		{"submenu", "account-statistics", sql.NullString{String: "account", Valid: true}, "통계", 502},
		{"submenu", "account-permissions", sql.NullString{String: "account", Valid: true}, "사용자 권한", 503},
		{"submenu", "account-menu", sql.NullString{String: "account", Valid: true}, "메뉴 접근 권한", 504},
		{"menu", "ban", sql.NullString{}, "캐릭터/제재", 600},
		{"submenu", "ban-characters", sql.NullString{String: "ban", Valid: true}, "캐릭터 목록", 601},
		{"submenu", "ban-sendmail", sql.NullString{String: "ban", Valid: true}, "우편 발송", 602},
		{"submenu", "ban-accountban", sql.NullString{String: "ban", Valid: true}, "계정 차단", 603},
		{"submenu", "ban-ipban", sql.NullString{String: "ban", Valid: true}, "IP 차단", 604},
		{"menu", "log", sql.NullString{}, "로그 센터", 700},
		{"submenu", "log-action", sql.NullString{String: "log", Valid: true}, "웹 관리자 활동", 701},
		{"submenu", "log-blackmarket", sql.NullString{String: "log", Valid: true}, "암시장 거래", 702},
		{"submenu", "log-karazhan", sql.NullString{String: "log", Valid: true}, "강화 로그", 703},
		{"submenu", "log-playtime", sql.NullString{String: "log", Valid: true}, "접속 보상", 704},
		{"submenu", "log-mail", sql.NullString{String: "log", Valid: true}, "우편 발송 기록", 705},
		{"menu", "content", sql.NullString{}, "콘텐츠 데이터 관리", 800},
		{"submenu", "content-blackmarket", sql.NullString{String: "content", Valid: true}, "암시장 품목 설정", 801},
		{"menu", "board", sql.NullString{}, "게시판", 900},
		{"menu", "mypage", sql.NullString{}, "마이페이지", 1000},
		{"menu", "board-admin", sql.NullString{}, "게시판 관리 (CMS)", 1100},
		{"submenu", "board-list", sql.NullString{String: "board-admin", Valid: true}, "게시판 목록", 1101},
		{"submenu", "board-order", sql.NullString{String: "board-admin", Valid: true}, "순서 관리", 1102},
	}

	// 3. Clear existing registry and insert new
	db.Exec("TRUNCATE TABLE web_menu_registry")
	for _, m := range menus {
		_, err := db.Exec(`
			INSERT INTO web_menu_registry (id, type, parent_id, name, order_index)
			VALUES (?, ?, ?, ?, ?)
			ON DUPLICATE KEY UPDATE type=VALUES(type), parent_id=VALUES(parent_id), name=VALUES(name), order_index=VALUES(order_index)
		`, m.ID, m.Type, m.ParentID, m.Name, m.Order)
		if err != nil {
			log.Fatalf("Failed to insert menu %s: %v", m.ID, err)
		}
	}
	fmt.Println("- Populated web_menu_registry.")

	// 4. Clean up web_role_permissions duplicates
	// First, explicitly delete the "logs" duplicate
	res, err := db.Exec("DELETE FROM web_role_permissions WHERE resource_type = 'menu' AND resource_id = 'logs'")
	if err != nil {
		log.Printf("Error deleting 'logs' duplicate: %v", err)
	} else {
		rowsDeleted, _ := res.RowsAffected()
		if rowsDeleted > 0 {
			fmt.Printf("- Deleted duplicate 'logs' entry from web_role_permissions (%d rows).\n", rowsDeleted)
		}
	}

	// Build list of valid menu IDs
	var validIDs []string
	for _, m := range menus {
		validIDs = append(validIDs, "'"+m.ID+"'")
	}
	validIDStr := strings.Join(validIDs, ",")

	// Delete orphaned menus and submenus (not in our valid list)
	orphanQuery := fmt.Sprintf("DELETE FROM web_role_permissions WHERE resource_type IN ('menu', 'submenu') AND resource_id NOT IN (%s)", validIDStr)
	res, err = db.Exec(orphanQuery)
	if err != nil {
		log.Printf("Error deleting orphaned permissions: %v", err)
	} else {
		rowsDeleted, _ := res.RowsAffected()
		fmt.Printf("- Deleted %d orphaned menu/submenu entries from web_role_permissions.\n", rowsDeleted)
	}

	// IMPORTANT: To prevent future physical duplicates, we should add a UNIQUE constraint to web_role_permissions
	// Check if constraint exists, if not, try to add it.
	// We'll ignore errors here in case it already exists or there are still duplicates preventing it.
	_, err = db.Exec("ALTER TABLE web_role_permissions ADD UNIQUE INDEX idx_resource_unique (resource_type, resource_id)")
	if err == nil {
		fmt.Println("- Added UNIQUE index to web_role_permissions (resource_type, resource_id).")
	} else {
		fmt.Printf("- Note: Could not add UNIQUE index, possibly already exists or duplicates remain. Error: %v\n", err)
	}

	fmt.Println("Migration completed successfully!")
}
