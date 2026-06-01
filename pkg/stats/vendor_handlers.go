package stats

import (
	"net/http"
	"strings"
)

type vendorItem struct {
	Entry         int    `json:"entry"`
	Slot          int    `json:"slot"`
	ItemEntry     int    `json:"item_entry"`
	ItemName      string `json:"item_name"`
	ItemQuality   int    `json:"item_quality"`
	MaxCount      int    `json:"max_count"`
	IncrTime      int    `json:"incr_time"`
	ExtendedCost  int    `json:"extended_cost"`
	VerifiedBuild int    `json:"verified_build"`
}

func handleVendorCreatureSearch(w http.ResponseWriter, r *http.Request) {
	if !CheckMenuPermission(w, r, "content") {
		return
	}

	q := strings.TrimSpace(r.URL.Query().Get("q"))
	page := atoiDefault(r.URL.Query().Get("page"), 1)
	if page < 1 {
		page = 1
	}
	limit := atoiDefault(r.URL.Query().Get("limit"), 20)
	if limit < 1 || limit > 100 {
		limit = 20
	}
	offset := (page - 1) * limit

	db, err := openWorldDBForContent()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "world db connection failed"})
		return
	}
	defer db.Close()

	where := "1=1"
	args := make([]interface{}, 0, 4)
	if q != "" {
		like := "%" + q + "%"
		where = "(CAST(ct.entry AS CHAR) LIKE ? OR ct.name LIKE ? OR ctl.Name LIKE ?)"
		args = append(args, like, like, like)
	}

	var total int
	countSQL := `
		SELECT COUNT(*)
		FROM creature_template ct
		LEFT JOIN creature_template_locale ctl ON ctl.Entry = ct.entry AND ctl.locale = 'koKR'
		WHERE ` + where
	if err := db.QueryRow(countSQL, args...).Scan(&total); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": err.Error()})
		return
	}

	queryArgs := append(args, limit, offset)
	rows, err := db.Query(`
		SELECT
			ct.entry,
			COALESCE(NULLIF(ctl.Name, ''), ct.name, CONCAT('Creature ', ct.entry)) AS creature_name,
			COALESCE(ct.subname, '') AS sub_name,
			COALESCE(ct.minlevel, 0) AS min_level,
			COALESCE(ct.maxlevel, 0) AS max_level,
			COALESCE(ct.rank, 0) AS creature_rank
		FROM creature_template ct
		LEFT JOIN creature_template_locale ctl ON ctl.Entry = ct.entry AND ctl.locale = 'koKR'
		WHERE `+where+`
		ORDER BY ct.entry ASC
		LIMIT ? OFFSET ?
	`, queryArgs...)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": err.Error()})
		return
	}
	defer rows.Close()

	items := make([]creatureDropCreature, 0, limit)
	for rows.Next() {
		var item creatureDropCreature
		if err := rows.Scan(&item.Entry, &item.Name, &item.SubName, &item.MinLevel, &item.MaxLevel, &item.Rank); err == nil {
			items = append(items, item)
		}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"items":      items,
		"total":      total,
		"totalPages": (total + limit - 1) / limit,
		"page":       page,
	})
}

func handleVendorList(w http.ResponseWriter, r *http.Request) {
	if !CheckMenuPermission(w, r, "content") {
		return
	}

	entry := atoiDefault(r.URL.Query().Get("entry"), 0)
	if entry <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "vendor entry is required"})
		return
	}

	db, err := openWorldDBForContent()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "world db connection failed"})
		return
	}
	defer db.Close()

	rows, err := db.Query(`
		SELECT
			nv.entry,
			nv.slot,
			nv.item,
			COALESCE(NULLIF(itl.Name, ''), it.name, CONCAT('Item ', nv.item)) AS item_name,
			COALESCE(it.Quality, 0) AS item_quality,
			COALESCE(nv.maxcount, 0) AS max_count,
			COALESCE(nv.incrtime, 0) AS incr_time,
			COALESCE(nv.ExtendedCost, 0) AS extended_cost,
			COALESCE(nv.VerifiedBuild, 0) AS verified_build
		FROM npc_vendor nv
		LEFT JOIN item_template it ON it.entry = nv.item
		LEFT JOIN item_template_locale itl ON itl.ID = nv.item AND itl.locale = 'koKR'
		WHERE nv.entry = ?
		ORDER BY nv.slot ASC, nv.item ASC, nv.ExtendedCost ASC
	`, entry)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": err.Error()})
		return
	}
	defer rows.Close()

	items := make([]vendorItem, 0, 32)
	for rows.Next() {
		var item vendorItem
		if err := rows.Scan(&item.Entry, &item.Slot, &item.ItemEntry, &item.ItemName, &item.ItemQuality, &item.MaxCount, &item.IncrTime, &item.ExtendedCost, &item.VerifiedBuild); err == nil {
			items = append(items, item)
		}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"items": items})
}

