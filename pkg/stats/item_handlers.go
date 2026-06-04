package stats

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"karazhan/pkg/auth"
	"karazhan/pkg/config"
	"log"
	"net/http"
	"strconv"
	"strings"
)

type ItemSearchResult struct {
	Entry   uint32 `json:"entry"`
	Name    string `json:"name"`
	Quality uint8  `json:"quality"`
}

type ItemTooltipResponse struct {
	Status                string   `json:"status"`
	Entry                 uint32   `json:"entry"`
	Name                  string   `json:"name"`
	Description           string   `json:"description"`
	ScriptName            string   `json:"script_name"`
	Quality               uint8    `json:"quality"`
	ItemLevel             int      `json:"item_level"`
	RequiredLevel         int      `json:"required_level"`
	ClassID               int      `json:"class_id"`
	SubClassID            int      `json:"subclass_id"`
	ClassName             string   `json:"class_name"`
	SubClassName          string   `json:"subclass_name"`
	InventoryType         int      `json:"inventory_type"`
	InventoryName         string   `json:"inventory_name"`
	SoundOverrideSubclass int      `json:"sound_override_subclass"`
	DisplayID             int      `json:"display_id"`
	BuyCount              int      `json:"buy_count"`
	BuyPrice              int      `json:"buy_price"`
	SellPrice             int      `json:"sell_price"`
	MaxCount              int      `json:"max_count"`
	Stackable             int      `json:"stackable"`
	StartQuest            int      `json:"start_quest"`
	Material              int      `json:"material"`
	RandomProperty        int      `json:"random_property"`
	RandomSuffix          int      `json:"random_suffix"`
	BagFamily             int      `json:"bag_family"`
	ContainerSlots        int      `json:"container_slots"`
	TotemCategory         int      `json:"totem_category"`
	Duration              int      `json:"duration"`
	ItemLimitCategory     int      `json:"item_limit_category"`
	DisenchantID          int      `json:"disenchant_id"`
	FoodType              int      `json:"food_type"`
	MinMoneyLoot          int      `json:"min_money_loot"`
	MaxMoneyLoot          int      `json:"max_money_loot"`
	ItemSet               int      `json:"item_set"`
	Bonding               int      `json:"bonding"`
	Flags                 int      `json:"flags"`
	FlagsExtra            int      `json:"flags_extra"`
	FlagsCustom           int      `json:"flags_custom"`
	PageText              int      `json:"page_text"`
	PageMaterial          int      `json:"page_material"`
	LanguageID            int      `json:"language_id"`
	Armor                 int      `json:"armor"`
	MinDamage             float64  `json:"min_damage"`
	MaxDamage             float64  `json:"max_damage"`
	SpeedMS               int      `json:"speed_ms"`
	Stats                 []string `json:"stats"`
	Spells                []string `json:"spells"`
}

