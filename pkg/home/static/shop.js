let g_shopItems = [];
let g_shopAdminItems = [];
let g_shopAdminFilteredItems = [];
let g_shopAdminOrders = [];
let g_shopCoinListings = [];
let g_shopCoinCharacters = [];
let g_shopItemsPage = 1;
let g_shopAdminItemsPage = 1;
let g_shopAdminOrdersPage = 1;
let g_shopCoinPage = 1;
const g_shopMyOrdersByTarget = {};
const g_shopMyOrdersPageByTarget = {};
const SHOP_TABLE_PAGE_SIZE = 10;
const SHOP_ICON_BORDER_URL = '/img/default.png';
const SHOP_POINT_ICON_URL = '/img/web_point.png';
const SHOP_GOLD_ICON_URL = '/img/money-gold.png';
const SHOP_ALLIANCE_ICON_URL = '/img/0.png';
const SHOP_HORDE_ICON_URL = '/img/1.png';

function escShop(v) {
    const s = String(v ?? '');
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function shopStatusLabel(s) {
    const map = {
        pending: '대기',
        processing: '처리중',
        completed: '완료',
        rejected: '거절',
        refunded: '환불'
    };
    return map[s] || s;
}

function shopTypeLabel(t) {
    return t === 'function' ? '기능' : '인게임';
}

function shopFormatGold(copper) {
    const c = Number(copper || 0);
    return `${Math.floor(c / 10000).toLocaleString()} G`;
}

function shopPointWithIcon(points) {
    return `<span style="display:inline-flex; align-items:center; gap:6px; font-weight:700; color:#f59e0b;"><img src="${SHOP_POINT_ICON_URL}" alt="point" style="width:16px; height:16px; object-fit:contain;">${Number(points || 0).toLocaleString()}</span>`;
}

function shopGoldWithIcon(copper) {
    return `<span style="display:inline-flex; align-items:center; gap:6px; font-weight:700; color:#f59e0b;"><img src="${SHOP_GOLD_ICON_URL}" alt="gold" style="width:16px; height:16px; object-fit:contain;">${Math.floor(Number(copper || 0) / 10000).toLocaleString()} G</span>`;
}

function shopFactionIconByCode(code) {
    const n = Number(code);
    if (n === 0) return SHOP_ALLIANCE_ICON_URL;
    if (n === 1) return SHOP_HORDE_ICON_URL;
    return '';
}

function shopFormatDateOrAgo(v) {
    const s = String(v || '').trim();
    if (!s) return '-';
    const d = new Date(s.replace(' ', 'T'));
    if (Number.isNaN(d.getTime())) return escShop(s);
    const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diffSec >= 0 && diffSec < 86400) {
        if (diffSec < 60) return '방금 전';
        if (diffSec < 3600) return `${Math.floor(diffSec / 60)}분 전`;
        return `${Math.floor(diffSec / 3600)}시간 전`;
    }
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function renderShopFramedIcon(innerHtml) {
    return `
        <span style="position:relative; width:32px; height:32px; display:inline-flex; align-items:center; justify-content:center;">
            ${innerHtml}
            <img src="${SHOP_ICON_BORDER_URL}" alt="icon-border" style="position:absolute; inset:0; width:32px; height:32px; pointer-events:none; z-index:2;">
        </span>
    `;
}

function renderShopItemIcon(item, containerId) {
    if (item && item.icon_path) {
        return renderShopFramedIcon(`<img src="${escShop(item.icon_path)}" alt="shop-icon" style="position:absolute; inset:2px; width:28px; height:28px; border-radius:4px; object-fit:cover; z-index:1;" onerror="this.style.display='none';">`);
    }
    if (item && item.item_type === 'game' && Number(item.item_entry) > 0) {
        return `<div id="${containerId}" style="width:32px; height:32px; display:inline-flex; align-items:center; justify-content:center;">
            ${renderShopFramedIcon(`<span style="position:absolute; inset:2px; width:28px; height:28px; border-radius:4px; background:#f1f5f9; display:inline-flex; align-items:center; justify-content:center; color:#64748b; z-index:1;"><i class="fas fa-box"></i></span>`)}
        </div>`;
    }
    return renderShopFramedIcon(`<span style="position:absolute; inset:2px; width:28px; height:28px; border-radius:4px; background:#f1f5f9; color:#64748b; display:inline-flex; align-items:center; justify-content:center; z-index:1;"><i class="fas fa-magic"></i></span>`);
}

function renderShopProductMedia(item, containerId) {
    if (item && item.icon_path) {
        return `<img src="${escShop(item.icon_path)}" alt="product-icon" class="shop-product-media-img" onerror="this.style.display='none'; this.parentElement?.classList.add('shop-product-media-fallback');">`;
    }
    if (item && item.item_type === 'game' && Number(item.item_entry) > 0) {
        return `
            <div id="${containerId}" class="shop-product-media-loader">
                <span class="shop-product-media-fallback-icon"><i class="fas fa-box"></i></span>
            </div>
        `;
    }
    return `<span class="shop-product-media-fallback-icon"><i class="fas fa-magic"></i></span>`;
}

function wrapShopWowheadItem(entry, innerHtml, title = '') {
    if (typeof wrapWithWowheadItemLink === 'function') {
        return wrapWithWowheadItemLink(entry, innerHtml, title);
    }
    const itemEntry = Number(entry) || 0;
    if (itemEntry <= 0) return innerHtml;
    return `<a href="https://www.wowhead.com/ko/?item=${itemEntry}" data-wowhead="domain=ko.wowhead.com&item=${itemEntry}" style="text-decoration:none; color:inherit;">${innerHtml}</a>`;
}

function refreshShopWowheadTooltips() {
    if (typeof refreshWowheadTooltips === 'function') {
        refreshWowheadTooltips();
    }
}

function wrapShopItemName(entry, nameText) {
    const safeName = escShop(nameText || '');
    const itemEntry = Number(entry) || 0;
    if (itemEntry <= 0) return safeName;
    return wrapShopWowheadItem(itemEntry, `<span>${safeName}</span>`, safeName);
}

async function loadShopIcon(entry, containerId) {
    const container = document.getElementById(containerId);
    if (!container || !entry) return;
    try {
        const res = await fetch(`/api/external/item_icon?entry=${entry}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!data || !data.url) return;
        const iconHtml = renderShopFramedIcon(`<img src="${data.url}" alt="item-${entry}" style="position:absolute; inset:2px; width:28px; height:28px; border-radius:4px; object-fit:cover; z-index:1;" onerror="this.style.display='none';">`);
        container.innerHTML = wrapShopWowheadItem(entry, iconHtml, `아이템 ${entry}`);
        refreshShopWowheadTooltips();
    } catch (e) {
        // keep fallback icon
    }
}

async function loadShopProductMedia(entry, containerId) {
    const container = document.getElementById(containerId);
    if (!container || !entry) return;
    try {
        const res = await fetch(`/api/external/item_icon?entry=${entry}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!data || !data.url) return;
        const safeUrl = escShop(data.url);
        container.innerHTML = wrapShopWowheadItem(entry, `<img src="${safeUrl}" alt="item-${entry}" class="shop-product-media-img" onerror="this.style.display='none'; this.parentElement?.classList.add('shop-product-media-fallback');">`, `아이템 ${entry}`);
        refreshShopWowheadTooltips();
    } catch (e) {
        // keep fallback icon
    }
}

async function resolveShopItemPreviewImage(item) {
    if (item && item.icon_path) {
        return String(item.icon_path).trim();
    }
    const entry = Number(item && item.item_entry ? item.item_entry : 0);
    if (!(item && item.item_type === 'game') || entry <= 0) {
        return '';
    }
    try {
        const res = await fetch(`/api/external/item_icon?entry=${entry}`);
        if (!res.ok) return '';
        const data = await res.json();
        return data && data.url ? String(data.url).trim() : '';
    } catch (e) {
        return '';
    }
}

async function loadShopPage() {
    openShopSubTab(document.getElementById('shop-sub-btn-coin')?.classList.contains('active') ? 'coin' : 'items');
}

function openShopSubTab(tabName) {
    const itemsBtn = document.getElementById('shop-sub-btn-items');
    const coinBtn = document.getElementById('shop-sub-btn-coin');
    const itemsPanel = document.getElementById('shop-sub-items');
    const coinPanel = document.getElementById('shop-sub-coin');
    if (itemsBtn) itemsBtn.classList.remove('active');
    if (coinBtn) coinBtn.classList.remove('active');
    if (itemsPanel) itemsPanel.style.display = 'none';
    if (coinPanel) coinPanel.style.display = 'none';

    if (tabName === 'coin') {
        if (coinBtn) coinBtn.classList.add('active');
        if (coinPanel) coinPanel.style.display = 'block';
        loadShopCoinMarketPage();
        return;
    }
    if (itemsBtn) itemsBtn.classList.add('active');
    if (itemsPanel) itemsPanel.style.display = 'block';
    loadShopItems();
}

async function loadShopItems() {
    const qEl = document.getElementById('shop-search-input');
    const q = qEl ? encodeURIComponent(qEl.value.trim()) : '';
    const res = await fetch(`/api/shop/items${q ? `?q=${q}` : ''}`);
    if (!res.ok) return;
    const data = await res.json();
    g_shopItems = Array.isArray(data.items) ? data.items : [];
    renderShopItemsPage(1);
}

async function loadShopCoinMarketPage() {
    await loadShopCoinMarketListings();
}

async function loadShopCoinMarketCharacters(selectId = 'shop-coin-modal-character', goldId = 'shop-coin-modal-gold') {
    const sel = document.getElementById(selectId);
    const goldEl = document.getElementById(goldId);
    if (!sel) return;
    try {
        const res = await fetch('/api/shop/coin-market/my-characters');
        const data = await res.json();
        if (!res.ok || data.status !== 'success') throw new Error(data.message || '캐릭터 목록 조회 실패');
        g_shopCoinCharacters = Array.isArray(data.characters) ? data.characters : [];
        if (!g_shopCoinCharacters.length) {
            sel.innerHTML = '<option value="">캐릭터 없음</option>';
            if (goldEl) goldEl.innerHTML = shopGoldWithIcon(0);
            return;
        }
        sel.innerHTML = g_shopCoinCharacters.map(c => `<option value="${escShop(c.name)}">${escShop(c.name)} (Lv.${Number(c.level || 0)})</option>`).join('');
        onChangeShopCoinSellerCharacter(selectId, goldId);
    } catch (e) {
        sel.innerHTML = '<option value="">조회 실패</option>';
        if (goldEl) goldEl.innerHTML = shopGoldWithIcon(0);
    }
}

function onChangeShopCoinSellerCharacter(selectId = 'shop-coin-modal-character', goldId = 'shop-coin-modal-gold') {
    const sel = document.getElementById(selectId);
    const goldEl = document.getElementById(goldId);
    if (!sel || !goldEl) return;
    const name = String(sel.value || '').trim();
    const found = g_shopCoinCharacters.find(c => String(c.name || '') === name);
    const goldCopper = found ? Number(found.gold_copper || 0) : 0;
    goldEl.innerHTML = shopGoldWithIcon(goldCopper);
}

async function loadShopCoinMarketListings() {
    const tbody = document.getElementById('shop-coin-market-body');
    const pg = document.getElementById('shop-coin-market-pagination');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:1rem;">불러오는 중...</td></tr>';
    try {
        const res = await fetch('/api/shop/coin-market/list');
        const data = await res.json();
        if (!res.ok || data.status !== 'success') throw new Error(data.message || `HTTP ${res.status}`);
        g_shopCoinListings = Array.isArray(data.listings) ? data.listings : [];
        renderShopCoinMarketPage(1);
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:1rem; color:#ef4444;">${escShop(e.message || '코인시장 목록 조회 실패')}</td></tr>`;
        if (pg) pg.innerHTML = '';
    }
}

function renderShopCoinMarketPage(page = 1) {
    const tbody = document.getElementById('shop-coin-market-body');
    const pg = document.getElementById('shop-coin-market-pagination');
    if (!tbody) return;
    g_shopCoinPage = Math.max(1, page);
    if (!g_shopCoinListings.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:1.2rem;">등록된 판매글이 없습니다.</td></tr>';
        if (pg) pg.innerHTML = '';
        return;
    }
    const start = (g_shopCoinPage - 1) * SHOP_TABLE_PAGE_SIZE;
    const rows = g_shopCoinListings.slice(start, start + SHOP_TABLE_PAGE_SIZE);
    const totalCount = g_shopCoinListings.length;
    const currentUserId = Number(window.g_sessionUser?.id || 0);
    tbody.innerHTML = rows.map((row, idx) => {
        const rowNo = totalCount - (start + idx);
        const sellerId = Number(row.seller_user_id || 0);
        const isMine = currentUserId > 0 && currentUserId === sellerId;
        const level = Number(row.seller_level || 0);
        const faction = String(row.seller_faction || '중립');
        const factionCode = Number(row.seller_faction_code ?? -1);
        const factionIcon = shopFactionIconByCode(factionCode);
        const charName = String(row.seller_character || '-');
        const goldG = Math.floor(Number(row.gold_copper || 0) / 10000);
        const priceP = Math.max(1, Number(row.price_points || 0));
        const ratio = (goldG / priceP);
        const created = shopFormatDateOrAgo(row.created_at || '');
        const realmName = String(row.realm || 'Karazhan');
        const actionBtn = isMine
            ? `<button class="btn shop-table-cancel-btn" onclick="cancelShopCoinListing(${Number(row.id || 0)})">판매취소</button>`
            : `<button class="btn shop-table-action-btn" onclick="buyShopCoinListing(${Number(row.id || 0)})"><img src="${SHOP_POINT_ICON_URL}" alt="point" style="width:18px; height:18px; object-fit:contain;">${Number(row.price_points || 0).toLocaleString()}</button>`;
        return `
            <tr>
                <td style="font-weight:700;">${rowNo}</td>
                <td style="font-weight:600; color:#ada292;">${created}</td>
                <td>${shopGoldWithIcon(row.gold_copper || 0)}</td>
                <td>
                    <div style="display:flex; align-items:center; gap:8px;">
                        ${factionIcon ? `<img src="${factionIcon}" alt="${escShop(faction)}" style="width:18px; height:18px; object-fit:contain;">` : `<span style="width:18px; height:18px; display:inline-flex; align-items:center; justify-content:center; color:#94a3b8;"><i class="fas fa-circle"></i></span>`}
                        <span style="display:inline-flex; align-items:center; justify-content:center; min-width:44px; height:24px; padding:0 8px; border-radius:999px; font-size:12px; font-weight:800; background:#2a2d37; color:#ada292; border:1px solid rgba(173,162,146,0.35);">${level} Lv</span>
                        <span style="font-weight:700;">${escShop(charName)}</span>
                    </div>
                </td>
                <td>
                    <span style="display:inline-flex; align-items:center; justify-content:center; min-height:28px; padding:4px 12px; border-radius:10px; border:1px solid rgba(173,162,146,0.35); background:#171a25; color:#ada292; font-weight:700;">${escShop(realmName)}</span>
                </td>
                <td>
                    <span style="display:inline-flex; align-items:center; justify-content:center; min-width:66px; height:30px; padding:0 10px; border-radius:8px; background:#2a2d37; color:#ada292; border:1px solid rgba(173,162,146,0.35); font-weight:800;">${ratio.toFixed(2)}</span>
                </td>
                <td style="text-align:center;">
                    ${actionBtn}
                </td>
            </tr>
        `;
    }).join('');
    if (pg && typeof renderPagination === 'function') {
        renderPagination(pg, {
            page: g_shopCoinPage,
            totalPages: Math.max(1, Math.ceil(g_shopCoinListings.length / SHOP_TABLE_PAGE_SIZE))
        }, (p) => renderShopCoinMarketPage(p));
    }
}

async function createShopCoinListing() {
    const charEl = document.getElementById('shop-coin-modal-character');
    const goldEl = document.getElementById('shop-coin-modal-sell-gold');
    const priceEl = document.getElementById('shop-coin-modal-sell-price');
    const character = String(charEl?.value || '').trim();
    const goldAmountRaw = Number(goldEl?.value || 0);
    const goldAmount = Math.floor(goldAmountRaw);
    const pricePoints = Number(priceEl?.value || 0);
    if (!character || goldAmount <= 0 || pricePoints <= 0) {
        if (window.Swal) await Swal.fire({ icon: 'warning', title: '입력값을 확인해주세요.' });
        return;
    }
    if (!Number.isInteger(goldAmountRaw)) {
        if (window.Swal) await Swal.fire({ icon: 'warning', title: '코인시장은 골드 단위만 거래됩니다. (정수 골드 입력)' });
        return;
    }
    const res = await fetch('/api/shop/coin-market/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ character, gold_amount: goldAmount, price_points: Math.floor(pricePoints) })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.status !== 'success') {
        if (window.Swal) await Swal.fire({ icon: 'error', title: data.message || '판매 등록 실패' });
        return;
    }
    if (goldEl) goldEl.value = '';
    if (priceEl) priceEl.value = '';
    if (window.Swal) await Swal.fire({ icon: 'success', title: '코인시장 판매글이 등록되었습니다.', timer: 1000, showConfirmButton: false });
    closeShopCoinSellModal();
    await loadShopCoinMarketPage();
}

async function buyShopCoinListing(listingID) {
    const picked = await promptShopCharacterSelection();
    if (!picked || !picked.name) return;
    const res = await fetch('/api/shop/coin-market/buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing_id: Number(listingID), buyer_character: String(picked.name) })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.status !== 'success') {
        if (window.Swal) await Swal.fire({ icon: 'error', title: data.message || '구매 실패' });
        return;
    }
    if (data && data.points_after !== undefined && data.points_after !== null) {
        const formatted = Number(data.points_after).toLocaleString();
        document.querySelectorAll('#user-points-display, #user-points-display-desktop').forEach(el => {
            el.textContent = formatted;
        });
        if (window.g_sessionUser) window.g_sessionUser.points = Number(data.points_after);
    }
    if (window.Swal) await Swal.fire({ icon: 'success', title: '구매가 완료되었습니다. 우편함을 확인하세요.' });
    await loadShopCoinMarketPage();
    if (typeof fetchNotifications === 'function') fetchNotifications();
}

async function cancelShopCoinListing(listingID) {
    if (window.Swal) {
        const ok = await Swal.fire({
            icon: 'warning',
            title: '판매를 취소하시겠습니까?',
            showCancelButton: true,
            confirmButtonText: '취소',
            cancelButtonText: '닫기'
        });
        if (!ok.isConfirmed) return;
    }
    const res = await fetch('/api/shop/coin-market/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing_id: Number(listingID) })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.status !== 'success') {
        if (window.Swal) await Swal.fire({ icon: 'error', title: data.message || '판매 취소 실패' });
        return;
    }
    if (window.Swal) await Swal.fire({ icon: 'success', title: '판매가 취소되었습니다.', timer: 900, showConfirmButton: false });
    await loadShopCoinMarketPage();
}

async function openShopCoinSellModal() {
    const modal = document.getElementById('shop-coin-sell-modal');
    if (!modal) return;
    await loadShopCoinMarketCharacters('shop-coin-modal-character', 'shop-coin-modal-gold');
    const gEl = document.getElementById('shop-coin-modal-sell-gold');
    const pEl = document.getElementById('shop-coin-modal-sell-price');
    if (gEl) gEl.value = '';
    if (pEl) pEl.value = '';
    modal.style.display = 'flex';
}

function closeShopCoinSellModal() {
    const modal = document.getElementById('shop-coin-sell-modal');
    if (modal) modal.style.display = 'none';
}

function renderShopItemsPage(page = 1) {
    const tbody = document.getElementById('shop-items-body');
    const pg = document.getElementById('shop-items-pagination');
    const pointSummary = document.getElementById('shop-items-point-summary');
    const countSummary = document.getElementById('shop-items-count-summary');
    if (!tbody) return;
    if (pointSummary) {
        pointSummary.textContent = `${Number(window.g_sessionUser?.points || 0).toLocaleString()} P`;
    }
    if (countSummary) {
        countSummary.textContent = `${g_shopItems.length}개`;
    }

    if (!g_shopItems.length) {
        tbody.innerHTML = '<div class="shop-store-empty">등록된 상품이 없습니다.</div>';
        if (pg) pg.innerHTML = '';
        return;
    }

    const rows = g_shopItems.slice();
    tbody.innerHTML = rows.map((item) => {
        const iconId = `shop-item-icon-${item.id}`;
        const itemName = escShop(item.name || '이름 없는 상품');
        return `
            <article class="shop-product-card" onclick="openShopItemDetailModal(${item.id})" role="button" tabindex="0" onkeydown="if(event.key==='Enter'||event.key===' '){ event.preventDefault(); openShopItemDetailModal(${item.id}); }">
                <div class="shop-product-media">${renderShopProductMedia(item, iconId)}</div>
                <div class="shop-product-shade"></div>
                <div class="shop-product-title-wrap">
                    <h4 class="shop-product-title">${itemName}</h4>
                    <div class="shop-product-price-row">${shopPointWithIcon(item.price_points || 0)}</div>
                </div>
            </article>
        `;
    }).join('');

    rows.forEach(item => {
        if (item.item_type === 'game' && Number(item.item_entry) > 0) {
            loadShopProductMedia(Number(item.item_entry), `shop-item-icon-${item.id}`);
        }
    });
    refreshShopWowheadTooltips();

    if (pg) pg.innerHTML = '';
}

async function openShopItemDetailModal(itemID) {
    const item = g_shopItems.find(v => Number(v.id) === Number(itemID));
    if (!item || !window.Swal) return;

    const imageUrl = await resolveShopItemPreviewImage(item);
    const itemName = item.item_type === 'game' ? wrapShopItemName(item.item_entry, item.name) : escShop(item.name || '이름 없는 상품');
    const itemDesc = escShop(item.description || '상품 설명이 없습니다.');
    const stockText = Number(item.stock_qty) < 0 ? '무제한' : `${Number(item.stock_qty).toLocaleString()}개`;
    const typeText = item.item_type === 'function' ? '기능 상품' : '인게임 아이템';
    const imageHtml = imageUrl
        ? `<img src="${escShop(imageUrl)}" alt="shop-detail-icon" style="width:100%; height:100%; object-fit:cover; display:block;">`
        : `<div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; color:rgba(244,236,220,0.78); font-size:3rem;"><i class="fas fa-box-open"></i></div>`;

    const result = await Swal.fire({
        title: escShop(item.name || '상품 상세'),
        width: 760,
        background: 'linear-gradient(180deg, rgba(11, 16, 30, 0.98) 0%, rgba(6, 9, 19, 0.98) 100%)',
        color: '#f4ecdc',
        customClass: {
            popup: 'shop-detail-swal-popup',
            title: 'shop-detail-swal-title',
            confirmButton: 'shop-detail-swal-confirm',
            cancelButton: 'shop-detail-swal-cancel'
        },
        html: `
            <div style="display:grid; grid-template-columns:280px minmax(0, 1fr); gap:24px; text-align:left; align-items:start;">
                <div style="height:340px; border-radius:20px; overflow:hidden; background:linear-gradient(180deg, rgba(22,28,50,0.94), rgba(9,13,26,0.96)); border:1px solid rgba(173,162,146,0.24); box-shadow:0 18px 34px rgba(0,0,0,0.28);">
                    ${imageHtml}
                </div>
                <div style="display:flex; flex-direction:column; gap:16px; min-height:340px;">
                    <div style="display:flex; flex-direction:column; gap:10px;">
                        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
                            <span style="display:inline-flex; align-items:center; justify-content:center; padding:6px 10px; border-radius:999px; background:rgba(173,162,146,0.16); color:#f4ecdc; font-size:12px; font-weight:800;">${typeText}</span>
                            <span style="color:#f4ecdc; font-size:1.05rem; font-weight:800;">${shopPointWithIcon(item.price_points || 0)}</span>
                        </div>
                        <div style="font-size:1.5rem; line-height:1.3; color:#f6efdf; font-weight:900;">${itemName}</div>
                    </div>
                    <div style="padding:16px 18px; border-radius:16px; background:rgba(7,10,21,0.72); border:1px solid rgba(173,162,146,0.14); color:#ddd6ca; line-height:1.75; font-size:0.96rem;">
                        ${itemDesc}
                    </div>
                    <div style="display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:12px; margin-top:auto;">
                        <div style="padding:14px 16px; border-radius:16px; background:rgba(7,10,21,0.72); border:1px solid rgba(173,162,146,0.14);">
                            <div style="font-size:12px; color:rgba(221,214,202,0.72); margin-bottom:6px;">재고</div>
                            <div style="font-size:15px; color:#f4ecdc; font-weight:800;">${stockText}</div>
                        </div>
                        <div style="padding:14px 16px; border-radius:16px; background:rgba(7,10,21,0.72); border:1px solid rgba(173,162,146,0.14);">
                            <div style="font-size:12px; color:rgba(221,214,202,0.72); margin-bottom:6px;">상품 유형</div>
                            <div style="font-size:15px; color:#f4ecdc; font-weight:800;">${typeText}</div>
                        </div>
                    </div>
                </div>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: '구매하기',
        cancelButtonText: '닫기',
        buttonsStyling: false
    });

    if (result.isConfirmed) {
        await openShopBuyPrompt(itemID);
    }
}

async function openShopBuyPrompt(itemID) {
    const item = g_shopItems.find(v => Number(v.id) === Number(itemID));
    if (!item) return;
    let qty = 1;
    let targetCharacter = '';
    let targetCharacterLevel = 0;

    // 최우선 조건: 월드서버 OFF 상태에서는 선술집 구매 자체를 차단
    try {
        const statusRes = await fetch('/api/shop/world-status');
        const statusData = await statusRes.json();
        if (!statusRes.ok || !statusData || statusData.world_running !== true) {
            if (window.Swal) {
                await Swal.fire({
                    icon: 'warning',
                    title: '월드서버가 가동 중이 아닙니다.',
                    text: '서버 가동 후 선술집 구매가 가능합니다.'
                });
            }
            return;
        }
    } catch (e) {
        if (window.Swal) {
            await Swal.fire({
                icon: 'warning',
                title: '월드서버 상태를 확인할 수 없습니다.',
                text: '잠시 후 다시 시도해주세요.'
            });
        }
        return;
    }

    const functionCode = String(item.function_code || '').toLowerCase();
    const needCharacter = item.item_type === 'game' || (item.item_type === 'function' && functionCode !== 'dual_account' && functionCode !== 'enhanced_enchant_stone' && functionCode !== 'carddraw_count');
    if (needCharacter) {
        const picked = await promptShopCharacterSelection();
        if (!picked || !picked.name) return;
        targetCharacter = picked.name;
        targetCharacterLevel = Number(picked.level || 0);
    }

    const isLevelUpFunction = item.item_type === 'function' && ['level_up', 'level80', 'level_80'].includes(functionCode);
    if (isLevelUpFunction && targetCharacterLevel >= 80) {
        if (window.Swal) {
            await Swal.fire({
                icon: 'warning',
                title: '이미 만렙(80레벨) 캐릭터입니다.',
                text: '레벨업 상품은 구매할 수 없습니다.'
            });
        }
        return;
    }

    if (window.Swal) {
        const result = await Swal.fire({
            title: `${escShop(item.name)} 구매`,
            html: `<div style="text-align:left;">수량을 입력하세요. (가격: <b>${Number(item.price_points || 0).toLocaleString()} 포인트</b>)</div>`,
            input: 'number',
            inputValue: 1,
            inputAttributes: { min: 1, step: 1 },
            showCancelButton: true,
            confirmButtonText: '구매',
            cancelButtonText: '취소'
        });
        if (!result.isConfirmed) return;
        qty = Math.max(1, parseInt(result.value || '1', 10));
    } else {
        qty = Math.max(1, parseInt(prompt('수량을 입력하세요', '1') || '1', 10));
    }
    await purchaseShopItem(itemID, qty, targetCharacter);
}

async function promptShopCharacterSelection() {
    try {
        const res = await fetch('/api/user/characters');
        if (!res.ok) throw new Error('캐릭터 목록 조회 실패');
        const data = await res.json();
        const chars = Array.isArray(data)
            ? data
            : (Array.isArray(data.characters) ? data.characters : []);
        if (!chars.length) {
            if (window.Swal) await Swal.fire({ icon: 'warning', title: '보유 캐릭터가 없습니다.' });
            return '';
        }

        if (window.Swal) {
            const optionsHtml = chars
                .map(c => `<option value="${escShop(c.name)}" data-level="${Number(c.level || 0)}">${escShop(c.name)} (Lv.${c.level || 0})</option>`)
                .join('');
            const result = await Swal.fire({
                title: '수령 캐릭터 선택',
                html: `<select id="shop-target-character" class="input-premium" style="width:100%;">${optionsHtml}</select>`,
                showCancelButton: true,
                confirmButtonText: '선택',
                cancelButtonText: '취소',
                preConfirm: () => {
                    const el = document.getElementById('shop-target-character');
                    if (!el) return null;
                    const opt = el.options[el.selectedIndex];
                    return {
                        name: el.value || '',
                        level: Number(opt ? opt.getAttribute('data-level') || 0 : 0)
                    };
                }
            });
            return result.isConfirmed ? (result.value || null) : null;
        }

        const names = chars.map(c => c.name);
        const picked = prompt(`수령 캐릭터명을 입력하세요:\n${names.join(', ')}`, names[0] || '');
        const pickedName = (picked || '').trim();
        if (!pickedName) return null;
        const found = chars.find(c => String(c.name || '') === pickedName);
        return { name: pickedName, level: Number(found ? found.level || 0 : 0) };
    } catch (e) {
        if (window.Swal) await Swal.fire({ icon: 'error', title: e.message || '캐릭터 목록 조회에 실패했습니다.' });
        return null;
    }
}

async function purchaseShopItem(itemID, qty, character = '') {
    try {
        const res = await fetch('/api/shop/orders/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ item_id: itemID, qty: qty, character: character })
        });
        const data = await res.json();
        if (!res.ok || data.status !== 'success') throw new Error(data.message || `HTTP ${res.status}`);

        if (window.Swal) {
            await Swal.fire({ icon: 'success', title: '구매 요청이 접수되었습니다. 캐릭터 재접속 후 우편을 확인하세요.', confirmButtonText: '확인' });
        }
        if (data && data.points_after !== undefined && data.points_after !== null) {
            const formatted = Number(data.points_after).toLocaleString();
            document.querySelectorAll('#user-points-display, #user-points-display-desktop').forEach(el => {
                el.textContent = formatted;
            });
            if (window.g_sessionUser) {
                window.g_sessionUser.points = Number(data.points_after);
            }
        } else if (typeof updatePointsHeader === 'function') {
            updatePointsHeader();
        }
        await loadShopPage();
        if (typeof fetchNotifications === 'function') fetchNotifications();
        if (typeof loadShopMyOrders === 'function') loadShopMyOrders('mypage-shop-orders-body');
    } catch (e) {
        if (window.Swal) await Swal.fire({ icon: 'error', title: e.message || '구매에 실패했습니다.' });
    }
}

async function loadShopMyOrders(targetBodyId = 'shop-my-orders-body') {
    const res = await fetch('/api/shop/my-orders');
    if (!res.ok) return;
    const data = await res.json();
    const orders = Array.isArray(data.orders) ? data.orders : [];
    g_shopMyOrdersByTarget[targetBodyId] = orders;
    renderShopMyOrdersPage(targetBodyId, 1);
}

function getShopMyOrdersPaginationId(targetBodyId) {
    if (targetBodyId === 'mypage-shop-orders-body') return 'mypage-shop-orders-pagination';
    return 'shop-my-orders-pagination';
}

function renderShopMyOrdersPage(targetBodyId = 'shop-my-orders-body', page = 1) {
    const orders = Array.isArray(g_shopMyOrdersByTarget[targetBodyId]) ? g_shopMyOrdersByTarget[targetBodyId] : [];
    const tbody = document.getElementById(targetBodyId);
    const pg = document.getElementById(getShopMyOrdersPaginationId(targetBodyId));
    if (!tbody) return;
    g_shopMyOrdersPageByTarget[targetBodyId] = Math.max(1, page);

    if (!orders.length) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:1.2rem;">주문 내역이 없습니다.</td></tr>';
        if (pg) pg.innerHTML = '';
        return;
    }

    const start = (g_shopMyOrdersPageByTarget[targetBodyId] - 1) * SHOP_TABLE_PAGE_SIZE;
    const rows = orders.slice(start, start + SHOP_TABLE_PAGE_SIZE);
    tbody.innerHTML = rows.map(o => {
        const iconId = `shop-my-order-icon-${o.id}`;
        return `
        <tr>
            <td>${o.id}</td>
            <td style="text-align:center;">${renderShopItemIcon(o, iconId)}</td>
            <td>${o.item_type === 'game' ? wrapShopItemName(o.item_entry, o.item_name) : escShop(o.item_name)}</td>
            <td>${o.qty}</td>
            <td>${shopPointWithIcon(o.total_price || 0)}</td>
            <td><span class="lvl-badge">${shopStatusLabel(o.status)}</span></td>
            <td style="max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escShop(o.admin_note || '')}</td>
            <td>${escShop(o.created_at || '')}</td>
        </tr>
    `;
    }).join('');

    rows.forEach(o => {
        if (o.item_type === 'game' && Number(o.item_entry) > 0) {
            loadShopIcon(Number(o.item_entry), `shop-my-order-icon-${o.id}`);
        }
    });
    refreshShopWowheadTooltips();

    if (pg && typeof renderPagination === 'function') {
        renderPagination(pg, {
            page: g_shopMyOrdersPageByTarget[targetBodyId],
            totalPages: Math.max(1, Math.ceil(orders.length / SHOP_TABLE_PAGE_SIZE))
        }, (p) => renderShopMyOrdersPage(targetBodyId, p));
    }
}

async function loadShopAdminPage() {
    openShopAdminSubTab('items');
    await loadShopAdminItems();
    await loadShopAdminOrders();
}

function openShopAdminSubTab(tabName) {
    const itemsBtn = document.getElementById('shop-admin-sub-btn-items');
    const ordersBtn = document.getElementById('shop-admin-sub-btn-orders');
    const itemsPanel = document.getElementById('shop-admin-sub-items');
    const ordersPanel = document.getElementById('shop-admin-sub-orders');

    if (itemsBtn) itemsBtn.classList.remove('active');
    if (ordersBtn) ordersBtn.classList.remove('active');
    if (itemsPanel) itemsPanel.style.display = 'none';
    if (ordersPanel) ordersPanel.style.display = 'none';

    if (tabName === 'orders') {
        if (ordersBtn) ordersBtn.classList.add('active');
        if (ordersPanel) ordersPanel.style.display = 'block';
        loadShopAdminOrders();
        return;
    }

    if (itemsBtn) itemsBtn.classList.add('active');
    if (itemsPanel) itemsPanel.style.display = 'block';
    loadShopAdminItems();
}

async function loadShopAdminItems() {
    const res = await fetch('/api/admin/shop/items');
    if (!res.ok) return;
    const data = await res.json();
    g_shopAdminItems = Array.isArray(data.items) ? data.items : [];
    filterShopAdminItems();
}

function renderShopAdminItemsPage(page = 1) {
    const pg = document.getElementById('shop-admin-items-pagination');
    g_shopAdminItemsPage = Math.max(1, page);
    if (!g_shopAdminFilteredItems.length) {
        renderShopAdminItemsTable([]);
        if (pg) pg.innerHTML = '';
        return;
    }
    const start = (g_shopAdminItemsPage - 1) * SHOP_TABLE_PAGE_SIZE;
    const rows = g_shopAdminFilteredItems.slice(start, start + SHOP_TABLE_PAGE_SIZE);
    renderShopAdminItemsTable(rows, start);
    if (pg && typeof renderPagination === 'function') {
        renderPagination(pg, {
            page: g_shopAdminItemsPage,
            totalPages: Math.max(1, Math.ceil(g_shopAdminFilteredItems.length / SHOP_TABLE_PAGE_SIZE))
        }, (p) => renderShopAdminItemsPage(p));
    }
}

function renderShopAdminItemsTable(items, startIndex = 0) {
    const tbody = document.getElementById('shop-admin-items-body');
    if (!tbody) return;

    if (!items.length) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:1.2rem;">상품이 없습니다.</td></tr>';
        return;
    }

    const totalCount = g_shopAdminFilteredItems.length;
    tbody.innerHTML = items.map((item, idx) => {
        const codeText = item.item_type === 'function' ? (item.function_code || '-') : (item.item_entry || '-');
        const iconId = `shop-admin-item-icon-${item.id}`;
        const rowNo = totalCount - (startIndex + idx);
        return `
        <tr>
            <td>${rowNo}</td>
            <td style="text-align:center;">${renderShopItemIcon(item, iconId)}</td>
            <td>${shopTypeLabel(item.item_type)}</td>
            <td>${item.item_type === 'game' ? wrapShopItemName(item.item_entry, item.name) : escShop(item.name)}</td>
            <td>${escShop(codeText)}</td>
            <td>${shopPointWithIcon(item.price_points || 0)}</td>
            <td>${Number(item.stock_qty) < 0 ? '무제한' : item.stock_qty}</td>
            <td>${item.is_visible ? 'Y' : 'N'}</td>
            <td style="text-align:center;">
                <div style="display:flex; justify-content:center; gap:6px;">
                    <button class="btn btn-primary" style="padding:6px 8px;" onclick="editShopAdminItem(${item.id})">수정</button>
                    <button class="btn" style="padding:6px 8px; background:#ef4444; color:#fff;" onclick="toggleShopAdminDelete(${item.id})">삭제</button>
                </div>
            </td>
            <td style="text-align:center;">
                <label class="shop-admin-switch">
                    <input type="checkbox" ${item.is_visible ? 'checked' : ''} onchange="toggleShopAdminVisibility(${item.id}, this.checked)">
                    <span class="shop-admin-switch-slider"></span>
                </label>
            </td>
        </tr>
    `;
    }).join('');

    items.forEach(item => {
        if (item.item_type === 'game' && Number(item.item_entry) > 0) {
            loadShopIcon(Number(item.item_entry), `shop-admin-item-icon-${item.id}`);
        }
    });
    refreshShopWowheadTooltips();
}

function filterShopAdminItems() {
    const type = ((document.getElementById('shop-admin-filter-type') || {}).value || '').trim();
    const visible = ((document.getElementById('shop-admin-filter-visible') || {}).value || '').trim();
    const idVal = ((document.getElementById('shop-admin-filter-id') || {}).value || '').trim();
    const name = ((document.getElementById('shop-admin-filter-name') || {}).value || '').trim().toLowerCase();
    const code = ((document.getElementById('shop-admin-filter-code') || {}).value || '').trim().toLowerCase();
    const stockVal = ((document.getElementById('shop-admin-filter-stock') || {}).value || '').trim();

    g_shopAdminFilteredItems = g_shopAdminItems.filter(item => {
        if (item.is_deleted) return false;
        if (idVal && String(item.id) !== idVal) return false;
        if (type && String(item.item_type || 'game') !== type) return false;
        if (visible !== '' && String(item.is_visible ? 1 : 0) !== visible) return false;
        if (name && !String(item.name || '').toLowerCase().includes(name)) return false;
        const itemCode = String(item.item_type === 'function' ? (item.function_code || '') : (item.item_entry || '')).toLowerCase();
        if (code && !itemCode.includes(code)) return false;
        if (stockVal !== '' && String(item.stock_qty) !== stockVal) return false;
        return true;
    });
    renderShopAdminItemsPage(1);
}

function resetShopAdminSearch() {
    const ids = [
        'shop-admin-filter-type',
        'shop-admin-filter-visible',
        'shop-admin-filter-id',
        'shop-admin-filter-name',
        'shop-admin-filter-code',
        'shop-admin-filter-stock'
    ];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (el.tagName === 'SELECT') el.value = '';
        else el.value = '';
    });
    filterShopAdminItems();
}

function editShopAdminItem(id) {
    const item = g_shopAdminItems.find(v => Number(v.id) === Number(id));
    if (!item) return;
    openShopItemModal(item);
}

function openShopItemModal(item = null) {
    const modal = document.getElementById('shop-item-modal');
    if (!modal) return;

    document.getElementById('shop-admin-item-id').value = item ? item.id : '';
    document.getElementById('shop-admin-item-name').value = item ? (item.name || '') : '';
    document.getElementById('shop-admin-item-price').value = item ? (item.price_points || 0) : '';
    document.getElementById('shop-admin-item-stock').value = item ? (item.stock_qty ?? -1) : -1;
    document.getElementById('shop-admin-item-desc').value = item ? (item.description || '') : '';
    document.getElementById('shop-admin-item-entry').value = item ? (item.item_entry || '') : '';
    document.getElementById('shop-admin-function-code').value = item ? (item.function_code || '') : '';
    setShopFunctionIcon(item ? (item.icon_path || '') : '');
    const itemSearchQ = document.getElementById('shop-admin-item-search-query');
    if (itemSearchQ) itemSearchQ.value = '';
    const itemSearchBody = document.getElementById('shop-admin-item-search-body');
    if (itemSearchBody) itemSearchBody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:#64748b;">검색어를 입력하세요.</td></tr>';
    document.getElementById('shop-admin-item-visible').checked = item ? !!item.is_visible : true;

    const type = item && item.item_type === 'function' ? 'function' : 'game';
    document.querySelectorAll('input[name="shop-item-type"]').forEach(r => {
        r.checked = r.value === type;
    });
    toggleShopItemType();

    const title = document.getElementById('shop-item-modal-title');
    if (title) title.textContent = item ? '선술집 상품 수정' : '선술집 상품 등록';
    modal.style.display = 'flex';
}

function closeShopItemModal() {
    const modal = document.getElementById('shop-item-modal');
    if (modal) modal.style.display = 'none';
}

function toggleShopItemType() {
    const type = (document.querySelector('input[name="shop-item-type"]:checked') || {}).value || 'game';
    const gameBox = document.getElementById('shop-item-type-game');
    const funcBox = document.getElementById('shop-item-type-function');
    if (gameBox) gameBox.style.display = type === 'game' ? 'block' : 'none';
    if (funcBox) funcBox.style.display = type === 'function' ? 'block' : 'none';
}

async function searchShopGameItems() {
    const q = ((document.getElementById('shop-admin-item-search-query') || {}).value || '').trim();
    const tbody = document.getElementById('shop-admin-item-search-body');
    if (!tbody) return;
    if (q.length < 2) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:#64748b;">2글자 이상 입력하세요.</td></tr>';
        return;
    }
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:#64748b;">검색 중...</td></tr>';
    try {
        const res = await fetch(`/api/content/item/search?q=${encodeURIComponent(q)}`);
        if (!res.ok) throw new Error('HTTP');
        const items = await res.json();
        if (!Array.isArray(items) || !items.length) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:#64748b;">검색 결과가 없습니다.</td></tr>';
            return;
        }
        tbody.innerHTML = items.slice(0, 20).map(item => `
            <tr>
                <td>${item.entry}</td>
                <td>${escShop(item.name || '')}</td>
                <td style="text-align:center;"><button type="button" class="btn btn-primary" style="padding:4px 8px;" onclick="selectShopGameItem(${item.entry}, decodeURIComponent('${encodeURIComponent(String(item.name || ''))}'))">선택</button></td>
            </tr>
        `).join('');
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:#ef4444;">검색에 실패했습니다.</td></tr>';
    }
}

function selectShopGameItem(entry, name) {
    const entryEl = document.getElementById('shop-admin-item-entry');
    const nameEl = document.getElementById('shop-admin-item-name');
    if (entryEl) entryEl.value = entry;
    if (nameEl && !nameEl.value.trim()) nameEl.value = name;
}

function getSelectedShopItemType() {
    const el = document.querySelector('input[name="shop-item-type"]:checked');
    return el ? el.value : 'game';
}

function setShopFunctionIcon(path) {
    const input = document.getElementById('shop-admin-icon-path');
    const preview = document.getElementById('shop-admin-icon-preview');
    if (input) input.value = path || '';
    if (!preview) return;
    if (!path) {
        preview.innerHTML = '<i class="fas fa-image"></i>';
        return;
    }
    preview.innerHTML = `
        <span style="position:relative; width:100%; height:100%; display:inline-flex;">
            <img src="${escShop(path)}" alt="func-icon" style="position:absolute; inset:2px; width:calc(100% - 4px); height:calc(100% - 4px); object-fit:cover; border-radius:8px; z-index:1;" onerror="this.parentElement.parentElement.innerHTML='<i class=&quot;fas fa-image&quot;></i>';">
            <img src="${SHOP_ICON_BORDER_URL}" alt="icon-border" style="position:absolute; inset:0; width:100%; height:100%; pointer-events:none; z-index:2;">
        </span>
    `;
}

async function uploadShopFunctionIconFile(file) {
    if (!file) {
        throw new Error('아이콘 파일을 선택해주세요.');
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
        const res = await fetch('/api/admin/shop/icon/upload', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        if (!res.ok || data.status !== 'success') {
            throw new Error(data.message || '아이콘 업로드에 실패했습니다.');
        }
        return String(data.image_url || '').trim();
    } catch (e) {
        throw e;
    }
}

async function openShopIconPickerModal() {
    try {
        const res = await fetch('/api/admin/shop/iconpack/list');
        const data = await res.json();
        if (!res.ok || data.status !== 'success') throw new Error(data.message || '아이콘 목록을 불러오지 못했습니다.');
        const icons = Array.isArray(data.icons) ? data.icons : [];
        if (!icons.length) throw new Error('아이콘팩에 이미지가 없습니다.');

        let selected = (document.getElementById('shop-admin-icon-path') || {}).value || '';
        let activeTab = 'picker';
        if (!window.Swal) return;

        const renderGrid = (q = '') => {
            const keyword = (q || '').trim().toLowerCase();
            const filtered = icons.filter(i => !keyword || String(i.path || '').toLowerCase().includes(keyword) || String(i.name || '').toLowerCase().includes(keyword));
            return filtered.slice(0, 800).map(i => {
                const active = selected === i.path;
                return `
                    <button type="button" class="shop-icon-cell ${active ? 'active' : ''}" data-path="${escShop(i.path)}" style="width:74px; height:86px; border:1px solid ${active ? '#3b82f6' : '#d1d5db'}; border-radius:10px; background:${active ? '#eff6ff' : '#fff'}; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; cursor:pointer;">
                        <img src="${escShop(i.path)}" style="width:40px; height:40px; border-radius:8px; object-fit:cover;" onerror="this.style.display='none';">
                        <span style="font-size:10px; line-height:1.1; max-width:66px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escShop(i.name || '')}</span>
                    </button>
                `;
            }).join('');
        };

        await Swal.fire({
            title: '기능 아이콘 선택',
            width: 920,
            html: `
                <div style="display:flex; flex-direction:column; gap:10px;">
                    <div style="display:flex; gap:8px; padding:4px; background:#e2e8f0; border-radius:12px; width:fit-content;">
                        <button type="button" id="shop-icon-tab-picker" class="btn" style="padding:8px 14px; background:#ada292; color:#111827;">아이콘 선택</button>
                        <button type="button" id="shop-icon-tab-upload" class="btn" style="padding:8px 14px; background:transparent; color:#475569;">파일 업로드</button>
                    </div>
                    <div id="shop-icon-pane-picker" style="display:flex; flex-direction:column; gap:10px;">
                        <input id="shop-icon-search" class="input-premium" placeholder="파일명 검색">
                        <div id="shop-icon-grid" style="max-height:430px; overflow:auto; display:grid; grid-template-columns:repeat(auto-fill, minmax(74px,1fr)); gap:8px;"></div>
                    </div>
                    <div id="shop-icon-pane-upload" style="display:none; flex-direction:column; gap:10px; text-align:left;">
                        <input id="shop-icon-upload-file" type="file" class="input-premium" accept=".jpg,.jpeg,.png,.gif,.webp,.avif,.bmp">
                        <div style="font-size:12px; color:#64748b;">이미지 파일을 업로드하면 경로가 자동으로 입력됩니다.</div>
                    </div>
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: '선택',
            cancelButtonText: '취소',
            didOpen: () => {
                const pickerTabEl = document.getElementById('shop-icon-tab-picker');
                const uploadTabEl = document.getElementById('shop-icon-tab-upload');
                const pickerPaneEl = document.getElementById('shop-icon-pane-picker');
                const uploadPaneEl = document.getElementById('shop-icon-pane-upload');
                const searchEl = document.getElementById('shop-icon-search');
                const gridEl = document.getElementById('shop-icon-grid');
                const switchTab = (tabName) => {
                    activeTab = tabName;
                    const isPicker = tabName === 'picker';
                    if (pickerPaneEl) pickerPaneEl.style.display = isPicker ? 'flex' : 'none';
                    if (uploadPaneEl) uploadPaneEl.style.display = isPicker ? 'none' : 'flex';
                    if (pickerTabEl) {
                        pickerTabEl.style.background = isPicker ? '#ada292' : 'transparent';
                        pickerTabEl.style.color = isPicker ? '#111827' : '#475569';
                    }
                    if (uploadTabEl) {
                        uploadTabEl.style.background = isPicker ? 'transparent' : '#ada292';
                        uploadTabEl.style.color = isPicker ? '#475569' : '#111827';
                    }
                };
                if (pickerTabEl) pickerTabEl.addEventListener('click', () => switchTab('picker'));
                if (uploadTabEl) uploadTabEl.addEventListener('click', () => switchTab('upload'));
                if (!gridEl) return;
                const repaint = () => {
                    gridEl.innerHTML = renderGrid(searchEl ? searchEl.value : '');
                    gridEl.querySelectorAll('.shop-icon-cell').forEach(btn => {
                        btn.addEventListener('click', () => {
                            selected = btn.getAttribute('data-path') || '';
                            repaint();
                        });
                    });
                };
                if (searchEl) searchEl.addEventListener('input', repaint);
                repaint();
                switchTab('picker');
            },
            preConfirm: async () => {
                if (activeTab === 'upload') {
                    const fileEl = document.getElementById('shop-icon-upload-file');
                    const file = fileEl && fileEl.files ? fileEl.files[0] : null;
                    try {
                        const uploadedPath = await uploadShopFunctionIconFile(file);
                        selected = uploadedPath;
                        return uploadedPath;
                    } catch (e) {
                        Swal.showValidationMessage(e.message || '아이콘 업로드에 실패했습니다.');
                        return false;
                    }
                }
                if (!selected) {
                    Swal.showValidationMessage('아이콘을 선택해주세요.');
                    return false;
                }
                return selected;
            }
        }).then(result => {
            if (result.isConfirmed) setShopFunctionIcon(result.value || '');
        });
    } catch (e) {
        if (window.Swal) Swal.fire({ icon: 'error', title: e.message || '아이콘 목록 조회 실패' });
    }
}

