package main

import (
	"database/sql"
	"fmt"

	_ "github.com/go-sql-driver/mysql"
)

func main() {
	db, err := sql.Open("mysql", "cpo5704:584579@tcp(121.148.127.135:3306)/update")
	if err != nil {
		panic(err)
	}
	defer db.Close()

	// Direct query for permissions
	rows, err := db.Query("SELECT resource_id, resource_name, resource_type, order_index FROM web_role_permissions ORDER BY order_index ASC")
	if err != nil {
		panic(err)
	}
	defer rows.Close()

	fmt.Println("Resource ID | Name | Type | Order")
	fmt.Println("---|---|---|---|")
	for rows.Next() {
		var id, name, typ string
		var order int
		if err := rows.Scan(&id, &name, &typ, &order); err != nil {
			panic(err)
		}
		fmt.Printf("%s | %s | %s | %d\n", id, name, typ, order)
	}
}
