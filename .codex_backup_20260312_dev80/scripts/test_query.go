package main

import (
	"database/sql"
	"fmt"
	"karazhan/pkg/config"
	"log"

	_ "github.com/go-sql-driver/mysql"
)

func main_test_query() {
	authDSN := config.AuthDSN()
	authDB, err := sql.Open("mysql", authDSN)
	if err != nil {
		log.Fatalf("Open Error: %v", err)
	}
	defer authDB.Close()

	err = authDB.Ping()
	if err != nil {
		log.Fatalf("Ping Error: %v", err)
	}
	fmt.Println("Ping Success")

	rows, err := authDB.Query("SELECT menu_id, min_web_rank, description FROM web_menu_permissions")
	if err != nil {
		log.Fatalf("Query Error: %v", err)
	}
	defer rows.Close()

	fmt.Println("Query Success")
	for rows.Next() {
		var menuID, description string
		var minWebRank int
		if err := rows.Scan(&menuID, &minWebRank, &description); err != nil {
			log.Printf("Scan Error: %v", err)
			continue
		}
		fmt.Printf("Menu: %s, Rank: %d\n", menuID, minWebRank)
	}
}
