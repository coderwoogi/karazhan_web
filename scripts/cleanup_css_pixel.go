package main

import (
	"bufio"
	"fmt"
	"os"
	"strings"
)

func main_cleanup_pixel() {
	path := "pkg/home/static/style.css"
	file, err := os.Open(path)
	if err != nil {
		fmt.Printf("Error opening file: %v\n", err)
		return
	}
	defer file.Close()

	var lines []string
	scanner := bufio.NewScanner(file)
	lineCount := 0
	for scanner.Scan() {
		lineCount++
		if lineCount > 2785 {
			break
		}
		lines = append(lines, scanner.Text())
	}

	newContent := strings.Join(lines, "\n") + "\n"

	mobileCSS := `
/* Hide mobile-specific search type on PC */
.mobile-only-select {
    display: none;
}

/* Mobile Board List Redesign - Pixel Perfect Screenshot Match */
@media (max-width: 768px) {
    /* Show mobile select */
    .mobile-only-select {
        display: block;
    }

    /* Layout Reordering: Move Header (Search) to Bottom */
    #board-list-view, 
    #board-list-view.card, 
    #board-list-view.card-body,
    .tab-content[id="board"] .card {
        display: flex !important;
        flex-direction: column !important;
    }

    /* Move the search bar to the bottom (Order 3) */
    #board-list-view .card-header,
    .tab-content[id="board"] .card-header {
        order: 3 !important;
        margin-top: 0 !important;
        padding: 5px 15px 15px 15px !important;
        border-top: none !important;
        background: #efefef !important;
        display: block !important;
        border-radius: 0 !important;
    }

    #board-list-view .card-header .board-search-wrap {
        display: flex !important;
        gap: 5px !important;
        width: 100% !important;
        align-items: center !important;
    }

    #board-list-view .card-header h2 {
        display: none !important; /* Title already at top of section */
    }

    /* Move pagination/info above search (Order 2) */
    #board-pagination {
        order: 2 !important;
        background: #efefef !important;
        padding: 20px 15px !important;
        font-size: 1.1rem !important;
        font-weight: 500 !important;
        color: #000 !important;
        text-align: center !important;
        border-top: 1px solid #dcdcdc !important;
        margin-top: 0 !important;
        display: flex !important;
        justify-content: center !important;
    }

    #board-list-view .card-body {
        order: 1 !important;
        padding: 0 !important;
    }

    /* Each Post Tile */
    #board-posts-list .board-post-row {
        background: #ffffff !important;
        border-bottom: 1px solid #efefef !important;
        padding: 15px 20px !important;
        display: flex !important;
        flex-direction: column !important;
        gap: 5px !important;
        cursor: pointer !important;
    }

    /* Swapped: Title TOP, Meta BOTTOM */
    .col-title { order: 1 !important; }
    .col-author, .col-date { order: 2 !important; display: inline-block !important; width: auto !important; }

    .post-title {
        color: #000000 !important;
        font-size: 1.15rem !important;
        font-weight: 700 !important;
    }

    .col-author, .col-date {
        font-size: 0.9rem !important;
        color: #666 !important;
        margin-top: 2px !important;
    }

    .col-author { margin-right: 5px !important; }
    .col-author::after { content: " |" !important; margin-left: 5px !important; color: #ccc !important; }

    /* Search UI Refining */
    .mobile-only-select {
        width: 130px !important;
        height: 44px !important;
        border: 1px solid #ccc !important;
        border-radius: 4px !important;
        padding: 0 5px !important;
        font-size: 1.05rem !important;
        background: white !important;
    }

    #board-search {
        flex: 1 !important;
        height: 44px !important;
        border: 1px solid #ccc !important;
        border-radius: 4px !important;
        padding: 0 10px !important;
        font-size: 1.05rem !important;
        background: white !important;
    }

    .search-btn {
        width: 48px !important;
        height: 44px !important;
        background: #999 !important;
        color: transparent !important;
        position: relative !important;
        border-radius: 6px !important;
    }

    .search-btn::before {
        content: "\f002" !important;
        font-family: "Font Awesome 5 Free" !important;
        font-weight: 900 !important;
        color: white !important;
        position: absolute !important;
        left: 50% !important;
        top: 50% !important;
        transform: translate(-50%, -50%) !important;
        font-size: 1.2rem !important;
    }

    /* Hide PC headers and other buttons */
    #board-list-view thead, .refresh-btn, #board-write-btn {
        display: none !important;
    }

    .scroll-table { border: none !important; box-shadow: none !important; }
}
`

	err = os.WriteFile(path, []byte(newContent+mobileCSS), 0644)
	if err != nil {
		fmt.Printf("Error writing file: %v\n", err)
		return
	}
	fmt.Println("Successfully polished style.css for Screenshots and PC compatibility")
}
