package wowpass

// 카드뽑기 — 직업별 랜덤 장비 보상.
// 설정(web_carddraw_settings)에 따라, 뽑기 카드 한 장이 일정 확률로 "선택 캐릭터 직업이
// 착용 가능한 랜덤 장비"가 된다. 착용 판정은 WotLK 숙련 규칙(주력 방어구 타입) + AllowableClass.

import (
	"database/sql"
	"fmt"
	"math/rand"
	"strings"
)

type carddrawEquipSettings struct {
	Enabled                            bool
	Chance                             float64 // 카드 1장당 장비 출현 확률(%)
	MinIlvl, MaxIlvl                   int
	GradeQ2, GradeQ3, GradeQ4, GradeQ5 float64 // 고급/희귀/영웅/전설 가중치(%)
	CatWeapon, CatArmor, CatAccessory  int
}

// 설정 로드(없으면 ok=false → 장비 보상 비활성).
func loadCarddrawEquipSettings() (carddrawEquipSettings, bool) {
	var s carddrawEquipSettings
	db, err := sql.Open("mysql", updateDSN)
	if err != nil {
		return s, false
	}
	defer db.Close()
	var en int
	err = db.QueryRow(`SELECT equip_enabled, equip_chance, equip_min_ilvl, equip_max_ilvl,
		grade_q2, grade_q3, grade_q4, grade_q5, cat_weapon, cat_armor, cat_accessory
		FROM web_carddraw_settings WHERE id = 1`).
		Scan(&en, &s.Chance, &s.MinIlvl, &s.MaxIlvl, &s.GradeQ2, &s.GradeQ3, &s.GradeQ4, &s.GradeQ5,
			&s.CatWeapon, &s.CatArmor, &s.CatAccessory)
	if err != nil {
		return s, false
	}
	s.Enabled = en == 1
	return s, true
}

// 직업이 사용 가능한 무기 subclass (WotLK 숙련). item_template.subclass 기준.
// 0=1H도끼,1=2H도끼,2=활,3=총,4=1H둔기,5=2H둔기,6=장창,7=1H검,8=2H검,10=지팡이,13=주먹,15=단검,16=투척,18=석궁,19=마법봉
func weaponSubclassesForClass(c int) []int {
	switch c {
	case 1: // 전사
		return []int{0, 1, 4, 5, 6, 7, 8, 10, 13, 15, 2, 3, 18, 16}
	case 2: // 성기사
		return []int{0, 1, 4, 5, 6, 7, 8}
	case 3: // 사냥꾼
		return []int{0, 1, 6, 7, 8, 10, 13, 15, 2, 3, 18, 16}
	case 4: // 도적
		return []int{0, 4, 7, 13, 15, 2, 3, 18, 16}
	case 5: // 사제
		return []int{4, 10, 15, 19}
	case 6: // 죽음의 기사
		return []int{0, 1, 4, 5, 6, 7, 8}
	case 7: // 주술사
		return []int{0, 1, 4, 5, 13, 10, 15}
	case 8: // 마법사
		return []int{7, 10, 15, 19}
	case 9: // 흑마법사
		return []int{7, 10, 15, 19}
	case 11: // 드루이드
		return []int{4, 5, 6, 10, 13, 15}
	}
	return nil
}

// 직업의 주력 방어구 subclass + 방패/유물. 1=천,2=가죽,3=사슬,4=판금,6=방패,7=서,8=우상,9=토템,10=인장
func armorSubclassesForClass(c int) []int {
	switch c {
	case 1: // 전사: 판금 + 방패
		return []int{4, 6}
	case 2: // 성기사: 판금 + 방패 + 성서
		return []int{4, 6, 7}
	case 3: // 사냥꾼: 사슬
		return []int{3}
	case 4: // 도적: 가죽
		return []int{2}
	case 5: // 사제: 천
		return []int{1}
	case 6: // 죽음의 기사: 판금 + 인장
		return []int{4, 10}
	case 7: // 주술사: 사슬 + 방패 + 토템
		return []int{3, 6, 9}
	case 8: // 마법사: 천
		return []int{1}
	case 9: // 흑마법사: 천
		return []int{1}
	case 11: // 드루이드: 가죽 + 우상
		return []int{2, 8}
	}
	return nil
}

// 품질(Quality) → (rarity 코드, 한글 라벨)
func qualityToRarity(q int) (string, string) {
	switch q {
	case 2:
		return "uncommon", "고급"
	case 3:
		return "rare", "희귀"
	case 4:
		return "epic", "영웅"
	case 5:
		return "legendary", "전설"
	}
	return "common", "일반"
}

