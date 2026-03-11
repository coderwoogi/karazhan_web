package launcher

import (
	"bufio"
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"karazhan/pkg/config"
	"karazhan/pkg/stats"
	"karazhan/pkg/utils"
	"log"
	"net/http"
	"os"
	"os/exec"
	"regexp"
	"strings"
	"sync"
	"time"

	_ "github.com/go-sql-driver/mysql"
)

// Process Manager
type ServerProcess struct {
	Name      string
	LogPath   string
	LogChan   chan string
	Clients   map[chan string]bool
	ClientMux sync.Mutex
	Running   bool
	Stdin     io.WriteCloser // Keep Stdin open to prevent EOF halt
}

var processes = map[string]*ServerProcess{
	"auth": {
		Name:    "authserver.exe",
		LogPath: "E:\\server\\operate\\Auth.log",
		LogChan: make(chan string, 100),
		Clients: make(map[chan string]bool),
	},
	"world": {
		Name:    "worldserver.exe",
		LogPath: "E:\\server\\operate\\logs\\Server.log",
		LogChan: make(chan string, 100),
		Clients: make(map[chan string]bool),
	},
}

func init() {
	// Start log tailers for all processes
	for _, proc := range processes {
		go tailFile(proc)
	}
}

func RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/launcher/latest", handleLatestLauncher)
	mux.HandleFunc("/api/launcher/start", handleStart)
	mux.HandleFunc("/api/launcher/stop", handleStop)
	mux.HandleFunc("/api/launcher/status", handleStatus)
	mux.HandleFunc("/api/launcher/logs", handleLogs)
	mux.HandleFunc("/api/launcher/announce", handleAnnounce)
	mux.HandleFunc("/api/launcher/command", handleWorldCommand)
	mux.HandleFunc("/api/launcher/announce/history", handleAnnounceHistory)
	mux.HandleFunc("/api/scheduler/list", handleScheduleList)
	mux.HandleFunc("/api/scheduler/add", handleScheduleAdd)

	ensureAnnounceHistoryTable()
	StartScheduler()
}

func ensureAnnounceHistoryTable() {
	dsn := config.UpdateDSNWithParams("parseTime=true&charset=utf8mb4")
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		log.Printf("announce history table init db open error: %v", err)
		return
	}
	defer db.Close()

	query := `
CREATE TABLE IF NOT EXISTS launcher_announce_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '?대젰 怨좎쑀 踰덊샇',
  sender_account VARCHAR(64) NOT NULL COMMENT '諛쒖떊 怨꾩젙紐?session_user)',
  sender_name VARCHAR(64) NOT NULL COMMENT '諛쒖떊???쒖떆紐????罹먮┃?곕챸 ?먮뒗 怨꾩젙紐?',
  message_text TEXT NOT NULL COMMENT '?꾩넚??怨듭? 硫붿떆吏 蹂몃Ц',
  sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '?꾩넚 ?쒓컖',
  send_type VARCHAR(16) NOT NULL DEFAULT 'soap' COMMENT '?꾩넚 諛⑹떇(soap/stdin)',
  ip_address VARCHAR(45) NOT NULL DEFAULT '' COMMENT '諛쒖떊 IP 二쇱냼',
  PRIMARY KEY (id),
  KEY idx_sent_at (sent_at),
  KEY idx_sender_account (sender_account)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='?멸쾶??怨듭? ?꾩넚 ?대젰';`
	if _, err := db.Exec(query); err != nil {
		log.Printf("announce history table create error: %v", err)
	}
}

// ... (skip handlers)

