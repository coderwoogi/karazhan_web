package stats

// 카드뽑기 — 직업별 랜덤 장비 보상 설정(관리자).
// 관리자가 "장비 출현 확률 / 등급별 확률 / 아이템레벨 상한 / 카테고리"를 설정하면
// 뽑기 시점(pkg/wowpass)에 선택 캐릭터 직업이 착용 가능한 장비를 랜덤으로 보상한다.
// 단일 행(id=1) 설정 테이블. update DB.

import (
	"database/sql"
	"net/http"
	"strconv"
	"strings"

	"karazhan/pkg/config"
)

func ensureCarddrawEquipSchema(db *sql.DB) {
	if db == nil {
		return
	}
	_, _ = db.Exec(`
		CREATE TABLE IF NOT EXISTS web_carddraw_settings (
			id INT NOT NULL PRIMARY KEY,
			equip_enabled TINYINT(1) NOT NULL DEFAULT 0,
			equip_chance DECIMAL(6,3) NOT NULL DEFAULT 0.000,
			equip_min_ilvl INT NOT NULL DEFAULT 0,
			equip_max_ilvl INT NOT NULL DEFAULT 200,
			grade_q2 DECIMAL(6,3) NOT NULL DEFAULT 70.000,
			grade_q3 DECIMAL(6,3) NOT NULL DEFAULT 22.000,
			grade_q4 DECIMAL(6,3) NOT NULL DEFAULT 7.000,
			grade_q5 DECIMAL(6,3) NOT NULL DEFAULT 1.000,
			cat_weapon TINYINT(1) NOT NULL DEFAULT 1,
			cat_armor TINYINT(1) NOT NULL DEFAULT 1,
			cat_accessory TINYINT(1) NOT NULL DEFAULT 1,
			updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
	// 기본 행 보장
	_, _ = db.Exec(`INSERT IGNORE INTO web_carddraw_settings (id) VALUES (1)`)
}

func clampFloat(v, min, max float64) float64 {
	if v < min {
		return min
	}
	if v > max {
		return max
	}
	return v
}

func clampInt(v, min, max int) int {
	if v < min {
		return min
	}
	if v > max {
		return max
	}
	return v
}

// GET /api/content/carddraw/equip-settings
func handleCarddrawEquipSettingsGet(w http.ResponseWriter, r *http.Request) {
	if !CheckMenuPermission(w, r, "content") {
		return
	}
	db, err := sql.Open("mysql", config.UpdateDSN())
	if err != nil {
		http.Error(w, "DB Conn Error", http.StatusInternalServerError)
		return
	}
	defer db.Close()
	ensureCarddrawEquipSchema(db)

	var (
		enabled, catW, catA, catAcc int
		chance, q2, q3, q4, q5      float64
		minIlvl, maxIlvl            int
	)
	err = db.QueryRow(`SELECT equip_enabled, equip_chance, equip_min_ilvl, equip_max_ilvl,
		grade_q2, grade_q3, grade_q4, grade_q5, cat_weapon, cat_armor, cat_accessory
		FROM web_carddraw_settings WHERE id = 1`).
		Scan(&enabled, &chance, &minIlvl, &maxIlvl, &q2, &q3, &q4, &q5, &catW, &catA, &catAcc)
	if err != nil {
		http.Error(w, "Query Error", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":        "success",
		"enabled":       enabled,
		"chance":        chance,
		"minIlvl":       minIlvl,
		"maxIlvl":       maxIlvl,
		"gradeQ2":       q2,
		"gradeQ3":       q3,
		"gradeQ4":       q4,
		"gradeQ5":       q5,
		"catWeapon":     catW,
		"catArmor":      catA,
		"catAccessory":  catAcc,
	})
}

// POST /api/content/carddraw/equip-settings (form-encoded)
func handleCarddrawEquipSettingsSave(w http.ResponseWriter, r *http.Request) {
	if !CheckMenuPermission(w, r, "content") {
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	_ = r.ParseForm()

	pf := func(k string) float64 { v, _ := strconv.ParseFloat(strings.TrimSpace(r.FormValue(k)), 64); return v }
	pi := func(k string) int { v, _ := strconv.Atoi(strings.TrimSpace(r.FormValue(k))); return v }
	pb := func(k string) int {
		if strings.TrimSpace(r.FormValue(k)) == "1" {
			return 1
		}
		return 0
	}

	chance := clampFloat(pf("chance"), 0, 100)
	// 확률>0 이면 자동 활성(별도 토글 제거 — 0%면 비활성)
	enabled := 0
	if chance > 0 {
		enabled = 1
	}
	minIlvl := clampInt(pi("minIlvl"), 0, 1000)
	maxIlvl := clampInt(pi("maxIlvl"), 1, 1000)
	if maxIlvl < minIlvl {
		maxIlvl = minIlvl
	}
	q2 := clampFloat(pf("gradeQ2"), 0, 100)
	q3 := clampFloat(pf("gradeQ3"), 0, 100)
	q4 := clampFloat(pf("gradeQ4"), 0, 100)
	q5 := clampFloat(pf("gradeQ5"), 0, 100)
	catW := pb("catWeapon")
	catA := pb("catArmor")
	catAcc := pb("catAccessory")

	db, err := sql.Open("mysql", config.UpdateDSN())
	if err != nil {
		http.Error(w, "DB Conn Error", http.StatusInternalServerError)
		return
	}
	defer db.Close()
	ensureCarddrawEquipSchema(db)

	_, err = db.Exec(`UPDATE web_carddraw_settings SET
		equip_enabled=?, equip_chance=?, equip_min_ilvl=?, equip_max_ilvl=?,
		grade_q2=?, grade_q3=?, grade_q4=?, grade_q5=?,
		cat_weapon=?, cat_armor=?, cat_accessory=? WHERE id=1`,
		enabled, chance, minIlvl, maxIlvl, q2, q3, q4, q5, catW, catA, catAcc)
	if err != nil {
		http.Error(w, "Save Error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "success"})
}
