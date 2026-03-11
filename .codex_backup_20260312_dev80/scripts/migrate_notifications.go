package main

import (
	"database/sql"
	"fmt"
	"karazhan/pkg/config"
	"log"
	"time"

	_ "github.com/go-sql-driver/mysql"
)

func main() {
	// Database connection (adjust credentials as per query_db.go)
	dsn := config.UpdateDSN()
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		log.Fatalf("Error connecting to database: %v", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		log.Fatalf("Error pinging database: %v", err)
	}
	fmt.Println("Connected to database successfully.")

	// 1. Create notifications table
	createTableQuery := `
	CREATE TABLE IF NOT EXISTS notifications (
		id INT AUTO_INCREMENT PRIMARY KEY,
		user_id INT NOT NULL COMMENT 'Recipient User ID',
		type VARCHAR(50) NOT NULL COMMENT 'alert, comment, point, admin_msg, etc.',
		title VARCHAR(255) DEFAULT NULL,
		message TEXT NOT NULL,
		link VARCHAR(255) DEFAULT NULL COMMENT 'URL to redirect on click',
		is_read TINYINT(1) DEFAULT 0,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		INDEX idx_user_read (user_id, is_read)
	) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
	`

	_, err = db.Exec(createTableQuery)
	if err != nil {
		log.Fatalf("Error creating notifications table: %v", err)
	}
	fmt.Println("Table 'notifications' created or already exists.")

	// 2. Add 'notification' menu permission
	// resource_type='menu', resource_id='notification', resource_name='알림'
	// order_index: 99 (End of the list?), Or maybe specific place.
	// Rank defaults: All 1 (Available to everyone)

	permsQuery := `
	INSERT IGNORE INTO web_role_permissions 
	(resource_type, resource_id, resource_name, rank_0, rank_1, rank_2, rank_3, order_index)
	VALUES 
	('menu', 'notification', '알림', 1, 1, 1, 1, 99);
	`

	res, err := db.Exec(permsQuery)
	if err != nil {
		log.Fatalf("Error inserting permission: %v", err)
	}

	rowsAffected, _ := res.RowsAffected()
	if rowsAffected > 0 {
		fmt.Println("Inserted 'notification' menu permission.")
	} else {
		fmt.Println("'notification' menu permission already exists.")
	}

	time.Sleep(1 * time.Second)
	fmt.Println("Migration completed successfully.")
}
