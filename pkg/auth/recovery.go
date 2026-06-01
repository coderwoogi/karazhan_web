package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"html"
	"karazhan/pkg/config"
	"karazhan/pkg/utils"
	"log"
	"math/big"
	"net/http"
	"strings"
	"time"

	_ "github.com/go-sql-driver/mysql"
)

const (
	recoveryTypePassword = "password"
	recoveryCodeTTL      = 10 * time.Minute
	resetTokenTTL        = 20 * time.Minute
)

type recoveryAccount struct {
	UserID   int
	Username string
	Email    string
}

func ensureAccountRecoverySchema() {
	db, err := sql.Open("mysql", config.UpdateDSN())
	if err != nil {
		log.Printf("[AuthRecovery] Update DB open failed: %v", err)
		return
	}
	defer db.Close()

	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS web_account_recovery_requests (
			id BIGINT NOT NULL AUTO_INCREMENT,
			recovery_type VARCHAR(20) NOT NULL,
			user_id INT UNSIGNED NOT NULL,
			username VARCHAR(32) NOT NULL DEFAULT '',
			email VARCHAR(255) NOT NULL DEFAULT '',
			verification_code_hash CHAR(64) NOT NULL DEFAULT '',
			reset_token_hash CHAR(64) NOT NULL DEFAULT '',
			request_ip VARCHAR(64) NOT NULL DEFAULT '',
			expires_at DATETIME NOT NULL,
			verified_at DATETIME NULL DEFAULT NULL,
			used_at DATETIME NULL DEFAULT NULL,
			attempt_count INT NOT NULL DEFAULT 0,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			PRIMARY KEY (id),
			KEY idx_recovery_lookup (recovery_type, user_id, created_at),
			KEY idx_recovery_code (recovery_type, user_id, verification_code_hash),
			KEY idx_recovery_token (reset_token_hash)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
	`)
	if err != nil {
		log.Printf("[AuthRecovery] Schema create failed: %v", err)
	}
}

func handleFindUsername(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if err := r.ParseForm(); err != nil {
		writeRecoveryJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "요청을 처리하지 못했습니다."})
		return
	}

	email := strings.TrimSpace(r.FormValue("email"))
	if email == "" {
		writeRecoveryJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "이메일을 입력해주세요."})
		return
	}

	account, err := lookupAccountByEmail(email)
	if err != nil {
		log.Printf("[AuthRecovery] Find username lookup failed: %v", err)
		writeRecoveryJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "서버 오류가 발생했습니다."})
		return
	}
	if account == nil {
		writeRecoveryJSON(w, http.StatusOK, map[string]string{
			"status":  "error",
			"message": "입력한 이메일과 일치하는 계정을 찾을 수 없습니다.",
		})
		return
	}

	writeRecoveryJSON(w, http.StatusOK, map[string]string{
		"status":   "success",
		"message":  "아이디를 확인했습니다.",
		"username": strings.ToUpper(strings.TrimSpace(account.Username)),
	})
}

func handlePasswordRecoveryRequest(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if err := r.ParseForm(); err != nil {
		writeRecoveryJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "요청을 처리하지 못했습니다."})
		return
	}

	username := strings.TrimSpace(r.FormValue("username"))
	email := strings.TrimSpace(r.FormValue("email"))
	if username == "" || email == "" {
		writeRecoveryJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "아이디와 이메일을 모두 입력해주세요."})
		return
	}

	account, err := lookupAccountByUsernameEmail(username, email)
	if err != nil {
		log.Printf("[AuthRecovery] Password request lookup failed: %v", err)
		writeRecoveryJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "서버 오류가 발생했습니다."})
		return
	}
	if account == nil {
		writeRecoveryJSON(w, http.StatusOK, map[string]string{
			"status":  "error",
			"message": "입력한 아이디와 이메일이 일치하지 않습니다.",
		})
		return
	}

	token, err := createPasswordResetSession(*account, getIP(r))
	if err != nil {
		log.Printf("[AuthRecovery] Create reset session failed: %v", err)
		writeRecoveryJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "비밀번호 재설정 세션 생성에 실패했습니다."})
		return
	}

	writeRecoveryJSON(w, http.StatusOK, map[string]string{
		"status":      "success",
		"message":     "확인되었습니다. 새 비밀번호를 설정해주세요.",
		"reset_token": token,
	})
}

func createPasswordResetSession(account recoveryAccount, requestIP string) (string, error) {
	db, err := sql.Open("mysql", config.UpdateDSN())
	if err != nil {
		return "", err
	}
	defer db.Close()

	token, err := generateRandomToken(32)
	if err != nil {
		return "", err
	}

	tokenHash := sha256Hex(token)
	now := time.Now()
	expiresAt := now.Add(resetTokenTTL)

	tx, err := db.Begin()
	if err != nil {
		return "", err
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`
		UPDATE web_account_recovery_requests
		SET used_at = NOW()
		WHERE recovery_type = ?
		  AND user_id = ?
		  AND used_at IS NULL
	`, recoveryTypePassword, account.UserID); err != nil {
		return "", err
	}

	if _, err := tx.Exec(`
		INSERT INTO web_account_recovery_requests
			(recovery_type, user_id, username, email, reset_token_hash, request_ip, expires_at, verified_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`, recoveryTypePassword, account.UserID, strings.ToUpper(account.Username), account.Email, tokenHash, requestIP, expiresAt, now); err != nil {
		return "", err
	}

	if err := tx.Commit(); err != nil {
		return "", err
	}

	return token, nil
}

func handlePasswordRecoveryVerify(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if err := r.ParseForm(); err != nil {
		writeRecoveryJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "요청을 처리하지 못했습니다."})
		return
	}

	username := strings.TrimSpace(r.FormValue("username"))
	email := strings.TrimSpace(r.FormValue("email"))
	code := strings.TrimSpace(r.FormValue("code"))
	if username == "" || email == "" || code == "" {
		writeRecoveryJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "아이디, 이메일, 인증번호를 모두 입력해주세요."})
		return
	}

	account, err := lookupAccountByUsernameEmail(username, email)
	if err != nil {
		log.Printf("[AuthRecovery] Password verify lookup failed: %v", err)
		writeRecoveryJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "서버 오류가 발생했습니다."})
		return
	}
	if account == nil {
		writeRecoveryJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "인증정보를 확인해주세요."})
		return
	}

	token, err := verifyPasswordRecoveryCode(*account, code)
	if err != nil {
		writeRecoveryJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": err.Error()})
		return
	}

	writeRecoveryJSON(w, http.StatusOK, map[string]string{
		"status":      "success",
		"message":     "인증이 완료되었습니다. 새 비밀번호를 설정해주세요.",
		"reset_token": token,
	})
}

func handlePasswordRecoveryReset(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if err := r.ParseForm(); err != nil {
		writeRecoveryJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "요청을 처리하지 못했습니다."})
		return
	}

	token := strings.TrimSpace(r.FormValue("reset_token"))
	password := r.FormValue("password")
	if token == "" || strings.TrimSpace(password) == "" {
		writeRecoveryJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "새 비밀번호를 입력해주세요."})
		return
	}
	if len(password) < 6 {
		writeRecoveryJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "비밀번호는 6자 이상으로 입력해주세요."})
		return
	}

	account, recoveryID, err := lookupRecoveryAccountByToken(token)
	if err != nil {
		log.Printf("[AuthRecovery] Lookup by token failed: %v", err)
		writeRecoveryJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "서버 오류가 발생했습니다."})
		return
	}
	if account == nil || recoveryID == 0 {
		writeRecoveryJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "비밀번호 재설정 세션이 만료되었거나 유효하지 않습니다."})
		return
	}

	if err := updateAccountPassword(account.Username, password); err != nil {
		log.Printf("[AuthRecovery] Update password failed: %v", err)
		writeRecoveryJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "비밀번호 변경에 실패했습니다."})
		return
	}
	if err := markRecoveryTokenUsed(recoveryID); err != nil {
		log.Printf("[AuthRecovery] Mark recovery used failed: %v", err)
	}

	writeRecoveryJSON(w, http.StatusOK, map[string]string{
		"status":  "success",
		"message": "비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요.",
	})
}

func lookupAccountByEmail(email string) (*recoveryAccount, error) {
	db, err := sql.Open("mysql", config.AuthDSN())
	if err != nil {
		return nil, err
	}
	defer db.Close()

	var account recoveryAccount
	err = db.QueryRow(`
		SELECT id, username, email
		FROM account
		WHERE UPPER(TRIM(email)) = UPPER(TRIM(?))
		LIMIT 1
	`, email).Scan(&account.UserID, &account.Username, &account.Email)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &account, nil
}

func lookupAccountByUsernameEmail(username, email string) (*recoveryAccount, error) {
	db, err := sql.Open("mysql", config.AuthDSN())
	if err != nil {
		return nil, err
	}
	defer db.Close()

	var account recoveryAccount
	err = db.QueryRow(`
		SELECT id, username, email
		FROM account
		WHERE UPPER(TRIM(username)) = UPPER(TRIM(?))
		  AND UPPER(TRIM(email)) = UPPER(TRIM(?))
		LIMIT 1
	`, username, email).Scan(&account.UserID, &account.Username, &account.Email)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &account, nil
}

func savePasswordRecoveryCode(account recoveryAccount, code, requestIP string) error {
	db, err := sql.Open("mysql", config.UpdateDSN())
	if err != nil {
		return err
	}
	defer db.Close()

	now := time.Now()
	expiresAt := now.Add(recoveryCodeTTL)
	codeHash := sha256Hex(code)

	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`
		UPDATE web_account_recovery_requests
		SET used_at = NOW()
		WHERE recovery_type = ?
		  AND user_id = ?
		  AND used_at IS NULL
	`, recoveryTypePassword, account.UserID); err != nil {
		return err
	}

	if _, err := tx.Exec(`
		INSERT INTO web_account_recovery_requests
			(recovery_type, user_id, username, email, verification_code_hash, request_ip, expires_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`, recoveryTypePassword, account.UserID, strings.ToUpper(account.Username), account.Email, codeHash, requestIP, expiresAt); err != nil {
		return err
	}

	return tx.Commit()
}

func verifyPasswordRecoveryCode(account recoveryAccount, code string) (string, error) {
	db, err := sql.Open("mysql", config.UpdateDSN())
	if err != nil {
		return "", err
	}
	defer db.Close()

	tx, err := db.Begin()
	if err != nil {
		return "", err
	}
	defer tx.Rollback()

	var (
		id           int64
		codeHash     string
		expiresAt    time.Time
		attemptCount int
		usedAt       sql.NullTime
	)
	err = tx.QueryRow(`
		SELECT id, verification_code_hash, expires_at, attempt_count, used_at
		FROM web_account_recovery_requests
		WHERE recovery_type = ?
		  AND user_id = ?
		ORDER BY id DESC
		LIMIT 1
		FOR UPDATE
	`, recoveryTypePassword, account.UserID).Scan(&id, &codeHash, &expiresAt, &attemptCount, &usedAt)
	if err == sql.ErrNoRows {
		return "", fmt.Errorf("먼저 인증번호를 요청해주세요.")
	}
	if err != nil {
		return "", err
	}

	if usedAt.Valid {
		return "", fmt.Errorf("이미 사용된 인증 요청입니다. 다시 진행해주세요.")
	}
	if time.Now().After(expiresAt) {
		return "", fmt.Errorf("인증번호가 만료되었습니다. 다시 요청해주세요.")
	}
	if attemptCount >= 5 {
		return "", fmt.Errorf("인증 시도 횟수를 초과했습니다. 다시 요청해주세요.")
	}

	if sha256Hex(code) != codeHash {
		if _, err := tx.Exec("UPDATE web_account_recovery_requests SET attempt_count = attempt_count + 1 WHERE id = ?", id); err != nil {
			return "", err
		}
		if err := tx.Commit(); err != nil {
			return "", err
		}
		return "", fmt.Errorf("인증번호가 올바르지 않습니다.")
	}

	token, err := generateRandomToken(32)
	if err != nil {
		return "", err
	}
	tokenHash := sha256Hex(token)
	newExpiry := time.Now().Add(resetTokenTTL)
	if _, err := tx.Exec(`
		UPDATE web_account_recovery_requests
		SET verified_at = NOW(),
		    reset_token_hash = ?,
		    expires_at = ?,
		    attempt_count = attempt_count + 1
		WHERE id = ?
	`, tokenHash, newExpiry, id); err != nil {
		return "", err
	}
	if err := tx.Commit(); err != nil {
		return "", err
	}
	return token, nil
}

func lookupRecoveryAccountByToken(token string) (*recoveryAccount, int64, error) {
	db, err := sql.Open("mysql", config.UpdateDSN())
	if err != nil {
		return nil, 0, err
	}
	defer db.Close()

	var (
		recoveryID int64
		account    recoveryAccount
	)
	err = db.QueryRow(`
		SELECT id, user_id, username, email
		FROM web_account_recovery_requests
		WHERE recovery_type = ?
		  AND reset_token_hash = ?
		  AND verified_at IS NOT NULL
		  AND used_at IS NULL
		  AND expires_at >= NOW()
		ORDER BY id DESC
		LIMIT 1
	`, recoveryTypePassword, sha256Hex(token)).Scan(&recoveryID, &account.UserID, &account.Username, &account.Email)
	if err == sql.ErrNoRows {
		return nil, 0, nil
	}
	if err != nil {
		return nil, 0, err
	}
	return &account, recoveryID, nil
}

func markRecoveryTokenUsed(recoveryID int64) error {
	db, err := sql.Open("mysql", config.UpdateDSN())
	if err != nil {
		return err
	}
	defer db.Close()

	_, err = db.Exec("UPDATE web_account_recovery_requests SET used_at = NOW() WHERE id = ?", recoveryID)
	return err
}

func updateAccountPassword(username, password string) error {
	db, err := sql.Open("mysql", config.AuthDSN())
	if err != nil {
		return err
	}
	defer db.Close()

	salt, verifier := calculateSRP6(strings.ToUpper(strings.TrimSpace(username)), password)
	_, err = db.Exec(`
		UPDATE account
		SET salt = ?, verifier = ?
		WHERE UPPER(TRIM(username)) = UPPER(TRIM(?))
	`, salt, verifier, username)
	return err
}

func sendUsernameRecoveryMail(account recoveryAccount) error {
	subject := "[Karazhan] 아이디 찾기 안내"
	hero := "요청하신 카라잔 계정 정보를 안내드립니다."
	title := "아이디 찾기 안내"
	body := fmt.Sprintf(`
		<p style="margin:0 0 18px;color:#d8cfc0;font-size:15px;line-height:1.8;">회원가입 시 입력하신 이메일로 요청된 계정 정보를 안내드립니다.</p>
		<div style="margin:0 0 24px;padding:22px;border-radius:18px;background:linear-gradient(180deg,rgba(254,236,196,.12),rgba(122,77,30,.18));border:1px solid rgba(240,198,120,.24);">
			<div style="margin:0 0 8px;color:#f1d59a;font-size:13px;letter-spacing:.12em;text-transform:uppercase;">Karazhan Account</div>
			<div style="margin:0;color:#fff2d5;font-size:28px;font-weight:800;letter-spacing:.08em;">%s</div>
		</div>
		<p style="margin:0;color:#bcae97;font-size:13px;line-height:1.7;">보안을 위해 본인이 요청하지 않았다면 이 메일은 무시하셔도 됩니다.</p>
	`, html.EscapeString(strings.ToUpper(account.Username)))

	return utils.SendHTMLMail(utils.MailMessage{
		To:       account.Email,
		Subject:  subject,
		HTMLBody: buildRecoveryMailHTML(title, hero, body),
	})
}

func sendPasswordRecoveryCodeMail(account recoveryAccount, code string) error {
	subject := "[Karazhan] 비밀번호 재설정 인증번호"
	hero := "비밀번호 재설정을 위한 인증번호를 안내드립니다."
	title := "비밀번호 재설정 인증"
	body := fmt.Sprintf(`
		<p style="margin:0 0 18px;color:#d8cfc0;font-size:15px;line-height:1.8;"><strong style="color:#fff2d5;">%s</strong> 계정의 비밀번호 재설정 요청이 접수되었습니다.</p>
		<div style="margin:0 0 14px;padding:18px 20px;border-radius:18px;background:linear-gradient(135deg,rgba(94,52,169,.18),rgba(205,148,56,.22));border:1px solid rgba(240,198,120,.2);text-align:center;">
			<div style="margin:0 0 8px;color:#cabca4;font-size:13px;letter-spacing:.14em;text-transform:uppercase;">Verification Code</div>
			<div style="margin:0;color:#fff6e3;font-size:34px;font-weight:900;letter-spacing:.35em;text-indent:.35em;">%s</div>
		</div>
		<p style="margin:0 0 8px;color:#f1d59a;font-size:14px;">유효 시간: 10분</p>
		<p style="margin:0;color:#bcae97;font-size:13px;line-height:1.7;">본인이 요청하지 않았다면 이 메일을 무시하시고, 계정 보안을 위해 비밀번호를 점검해주세요.</p>
	`, html.EscapeString(strings.ToUpper(account.Username)), html.EscapeString(code))

	return utils.SendHTMLMail(utils.MailMessage{
		To:       account.Email,
		Subject:  subject,
		HTMLBody: buildRecoveryMailHTML(title, hero, body),
	})
}

func buildRecoveryMailHTML(title, hero, body string) string {
	return fmt.Sprintf(`<!DOCTYPE html>
<html lang="ko">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>%s</title>
</head>
<body style="margin:0;padding:0;background:#09070f;font-family:Arial,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;">
	<div style="padding:32px 16px;background:
		radial-gradient(circle at top, rgba(131,98,192,.22), transparent 36%%),
		linear-gradient(180deg, #0b0812 0%%, #120d18 100%%);">
		<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%%" style="max-width:680px;margin:0 auto;border-collapse:collapse;">
			<tr>
				<td style="padding:24px;border-radius:28px;background:linear-gradient(180deg,rgba(18,14,27,.96),rgba(11,8,18,.98));border:1px solid rgba(218,183,109,.24);box-shadow:0 24px 80px rgba(0,0,0,.45);overflow:hidden;">
					<div style="padding:28px 28px 26px;border-radius:22px;background:
						linear-gradient(135deg, rgba(255,238,198,.08), rgba(142,92,34,.06)),
						radial-gradient(circle at top right, rgba(117,82,197,.18), transparent 32%%);border:1px solid rgba(240,198,120,.14);">
						<div style="margin:0 0 10px;color:#f1d59a;font-size:12px;letter-spacing:.24em;text-transform:uppercase;">Karazhan Account Center</div>
						<h1 style="margin:0 0 12px;color:#fff2d5;font-size:30px;line-height:1.2;font-weight:900;">%s</h1>
						<p style="margin:0;color:#ddd0b6;font-size:15px;line-height:1.8;">%s</p>
					</div>
					<div style="padding:28px 8px 12px;">%s</div>
					<div style="margin-top:12px;padding:18px 20px;border-radius:18px;background:rgba(255,255,255,.03);border:1px solid rgba(240,198,120,.08);color:#9f947f;font-size:12px;line-height:1.8;">
						이 메일은 Karazhan 계정 보안 요청에 따라 발송되었습니다.<br>
						문제가 지속되면 운영진에게 문의해주세요.
					</div>
				</td>
			</tr>
		</table>
	</div>
</body>
</html>`, html.EscapeString(title), html.EscapeString(title), html.EscapeString(title), html.EscapeString(hero), body)
}

func generateNumericCode(length int) (string, error) {
	if length <= 0 {
		length = 6
	}
	var builder strings.Builder
	for i := 0; i < length; i++ {
		n, err := rand.Int(rand.Reader, big.NewInt(10))
		if err != nil {
			return "", err
		}
		builder.WriteByte(byte('0' + n.Int64()))
	}
	return builder.String(), nil
}

func generateRandomToken(byteLen int) (string, error) {
	if byteLen < 16 {
		byteLen = 16
	}
	buf := make([]byte, byteLen)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

func sha256Hex(value string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(value)))
	return hex.EncodeToString(sum[:])
}

func writeRecoveryJSON(w http.ResponseWriter, status int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}
