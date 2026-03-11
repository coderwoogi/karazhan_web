package inspect

import (
	"database/sql"
	"fmt"
	"karazhan/pkg/config"
	"log"

	_ "github.com/go-sql-driver/mysql"
)

func Run() {
	dsn := config.AuthDSN()
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	inspectTable(db, "account")
	inspectTable(db, "account_access")
}

func inspectTable(db *sql.DB, tableName string) {
	fmt.Printf("\nTable: %s\n", tableName)
	rows, err := db.Query("DESCRIBE " + tableName)
	if err != nil {
		log.Printf("Error describing table %s: %v", tableName, err)
		return
	}
	defer rows.Close()

	var field, typ, null, key, def, extra sql.NullString
	for rows.Next() {
		err := rows.Scan(&field, &typ, &null, &key, &def, &extra)
		if err != nil {
			log.Fatal(err)
		}
		fmt.Printf("%s %s\n", field.String, typ.String)
	}
}