// Exported for Scheduler
func StartProcess(target string) error {
	proc, exists := processes[target]
	if !exists {
		return fmt.Errorf("invalid target")
	}

	// Check if already running via tasklist
	if isRunning(proc.Name) {
		return fmt.Errorf("already running")
	}

	workDir := "E:\\server\\operate\\"
	cmdPath := workDir + proc.Name

	cmd := exec.Command(cmdPath)
	cmd.Dir = workDir

	applyDetachedProcessAttributes(cmd)

	// Open Stdin Pipe to prevent EOF (WorldServer halts on EOF)
	stdin, err := cmd.StdinPipe()
	if err != nil {
		log.Printf("Failed to create stdin pipe for %s: %v", target, err)
	}
	proc.Stdin = stdin

	if err := cmd.Start(); err != nil {
		log.Printf("Failed to start %s: %v", target, err)
		return err
	}

	// We must NOT release the process if we want to hold the pipe?
	// Actually, if we release, the os.Process is invalid, but the pipe might stay open if the fd is held?
	// But `cmd.Start` starts the process. `stdin` is an `io.WriteCloser`.
	// As long as we hold `proc.Stdin`, the GC shouldn't close it, and we don't close it manually.
	// But if we `Release`, does it affect the pipe? Probably not.

	if cmd.Process != nil {
		cmd.Process.Release()
	}

	log.Printf("Started %s (Detached)", target)
	return nil
}

func handleScheduleList(w http.ResponseWriter, r *http.Request) {
	if !stats.CheckMenuPermission(w, r, "remote-schedule", "submenu") {
		return
	}
	dsn := config.UpdateDSNWithParams("parseTime=true")
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer db.Close()

	// Pagination
	queryValues := r.URL.Query()
	pageStr := queryValues.Get("page")
	limitStr := queryValues.Get("limit")

	page := 1
	if pageStr != "" {
		fmt.Sscanf(pageStr, "%d", &page)
	}
	limit := 20
	if limitStr != "" {
		fmt.Sscanf(limitStr, "%d", &limit)
	}
	if page < 1 {
		page = 1
	}
	offset := (page - 1) * limit

	// Get total count
	var totalCount int
	db.QueryRow("SELECT COUNT(*) FROM schedule").Scan(&totalCount)

	rows, err := db.Query("SELECT `no`, `date`, `action`, `target`, `processed` FROM schedule ORDER BY date DESC LIMIT ? OFFSET ?", limit, offset)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var list = make([]map[string]interface{}, 0)
	for rows.Next() {
		var no int
		var dateStr string
		var action, target string
		var processed int
		rows.Scan(&no, &dateStr, &action, &target, &processed)
		list = append(list, map[string]interface{}{
			"no": no, "date": dateStr, "action": action, "target": target, "processed": processed,
		})
	}

	totalPages := (totalCount + limit - 1) / limit

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"list":       list,
		"total":      totalCount,
		"page":       page,
		"totalPages": totalPages,
	})
}