async function saveShopAdminItem() {
    const id = parseInt(document.getElementById('shop-admin-item-id').value || '0', 10);
    const type = getSelectedShopItemType();
    const itemEntry = parseInt(document.getElementById('shop-admin-item-entry').value || '0', 10);
    const functionCode = (document.getElementById('shop-admin-function-code').value || '').trim();
    const iconPath = (document.getElementById('shop-admin-icon-path').value || '').trim();

    const payload = {
        id: id,
        item_type: type,
        item_entry: type === 'game' ? itemEntry : 0,
        function_code: type === 'function' ? functionCode : '',
        icon_path: iconPath,
        name: document.getElementById('shop-admin-item-name').value.trim(),
        price_points: parseInt(document.getElementById('shop-admin-item-price').value || '0', 10),
        stock_qty: parseInt(document.getElementById('shop-admin-item-stock').value || '-1', 10),
        description: document.getElementById('shop-admin-item-desc').value.trim(),
        is_visible: !!document.getElementById('shop-admin-item-visible').checked
    };

    if (!payload.name) {
        if (window.Swal) Swal.fire({ icon: 'warning', title: '상품명을 입력해주세요.' });
        return;
    }
    if (type === 'game' && payload.item_entry <= 0) {
        if (window.Swal) Swal.fire({ icon: 'warning', title: '인게임 아이템 Entry를 선택해주세요.' });
        return;
    }
    if (type === 'function' && !payload.function_code) {
        if (window.Swal) Swal.fire({ icon: 'warning', title: '기능 코드를 선택해주세요.' });
        return;
    }

    const res = await fetch('/api/admin/shop/item/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok || data.status !== 'success') {
        if (window.Swal) Swal.fire({ icon: 'error', title: data.message || '저장 실패' });
        return;
    }

    closeShopItemModal();
    await loadShopAdminItems();
    if (window.Swal) Swal.fire({ icon: 'success', title: '저장되었습니다.', timer: 1000, showConfirmButton: false });
}