func handleItemSearch(w http.ResponseWriter, r *http.Request) {
	if !hasItemSearchPermission(w, r) {
		return
	}

	query := r.URL.Query().Get("q")
	trimmedQuery := strings.TrimSpace(query)
	if len(trimmedQuery) < 2 {
		if _, convErr := strconv.Atoi(trimmedQuery); convErr != nil {
			http.Error(w, "Query too short", http.StatusBadRequest)
			return
		}
	}
	query = trimmedQuery

	// Connect to WORLD DB
	worldDSN := config.WorldDSN()
	db, err := sql.Open("mysql", worldDSN)
	if err != nil {
		http.Error(w, "DB Conn Error", http.StatusInternalServerError)
		return
	}
	defer db.Close()

	// Search items by name (English or Korean)
	args := make([]interface{}, 0, 5)
	sqlText := `
		SELECT it.entry, COALESCE(itl.Name, it.name) as name, it.Quality
		FROM item_template it
		LEFT JOIN item_template_locale itl ON it.entry = itl.ID AND itl.locale = 'koKR'
		WHERE (it.name LIKE ? OR itl.Name LIKE ?`
	likeQuery := "%" + query + "%"
	args = append(args, likeQuery, likeQuery)
	if entry, convErr := strconv.Atoi(query); convErr == nil && entry > 0 {
		sqlText += ` OR it.entry = ?`
		args = append(args, entry)
	}
	sqlText += `)
		ORDER BY
			CASE WHEN CAST(it.entry AS CHAR) = ? THEN 0 ELSE 1 END,
			it.entry DESC
		LIMIT 50`
	args = append(args, query)

	rows, err := db.Query(sqlText, args...)
	if err != nil {
		log.Printf("[Item Search] Query Error: %v", err)
		http.Error(w, "Query Error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var results []ItemSearchResult
	for rows.Next() {
		var item ItemSearchResult
		if err := rows.Scan(&item.Entry, &item.Name, &item.Quality); err != nil {
			continue
		}
		results = append(results, item)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(results)
}

func hasItemSearchPermission(w http.ResponseWriter, r *http.Request) bool {
	cookie, err := r.Cookie("session_user")
	if err != nil || cookie.Value == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"status": "unauthorized", "message": "로그인이 필요합니다."})
		return false
	}

	authDB, err := sql.Open("mysql", config.AuthDSN())
	if err != nil {
		http.Error(w, "Auth DB Connection Error", http.StatusInternalServerError)
		return false
	}
	defer authDB.Close()

	var userID int
	if err := authDB.QueryRow("SELECT id FROM account WHERE UPPER(TRIM(username)) = UPPER(TRIM(?))", cookie.Value).Scan(&userID); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"status": "unauthorized", "message": "로그인 정보가 올바르지 않습니다."})
		return false
	}

	webRank := 0
	updateDB, err := sql.Open("mysql", config.UpdateDSN())
	if err == nil {
		defer updateDB.Close()
		_ = updateDB.QueryRow("SELECT IFNULL(web_rank, 0) FROM user_profiles WHERE user_id = ?", userID).Scan(&webRank)
	}

	if auth.HasPermission(webRank, "menu", "account") ||
		auth.HasPermission(webRank, "menu", "content") ||
		auth.HasPermission(webRank, "menu", "instance-bonus-admin") {
		return true
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusForbidden)
	json.NewEncoder(w).Encode(map[string]string{"status": "forbidden", "message": "권한이 부족합니다."})
	return false
}

