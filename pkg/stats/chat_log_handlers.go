package stats

import (
	"bufio"
	"encoding/json"
	"fmt"
	"karazhan/pkg/config"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
)

type chatLogEntry struct {
	Line      int    `json:"line"`
	Time      string `json:"time"`
	Character string `json:"character"`
	Channel   string `json:"channel"`
	Language  string `json:"language"`
	Message   string `json:"message"`
	Raw       string `json:"raw"`
}

var chatLogPlayerPattern = regexp.MustCompile(`^Player\s+(.+?)\s+([A-Za-z]+)\s+\(language\s+([0-9]+)\):\s?(.*)$`)

func handleChatLogs(w http.ResponseWriter, r *http.Request) {
	if !isChatLogOwner(r) {
		writeJSON(w, http.StatusForbidden, map[string]string{"status": "forbidden", "message": "채팅 로그는 지정된 관리자만 접근할 수 있습니다."})
		return
	}

	page := atoiDefault(r.URL.Query().Get("page"), 1)
	limit := atoiDefault(r.URL.Query().Get("limit"), 20)
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}
	query := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("q")))
	channel := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("channel")))

	path, checkedPaths := resolveChatLogPath()
	if path == "" {
		writeJSON(w, http.StatusNotFound, map[string]interface{}{
			"status":       "error",
			"message":      "chat.log 파일을 찾을 수 없습니다. 경로 또는 웹 프로세스의 파일 접근 권한을 확인해주세요.",
			"checkedPaths": checkedPaths,
		})
		return
	}

	entries, err := readChatLogEntries(path, query, channel)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": err.Error()})
		return
	}
	for left, right := 0, len(entries)-1; left < right; left, right = left+1, right-1 {
		entries[left], entries[right] = entries[right], entries[left]
	}

	total := len(entries)
	offset := (page - 1) * limit
	start := offset
	if start > total {
		start = total
	}
	end := start + limit
	if end > total {
		end = total
	}

	pageItems := make([]chatLogEntry, 0)
	if start < end {
		pageItems = entries[start:end]
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"status":     "success",
		"items":      pageItems,
		"total":      total,
		"page":       page,
		"totalPages": (total + limit - 1) / limit,
		"path":       path,
		"order":      "file_tail_first",
	})
}

func isChatLogOwner(r *http.Request) bool {
	cookie, err := r.Cookie("session_user")
	if err != nil {
		return false
	}
	return strings.EqualFold(strings.TrimSpace(cookie.Value), "cpo5704")
}

func resolveChatLogPath() (string, []string) {
	candidates := []string{
		safeMacPath(strings.TrimSpace(config.ChatLogPath())),
		safeMacPath(strings.TrimSpace(os.Getenv("KARAZHAN_CHAT_LOG_PATH"))),
		`E:/server/operate/logs/Chat.log`,
		`E:/server/operate/logs/chat.log`,
		`/opt/homebrew/var/www/karazhan/logs/Chat.log`,
		`/opt/homebrew/var/www/karazhan/logs/chat.log`,
		`/opt/homebrew/var/log/karazhan/Chat.log`,
		`/opt/homebrew/var/log/karazhan/chat.log`,
	}
	if wd, err := os.Getwd(); err == nil && strings.TrimSpace(wd) != "" {
		candidates = append([]string{
			filepath.Join(wd, "logs", "Chat.log"),
			filepath.Join(wd, "logs", "chat.log"),
		}, candidates...)
	}

	checked := make([]string, 0, len(candidates))
	seen := make(map[string]bool)
	for _, path := range candidates {
		path = strings.TrimSpace(path)
		if path == "" {
			continue
		}
		if seen[path] {
			continue
		}
		seen[path] = true
		if info, err := os.Stat(path); err == nil && !info.IsDir() {
			checked = append(checked, path+" => OK")
			return path, checked
		} else if err != nil {
			checked = append(checked, fmt.Sprintf("%s => %v", path, err))
		} else if info != nil && info.IsDir() {
			checked = append(checked, path+" => directory")
		}
	}
	return "", checked
}

func safeMacPath(path string) string {
	if runtime.GOOS != "darwin" {
		return path
	}
	cleaned := filepath.Clean(path)
	if strings.HasPrefix(cleaned, "/Users/choitaeuk/Desktop/") || cleaned == "/Users/choitaeuk/Desktop" {
		return ""
	}
	return path
}

func readChatLogEntries(path, query, channel string) ([]chatLogEntry, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)

	items := make([]chatLogEntry, 0)
	lineNo := 0
	for scanner.Scan() {
		lineNo++
		raw := strings.TrimSpace(scanner.Text())
		if raw == "" {
			continue
		}
		item := parseChatLogLine(raw, lineNo)
		if channel != "" && channel != "all" && strings.ToLower(item.Channel) != channel {
			continue
		}
		if query != "" {
			haystack := strings.ToLower(item.Character + " " + item.Channel + " " + item.Language + " " + item.Message + " " + item.Raw)
			if !strings.Contains(haystack, query) {
				continue
			}
		}
		items = append(items, item)
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	return items, nil
}

func parseChatLogLine(raw string, lineNo int) chatLogEntry {
	item := chatLogEntry{
		Line:    lineNo,
		Time:    "-",
		Channel: "raw",
		Message: raw,
		Raw:     raw,
	}

	match := chatLogPlayerPattern.FindStringSubmatch(raw)
	if len(match) == 5 {
		item.Character = strings.TrimSpace(match[1])
		item.Channel = normalizeChatChannel(match[2])
		item.Language = strings.TrimSpace(match[3])
		item.Message = strings.TrimSpace(match[4])
	}

	return item
}

func normalizeChatChannel(action string) string {
	switch strings.ToLower(strings.TrimSpace(action)) {
	case "says", "say":
		return "say"
	case "yells", "yell":
		return "yell"
	case "whispers", "whisper":
		return "whisper"
	case "guild":
		return "guild"
	case "party":
		return "party"
	default:
		return strings.ToLower(strings.TrimSpace(action))
	}
}
