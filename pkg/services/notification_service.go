package services

import (
	"database/sql"
	"fmt"
	"karazhan/pkg/models"
	"strings"
)

// NotificationService handles notification logic
type NotificationService struct {
	DB *sql.DB
}

func NewNotificationService(db *sql.DB) *NotificationService {
	return &NotificationService{DB: db}
}

// CreateNotification inserts a new notification
func (s *NotificationService) CreateNotification(userID int, nType, title, message, link, senderName string) error {
	query := `INSERT INTO notifications (user_id, type, title, message, link, sender_name) VALUES (?, ?, ?, ?, ?, ?)`
	_, err := s.DB.Exec(query, userID, nType, title, message, link, senderName)
	if err != nil {
		return fmt.Errorf("failed to create notification: %v", err)
	}
	return nil
}

// CreateNotificationsByRank inserts notifications for a specific web rank
func (s *NotificationService) CreateNotificationsByRank(rank int, nType, title, message, link, senderName string) error {
	var query string
	var args []interface{}

	if rank == 3 {
		// All GM/Admin (Rank >= 1)
		query = "SELECT user_id FROM user_profiles WHERE web_rank >= 1"
	} else {
		query = "SELECT user_id FROM user_profiles WHERE web_rank = ?"
		args = append(args, rank)
	}

	rows, err := s.DB.Query(query, args...)
	if err != nil {
		return err
	}
	defer rows.Close()

	var userIDs []int
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err == nil {
			userIDs = append(userIDs, id)
		}
	}

	return s.bulkInsertNotifications(userIDs, nType, title, message, link, senderName)
}

// CreateNotificationsAll inserts notifications for all registered accounts
func (s *NotificationService) CreateNotificationsAll(nType, title, message, link, senderName string) error {
	dsn := "root:4618@tcp(localhost:3306)/acore_auth"
	authDB, err := sql.Open("mysql", dsn)
	if err != nil {
		return err
	}
	defer authDB.Close()

	rows, err := authDB.Query("SELECT id FROM account")
	if err != nil {
		return err
	}
	defer rows.Close()

	var userIDs []int
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err == nil {
			userIDs = append(userIDs, id)
		}
	}

	return s.bulkInsertNotifications(userIDs, nType, title, message, link, senderName)
}

func (s *NotificationService) bulkInsertNotifications(userIDs []int, nType, title, message, link, senderName string) error {
	if len(userIDs) == 0 {
		return nil
	}

	batchSize := 500
	for i := 0; i < len(userIDs); i += batchSize {
		end := i + batchSize
		if end > len(userIDs) {
			end = len(userIDs)
		}
		batch := userIDs[i:end]

		query := "INSERT INTO notifications (user_id, type, title, message, link, sender_name) VALUES "
		var vals []interface{}
		for j, uid := range batch {
			if j > 0 {
				query += ", "
			}
			query += "(?, ?, ?, ?, ?, ?)"
			vals = append(vals, uid, nType, title, message, link, senderName)
		}

		_, err := s.DB.Exec(query, vals...)
		if err != nil {
			return fmt.Errorf("bulk insert error: %v", err)
		}
	}
	return nil
}

// GetUnreadCount returns the number of unread notifications for a user
func (s *NotificationService) GetUnreadCount(userID int) (int, error) {
	var count int
	query := `SELECT COUNT(*) FROM notifications 
		WHERE user_id = ? 
		AND is_read = 0 
		AND (is_hidden = 0 OR is_hidden IS NULL)
		AND (is_cleared = 0 OR is_cleared IS NULL)`
	err := s.DB.QueryRow(query, userID).Scan(&count)
	if err != nil {
		return 0, err
	}
	return count, nil
}

// GetNotifications returns a list of notifications for a user (deprecated: use Paginated version)
func (s *NotificationService) GetNotifications(userID int, limit int, onlyUnread bool) ([]models.Notification, error) {
	notifs, _, err := s.GetNotificationsPaginated(userID, limit, 0, onlyUnread, false)
	return notifs, err
}