func handleScheduleAdd(w http.ResponseWriter, r *http.Request) {
	if !stats.CheckMenuPermission(w, r, "remote-schedule", "submenu") {
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	r.ParseForm()
	date := r.FormValue("date")
	action := r.FormValue("action")
	target := r.FormValue("target")
	// etc := r.FormValue("etc")

	if date == "" || action == "" || target == "" {
		http.Error(w, "Missing fields", http.StatusBadRequest)
		return
	}

	// Replace 'T' with space for MySQL DATETIME format
	date = strings.Replace(date, "T", " ", 1)
	if len(date) == 16 {
		date += ":00" // Append seconds if missing
	}

	dsn := config.UpdateDSNWithParams("parseTime=true")
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		log.Printf("[Schedule] DB Conn Error: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer db.Close()

	_, err = db.Exec("INSERT INTO schedule (date, action, target, processed, etc) VALUES (?, ?, ?, 0, '')", date, action, target)
	if err != nil {
		log.Printf("[Schedule] Insert Error: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Log Action
	utils.LogAction(r, "", fmt.Sprintf("Add Schedule: %s %s at %s", target, action, date))

	json.NewEncoder(w).Encode(map[string]string{"status": "success"})
}

func handleStart(w http.ResponseWriter, r *http.Request) {
	if !stats.CheckMenuPermission(w, r, "remote-control", "submenu") {
		return
	}

	target := r.URL.Query().Get("target")
	if err := StartProcess(target); err != nil {
		if err.Error() == "already running" {
			json.NewEncoder(w).Encode(map[string]string{"status": "already_running", "message": target + " is already running"})
		} else {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
		return
	}

	// Log Action
	utils.LogAction(r, "", "Start Server: "+target)

	json.NewEncoder(w).Encode(map[string]string{"status": "success", "message": target + " started"})
}

func handleStop(w http.ResponseWriter, r *http.Request) {
	if !stats.CheckMenuPermission(w, r, "remote-control", "submenu") {
		return
	}

	target := r.URL.Query().Get("target")
	if err := StopProcess(target); err != nil {
		if err.Error() == "not running" {
			json.NewEncoder(w).Encode(map[string]string{"status": "not_running", "message": target + " is not running"})
		} else {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
		return
	}

	// Log Action
	utils.LogAction(r, "", "Stop Server: "+target)

	json.NewEncoder(w).Encode(map[string]string{"status": "success", "message": target + " stopped"})
}

func handleAnnounce(w http.ResponseWriter, r *http.Request) {
	if !stats.CheckMenuPermission(w, r, "remote-control", "submenu") {
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	type announceReq struct {
		Text     string `json:"text"`
		SOAPUser string `json:"soapUser"`
		SOAPPass string `json:"soapPass"`
	}

	req := announceReq{}
	_ = json.NewDecoder(r.Body).Decode(&req)
	text := strings.TrimSpace(req.Text)
	soapUser := strings.TrimSpace(req.SOAPUser)
	soapPass := req.SOAPPass
	if text == "" {
		_ = r.ParseForm()
		text = strings.TrimSpace(r.FormValue("text"))
		if soapUser == "" {
			soapUser = strings.TrimSpace(r.FormValue("soapUser"))
		}
		if soapPass == "" {
			soapPass = r.FormValue("soapPass")
		}
	}
	if text == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"status": "error", "message": "怨듭? ?댁슜???낅젰?댁＜?몄슂."})
		return
	}

	// Prefer SOAP path for safe Unicode delivery to clients.
	soapCfg := readWorldSOAPConfig("E:\\server\\operate\\configs\\worldserver.conf")
	if soapCfg.Enabled {
		if soapUser == "" || soapPass == "" {
			fileUser, filePass := utils.LoadSOAPCredentials()
			if soapUser == "" {
				soapUser = fileUser
			}
			if soapPass == "" {
				soapPass = filePass
			}
		}

		if soapUser != "" && soapPass != "" {
			if err := sendSOAPCommand(soapCfg, soapUser, soapPass, ".an "+text); err == nil {
				saveAnnounceHistory(r, text, "soap")
				utils.LogAction(r, "", "World Announcement(SOAP): "+text)
				json.NewEncoder(w).Encode(map[string]string{"status": "success", "message": "怨듭? ?꾩넚 ?꾨즺"})
				return
			} else {
				log.Printf("SOAP announce failed: %v", err)
				w.WriteHeader(http.StatusBadRequest)
				json.NewEncoder(w).Encode(map[string]string{"status": "error", "message": "SOAP 怨듭? ?꾩넚 ?ㅽ뙣: " + err.Error()})
				return
			}
		}
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"status": "error", "message": "SOAP ?ъ슜???꾪빐 SOAP 怨꾩젙/鍮꾨?踰덊샇瑜??낅젰?섍굅??KARAZHAN_SOAP_USER/KARAZHAN_SOAP_PASS ?섍꼍蹂?섎? ?ㅼ젙?댁＜?몄슂."})
		return
	}

	// Fallback: stdin (ASCII-safe only).
	if hasNonASCII(text) {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"status": "error", "message": "?쒓? 怨듭???SOAP 紐⑤뱶媛 ?꾩슂?⑸땲?? worldserver.conf?먯꽌 SOAP.Enabled=1 ?ㅼ젙 ??SOAP 怨꾩젙 ?뺣낫瑜??낅젰?댁＜?몄슂."})
		return
	}

	worldProc, ok := processes["world"]
	if !ok || !isRunning(worldProc.Name) || worldProc.Stdin == nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"status": "error", "message": "?붾뱶 ?쒕쾭 肄섏넄 ?곌껐???놁뒿?덈떎. ?⑤꼸?먯꽌 ?붾뱶 ?쒕쾭瑜??ㅽ뻾?댁＜?몄슂."})
		return
	}

	command := ".an " + text + "\n"
	if _, err := worldProc.Stdin.Write([]byte(command)); err != nil {
		log.Printf("Failed to send world announce command: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"status": "error", "message": "怨듭? ?꾩넚???ㅽ뙣?덉뒿?덈떎."})
		return
	}

	saveAnnounceHistory(r, text, "stdin")
	utils.LogAction(r, "", "World Announcement: "+text)
	json.NewEncoder(w).Encode(map[string]string{"status": "success", "message": "怨듭? ?꾩넚 ?꾨즺"})
}