async function toggleShopAdminDelete(id) {
    if (window.Swal) {
        const result = await Swal.fire({
            icon: 'warning',
            title: '상품을 삭제하시겠습니까?',
            text: '삭제 후 목록에서 보이지 않습니다.',
            showCancelButton: true,
            confirmButtonText: '삭제',
            cancelButtonText: '취소'
        });
        if (!result.isConfirmed) return;
    }
    const res = await fetch('/api/admin/shop/item/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id, is_deleted: true })
    });
    if (!res.ok) return;
    g_shopAdminItems = g_shopAdminItems.filter(v => Number(v.id) !== Number(id));
    filterShopAdminItems();
}

async function toggleShopAdminVisibility(id, isVisible) {
    await fetch('/api/admin/shop/item/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id, is_deleted: false, is_visible: isVisible })
    });
    await loadShopAdminItems();
}

async function loadShopAdminOrders() {
    const res = await fetch('/api/admin/shop/orders');
    if (!res.ok) return;
    const data = await res.json();
    g_shopAdminOrders = Array.isArray(data.orders) ? data.orders : [];
    const tbody = document.getElementById('shop-admin-orders-body');
    const pg = document.getElementById('shop-admin-orders-pagination');
    if (!tbody) return;
    if (!g_shopAdminOrders.length) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:1.2rem;">주문 데이터가 없습니다.</td></tr>';
        if (pg) pg.innerHTML = '';
        return;
    }
    renderShopAdminOrdersPage(1);
}

