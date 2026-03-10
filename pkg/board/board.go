package board

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"karazhan/pkg/services"
	"karazhan/pkg/stats"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	_ "github.com/go-sql-driver/mysql"
	"golang.org/x/net/html/charset"
)

// nextVersion increments the patch number of a semver string (e.g. "1.0.3" -> "1.0.4").
// If the version string is not parseable, it returns "1.0.1".
func nextVersion(current string) string {
	parts := strings.Split(current, ".")
	if len(parts) != 3 {
		return "1.0.1"
	}
	patch, err := strconv.Atoi(parts[2])
	if err != nil {
		return "1.0.1"
	}
	return fmt.Sprintf("%s.%s.%d", parts[0], parts[1], patch+1)
}

// getLatestVersion returns the latest version string for a board, or "" if none.
func getLatestVersion(db *sql.DB, boardID string) string {
	var ver string
	err := db.QueryRow(
		"SELECT IFNULL(version,'') FROM web_posts WHERE board_id = ? AND version IS NOT NULL AND version != '' ORDER BY display_number DESC LIMIT 1",
		boardID,
	).Scan(&ver)
	if err != nil {
		return ""
	}
	return ver
}

// extractFirstImageSrc extracts the src of the first <img> tag from HTML content
func extractFirstImageSrc(html string) string {
	re := regexp.MustCompile(`<img[^>]+src=["']([^"'>]+)["']`)
	matches := re.FindStringSubmatch(html)
	if len(matches) > 1 {
		return matches[1]
	}
	return ""
}

type Post struct {
	ID               int      `json:"id"`
	BoardID          string   `json:"board_id"`
	AccountID        int      `json:"account_id"`
	AuthorName       string   `json:"author_name"`
	IsStaffAuthor    bool     `json:"is_staff_author"`
	HasEnhancedStone bool     `json:"has_enhanced_stone"`
	Title            string   `json:"title"`
	Category         string   `json:"category"`
	InquiryStatus    string   `json:"inquiry_status"`
	InquiryMemo      string   `json:"inquiry_memo"`
	Version          string   `json:"version"`
	Content          string   `json:"content"`
	Views            int      `json:"views"`
	DisplayNumber    int      `json:"display_number"`
	CreatedAt        string   `json:"created_at"`
	UpdatedAt        string   `json:"updated_at"`
	PromotionURLs    []string `json:"promotion_urls,omitempty"`
}

type Comment struct {
	ID               int    `json:"id"`
	PostID           int    `json:"post_id"`
	AccountID        int    `json:"account_id"`
	AuthorName       string `json:"author_name"`
	IsStaffAuthor    bool   `json:"is_staff_author"`
	HasEnhancedStone bool   `json:"has_enhanced_stone"`
	Role             string `json:"role"`
	Content          string `json:"content"`
	ParentID         *int   `json:"parent_id"` // For nested comments
	Depth            int    `json:"depth"`     // Nesting depth
	CreatedAt        string `json:"created_at"`
}

type Board struct {
	ID                  string `json:"id"`
	Name                string `json:"name"`
	MinWebRead          int    `json:"min_web_read"`
	MinWebWrite         int    `json:"min_web_write"`
	AllowAttachments    bool   `json:"allow_attachments"`
	AllowRichEditor     bool   `json:"allow_rich_editor"`
	AllowEmoji          bool   `json:"allow_emoji"`
	AllowNestedComments bool   `json:"allow_nested_comments"`
	Type                string `json:"type"` // normal, gallery, update
	SortOrder           int    `json:"sort_order"`
}

type Attachment struct {
	ID               int    `json:"id"`
	PostID           *int   `json:"post_id"`
	CommentID        *int   `json:"comment_id"`
	Filename         string `json:"filename"`
	OriginalFilename string `json:"original_filename"`
	FilePath         string `json:"file_path"`
	FileSize         int    `json:"file_size"`
	MimeType         string `json:"mime_type"`
	UploadedBy       int    `json:"uploaded_by"`
	CreatedAt        string `json:"created_at"`
}

const updateDSN = "cpo5704:584579@tcp(121.148.127.135:3306)/update?charset=utf8mb4&parseTime=true&loc=Local"
const authDSN = "root:4618@tcp(localhost:3306)/acore_auth?charset=utf8mb4&parseTime=true&loc=Local"

var boardSchemaInitOnce sync.Once

