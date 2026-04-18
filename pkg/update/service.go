package update

import (
	"crypto/md5"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"karazhan/pkg/config"
	"log"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	_ "github.com/go-sql-driver/mysql"
)

var db *sql.DB

type UpdateFile struct {
	No             int    `json:"no"`
	Version        string `json:"version"`
	File           string `json:"file"`
	Md5            string `json:"md5"`
	Date           string `json:"date"`
	FileType       string `json:"file_type"`
	LegacyFileType string `json:"fileType,omitempty"`
}

type UpdateCompareResult struct {
	FileType   string `json:"fileType"`
	SourceURL  string `json:"sourceUrl"`
	LocalFile  string `json:"localFile"`
	LocalMd5   string `json:"localMd5"`
	RemoteMd5  string `json:"remoteMd5"`
	Match      bool   `json:"match"`
	CheckedAt  string `json:"checkedAt"`
	RemoteSize int64  `json:"remoteSize"`
	Message    string `json:"message,omitempty"`
}

func sortRankForUpdateFile(file UpdateFile) int {
	if ordinal, ok := versionOrdinal(strings.TrimSpace(file.Version)); ok {
		return ordinal
	}
	return -1
}

func isUpdateFileNewer(a, b UpdateFile) bool {
	rankA := sortRankForUpdateFile(a)
	rankB := sortRankForUpdateFile(b)
	if rankA != rankB {
		return rankA > rankB
	}
	if a.Date != b.Date {
		return a.Date > b.Date
	}
	return a.No > b.No
}

func loadUpdateFilesByType(fileType string) ([]UpdateFile, error) {
	rows, err := db.Query("SELECT `no`, `file_type`, `version`, `file`, `md5`, `date` FROM `update` WHERE `file_type`=?", normalizeFileType(fileType))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	files := make([]UpdateFile, 0, 32)
	for rows.Next() {
		var f UpdateFile
		var dateVal []uint8
		if err := rows.Scan(&f.No, &f.FileType, &f.Version, &f.File, &f.Md5, &dateVal); err != nil {
			log.Println(err)
			continue
		}
		f.Date = string(dateVal)
		f.LegacyFileType = f.FileType
		files = append(files, f)
	}
	return files, nil
}

func sortUpdateFiles(files []UpdateFile) {
	sort.Slice(files, func(i, j int) bool {
		return isUpdateFileNewer(files[i], files[j])
	})
}

func RegisterRoutes(mux *http.ServeMux) {
	var err error
	dsn := config.UpdateDSNWithParams("parseTime=true")
	db, err = sql.Open("mysql", dsn)
	if err != nil {
		log.Printf("Update Service DB Error: %v", err)
	}
	// Note: keeping db open globally for this package for simplicity as per original code

	// 테이블 생성
	createTableQuery := `
	CREATE TABLE IF NOT EXISTS ` + "`update`" + ` (
		` + "`no`" + ` INT(11) NOT NULL AUTO_INCREMENT,
		` + "`file_type`" + ` VARCHAR(20) NOT NULL DEFAULT 'update',
		` + "`version`" + ` VARCHAR(50) NOT NULL DEFAULT '',
		` + "`file`" + ` VARCHAR(255) NOT NULL,
		` + "`md5`" + ` VARCHAR(32) NOT NULL,
		` + "`date`" + ` DATETIME NOT NULL,
		PRIMARY KEY (` + "`no`" + `)
	) ENGINE=InnoDB DEFAULT CHARSET=utf8;`
	if db != nil {
		db.Exec(createTableQuery)
		_, _ = db.Exec("ALTER TABLE `update` ADD COLUMN `file_type` VARCHAR(20) NOT NULL DEFAULT 'update' AFTER `no`")
		_, _ = db.Exec("ALTER TABLE `update` ADD COLUMN `version` VARCHAR(50) NOT NULL DEFAULT '' AFTER `file_type`")
		_, _ = db.Exec("UPDATE `update` SET `file_type`='update' WHERE `file_type`='' OR `file_type` IS NULL")
		_, _ = db.Exec(`
			CREATE TABLE IF NOT EXISTS update_source_urls (
				file_type VARCHAR(20) NOT NULL PRIMARY KEY,
				source_url VARCHAR(1000) NOT NULL,
				updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
			) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
		`)
		syncSequentialVersions("update")
		syncSequentialVersions("launcher")
	}

	// 정적 파일 서빙
	// Root is now /update/, mapping to ./update/static
	fs := http.FileServer(http.Dir("./update/static"))
	mux.Handle("/update/", http.StripPrefix("/update/", fs))

	mux.HandleFunc("/update/api/list", listHandler)
	mux.HandleFunc("/update/api/upload", uploadHandler)
	mux.HandleFunc("/update/api/delete", deleteHandler)
	mux.HandleFunc("/update/api/latest_md5", latestMd5Handler)
	mux.HandleFunc("/update/api/latest", latestFileHandler)
	mux.HandleFunc("/update/api/latest_version", latestVersionByDateHandler)
	mux.HandleFunc("/update/api/next_version", nextVersionHandler)
	mux.HandleFunc("/update/api/source_url", sourceURLHandler)
	mux.HandleFunc("/update/api/compare_md5", compareMd5Handler)
}