function renderShopAdminOrdersPage(page = 1) {
    const tbody = document.getElementById('shop-admin-orders-body');
    const pg = document.getElementById('shop-admin-orders-pagination');
    if (!tbody) return;
    g_shopAdminOrdersPage = Math.max(1, page);
    const start = (g_shopAdminOrdersPage - 1) * SHOP_TABLE_PAGE_SIZE;
    const rows = g_shopAdminOrders.slice(start, start + SHOP_TABLE_PAGE_SIZE);
    tbody.innerHTML = rows.map(o => `
        <tr>
            <td>${o.id}</td>
            <td>${escShop(o.username || o.user_id)}</td>
            <td>${escShop(o.target_character || '-')}</td>
            <td>${escShop(o.item_name)}</td>
            <td>${o.qty}</td>
            <td>${shopPointWithIcon(o.total_price || 0)}</td>
            <td>${shopPointWithIcon(o.points_before || 0)}</td>
            <td>${shopPointWithIcon(o.points_after || 0)}</td>
            <td><span class="lvl-badge">${shopStatusLabel(o.status)}</span></td>
            <td style="display:flex; gap:6px; align-items:center;">
                <select id="shop-order-status-${o.id}" class="search-select" style="min-width:110px;">
                    <option value="pending" ${o.status === 'pending' ? 'selected' : ''}>대기</option>
                    <option value="processing" ${o.status === 'processing' ? 'selected' : ''}>처리중</option>
                    <option value="completed" ${o.status === 'completed' ? 'selected' : ''}>완료</option>
                    <option value="rejected" ${o.status === 'rejected' ? 'selected' : ''}>거절</option>
                    <option value="refunded" ${o.status === 'refunded' ? 'selected' : ''}>환불</option>
                </select>
                <button class="btn btn-primary" style="padding:6px 8px;" onclick="updateShopOrderStatus(${o.id})">저장</button>
            </td>
        </tr>
    `).join('');
    if (pg && typeof renderPagination === 'function') {
        renderPagination(pg, {
            page: g_shopAdminOrdersPage,
            totalPages: Math.max(1, Math.ceil(g_shopAdminOrders.length / SHOP_TABLE_PAGE_SIZE))
        }, (p) => renderShopAdminOrdersPage(p));
    }
}

async function updateShopOrderStatus(orderID) {
    const statusEl = document.getElementById(`shop-order-status-${orderID}`);
    if (!statusEl) return;

    const payload = { order_id: orderID, status: statusEl.value, admin_note: '' };
    const res = await fetch('/api/admin/shop/order/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok || data.status !== 'success') {
        if (window.Swal) Swal.fire({ icon: 'error', title: data.message || '상태 변경 실패' });
        return;
    }
    await loadShopAdminOrders();
    if (window.Swal) Swal.fire({ icon: 'success', title: '상태가 변경되었습니다.', timer: 1000, showConfirmButton: false });
}