func handleItemTooltip(w http.ResponseWriter, r *http.Request) {
	// All logged-in web users can see item tooltip.
	if _, _, err := getSessionUserIDAndName(r); err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"status": "unauthorized", "message": "로그인이 필요합니다."})
		return
	}

	entryStr := r.URL.Query().Get("entry")
	entry, err := strconv.Atoi(entryStr)
	if err != nil || entry <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "invalid entry"})
		return
	}

	db, err := sql.Open("mysql", config.WorldDSN())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "db open failed"})
		return
	}
	defer db.Close()

	var (
		res                                ItemTooltipResponse
		classID, subClassID, inventoryType int
		statType                           [10]int
		statValue                          [10]int
		spellID                            [5]int
		spellTrigger                       [5]int
	)

	res.Status = "success"
	res.Entry = uint32(entry)

	q := `
		SELECT
			it.entry,
			COALESCE(NULLIF(itl.Name, ''), it.name) AS name,
			COALESCE(NULLIF(itl.Description, ''), it.description) AS description,
			COALESCE(it.ScriptName, '') AS script_name,
			it.Quality, it.ItemLevel, it.RequiredLevel, it.class, it.subclass, it.InventoryType,
			COALESCE(it.SoundOverrideSubclass, 0) AS sound_override_subclass,
			COALESCE(it.displayid, 0) AS displayid,
			COALESCE(it.BuyCount, 0) AS buy_count,
			it.BuyPrice, it.SellPrice,
			COALESCE(it.maxcount, 0) AS maxcount,
			COALESCE(it.stackable, 0) AS stackable,
			COALESCE(it.startquest, 0) AS startquest,
			COALESCE(it.Material, 0) AS material,
			COALESCE(it.RandomProperty, 0) AS random_property,
			COALESCE(it.RandomSuffix, 0) AS random_suffix,
			COALESCE(it.BagFamily, 0) AS bag_family,
			COALESCE(it.ContainerSlots, 0) AS container_slots,
			COALESCE(it.TotemCategory, 0) AS totem_category,
			COALESCE(it.duration, 0) AS duration,
			COALESCE(it.ItemLimitCategory, 0) AS item_limit_category,
			COALESCE(it.DisenchantID, 0) AS disenchant_id,
			COALESCE(it.FoodType, 0) AS food_type,
			COALESCE(it.minMoneyLoot, 0) AS min_money_loot,
			COALESCE(it.maxMoneyLoot, 0) AS max_money_loot,
			COALESCE(it.itemset, 0) AS item_set,
			COALESCE(it.bonding, 0) AS bonding,
			COALESCE(it.Flags, 0) AS flags,
			COALESCE(it.FlagsExtra, 0) AS flags_extra,
			COALESCE(it.flagsCustom, 0) AS flags_custom,
			COALESCE(it.PageText, 0) AS page_text,
			COALESCE(it.PageMaterial, 0) AS page_material,
			COALESCE(it.LanguageID, 0) AS language_id,
			it.Armor, it.dmg_min1, it.dmg_max1, it.delay,
			it.stat_type1, it.stat_value1, it.stat_type2, it.stat_value2, it.stat_type3, it.stat_value3,
			it.stat_type4, it.stat_value4, it.stat_type5, it.stat_value5, it.stat_type6, it.stat_value6,
			it.stat_type7, it.stat_value7, it.stat_type8, it.stat_value8, it.stat_type9, it.stat_value9,
			it.stat_type10, it.stat_value10,
			it.spellid_1, it.spelltrigger_1, it.spellid_2, it.spelltrigger_2, it.spellid_3, it.spelltrigger_3,
			it.spellid_4, it.spelltrigger_4, it.spellid_5, it.spelltrigger_5
		FROM item_template it
		LEFT JOIN item_template_locale itl ON it.entry = itl.ID AND itl.locale = 'koKR'
		WHERE it.entry = ?
		LIMIT 1
	`

	err = db.QueryRow(q, entry).Scan(
		&res.Entry, &res.Name, &res.Description, &res.ScriptName,
		&res.Quality, &res.ItemLevel, &res.RequiredLevel, &classID, &subClassID, &inventoryType,
		&res.SoundOverrideSubclass, &res.DisplayID, &res.BuyCount,
		&res.BuyPrice, &res.SellPrice, &res.MaxCount, &res.Stackable, &res.StartQuest, &res.Material,
		&res.RandomProperty, &res.RandomSuffix, &res.BagFamily, &res.ContainerSlots, &res.TotemCategory,
		&res.Duration, &res.ItemLimitCategory, &res.DisenchantID, &res.FoodType, &res.MinMoneyLoot,
		&res.MaxMoneyLoot, &res.ItemSet, &res.Bonding, &res.Flags, &res.FlagsExtra, &res.FlagsCustom,
		&res.PageText, &res.PageMaterial, &res.LanguageID,
		&res.Armor, &res.MinDamage, &res.MaxDamage, &res.SpeedMS,
		&statType[0], &statValue[0], &statType[1], &statValue[1], &statType[2], &statValue[2],
		&statType[3], &statValue[3], &statType[4], &statValue[4], &statType[5], &statValue[5],
		&statType[6], &statValue[6], &statType[7], &statValue[7], &statType[8], &statValue[8],
		&statType[9], &statValue[9],
		&spellID[0], &spellTrigger[0], &spellID[1], &spellTrigger[1], &spellID[2], &spellTrigger[2],
		&spellID[3], &spellTrigger[3], &spellID[4], &spellTrigger[4],
	)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"status": "error", "message": "item not found"})
		return
	}
	if err != nil {
		log.Printf("[Item Tooltip] Query Error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "query failed"})
		return
	}

	res.ClassID = classID
	res.SubClassID = subClassID
	res.InventoryType = inventoryType
	res.ClassName = itemClassName(classID)
	res.SubClassName = itemSubClassName(classID, subClassID)
	res.InventoryName = inventoryTypeName(inventoryType)

	for i := 0; i < len(statType); i++ {
		if statType[i] <= 0 || statValue[i] == 0 {
			continue
		}
		res.Stats = append(res.Stats, fmt.Sprintf("%+d %s", statValue[i], itemStatName(statType[i])))
	}

	for i := 0; i < len(spellID); i++ {
		if spellID[i] <= 0 {
			continue
		}
		res.Spells = append(res.Spells, fmt.Sprintf("%s (SpellID: %d)", spellTriggerName(spellTrigger[i]), spellID[i]))
	}

	writeJSON(w, http.StatusOK, res)
}

