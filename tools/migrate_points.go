package main

import (
	"database/sql"
	"fmt"
	"log"

	_ "github.com/go-sql-driver/mysql"
)

func main() {
	// Connect to 'update' database
	dsn := "cpo5704:584579@tcp(121.148.127.135:3306)/update"
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		log.Fatalf("Failed to connect to DB: %v", err)
	}
	defer db.Close()

	// Verify connection
	if err := db.Ping(); err != nil {
		log.Fatalf("Failed to ping DB: %v", err)
	}

	queries := []string{
		`CREATE TABLE IF NOT EXISTS user_points (
			user_id INT PRIMARY KEY,
			points INT NOT NULL DEFAULT 0,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS user_point_logs (
			id INT AUTO_INCREMENT PRIMARY KEY,
			user_id INT NOT NULL,
			amount INT NOT NULL,
			reason VARCHAR(255),
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			INDEX idx_user_id (user_id)
		)`,
	}

	for _, query := range queries {
		_, err := db.Exec(query)
		if err != nil {
			log.Printf("Failed to execute query: %s\nError: %v", query, err)
		} else {
			fmt.Println("Successfully executed query.")
		}
	}

	fmt.Println("Migration completed.")
}
