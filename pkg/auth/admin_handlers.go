package auth

import (
	"database/sql"
	"encoding/json"
	"karazhan/pkg/config"
	"log"
	"net/http"
	"strconv"
)

func adminUserCharactersHandler(w http.ResponseWriter, r *http.Request) {
	// Authorization Check using Menu Permission (reuse 'account' permission)
	if !checkSubMenuPermission(w, r, "account-list") {
		return
	}

	targetIDStr := r.URL.Query().Get("id")
	if targetIDStr == "" {
		http.Error(w, "Missing ID", http.StatusBadRequest)
		return
	}
	targetID, err := strconv.Atoi(targetIDStr)
	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}

	// Fetch Characters from Characters DB
	charDSN := config.CharactersDSN()
	charDB, err := sql.Open("mysql", charDSN)
	if err != nil {
		log.Printf("[ERROR] Char DB Connect: %v", err)
		http.Error(w, "Char DB Error", http.StatusInternalServerError)
		return
	}
	defer charDB.Close()

	rows, err := charDB.Query("SELECT guid, name, race, class, level, gender, map, zone FROM characters WHERE account = ?", targetID)
	if err != nil {
		log.Printf("[ERROR] Character Query Failed: %v", err)
		http.Error(w, "Char Query Error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var chars = make([]map[string]interface{}, 0)

	for rows.Next() {
		var guid int
		var name string
		var race, class, level, gender, mapId, zoneId int

		err := rows.Scan(&guid, &name, &race, &class, &level, &gender, &mapId, &zoneId)
		if err != nil {
			log.Printf("[ERROR] Character Scan Failed: %v", err)
			continue
		}

		chars = append(chars, map[string]interface{}{
			"guid":   guid,
			"name":   name,
			"race":   race,
			"class":  class,
			"level":  level,
			"gender": gender,
			"map":    mapId,
			"zone":   zoneId,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"characters": chars,
	})
}