func itemClassName(classID int) string {
	switch classID {
	case 2:
		return "무기"
	case 4:
		return "방어구"
	case 0:
		return "소모품"
	case 15:
		return "기타"
	default:
		return "분류 " + strconv.Itoa(classID)
	}
}

func itemSubClassName(classID, subClassID int) string {
	if classID == 2 {
		switch subClassID {
		case 0:
			return "한손 도끼"
		case 1:
			return "양손 도끼"
		case 4:
			return "한손 둔기"
		case 5:
			return "양손 둔기"
		case 7:
			return "한손 도검"
		case 8:
			return "양손 도검"
		case 10:
			return "지팡이"
		case 15:
			return "단검"
		default:
			return "무기 분류 " + strconv.Itoa(subClassID)
		}
	}
	if classID == 4 {
		switch subClassID {
		case 1:
			return "천"
		case 2:
			return "가죽"
		case 3:
			return "사슬"
		case 4:
			return "판금"
		case 6:
			return "방패"
		default:
			return "방어구 분류 " + strconv.Itoa(subClassID)
		}
	}
	return "하위분류 " + strconv.Itoa(subClassID)
}

func inventoryTypeName(v int) string {
	switch v {
	case 1:
		return "머리"
	case 2:
		return "목"
	case 3:
		return "어깨"
	case 5:
		return "가슴"
	case 6:
		return "허리"
	case 7:
		return "다리"
	case 8:
		return "발"
	case 9:
		return "손목"
	case 10:
		return "손"
	case 11:
		return "반지"
	case 12:
		return "장신구"
	case 13:
		return "한손"
	case 14:
		return "방패"
	case 15:
		return "원거리"
	case 16:
		return "등"
	case 17:
		return "양손"
	case 21:
		return "주장비"
	case 22:
		return "보조장비"
	case 23:
		return "보조손"
	default:
		return "슬롯 " + strconv.Itoa(v)
	}
}

func itemStatName(id int) string {
	switch id {
	case 3:
		return "민첩"
	case 4:
		return "힘"
	case 5:
		return "지능"
	case 6:
		return "정신력"
	case 7:
		return "체력"
	case 31:
		return "적중"
	case 32:
		return "치명타"
	case 35:
		return "탄력도"
	case 36:
		return "가속"
	case 37:
		return "숙련"
	case 38:
		return "전투력"
	case 45:
		return "주문력"
	case 46:
		return "생명력 회복"
	default:
		return "스탯(" + strconv.Itoa(id) + ")"
	}
}

func spellTriggerName(v int) string {
	switch v {
	case 0:
		return "사용 효과"
	case 1:
		return "착용 효과"
	case 2:
		return "적중 시 발동"
	case 4:
		return "사용 (무지속)"
	default:
		return "효과"
	}
}