func ensureBoardSchema(db *sql.DB) {
	boardSchemaInitOnce.Do(func() {
		_, _ = db.Exec(`CREATE TABLE IF NOT EXISTS web_boards (
			id VARCHAR(50) PRIMARY KEY,
			name VARCHAR(100) NOT NULL,
			min_gm_read INT DEFAULT 0,
			min_gm_write INT DEFAULT 0,
			min_web_read INT DEFAULT 0,
			min_web_write INT DEFAULT 0,
			allow_attachments TINYINT(1) DEFAULT 1,
			allow_rich_editor TINYINT(1) DEFAULT 1,
			allow_emoji TINYINT(1) DEFAULT 1,
			allow_nested_comments TINYINT(1) DEFAULT 1,
			type VARCHAR(20) DEFAULT 'normal',
			sort_order INT DEFAULT 0,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)

		_, _ = db.Exec(`CREATE TABLE IF NOT EXISTS web_posts (
			id INT AUTO_INCREMENT PRIMARY KEY,
			board_id VARCHAR(50) NOT NULL,
			account_id INT NOT NULL,
			author_name VARCHAR(100) NOT NULL,
			title VARCHAR(255) NOT NULL,
			category VARCHAR(30) DEFAULT '',
			inquiry_status VARCHAR(20) DEFAULT '',
			inquiry_memo TEXT,
			version VARCHAR(32) DEFAULT NULL,
			content LONGTEXT,
			views INT DEFAULT 0,
			display_number BIGINT DEFAULT 0,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			INDEX (board_id)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
		_, _ = db.Exec(`CREATE TABLE IF NOT EXISTS web_inquiry_messages (
			id INT AUTO_INCREMENT PRIMARY KEY,
			post_id INT NOT NULL,
			account_id INT NOT NULL,
			author_name VARCHAR(100) NOT NULL,
			role VARCHAR(20) NOT NULL DEFAULT 'user',
			content LONGTEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			INDEX idx_post_id (post_id),
			INDEX idx_account_id (account_id)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
		_, _ = db.Exec(`CREATE TABLE IF NOT EXISTS web_promotion_links (
			id INT AUTO_INCREMENT PRIMARY KEY,
			post_id INT NOT NULL,
			url VARCHAR(1000) NOT NULL,
			order_index INT NOT NULL DEFAULT 0,
			verify_ok TINYINT(1) DEFAULT 0,
			verify_message VARCHAR(255) DEFAULT '',
			checked_at DATETIME NULL,
			review_status VARCHAR(20) DEFAULT 'pending',
			review_at DATETIME NULL,
			review_by INT DEFAULT 0,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			INDEX idx_post_id (post_id)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
		_, _ = db.Exec(`CREATE TABLE IF NOT EXISTS web_promotion_reward_config (
			id TINYINT PRIMARY KEY,
			item_entry INT NOT NULL DEFAULT 0,
			item_count INT NOT NULL DEFAULT 1,
			mail_subject VARCHAR(200) NOT NULL DEFAULT '???쒓텠 ?롪퍓?????곌랜?삥묾?,
			mail_body TEXT,
			updated_by INT NOT NULL DEFAULT 0,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
		_, _ = db.Exec(`CREATE TABLE IF NOT EXISTS web_promotion_reward_log (
			id INT AUTO_INCREMENT PRIMARY KEY,
			post_id INT NOT NULL,
			account_id INT NOT NULL,
			receiver_name VARCHAR(120) NOT NULL,
			item_entry INT NOT NULL,
			item_count INT NOT NULL,
			paid_by INT NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			UNIQUE KEY uniq_post_id (post_id)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
		_, _ = db.Exec(`CREATE TABLE IF NOT EXISTS web_promotion_verify_config (
			id TINYINT PRIMARY KEY,
			required_text VARCHAR(255) NOT NULL DEFAULT '',
			required_image VARCHAR(1000) NOT NULL DEFAULT '',
			updated_by INT NOT NULL DEFAULT 0,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)

		_, _ = db.Exec("ALTER TABLE web_boards ADD COLUMN min_web_read INT DEFAULT 0")
		_, _ = db.Exec("ALTER TABLE web_boards ADD COLUMN min_web_write INT DEFAULT 0")
		_, _ = db.Exec("ALTER TABLE web_boards ADD COLUMN allow_attachments TINYINT(1) DEFAULT 1")
		_, _ = db.Exec("ALTER TABLE web_boards ADD COLUMN allow_rich_editor TINYINT(1) DEFAULT 1")
		_, _ = db.Exec("ALTER TABLE web_boards ADD COLUMN allow_emoji TINYINT(1) DEFAULT 1")
		_, _ = db.Exec("ALTER TABLE web_boards ADD COLUMN allow_nested_comments TINYINT(1) DEFAULT 1")
		_, _ = db.Exec("ALTER TABLE web_boards ADD COLUMN type VARCHAR(20) DEFAULT 'normal'")
		_, _ = db.Exec("ALTER TABLE web_boards ADD COLUMN sort_order INT DEFAULT 0")
		_, _ = db.Exec("ALTER TABLE web_posts ADD COLUMN version VARCHAR(32) DEFAULT NULL")
		_, _ = db.Exec("ALTER TABLE web_posts ADD COLUMN category VARCHAR(30) DEFAULT ''")
		_, _ = db.Exec("ALTER TABLE web_posts ADD COLUMN inquiry_status VARCHAR(20) DEFAULT ''")
		_, _ = db.Exec("ALTER TABLE web_posts ADD COLUMN inquiry_memo TEXT")
		_, _ = db.Exec("ALTER TABLE web_posts DROP COLUMN inquiry_target")
		_, _ = db.Exec("ALTER TABLE web_posts ADD COLUMN display_number BIGINT DEFAULT 0")
		_, _ = db.Exec("ALTER TABLE web_posts ADD COLUMN promo_verify_ok TINYINT(1) DEFAULT 0")
		_, _ = db.Exec("ALTER TABLE web_posts ADD COLUMN promo_verify_message VARCHAR(255) DEFAULT ''")
		_, _ = db.Exec("ALTER TABLE web_posts ADD COLUMN promo_checked_at DATETIME NULL")
		_, _ = db.Exec("ALTER TABLE web_posts ADD COLUMN promo_review_status VARCHAR(20) DEFAULT 'pending'")
		_, _ = db.Exec("ALTER TABLE web_posts ADD COLUMN promo_review_at DATETIME NULL")
		_, _ = db.Exec("ALTER TABLE web_posts ADD COLUMN promo_review_by INT DEFAULT 0")
		_, _ = db.Exec("ALTER TABLE web_promotion_verify_config MODIFY COLUMN required_text TEXT NOT NULL")
		_, _ = db.Exec("ALTER TABLE web_promotion_links ADD COLUMN verify_ok TINYINT(1) DEFAULT 0")
		_, _ = db.Exec("ALTER TABLE web_promotion_links ADD COLUMN verify_message VARCHAR(255) DEFAULT ''")
		_, _ = db.Exec("ALTER TABLE web_promotion_links ADD COLUMN checked_at DATETIME NULL")
		_, _ = db.Exec("ALTER TABLE web_promotion_links ADD COLUMN review_status VARCHAR(20) DEFAULT 'pending'")
		_, _ = db.Exec("ALTER TABLE web_promotion_links ADD COLUMN review_at DATETIME NULL")
		_, _ = db.Exec("ALTER TABLE web_promotion_links ADD COLUMN review_by INT DEFAULT 0")

		_, _ = db.Exec("UPDATE web_boards SET min_web_read = IFNULL(min_gm_read, 0) WHERE min_web_read = 0")
		_, _ = db.Exec("UPDATE web_boards SET min_web_write = IFNULL(min_gm_write, 0) WHERE min_web_write = 0")
		_, _ = db.Exec("UPDATE web_boards SET type = 'normal' WHERE type IS NULL OR type = ''")
		_, _ = db.Exec("UPDATE web_posts SET display_number = id WHERE display_number IS NULL OR display_number = 0")
		_, _ = db.Exec("UPDATE web_posts SET inquiry_status='received' WHERE board_id='inquiry' AND (inquiry_status IS NULL OR inquiry_status='')")
		_, _ = db.Exec("INSERT IGNORE INTO web_boards (id, name, min_web_read, min_web_write, allow_attachments, allow_rich_editor, allow_emoji, allow_nested_comments, type, sort_order) VALUES ('inquiry', CONVERT(0xEBACB8EC9D98EAB28CEC8B9CED8C90 USING utf8mb4), 0, 0, 1, 1, 1, 1, 'normal', 14)")
		_, _ = db.Exec("UPDATE web_boards SET name = CONVERT(0xEBACB8EC9D98EAB28CEC8B9CED8C90 USING utf8mb4) WHERE id='inquiry'")
		_, _ = db.Exec("INSERT IGNORE INTO web_role_permissions (resource_type, resource_id, resource_name, rank_1, rank_2, rank_3, order_index) VALUES ('board_read', 'inquiry', CONVERT(0xEBACB8EC9D98EAB28CEC8B9CED8C902028EC9DBDEAB8B029 USING utf8mb4), 1, 1, 1, 14)")
		_, _ = db.Exec("INSERT IGNORE INTO web_role_permissions (resource_type, resource_id, resource_name, rank_1, rank_2, rank_3, order_index) VALUES ('board_write', 'inquiry', CONVERT(0xEBACB8EC9D98EAB28CEC8B9CED8C902028EC9390EAB8B029 USING utf8mb4), 1, 1, 1, 14)")
		_, _ = db.Exec("UPDATE web_role_permissions SET resource_name = CONVERT(0xEBACB8EC9D98EAB28CEC8B9CED8C902028EC9DBDEAB8B029 USING utf8mb4) WHERE resource_type='board_read' AND resource_id='inquiry'")
		_, _ = db.Exec("UPDATE web_role_permissions SET resource_name = CONVERT(0xEBACB8EC9D98EAB28CEC8B9CED8C902028EC9390EAB8B029 USING utf8mb4) WHERE resource_type='board_write' AND resource_id='inquiry'")
		_, _ = db.Exec("INSERT IGNORE INTO web_boards (id, name, min_web_read, min_web_write, allow_attachments, allow_rich_editor, allow_emoji, allow_nested_comments, type, sort_order) VALUES ('promotion', CONVERT(0xED998DEB3CEAB28CEC8B9CED8C90 USING utf8mb4), 0, 0, 0, 0, 0, 0, 'normal', 15)")
		_, _ = db.Exec("UPDATE web_boards SET name = CONVERT(0xED998DEB3CEAB28CEC8B9CED8C90 USING utf8mb4), allow_attachments=0, allow_rich_editor=0, allow_emoji=0, allow_nested_comments=0 WHERE id='promotion'")
		_, _ = db.Exec("INSERT IGNORE INTO web_role_permissions (resource_type, resource_id, resource_name, rank_1, rank_2, rank_3, order_index) VALUES ('board_read', 'promotion', CONVERT(0xED998DEB3CEAB28CEC8B9CED8C902028EC9DBDEAB8B029 USING utf8mb4), 1, 1, 1, 15)")
		_, _ = db.Exec("INSERT IGNORE INTO web_role_permissions (resource_type, resource_id, resource_name, rank_1, rank_2, rank_3, order_index) VALUES ('board_write', 'promotion', CONVERT(0xED998DEB3CEAB28CEC8B9CED8C902028EC9390EAB8B029 USING utf8mb4), 1, 1, 1, 15)")
		_, _ = db.Exec("UPDATE web_role_permissions SET resource_name = CONVERT(0xED998DEB3CEAB28CEC8B9CED8C902028EC9DBDEAB8B029 USING utf8mb4) WHERE resource_type='board_read' AND resource_id='promotion'")
		_, _ = db.Exec("UPDATE web_role_permissions SET resource_name = CONVERT(0xED998DEB3CEAB28CEC8B9CED8C902028EC9390EAB8B029 USING utf8mb4) WHERE resource_type='board_write' AND resource_id='promotion'")
		_, _ = db.Exec("INSERT IGNORE INTO web_promotion_reward_config (id, item_entry, item_count, mail_subject, mail_body, updated_by) VALUES (1, 0, 1, CONVERT(0xED998DEB3C20EAB28CEC8B9CEAB880EC8381 USING utf8mb4), CONVERT(0xED998DEB3C20ED999CEC9EB920EBB3B4EC8381EC9DB42020ECA780EAB889EB9098EC9788EC8AB5EB8B88EB8BA42E USING utf8mb4), 0)")
		_, _ = db.Exec("INSERT IGNORE INTO web_promotion_verify_config (id, required_text, required_image, updated_by) VALUES (1, '', '', 0)")
	})
}

func isInquiryBoard(boardID string) bool {
	return strings.EqualFold(strings.TrimSpace(boardID), "inquiry")
}

func isPromotionBoard(boardID string) bool {
	return strings.EqualFold(strings.TrimSpace(boardID), "promotion")
}

func isStaffUser(user userInfo) bool {
	return user.WebRank >= 1 || user.GMLevel > 0
}

func normalizeInquiryCategory(value string) string {
	switch strings.TrimSpace(value) {
	case "\uac74\uc758":
		return "\uac74\uc758"
	case "\uc9c8\ubb38":
		return "\uc9c8\ubb38"
	case "\ud6c4\uc6d0":
		return "\ud6c4\uc6d0"
	case "\uae30\ud0c0":
		return "\uae30\ud0c0"
	default:
		return ""
	}
}
func normalizeInquiryStatus(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "received":
		return "received"
	case "in_progress":
		return "in_progress"
	case "done":
		return "done"
	case "point_paid":
		return "point_paid"
	default:
		return ""
	}
}

func getBoardMinRead(db *sql.DB, boardID string) (int, error) {
	var minRead int
	err := db.QueryRow("SELECT min_web_read FROM web_boards WHERE id = ?", boardID).Scan(&minRead)
	if err == nil {
		return minRead, nil
	}
	err = db.QueryRow("SELECT IFNULL(min_gm_read, 0) FROM web_boards WHERE id = ?", boardID).Scan(&minRead)
	if err == nil {
		return minRead, nil
	}
	return 0, err
}

func getBoardMinWrite(db *sql.DB, boardID string) (int, error) {
	var minWrite int
	err := db.QueryRow("SELECT min_web_write FROM web_boards WHERE id = ?", boardID).Scan(&minWrite)
	if err == nil {
		return minWrite, nil
	}
	err = db.QueryRow("SELECT IFNULL(min_gm_write, 0) FROM web_boards WHERE id = ?", boardID).Scan(&minWrite)
	if err == nil {
		return minWrite, nil
	}
	return 0, err
}

func openUpdateDB() (*sql.DB, error) {
	db, err := sql.Open("mysql", updateDSN)
	if err != nil {
		return nil, err
	}

	ensureBoardSchema(db)

	return db, nil
}

func openAuthDB() (*sql.DB, error) {
	return sql.Open("mysql", authDSN)
}

func RegisterRoutes(mux *http.ServeMux) {
	// Board management
	mux.HandleFunc("/api/board/list", GetBoardsHandler)
	mux.HandleFunc("/api/admin/board/create", AdminCreateBoardHandler)
	mux.HandleFunc("/api/admin/board/update", UpdateBoardHandler)
	mux.HandleFunc("/api/admin/board/delete", AdminDeleteBoardHandler)
	mux.HandleFunc("/api/admin/board/update-order", UpdateBoardOrderHandler)

	// Post management
	mux.HandleFunc("/api/board/posts", GetPostsHandler)
	mux.HandleFunc("/api/board/post", GetPostDetailHandler)
	mux.HandleFunc("/api/board/post/create", CreatePostHandler)
	mux.HandleFunc("/api/board/post/update", UpdatePostHandler)
	mux.HandleFunc("/api/board/post/delete", DeletePostHandler)
	mux.HandleFunc("/api/board/inquiry/status", UpdateInquiryStatusHandler)
	mux.HandleFunc("/api/board/next-version", GetNextVersionHandler)

	// Comment management
	mux.HandleFunc("/api/board/comment/create", CreateCommentHandler)
	mux.HandleFunc("/api/board/inquiry/message/create", CreateInquiryMessageHandler)
	mux.HandleFunc("/api/board/inquiry/memo", UpdateInquiryMemoHandler)
	mux.HandleFunc("/api/board/promotion/admin/list", GetPromotionAdminListHandler)
	mux.HandleFunc("/api/board/promotion/reward/config", PromotionRewardConfigHandler)
	mux.HandleFunc("/api/board/promotion/reward/pay", PromotionRewardPayHandler)
	mux.HandleFunc("/api/board/promotion/verify", PromotionVerifyHandler)
	mux.HandleFunc("/api/board/promotion/verify/link", PromotionVerifySingleLinkHandler)
	mux.HandleFunc("/api/board/promotion/review", PromotionReviewHandler)
	mux.HandleFunc("/api/board/promotion/verify/config", PromotionVerifyConfigHandler)
	mux.HandleFunc("/api/board/promotion/verify/upload", PromotionVerifyImageUploadHandler)
	mux.HandleFunc("/api/board/promotion/admin/detail", GetPromotionAdminDetailHandler)
	mux.HandleFunc("/api/board/promotion/link/auto-verify", PromotionLinkAutoVerifyHandler)
	mux.HandleFunc("/api/board/promotion/link/review", PromotionLinkReviewHandler)

	// File upload and attachments (Phase 1)
	mux.HandleFunc("/api/board/upload", UploadFileHandler)
	mux.HandleFunc("/api/board/attachments", GetAttachmentsHandler)
	mux.HandleFunc("/api/board/attachment/delete", DeleteAttachmentHandler)
	mux.Handle("/uploads/", http.StripPrefix("/uploads/", http.FileServer(http.Dir("./uploads"))))
}

func GetBoardsHandler(w http.ResponseWriter, r *http.Request) {
	log.Printf("[Board] GetBoardsHandler: Request from %s", r.RemoteAddr)
	db, err := openUpdateDB()
	if err != nil {
		log.Printf("[Board] GetBoardsHandler DB open failed: %v", err)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode([]Board{})
		return
	}
	defer db.Close()

	rows, err := db.Query("SELECT id, name, min_web_read, min_web_write, allow_attachments, allow_rich_editor, allow_emoji, allow_nested_comments, type, sort_order FROM web_boards ORDER BY sort_order ASC, name ASC")
	if err != nil {
		log.Printf("[Board] GetBoardsHandler modern query failed, trying legacy fallback: %v", err)
		rows, err = db.Query("SELECT id, name, IFNULL(min_gm_read,0), IFNULL(min_gm_write,0), 1, 1, 1, 1, 'normal', 0 FROM web_boards ORDER BY name ASC")
		if err != nil {
			log.Printf("[Board] GetBoardsHandler fallback query failed: %v", err)
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode([]Board{})
			return
		}
	}
	defer rows.Close()

	var boards []Board
	for rows.Next() {
		var b Board
		rows.Scan(&b.ID, &b.Name, &b.MinWebRead, &b.MinWebWrite, &b.AllowAttachments, &b.AllowRichEditor, &b.AllowEmoji, &b.AllowNestedComments, &b.Type, &b.SortOrder)
		boards = append(boards, b)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(boards)
}

type userInfo struct {
	AccountID  int
	AuthorName string
	GMLevel    int
	WebRank    int
}

func getUserInfo(r *http.Request) (userInfo, error) {
	cookie, err := r.Cookie("session_user")
	if err != nil || cookie.Value == "" {
		return userInfo{}, fmt.Errorf("unauthorized")
	}
	username := cookie.Value

	db, err := openAuthDB()
	if err != nil {
		return userInfo{}, err
	}
	defer db.Close()

	var info userInfo
	err = db.QueryRow(`
		SELECT a.id, IFNULL(aa.gmlevel, 0)
		FROM account a
		LEFT JOIN account_access aa ON a.id = aa.id
		WHERE UPPER(a.username) = UPPER(?)
	`, username).Scan(&info.AccountID, &info.GMLevel)
	if err != nil {
		return userInfo{}, err
	}

	// Get Web Rank (from update DB)
	info.WebRank = 0
	info.AuthorName = username // Default
		uDB, err := sql.Open("mysql", updateDSN)
	if err == nil {
		defer uDB.Close()
		var charName string
		var webRank int
		err = uDB.QueryRow("SELECT main_char_name, web_rank FROM user_profiles WHERE user_id = ?", info.AccountID).Scan(&charName, &webRank)
		if err == nil {
			if charName != "" {
				info.AuthorName = charName
			}
			info.WebRank = webRank
		}
	}

	return info, nil
}

func GetPostsHandler(w http.ResponseWriter, r *http.Request) {
	boardID := r.URL.Query().Get("board_id")
	log.Printf("[Board] GetPostsHandler: BoardID=%s, Request from %s", boardID, r.RemoteAddr)
	db, err := openUpdateDB()
	if err != nil {
		http.Error(w, "Database connection failed", http.StatusInternalServerError)
		return
	}
	defer db.Close()
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if page < 1 {
		page = 1
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit < 1 || limit > 100 {
		limit = 20
	}
	offset := (page - 1) * limit
	search := r.URL.Query().Get("search")
	categoryFilter := strings.TrimSpace(r.URL.Query().Get("category"))

	// Helper to check permission
	user, userErr := getUserInfo(r) // Error ignored as public boards allow guests (user.WebRank=0)

	minRead, err := getBoardMinRead(db, boardID)
	if err != nil {
		http.Error(w, "Board not found", http.StatusNotFound)
		return
	}

	if (isInquiryBoard(boardID) || isPromotionBoard(boardID)) && userErr != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	log.Printf("[Board] GetPostsHandler: User Rank=%d, Board MinRead=%d", user.WebRank, minRead)
	if user.WebRank < minRead {
		log.Printf("[Board] GetPostsHandler: Permission Denied for User Rank=%d", user.WebRank)
		http.Error(w, "Insufficient permissions", http.StatusForbidden)
		return
	}

	var total int
	countQuery := "SELECT COUNT(*) FROM web_posts WHERE board_id = ?"
	countArgs := []interface{}{boardID}
	if (isInquiryBoard(boardID) || isPromotionBoard(boardID)) && !isStaffUser(user) {
		countQuery += " AND account_id = ?"
		countArgs = append(countArgs, user.AccountID)
	}
	if categoryFilter != "" {
		countQuery += " AND category = ?"
		countArgs = append(countArgs, categoryFilter)
	}
	if search != "" {
		countQuery += " AND (title LIKE ? OR author_name LIKE ?)"
		countArgs = append(countArgs, "%"+search+"%", "%"+search+"%")
		db.QueryRow(countQuery, countArgs...).Scan(&total)
	} else {
		db.QueryRow(countQuery, countArgs...).Scan(&total)
	}

	// Query posts
	sqlQuery := "SELECT id, board_id, account_id, author_name, title, IFNULL(category,''), IFNULL(inquiry_status,''), IFNULL(inquiry_memo,''), IFNULL(version,''), views, display_number, created_at, IFNULL(content,'')"
	if isPromotionBoard(boardID) {
		sqlQuery += ", IFNULL(promo_review_status,'pending'), IFNULL((SELECT IFNULL(id,0) FROM web_promotion_reward_log rl WHERE rl.post_id = web_posts.id LIMIT 1),0)"
	}
	sqlQuery += " FROM web_posts WHERE board_id = ?"
	queryArgs := []interface{}{boardID}
	if (isInquiryBoard(boardID) || isPromotionBoard(boardID)) && !isStaffUser(user) {
		sqlQuery += " AND account_id = ?"
		queryArgs = append(queryArgs, user.AccountID)
	}
	if categoryFilter != "" {
		sqlQuery += " AND category = ?"
		queryArgs = append(queryArgs, categoryFilter)
	}
	var rows *sql.Rows
	if search != "" {
		sqlQuery += " AND (title LIKE ? OR author_name LIKE ?) ORDER BY display_number DESC LIMIT ? OFFSET ?"
		queryArgs = append(queryArgs, "%"+search+"%", "%"+search+"%", limit, offset)
		rows, err = db.Query(sqlQuery, queryArgs...)
	} else {
		sqlQuery += " ORDER BY display_number DESC LIMIT ? OFFSET ?"
		queryArgs = append(queryArgs, limit, offset)
		rows, err = db.Query(sqlQuery, queryArgs...)
	}

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var posts []map[string]interface{}
	var authorIDs []int
	postIDs := make([]int, 0, limit)
	for rows.Next() {
		var p Post
		var content string
		promoReviewStatus := "pending"
		promoRewardLogID := 0
		if isPromotionBoard(boardID) {
			rows.Scan(&p.ID, &p.BoardID, &p.AccountID, &p.AuthorName, &p.Title, &p.Category, &p.InquiryStatus, &p.InquiryMemo, &p.Version, &p.Views, &p.DisplayNumber, &p.CreatedAt, &content, &promoReviewStatus, &promoRewardLogID)
		} else {
			rows.Scan(&p.ID, &p.BoardID, &p.AccountID, &p.AuthorName, &p.Title, &p.Category, &p.InquiryStatus, &p.InquiryMemo, &p.Version, &p.Views, &p.DisplayNumber, &p.CreatedAt, &content)
		}
		thumbnail := extractFirstImageSrc(content)
		authorIDs = append(authorIDs, p.AccountID)
		postIDs = append(postIDs, p.ID)
		posts = append(posts, map[string]interface{}{
			"id":             p.ID,
			"account_id":     p.AccountID,
			"author_name":    p.AuthorName,
			"title":          p.Title,
			"category":       p.Category,
			"inquiry_status": p.InquiryStatus,
			"inquiry_memo":   p.InquiryMemo,
			"version":        p.Version,
			"thumbnail":      thumbnail,
			"views":          p.Views,
			"display_number": p.DisplayNumber,
			"created_at":     p.CreatedAt,
			"review_status":  promoReviewStatus,
			"reward_paid":    promoRewardLogID > 0,
		})
	}

	commentCountMap := getPostCommentCountMap(db, postIDs)
	staffMap := getStaffAuthorMap(authorIDs)
	enhancedMap := getEnhancedStoneAuthorMap(authorIDs)
	for _, post := range posts {
		accountID, _ := post["account_id"].(int)
		postID, _ := post["id"].(int)
		post["is_staff_author"] = staffMap[accountID]
		post["has_enhanced_stone"] = enhancedMap[accountID]
		post["comment_count"] = commentCountMap[postID]
	}

	log.Printf("[Board] GetPostsHandler: Returning %d posts, Total=%d, TotalPages=%d", len(posts), total, (total+limit-1)/limit)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"posts":      posts,
		"total":      total,
		"page":       page,
		"totalPages": (total + limit - 1) / limit,
	})
}

func GetPostDetailHandler(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	log.Printf("[Board] GetPostDetailHandler: ID=%s, Request from %s", id, r.RemoteAddr)

	user, userErr := getUserInfo(r)

	db, err := openUpdateDB()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer db.Close()

	// Get Board ID and check permissions
	var boardID string
	var postAuthorID int
	err = db.QueryRow("SELECT board_id, account_id FROM web_posts WHERE id = ?", id).Scan(&boardID, &postAuthorID)
	if err != nil {
		log.Printf("[Board] GetPostDetailHandler: Post %s not found in DB: %v", id, err)
		http.Error(w, "Post not found", http.StatusNotFound)
		return
	}

	minRead, err := getBoardMinRead(db, boardID)
	if err == nil {
		// If userErr exists (guest), user.WebRank is 0.
		if user.WebRank < minRead {
			http.Error(w, "Insufficient permissions", http.StatusForbidden)
			return
		}
	}

	if isInquiryBoard(boardID) {
		if userErr != nil {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		if !isStaffUser(user) && user.AccountID != postAuthorID {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
	}
	if isPromotionBoard(boardID) {
		if userErr != nil {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		if !isStaffUser(user) && user.AccountID != postAuthorID {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
	}

	// Create web_post_views table if not exists (Lazy init)
	db.Exec(`CREATE TABLE IF NOT EXISTS web_post_views (
		id INT AUTO_INCREMENT PRIMARY KEY,
		post_id INT NOT NULL,
		account_id INT NOT NULL,
		viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		UNIQUE KEY unique_view (post_id, account_id),
		INDEX idx_post_id (post_id),
		INDEX idx_account_id (account_id)
	) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)

	// Track view (Only if logged in)
	if userErr == nil {
		db.Exec("INSERT IGNORE INTO web_post_views (post_id, account_id) VALUES (?, ?)", id, user.AccountID)
		// Update view count
		db.Exec(`UPDATE web_posts 
			SET views = (SELECT COUNT(DISTINCT account_id) FROM web_post_views WHERE post_id = ?) 
			WHERE id = ?`, id, id)
	}

	var p Post
	err = db.QueryRow("SELECT id, board_id, account_id, author_name, title, IFNULL(category,''), IFNULL(inquiry_status,''), IFNULL(version,''), IFNULL(content,''), views, display_number, created_at FROM web_posts WHERE id = ?", id).
		Scan(&p.ID, &p.BoardID, &p.AccountID, &p.AuthorName, &p.Title, &p.Category, &p.InquiryStatus, &p.Version, &p.Content, &p.Views, &p.DisplayNumber, &p.CreatedAt)
	if err != nil {
		http.Error(w, "Post not found", http.StatusNotFound)
		return
	}

	authorIDs := []int{p.AccountID}
	var comments []Comment
	var inquiryMessages []Comment

	if isInquiryBoard(boardID) {
		rows, err := db.Query("SELECT id, post_id, account_id, author_name, role, IFNULL(content,''), created_at FROM web_inquiry_messages WHERE post_id = ? ORDER BY id ASC", id)
		if err == nil {
			for rows.Next() {
				var m Comment
				m.Depth = 0
				rows.Scan(&m.ID, &m.PostID, &m.AccountID, &m.AuthorName, &m.Role, &m.Content, &m.CreatedAt)
				authorIDs = append(authorIDs, m.AccountID)
				inquiryMessages = append(inquiryMessages, m)
			}
			rows.Close()
		}
	} else {
		rows, err := db.Query("SELECT id, account_id, parent_id, author_name, content, created_at, depth FROM web_comments WHERE post_id = ? ORDER BY id ASC", id)
		if err == nil {
			for rows.Next() {
				var c Comment
				rows.Scan(&c.ID, &c.AccountID, &c.ParentID, &c.AuthorName, &c.Content, &c.CreatedAt, &c.Depth)
				authorIDs = append(authorIDs, c.AccountID)
				comments = append(comments, c)
			}
			rows.Close()
		}
	}

	staffMap := getStaffAuthorMap(authorIDs)
	enhancedMap := getEnhancedStoneAuthorMap(authorIDs)
	p.IsStaffAuthor = staffMap[p.AccountID]
	p.HasEnhancedStone = enhancedMap[p.AccountID]
	for i := range comments {
		comments[i].IsStaffAuthor = staffMap[comments[i].AccountID]
		comments[i].HasEnhancedStone = enhancedMap[comments[i].AccountID]
	}
	for i := range inquiryMessages {
		inquiryMessages[i].IsStaffAuthor = staffMap[inquiryMessages[i].AccountID]
		inquiryMessages[i].HasEnhancedStone = enhancedMap[inquiryMessages[i].AccountID]
	}
	if isPromotionBoard(boardID) {
		rows, err := db.Query("SELECT url FROM web_promotion_links WHERE post_id = ? ORDER BY order_index ASC, id ASC", id)
		if err == nil {
			defer rows.Close()
			urls := make([]string, 0)
			for rows.Next() {
				var u string
				if rows.Scan(&u) == nil {
					u = strings.TrimSpace(u)
					if u != "" {
						urls = append(urls, u)
					}
				}
			}
			p.PromotionURLs = urls
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"post":             p,
		"comments":         comments,
		"inquiry_messages": inquiryMessages,
	})
}

func getStaffAuthorMap(accountIDs []int) map[int]bool {
	result := make(map[int]bool)
	if len(accountIDs) == 0 {
		return result
	}

	uniq := make(map[int]struct{})
	ids := make([]int, 0, len(accountIDs))
	for _, id := range accountIDs {
		if id <= 0 {
			continue
		}
		if _, ok := uniq[id]; ok {
			continue
		}
		uniq[id] = struct{}{}
		ids = append(ids, id)
	}
	if len(ids) == 0 {
		return result
	}

	placeholders := strings.TrimRight(strings.Repeat("?,", len(ids)), ",")
	args := make([]interface{}, 0, len(ids))
	for _, id := range ids {
		args = append(args, id)
	}

	// GM level > 0 in auth DB
	if authDB, err := openAuthDB(); err == nil {
		defer authDB.Close()
		q := fmt.Sprintf("SELECT id FROM account_access WHERE gmlevel > 0 AND id IN (%s)", placeholders)
		if rows, qerr := authDB.Query(q, args...); qerr == nil {
			for rows.Next() {
				var id int
				if rows.Scan(&id) == nil {
					result[id] = true
				}
			}
			rows.Close()
		}
	}

	// Web rank >= 2 in update DB
	if updateDB, err := openUpdateDB(); err == nil {
		defer updateDB.Close()
		q := fmt.Sprintf("SELECT user_id FROM user_profiles WHERE web_rank >= 2 AND user_id IN (%s)", placeholders)
		if rows, qerr := updateDB.Query(q, args...); qerr == nil {
			for rows.Next() {
				var id int
				if rows.Scan(&id) == nil {
					result[id] = true
				}
			}
			rows.Close()
		}
	}

	return result
}

func getEnhancedStoneAuthorMap(accountIDs []int) map[int]bool {
	result := make(map[int]bool)
	if len(accountIDs) == 0 {
		return result
	}

	uniq := make(map[int]struct{})
	ids := make([]int, 0, len(accountIDs))
	for _, id := range accountIDs {
		if id <= 0 {
			continue
		}
		if _, ok := uniq[id]; ok {
			continue
		}
		uniq[id] = struct{}{}
		ids = append(ids, id)
	}
	if len(ids) == 0 {
		return result
	}

	updateDB, err := openUpdateDB()
	if err != nil {
		return result
	}
	defer updateDB.Close()

	placeholders := strings.TrimRight(strings.Repeat("?,", len(ids)), ",")
	args := make([]interface{}, 0, len(ids))
	for _, id := range ids {
		args = append(args, id)
	}
	q := fmt.Sprintf(
		"SELECT user_id FROM web_feature_subscriptions WHERE feature_code = 'enhanced_enchant_stone' AND expires_at > NOW() AND user_id IN (%s)",
		placeholders,
	)
	rows, qerr := updateDB.Query(q, args...)
	if qerr != nil {
		return result
	}
	defer rows.Close()
	for rows.Next() {
		var id int
		if rows.Scan(&id) == nil {
			result[id] = true
		}
	}
	return result
}

func getPostCommentCountMap(db *sql.DB, postIDs []int) map[int]int {
	result := make(map[int]int)
	if db == nil || len(postIDs) == 0 {
		return result
	}

	uniq := make(map[int]struct{})
	ids := make([]int, 0, len(postIDs))
	for _, id := range postIDs {
		if id <= 0 {
			continue
		}
		if _, ok := uniq[id]; ok {
			continue
		}
		uniq[id] = struct{}{}
		ids = append(ids, id)
	}
	if len(ids) == 0 {
		return result
	}

	placeholders := strings.TrimRight(strings.Repeat("?,", len(ids)), ",")
	args := make([]interface{}, 0, len(ids))
	for _, id := range ids {
		args = append(args, id)
	}

	q := fmt.Sprintf("SELECT post_id, COUNT(*) FROM web_comments WHERE post_id IN (%s) GROUP BY post_id", placeholders)
	rows, err := db.Query(q, args...)
	if err != nil {
		return result
	}
	defer rows.Close()

	for rows.Next() {
		var postID, cnt int
		if rows.Scan(&postID, &cnt) == nil {
			result[postID] = cnt
		}
	}
	return result
}

func normalizePromotionURLs(urls []string) []string {
	out := make([]string, 0, len(urls))
	seen := map[string]bool{}
	for _, raw := range urls {
		u := strings.TrimSpace(raw)
		if u == "" {
			continue
		}
		key := strings.ToLower(u)
		if seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, u)
	}
	return out
}

func buildPromotionContent(urls []string) string {
	if len(urls) == 0 {
		return ""
	}
	var b strings.Builder
	b.WriteString("<div><p><strong>???쒓텠 URL 嶺뚮ㅄ維뽨빳?/strong></p><ul>")
	for _, u := range urls {
		esc := strings.ReplaceAll(strings.ReplaceAll(strings.TrimSpace(u), "&", "&amp;"), "\"", "&quot;")
		b.WriteString(`<li><a href="`)
		b.WriteString(esc)
		b.WriteString(`" target="_blank" rel="noopener noreferrer">`)
		b.WriteString(esc)
		b.WriteString(`</a></li>`)
	}
	b.WriteString("</ul></div>")
	return b.String()
}

func replacePromotionLinks(db *sql.DB, postID int64, urls []string) error {
	if db == nil || postID <= 0 {
		return nil
	}
	if _, err := db.Exec("DELETE FROM web_promotion_links WHERE post_id = ?", postID); err != nil {
		return err
	}
	for i, u := range urls {
		if _, err := db.Exec("INSERT INTO web_promotion_links (post_id, url, order_index) VALUES (?, ?, ?)", postID, u, i+1); err != nil {
			return err
		}
	}
	return nil
}

func CreatePostHandler(w http.ResponseWriter, r *http.Request) {
	user, err := getUserInfo(r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	db, err := openUpdateDB()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer db.Close()

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var p Post
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	// Check Write Permission
	minWeb, err := getBoardMinWrite(db, p.BoardID)
	if err != nil {
		// If board not found or error, deny access by default
		http.Error(w, "Board permission check failed", http.StatusForbidden)
		return
	}
	if user.WebRank < minWeb {
		http.Error(w, "Insufficient permissions", http.StatusForbidden)
		return
	}

	if isInquiryBoard(p.BoardID) {
		p.Category = normalizeInquiryCategory(p.Category)
		if p.Category == "" {
			http.Error(w, "?얜챷??燁삳똾?믤⑥쥓?곭몴??醫뤾문??뤾쉭??", http.StatusBadRequest)
			return
		}
		p.InquiryStatus = "received"
	} else {
		p.Category = ""
		p.InquiryStatus = ""
	}
	if isPromotionBoard(p.BoardID) {
		p.PromotionURLs = normalizePromotionURLs(p.PromotionURLs)
		if len(p.PromotionURLs) == 0 {
			http.Error(w, "???쒓텠 URL??1????怨대쭜 ???놁졑??琉얠돪??", http.StatusBadRequest)
			return
		}
		p.Content = buildPromotionContent(p.PromotionURLs)
	}

	// Use timestamp as display_number for unique sorting
	displayNumber := time.Now().Unix()

	// Auto-assign version for update-type boards
	if p.Version == "" {
		var boardType string
		db.QueryRow("SELECT IFNULL(type,'normal') FROM web_boards WHERE id = ?", p.BoardID).Scan(&boardType)
		if boardType == "update" {
			latest := getLatestVersion(db, p.BoardID)
			if latest == "" {
				p.Version = "1.0.0"
			} else {
				p.Version = nextVersion(latest)
			}
		}
	}

	res, err := db.Exec(`
		INSERT INTO web_posts (board_id, account_id, author_name, title, category, inquiry_status, version, content, display_number) 
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		p.BoardID, user.AccountID, user.AuthorName, p.Title, p.Category, p.InquiryStatus, p.Version, p.Content, displayNumber)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if isPromotionBoard(p.BoardID) {
		postID, _ := res.LastInsertId()
		if err := replacePromotionLinks(db, postID, p.PromotionURLs); err != nil {
			http.Error(w, "???쒓텠 URL ????쒑굢????덉넮???곕????덈펲: "+err.Error(), http.StatusInternalServerError)
			return
		}
	}

	w.WriteHeader(http.StatusCreated)
	fmt.Fprint(w, `{"status":"success"}`)
}

// GetNextVersionHandler returns the next auto-incremented version for a board
func GetNextVersionHandler(w http.ResponseWriter, r *http.Request) {
	boardID := r.URL.Query().Get("board_id")
	if boardID == "" {
		http.Error(w, "board_id required", http.StatusBadRequest)
		return
	}

	db, err := openUpdateDB()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer db.Close()

	latest := getLatestVersion(db, boardID)
	var next string
	if latest == "" {
		next = "1.0.0"
	} else {
		next = nextVersion(latest)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"current": latest,
		"next":    next,
	})
}

func DeletePostHandler(w http.ResponseWriter, r *http.Request) {
	user, err := getUserInfo(r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	id := r.URL.Query().Get("id")
	if id == "" {
		http.Error(w, "Missing post ID", http.StatusBadRequest)
		return
	}

	db, err := openUpdateDB()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer db.Close()

	// Get board_id before deletion for sequence update
	var boardID string
	err = db.QueryRow("SELECT board_id FROM web_posts WHERE id = ?", id).Scan(&boardID)
	if err != nil {
		http.Error(w, "Post not found", http.StatusNotFound)
		return
	}

	// Check if user is author or admin (Web Rank 2)
	var authorID int
	db.QueryRow("SELECT account_id FROM web_posts WHERE id = ?", id).Scan(&authorID)
	if user.AccountID != authorID && user.WebRank < 2 {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	// Delete post
	if isPromotionBoard(boardID) {
		_, _ = db.Exec("DELETE FROM web_promotion_links WHERE post_id = ?", id)
		_, _ = db.Exec("DELETE FROM web_promotion_reward_log WHERE post_id = ?", id)
	}
	_, err = db.Exec("DELETE FROM web_posts WHERE id = ?", id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	fmt.Fprint(w, `{"status":"success"}`)
}

func UpdatePostHandler(w http.ResponseWriter, r *http.Request) {
	user, err := getUserInfo(r)
	if err != nil {
		log.Printf("[Board] UpdatePostHandler: Unauthorized access attempt")
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		ID            int      `json:"id"`
		Title         string   `json:"title"`
		Content       string   `json:"content"`
		Category      string   `json:"category"`
		InquiryStatus string   `json:"inquiry_status"`
		PromotionURLs []string `json:"promotion_urls"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[Board] UpdatePostHandler: Failed to decode request body: %v", err)
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	log.Printf("[Board] UpdatePostHandler: UserID=%d, PostID=%d, Title=%s", user.AccountID, req.ID, req.Title)

	db, err := openUpdateDB()
	if err != nil {
		log.Printf("[Board] UpdatePostHandler: Failed to open DB: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer db.Close()

	// Verify ownership or admin privileges
	var authorID int
	var boardID string
	var currentInquiryStatus string
	err = db.QueryRow("SELECT account_id, board_id, IFNULL(inquiry_status,'') FROM web_posts WHERE id = ?", req.ID).Scan(&authorID, &boardID, &currentInquiryStatus)
	if err != nil {
		log.Printf("[Board] UpdatePostHandler: Post %d not found: %v", req.ID, err)
		http.Error(w, "Post not found", http.StatusNotFound)
		return
	}

	isAdmin := user.WebRank >= 2 || user.GMLevel > 0
	if user.AccountID != authorID && !isAdmin {
		log.Printf("[Board] UpdatePostHandler: Permission denied. UserID=%d is not AuthorID=%d (isAdmin=%v)", user.AccountID, authorID, isAdmin)
		http.Error(w, "Unauthorized to edit this post", http.StatusForbidden)
		return
	}

	if isInquiryBoard(boardID) {
		req.Category = normalizeInquiryCategory(req.Category)
		if req.Category == "" {
			http.Error(w, "?얜챷??燁삳똾?믤⑥쥓?곭몴??醫뤾문??뤾쉭??", http.StatusBadRequest)
			return
		}
		if isStaffUser(user) {
			if normalized := normalizeInquiryStatus(req.InquiryStatus); normalized != "" {
				currentInquiryStatus = normalized
			}
		}
	} else {
		req.Category = ""
		currentInquiryStatus = ""
	}
	if isPromotionBoard(boardID) {
		req.PromotionURLs = normalizePromotionURLs(req.PromotionURLs)
		if len(req.PromotionURLs) == 0 {
			http.Error(w, "???쒓텠 URL??1????怨대쭜 ???놁졑??琉얠돪??", http.StatusBadRequest)
			return
		}
		req.Content = buildPromotionContent(req.PromotionURLs)
	}

	// Perform update
	_, err = db.Exec(
		"UPDATE web_posts SET title = ?, content = ?, category = ?, inquiry_status = ? WHERE id = ?",
		req.Title, req.Content, req.Category, currentInquiryStatus, req.ID,
	)

	if err != nil {
		log.Printf("[Board] UpdatePostHandler: DB Update failed for PostID=%d: %v", req.ID, err)
		http.Error(w, "Failed to update post: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if isPromotionBoard(boardID) {
		if err := replacePromotionLinks(db, int64(req.ID), req.PromotionURLs); err != nil {
			http.Error(w, "???쒓텠 URL ???????덉넮: "+err.Error(), http.StatusInternalServerError)
			return
		}
	}

	log.Printf("[Board] UpdatePostHandler: Successfully updated PostID=%d", req.ID)
	w.WriteHeader(http.StatusOK)
	fmt.Fprint(w, `{"status":"success"}`)
}

func UpdateInquiryStatusHandler(w http.ResponseWriter, r *http.Request) {
	user, err := getUserInfo(r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if !isStaffUser(user) {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		PostID int    `json:"post_id"`
		Status string `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}
	status := normalizeInquiryStatus(req.Status)
	if req.PostID <= 0 || status == "" {
		http.Error(w, "Invalid status update payload", http.StatusBadRequest)
		return
	}

	db, err := openUpdateDB()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer db.Close()

	var boardID string
	if err := db.QueryRow("SELECT board_id FROM web_posts WHERE id = ?", req.PostID).Scan(&boardID); err != nil {
		http.Error(w, "Post not found", http.StatusNotFound)
		return
	}
	if !isInquiryBoard(boardID) {
		http.Error(w, "Not an inquiry post", http.StatusBadRequest)
		return
	}

	if _, err := db.Exec("UPDATE web_posts SET inquiry_status = ? WHERE id = ?", status, req.PostID); err != nil {
		http.Error(w, "Failed to update inquiry status", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status": "success",
	})
}

func UpdateInquiryMemoHandler(w http.ResponseWriter, r *http.Request) {
	user, err := getUserInfo(r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if !isStaffUser(user) {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		PostID int    `json:"post_id"`
		Memo   string `json:"memo"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}
	if req.PostID <= 0 {
		http.Error(w, "Invalid memo payload", http.StatusBadRequest)
		return
	}
	memo := strings.TrimSpace(req.Memo)
	if len(memo) > 1000 {
		http.Error(w, "Memo too long", http.StatusBadRequest)
		return
	}

	db, err := openUpdateDB()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer db.Close()

	var boardID string
	if err := db.QueryRow("SELECT board_id FROM web_posts WHERE id = ?", req.PostID).Scan(&boardID); err != nil {
		http.Error(w, "Post not found", http.StatusNotFound)
		return
	}
	if !isInquiryBoard(boardID) {
		http.Error(w, "Not an inquiry post", http.StatusBadRequest)
		return
	}

	if _, err := db.Exec("UPDATE web_posts SET inquiry_memo = ? WHERE id = ?", memo, req.PostID); err != nil {
		http.Error(w, "Failed to update inquiry memo", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status": "success",
	})
}

func CreateInquiryMessageHandler(w http.ResponseWriter, r *http.Request) {
	user, err := getUserInfo(r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		PostID  int    `json:"post_id"`
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}
	content := strings.TrimSpace(req.Content)
	if req.PostID <= 0 || content == "" {
		http.Error(w, "Invalid inquiry message payload", http.StatusBadRequest)
		return
	}

	db, err := openUpdateDB()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer db.Close()

	var boardID string
	if err := db.QueryRow("SELECT board_id FROM web_posts WHERE id = ?", req.PostID).Scan(&boardID); err != nil {
		http.Error(w, "Post not found", http.StatusNotFound)
		return
	}
	if !isInquiryBoard(boardID) {
		http.Error(w, "Not an inquiry post", http.StatusBadRequest)
		return
	}
	if !isStaffUser(user) {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	role := "user"
	if isStaffUser(user) {
		role = "staff"
	}
	if _, err := db.Exec(
		"INSERT INTO web_inquiry_messages (post_id, account_id, author_name, role, content) VALUES (?, ?, ?, ?, ?)",
		req.PostID, user.AccountID, user.AuthorName, role, content,
	); err != nil {
		http.Error(w, "Failed to create inquiry message", http.StatusInternalServerError)
		return
	}

	// Staff answer implies progress unless already done.
	if role == "staff" {
		_, _ = db.Exec("UPDATE web_posts SET inquiry_status = CASE WHEN inquiry_status IN ('done', 'point_paid') THEN inquiry_status ELSE 'in_progress' END WHERE id = ?", req.PostID)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status": "success",
	})
}

func GetPromotionAdminListHandler(w http.ResponseWriter, r *http.Request) {
	user, err := getUserInfo(r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if !isStaffUser(user) {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	db, err := openUpdateDB()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer db.Close()

	page, _ := strconv.Atoi(strings.TrimSpace(r.URL.Query().Get("page")))
	if page < 1 {
		page = 1
	}
	limit, _ := strconv.Atoi(strings.TrimSpace(r.URL.Query().Get("limit")))
	if limit < 1 || limit > 100 {
		limit = 10
	}
	offset := (page - 1) * limit
	search := strings.TrimSpace(r.URL.Query().Get("search"))

	countQ := "SELECT COUNT(*) FROM web_posts WHERE board_id='promotion'"
	args := make([]interface{}, 0)
	if search != "" {
		countQ += " AND (title LIKE ? OR author_name LIKE ?)"
		args = append(args, "%"+search+"%", "%"+search+"%")
	}
	total := 0
	_ = db.QueryRow(countQ, args...).Scan(&total)

	listQ := `
		SELECT p.id, p.account_id, p.author_name, p.title, p.created_at,
		       IFNULL(pl.url,''), IFNULL(pls.urls,''), IFNULL(rl.id,0), IFNULL(rl.receiver_name,''), IFNULL(rl.created_at,''),
		       IFNULL(p.promo_verify_ok,0), IFNULL(p.promo_verify_message,''), IFNULL(p.promo_checked_at,''),
		       IFNULL(plc.pass_count,0), IFNULL(plc.total_count,0),
		       IFNULL(p.promo_review_status,'pending'), IFNULL(p.promo_review_at,'')
		FROM web_posts p
		LEFT JOIN (
		    SELECT post_id, MIN(url) AS url
		    FROM web_promotion_links
		    GROUP BY post_id
		) pl ON pl.post_id = p.id
		LEFT JOIN (
		    SELECT post_id, GROUP_CONCAT(url ORDER BY order_index ASC, id ASC SEPARATOR '\n') AS urls
		    FROM web_promotion_links
		    GROUP BY post_id
		) pls ON pls.post_id = p.id
		LEFT JOIN (
		    SELECT post_id,
		           SUM(CASE WHEN verify_ok = 1 THEN 1 ELSE 0 END) AS pass_count,
		           COUNT(*) AS total_count
		    FROM web_promotion_links
		    GROUP BY post_id
		) plc ON plc.post_id = p.id
		LEFT JOIN web_promotion_reward_log rl ON rl.post_id = p.id
		WHERE p.board_id='promotion'
	`
	if search != "" {
		listQ += " AND (p.title LIKE ? OR p.author_name LIKE ?)"
	}
	listQ += " ORDER BY p.display_number DESC LIMIT ? OFFSET ?"
	if search != "" {
		args = append(args, "%"+search+"%", "%"+search+"%")
	}
	args = append(args, limit, offset)
	rows, err := db.Query(listQ, args...)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	list := make([]map[string]interface{}, 0)
	for rows.Next() {
		var id, accountID, paidID, verifyOK, passCount, totalCount int
		var author, title, createdAt, firstURL, urlsRaw, receiverName, paidAt, verifyMsg, checkedAt, reviewStatus, reviewAt string
		if rows.Scan(&id, &accountID, &author, &title, &createdAt, &firstURL, &urlsRaw, &paidID, &receiverName, &paidAt, &verifyOK, &verifyMsg, &checkedAt, &passCount, &totalCount, &reviewStatus, &reviewAt) == nil {
			verifyMsg = normalizePromotionVerifyMessage(verifyMsg)
			urls := make([]string, 0)
			for _, u := range strings.Split(urlsRaw, "\n") {
				u = strings.TrimSpace(u)
				if u == "" {
					continue
				}
				urls = append(urls, u)
			}
			list = append(list, map[string]interface{}{
				"id":             id,
				"account_id":     accountID,
				"author_name":    author,
				"title":          title,
				"created_at":     createdAt,
				"first_url":      firstURL,
				"urls":           urls,
				"url_count":      len(urls),
				"reward_paid":    paidID > 0,
				"reward_paid_at": paidAt,
				"receiver_name":  receiverName,
				"verify_ok":      verifyOK == 1,
				"verify_message": verifyMsg,
				"checked_at":     checkedAt,
				"verify_pass_count": passCount,
				"verify_total_count": totalCount,
				"review_status":  reviewStatus,
				"review_at":      reviewAt,
			})
		}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"posts":      list,
		"total":      total,
		"page":       page,
		"totalPages": (total + limit - 1) / limit,
	})
}

func updatePromotionPostVerifyByLinks(db *sql.DB, postID int) {
	if db == nil || postID <= 0 {
		return
	}
	var passCount, totalCount int
	_ = db.QueryRow(`
		SELECT
			IFNULL(SUM(CASE WHEN verify_ok = 1 THEN 1 ELSE 0 END), 0),
			COUNT(*)
		FROM web_promotion_links
		WHERE post_id = ?
	`, postID).Scan(&passCount, &totalCount)

	verifyOK := 0
	msg := "검사 가능한 URL이 없습니다."
	if totalCount > 0 {
		if passCount > 0 {
			verifyOK = 1
			msg = fmt.Sprintf("URL %d/%d 통과", passCount, totalCount)
		} else {
			msg = fmt.Sprintf("URL %d/%d 통과", passCount, totalCount)
		}
	}
	_, _ = db.Exec(`
		UPDATE web_posts
		SET promo_verify_ok = ?, promo_verify_message = ?, promo_checked_at = NOW()
		WHERE id = ?
	`, verifyOK, msg, postID)
}

func GetPromotionAdminDetailHandler(w http.ResponseWriter, r *http.Request) {
	user, err := getUserInfo(r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if !isStaffUser(user) {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	postID, _ := strconv.Atoi(strings.TrimSpace(r.URL.Query().Get("id")))
	if postID <= 0 {
		http.Error(w, "Invalid id", http.StatusBadRequest)
		return
	}

	db, err := openUpdateDB()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer db.Close()

	var post map[string]interface{} = map[string]interface{}{}
	var id, accountID, verifyOK int
	var author, title, createdAt, verifyMsg, checkedAt, reviewStatus, reviewAt string
	err = db.QueryRow(`
		SELECT id, account_id, IFNULL(author_name,''), IFNULL(title,''), IFNULL(created_at,''),
		       IFNULL(promo_verify_ok,0), IFNULL(promo_verify_message,''), IFNULL(promo_checked_at,''),
		       IFNULL(promo_review_status,'pending'), IFNULL(promo_review_at,'')
		FROM web_posts
		WHERE id = ? AND board_id = 'promotion'
	`, postID).Scan(&id, &accountID, &author, &title, &createdAt, &verifyOK, &verifyMsg, &checkedAt, &reviewStatus, &reviewAt)
	if err != nil {
		http.Error(w, "Post not found", http.StatusNotFound)
		return
	}
	post["id"] = id
	post["account_id"] = accountID
	post["author_name"] = author
	post["title"] = title
	post["created_at"] = createdAt
	post["verify_ok"] = verifyOK == 1
	post["verify_message"] = normalizePromotionVerifyMessage(verifyMsg)
	post["checked_at"] = checkedAt
	post["review_status"] = reviewStatus
	post["review_at"] = reviewAt

	var paidID int
	var paidAt, receiverName string
	_ = db.QueryRow("SELECT IFNULL(id,0), IFNULL(created_at,''), IFNULL(receiver_name,'') FROM web_promotion_reward_log WHERE post_id = ?", postID).
		Scan(&paidID, &paidAt, &receiverName)
	post["reward_paid"] = paidID > 0
	post["reward_paid_at"] = paidAt
	post["receiver_name"] = receiverName

	rows, err := db.Query(`
		SELECT id, IFNULL(url,''), IFNULL(verify_ok,0), IFNULL(verify_message,''), IFNULL(checked_at,''),
		       IFNULL(review_status,'pending'), IFNULL(review_at,'')
		FROM web_promotion_links
		WHERE post_id = ?
		ORDER BY order_index ASC, id ASC
	`, postID)
	if err != nil {
		http.Error(w, "Failed to load links", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	links := make([]map[string]interface{}, 0)
	for rows.Next() {
		var lid, lok int
		var url, lmsg, lchecked, lreviewStatus, lreviewAt string
		if rows.Scan(&lid, &url, &lok, &lmsg, &lchecked, &lreviewStatus, &lreviewAt) == nil {
			lmsg = normalizePromotionVerifyMessage(lmsg)
			links = append(links, map[string]interface{}{
				"id":             lid,
				"url":            strings.TrimSpace(url),
				"verify_ok":      lok == 1,
				"verify_message": lmsg,
				"checked_at":     lchecked,
				"review_status":  lreviewStatus,
				"review_at":      lreviewAt,
			})
		}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"post":  post,
		"links": links,
	})
}

func PromotionLinkAutoVerifyHandler(w http.ResponseWriter, r *http.Request) {
	user, err := getUserInfo(r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if !isStaffUser(user) {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		PostID int `json:"post_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.PostID <= 0 {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	db, err := openUpdateDB()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer db.Close()

	var boardID, title, author string
	if err := db.QueryRow("SELECT board_id, IFNULL(title,''), IFNULL(author_name,'') FROM web_posts WHERE id = ?", req.PostID).
		Scan(&boardID, &title, &author); err != nil {
		http.Error(w, "Post not found", http.StatusNotFound)
		return
	}
	if !isPromotionBoard(boardID) {
		http.Error(w, "Not promotion post", http.StatusBadRequest)
		return
	}

	var requiredText, requiredImage string
	_ = db.QueryRow("SELECT IFNULL(required_text,''), IFNULL(required_image,'') FROM web_promotion_verify_config WHERE id=1").
		Scan(&requiredText, &requiredImage)

	rows, err := db.Query("SELECT id, IFNULL(url,'') FROM web_promotion_links WHERE post_id=? ORDER BY order_index ASC, id ASC", req.PostID)
	if err != nil {
		http.Error(w, "Failed to load URLs", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	linkMap := make(map[int]string)
	for rows.Next() {
		var linkID int
		var url string
		if rows.Scan(&linkID, &url) != nil {
			continue
		}
		linkMap[linkID] = strings.TrimSpace(url)
	}
	checkResults := verifyPromotionLinksParallel(linkMap, title, author, requiredText, requiredImage)

	updated := 0
	for _, r := range checkResults {
		okNum := 0
		if r.OK {
			okNum = 1
		}
		if _, err := db.Exec(`
			UPDATE web_promotion_links
			SET verify_ok=?, verify_message=?, checked_at=NOW()
			WHERE id=?
		`, okNum, r.Msg, r.LinkID); err == nil {
			updated++
		}
	}

	updatePromotionPostVerifyByLinks(db, req.PostID)

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"status":  "success",
		"updated": updated,
	})
}

func PromotionLinkReviewHandler(w http.ResponseWriter, r *http.Request) {
	user, err := getUserInfo(r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if !isStaffUser(user) {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		LinkID int    `json:"link_id"`
		Action string `json:"action"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.LinkID <= 0 {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}
	action := strings.ToLower(strings.TrimSpace(req.Action))
	if action != "approved" && action != "rejected" {
		http.Error(w, "Invalid action", http.StatusBadRequest)
		return
	}

	db, err := openUpdateDB()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer db.Close()

	var postID int
	if err := db.QueryRow("SELECT post_id FROM web_promotion_links WHERE id = ?", req.LinkID).Scan(&postID); err != nil {
		http.Error(w, "Link not found", http.StatusNotFound)
		return
	}
	_, err = db.Exec(`
		UPDATE web_promotion_links
		SET review_status=?, review_at=NOW(), review_by=?
		WHERE id=?
	`, action, user.AccountID, req.LinkID)
	if err != nil {
		http.Error(w, "URL 상태 변경에 실패했습니다.", http.StatusInternalServerError)
		return
	}

	updatePromotionPostVerifyByLinks(db, postID)

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "success"})
}

func PromotionRewardConfigHandler(w http.ResponseWriter, r *http.Request) {
	user, err := getUserInfo(r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if !isStaffUser(user) {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	db, err := openUpdateDB()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer db.Close()

	if r.Method == http.MethodGet {
		var itemEntry, itemCount int
		var subject, body string
		err := db.QueryRow("SELECT IFNULL(item_entry,0), IFNULL(item_count,1), IFNULL(mail_subject,''), IFNULL(mail_body,'') FROM web_promotion_reward_config WHERE id=1").
			Scan(&itemEntry, &itemCount, &subject, &body)
		if err != nil {
			http.Error(w, "蹂댁긽 ?ㅼ젙??遺덈윭?ㅼ? 紐삵뻽?듬땲??", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"item_entry":   itemEntry,
			"item_count":   itemCount,
			"mail_subject": subject,
			"mail_body":    body,
		})
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		ItemEntry   int    `json:"item_entry"`
		ItemCount   int    `json:"item_count"`
		MailSubject string `json:"mail_subject"`
		MailBody    string `json:"mail_body"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}
	if req.ItemEntry <= 0 || req.ItemCount <= 0 {
		http.Error(w, "蹂댁긽 ?꾩씠??踰덊샇/?섎웾???뺤씤?섏꽭??", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(req.MailSubject) == "" {
		req.MailSubject = "?띾낫 寃뚯떆??蹂댁긽"
	}
	if strings.TrimSpace(req.MailBody) == "" {
		req.MailBody = "?띾낫 李몄뿬 蹂댁긽?낅땲??"
	}
	_, err = db.Exec(`UPDATE web_promotion_reward_config
		SET item_entry=?, item_count=?, mail_subject=?, mail_body=?, updated_by=?
		WHERE id=1`, req.ItemEntry, req.ItemCount, req.MailSubject, req.MailBody, user.AccountID)
	if err != nil {
		http.Error(w, "蹂댁긽 ?ㅼ젙 ??μ뿉 ?ㅽ뙣?덉뒿?덈떎.", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "success"})
}

func PromotionVerifyConfigHandler(w http.ResponseWriter, r *http.Request) {
	user, err := getUserInfo(r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if !isStaffUser(user) {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	db, err := openUpdateDB()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer db.Close()

	if r.Method == http.MethodGet {
		var requiredText, requiredImage string
		err := db.QueryRow("SELECT IFNULL(required_text,''), IFNULL(required_image,'') FROM web_promotion_verify_config WHERE id=1").
			Scan(&requiredText, &requiredImage)
		if err != nil {
			http.Error(w, "寃??湲곗???遺덈윭?ㅼ? 紐삵뻽?듬땲??", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"required_text":  requiredText,
			"required_image": requiredImage,
		})
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		RequiredText  string `json:"required_text"`
		RequiredImage string `json:"required_image"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}
	_, err = db.Exec(`UPDATE web_promotion_verify_config
		SET required_text=?, required_image=?, updated_by=?
		WHERE id=1`, strings.TrimSpace(req.RequiredText), strings.TrimSpace(req.RequiredImage), user.AccountID)
	if err != nil {
		http.Error(w, "寃??湲곗? ??μ뿉 ?ㅽ뙣?덉뒿?덈떎.", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "success"})
}

func resolvePromotionReceiverCharacter(updateDB *sql.DB, accountID int) string {
	if updateDB != nil {
		var mainCharName string
		if err := updateDB.QueryRow("SELECT IFNULL(main_char_name,'') FROM user_profiles WHERE user_id = ?", accountID).Scan(&mainCharName); err == nil {
			mainCharName = strings.TrimSpace(mainCharName)
			if mainCharName != "" {
				return mainCharName
			}
		}
	}
	charDB, err := sql.Open("mysql", "root:4618@tcp(localhost:3306)/acore_characters?charset=utf8mb4&parseTime=true&loc=Local")
	if err != nil {
		return ""
	}
	defer charDB.Close()
	var name string
	_ = charDB.QueryRow("SELECT name FROM characters WHERE account = ? ORDER BY guid ASC LIMIT 1", accountID).Scan(&name)
	return strings.TrimSpace(name)
}

func sendPromotionItemMail(receiverName, subject, body string, itemEntry, itemCount int) error {
	charDB, err := sql.Open("mysql", "root:4618@tcp(localhost:3306)/acore_characters?charset=utf8mb4&parseTime=true&loc=Local")
	if err != nil {
		return err
	}
	defer charDB.Close()

	var charGUID int
	if err := charDB.QueryRow("SELECT guid FROM characters WHERE name = ?", receiverName).Scan(&charGUID); err != nil {
		return err
	}
	var nextMailID int
	if err := charDB.QueryRow("SELECT IFNULL(MAX(id), 0) + 1 FROM mail").Scan(&nextMailID); err != nil {
		return err
	}
	hasItems := 0
	if itemEntry > 0 && itemCount > 0 {
		hasItems = 1
	}
	_, err = charDB.Exec(`
		INSERT INTO mail (id, messageType, stationery, mailTemplateId, sender, receiver, subject, body, has_items, expire_time, deliver_time, money, cod, checked)
		VALUES (?, 0, 41, 0, 0, ?, ?, ?, ?, UNIX_TIMESTAMP() + 2592000, UNIX_TIMESTAMP(), 0, 0, 0)
	`, nextMailID, charGUID, subject, body, hasItems)
	if err != nil {
		return err
	}
	if hasItems == 1 {
		var nextItemGUID int
		if err := charDB.QueryRow("SELECT IFNULL(MAX(guid), 0) + 1 FROM item_instance").Scan(&nextItemGUID); err != nil {
			return err
		}
		if _, err := charDB.Exec(`
			INSERT INTO item_instance (guid, itemEntry, owner_guid, creatorGuid, count, enchantments)
			VALUES (?, ?, ?, 0, ?, '')
		`, nextItemGUID, itemEntry, charGUID, itemCount); err != nil {
			return err
		}
		if _, err := charDB.Exec("INSERT INTO mail_items (mail_id, item_guid, receiver) VALUES (?, ?, ?)", nextMailID, nextItemGUID, charGUID); err != nil {
			return err
		}
	}
	return nil
}

func verifyPromotionURL(targetURL, title, author, requiredText, requiredImage string) (bool, string) {
	if shouldUsePythonVerifier(targetURL) {
		if pyOK, pyMsg, used := verifyPromotionURLWithPython(targetURL, title, author, requiredText, requiredImage); used {
			return pyOK, pyMsg
		}
	}

	u := strings.TrimSpace(targetURL)
	if u == "" {
		return false, "URL이 비어 있습니다."
	}

	client := &http.Client{Timeout: 10 * time.Second}
	req, err := http.NewRequest(http.MethodGet, u, nil)
	if err != nil {
		return false, "URL 형식이 올바르지 않습니다."
	}
	req.Header.Set("User-Agent", "KarazhanPromotionVerifier/1.0")

	resp, err := client.Do(req)
	if err != nil {
		return false, "접속 실패"
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return false, fmt.Sprintf("HTTP %d", resp.StatusCode)
	}

	finalURL := targetURL
	if resp.Request != nil && resp.Request.URL != nil {
		finalURL = resp.Request.URL.String()
	}

	bodyReader := io.Reader(resp.Body)
	if decoded, err := charset.NewReader(resp.Body, resp.Header.Get("Content-Type")); err == nil {
		bodyReader = decoded
	}
	bodyBytes, _ := io.ReadAll(io.LimitReader(bodyReader, 1<<20))
	htmlRaw := string(bodyBytes)
	html := strings.ToLower(htmlRaw)

	hasImgTag := strings.Contains(html, "<img")
	titleNorm := strings.ToLower(strings.TrimSpace(title))
	authorNorm := strings.ToLower(strings.TrimSpace(author))
	metaTexts, metaImages := extractPromotionMetaAndImages(htmlRaw)
	textHaystack := strings.ToLower(strings.Join(metaTexts, " ")) + " " + html
	limitedPlatform := isNaverCafeDynamicShell(targetURL, htmlRaw) || isNaverCafeDynamicShell(finalURL, htmlRaw)

	hasText := false
	if titleNorm != "" && strings.Contains(textHaystack, titleNorm) {
		hasText = true
	}
	if !hasText && authorNorm != "" && strings.Contains(textHaystack, authorNorm) {
		hasText = true
	}

	requiredTextNorm := strings.ToLower(strings.TrimSpace(requiredText))
	requiredImageNorm := strings.ToLower(strings.TrimSpace(requiredImage))

	textCriteriaOK := true
	if requiredTextNorm != "" {
		tokens := strings.Split(requiredTextNorm, ",")
		for _, t := range tokens {
			token := strings.TrimSpace(t)
			if token == "" {
				continue
			}
			if !strings.Contains(textHaystack, token) {
				textCriteriaOK = false
				break
			}
		}
	}

	imageCriteriaOK := true
	if requiredImageNorm != "" {
		imageCandidates := collectPromotionImageCandidates(htmlRaw, metaImages)
		imageCriteriaOK = false
		for _, cand := range imageCandidates {
			c := strings.ToLower(strings.TrimSpace(cand))
			if c == "" {
				continue
			}
			if strings.Contains(c, requiredImageNorm) || strings.Contains(requiredImageNorm, c) {
				imageCriteriaOK = true
				break
			}
		}
		if !imageCriteriaOK {
			imageCriteriaOK = strings.Contains(html, requiredImageNorm)
		}
		if !imageCriteriaOK {
			base := requiredImageNorm
			if i := strings.LastIndex(base, "/"); i >= 0 && i+1 < len(base) {
				base = base[i+1:]
			}
			if i := strings.Index(base, "?"); i >= 0 {
				base = base[:i]
			}
			base = strings.TrimSpace(base)
			if base != "" && strings.Contains(html, base) {
				imageCriteriaOK = true
			}
		}
	}

	if requiredTextNorm == "" && requiredImageNorm == "" {
		if hasImgTag || hasText {
			return true, "홍보 텍스트 또는 이미지 확인됨"
		}
		if limitedPlatform {
			return true, "네이버 카페 동적 페이지(본문 제한) - URL 접근 확인"
		}
		return false, "홍보 텍스트/이미지 미확인"
	}

	if textCriteriaOK && imageCriteriaOK {
		return true, "검사 기준 충족"
	}
	if limitedPlatform {
		return false, "네이버 카페 동적 페이지(본문 제한) - 필수 기준 확인 불가"
	}
	if !textCriteriaOK && !imageCriteriaOK {
		return false, "필수 텍스트/이미지 모두 미충족"
	}
	if !textCriteriaOK {
		return false, "필수 텍스트 미충족"
	}
	return false, "필수 이미지 미충족"
}

type promotionLinkCheckResult struct {
	LinkID int
	OK     bool
	Msg    string
}

func verifyPromotionLinksParallel(links map[int]string, title, author, requiredText, requiredImage string) []promotionLinkCheckResult {
	if len(links) == 0 {
		return []promotionLinkCheckResult{}
	}

	type job struct {
		LinkID int
		URL    string
	}
	jobs := make(chan job)
	results := make(chan promotionLinkCheckResult, len(links))

	workerCount := 3
	if len(links) < workerCount {
		workerCount = len(links)
	}
	var wg sync.WaitGroup
	for i := 0; i < workerCount; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := range jobs {
				ok, msg := verifyPromotionURL(j.URL, title, author, requiredText, requiredImage)
				results <- promotionLinkCheckResult{
					LinkID: j.LinkID,
					OK:     ok,
					Msg:    normalizePromotionVerifyMessage(msg),
				}
			}
		}()
	}

	for id, u := range links {
		jobs <- job{LinkID: id, URL: u}
	}
	close(jobs)
	wg.Wait()
	close(results)

	out := make([]promotionLinkCheckResult, 0, len(links))
	for r := range results {
		out = append(out, r)
	}
	return out
}

func normalizePromotionVerifyMessage(message string) string {
	msg := strings.TrimSpace(message)
	if msg == "" {
		return ""
	}
	// Repair previously mojibake-stored Korean messages.
	if strings.Contains(msg, "���̹� ī��") && strings.Contains(strings.ToLower(msg), "url") {
		return "네이버 카페 동적 페이지(본문 제한) - URL 접근 확인"
	}
	if strings.Contains(msg, "���̹� ī��") && strings.Contains(msg, "�ʼ�") && strings.Contains(msg, "Ȯ��") {
		return "네이버 카페 동적 페이지(본문 제한) - 필수 기준 확인 불가"
	}
	if strings.Contains(msg, "ȫ��") && (strings.Contains(msg, "�ؽ�Ʈ") || strings.Contains(msg, "�̹���")) {
		if strings.Contains(msg, "�̹���") && strings.Contains(msg, "�ؽ�Ʈ") {
			return "홍보 텍스트/이미지 미확인"
		}
		return "홍보 텍스트 또는 이미지 확인됨"
	}
	return msg
}

func shouldUsePythonVerifier(targetURL string) bool {
	u, err := url.Parse(strings.TrimSpace(targetURL))
	if err != nil || u == nil {
		return false
	}
	scheme := strings.ToLower(strings.TrimSpace(u.Scheme))
	return scheme == "http" || scheme == "https"
}

func verifyPromotionURLWithPython(targetURL, title, author, requiredText, requiredImage string) (bool, string, bool) {
	scriptPath := "./tools/promo_verify.py"
	if _, err := os.Stat(scriptPath); err != nil {
		return false, "", false
	}

	args := []string{scriptPath, targetURL, title, author, requiredText, requiredImage}
	commands := [][]string{
		append([]string{"python"}, args...),
		append([]string{"py", "-3"}, args...),
	}

	for _, cmdArgs := range commands {
		ctx, cancel := context.WithTimeout(context.Background(), 16*time.Second)
		cmd := exec.CommandContext(ctx, cmdArgs[0], cmdArgs[1:]...)
		cmd.Env = append(os.Environ(),
			"PYTHONUTF8=1",
			"PYTHONIOENCODING=UTF-8",
		)
		var out bytes.Buffer
		cmd.Stdout = &out
		cmd.Stderr = &out
		err := cmd.Run()
		cancel()

		if ctx.Err() == context.DeadlineExceeded {
			continue
		}
		if err != nil {
			continue
		}

		var resp struct {
			Status  string `json:"status"`
			OK      bool   `json:"ok"`
			Message string `json:"message"`
		}
		if jerr := json.Unmarshal(out.Bytes(), &resp); jerr != nil {
			continue
		}
		if strings.ToLower(strings.TrimSpace(resp.Status)) != "success" {
			continue
		}
		msg := normalizePromotionVerifyMessage(resp.Message)
		if msg == "" {
			msg = "브라우저 렌더링 검사 완료"
		}
		return resp.OK, msg, true
	}

	return false, "", false
}

func isNaverCafeDynamicShell(targetURL, htmlRaw string) bool {
	u, err := url.Parse(strings.TrimSpace(targetURL))
	if err != nil || u == nil {
		return false
	}
	host := strings.ToLower(strings.TrimSpace(u.Hostname()))
	if host != "cafe.naver.com" && host != "m.cafe.naver.com" {
		return false
	}
	path := strings.Trim(strings.ToLower(u.Path), "/")
	isArticlePath := regexp.MustCompile(`^[^/]+/\d+$`).MatchString(path)
	q := u.Query()
	isArticleQuery := strings.TrimSpace(q.Get("articleid")) != "" || strings.TrimSpace(q.Get("art")) != ""
	if !isArticlePath && !isArticleQuery {
		return false
	}
	l := strings.ToLower(htmlRaw)
	if strings.Contains(l, "<div id=\"app\"></div>") && strings.Contains(l, "네이버 카페") {
		return true
	}
	if strings.Contains(l, "mobile doesn't work properly without javascript enabled") {
		return true
	}
	return true
}
func extractPromotionMetaAndImages(html string) ([]string, []string) {
	metaTexts := make([]string, 0, 8)
	metaImages := make([]string, 0, 8)
	raw := html

	// property/name before content
	reA := regexp.MustCompile(`(?is)<meta[^>]+(?:property|name)\s*=\s*["']([^"']+)["'][^>]+content\s*=\s*["']([^"']+)["'][^>]*>`)
	for _, m := range reA.FindAllStringSubmatch(raw, -1) {
		key := strings.ToLower(strings.TrimSpace(m[1]))
		val := strings.TrimSpace(m[2])
		if val == "" {
			continue
		}
		switch key {
		case "og:title", "og:description", "twitter:title", "twitter:description":
			metaTexts = append(metaTexts, val)
		case "og:image", "twitter:image":
			metaImages = append(metaImages, val)
		}
	}

	// content before property/name
	reB := regexp.MustCompile(`(?is)<meta[^>]+content\s*=\s*["']([^"']+)["'][^>]+(?:property|name)\s*=\s*["']([^"']+)["'][^>]*>`)
	for _, m := range reB.FindAllStringSubmatch(raw, -1) {
		val := strings.TrimSpace(m[1])
		key := strings.ToLower(strings.TrimSpace(m[2]))
		if val == "" {
			continue
		}
		switch key {
		case "og:title", "og:description", "twitter:title", "twitter:description":
			metaTexts = append(metaTexts, val)
		case "og:image", "twitter:image":
			metaImages = append(metaImages, val)
		}
	}
	return metaTexts, metaImages
}

func collectPromotionImageCandidates(html string, metaImages []string) []string {
	candidates := make([]string, 0, 64)
	candidates = append(candidates, metaImages...)

	// img src-like attributes
	reImgAttr := regexp.MustCompile(`(?is)<img[^>]+(?:src|data-src|data-original|data-lazy-src)\s*=\s*["']([^"']+)["'][^>]*>`)
	for _, m := range reImgAttr.FindAllStringSubmatch(html, -1) {
		v := strings.TrimSpace(m[1])
		if v != "" {
			candidates = append(candidates, v)
		}
	}

	// srcset/data-srcset entries
	reSrcset := regexp.MustCompile(`(?is)(?:srcset|data-srcset)\s*=\s*["']([^"']+)["']`)
	for _, m := range reSrcset.FindAllStringSubmatch(html, -1) {
		raw := strings.TrimSpace(m[1])
		if raw == "" {
			continue
		}
		parts := strings.Split(raw, ",")
		for _, p := range parts {
			p = strings.TrimSpace(p)
			if p == "" {
				continue
			}
			toks := strings.Fields(p)
			if len(toks) > 0 {
				candidates = append(candidates, toks[0])
			}
		}
	}

	uniq := make(map[string]struct{}, len(candidates))
	out := make([]string, 0, len(candidates))
	for _, c := range candidates {
		c = strings.TrimSpace(c)
		if c == "" {
			continue
		}
		key := strings.ToLower(c)
		if _, ok := uniq[key]; ok {
			continue
		}
		uniq[key] = struct{}{}
		out = append(out, c)
	}
	return out
}

func PromotionRewardPayHandler(w http.ResponseWriter, r *http.Request) {
	user, err := getUserInfo(r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if !isStaffUser(user) {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		PostID int `json:"post_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.PostID <= 0 {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	db, err := openUpdateDB()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer db.Close()

	var boardID string
	var accountID int
	if err := db.QueryRow("SELECT board_id, account_id FROM web_posts WHERE id = ?", req.PostID).Scan(&boardID, &accountID); err != nil {
		http.Error(w, "Post not found", http.StatusNotFound)
		return
	}
	if !isPromotionBoard(boardID) {
		http.Error(w, "Not promotion post", http.StatusBadRequest)
		return
	}
	var existing int
	if err := db.QueryRow("SELECT IFNULL(id,0) FROM web_promotion_reward_log WHERE post_id = ?", req.PostID).Scan(&existing); err == nil && existing > 0 {
		http.Error(w, "???? 嶺뚯솘??ル留㏆쭕??롪퍓???룸Ь????낅퉵??", http.StatusConflict)
		return
	}

	var itemEntry, itemCount int
	var subject, body string
	if err := db.QueryRow("SELECT IFNULL(item_entry,0), IFNULL(item_count,1), IFNULL(mail_subject,''), IFNULL(mail_body,'') FROM web_promotion_reward_config WHERE id=1").
		Scan(&itemEntry, &itemCount, &subject, &body); err != nil {
		http.Error(w, "?곌랜?삥묾????깆젧??嶺뚢돦堉??????怨룸????덈펲.", http.StatusInternalServerError)
		return
	}
	if itemEntry <= 0 || itemCount <= 0 {
		http.Error(w, "?곌랜?삥묾??熬곣뫗逾?????깆젧???熬곣뫗???紐껊퉵??", http.StatusBadRequest)
		return
	}

	receiverName := resolvePromotionReceiverCharacter(db, accountID)
	if receiverName == "" {
		http.Error(w, "??濡?／ 嶺?큔???? 嶺뚢돦堉??????怨룸????덈펲.", http.StatusBadRequest)
		return
	}
	if err := sendPromotionItemMail(receiverName, subject, body, itemEntry, itemCount); err != nil {
		http.Error(w, "??⑥쥓??嶺뚯솘??????덉넮: "+err.Error(), http.StatusInternalServerError)
		return
	}

	if _, err := db.Exec(`
		INSERT INTO web_promotion_reward_log (post_id, account_id, receiver_name, item_entry, item_count, paid_by)
		VALUES (?, ?, ?, ?, ?, ?)
	`, req.PostID, accountID, receiverName, itemEntry, itemCount, user.AccountID); err != nil {
		http.Error(w, "嶺뚯솘????β돦裕???リ옇?▽빳????덉넮: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"status":        "success",
		"receiver_name": receiverName,
	})
}

func PromotionVerifyHandler(w http.ResponseWriter, r *http.Request) {
	user, err := getUserInfo(r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if !isStaffUser(user) {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		PostID int `json:"post_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.PostID <= 0 {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	db, err := openUpdateDB()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer db.Close()

	var boardID, title, author string
	if err := db.QueryRow(`
		SELECT p.board_id, IFNULL(p.title,''), IFNULL(p.author_name,'')
		FROM web_posts p
		WHERE p.id = ?
	`, req.PostID).Scan(&boardID, &title, &author); err != nil {
		http.Error(w, "Post not found", http.StatusNotFound)
		return
	}
	if !isPromotionBoard(boardID) {
		http.Error(w, "Not promotion post", http.StatusBadRequest)
		return
	}

	var requiredText, requiredImage string
	_ = db.QueryRow("SELECT IFNULL(required_text,''), IFNULL(required_image,'') FROM web_promotion_verify_config WHERE id=1").
		Scan(&requiredText, &requiredImage)

	rows, err := db.Query("SELECT id, IFNULL(url,'') FROM web_promotion_links WHERE post_id=? ORDER BY order_index ASC, id ASC", req.PostID)
	if err != nil {
		http.Error(w, "Failed to load URLs", http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	linkMap := make(map[int]string)
	for rows.Next() {
		var linkID int
		var url string
		if rows.Scan(&linkID, &url) != nil {
			continue
		}
		linkMap[linkID] = strings.TrimSpace(url)
	}
	checkResults := verifyPromotionLinksParallel(linkMap, title, author, requiredText, requiredImage)

	updated := 0
	for _, r := range checkResults {
		okNum := 0
		if r.OK {
			okNum = 1
		}
		if _, err := db.Exec(`
			UPDATE web_promotion_links
			SET verify_ok=?, verify_message=?, checked_at=NOW()
			WHERE id=?
		`, okNum, r.Msg, r.LinkID); err == nil {
			updated++
		}
	}

	updatePromotionPostVerifyByLinks(db, req.PostID)

	var postVerifyOK int
	var postVerifyMessage string
	_ = db.QueryRow("SELECT IFNULL(promo_verify_ok,0), IFNULL(promo_verify_message,'') FROM web_posts WHERE id=?", req.PostID).
		Scan(&postVerifyOK, &postVerifyMessage)

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"status":         "success",
		"verify_ok":      postVerifyOK == 1,
		"verify_message": normalizePromotionVerifyMessage(postVerifyMessage),
		"updated_links":  updated,
	})
}

func PromotionVerifySingleLinkHandler(w http.ResponseWriter, r *http.Request) {
	user, err := getUserInfo(r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if !isStaffUser(user) {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		PostID int `json:"post_id"`
		LinkID int `json:"link_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.PostID <= 0 || req.LinkID <= 0 {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	db, err := openUpdateDB()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer db.Close()

	var boardID, title, author string
	if err := db.QueryRow(`
		SELECT p.board_id, IFNULL(p.title,''), IFNULL(p.author_name,'')
		FROM web_posts p
		WHERE p.id = ?
	`, req.PostID).Scan(&boardID, &title, &author); err != nil {
		http.Error(w, "Post not found", http.StatusNotFound)
		return
	}
	if !isPromotionBoard(boardID) {
		http.Error(w, "Not promotion post", http.StatusBadRequest)
		return
	}

	var targetURL string
	if err := db.QueryRow(`
		SELECT IFNULL(url,'')
		FROM web_promotion_links
		WHERE id = ? AND post_id = ?
	`, req.LinkID, req.PostID).Scan(&targetURL); err != nil {
		http.Error(w, "Link not found", http.StatusNotFound)
		return
	}

	var requiredText, requiredImage string
	_ = db.QueryRow("SELECT IFNULL(required_text,''), IFNULL(required_image,'') FROM web_promotion_verify_config WHERE id=1").
		Scan(&requiredText, &requiredImage)

	ok, msg := verifyPromotionURL(targetURL, title, author, requiredText, requiredImage)
	msg = normalizePromotionVerifyMessage(msg)
	okNum := 0
	if ok {
		okNum = 1
	}

	if _, err := db.Exec(`
		UPDATE web_promotion_links
		SET verify_ok=?, verify_message=?, checked_at=NOW()
		WHERE id=? AND post_id=?
	`, okNum, msg, req.LinkID, req.PostID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	updatePromotionPostVerifyByLinks(db, req.PostID)

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"status":         "success",
		"link_id":        req.LinkID,
		"verify_ok":      ok,
		"verify_message": msg,
	})
}

func PromotionReviewHandler(w http.ResponseWriter, r *http.Request) {
	user, err := getUserInfo(r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if !isStaffUser(user) {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		PostID int    `json:"post_id"`
		Action string `json:"action"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.PostID <= 0 {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}
	action := strings.ToLower(strings.TrimSpace(req.Action))
	if action != "approved" && action != "rejected" {
		http.Error(w, "Invalid action", http.StatusBadRequest)
		return
	}

	db, err := openUpdateDB()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer db.Close()
	_, err = db.Exec(`
		UPDATE web_posts
		SET promo_review_status=?, promo_review_at=NOW(), promo_review_by=?
		WHERE id=? AND board_id='promotion'
	`, action, user.AccountID, req.PostID)
	if err != nil {
		http.Error(w, "?띾낫 ?곹깭 蹂寃쎌뿉 ?ㅽ뙣?덉뒿?덈떎.", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "success"})
}

func CreateCommentHandler(w http.ResponseWriter, r *http.Request) {
	user, err := getUserInfo(r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	db, err := openUpdateDB()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer db.Close()

	var c Comment
	if err := json.NewDecoder(r.Body).Decode(&c); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	var postBoardID string
	var postOwnerID int
	if err := db.QueryRow("SELECT board_id, account_id FROM web_posts WHERE id = ?", c.PostID).Scan(&postBoardID, &postOwnerID); err != nil {
		http.Error(w, "Post not found", http.StatusNotFound)
		return
	}
	if isInquiryBoard(postBoardID) {
		http.Error(w, "Use inquiry message API for inquiry board", http.StatusBadRequest)
		return
	}

	// Calculate depth from parent comment
	depth := 0
	if c.ParentID != nil {
		var parentDepth int
		err = db.QueryRow("SELECT depth FROM web_comments WHERE id = ?", *c.ParentID).Scan(&parentDepth)
		if err == nil {
			depth = parentDepth + 1
			// Limit depth to 3 levels
			if depth > 3 {
				http.Error(w, "Maximum nesting depth exceeded", http.StatusBadRequest)
				return
			}
		}
	}

	result, err := db.Exec("INSERT INTO web_comments (post_id, account_id, author_name, content, parent_id, depth) VALUES (?, ?, ?, ?, ?, ?)",
		c.PostID, user.AccountID, user.AuthorName, c.Content, c.ParentID, depth)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	commentID := 0
	if result != nil {
		if lastID, idErr := result.LastInsertId(); idErr == nil && lastID > 0 {
			commentID = int(lastID)
		}
	}

	// Send Notifications (Async)
	go func() {
		// Notifications are stored in update DB.
		notifDB, err := openUpdateDB()
		if err != nil {
			log.Printf("Failed to open update DB for notification: %v", err)
			return
		}
		defer notifDB.Close()
		ns := services.NewNotificationService(notifDB)

		// Re-open update DB for reading post/comment info if needed, or reuse if not closed?
		// The original 'db' is closed on return of handler, so we should arguably open a new connection or move logic before closure.
		// Since this is a goroutine, 'db' from handler might be closed. Better open new one or query before.
		// Actually, query before launching goroutine is safer for 'db' usage, but blocking.
		// Safe approach: Query IDs before async, or open new DB in async.
		// Let's open new DB in async to be safe and independent.

		uDB, err := openUpdateDB()
		if err != nil {
			return
		}
		defer uDB.Close()

		// 1. Notify Post Author
		var postAuthorID int
		var postTitle string
		uDB.QueryRow("SELECT account_id, title FROM web_posts WHERE id = ?", c.PostID).Scan(&postAuthorID, &postTitle)
		if postAuthorID != 0 && postAuthorID != user.AccountID {
			msg := fmt.Sprintf("%s님이 회원님의 게시글에 댓글을 작성했습니다.", user.AuthorName)
			link := fmt.Sprintf("/board/view?id=%d", c.PostID)
			if commentID > 0 {
				link = fmt.Sprintf("/board/view?id=%d&comment_id=%d", c.PostID, commentID)
			}
			ns.CreateNotification(postAuthorID, "comment", "댓글 알림", msg, link, user.AuthorName)
		}

		// 2. Notify Parent Comment Author (if nested)
		if c.ParentID != nil {
			var parentAuthorID int
			uDB.QueryRow("SELECT account_id FROM web_comments WHERE id = ?", *c.ParentID).Scan(&parentAuthorID)
			// Notify if not self, and not same as post author (to avoid double notif if post author is also parent comment author)
			if parentAuthorID != 0 && parentAuthorID != user.AccountID && parentAuthorID != postAuthorID {
				msg := fmt.Sprintf("%s님이 회원님의 댓글에 답글을 작성했습니다.", user.AuthorName)
				link := fmt.Sprintf("/board/view?id=%d", c.PostID)
				if commentID > 0 {
					link = fmt.Sprintf("/board/view?id=%d&comment_id=%d", c.PostID, commentID)
				}
				ns.CreateNotification(parentAuthorID, "comment", "답글 알림", msg, link, user.AuthorName)
			}
		}
	}()

	fmt.Fprint(w, `{"status":"success"}`)
}

func AdminCreateBoardHandler(w http.ResponseWriter, r *http.Request) {
	user, err := getUserInfo(r)
	if err != nil || user.WebRank < 2 {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	var b Board
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	db, err := openUpdateDB()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer db.Close()

	_, err = db.Exec(
		"INSERT INTO web_boards (id, name, min_web_read, min_web_write, allow_attachments, allow_rich_editor, allow_emoji, allow_nested_comments, type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
		b.ID, b.Name, b.MinWebRead, b.MinWebWrite, b.AllowAttachments, b.AllowRichEditor, b.AllowEmoji, b.AllowNestedComments, b.Type,
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	fmt.Fprint(w, `{"status":"success"}`)
}

func AdminDeleteBoardHandler(w http.ResponseWriter, r *http.Request) {
	user, err := getUserInfo(r)
	if err != nil || user.WebRank < 2 {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	id := r.URL.Query().Get("id")
	db, err := openUpdateDB()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer db.Close()

	_, err = db.Exec("DELETE FROM web_boards WHERE id = ?", id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	fmt.Fprint(w, `{"status":"success"}`)
}

func UpdateBoardHandler(w http.ResponseWriter, r *http.Request) {
	user, err := getUserInfo(r)
	if err != nil || user.WebRank < 2 {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		ID                  string `json:"id"`
		Name                string `json:"name"`
		MinWebRead          int    `json:"min_web_read"`
		MinWebWrite         int    `json:"min_web_write"`
		AllowAttachments    bool   `json:"allow_attachments"`
		AllowRichEditor     bool   `json:"allow_rich_editor"`
		AllowEmoji          bool   `json:"allow_emoji"`
		AllowNestedComments bool   `json:"allow_nested_comments"`
		Type                string `json:"type"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	db, err := openUpdateDB()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer db.Close()

	// Update board settings (ID cannot be changed as it's the primary key)
	_, err = db.Exec(
		"UPDATE web_boards SET name = ?, min_web_read = ?, min_web_write = ?, allow_attachments = ?, allow_rich_editor = ?, allow_emoji = ?, allow_nested_comments = ?, type = ? WHERE id = ?",
		req.Name, req.MinWebRead, req.MinWebWrite, req.AllowAttachments, req.AllowRichEditor, req.AllowEmoji, req.AllowNestedComments, req.Type, req.ID,
	)

	if err != nil {
		http.Error(w, "Failed to update board", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func UpdateBoardOrderHandler(w http.ResponseWriter, r *http.Request) {
	// Order management is part of board-admin UI, so validate board-admin menu permission.
	if !stats.CheckMenuPermission(w, r, "board-admin") {
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var ids []string
	if err := json.NewDecoder(r.Body).Decode(&ids); err != nil {
		log.Printf("[Board] UpdateBoardOrderHandler: Failed to decode request body: %v", err)
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	log.Printf("[Board] UpdateBoardOrderHandler: New order: %v", ids)

	db, err := openUpdateDB()
	if err != nil {
		log.Printf("[Board] UpdateBoardOrderHandler: Failed to open DB: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer db.Close()

	// Use a transaction
	tx, err := db.Begin()
	if err != nil {
		log.Printf("[Board] UpdateBoardOrderHandler: Failed to begin transaction: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	for i, id := range ids {
		_, err = tx.Exec("UPDATE web_boards SET sort_order = ? WHERE id = ?", i, id)
		if err != nil {
			tx.Rollback()
			log.Printf("[Board] UpdateBoardOrderHandler: Failed to update order for board %s: %v", id, err)
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}

	if err := tx.Commit(); err != nil {
		log.Printf("[Board] UpdateBoardOrderHandler: Failed to commit transaction: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	log.Printf("[Board] UpdateBoardOrderHandler: Successfully updated board order")
	w.WriteHeader(http.StatusOK)
	fmt.Fprint(w, `{"status":"success"}`)
}