// 등급% 가중으로 품질(2~5) 추첨.
func rollEquipQuality(s carddrawEquipSettings) int {
	type qw struct {
		q int
		w float64
	}
	weights := []qw{{2, s.GradeQ2}, {3, s.GradeQ3}, {4, s.GradeQ4}, {5, s.GradeQ5}}
	total := 0.0
	for _, x := range weights {
		if x.w > 0 {
			total += x.w
		}
	}
	if total <= 0 {
		return 3 // 기본 희귀
	}
	p := rand.Float64() * total
	run := 0.0
	for _, x := range weights {
		if x.w <= 0 {
			continue
		}
		run += x.w
		if p <= run {
			return x.q
		}
	}
	return 3
}

func sqlPlaceholders(n int) string {
	if n <= 0 {
		return ""
	}
	return strings.TrimRight(strings.Repeat("?,", n), ",")
}

// 선택 캐릭터 직업이 착용 가능한 랜덤 장비 1건 선정. 매칭 없으면 ok=false.
func pickRandomEquipReward(class, quality int, s carddrawEquipSettings) (carddrawReward, bool) {
	if class <= 0 {
		return carddrawReward{}, false
	}
	worldDB, err := sql.Open("mysql", worldDSN)
	if err != nil {
		return carddrawReward{}, false
	}
	defer worldDB.Close()

	classBit := 0
	if class >= 1 && class <= 31 {
		classBit = 1 << (uint(class) - 1)
	}

	clauses := make([]string, 0, 3)
	subArgs := make([]interface{}, 0)

	if s.CatWeapon == 1 {
		if subs := weaponSubclassesForClass(class); len(subs) > 0 {
			clauses = append(clauses, "(it.class = 2 AND it.subclass IN ("+sqlPlaceholders(len(subs))+"))")
			for _, x := range subs {
				subArgs = append(subArgs, x)
			}
		}
	}
	if s.CatArmor == 1 {
		if subs := armorSubclassesForClass(class); len(subs) > 0 {
			// 방어구 본체/방패/유물 — 장신구 슬롯(목·반지·장신구·망토)은 제외
			clauses = append(clauses, "(it.class = 4 AND it.subclass IN ("+sqlPlaceholders(len(subs))+") AND it.InventoryType NOT IN (2,11,12,16))")
			for _, x := range subs {
				subArgs = append(subArgs, x)
			}
		}
	}
	if s.CatAccessory == 1 {
		// 목(2)·반지(11)·장신구(12)·망토(16) — 전 직업 착용
		clauses = append(clauses, "(it.class = 4 AND it.InventoryType IN (2,11,12,16))")
	}
	if len(clauses) == 0 {
		return carddrawReward{}, false
	}

	// item_template 엔 icon 컬럼이 없으므로 이름만 직접 조회(아이콘은 프런트가 itemEntry 로 해석).
	// 서버 미적재/거부 가능성이 높은 정크(displayid 0·테스트/구버전/플레이스홀더) 배제.
	query := `SELECT it.entry,
			COALESCE(NULLIF(itl.Name,''), NULLIF(it.name,''), CONCAT('아이템 ', it.entry)) AS nm
		FROM item_template it
		LEFT JOIN item_template_locale itl ON itl.ID = it.entry AND itl.locale = 'koKR'
		WHERE it.Quality = ?
		  AND it.ItemLevel BETWEEN ? AND ?
		  AND it.name <> ''
		  AND it.displayid > 0
		  AND it.name NOT LIKE 'OLD%' AND it.name NOT LIKE 'QA%' AND it.name NOT LIKE 'PH %'
		  AND it.name NOT LIKE 'TEST%' AND it.name NOT LIKE '%(test)%'
		  AND it.name NOT LIKE 'Monster %' AND it.name NOT LIKE 'ZZ%' AND it.name NOT LIKE '%DEPRECATED%'
		  AND (it.AllowableClass = -1 OR (it.AllowableClass & ?) <> 0)
		  AND (` + strings.Join(clauses, " OR ") + `)
		ORDER BY RAND() LIMIT 1`

	args := []interface{}{quality, s.MinIlvl, s.MaxIlvl, classBit}
	args = append(args, subArgs...)

	var entry int
	var name string
	if err := worldDB.QueryRow(query, args...).Scan(&entry, &name); err != nil || entry <= 0 {
		return carddrawReward{}, false
	}

	name = strings.TrimSpace(name)
	if name == "" {
		name = fmt.Sprintf("아이템 %d", entry)
	}
	rarity, label := qualityToRarity(quality)
	// Icon/IconURL 은 비워둠 — 프런트가 itemEntry 기반으로 다른 보상과 동일하게 아이콘을 표시.
	return carddrawReward{ItemEntry: entry, Name: name, Rarity: rarity, RarityLabel: label, Quantity: 1}, true
}
