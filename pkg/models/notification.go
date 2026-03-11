package models

// Notification represents a system alert for a user
type Notification struct {
	ID         int    `json:"id"`
	UserID     int    `json:"user_id"`
	Type       string `json:"type"` // e.g. 'info', 'warning', 'success', 'comment', 'point'
	SenderName string `json:"sender_name,omitempty"`
	Title      string `json:"title"`
	Message    string `json:"message"`
	Link       string `json:"link,omitempty"`
	IsRead     bool   `json:"is_read"`
	CreatedAt  string `json:"created_at"`
}
