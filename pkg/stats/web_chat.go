package stats

// 웹 ↔ 인게임 채팅 브리지 (웹 측 API)
//   수신: web_ingame_chat 를 폴링(/api/chat/ingame/fetch) — 모듈이 OnPlayerChat 훅으로 적재
//   송신: web_outgoing_chat 에 큐잉(/api/chat/ingame/send) — 모듈이 타이머로 폴링 후 대표 캐릭(+GM 마크)으로 채널 주입
// 권한: webRank>=2 관리자(checkAdminAuth). 스키마는 기동 시 자동 생성.

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"

	"karazhan/pkg/config"
)

// 송신 허용 채팅 타입
var webChatAllowedTypes = map[string]bool{
	"say": true, "yell": true, "whisper": true, "guild": true, "officer": true,
	"party": true, "raid": true, "channel": true, "world": true,
}

// 브리지 테이블 생성(characters DB).
func ensureWebChatSchema() {
	db, err := sql.Open("mysql", config.CharactersDSN())
	if err != nil {
		return
	}
	defer db.Close()
	_, _ = db.Exec(`
		CREATE TABLE IF NOT EXISTS web_ingame_chat (
			id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
			chat_type VARCHAR(16) NOT NULL DEFAULT 'say',
			channel_name VARCHAR(64) NOT NULL DEFAULT '',
			sender_guid INT UNSIGNED NOT NULL DEFAULT 0,
			sender_name VARCHAR(24) NOT NULL DEFAULT '',
			sender_acc INT UNSIGNED NOT NULL DEFAULT 0,
			sender_gm TINYINT NOT NULL DEFAULT 0,
			target_name VARCHAR(24) NOT NULL DEFAULT '',
			language INT NOT NULL DEFAULT 0,
			message VARCHAR(512) NOT NULL DEFAULT '',
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY (id),
			KEY idx_chat_created (created_at),
			KEY idx_chat_type (chat_type),
			KEY idx_chat_target (target_name)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
	_, _ = db.Exec(`
		CREATE TABLE IF NOT EXISTS web_outgoing_chat (
			id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
			chat_type VARCHAR(16) NOT NULL DEFAULT 'world',
			channel_name VARCHAR(64) NOT NULL DEFAULT '',
			target_name VARCHAR(24) NOT NULL DEFAULT '',
			sender_acc INT UNSIGNED NOT NULL DEFAULT 0,
			sender_name VARCHAR(24) NOT NULL DEFAULT '',
			gm_mark TINYINT NOT NULL DEFAULT 1,
			message VARCHAR(512) NOT NULL DEFAULT '',
			status ENUM('pending','sent','failed') NOT NULL DEFAULT 'pending',
			error VARCHAR(255) NOT NULL DEFAULT '',
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			sent_at DATETIME NULL DEFAULT NULL,
			PRIMARY KEY (id),
			KEY idx_out_status (status, id),
			KEY idx_out_created (created_at)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
}

// 세션(session_user) → 계정 ID + username.
func webChatSessionAccount(r *http.Request) (int, string) {
	cookie, err := r.Cookie("session_user")
	if err != nil || strings.TrimSpace(cookie.Value) == "" {
		return 0, ""
	}
	username := strings.TrimSpace(cookie.Value)
	authDB, err := sql.Open("mysql", config.AuthDSN())
	if err != nil {
		return 0, username
	}
	defer authDB.Close()
	var id int
	_ = authDB.QueryRow("SELECT id FROM account WHERE UPPER(TRIM(username))=UPPER(TRIM(?))", username).Scan(&id)
	return id, username
}

// 계정의 대표 캐릭터명(user_profiles.main_char_name).
func webChatMainChar(accountID int) string {
	if accountID <= 0 {
		return ""
	}
	updateDB, err := sql.Open("mysql", config.UpdateDSN())
	if err != nil {
		return ""
	}
	defer updateDB.Close()
	var name string
	_ = updateDB.QueryRow("SELECT IFNULL(main_char_name,'') FROM user_profiles WHERE user_id=?", accountID).Scan(&name)
	return strings.TrimSpace(name)
}

// 수신 폴링: after 이후의 신규 채팅. after=0 이면 최신 limit건(오름차순)으로 초기 로드.
func handleWebChatFetch(w http.ResponseWriter, r *http.Request) {
	if !checkAdminAuth(w, r, 2) {
		return
	}
	after := atoiDefault(r.URL.Query().Get("after"), 0)
	limit := atoiDefault(r.URL.Query().Get("limit"), 100)
	if limit < 1 || limit > 300 {
		limit = 100
	}
	ctype := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("type")))

	db, err := sql.Open("mysql", config.CharactersDSN())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "DB 연결 오류"})
		return
	}
	defer db.Close()

	var rows *sql.Rows
	typeFilter := ""
	args := []interface{}{}
	if ctype != "" && ctype != "all" {
		typeFilter = " AND chat_type = ?"
	}

	base := "SELECT id, chat_type, channel_name, sender_name, sender_gm, target_name, message, created_at FROM web_ingame_chat WHERE 1=1"
	if after > 0 {
		// 증분: id > after 오름차순
		q := base + " AND id > ?" + typeFilter + " ORDER BY id ASC LIMIT ?"
		args = append(args, after)
		if typeFilter != "" {
			args = append(args, ctype)
		}
		args = append(args, limit)
		rows, err = db.Query(q, args...)
	} else {
		// 초기: 최신 limit건 → 이후 오름차순으로 뒤집어 반환
		q := base + typeFilter + " ORDER BY id DESC LIMIT ?"
		if typeFilter != "" {
			args = append(args, ctype)
		}
		args = append(args, limit)
		rows, err = db.Query(q, args...)
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "조회 오류: " + err.Error()})
		return
	}
	defer rows.Close()

	items := make([]map[string]interface{}, 0)
	lastID := after
	for rows.Next() {
		var id, gm int
		var ctypeV, channel, sender, target, msg, created string
		if rows.Scan(&id, &ctypeV, &channel, &sender, &gm, &target, &msg, &created) != nil {
			continue
		}
		if id > lastID {
			lastID = id
		}
		items = append(items, map[string]interface{}{
			"id": id, "chat_type": ctypeV, "channel_name": channel,
			"sender_name": sender, "sender_gm": gm, "target_name": target,
			"message": msg, "created_at": created,
		})
	}
	// 초기 로드(DESC)면 오름차순으로 뒤집어 표시
	if after == 0 {
		for l, rgt := 0, len(items)-1; l < rgt; l, rgt = l+1, rgt-1 {
			items[l], items[rgt] = items[rgt], items[l]
		}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status": "success", "items": items, "lastId": lastID,
	})
}