func handleWorldCommand(w http.ResponseWriter, r *http.Request) {
	// Allow internal callers from same app (e.g. shop purchase flow) without remote-control menu permission.
	internalCall := strings.EqualFold(strings.TrimSpace(r.Header.Get("X-Internal-Caller")), "shop")
	if !internalCall {
		if !stats.CheckMenuPermission(w, r, "remote-control", "submenu") {
			return
		}
	}
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	type commandReq struct {
		Command  string `json:"command"`
		SOAPUser string `json:"soapUser"`
		SOAPPass string `json:"soapPass"`
	}

	req := commandReq{}
	_ = json.NewDecoder(r.Body).Decode(&req)
	command := strings.TrimSpace(req.Command)
	soapUser := strings.TrimSpace(req.SOAPUser)
	soapPass := req.SOAPPass
	if command == "" {
		_ = r.ParseForm()
		command = strings.TrimSpace(r.FormValue("command"))
		if soapUser == "" {
			soapUser = strings.TrimSpace(r.FormValue("soapUser"))
		}
		if soapPass == "" {
			soapPass = r.FormValue("soapPass")
		}
	}
	if command == "" {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "error", "message": "command is required"})
		return
	}

	// Match announce path behavior: try SOAP first when enabled, fallback to stdin.
	soapCfg := readWorldSOAPConfig("E:\\server\\operate\\configs\\worldserver.conf")
	if soapCfg.Enabled {
		if soapUser == "" || soapPass == "" {
			fileUser, filePass := utils.LoadSOAPCredentials()
			if soapUser == "" {
				soapUser = fileUser
			}
			if soapPass == "" {
				soapPass = filePass
			}
		}
		if soapUser != "" && soapPass != "" {
			if err := sendSOAPCommand(soapCfg, soapUser, soapPass, command); err == nil {
				_ = json.NewEncoder(w).Encode(map[string]string{"status": "success", "message": "command sent"})
				return
			}
		}
	}

	if hasNonASCII(command) {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "error", "message": "non-ascii command requires SOAP"})
		return
	}

	worldProc, ok := processes["world"]
	if !ok || !isRunning(worldProc.Name) || worldProc.Stdin == nil {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "error", "message": "world server console is not connected"})
		return
	}

	if _, err := worldProc.Stdin.Write([]byte(command + "\n")); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "error", "message": "command send failed: " + err.Error()})
		return
	}

	_ = json.NewEncoder(w).Encode(map[string]string{"status": "success", "message": "command sent"})
}

