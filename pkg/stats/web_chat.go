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
			deleted TINYINT NOT NULL DEFAULT 0,
			del_by VARCHAR(32) NOT NULL DEFAULT '',
			del_reason VARCHAR(255) NOT NULL DEFAULT '',
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
	// 채팅 제재(뮤트/웹밴) 기록 — 웹 차단 + 사유 표기의 단일 소스. mute는 인게임 account.mutetime 에도 반영.
	_, _ = db.Exec(`
		CREATE TABLE IF NOT EXISTS web_chat_penalties (
			id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
			target_acc INT UNSIGNED NOT NULL DEFAULT 0,
			target_name VARCHAR(24) NOT NULL DEFAULT '',
			kind VARCHAR(16) NOT NULL DEFAULT 'mute',
			reason VARCHAR(255) NOT NULL DEFAULT '',
			minutes INT NOT NULL DEFAULT 0,
			created_by_acc INT UNSIGNED NOT NULL DEFAULT 0,
			created_by_name VARCHAR(32) NOT NULL DEFAULT '',
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			expires_at DATETIME NULL DEFAULT NULL,
			active TINYINT NOT NULL DEFAULT 1,
			PRIMARY KEY (id),
			KEY idx_pen_acc (target_acc, active),
			KEY idx_pen_expire (expires_at)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
	// 기존 설치본 호환: web_ingame_chat 삭제 컬럼 보강.
	webChatAddColumnIfMissing(db, "web_ingame_chat", "deleted", "TINYINT NOT NULL DEFAULT 0")
	webChatAddColumnIfMissing(db, "web_ingame_chat", "del_by", "VARCHAR(32) NOT NULL DEFAULT ''")
	webChatAddColumnIfMissing(db, "web_ingame_chat", "del_reason", "VARCHAR(255) NOT NULL DEFAULT ''")
}

// 컬럼이 없으면 ADD (MySQL/MariaDB 공통 — information_schema 확인 후 ALTER).
func webChatAddColumnIfMissing(db *sql.DB, table, col, def string) {
	if db == nil {
		return
	}
	var cnt int
	if db.QueryRow(`SELECT COUNT(*) FROM information_schema.COLUMNS
		WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`, table, col).Scan(&cnt) != nil {
		return
	}
	if cnt == 0 {
		_, _ = db.Exec("ALTER TABLE " + table + " ADD COLUMN " + col + " " + def)
	}
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

// 채팅 표시 타입 화이트리스트(필터 SQL 주입 방지)
var webChatDisplayTypes = map[string]bool{
	"say": true, "yell": true, "whisper": true, "guild": true, "officer": true,
	"party": true, "raid": true, "channel": true, "world": true, "system": true,
}

// type 파라미터(콤마구분)를 " AND chat_type IN (?,?...)" + args 로 변환. 유효 타입 없으면 빈 필터.
func webChatTypeFilter(typeParam string) (string, []interface{}) {
	typeParam = strings.ToLower(strings.TrimSpace(typeParam))
	if typeParam == "" || typeParam == "all" {
		return "", nil
	}
	placeholders := []string{}
	args := []interface{}{}
	for _, t := range strings.Split(typeParam, ",") {
		t = strings.TrimSpace(t)
		if webChatDisplayTypes[t] {
			placeholders = append(placeholders, "?")
			args = append(args, t)
		}
	}
	if len(placeholders) == 0 {
		return "", nil
	}
	return " AND chat_type IN (" + strings.Join(placeholders, ",") + ")", args
}

// 채팅 조회:
//   before>0 : id < before 인 더 오래된 메시지 limit건(오름차순) — 위로 스크롤 시 과거 로딩
//   after>0  : id > after 인 신규 메시지(오름차순) — 폴링
//   둘 다 0  : 최신 limit건(오름차순) — 초기 로드
// type(콤마구분)로 방별 타입 필터.
func handleWebChatFetch(w http.ResponseWriter, r *http.Request) {
	if !checkAdminAuth(w, r, 2) {
		return
	}
	after := atoiDefault(r.URL.Query().Get("after"), 0)
	before := atoiDefault(r.URL.Query().Get("before"), 0)
	limit := atoiDefault(r.URL.Query().Get("limit"), 100)
	if limit < 1 || limit > 300 {
		limit = 100
	}
	typeClause, typeArgs := webChatTypeFilter(r.URL.Query().Get("type"))

	db, err := sql.Open("mysql", config.CharactersDSN())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "DB 연결 오류"})
		return
	}
	defer db.Close()

	base := `SELECT w.id, w.chat_type, w.channel_name, w.sender_name, w.sender_gm, w.target_name, w.message, w.created_at, IFNULL(c.race,0), IFNULL(c.gender,0)
		FROM web_ingame_chat w LEFT JOIN characters c ON c.name = w.sender_name
		WHERE w.deleted = 0` + typeClause
	args := append([]interface{}{}, typeArgs...)
	reverse := false // DESC로 받아 ASC로 뒤집어야 하는지
	var q string
	if before > 0 {
		q = base + " AND w.id < ? ORDER BY w.id DESC LIMIT ?"
		args = append(args, before, limit)
		reverse = true
	} else if after > 0 {
		q = base + " AND w.id > ? ORDER BY w.id ASC LIMIT ?"
		args = append(args, after, limit)
	} else {
		q = base + " ORDER BY w.id DESC LIMIT ?"
		args = append(args, limit)
		reverse = true
	}

	rows, err := db.Query(q, args...)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "조회 오류: " + err.Error()})
		return
	}
	defer rows.Close()

	items := make([]map[string]interface{}, 0)
	maxID, minID := after, 0
	for rows.Next() {
		var id, gm, race, gender int
		var ctypeV, channel, sender, target, msg, created string
		if rows.Scan(&id, &ctypeV, &channel, &sender, &gm, &target, &msg, &created, &race, &gender) != nil {
			continue
		}
		if id > maxID {
			maxID = id
		}
		if minID == 0 || id < minID {
			minID = id
		}
		items = append(items, map[string]interface{}{
			"id": id, "chat_type": ctypeV, "channel_name": channel,
			"sender_name": sender, "sender_gm": gm, "target_name": target,
			"message": msg, "created_at": created, "race": race, "gender": gender,
		})
	}
	if reverse {
		for l, rgt := 0, len(items)-1; l < rgt; l, rgt = l+1, rgt-1 {
			items[l], items[rgt] = items[rgt], items[l]
		}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status": "success", "items": items,
		"lastId": maxID, "oldestId": minID, "hasMore": len(items) == limit,
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

// ── 유저용 길드 채팅 (대표 캐릭터 기준, GM 아님) ──────────────────
// 관리자 전용 API와 달리, 로그인 유저면 누구나(대표 캐릭터+길드 보유 시) 사용 가능.

// 대표 캐릭터명 → 길드 id (없으면 0)
func webChatUserGuildID(charDB *sql.DB, mainCharName string) int {
	if charDB == nil || strings.TrimSpace(mainCharName) == "" {
		return 0
	}
	var gid int
	_ = charDB.QueryRow(
		"SELECT gm.guildid FROM characters c JOIN guild_member gm ON gm.guid = c.guid WHERE c.name = ? LIMIT 1",
		mainCharName).Scan(&gid)
	return gid
}

// 길드 채팅 조회 — 내 길드(guildid)의 guild/officer 메시지만. before/after/limit 은 handleWebChatFetch 와 동일.
func handleGuildChatFetch(w http.ResponseWriter, r *http.Request) {
	acctID, _ := webChatSessionAccount(r)
	if acctID <= 0 {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"status": "error", "message": "로그인이 필요합니다."})
		return
	}
	mainChar := webChatMainChar(acctID)

	db, err := sql.Open("mysql", config.CharactersDSN())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "DB 연결 오류"})
		return
	}
	defer db.Close()

	guildID := webChatUserGuildID(db, mainChar)
	if guildID <= 0 {
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"status": "success", "items": []interface{}{}, "guild": false, "myName": mainChar,
			"lastId": 0, "oldestId": 0, "hasMore": false,
		})
		return
	}

	after := atoiDefault(r.URL.Query().Get("after"), 0)
	before := atoiDefault(r.URL.Query().Get("before"), 0)
	limit := atoiDefault(r.URL.Query().Get("limit"), 100)
	if limit < 1 || limit > 300 {
		limit = 100
	}

	base := `SELECT w.id, w.chat_type, w.sender_name, w.sender_gm, w.message, w.created_at, c.race, c.gender
		FROM web_ingame_chat w
		JOIN characters c ON c.name = w.sender_name
		JOIN guild_member gm ON gm.guid = c.guid
		WHERE w.deleted = 0 AND w.chat_type IN ('guild','officer') AND gm.guildid = ?`
	args := []interface{}{guildID}
	reverse := false
	var q string
	if before > 0 {
		q = base + " AND w.id < ? ORDER BY w.id DESC LIMIT ?"
		args = append(args, before, limit)
		reverse = true
	} else if after > 0 {
		q = base + " AND w.id > ? ORDER BY w.id ASC LIMIT ?"
		args = append(args, after, limit)
	} else {
		q = base + " ORDER BY w.id DESC LIMIT ?"
		args = append(args, limit)
		reverse = true
	}

	rows, err := db.Query(q, args...)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "조회 오류: " + err.Error()})
		return
	}
	defer rows.Close()

	items := make([]map[string]interface{}, 0)
	maxID, minID := after, 0
	for rows.Next() {
		var id, gm, race, gender int
		var ctypeV, sender, msg, created string
		if rows.Scan(&id, &ctypeV, &sender, &gm, &msg, &created, &race, &gender) != nil {
			continue
		}
		if id > maxID {
			maxID = id
		}
		if minID == 0 || id < minID {
			minID = id
		}
		items = append(items, map[string]interface{}{
			"id": id, "chat_type": ctypeV, "sender_name": sender, "sender_gm": gm,
			"message": msg, "created_at": created, "race": race, "gender": gender,
		})
	}
	if reverse {
		for l, rgt := 0, len(items)-1; l < rgt; l, rgt = l+1, rgt-1 {
			items[l], items[rgt] = items[rgt], items[l]
		}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status": "success", "items": items, "guild": true, "myName": mainChar,
		"lastId": maxID, "oldestId": minID, "hasMore": len(items) == limit,
	})
}

// 길드 채팅 전송 — 대표 캐릭터로 guild 송신(GM 마크 없음).
func handleGuildChatSend(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	acctID, _ := webChatSessionAccount(r)
	if acctID <= 0 {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"status": "error", "message": "로그인이 필요합니다."})
		return
	}
	var req struct {
		Message string `json:"message"`
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

	mainChar := webChatMainChar(acctID)
	if mainChar == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "대표 캐릭터를 먼저 설정해주세요."})
		return
	}

	db, err := sql.Open("mysql", config.CharactersDSN())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "DB 연결 오류"})
		return
	}
	defer db.Close()

	// 채팅 제재(뮤트/웹밴) 중이면 송신 차단 + 사유 안내.
	if pen, ok := activeChatPenalty(db, acctID); ok {
		writeJSON(w, http.StatusForbidden, map[string]interface{}{
			"status": "error", "penalized": true, "kind": pen.Kind,
			"reason": pen.Reason, "expiresAt": pen.ExpiresAt, "message": chatPenaltyMessage(pen),
		})
		return
	}

	if webChatUserGuildID(db, mainChar) <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "가입된 길드가 없습니다."})
		return
	}

	// 송신 큐(GM 마크 0) + 피드 영구화
	if _, err := db.Exec(`
		INSERT INTO web_outgoing_chat (chat_type, sender_acc, sender_name, gm_mark, message, status)
		VALUES ('guild', ?, ?, 0, ?, 'pending')`, acctID, mainChar, msg); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "전송 실패: " + err.Error()})
		return
	}
	var echoID int64
	if res, e2 := db.Exec(`
		INSERT INTO web_ingame_chat (chat_type, sender_name, sender_acc, sender_gm, message)
		VALUES ('guild', ?, ?, 0, ?)`, mainChar, acctID, msg); e2 == nil {
		echoID, _ = res.LastInsertId()
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status": "success", "sender": mainChar, "echoId": echoID,
	})
}

// ── 채팅 제재(모더레이션) ────────────────────────────────────────────
// 모더레이터 = 인게임 GM(account_access 보유) 또는 웹 관리자(web_rank>=2).
//   · 메시지 삭제: web_ingame_chat.deleted=1 (피드에서 숨김)
//   · 뮤트(5분/지정): web_chat_penalties 기록 + acore_auth.account.mutetime 반영(인게임 동시)
//   · 웹밴: web_chat_penalties(kind=webban, 영구) — 웹 채팅 영구 차단
// 피제재자는 /api/chat/penalty/me 로 사유/해제시각을 자기 화면에서 확인.

// GM 여부(account_access 행 보유)
func webChatIsGM(accountID int) bool {
	if accountID <= 0 {
		return false
	}
	authDB, err := sql.Open("mysql", config.AuthDSN())
	if err != nil {
		return false
	}
	defer authDB.Close()
	var cnt int
	_ = authDB.QueryRow("SELECT COUNT(*) FROM account_access WHERE id = ?", accountID).Scan(&cnt)
	return cnt > 0
}

// 웹 관리자(web_rank>=2)
func webChatIsWebAdmin(accountID int) bool {
	if accountID <= 0 {
		return false
	}
	updateDB, err := sql.Open("mysql", config.UpdateDSN())
	if err != nil {
		return false
	}
	defer updateDB.Close()
	var rank int
	_ = updateDB.QueryRow("SELECT IFNULL(web_rank,0) FROM user_profiles WHERE user_id = ?", accountID).Scan(&rank)
	return rank >= 2
}

// 모더레이터 게이트 — (계정ID, 표시명, ok). GM 또는 웹관리자만 ok.
func chatModerator(r *http.Request) (int, string, bool) {
	accID, username := webChatSessionAccount(r)
	if accID <= 0 {
		return 0, "", false
	}
	if !webChatIsGM(accID) && !webChatIsWebAdmin(accID) {
		return accID, username, false
	}
	name := webChatMainChar(accID)
	if name == "" {
		name = username
	}
	return accID, name, true
}

type chatPenalty struct {
	Kind      string
	Reason    string
	ExpiresAt string // "" 이면 영구
}

// 활성 제재(만료 전, active=1) 1건. 웹밴 우선. 없으면 ok=false.
func activeChatPenalty(db *sql.DB, accountID int) (chatPenalty, bool) {
	if db == nil || accountID <= 0 {
		return chatPenalty{}, false
	}
	var p chatPenalty
	err := db.QueryRow(`
		SELECT kind, reason, IFNULL(DATE_FORMAT(expires_at, '%Y-%m-%d %H:%i'), '')
		FROM web_chat_penalties
		WHERE target_acc = ? AND active = 1 AND (expires_at IS NULL OR expires_at > NOW())
		ORDER BY (kind = 'webban') DESC, id DESC LIMIT 1`, accountID).
		Scan(&p.Kind, &p.Reason, &p.ExpiresAt)
	if err != nil {
		return chatPenalty{}, false
	}
	return p, true
}

// 피제재자 안내 문구
func chatPenaltyMessage(p chatPenalty) string {
	if p.Kind == "webban" {
		if p.Reason != "" {
			return "웹 채팅 이용이 정지되었습니다. 사유: " + p.Reason
		}
		return "웹 채팅 이용이 정지되었습니다."
	}
	base := "채팅이 정지되었습니다."
	if p.ExpiresAt != "" {
		base = "채팅이 정지되었습니다. (해제: " + p.ExpiresAt + ")"
	}
	if p.Reason != "" {
		base += " 사유: " + p.Reason
	}
	return base
}

// 캐릭터명 → 계정 id (없으면 0)
func resolveAccountByChar(charDB *sql.DB, name string) int {
	if charDB == nil || strings.TrimSpace(name) == "" {
		return 0
	}
	var acc int
	_ = charDB.QueryRow("SELECT account FROM characters WHERE name = ? LIMIT 1", strings.TrimSpace(name)).Scan(&acc)
	return acc
}

// POST /api/chat/mod/delete {id, reason} — 메시지 숨김
func handleChatModDelete(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	_, modName, ok := chatModerator(r)
	if !ok {
		writeJSON(w, http.StatusForbidden, map[string]string{"status": "error", "message": "권한이 없습니다."})
		return
	}
	var req struct {
		ID     int64  `json:"id"`
		Reason string `json:"reason"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)
	if req.ID <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "대상 메시지가 없습니다."})
		return
	}
	reason := strings.TrimSpace(req.Reason)
	if len([]rune(reason)) > 255 {
		reason = string([]rune(reason)[:255])
	}

	db, err := sql.Open("mysql", config.CharactersDSN())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "DB 연결 오류"})
		return
	}
	defer db.Close()
	if _, err := db.Exec("UPDATE web_ingame_chat SET deleted = 1, del_by = ?, del_reason = ? WHERE id = ? AND deleted = 0",
		modName, reason, req.ID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "삭제 실패: " + err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"status": "success", "id": req.ID})
}

