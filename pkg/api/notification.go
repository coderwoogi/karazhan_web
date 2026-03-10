package api

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"karazhan/pkg/services"

	_ "github.com/go-sql-driver/mysql"
)

type NotificationHandler struct {
	Service *services.NotificationService
}

func NewNotificationHandler(s *services.NotificationService) *NotificationHandler {
	return &NotificationHandler{Service: s}
}

// Helper to get UserID from session cookie
func getUserID(r *http.Request) (int, error) {
	cookie, err := r.Cookie("session_user")
	if err != nil || cookie.Value == "" {
		return 0, http.ErrNoCookie
	}
	username := cookie.Value

	// Resolving UserID from Auth DB
	dsn := "root:4618@tcp(localhost:3306)/acore_auth"
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return 0, err
	}
	defer db.Close()

	var id int
	err = db.QueryRow("SELECT id FROM account WHERE username = ?", username).Scan(&id)
	if err != nil {
		return 0, err
	}
	return id, nil
}

func getSenderDisplayName(updateDB *sql.DB, userID int, username string) string {
	var mainCharName string
	if updateDB != nil {
		_ = updateDB.QueryRow("SELECT IFNULL(main_char_name, '') FROM user_profiles WHERE user_id = ?", userID).Scan(&mainCharName)
	}
	if mainCharName != "" {
		return mainCharName
	}
	if username != "" {
		return username
	}
	return "시스템"
}

// GetNotifications returns a list of notifications for the logged-in user
func (h *NotificationHandler) GetList(w http.ResponseWriter, r *http.Request) {
	userID, err := getUserID(r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	limitStr := r.URL.Query().Get("limit")
	pageStr := r.URL.Query().Get("page")

	limit := 10 // default
	page := 1   // default

	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			limit = l
		}
	}
	if pageStr != "" {
		if p, err := strconv.Atoi(pageStr); err == nil && p > 0 {
			page = p
		}
	}

	offset := (page - 1) * limit
	onlyUnread := r.URL.Query().Get("only_unread") == "true"
	isDropdown := r.URL.Query().Get("dropdown") == "true"

	notifs, totalCount, err := h.Service.GetNotificationsPaginated(userID, limit, offset, onlyUnread, isDropdown)
	if err != nil {
		log.Printf("GetNotifications Error: %v", err)
		http.Error(w, "Failed to fetch notifications", http.StatusInternalServerError)
		return
	}

	unreadCount, _ := h.Service.GetUnreadCount(userID)

	totalPages := (totalCount + limit - 1) / limit

	json.NewEncoder(w).Encode(map[string]interface{}{
		"notifications": notifs,
		"unread_count":  unreadCount,
		"total":         totalCount,
		"total_pages":   totalPages,
		"page":          page,
	})
}

