package notification

import (
	"database/sql"
	"net/http"
	"time"

	"karazhan/pkg/api"
	"karazhan/pkg/services"

	_ "github.com/go-sql-driver/mysql"
)

var (
	DB                  *sql.DB
	NotificationService *services.NotificationService
	Handler             *api.NotificationHandler
)

func RegisterRoutes(mux *http.ServeMux) {
	// Initialize DB connection
	// In production, this should share the main DB pool, but for now we create a new one to follow module pattern
	dsn := "cpo5704:584579@tcp(121.148.127.135:3306)/update"
	var err error
	DB, err = sql.Open("mysql", dsn)
	if err != nil {
		// Log error but don't panic to avoid crashing main app if just this module fails
		// In a real app we'd probably want to handle this better
		return
	}

	DB.SetMaxOpenConns(10)
	DB.SetMaxIdleConns(5)
	DB.SetConnMaxLifetime(time.Minute * 5)

	// Schema Migration: Ensure is_cleared column exists for soft deletion from dropdown view
	// Using a simple check to see if we need to add the column, as IF NOT EXISTS on columns is MariaDB specific and not standard MySQL 8
	_, _ = DB.Exec("ALTER TABLE notifications ADD COLUMN is_cleared TINYINT(1) DEFAULT 0")
	_, _ = DB.Exec("ALTER TABLE notifications ADD COLUMN is_hidden TINYINT(1) DEFAULT 0")
	_, _ = DB.Exec("ALTER TABLE notifications ADD COLUMN sender_name VARCHAR(100) NULL")

	NotificationService = services.NewNotificationService(DB)
	Handler = api.NewNotificationHandler(NotificationService)

	mux.HandleFunc("/api/notifications/list", Handler.GetList)
	mux.HandleFunc("/api/notifications/read", Handler.MarkRead)
	mux.HandleFunc("/api/notifications/delete-all", Handler.DeleteAll)
	mux.HandleFunc("/api/notifications/delete-selected", Handler.DeleteSelected)
	mux.HandleFunc("/api/notifications/clear-dropdown", Handler.ClearDropdown)
	mux.HandleFunc("/api/admin/notifications/send", Handler.Send)
}