// POST /api/chat/mod/penalize {target, targetAcc, kind, minutes, reason}
//   kind: "mute" | "webban". mute는 account.mutetime 에도 반영.
func handleChatModPenalize(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	modAccID, modName, ok := chatModerator(r)
	if !ok {
		writeJSON(w, http.StatusForbidden, map[string]string{"status": "error", "message": "권한이 없습니다."})
		return
	}
	var req struct {
		Target    string `json:"target"`
		TargetAcc int    `json:"targetAcc"`
		Kind      string `json:"kind"`
		Minutes   int    `json:"minutes"`
		Reason    string `json:"reason"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)

	kind := strings.ToLower(strings.TrimSpace(req.Kind))
	if kind != "webban" {
		kind = "mute"
	}
	reason := strings.TrimSpace(req.Reason)
	if len([]rune(reason)) > 255 {
		reason = string([]rune(reason)[:255])
	}
	minutes := req.Minutes
	if kind == "mute" && minutes <= 0 {
		minutes = 5
	}

	db, err := sql.Open("mysql", config.CharactersDSN())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "DB 연결 오류"})
		return
	}
	defer db.Close()

	targetName := strings.TrimSpace(req.Target)
	targetAcc := req.TargetAcc
	if targetAcc <= 0 {
		targetAcc = resolveAccountByChar(db, targetName)
	}
	if targetAcc <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "대상 계정을 찾을 수 없습니다."})
		return
	}

	if kind == "mute" {
		if _, err := db.Exec(`INSERT INTO web_chat_penalties
			(target_acc, target_name, kind, reason, minutes, created_by_acc, created_by_name, expires_at, active)
			VALUES (?, ?, 'mute', ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE), 1)`,
			targetAcc, targetName, reason, minutes, modAccID, modName, minutes); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "제재 기록 실패: " + err.Error()})
			return
		}
		// 인게임 동시 적용(표준 account mute) — 재접속 시/세션 재로딩 시 반영. 베스트에포트.
		if authDB, e := sql.Open("mysql", config.AuthDSN()); e == nil {
			defer authDB.Close()
			_, _ = authDB.Exec("UPDATE account SET mutetime = UNIX_TIMESTAMP() + ?*60, mutereason = ?, muteby = ? WHERE id = ?",
				minutes, reason, modName, targetAcc)
		}
	} else {
		if _, err := db.Exec(`INSERT INTO web_chat_penalties
			(target_acc, target_name, kind, reason, minutes, created_by_acc, created_by_name, expires_at, active)
			VALUES (?, ?, 'webban', ?, 0, ?, ?, NULL, 1)`,
			targetAcc, targetName, reason, modAccID, modName); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "제재 기록 실패: " + err.Error()})
			return
		}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status": "success", "kind": kind, "minutes": minutes, "target": targetName,
	})
}

// POST /api/chat/mod/lift {id} — 제재 해제(뮤트면 account.mutetime 도 해제)
func handleChatModLift(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if _, _, ok := chatModerator(r); !ok {
		writeJSON(w, http.StatusForbidden, map[string]string{"status": "error", "message": "권한이 없습니다."})
		return
	}
	var req struct {
		ID int64 `json:"id"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)
	if req.ID <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "대상이 없습니다."})
		return
	}

	db, err := sql.Open("mysql", config.CharactersDSN())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "DB 연결 오류"})
		return
	}
	defer db.Close()

	var kind string
	var targetAcc int
	_ = db.QueryRow("SELECT kind, target_acc FROM web_chat_penalties WHERE id = ?", req.ID).Scan(&kind, &targetAcc)
	if _, err := db.Exec("UPDATE web_chat_penalties SET active = 0 WHERE id = ?", req.ID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "해제 실패: " + err.Error()})
		return
	}
	if kind == "mute" && targetAcc > 0 {
		if authDB, e := sql.Open("mysql", config.AuthDSN()); e == nil {
			defer authDB.Close()
			_, _ = authDB.Exec("UPDATE account SET mutetime = 0 WHERE id = ?", targetAcc)
		}
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "success"})
}

