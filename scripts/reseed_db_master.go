package main

import (
	"database/sql"
	"fmt"
	"log"

	_ "github.com/go-sql-driver/mysql"
)

func main() {
	db, err := sql.Open("mysql", config.UpdateDSNWithParams("charset=utf8mb4&parseTime=True&loc=Local"))
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	// 1. Truncate table to ensure clean slate
	fmt.Println("Truncating web_role_permissions...")
	_, err = db.Exec("TRUNCATE TABLE web_role_permissions")
	if err != nil {
		log.Fatalf("Failed to truncate table: %v", err)
	}

	// 2. Define ALL permissions with correct resource_type and order
	// Using explicit Korean names to avoid encoding issues
	permissions := []struct {
		Type  string
		ID    string
		Name  string
		Order int
	}{
		// 100: Home
		{"menu", "home", "홈", 100},

		// 200: GM Management
		{"menu", "gm", "GM 업무 관리", 200},
		{"submenu", "gm-todos", "업무 관리", 201},
		{"submenu", "gm-events", "서버 일정", 202},
		{"submenu", "gm-modules", "모듈 분석", 203},
		{"submenu", "gm-memos", "전체 메모", 204},

		// 300: Server Control
		{"menu", "remote", "서버 제어", 300},
		{"submenu", "remote-control", "서버 제어", 301},
		{"submenu", "remote-schedule", "서버 점검 예약", 302},
		{"submenu", "server-status", "상태 모니터링", 303},

		// 400: Update
		{"menu", "update", "업데이트", 400},

		// 500: Account Management
		{"menu", "account", "계정 관리", 500},
		{"submenu", "account-list", "계정 목록", 501},
		{"submenu", "account-statistics", "통계", 502},
		{"submenu", "account-permissions", "사용자 권한", 503},
		{"submenu", "account-menu", "메뉴 접근 권한", 504},
		{"submenu", "ip-ban", "IP 차단 관리", 505},

		// 600: Ban / Characters
		{"menu", "ban", "캐릭터/제재", 600},
		{"submenu", "ban-characters", "캐릭터 목록", 601},
		{"submenu", "ban-sendmail", "우편 발송", 602},
		{"submenu", "ban-accountban", "계정 차단", 603},
		{"submenu", "ban-ipban", "IP 차단", 604},

		// 700: Log Center
		{"menu", "log", "로그 센터", 700},
		{"submenu", "log-action", "웹 관리자 활동", 701},
		{"submenu", "log-blackmarket", "암시장 거래", 702},
		{"submenu", "log-karazhan", "강화 로그", 703},
		{"submenu", "log-playtime", "접속 보상", 704},
		{"submenu", "log-mail", "우편 발송 기록", 705},

		// 800: Content Data
		{"menu", "content", "콘텐츠 데이터 관리", 800},
		{"submenu", "content-blackmarket", "암시장 품목 설정", 801},

		// 900: Board
		{"menu", "board", "게시판", 900},

		// 1000: My Page
		{"menu", "mypage", "마이페이지", 1000},

		// 1100: CMS
		{"menu", "board-admin", "게시판 관리 (CMS)", 1100},
	}

	stmt, err := db.Prepare("INSERT INTO web_role_permissions (resource_type, resource_id, resource_name, rank_1, rank_2, order_index) VALUES (?, ?, ?, ?, ?, ?)")
	if err != nil {
		log.Fatal(err)
	}
	defer stmt.Close()

	fmt.Println("Seeding permissions...")
	for _, p := range permissions {
		// Default ranks: Rank1(User)=0, Rank2(GM)=0 for safety, except Home/Board/MyPage usually 1
		r1 := 0
		r2 := 0

		// Set defaults for common pages
		if p.ID == "home" || p.ID == "board" || p.ID == "mypage" {
			r1 = 1
			r2 = 1
		}
		// GMs usually see everything using menus by default
		if p.Type == "menu" && p.ID != "update" {
			r2 = 1
		}

		_, err := stmt.Exec(p.Type, p.ID, p.Name, r1, r2, p.Order)
		if err != nil {
			log.Printf("Error inserting %s: %v", p.ID, err)
		} else {
			// fmt.Printf("Inserted: %s\n", p.ID)
		}
	}

	// 3. Re-insert Board permissions (dynamic)
	fmt.Println("Seeding board permissions...")
	rows, err := db.Query("SELECT id, name FROM web_boards")
	if err != nil {
		log.Printf("Failed to query boards: %v", err)
	} else {
		defer rows.Close()
		for rows.Next() {
			var bid, bname string
			rows.Scan(&bid, &bname)

			// Board Read
			stmt.Exec("board_read", bid, bname+" (읽기)", 1, 1, 9000)
			// Board Write
			stmt.Exec("board_write", bid, bname+" (쓰기)", 1, 1, 9001)
		}
	}

	fmt.Println("Done. Database re-seeded successfully.")
}