func handleVendorSave(w http.ResponseWriter, r *http.Request) {
	if !CheckMenuPermission(w, r, "content") {
		return
	}
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"status": "error", "message": "method not allowed"})
		return
	}
	if err := r.ParseForm(); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "invalid form"})
		return
	}

	entry := atoiDefault(r.FormValue("entry"), 0)
	itemEntry := atoiDefault(r.FormValue("item_entry"), 0)
	slot := atoiDefault(r.FormValue("slot"), 0)
	maxCount := atoiDefault(r.FormValue("max_count"), 0)
	incrTime := atoiDefault(r.FormValue("incr_time"), 0)
	extendedCost := atoiDefault(r.FormValue("extended_cost"), 0)
	verifiedBuild := atoiDefault(r.FormValue("verified_build"), 0)
	originalItemEntry := atoiDefault(r.FormValue("original_item_entry"), itemEntry)
	originalExtendedCost := atoiDefault(r.FormValue("original_extended_cost"), extendedCost)

	if entry <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "vendor entry is required"})
		return
	}
	if itemEntry <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "item entry is required"})
		return
	}
	if slot < 0 || maxCount < 0 || incrTime < 0 || extendedCost < 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "numeric values must be zero or greater"})
		return
	}

	db, err := openWorldDBForContent()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "world db connection failed"})
		return
	}
	defer db.Close()

	tx, err := db.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": err.Error()})
		return
	}
	defer tx.Rollback()

	if slot == 0 {
		if err := tx.QueryRow("SELECT COALESCE(MAX(slot), 0) + 1 FROM npc_vendor WHERE entry = ?", entry).Scan(&slot); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": err.Error()})
			return
		}
	}

	if originalItemEntry > 0 && (originalItemEntry != itemEntry || originalExtendedCost != extendedCost) {
		if _, err := tx.Exec("DELETE FROM npc_vendor WHERE entry = ? AND item = ? AND ExtendedCost = ?", entry, originalItemEntry, originalExtendedCost); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": err.Error()})
			return
		}
	}

	_, err = tx.Exec(`
		INSERT INTO npc_vendor
			(entry, slot, item, maxcount, incrtime, ExtendedCost, VerifiedBuild)
		VALUES (?, ?, ?, ?, ?, ?, ?)
		ON DUPLICATE KEY UPDATE
			slot = VALUES(slot),
			maxcount = VALUES(maxcount),
			incrtime = VALUES(incrtime),
			VerifiedBuild = VALUES(VerifiedBuild)
	`, entry, slot, itemEntry, maxCount, incrTime, extendedCost, verifiedBuild)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": err.Error()})
		return
	}

	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": err.Error()})
		return
	}

	reloadErr := triggerCreatureDropReload(r, ".reload npc_vendor")
	writeCreatureDropReloadResult(w, reloadErr)
}

func handleVendorDelete(w http.ResponseWriter, r *http.Request) {
	if !CheckMenuPermission(w, r, "content") {
		return
	}
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"status": "error", "message": "method not allowed"})
		return
	}
	if err := r.ParseForm(); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "invalid form"})
		return
	}

	entry := atoiDefault(r.FormValue("entry"), 0)
	itemEntry := atoiDefault(r.FormValue("item_entry"), 0)
	extendedCost := atoiDefault(r.FormValue("extended_cost"), 0)
	if entry <= 0 || itemEntry <= 0 || extendedCost < 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "delete target is invalid"})
		return
	}

	db, err := openWorldDBForContent()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "world db connection failed"})
		return
	}
	defer db.Close()

	result, err := db.Exec("DELETE FROM npc_vendor WHERE entry = ? AND item = ? AND ExtendedCost = ?", entry, itemEntry, extendedCost)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": err.Error()})
		return
	}
	if rows, _ := result.RowsAffected(); rows == 0 {
		writeJSON(w, http.StatusNotFound, map[string]string{"status": "error", "message": "vendor item not found"})
		return
	}

	reloadErr := triggerCreatureDropReload(r, ".reload npc_vendor")
	writeCreatureDropReloadResult(w, reloadErr)
}
