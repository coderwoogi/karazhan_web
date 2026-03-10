package board

import (
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "github.com/go-sql-driver/mysql"
)

// File upload constants
const (
	MaxFileSize = 10 * 1024 * 1024 // 10MB
	UploadDir   = "./uploads/boards"
)

// Allowed MIME types
var allowedMimeTypes = map[string]bool{
	// Images
	"image/jpeg": true,
	"image/png":  true,
	"image/gif":  true,
	"image/webp": true,
	// Documents
	"application/pdf":    true,
	"text/plain":         true,
	"application/msword": true,
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document": true,
}

// Generate UUID-like filename
func generateFilename() string {
	b := make([]byte, 16)
	rand.Read(b)
	return fmt.Sprintf("%x", b)
}

// Upload file handler
func UploadFileHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Parse multipart form (10MB max)
	err := r.ParseMultipartForm(MaxFileSize)
	if err != nil {
		http.Error(w, "File too large (max 10MB)", http.StatusBadRequest)
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "No file uploaded", http.StatusBadRequest)
		return
	}
	defer file.Close()

	// Check file size
	if header.Size > MaxFileSize {
		http.Error(w, "File too large (max 10MB)", http.StatusBadRequest)
		return
	}

	// Detect MIME type from actual file content (not browser-supplied header)
	buf := make([]byte, 512)
	n, _ := file.Read(buf)
	mimeType := http.DetectContentType(buf[:n])
	// Seek back to start
	if seeker, ok := file.(interface {
		Seek(int64, int) (int64, error)
	}); ok {
		seeker.Seek(0, 0)
	}

	if !allowedMimeTypes[mimeType] {
		http.Error(w, "File type not allowed: "+mimeType, http.StatusBadRequest)
		return
	}

	// Get board_id (optional, defaults to 'inline' for editor-embedded images)
	boardID := r.FormValue("board_id")
	if boardID == "" {
		boardID = "inline"
	}
	uploadType := r.FormValue("type")
	if uploadType == "" {
		uploadType = "images"
	}

	// Create directory structure: uploads/boards/{board_id}/{type}/YYYY-MM-DD/
	now := time.Now()
	dateDir := now.Format("2006-01-02")
	targetDir := filepath.Join(UploadDir, boardID, uploadType, dateDir)

	err = os.MkdirAll(targetDir, 0755)
	if err != nil {
		http.Error(w, "Failed to create upload directory", http.StatusInternalServerError)
		return
	}

	// Generate unique filename
	ext := filepath.Ext(header.Filename)
	if ext == "" {
		// Fallback extension from MIME
		switch mimeType {
		case "image/jpeg":
			ext = ".jpg"
		case "image/png":
			ext = ".png"
		case "image/gif":
			ext = ".gif"
		case "image/webp":
			ext = ".webp"
		}
	}
	filename := generateFilename() + ext
	filePath := filepath.Join(targetDir, filename)

	// Save file
	dst, err := os.Create(filePath)
	if err != nil {
		http.Error(w, "Failed to save file", http.StatusInternalServerError)
		return
	}
	defer dst.Close()

	_, err = io.Copy(dst, file)
	if err != nil {
		http.Error(w, "Failed to save file", http.StatusInternalServerError)
		return
	}

	// Relative path for URL
	relativePath := filepath.Join("boards", boardID, uploadType, dateDir, filename)
	urlPath := "/uploads/" + strings.ReplaceAll(relativePath, "\\", "/")

	// Return file info
	response := map[string]interface{}{
		"filename":          filename,
		"original_filename": header.Filename,
		"file_path":         relativePath,
		"file_size":         header.Size,
		"mime_type":         mimeType,
		"url":               urlPath,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// Upload promotion verify image and return a path that can be used as required_image criterion.
func PromotionVerifyImageUploadHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	user, err := getUserInfo(r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if !isStaffUser(user) {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	if err := r.ParseMultipartForm(MaxFileSize); err != nil {
		http.Error(w, "파일이 너무 큽니다. (최대 10MB)", http.StatusBadRequest)
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "업로드할 파일이 없습니다.", http.StatusBadRequest)
		return
	}
	defer file.Close()

	if header.Size > MaxFileSize {
		http.Error(w, "파일이 너무 큽니다. (최대 10MB)", http.StatusBadRequest)
		return
	}

	buf := make([]byte, 512)
	n, _ := file.Read(buf)
	mimeType := http.DetectContentType(buf[:n])
	if seeker, ok := file.(interface {
		Seek(int64, int) (int64, error)
	}); ok {
		_, _ = seeker.Seek(0, 0)
	}
	if !strings.HasPrefix(mimeType, "image/") {
		http.Error(w, "이미지 파일만 업로드할 수 있습니다.", http.StatusBadRequest)
		return
	}

	now := time.Now()
	dateDir := now.Format("2006-01-02")
	targetDir := filepath.Join("./uploads", "promotion-verify", dateDir)
	if err := os.MkdirAll(targetDir, 0755); err != nil {
		http.Error(w, "업로드 경로 생성 실패", http.StatusInternalServerError)
		return
	}

	ext := strings.ToLower(filepath.Ext(header.Filename))
	if ext == "" {
		switch mimeType {
		case "image/jpeg":
			ext = ".jpg"
		case "image/png":
			ext = ".png"
		case "image/gif":
			ext = ".gif"
		case "image/webp":
			ext = ".webp"
		default:
			ext = ".img"
		}
	}
	filename := generateFilename() + ext
	filePath := filepath.Join(targetDir, filename)

	dst, err := os.Create(filePath)
	if err != nil {
		http.Error(w, "파일 저장 실패", http.StatusInternalServerError)
		return
	}
	defer dst.Close()

	if _, err := io.Copy(dst, file); err != nil {
		http.Error(w, "파일 저장 실패", http.StatusInternalServerError)
		return
	}

	requiredImage := "/uploads/promotion-verify/" + dateDir + "/" + filename

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"status":         "success",
		"required_image": requiredImage,
		"filename":       header.Filename,
	})
}