// 송신: web_outgoing_chat 에 큐잉. 발신자=계정 대표 캐릭터, GM 마크 ON.
func handleWebChatSend(w http.ResponseWriter, r *http.Request) {
	if !checkAdminAuth(w, r, 2) {
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		ChatType    string `json:"chat_type"`
		ChannelName string `json:"channel_name"`
		TargetName  string `json:"target_name"`
		Message     string `json:"message"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)

	msg := strings.TrimSpace(req.Message)
	if msg == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "메시지를 입력해주세요."})
		return
	}
	if len([]rune(msg)) > 512 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "메시지가 너무 깁니다(최대 512자)."})
		return
	}
	ctype := strings.ToLower(strings.TrimSpace(req.ChatType))
	if ctype == "" {
		ctype = "world"
	}
	if !webChatAllowedTypes[ctype] {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "지원하지 않는 채팅 타입입니다."})
		return
	}
	channel := strings.TrimSpace(req.ChannelName)
	target := strings.TrimSpace(req.TargetName)
	if ctype == "whisper" && target == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "귓속말 대상 캐릭터를 입력해주세요."})
		return
	}
	if ctype == "channel" && channel == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "채널 이름을 입력해주세요."})
		return
	}

	acctID, username := webChatSessionAccount(r)
	sender := webChatMainChar(acctID)
	if sender == "" {
		sender = username // 대표 캐릭터 미지정 시 계정명 폴백
	}

	db, err := sql.Open("mysql", config.CharactersDSN())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "DB 연결 오류"})
		return
	}
	defer db.Close()

	// 1) 인게임 송신 큐 적재 — 모듈이 폴링해 채널에 주입
	_, err = db.Exec(`
		INSERT INTO web_outgoing_chat (chat_type, channel_name, target_name, sender_acc, sender_name, gm_mark, message, status)
		VALUES (?, ?, ?, ?, ?, 1, ?, 'pending')`,
		ctype, channel, target, acctID, sender, msg)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "전송 큐 적재 실패: " + err.Error()})
		return
	}

	// 2) 웹 피드(web_ingame_chat)에도 기록 — 새로고침해도 내가 보낸 대화가 남도록 영구화.
	//    반환한 echoId 로 프런트가 폴링 중복 표시를 방지한다.
	var echoID int64
	if res, e2 := db.Exec(`
		INSERT INTO web_ingame_chat (chat_type, channel_name, sender_name, sender_acc, sender_gm, target_name, message)
		VALUES (?, ?, ?, ?, 1, ?, ?)`,
		ctype, channel, sender, acctID, target, msg); e2 == nil {
		echoID, _ = res.LastInsertId()
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status": "success", "sender": sender, "gm": true, "chat_type": ctype, "echoId": echoID,
	})
}