func handleAnnounceHistory(w http.ResponseWriter, r *http.Request) {
	if !stats.CheckMenuPermission(w, r, "remote-control", "submenu") {
		return
	}

	limit := 20
	if q := strings.TrimSpace(r.URL.Query().Get("limit")); q != "" {
		var parsed int
		fmt.Sscanf(q, "%d", &parsed)
		if parsed > 0 && parsed <= 200 {
			limit = parsed
		}
	}

	dsn := config.UpdateDSNWithParams("parseTime=true&charset=utf8mb4")
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer db.Close()

	rows, err := db.Query(`
		SELECT id, sender_account, sender_name, message_text, send_type, DATE_FORMAT(sent_at, '%Y-%m-%d %H:%i:%s') as sent_at
		FROM launcher_announce_history
		ORDER BY id DESC
		LIMIT ?`, limit)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	list := make([]map[string]interface{}, 0)
	for rows.Next() {
		var id int64
		var senderAccount, senderName, messageText, sendType, sentAt string
		if err := rows.Scan(&id, &senderAccount, &senderName, &messageText, &sendType, &sentAt); err != nil {
			continue
		}
		list = append(list, map[string]interface{}{
			"id":            id,
			"senderAccount": senderAccount,
			"senderName":    senderName,
			"messageText":   messageText,
			"sendType":      sendType,
			"sentAt":        sentAt,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"list": list})
}

func saveAnnounceHistory(r *http.Request, text string, sendType string) {
	dsn := config.UpdateDSNWithParams("parseTime=true&charset=utf8mb4")
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		log.Printf("saveAnnounceHistory db open error: %v", err)
		return
	}
	defer db.Close()

	senderAccount, senderName := resolveAnnounceSender(r, db)
	ip := resolveClientIP(r)

	_, err = db.Exec(`
		INSERT INTO launcher_announce_history
		(sender_account, sender_name, message_text, send_type, ip_address)
		VALUES (?, ?, ?, ?, ?)`,
		senderAccount, senderName, text, sendType, ip)
	if err != nil {
		log.Printf("saveAnnounceHistory insert error: %v", err)
	}
}

func resolveAnnounceSender(r *http.Request, updateDB *sql.DB) (string, string) {
	senderAccount := "unknown"
	if c, err := r.Cookie("session_user"); err == nil && strings.TrimSpace(c.Value) != "" {
		senderAccount = strings.TrimSpace(c.Value)
	}
	senderName := senderAccount

	authDB, err := sql.Open("mysql", config.AuthDSN())
	if err != nil {
		return senderAccount, senderName
	}
	defer authDB.Close()

	var userID int
	if err := authDB.QueryRow("SELECT id FROM account WHERE UPPER(TRIM(username)) = UPPER(TRIM(?))", senderAccount).Scan(&userID); err != nil {
		return senderAccount, senderName
	}

	var mainCharName string
	if err := updateDB.QueryRow("SELECT IFNULL(main_char_name, '') FROM user_profiles WHERE user_id = ?", userID).Scan(&mainCharName); err == nil {
		mainCharName = strings.TrimSpace(mainCharName)
		if mainCharName != "" {
			senderName = mainCharName
		}
	}
	return senderAccount, senderName
}

func resolveClientIP(r *http.Request) string {
	ip := strings.TrimSpace(r.RemoteAddr)
	if xff := strings.TrimSpace(r.Header.Get("X-Forwarded-For")); xff != "" {
		ip = strings.TrimSpace(strings.Split(xff, ",")[0])
	}
	if strings.HasPrefix(ip, "[") && strings.Contains(ip, "]") {
		ip = ip[1:strings.Index(ip, "]")]
	} else if strings.Count(ip, ":") == 1 {
		parts := strings.Split(ip, ":")
		if len(parts) == 2 {
			ip = parts[0]
		}
	}
	return ip
}

type worldSOAPConfig struct {
	Enabled bool
	IP      string
	Port    string
}

func readWorldSOAPConfig(path string) worldSOAPConfig {
	cfg := worldSOAPConfig{
		Enabled: false,
		IP:      "127.0.0.1",
		Port:    "7878",
	}
	f, err := os.Open(path)
	if err != nil {
		return cfg
	}
	defer f.Close()

	reKV := regexp.MustCompile(`^\s*([A-Za-z0-9\.\_]+)\s*=\s*(.+?)\s*$`)
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		m := reKV.FindStringSubmatch(line)
		if len(m) != 3 {
			continue
		}
		key := m[1]
		val := strings.Trim(strings.TrimSpace(m[2]), `"`)
		switch key {
		case "SOAP.Enabled":
			cfg.Enabled = val == "1" || strings.EqualFold(val, "true")
		case "SOAP.IP":
			if val != "" {
				cfg.IP = val
			}
		case "SOAP.Port":
			if val != "" {
				cfg.Port = val
			}
		}
	}
	return cfg
}