func listHandler(w http.ResponseWriter, r *http.Request) {
	if db == nil {
		http.Error(w, "DB Not Connected", http.StatusInternalServerError)
		return
	}
	fileType := normalizeFileType(r.URL.Query().Get("type"))
	files, err := loadUpdateFilesByType(fileType)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	sortUpdateFiles(files)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(files)
}

func uploadHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Invalid method", http.StatusMethodNotAllowed)
		return
	}
	if db == nil {
		http.Error(w, "DB Not Connected", http.StatusInternalServerError)
		return
	}

	r.ParseMultipartForm(100 << 20)
	fileType := normalizeFileType(r.FormValue("type"))
	version := strings.TrimSpace(r.FormValue("version"))

	file, handler, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "Error retrieving file", http.StatusBadRequest)
		return
	}
	defer file.Close()

	hash := md5.New()
	if _, err := io.Copy(hash, file); err != nil {
		http.Error(w, "Hashing failed", http.StatusInternalServerError)
		return
	}
	md5Str := hex.EncodeToString(hash.Sum(nil))

	noStr := r.FormValue("no")
	now := time.Now().Format("2006-01-02 15:04:05")

	if noStr != "" {
		no, _ := strconv.Atoi(noStr)
		if version == "" {
			_ = db.QueryRow("SELECT `version` FROM `update` WHERE `no`=? LIMIT 1", no).Scan(&version)
		}
		_, err = db.Exec("UPDATE `update` SET `file_type`=?, `version`=?, `file`=?, `md5`=?, `date`=? WHERE `no`=?", fileType, version, handler.Filename, md5Str, now, no)
	} else {
		version = getNextFileVersion(fileType)
		_, err = db.Exec("INSERT INTO `update` (`file_type`, `version`, `file`, `md5`, `date`) VALUES (?, ?, ?, ?, ?)", fileType, version, handler.Filename, md5Str, now)
	}

	if err != nil {
		http.Error(w, "DB Error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Write([]byte("Success"))
}

func deleteHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Invalid method", http.StatusMethodNotAllowed)
		return
	}

	noStr := r.FormValue("no")
	no, _ := strconv.Atoi(noStr)

	_, err := db.Exec("DELETE FROM `update` WHERE `no`=?", no)
	if err != nil {
		http.Error(w, "DB Delete Error", http.StatusInternalServerError)
		return
	}
	w.Write([]byte("Deleted"))
}

func latestMd5Handler(w http.ResponseWriter, r *http.Request) {
	fileType := normalizeFileType(r.URL.Query().Get("type"))
	files, err := loadUpdateFilesByType(fileType)

	w.Header().Set("Content-Type", "application/json")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if len(files) == 0 {
		json.NewEncoder(w).Encode(map[string]string{"md5": ""})
		return
	}
	sortUpdateFiles(files)

	json.NewEncoder(w).Encode(map[string]string{"md5": files[0].Md5})
}

func latestFileHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Invalid method", http.StatusMethodNotAllowed)
		return
	}
	if db == nil {
		http.Error(w, "DB Not Connected", http.StatusInternalServerError)
		return
	}

	fileType := normalizeFileType(r.URL.Query().Get("type"))
	files, err := loadUpdateFilesByType(fileType)

	w.Header().Set("Content-Type", "application/json")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if len(files) == 0 {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"exists":    false,
			"fileType":  fileType,
			"file_type": fileType,
		})
		return
	}
	sortUpdateFiles(files)
	item := files[0]

	_ = json.NewEncoder(w).Encode(map[string]any{
		"exists": true,
		"item":   item,
	})
}

func latestVersionByDateHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Invalid method", http.StatusMethodNotAllowed)
		return
	}
	if db == nil {
		http.Error(w, "DB Not Connected", http.StatusInternalServerError)
		return
	}

	fileType := normalizeFileType(r.URL.Query().Get("type"))
	var item UpdateFile
	var dateVal []uint8
	err := db.QueryRow(
		"SELECT `no`, `file_type`, `version`, `file`, `md5`, `date` FROM `update` WHERE `file_type`=? ORDER BY `date` DESC, `no` DESC LIMIT 1",
		fileType,
	).Scan(&item.No, &item.FileType, &item.Version, &item.File, &item.Md5, &dateVal)

	w.Header().Set("Content-Type", "application/json")
	if err != nil {
		if err == sql.ErrNoRows {
			_ = json.NewEncoder(w).Encode(map[string]any{
				"exists":    false,
				"file_type": fileType,
				"fileType":  fileType,
			})
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	item.Date = string(dateVal)
	item.LegacyFileType = item.FileType
	_ = json.NewEncoder(w).Encode(map[string]any{
		"exists": true,
		"item":   item,
	})
}

func nextVersionHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Invalid method", http.StatusMethodNotAllowed)
		return
	}
	if db == nil {
		http.Error(w, "DB Not Connected", http.StatusInternalServerError)
		return
	}

	fileType := normalizeFileType(r.URL.Query().Get("type"))
	version := getNextFileVersion(fileType)

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{
		"fileType": fileType,
		"version":  version,
	})
}

func sourceURLHandler(w http.ResponseWriter, r *http.Request) {
	if db == nil {
		http.Error(w, "DB Not Connected", http.StatusInternalServerError)
		return
	}
	fileType := normalizeFileType(r.URL.Query().Get("type"))

	switch r.Method {
	case http.MethodGet:
		var sourceURL string
		err := db.QueryRow("SELECT source_url FROM update_source_urls WHERE file_type=? LIMIT 1", fileType).Scan(&sourceURL)
		w.Header().Set("Content-Type", "application/json")
		if err != nil {
			if err == sql.ErrNoRows {
				_ = json.NewEncoder(w).Encode(map[string]string{
					"fileType":  fileType,
					"sourceUrl": "",
				})
				return
			}
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]string{
			"fileType":  fileType,
			"sourceUrl": sourceURL,
		})
	case http.MethodPost:
		sourceURL := strings.TrimSpace(r.FormValue("source_url"))
		if sourceURL == "" {
			http.Error(w, "URL이 비어 있습니다.", http.StatusBadRequest)
			return
		}
		if _, err := db.Exec(`
			INSERT INTO update_source_urls (file_type, source_url)
			VALUES (?, ?)
			ON DUPLICATE KEY UPDATE source_url=VALUES(source_url)
		`, fileType, sourceURL); err != nil {
			http.Error(w, "DB Error: "+err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{
			"status":    "success",
			"fileType":  fileType,
			"sourceUrl": sourceURL,
		})
	default:
		http.Error(w, "Invalid method", http.StatusMethodNotAllowed)
	}
}

