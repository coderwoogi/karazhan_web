package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"karazhan/pkg/config"
	"log"
	"os"

	_ "github.com/go-sql-driver/mysql"
)

func main_dump_boards() {
	dsn := config.AuthDSN()
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	rows, err := db.Query("SELECT menu_id, min_web_rank FROM web_menu_permissions")
	if err != nil {
		log.Fatal(err)
	}
	defer rows.Close()

	results := make(map[string]interface{})
	var items []map[string]interface{}
	for rows.Next() {
		var id string
		var rank int
		rows.Scan(&id, &rank)
		items = append(items, map[string]interface{}{"id": id, "rank": rank})
	}

	results["menus"] = items
	out, _ := json.MarshalIndent(results, "", "  ")
	fmt.Println(string(out))
	os.WriteFile("web_menus_dump.json", out, 0644)
}
