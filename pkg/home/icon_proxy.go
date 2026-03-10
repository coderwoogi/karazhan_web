package home

import (
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"sync"
)

// In-memory cache for icons: ItemID -> IconName
var (
	iconCache = make(map[int]string)
	iconMutex sync.RWMutex
)

// XML structure for parsing wotlkdb response
type WotlkItem struct {
	XMLName xml.Name `xml:"aowow"`
	Item    struct {
		Icon string `xml:"icon"`
	} `xml:"item"`
}

func handleItemIcon(w http.ResponseWriter, r *http.Request) {
	entryStr := r.URL.Query().Get("entry")
	if entryStr == "" {
		http.Error(w, "Missing entry", http.StatusBadRequest)
		return
	}

	entry, err := strconv.Atoi(entryStr)
	if err != nil {
		http.Error(w, "Invalid entry", http.StatusBadRequest)
		return
	}

	// Check Cache
	iconMutex.RLock()
	cachedIcon, found := iconCache[entry]
	iconMutex.RUnlock()

	if found {
		respondJSON(w, entry, cachedIcon)
		return
	}

	// Fetch from WotLKDB with User-Agent
	url := fmt.Sprintf("https://wotlkdb.com/?item=%d&xml", entry)
	client := &http.Client{}
	req, _ := http.NewRequest("GET", url, nil)
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")

	resp, err := client.Do(req)
	if err != nil {
		log.Printf("[Icon Proxy] Fetch Error for %d: %v", entry, err)
		http.Error(w, "External Fetch Error", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		// If item not found, maybe return default icon?
		respondJSON(w, entry, "inv_misc_questionmark")
		return
	}

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		log.Printf("[Icon Proxy] Read error: %v", err)
		http.Error(w, "Read Error", http.StatusInternalServerError)
		return
	}

	// Try to parse XML
	var wItem struct {
		Item struct {
			Icon string `xml:"icon"`
		} `xml:"item"`
	}

	if err := xml.Unmarshal(data, &wItem); err != nil {
		log.Printf("[Icon Proxy] Unmarshal error for %d: %v. Raw: %s", entry, err, string(data))
		respondJSON(w, entry, "inv_misc_questionmark")
		return
	}

	iconName := wItem.Item.Icon
	if iconName == "" {
		log.Printf("[Icon Proxy] Icon empty in XML for %d. Raw: %s", entry, string(data))
		iconName = "inv_misc_questionmark"
	}

	// Update Cache
	iconMutex.Lock()
	iconCache[entry] = iconName
	iconMutex.Unlock()

	respondJSON(w, entry, iconName)
}

func respondJSON(w http.ResponseWriter, entry int, icon string) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"entry": entry,
		"icon":  icon,
		"url":   fmt.Sprintf("https://wotlkdb.com/static/images/wow/icons/large/%s.jpg", icon),
	})
}
