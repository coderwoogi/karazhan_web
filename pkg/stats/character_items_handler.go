package stats

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"karazhan/pkg/config"
	"log"
	"net/http"
)

// Character Items Handler
func handleCharacterItems(w http.ResponseWriter, r *http.Request) {
	// Authorization Check using Menu Permission
	if !CheckMenuPermission(w, r, "ban") {
		return
	}
	// Note: username checking removed as it was only used for auth verification.
	// Logic after auth block only uses query params (guid).

	// Get character GUID from query
	guidStr := r.URL.Query().Get("guid")
	if guidStr == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"status": "error", "message": "Character GUID is required"})
		return
	}

	var guid int
	fmt.Sscanf(guidStr, "%d", &guid)

	// Connect to characters DB
	charDSN := config.CharactersDSN()
	charDB, err := sql.Open("mysql", charDSN)
	if err != nil {
		http.Error(w, "Characters DB Connection Error", http.StatusInternalServerError)
		return
	}
	defer charDB.Close()

	// Get character info
	var charInfo struct {
		Name  string
		Level int
		Race  int
		Class int
		Money int
	}

	err = charDB.QueryRow(`
		SELECT name, level, race, class, money
		FROM characters
		WHERE guid = ?
	`, guid).Scan(&charInfo.Name, &charInfo.Level, &charInfo.Race, &charInfo.Class, &charInfo.Money)

	if err != nil {
		log.Printf("[CharacterItems] Failed to get character info: %v", err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{"status": "error", "message": "Character not found"})
		return
	}

	// Race and Class mappings (Korean)
	raceMap := map[int]string{
		1: "인간", 2: "오크", 3: "드워프", 4: "나이트 엘프", 5: "언데드",
		6: "타우렌", 7: "노움", 8: "트롤", 10: "블러드 엘프", 11: "드레나이",
	}
	classMap := map[int]string{
		1: "전사", 2: "성기사", 3: "사냥꾼", 4: "도적", 5: "사제",
		6: "죽음의 기사", 7: "주술사", 8: "마법사", 9: "흑마법사", 11: "드루이드",
	}

	raceName := raceMap[charInfo.Race]
	if raceName == "" {
		raceName = fmt.Sprintf("Race %d", charInfo.Race)
	}
	className := classMap[charInfo.Class]
	if className == "" {
		className = fmt.Sprintf("Class %d", charInfo.Class)
	}

	// Get character items
	itemsQuery := `
		SELECT 
			ci.slot,
			ci.item as item_guid,
			ii.itemEntry,
			ii.count,
			COALESCE(itl.Name, it.name, 'Unknown Item') as item_name,
			ii.enchantments
		FROM character_inventory ci
		JOIN item_instance ii ON ci.item = ii.guid
		LEFT JOIN acore_world.item_template it ON ii.itemEntry = it.entry
		LEFT JOIN acore_world.item_template_locale itl ON ii.itemEntry = itl.ID AND itl.locale = 'koKR'
		WHERE ci.guid = ?
		ORDER BY ci.slot ASC
	`

	rows, err := charDB.Query(itemsQuery, guid)
	if err != nil {
		log.Printf("[CharacterItems] Failed to query items: %v", err)
		http.Error(w, "Failed to query items: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var items = make([]map[string]interface{}, 0)
	for rows.Next() {
		var slot, itemGuid, itemEntry, count int
		var itemName sql.NullString
		var enchantments sql.NullString

		if err := rows.Scan(&slot, &itemGuid, &itemEntry, &count, &itemName, &enchantments); err != nil {
			log.Printf("[CharacterItems] Scan error: %v", err)
			continue
		}

		name := "Unknown Item"
		if itemName.Valid {
			name = itemName.String
		}

		enchantsList := []string{}
		if enchantments.Valid && enchantments.String != "" {
			// Parse enchantments string (space-separated)
			// Format is typically: "enchant1 enchant2 enchant3 ..."
			enchantsList = []string{enchantments.String}
		}

		items = append(items, map[string]interface{}{
			"slot":         slot,
			"guid":         itemGuid,
			"entry":        itemEntry,
			"name":         name,
			"count":        count,
			"enchantments": enchantsList,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"character": map[string]interface{}{
			"name":  charInfo.Name,
			"level": charInfo.Level,
			"race":  raceName,
			"class": className,
			"gold":  charInfo.Money / 10000,
		},
		"items": items,
	})
}