func sendSOAPCommand(cfg worldSOAPConfig, user, pass, cmd string) error {
	endpoint := fmt.Sprintf("http://%s:%s/", cfg.IP, cfg.Port)
	xmlBody := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<SOAP-ENV:Envelope SOAP-ENV:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"
 xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/"
 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
 xmlns:xsd="http://www.w3.org/2001/XMLSchema">
 <SOAP-ENV:Body>
  <executeCommand xmlns="urn:AC">
   <command>%s</command>
  </executeCommand>
 </SOAP-ENV:Body>
</SOAP-ENV:Envelope>`, escapeXML(cmd))

	req, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewBufferString(xmlBody))
	if err != nil {
		return err
	}
	req.SetBasicAuth(user, pass)
	req.Header.Set("Content-Type", "text/xml; charset=utf-8")
	req.Header.Set("SOAPAction", "urn:AC#executeCommand")

	client := &http.Client{Timeout: 8 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	bodyBytes, _ := io.ReadAll(resp.Body)
	body := string(bodyBytes)

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("HTTP %d: %s", resp.StatusCode, strings.TrimSpace(body))
	}
	if strings.Contains(strings.ToLower(body), "fault") {
		return fmt.Errorf("SOAP Fault: %s", strings.TrimSpace(body))
	}
	return nil
}

func hasNonASCII(s string) bool {
	for _, r := range s {
		if r > 127 {
			return true
		}
	}
	return false
}

func escapeXML(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	s = strings.ReplaceAll(s, `"`, "&quot;")
	return strings.ReplaceAll(s, "'", "&apos;")
}

func StopProcess(target string) error {
	proc, exists := processes[target]
	if !exists {
		return fmt.Errorf("invalid target")
	}

	if !isRunning(proc.Name) {
		return fmt.Errorf("not running")
	}

	// Use taskkill
	killCmd := exec.Command("taskkill", "/F", "/IM", proc.Name)
	if err := killCmd.Run(); err != nil {
		log.Printf("Failed to kill %s: %v", proc.Name, err)
		return err
	}

	return nil
}

func isRunning(imageName string) bool {
	// tasklist /FI "IMAGENAME eq authserver.exe" /NH
	cmd := exec.Command("tasklist", "/FI", fmt.Sprintf("IMAGENAME eq %s", imageName), "/NH")
	output, err := cmd.Output()
	if err != nil {
		return false
	}
	return strings.Contains(string(output), imageName)
}

func handleStatus(w http.ResponseWriter, r *http.Request) {
	if !stats.CheckMenuPermission(w, r, "remote-control", "submenu") {
		return
	}
	status := make(map[string]bool)
	for k, v := range processes {
		running := isRunning(v.Name)
		// Force log for debugging now
		// log.Printf("Status Check [%s]: Name='%s' Running=%v", k, v.Name, running)

		status[k] = running
		v.Running = running
	}
	json.NewEncoder(w).Encode(status)
}

