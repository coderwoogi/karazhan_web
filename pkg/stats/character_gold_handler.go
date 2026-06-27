package stats

import (
	"database/sql"
	"encoding/json"
	"net/http"

	"karazhan/pkg/config"
)

// 캐릭터 소지금(골드) 변경 — 설정/추가/차감.
// money 는 copper 단위(INT UNSIGNED, 1골드=10000copper). 접속 중이면 서버가 로그아웃 시
// 캐시값으로 DB를 덮어쓰므로 변경이 유실된다 → 온라인 캐릭터는 차단한다.
func handleCharacterGold(w http.ResponseWriter, r *http.Request) {
	if !CheckMenuPermission(w, r, "ban") {
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		GUID   int    `json:"guid"`
		Mode   string `json:"mode"`   // set | add | sub
		Amount int64  `json:"amount"` // 골드 단위
	}
	_ = json.NewDecoder(r.Body).Decode(&req)

	if req.GUID <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "대상 캐릭터가 없습니다."})
		return
	}
	if req.Mode != "set" && req.Mode != "add" && req.Mode != "sub" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "잘못된 변경 모드입니다."})
		return
	}
	if req.Amount < 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "금액은 0 이상이어야 합니다."})
		return
	}

	db, err := sql.Open("mysql", config.CharactersDSN())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "DB 연결 오류"})
		return
	}
	defer db.Close()

	var money int64
	var online int
	var name string
	if err := db.QueryRow("SELECT name, money, online FROM characters WHERE guid = ?", req.GUID).
		Scan(&name, &money, &online); err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"status": "error", "message": "캐릭터를 찾을 수 없습니다."})
		return
	}
	if online != 0 {
		writeJSON(w, http.StatusConflict, map[string]string{"status": "error", "message": "캐릭터가 접속 중입니다. 접속 종료 후 변경해주세요."})
		return
	}

	const maxMoney int64 = 4294967295 // INT UNSIGNED 상한
	delta := req.Amount * 10000        // 골드 → copper
	var newMoney int64
	switch req.Mode {
	case "set":
		newMoney = delta
	case "add":
		newMoney = money + delta
	case "sub":
		newMoney = money - delta
	}
	if newMoney < 0 {
		newMoney = 0
	}
	if newMoney > maxMoney {
		newMoney = maxMoney
	}

	if _, err := db.Exec("UPDATE characters SET money = ? WHERE guid = ?", newMoney, req.GUID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "변경 실패: " + err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status": "success", "name": name, "money": newMoney, "gold": newMoney / 10000,
	})
}