// Get attachments for a post or comment
func GetAttachmentsHandler(w http.ResponseWriter, r *http.Request) {
	postID := r.URL.Query().Get("post_id")
	commentID := r.URL.Query().Get("comment_id")

	if postID == "" && commentID == "" {
		http.Error(w, "post_id or comment_id required", http.StatusBadRequest)
		return
	}

	db, err := openUpdateDB()
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer db.Close()

	var rows *sql.Rows
	if postID != "" {
		rows, err = db.Query("SELECT id, filename, original_filename, file_path, file_size, mime_type, uploaded_by, created_at FROM web_attachments WHERE post_id = ?", postID)
	} else {
		rows, err = db.Query("SELECT id, filename, original_filename, file_path, file_size, mime_type, uploaded_by, created_at FROM web_attachments WHERE comment_id = ?", commentID)
	}

	if err != nil {
		http.Error(w, "Query error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var attachments []Attachment
	for rows.Next() {
		var a Attachment
		err := rows.Scan(&a.ID, &a.Filename, &a.OriginalFilename, &a.FilePath, &a.FileSize, &a.MimeType, &a.UploadedBy, &a.CreatedAt)
		if err != nil {
			continue
		}
		attachments = append(attachments, a)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(attachments)
}

// Delete attachment
func DeleteAttachmentHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		ID int `json:"id"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	db, err := openUpdateDB()
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer db.Close()

	// Get file path before deleting
	var filePath string
	err = db.QueryRow("SELECT file_path FROM web_attachments WHERE id = ?", req.ID).Scan(&filePath)
	if err != nil {
		http.Error(w, "Attachment not found", http.StatusNotFound)
		return
	}

	// Delete from database
	_, err = db.Exec("DELETE FROM web_attachments WHERE id = ?", req.ID)
	if err != nil {
		http.Error(w, "Failed to delete attachment", http.StatusInternalServerError)
		return
	}

	// Delete physical file
	fullPath := filepath.Join("./uploads", filePath)
	os.Remove(fullPath) // Ignore error if file doesn't exist

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}