// GetNotificationsPaginated returns a paginated list of notifications and the total count
func (s *NotificationService) GetNotificationsPaginated(userID int, limit int, offset int, onlyUnread bool, excludeCleared bool) ([]models.Notification, int, error) {
	// Ensure is_cleared column exists (safe to run multiple times with IF NOT EXISTS if using MariaDB, but MySQL 8 doesn't support IF NOT EXISTS for columns in ALTER TABLE directly except via procedure.
	// For simplicity in Go, we can just execute the alter ignore or check if column exists.
	// A safe way is to just let the query fail if the column is truly missing and log it, or run a schema migration on startup.
	// Since we are modifying the query, let's assume the column exists or we create it during RegisterRoutes.

	// First get total count
	countQuery := `SELECT COUNT(*) FROM notifications WHERE user_id = ? AND (is_hidden = 0 OR is_hidden IS NULL)`
	countArgs := []interface{}{userID}

	if onlyUnread {
		countQuery += ` AND is_read = 0`
	}
	if excludeCleared {
		countQuery += ` AND is_cleared = 0`
	}

	var total int
	err := s.DB.QueryRow(countQuery, countArgs...).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	// Then get paginated data
	query := `SELECT id, user_id, type, sender_name, title, message, link, is_read, created_at FROM notifications WHERE user_id = ? AND (is_hidden = 0 OR is_hidden IS NULL)`
	args := []interface{}{userID}

	if onlyUnread {
		query += ` AND is_read = 0`
	}
	if excludeCleared {
		query += ` AND is_cleared = 0`
	}

	query += ` ORDER BY created_at DESC`

	if limit > 0 {
		query += ` LIMIT ? OFFSET ?`
		args = append(args, limit, offset)
	}

	rows, err := s.DB.Query(query, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var notifications []models.Notification
	for rows.Next() {
		var n models.Notification
		var link sql.NullString
		var senderName sql.NullString
		var isRead int

		err := rows.Scan(&n.ID, &n.UserID, &n.Type, &senderName, &n.Title, &n.Message, &link, &isRead, &n.CreatedAt)
		if err != nil {
			return nil, 0, err
		}

		if link.Valid {
			n.Link = link.String
		}
		if senderName.Valid {
			n.SenderName = senderName.String
		}
		n.IsRead = isRead == 1
		notifications = append(notifications, n)
	}
	return notifications, total, nil
}

// MarkAsRead marks a notification as read
func (s *NotificationService) MarkAsRead(notifID int, userID int) error {
	query := `UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`
	_, err := s.DB.Exec(query, notifID, userID)
	return err
}

// MarkAllAsRead marks all notifications as read for a user
func (s *NotificationService) MarkAllAsRead(userID int) error {
	query := `UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0`
	_, err := s.DB.Exec(query, userID)
	return err
}

// DeleteAllNotifications hides all notifications for a user from the visible list (non-destructive)
func (s *NotificationService) DeleteAllNotifications(userID int) error {
	query := `UPDATE notifications SET is_hidden = 1 WHERE user_id = ?`
	_, err := s.DB.Exec(query, userID)
	return err
}

// ClearDropdownNotifications hides notifications from the dropdown view only
func (s *NotificationService) ClearDropdownNotifications(userID int) error {
	query := `UPDATE notifications SET is_cleared = 1 WHERE user_id = ?`
	_, err := s.DB.Exec(query, userID)
	return err
}

// DeleteSelectedNotifications hides selected notifications for a user from the visible list (non-destructive)
func (s *NotificationService) DeleteSelectedNotifications(userID int, ids []int) error {
	if len(ids) == 0 {
		return nil
	}

	placeholders := make([]string, len(ids))
	args := make([]interface{}, 0, len(ids)+1)
	args = append(args, userID)
	for i, id := range ids {
		placeholders[i] = "?"
		args = append(args, id)
	}

	query := `UPDATE notifications SET is_hidden = 1 WHERE user_id = ? AND id IN (` + strings.Join(placeholders, ",") + `)`
	_, err := s.DB.Exec(query, args...)
	return err
}
