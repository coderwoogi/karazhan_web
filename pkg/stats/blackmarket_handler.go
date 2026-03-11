package stats

import (
	"database/sql"
	"encoding/json"
	"karazhan/pkg/config"
	"log"
	"net/http"
	"strconv"
)

// List Items
func handleBlackMarketItemList(w http.ResponseWriter, r *http.Request) {
	if !CheckMenuPermission(w, r, "content") {
		return
	}

	// Connect to WORLD DB
	worldDSN := config.WorldDSN()
	db, err := sql.Open("mysql", worldDSN)
	if err != nil {
		http.Error(w, "DB Conn Error", http.StatusInternalServerError)
		return
	}
	defer db.Close()

	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if page < 1 {
		page = 1
	}
	limit := 20
	offset := (page - 1) * limit

	// Adjusted query to include Korean names
	query := `
		SELECT 
			bp.id, 
			bp.item_entry, 
			COALESCE(itl.Name, it.name, CONCAT('Unknown Item ', bp.item_entry)) as name, 
			bp.price_gold, 
			bp.weight, 
			bp.max_per_spawn
		FROM blackmarket_item_pool bp
		LEFT JOIN item_template it ON bp.item_entry = it.entry
		LEFT JOIN item_template_locale itl ON it.entry = itl.ID AND itl.locale = 'koKR'
		ORDER BY bp.id DESC
		LIMIT ? OFFSET ?
	`
	rows, err := db.Query(query, limit, offset)
	if err != nil {
		log.Printf("[BM List] Query Error: %v", err)
		http.Error(w, "Query Error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var items []map[string]interface{}
	for rows.Next() {
		var id, entry int
		var priceGold int64
		var weight, maxPerSpawn int
		var name string

		rows.Scan(&id, &entry, &name, &priceGold, &weight, &maxPerSpawn)
		items = append(items, map[string]interface{}{
			"id": id, "item_entry": entry, "name": name, "price_gold": priceGold, "weight": weight, "max_per_spawn": maxPerSpawn,
		})
	}

	// Total count
	var total int
	db.QueryRow("SELECT COUNT(*) FROM blackmarket_item_pool").Scan(&total)
	totalPages := (total + limit - 1) / limit

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"items": items, "total": total, "totalPages": totalPages, "page": page,
	})
}

// Add Item
func handleBlackMarketItemAdd(w http.ResponseWriter, r *http.Request) {
	if !CheckMenuPermission(w, r, "content") {
		return
	}

	err := r.ParseMultipartForm(10 << 20)
	if err != nil {
		http.Error(w, "Parse Error", http.StatusBadRequest)
		return
	}

	entry := r.FormValue("item_entry")
	price := r.FormValue("price_gold")
	weight := r.FormValue("weight")
	spawn := r.FormValue("max_per_spawn")

	worldDSN := config.WorldDSN()
	db, err := sql.Open("mysql", worldDSN)
	if err != nil {
		http.Error(w, "DB Conn Error", http.StatusInternalServerError)
		return
	}
	defer db.Close()

	_, err = db.Exec("INSERT INTO blackmarket_item_pool (item_entry, price_gold, weight, max_per_spawn) VALUES (?, ?, ?, ?)",
		entry, price, weight, spawn)
	if err != nil {
		log.Printf("[BM Add] Insert Error: %v", err)
		http.Error(w, "Insert Error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "success"})
}

// Update Item
func handleBlackMarketItemUpdate(w http.ResponseWriter, r *http.Request) {
	if !CheckMenuPermission(w, r, "content") {
		return
	}
	err := r.ParseMultipartForm(10 << 20)
	if err != nil {
		http.Error(w, "Parse Error", http.StatusBadRequest)
		return
	}

	id := r.FormValue("id")
	entry := r.FormValue("item_entry")
	price := r.FormValue("price_gold")
	weight := r.FormValue("weight")
	spawn := r.FormValue("max_per_spawn")

	worldDSN := config.WorldDSN()
	db, err := sql.Open("mysql", worldDSN)
	if err != nil {
		http.Error(w, "DB Conn Error", http.StatusInternalServerError)
		return
	}
	defer db.Close()

	_, err = db.Exec("UPDATE blackmarket_item_pool SET item_entry=?, price_gold=?, weight=?, max_per_spawn=? WHERE id=?",
		entry, price, weight, spawn, id)
	if err != nil {
		log.Printf("[BM Update] Exec Error: %v", err)
		http.Error(w, "Update Error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "success"})
}

// Delete Item
func handleBlackMarketItemDelete(w http.ResponseWriter, r *http.Request) {
	if !CheckMenuPermission(w, r, "content") {
		return
	}
	id := r.FormValue("id")

	worldDSN := config.WorldDSN()
	db, err := sql.Open("mysql", worldDSN)
	if err != nil {
		http.Error(w, "DB Conn Error", http.StatusInternalServerError)
		return
	}
	defer db.Close()

	_, err = db.Exec("DELETE FROM blackmarket_item_pool WHERE id=?", id)
	if err != nil {
		log.Printf("[BM Delete] Exec Error: %v", err)
		http.Error(w, "Delete Error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "success"})
}