// GET /api/chat/mod/can — 현재 세션이 모더레이터인지(메뉴 노출 판단)
func handleChatModCan(w http.ResponseWriter, r *http.Request) {
	_, name, ok := chatModerator(r)
	writeJSON(w, http.StatusOK, map[string]interface{}{"status": "success", "moderator": ok, "name": name})
}

// GET /api/chat/penalty/me — 내 활성 제재(사유/해제시각). 피제재자 화면 배너용.
func handleChatPenaltyMe(w http.ResponseWriter, r *http.Request) {
	accID, _ := webChatSessionAccount(r)
	if accID <= 0 {
		writeJSON(w, http.StatusOK, map[string]interface{}{"status": "success", "penalized": false})
		return
	}
	db, err := sql.Open("mysql", config.CharactersDSN())
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]interface{}{"status": "success", "penalized": false})
		return
	}
	defer db.Close()

	// 1순위: 웹 제재 기록
	if pen, ok := activeChatPenalty(db, accID); ok {
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"status": "success", "penalized": true, "kind": pen.Kind,
			"reason": pen.Reason, "expiresAt": pen.ExpiresAt, "message": chatPenaltyMessage(pen),
		})
		return
	}
	// 2순위: 인게임 계정 mute(웹 경로 외에서 걸린 경우도 표기)
	if authDB, e := sql.Open("mysql", config.AuthDSN()); e == nil {
		defer authDB.Close()
		var remain int64
		var reason, expires string
		_ = authDB.QueryRow(`SELECT GREATEST(mutetime - UNIX_TIMESTAMP(), 0), IFNULL(mutereason,''),
			IFNULL(DATE_FORMAT(FROM_UNIXTIME(mutetime), '%Y-%m-%d %H:%i'), '')
			FROM account WHERE id = ?`, accID).Scan(&remain, &reason, &expires)
		if remain > 0 {
			pen := chatPenalty{Kind: "mute", Reason: reason, ExpiresAt: expires}
			writeJSON(w, http.StatusOK, map[string]interface{}{
				"status": "success", "penalized": true, "kind": "mute",
				"reason": reason, "expiresAt": expires, "message": chatPenaltyMessage(pen),
			})
			return
		}
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"status": "success", "penalized": false})
}
