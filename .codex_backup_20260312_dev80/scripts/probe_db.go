package main

import (
	"database/sql"
	"fmt"
	"karazhan/pkg/config"
	"log"

	_ "github.com/go-sql-driver/mysql"
)

func main_probe_db() {
	// 1. acore_auth
	db, err := sql.Open("mysql", config.AuthDSN())
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	fmt.Println("=== acore_auth.web_menu_permissions ===")
	rows, err := db.Query("SELECT * FROM web_menu_permissions")
	if err == nil {
		cols, _ := rows.Columns()
		fmt.Printf("Columns: %v\n", cols)
		for rows.Next() {
			var menu, gm, desc string
			rows.Scan(&menu, &gm, &desc)
			fmt.Printf("%-15s | %-5s | %s\n", menu, gm, desc)
		}
		rows.Close()
	} else {
		fmt.Printf("Error: %v\n", err)
	}

	// 2. update
	db2, err := sql.Open("mysql", config.UpdateDSN())
	if err != nil {
		log.Fatal(err)
	}
	defer db2.Close()

	fmt.Println("\n=== update.user_profiles Schema ===")
	rows2, err := db2.Query("DESCRIBE user_profiles")
	if err == nil {
		for rows2.Next() {
			var field, typ, null, key, def, extra sql.NullString
			rows2.Scan(&field, &typ, &null, &key, &def, &extra)
			fmt.Printf("%-15s | %-15s | %-5s | %s\n", field.String, typ.String, null.String, def.String)
		}
		rows2.Close()
	} else {
		fmt.Printf("Error: %v\n", err)
	}
}
