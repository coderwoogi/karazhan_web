package stats

import (
	"net/http"
	"strconv"
	"strings"
)

type itemTemplateSavePayload struct {
	ItemEntry             int
	Name                  string
	Description           string
	ScriptName            string
	ClassID               int
	SubClassID            int
	SoundOverrideSubclass int
	DisplayID             int
	Quality               int
	BuyCount              int
	BuyPrice              int64
	SellPrice             int64
	InventoryType         int
	MaxCount              int
	Stackable             int
	StartQuest            int
	Material              int
	RandomProperty        int
	RandomSuffix          int
	BagFamily             int
	ContainerSlots        int
	TotemCategory         int
	Duration              int
	ItemLimitCategory     int
	DisenchantID          int
	FoodType              int
	MinMoneyLoot          int
	MaxMoneyLoot          int
	ItemSet               int
	Bonding               int
	Flags                 int
	FlagsExtra            int
	FlagsCustom           int
	PageText              int
	PageMaterial          int
	LanguageID            int
}

func parseItemTemplateSavePayload(r *http.Request) (itemTemplateSavePayload, error) {
	parseInt := func(key string) int {
		return atoiDefault(strings.TrimSpace(r.FormValue(key)), 0)
	}
	parseInt64 := func(key string) (int64, error) {
		return strconv.ParseInt(strings.TrimSpace(r.FormValue(key)), 10, 64)
	}

	buyPrice, err := parseInt64("buy_price")
	if err != nil {
		return itemTemplateSavePayload{}, err
	}
	sellPrice, err := parseInt64("sell_price")
	if err != nil {
		return itemTemplateSavePayload{}, err
	}

	return itemTemplateSavePayload{
		ItemEntry:             parseInt("item_entry"),
		Name:                  strings.TrimSpace(r.FormValue("name")),
		Description:           strings.TrimSpace(r.FormValue("description")),
		ScriptName:            strings.TrimSpace(r.FormValue("script_name")),
		ClassID:               parseInt("class_id"),
		SubClassID:            parseInt("subclass_id"),
		SoundOverrideSubclass: parseInt("sound_override_subclass"),
		DisplayID:             parseInt("display_id"),
		Quality:               parseInt("quality"),
		BuyCount:              parseInt("buy_count"),
		BuyPrice:              buyPrice,
		SellPrice:             sellPrice,
		InventoryType:         parseInt("inventory_type"),
		MaxCount:              parseInt("max_count"),
		Stackable:             parseInt("stackable"),
		StartQuest:            parseInt("start_quest"),
		Material:              parseInt("material"),
		RandomProperty:        parseInt("random_property"),
		RandomSuffix:          parseInt("random_suffix"),
		BagFamily:             parseInt("bag_family"),
		ContainerSlots:        parseInt("container_slots"),
		TotemCategory:         parseInt("totem_category"),
		Duration:              parseInt("duration"),
		ItemLimitCategory:     parseInt("item_limit_category"),
		DisenchantID:          parseInt("disenchant_id"),
		FoodType:              parseInt("food_type"),
		MinMoneyLoot:          parseInt("min_money_loot"),
		MaxMoneyLoot:          parseInt("max_money_loot"),
		ItemSet:               parseInt("item_set"),
		Bonding:               parseInt("bonding"),
		Flags:                 parseInt("flags"),
		FlagsExtra:            parseInt("flags_extra"),
		FlagsCustom:           parseInt("flags_custom"),
		PageText:              parseInt("page_text"),
		PageMaterial:          parseInt("page_material"),
		LanguageID:            parseInt("language_id"),
	}, nil
}

func handleContentItemPriceSave(w http.ResponseWriter, r *http.Request) {
	if !CheckMenuPermission(w, r, "content") {
		return
	}
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"status": "error", "message": "method not allowed"})
		return
	}

	payload, err := parseItemTemplateSavePayload(r)
	if err != nil || payload.BuyPrice < 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "구입가격은 0 이상으로 입력해주세요."})
		return
	}
	if payload.SellPrice < 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "판매가격은 0 이상으로 입력해주세요."})
		return
	}
	if payload.ItemEntry <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "아이템을 선택해주세요."})
		return
	}

	db, err := openWorldDBForContent()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "world db connection failed"})
		return
	}
	defer db.Close()

	result, err := db.Exec(`
		UPDATE item_template
		SET
			name = ?,
			description = ?,
			ScriptName = ?,
			class = ?,
			subclass = ?,
			SoundOverrideSubclass = ?,
			displayid = ?,
			Quality = ?,
			BuyCount = ?,
			BuyPrice = ?,
			SellPrice = ?,
			InventoryType = ?,
			maxcount = ?,
			stackable = ?,
			startquest = ?,
			Material = ?,
			RandomProperty = ?,
			RandomSuffix = ?,
			BagFamily = ?,
			ContainerSlots = ?,
			TotemCategory = ?,
			duration = ?,
			ItemLimitCategory = ?,
			DisenchantID = ?,
			FoodType = ?,
			minMoneyLoot = ?,
			maxMoneyLoot = ?,
			itemset = ?,
			bonding = ?,
			Flags = ?,
			FlagsExtra = ?,
			flagsCustom = ?,
			PageText = ?,
			PageMaterial = ?,
			LanguageID = ?
		WHERE entry = ?
	`,
		payload.Name,
		payload.Description,
		payload.ScriptName,
		payload.ClassID,
		payload.SubClassID,
		payload.SoundOverrideSubclass,
		payload.DisplayID,
		payload.Quality,
		payload.BuyCount,
		payload.BuyPrice,
		payload.SellPrice,
		payload.InventoryType,
		payload.MaxCount,
		payload.Stackable,
		payload.StartQuest,
		payload.Material,
		payload.RandomProperty,
		payload.RandomSuffix,
		payload.BagFamily,
		payload.ContainerSlots,
		payload.TotemCategory,
		payload.Duration,
		payload.ItemLimitCategory,
		payload.DisenchantID,
		payload.FoodType,
		payload.MinMoneyLoot,
		payload.MaxMoneyLoot,
		payload.ItemSet,
		payload.Bonding,
		payload.Flags,
		payload.FlagsExtra,
		payload.FlagsCustom,
		payload.PageText,
		payload.PageMaterial,
		payload.LanguageID,
		payload.ItemEntry,
	)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": err.Error()})
		return
	}
	affected, _ := result.RowsAffected()
	if affected == 0 {
		writeJSON(w, http.StatusNotFound, map[string]string{"status": "error", "message": "아이템을 찾을 수 없습니다."})
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":     "success",
		"message":    "아이템 정보가 저장되었습니다.",
		"item_entry": payload.ItemEntry,
		"buy_price":  payload.BuyPrice,
		"sell_price": payload.SellPrice,
	})
}