// MarkAsRead marks a specific notification as read
func (h *NotificationHandler) MarkRead(w http.ResponseWriter, r *http.Request) {
	userID, err := getUserID(r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		ID  int  `json:"id"`
		All bool `json:"all"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.All {
		err = h.Service.MarkAllAsRead(userID)
	} else {
		err = h.Service.MarkAsRead(req.ID, userID)
	}

	if err != nil {
		log.Printf("MarkRead Error: %v", err)
		http.Error(w, "Failed to mark as read", http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(map[string]string{"status": "success"})
}

// DeleteAll deletes all notifications for a specific user
func (h *NotificationHandler) DeleteAll(w http.ResponseWriter, r *http.Request) {
	userID, err := getUserID(r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	err = h.Service.DeleteAllNotifications(userID)
	if err != nil {
		log.Printf("DeleteAll Error: %v", err)
		http.Error(w, "Failed to delete notifications", http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(map[string]string{"status": "success"})
}

// ClearDropdown hides notifications for a specific user from the dropdown view only
func (h *NotificationHandler) ClearDropdown(w http.ResponseWriter, r *http.Request) {
	userID, err := getUserID(r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	err = h.Service.ClearDropdownNotifications(userID)
	if err != nil {
		log.Printf("ClearDropdown Error: %v", err)
		http.Error(w, "Failed to clear notifications from dropdown", http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(map[string]string{"status": "success"})
}

// DeleteSelected hides selected notifications for a specific user from the visible list (non-destructive)
func (h *NotificationHandler) DeleteSelected(w http.ResponseWriter, r *http.Request) {
	userID, err := getUserID(r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		IDs []int `json:"ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if len(req.IDs) == 0 {
		http.Error(w, "No notification ids provided", http.StatusBadRequest)
		return
	}

	err = h.Service.DeleteSelectedNotifications(userID, req.IDs)
	if err != nil {
		log.Printf("DeleteSelected Error: %v", err)
		http.Error(w, "Failed to delete selected notifications", http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(map[string]string{"status": "success"})
}

// SendNotification (Admin Only)
func (h *NotificationHandler) Send(w http.ResponseWriter, r *http.Request) {
	// Verify admin permission
	userID, err := getUserID(r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Check Admin Rank (Web Rank >= 2 or GM Level >= 3)
	// For simplicity, let's query Web Rank from Update DB
	dsn := "cpo5704:584579@tcp(121.148.127.135:3306)/update"
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		http.Error(w, "Database Error", http.StatusInternalServerError)
		return
	}
	defer db.Close()

	var webRank int
	err = db.QueryRow("SELECT web_rank FROM user_profiles WHERE user_id = ?", userID).Scan(&webRank)
	if err != nil || webRank < 2 {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	var req struct {
		TargetType    string `json:"target_type"`
		TargetUserID  int    `json:"target_user_id"`
		TargetUserIDs []int  `json:"target_user_ids"`
		TargetRank    int    `json:"target_rank"`
		Title         string `json:"title"`
		Message       string `json:"message"`
		Link          string `json:"link"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Message == "" {
		http.Error(w, "Message is required", http.StatusBadRequest)
		return
	}
	if req.TargetType == "user" && req.TargetUserID <= 0 && len(req.TargetUserIDs) == 0 {
		http.Error(w, "Target User ID is required", http.StatusBadRequest)
		return
	}

	username := ""
	if c, err := r.Cookie("session_user"); err == nil && c.Value != "" {
		username = c.Value
	}
	senderName := getSenderDisplayName(db, userID, username)

	// Dispatch based on target_type
	if req.TargetType == "user" {
		targetIDs := make([]int, 0, len(req.TargetUserIDs)+1)
		seen := make(map[int]bool)
		for _, id := range req.TargetUserIDs {
			if id > 0 && !seen[id] {
				seen[id] = true
				targetIDs = append(targetIDs, id)
			}
		}
		if req.TargetUserID > 0 && !seen[req.TargetUserID] {
			targetIDs = append(targetIDs, req.TargetUserID)
		}
		if len(targetIDs) == 0 {
			http.Error(w, "Target User ID is required", http.StatusBadRequest)
			return
		}
		for _, id := range targetIDs {
			if e := h.Service.CreateNotification(id, "admin_msg", req.Title, req.Message, req.Link, senderName); e != nil {
				err = e
				break
			}
		}
	} else if req.TargetType == "rank" {
		err = h.Service.CreateNotificationsByRank(req.TargetRank, "admin_msg", req.Title, req.Message, req.Link, senderName)
	} else if req.TargetType == "all" {
		err = h.Service.CreateNotificationsAll("admin_msg", req.Title, req.Message, req.Link, senderName)
	} else {
		// fallback for older client versions
		if req.TargetUserID > 0 {
			err = h.Service.CreateNotification(req.TargetUserID, "admin_msg", req.Title, req.Message, req.Link, senderName)
		} else {
			http.Error(w, "Invalid target type", http.StatusBadRequest)
			return
		}
	}

	if err != nil {
		http.Error(w, "Failed to send notification: "+err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(map[string]string{"status": "success"})
}
