package update

import (
	"crypto/md5"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"time"

	_ "github.com/go-sql-driver/mysql"
)

// DB설정: Localhost
const (
	DBHost = "tcp(localhost:3306)"
	DBUser = "root"
	DBPass = "4618"
	DBName = "update"
)

var db *sql.DB

type UpdateFile struct {
	No       int    `json:"no"`
	File     string `json:"file"`
	Md5      string `json:"md5"`
	Date     string `json:"date"`
	FileType string `json:"fileType"`
}

func RegisterRoutes(mux *http.ServeMux) {
	var err error
	dsn := fmt.Sprintf("%s:%s@%s/%s?parseTime=true", DBUser, DBPass, DBHost, DBName)
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
		` + "`file`" + ` VARCHAR(255) NOT NULL,
		` + "`md5`" + ` VARCHAR(32) NOT NULL,
		` + "`date`" + ` DATETIME NOT NULL,
		PRIMARY KEY (` + "`no`" + `)
	) ENGINE=InnoDB DEFAULT CHARSET=utf8;`
	if db != nil {
		db.Exec(createTableQuery)
		_, _ = db.Exec("ALTER TABLE `update` ADD COLUMN `file_type` VARCHAR(20) NOT NULL DEFAULT 'update' AFTER `no`")
		_, _ = db.Exec("UPDATE `update` SET `file_type`='update' WHERE `file_type`='' OR `file_type` IS NULL")
	}

	// 정적 파일 서빙
	// Root is now /update/, mapping to ./update/static
	fs := http.FileServer(http.Dir("./update/static"))
	mux.Handle("/update/", http.StripPrefix("/update/", fs))

	mux.HandleFunc("/update/api/list", listHandler)
	mux.HandleFunc("/update/api/upload", uploadHandler)
	mux.HandleFunc("/update/api/delete", deleteHandler)
	mux.HandleFunc("/update/api/latest_md5", latestMd5Handler)
}

func listHandler(w http.ResponseWriter, r *http.Request) {
	if db == nil {
		http.Error(w, "DB Not Connected", http.StatusInternalServerError)
		return
	}
	fileType := normalizeFileType(r.URL.Query().Get("type"))
	rows, err := db.Query("SELECT `no`, `file_type`, `file`, `md5`, `date` FROM `update` WHERE `file_type`=? ORDER BY `date` DESC", fileType)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var files []UpdateFile
	for rows.Next() {
		var f UpdateFile
		var dateVal []uint8
		if err := rows.Scan(&f.No, &f.FileType, &f.File, &f.Md5, &dateVal); err != nil {
			log.Println(err)
			continue
		}
		f.Date = string(dateVal)
		files = append(files, f)
	}

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
		_, err = db.Exec("UPDATE `update` SET `file_type`=?, `file`=?, `md5`=?, `date`=? WHERE `no`=?", fileType, handler.Filename, md5Str, now, no)
	} else {
		_, err = db.Exec("INSERT INTO `update` (`file_type`, `file`, `md5`, `date`) VALUES (?, ?, ?, ?)", fileType, handler.Filename, md5Str, now)
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
	var md5 string
	err := db.QueryRow("SELECT `md5` FROM `update` WHERE `file_type`=? ORDER BY `date` DESC LIMIT 1", fileType).Scan(&md5)

	w.Header().Set("Content-Type", "application/json")
	if err != nil {
		if err == sql.ErrNoRows {
			json.NewEncoder(w).Encode(map[string]string{"md5": ""})
		} else {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
		return
	}

	json.NewEncoder(w).Encode(map[string]string{"md5": md5})
}

func normalizeFileType(v string) string {
	switch v {
	case "launcher":
		return "launcher"
	default:
		return "update"
	}
}