func handleLogs(w http.ResponseWriter, r *http.Request) {
	if !stats.CheckMenuPermission(w, r, "remote-control", "submenu") {
		return
	}
	target := r.URL.Query().Get("target")
	proc, exists := processes[target]
	if !exists {
		http.Error(w, "Invalid target", http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	// 1. Send recent log history from file (to show past logs)
	historyLines, err := readLogTail(proc.LogPath, 4096) // Read last 4KB
	if err == nil {
		for _, line := range historyLines {
			if line == "" {
				continue
			}
			fmt.Fprintf(w, "data: %s\n\n", line)
		}
		w.(http.Flusher).Flush()
	}

	// 2. Subscribe to new logs
	clientChan := make(chan string, 10)
	proc.ClientMux.Lock()
	proc.Clients[clientChan] = true
	proc.ClientMux.Unlock()

	defer func() {
		proc.ClientMux.Lock()
		delete(proc.Clients, clientChan)
		proc.ClientMux.Unlock()
		close(clientChan)
	}()

	notify := r.Context().Done()

	for {
		select {
		case msg := <-clientChan:
			fmt.Fprintf(w, "data: %s\n\n", msg)
			w.(http.Flusher).Flush()
		case <-notify:
			return
		}
	}
}

func readLogTail(path string, size int64) ([]string, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	stat, err := file.Stat()
	if err != nil {
		return nil, err
	}

	fileSize := stat.Size()
	start := fileSize - size
	if start < 0 {
		start = 0
	}

	_, err = file.Seek(start, 0)
	if err != nil {
		return nil, err
	}

	buf := make([]byte, fileSize-start)
	n, err := file.Read(buf)
	if err != nil && err != io.EOF {
		return nil, err
	}

	content := string(buf[:n])
	lines := strings.Split(content, "\n")

	// Clean up lines
	var cleanLines []string
	for _, line := range lines {
		line = strings.TrimRight(line, "\r")
		if line != "" {
			cleanLines = append(cleanLines, line)
		}
	}
	return cleanLines, nil
}

func tailFile(proc *ServerProcess) {
	var offset int64 = 0

	// Initial seek to end
	file, err := os.Open(proc.LogPath)
	if err == nil {
		offset, _ = file.Seek(0, 2)
		file.Close()
	}

	for {
		file, err := os.Open(proc.LogPath)
		if err != nil {
			// File might not exist yet
			// log.Printf("[%s] File open error: %v", proc.Name, err)
			time.Sleep(2 * time.Second)
			continue
		}

		stat, err := file.Stat()
		if err != nil {
			file.Close()
			time.Sleep(1 * time.Second)
			continue
		}

		// File truncated or rotated (size decreased)
		if stat.Size() < offset {
			log.Printf("[%s] File truncated. Resetting offset.", proc.Name)
			offset = 0
		}

		if stat.Size() > offset {
			// Read new content
			// log.Printf("[%s] Reading from offset %d to %d", proc.Name, offset, stat.Size())

			buf := make([]byte, stat.Size()-offset)
			n, err := file.ReadAt(buf, offset) // ReadAt is safer/easier than Seek+Read
			if n > 0 {
				offset += int64(n)
				lines := strings.Split(string(buf[:n]), "\n")
				for _, line := range lines {
					if line == "" {
						continue
					}
					line = strings.TrimRight(line, "\r")
					broadcastLog(proc, line)
				}
			} else if err != nil && err != io.EOF {
				log.Printf("[%s] Read error: %v", proc.Name, err)
			}
		}

		file.Close()
		time.Sleep(500 * time.Millisecond) // Poll interval
	}
}

// Helper needed because we removed bufio from import? No, keeping bufio is fine if we use it.
// I used os.Read which simpler for now.

func broadcastLog(proc *ServerProcess, msg string) {
	proc.ClientMux.Lock()
	defer proc.ClientMux.Unlock()
	for client := range proc.Clients {
		select {
		case client <- msg:
		default:
			// Client blocked, skip
		}
	}
}

func handleLatestLauncher(w http.ResponseWriter, r *http.Request) {
	dsn := config.UpdateDSNWithParams("parseTime=true")
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		http.Error(w, fmt.Sprintf("Database connection error: %v", err), http.StatusInternalServerError)
		return
	}
	defer db.Close()

	getLatestLauncher(w, r, db)
}

func getLatestLauncher(w http.ResponseWriter, r *http.Request, db *sql.DB) {
	query := "SELECT * FROM launcher ORDER BY date DESC LIMIT 1"
	rows, err := db.Query(query)
	if err != nil {
		http.Error(w, fmt.Sprintf("Database query error: %v", err), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	columns, err := rows.Columns()
	if err != nil {
		http.Error(w, fmt.Sprintf("Error getting columns: %v", err), http.StatusInternalServerError)
		return
	}

	if !rows.Next() {
		http.Error(w, "No data found", http.StatusNotFound)
		return
	}

	values := make([]interface{}, len(columns))
	valuePtrs := make([]interface{}, len(columns))
	for i := range columns {
		valuePtrs[i] = &values[i]
	}

	if err := rows.Scan(valuePtrs...); err != nil {
		http.Error(w, fmt.Sprintf("Error scanning row: %v", err), http.StatusInternalServerError)
		return
	}

	finalData := make(map[string]interface{})
	for i, col := range columns {
		val := values[i]
		b, ok := val.([]byte)
		if ok {
			finalData[col] = string(b)
		} else {
			finalData[col] = val
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(finalData)
}
