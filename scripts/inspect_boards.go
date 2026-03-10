package main

import (
	"database/sql"
	"fmt"

	_ "github.com/go-sql-driver/mysql"
)

func main_inspect_boards() {
	db, err := sql.Open("mysql", "cpo5704:584579@tcp(121.148.127.135:3306)/update")
	if err != nil {
		panic(err)
	}
	defer db.Close()

	rows, err := db.Query("SELECT id, name, min_web_read, type FROM web_boards")
	if err != nil {
		panic(err)
	}
	defer rows.Close()

	fmt.Println("ID | Name | ReadLevel | Type")
	fmt.Println("---|---|---|---")
	for rows.Next() {
		var id, name, bType string
		var readLevel int
		rows.Scan(&id, &name, &readLevel, &bType)
		fmt.Printf("%s | %s | %d | %s\n", id, name, readLevel, bType)
	}
}