func compareMd5Handler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Invalid method", http.StatusMethodNotAllowed)
		return
	}
	if db == nil {
		http.Error(w, "DB Not Connected", http.StatusInternalServerError)
		return
	}

	fileType := normalizeFileType(r.URL.Query().Get("type"))
	result := UpdateCompareResult{
		FileType:  fileType,
		CheckedAt: time.Now().Format("2006-01-02 15:04:05"),
	}

	err := db.QueryRow("SELECT file, md5 FROM `update` WHERE `file_type`=? ORDER BY `date` DESC LIMIT 1", fileType).Scan(&result.LocalFile, &result.LocalMd5)
	if err != nil {
		if err == sql.ErrNoRows {
			result.Message = "최근 등록된 파일이 없습니다."
			writeCompareJSON(w, http.StatusOK, result)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	err = db.QueryRow("SELECT source_url FROM update_source_urls WHERE file_type=? LIMIT 1", fileType).Scan(&result.SourceURL)
	if err != nil {
		if err == sql.ErrNoRows {
			result.Message = "비교할 URL이 등록되지 않았습니다."
			writeCompareJSON(w, http.StatusOK, result)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	remoteMd5, remoteSize, err := fetchRemoteMD5(result.SourceURL)
	if err != nil {
		result.Message = fmt.Sprintf("URL 파일을 불러오지 못했습니다: %v", err)
		writeCompareJSON(w, http.StatusOK, result)
		return
	}

	result.RemoteMd5 = remoteMd5
	result.RemoteSize = remoteSize
	result.Match = strings.EqualFold(strings.TrimSpace(result.LocalMd5), strings.TrimSpace(result.RemoteMd5))
	writeCompareJSON(w, http.StatusOK, result)
}

func fetchRemoteMD5(rawURL string) (string, int64, error) {
	req, err := http.NewRequest(http.MethodGet, rawURL, nil)
	if err != nil {
		return "", 0, err
	}
	req.Header.Set("User-Agent", "KarazhanUpdateComparer/1.0")

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", 0, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", 0, fmt.Errorf("HTTP %d", resp.StatusCode)
	}

	hash := md5.New()
	size, err := io.Copy(hash, resp.Body)
	if err != nil {
		return "", 0, err
	}
	return hex.EncodeToString(hash.Sum(nil)), size, nil
}

func writeCompareJSON(w http.ResponseWriter, status int, result UpdateCompareResult) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(result)
}

func normalizeFileType(v string) string {
	switch v {
	case "launcher":
		return "launcher"
	default:
		return "update"
	}
}

func getNextLauncherVersion() string {
	return getNextFileVersion("launcher")
}

func getNextFileVersion(fileType string) string {
	if db == nil {
		return "1.0.0"
	}

	rows, err := db.Query("SELECT `version` FROM `update` WHERE `file_type`=? AND TRIM(`version`) <> ''", normalizeFileType(fileType))
	if err != nil {
		return "1.0.0"
	}
	defer rows.Close()

	maxOrdinal := -1
	for rows.Next() {
		var current string
		if err := rows.Scan(&current); err != nil {
			continue
		}
		ordinal, ok := versionOrdinal(strings.TrimSpace(current))
		if ok && ordinal > maxOrdinal {
			maxOrdinal = ordinal
		}
	}
	return formatVersionOrdinal(maxOrdinal + 1)
}

func syncSequentialVersions(fileType string) {
	if db == nil {
		return
	}
	fileType = normalizeFileType(fileType)

	rows, err := db.Query("SELECT `no` FROM `update` WHERE `file_type`=? ORDER BY `date` ASC, `no` ASC", fileType)
	if err != nil {
		return
	}
	defer rows.Close()

	type versionRow struct {
		No int
	}
	var items []versionRow
	for rows.Next() {
		var item versionRow
		if err := rows.Scan(&item.No); err != nil {
			continue
		}
		items = append(items, item)
	}
	for idx, item := range items {
		version := formatVersionOrdinal(idx)
		_, _ = db.Exec("UPDATE `update` SET `version`=? WHERE `no`=?", version, item.No)
	}
}

func formatVersionOrdinal(ordinal int) string {
	if ordinal < 0 {
		ordinal = 0
	}
	minor := ordinal / 10
	patch := ordinal % 10
	return fmt.Sprintf("1.%d.%d", minor, patch)
}

func versionOrdinal(version string) (int, bool) {
	parts := strings.Split(strings.TrimSpace(version), ".")
	if len(parts) != 3 {
		return 0, false
	}
	major, errMajor := strconv.Atoi(parts[0])
	minor, errMinor := strconv.Atoi(parts[1])
	patch, errPatch := strconv.Atoi(parts[2])
	if errMajor != nil || errMinor != nil || errPatch != nil || major < 1 || minor < 0 || patch < 0 {
		return 0, false
	}
	return (major-1)*100 + minor*10 + patch, true
}
