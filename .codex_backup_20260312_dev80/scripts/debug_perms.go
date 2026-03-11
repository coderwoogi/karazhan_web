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

type RolePermission struct {
	ID           int    `json:"id"`
	ResourceType string `json:"resource_type"`
	ResourceID   string `json:"resource_id"`
	ResourceName string `json:"resource_name"`
	OrderIndex   int    `json:"order_index"`
}

func main() {
	dsn := config.UpdateDSN()
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	rows, err := db.Query("SELECT id, resource_type, resource_id, resource_name, order_index FROM web_role_permissions")
	if err != nil {
		log.Fatal(err)
	}
	defer rows.Close()

	var perms []RolePermission
	for rows.Next() {
		var p RolePermission
		if err := rows.Scan(&p.ID, &p.ResourceType, &p.ResourceID, &p.ResourceName, &p.OrderIndex); err != nil {
			log.Fatal(err)
		}
		perms = append(perms, p)
	}

	data, _ := json.MarshalIndent(perms, "", "  ")
	err = os.WriteFile("perms_debug.json", data, 0644)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println("Dumped 42 permissions to perms_debug.json")
}
