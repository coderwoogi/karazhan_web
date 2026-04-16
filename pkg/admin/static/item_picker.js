/**
 * Unified Item Picker Module
 * Usage: ItemPicker.open((item) => { ... callback ... });
 */
const ItemPicker = {
    callback: null,
    searchTimeout: null,

    init() {
        const modal = document.getElementById('item-picker-modal');
        const input = document.getElementById('item-picker-search');

        input.addEventListener('input', (e) => {
            const query = e.target.value;
            if (this.searchTimeout) clearTimeout(this.searchTimeout);
            this.searchTimeout = setTimeout(() => this.search(query), 300);
        });
    },

    open(callback) {
        this.callback = callback;
        const modal = document.getElementById('item-picker-modal');
        modal.style.display = 'flex';
        document.getElementById('item-picker-search').value = '';
        document.getElementById('item-picker-results').innerHTML = '<div class="loading-wrapper" style="opacity: 0.6;">아이템 이름 또는 엔트리 ID로 검색하세요.</div>';
        document.getElementById('item-picker-search').focus();
    },

    close() {
        document.getElementById('item-picker-modal').style.display = 'none';
        this.callback = null;
    },

    async search(query) {
        if (query.length < 2) return;

        const resultsContainer = document.getElementById('item-picker-results');
        resultsContainer.innerHTML = '<div class="loading-wrapper"><div class="loading-spinner"></div><span>검색 중...</span></div>';

        try {
            const res = await fetch(`/api/content/item/search?q=${encodeURIComponent(query)}`);
            if (!res.ok) throw new Error('Search failed');
            const items = await res.json();

            if (!items || items.length === 0) {
                resultsContainer.innerHTML = '<div class="loading-wrapper" style="opacity: 0.6;">검색 결과가 없습니다.</div>';
                return;
            }

            resultsContainer.innerHTML = items.map(item => `
                <div class="item-search-row" onclick="ItemPicker.selectItem(${item.entry}, '${item.name.replace(/'/g, "\\'")}')">
                    <div id="ip-icon-${item.entry}" class="item-icon-small"></div>
                    <div class="item-search-info">
                        <div class="item-search-name quality-${item.quality}">${item.name}</div>
                        <div class="item-search-entry">Entry: ${item.entry}</div>
                    </div>
                </div>
            `).join('');

            // Fetch icons for visible results
            items.forEach(item => this.loadIcon(item.entry));

        } catch (e) {
            resultsContainer.innerHTML = `<div class="error-message">검색 오류: ${e.message}</div>`;
        }
    },

    async loadIcon(entry) {
        const container = document.getElementById(`ip-icon-${entry}`);
        if (!container) return;

        try {
            const res = await fetch(`/api/external/item_icon?entry=${entry}`);
            const data = await res.json();
            if (data && data.url) {
                container.innerHTML = `<img src="${data.url}" style="width:100%; height:100%; border-radius:4px;">`;
            }
        } catch (e) {
            container.innerHTML = '';
        }
    },

    selectItem(entry, name) {
        if (this.callback) {
            this.callback({ entry, name });
        }
        this.close();
    }
};

// Auto-init on load
document.addEventListener('DOMContentLoaded', () => ItemPicker.init());
