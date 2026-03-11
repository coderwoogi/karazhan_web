package main

import (
	"bufio"
	"fmt"
	"os"
	"strings"
)

func main_cleanup_semantic() {
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

/* --- Mobile Board Redesign: Semantic UL/LI (Screenshot Match) --- */
@media (max-width: 768px) {
    .mobile-only-select {
        display: block;
    }

    #board-list-view, 
    #board-list-view.card, 
    #board-list-view.card-body,
    .tab-content[id="board"] .card {
        display: flex !important;
        flex-direction: column !important;
    }

    /* Move the search bar to the bottom */
    #board-list-view .card-header,
    .tab-content[id="board"] .card-header {
        order: 3 !important;
        margin-top: 0 !important;
        padding: 10px 15px 15px 15px !important;
        background: #efefef !important;
        display: block !important;
        border: none !important;
        border-radius: 0 !important;
    }

    #board-list-view .card-header h2 { display: none !important; }

    #board-list-view .card-body {
        order: 1 !important;
        padding: 0 !important;
        display: flex !important;
        flex-direction: column !important;
    }

    #board-posts-container {
        order: 1 !important;
        flex: 1 !important;
        background: white !important;
    }

    /* Semantic List Style */
    .mobile-post-list {
        list-style: none !important;
        padding: 0 !important;
        margin: 0 !important;
    }

    .mobile-post-item {
        padding: 20px !important;
        border-bottom: 1px solid #efefef !important;
        cursor: pointer !important;
        display: flex !important;
        flex-direction: column !important;
        gap: 8px !important;
    }

    .mobile-post-item:active {
        background: #f8fafc !important;
    }

    .mobile-post-item .post-title {
        font-size: 1.2rem !important;
        font-weight: 800 !important;
        color: #000 !important;
        line-height: 1.4 !important;
        display: block !important;
    }

    .mobile-post-item .post-meta {
        display: flex !important;
        align-items: center !important;
        font-size: 0.9rem !important;
        color: #666 !important;
        gap: 10px !important;
    }

    .mobile-post-item .post-meta .author {
        color: var(--primary-color) !important;
        font-weight: 700 !important;
    }

    .mobile-post-item .post-meta .divider {
        color: #ddd !important;
    }

    /* Pagination (Order 2) */
    #board-pagination {
        order: 2 !important;
        background: #efefef !important;
        padding: 20px 15px !important;
        font-size: 1.1rem !important;
        font-weight: 500 !important;
        color: #000 !important;
        text-align: center !important;
        border-top: 1px solid #dcdcdc !important;
        margin: 0 !important;
    }

    .mobile-pagination-info {
        font-weight: 600 !important;
    }

    /* Search Input UI */
    .board-search-wrap {
        display: flex !important;
        gap: 5px !important;
        width: 100% !important;
    }

    .mobile-only-select {
        width: 130px !important;
        height: 44px !important;
        border: 1px solid #ccc !important;
        border-radius: 4px !important;
        padding: 0 5px !important;
        font-size: 1rem !important;
        background: white !important;
    }

    #board-search {
        flex: 1 !important;
        height: 44px !important;
        border: 1px solid #ccc !important;
        border-radius: 4px !important;
        padding: 0 10px !important;
        font-size: 1rem !important;
        background: white !important;
    }

    .search-btn {
        width: 48px !important;
        height: 44px !important;
        background: #999 !important;
        color: transparent !important;
        position: relative !important;
        border-radius: 4px !important;
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
        font-size: 1.1rem !important;
    }

    .refresh-btn, #board-write-btn { display: none !important; }
}
`

	err = os.WriteFile(path, []byte(newContent+mobileCSS), 0644)
	if err != nil {
		fmt.Printf("Error writing file: %v\n", err)
		return
	}
	fmt.Println("Successfully applied Semantic UL/LI Mobile UI to style.css")
}
