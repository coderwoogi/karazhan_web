package main

import (
	"database/sql"
	"fmt"
	"karazhan/pkg/config"
	"log"

	_ "github.com/go-sql-driver/mysql"
)

func main() {
	dsn := config.UpdateDSN()
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	// 1. DELETE existing menu/submenu entries
	_, err = db.Exec("DELETE FROM web_role_permissions WHERE resource_type IN ('menu', 'submenu')")
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println("Cleared existing permissions.")

	// 2. Define Data
	type Perm struct {
		Type  string
		ID    string
		Name  string
		Rank1 int
		Rank2 int
		Order int
	}

	data := []Perm{
		{"menu", "home", "홈", 1, 1, 100},

		{"menu", "gm", "GM 업무 관리", 0, 1, 200},
		{"submenu", "gm-todos", "업무 관리", 0, 1, 201},
		{"submenu", "gm-events", "서버 일정", 0, 1, 202},
		{"submenu", "gm-modules", "모듈 분석", 0, 1, 203},
		{"submenu", "gm-memos", "전체 메모", 0, 1, 204},

		{"menu", "remote", "서버 제어", 0, 1, 300},
		{"submenu", "remote-control", "서버 제어", 0, 1, 301},
		{"submenu", "remote-schedule", "서버 점검 예약", 0, 1, 302},

		{"menu", "update", "업데이트", 0, 1, 400},

		{"menu", "account", "계정 관리", 0, 1, 500},
		{"submenu", "account-list", "계정 목록", 0, 1, 501},
		{"submenu", "account-statistics", "통계", 0, 1, 502},
		{"submenu", "account-permissions", "사용자 권한", 0, 1, 503},
		{"submenu", "account-menu", "메뉴 접근 권한", 0, 1, 504},

		{"menu", "ban", "캐릭터/제재", 0, 1, 600},
		{"submenu", "ban-characters", "캐릭터 목록", 0, 1, 601},
		{"submenu", "ban-sendmail", "우편 발송", 0, 1, 602},
		{"submenu", "ban-accountban", "계정 차단", 0, 1, 603},
		{"submenu", "ban-ipban", "IP 차단", 0, 1, 604},

		{"menu", "log", "로그 센터", 0, 1, 700},
		{"submenu", "log-action", "웹 관리자 활동", 0, 1, 701},
		{"submenu", "log-blackmarket", "암시장 거래", 0, 1, 702},
		{"submenu", "log-karazhan", "강화 로그", 0, 1, 703},
		{"submenu", "log-playtime", "접속 보상", 0, 1, 704},
		{"submenu", "log-mail", "우편 발송 기록", 0, 1, 705},

		{"menu", "content", "콘텐츠 데이터 관리", 0, 1, 800},
		{"submenu", "content-blackmarket", "암시장 품목 설정", 0, 1, 801},

		{"menu", "board", "게시판", 1, 1, 900},
		{"menu", "mypage", "마이페이지", 1, 1, 1000},
		{"menu", "board-admin", "게시판 관리 (CMS)", 0, 1, 1100},
	}

	for _, p := range data {
		_, err := db.Exec(`INSERT INTO web_role_permissions 
			(resource_type, resource_id, resource_name, rank_1, rank_2, rank_3, order_index) 
			VALUES (?, ?, ?, ?, ?, 1, ?)`,
			p.Type, p.ID, p.Name, p.Rank1, p.Rank2, p.Order)
		if err != nil {
			log.Printf("Failed to insert %s: %v", p.ID, err)
		} else {
			fmt.Printf("Inserted %s\n", p.ID)
		}
	}

	// 3. Update boards
	_, err = db.Exec("UPDATE web_role_permissions SET order_index = 5000 + id WHERE resource_type LIKE 'board_%'")
	if err != nil {
		fmt.Printf("Failed to update boards: %v\n", err)
	}

	fmt.Println("Reseed complete.")
}
