// Console security notice
console.log('%c✦ KΛRΛZHΛN ✦', 'color:#7c3aed;font-weight:900;font-size:36px;text-shadow:0 0 8px rgba(124,58,237,.45);');
console.warn('잘못된 접근은 영구정지 사유입니다.');

// Global State
var currentUserMainChar = window.currentUserMainChar || null;
let g_sessionUser = null;
window.g_sessionUser = null;

const LoadingUX = (() => {
    let pendingRequests = 0;
    let isFetchPatched = false;
    let isInitialized = false;
    let observer = null;
    let progressEl = null;
    let chipEl = null;
    let showTimer = null;
    let forceVisible = false;
    const SHOW_DELAY_MS = 180;
    const SKIP_PATHS = [
        '/api/user/status',
        '/api/notifications/list',
        '/api/server/events',
        '/api/home/slider/list'
    ];

    function ensureElements() {
        if (progressEl && chipEl) return;
        if (!document.body) return;

        progressEl = document.getElementById('global-load-progress');
        if (!progressEl) {
            progressEl = document.createElement('div');
            progressEl.id = 'global-load-progress';
            progressEl.setAttribute('aria-hidden', 'true');
            document.body.appendChild(progressEl);
        }

        chipEl = document.getElementById('global-load-chip');
        if (!chipEl) {
            chipEl = document.createElement('div');
            chipEl.id = 'global-load-chip';
            chipEl.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i><span>불러오는 중...</span>';
            chipEl.setAttribute('aria-hidden', 'true');
            document.body.appendChild(chipEl);
        }
    }

    function renderState() {
        ensureElements();
        if (!progressEl || !chipEl) return;
        const isActive = forceVisible && pendingRequests > 0;
        progressEl.classList.toggle('active', isActive);
        chipEl.classList.toggle('active', isActive);
        chipEl.setAttribute('aria-hidden', isActive ? 'false' : 'true');
        progressEl.setAttribute('aria-hidden', isActive ? 'false' : 'true');
    }

    function begin() {
        pendingRequests += 1;
        if (!showTimer) {
            showTimer = setTimeout(() => {
                showTimer = null;
                forceVisible = true;
                renderState();
            }, SHOW_DELAY_MS);
        }
    }

    function end() {
        pendingRequests = Math.max(0, pendingRequests - 1);
        if (pendingRequests === 0) {
            if (showTimer) {
                clearTimeout(showTimer);
                showTimer = null;
            }
            forceVisible = false;
        }
        renderState();
    }

    function shouldTrackRequest(resource, init) {
        const url = String(resource || '');
        if (!url) return true;
        if (url.startsWith('chrome-extension://')) return false;
        if (url.includes('.map')) return false;
        if (document.querySelector('.modal.active')) return false;
        const headers = (init && init.headers) || {};
        if (headers && typeof headers.get === 'function') {
            if (headers.get('X-Background-Request') === '1') return false;
        } else if (headers && typeof headers === 'object') {
            if (headers['X-Background-Request'] === '1' || headers['x-background-request'] === '1') return false;
        }
        for (const path of SKIP_PATHS) {
            if (url.includes(path)) return false;
        }
        return true;
    }

    function patchFetch() {
        if (isFetchPatched || typeof window.fetch !== 'function') return;
        const originalFetch = window.fetch.bind(window);

        window.fetch = function patchedFetch(input, init) {
            const resource = typeof input === 'string'
                ? input
                : (input && input.url ? input.url : '');
            const tracked = shouldTrackRequest(resource, init);
            if (tracked) begin();

            return originalFetch(input, init)
                .finally(() => {
                    if (tracked) end();
                });
        };

        isFetchPatched = true;
    }

    function markImageLoaded(img) {
        img.classList.remove('img-loading');
        img.classList.add('img-loaded');
        setTimeout(() => img.classList.remove('img-loaded'), 300);
    }

    function bindImage(img) {
        if (!(img instanceof HTMLImageElement)) return;
        if (img.dataset.loadingBound === '1') return;
        img.dataset.loadingBound = '1';

        const handleDone = () => markImageLoaded(img);
        if (!img.complete || img.naturalWidth === 0) {
            img.classList.add('img-loading');
        } else {
            markImageLoaded(img);
        }

        img.addEventListener('load', handleDone, { once: true });
        img.addEventListener('error', handleDone, { once: true });
    }

    function bindImagesIn(root) {
        if (!root || typeof root.querySelectorAll !== 'function') return;
        const images = root.querySelectorAll('img');
        images.forEach(bindImage);
    }

    function watchDomImages() {
        if (observer || !document.body) return;
        observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (!node || node.nodeType !== 1) return;
                    if (node.tagName === 'IMG') {
                        bindImage(node);
                    } else {
                        bindImagesIn(node);
                    }
                });
            });
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    function init() {
        if (isInitialized) return;
        isInitialized = true;
        ensureElements();
        patchFetch();
        bindImagesIn(document);
        watchDomImages();
        renderState();
    }

    return {
        init
    };
})();

function canUseLauncherApis() {
    if (!g_sessionUser) return false;
    const perms = (g_sessionUser.permissions && typeof g_sessionUser.permissions === 'object')
        ? g_sessionUser.permissions
        : {};
    return g_sessionUser.webRank >= 2 ||
        perms.admin_all === true ||
        perms.menu_remote === true ||
        perms['submenu_remote-control'] === true ||
        perms['submenu_remote-schedule'] === true;
}

function logout() {
    ModalUtils.showConfirm('로그아웃 하시겠습니까?', async () => {
        await fetch('/api/logout', { method: 'POST' });
        location.href = '/';
    });
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar && overlay) {
        sidebar.classList.toggle('active');
        overlay.classList.toggle('active');
    }
}

function normalizeKoreanLabels() {
    const setHtml = (id, html) => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = html;
    };
    const setText = (selector, text) => {
        const el = document.querySelector(selector);
        if (el) el.textContent = text;
    };
    const setPlaceholder = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.placeholder = text;
    };

    // Sidebar/main labels
    setHtml('tab-btn-home', '<i class="fas fa-home"></i> 홈');
    setHtml('tab-btn-gm', '<i class="fas fa-tools"></i> GM 관리');
    setHtml('tab-btn-remote', '<i class="fas fa-server"></i> 서버 관리');
    setHtml('tab-btn-update', '<i class="fas fa-sync"></i> 업데이트');
    setHtml('tab-btn-account', '<i class="fas fa-users-cog"></i> 계정 관리');
    setHtml('tab-btn-ban', '<i class="fas fa-user-shield"></i> 캐릭터/제재');
    setHtml('tab-btn-logs', '<i class="fas fa-list-ul"></i> 로그 목록');
    setHtml('tab-btn-stats', '<i class="fas fa-chart-line"></i> 통계');
    setHtml('tab-btn-mailbox', '<i class="far fa-envelope"></i> 알림함');
    setHtml('tab-btn-shop', '<i class="fas fa-store"></i> 선술집');
    setHtml('tab-btn-calendar', '<i class="far fa-calendar-alt"></i> 캘린더');
    setHtml('tab-btn-promotion', '<i class="fas fa-bullhorn"></i> 홍보게시판');
    setHtml('tab-btn-auction', '<i class="fas fa-gavel"></i> 경매장');
    setHtml('tab-btn-content', '<i class="fas fa-cubes"></i> 콘텐츠 관리');
    setHtml('tab-btn-board-admin', '<i class="fas fa-edit"></i> 게시판 관리 (CMS)');
    setHtml('tab-btn-notification-admin', '<i class="fas fa-bullhorn"></i> 알림발송');
    setHtml('tab-btn-shop-admin', '<i class="fas fa-store-alt"></i> 선술집관리');

    // Ban tab headers
    setText('#ban > .card.flex-card .card-header h2', '캐릭터 및 제재 관리');
    setText('#char-accountban thead th:nth-child(1)', '대상 계정');
    setText('#char-accountban thead th:nth-child(2)', '차단 사유');
    setText('#char-accountban thead th:nth-child(3)', '해제 예정 시간');
    setText('#char-accountban thead th:nth-child(4)', '관리');
    setText('#char-ipban thead th:nth-child(1)', '대상 IP');
    setText('#char-ipban thead th:nth-child(2)', '차단 사유');
    setText('#char-ipban thead th:nth-child(3)', '해제 예정 시간');
    setText('#char-ipban thead th:nth-child(4)', '관리');

    // Ban form labels/placeholders
    setText('#char-accountban .filter-group:nth-child(1) label', '계정 / ID');
    setText('#char-accountban .filter-group:nth-child(2) label', '차단 기간');
    setText('#char-accountban .filter-group:nth-child(3) label', '단위');
    setText('#char-accountban .filter-group:nth-child(4) label', '차단 사유');
    setPlaceholder('ban-acc-id', '유저 아이디 또는 ID');
    setPlaceholder('ban-acc-duration', '기간');
    setPlaceholder('ban-acc-reason', '차단 사유 입력');

    setText('#char-ipban .filter-group:nth-child(1) label', 'IP 주소');
    setText('#char-ipban .filter-group:nth-child(2) label', '차단 기간');
    setText('#char-ipban .filter-group:nth-child(3) label', '단위');
    setText('#char-ipban .filter-group:nth-child(4) label', '차단 사유');
    setPlaceholder('ban-ip-val', '차단할 IP 주소');
    setPlaceholder('ban-ip-duration', '기간');
    setPlaceholder('ban-ip-reason', '차단 사유 입력');

    // Major section headers
    setText('#mailbox .card-header h2', '알림 메시지함');
    setText('#notification-admin .card-header h2', '알림발송');
    setText('#remote > .card > .card-header h2', '서버 관리');
    setText('#account > .card > .card-header h2', '계정 관리');
    setText('#gm > .card > .card-header h2', 'GM 관리');
    setText('#logs > .card > .card-header h2', '로그 센터');
    setText('#content > .card > .card-header h2', '콘텐츠 관리');
    setText('#mypage > .card > .card-header h2', '계정 및 캐릭터 관리');
    setText('#board-admin > .card > .card-header h2', '게시판 관리 (CMS)');
    setText('#board-write-btn', '글쓰기');

    // Frequently visible placeholders
    setPlaceholder('board-search', '검색어 입력');
    setPlaceholder('notif-title', '알림 제목');
    setPlaceholder('notif-message', '메시지 내용을 입력하세요');
    setPlaceholder('board-post-title', '제목을 입력하세요');

    // Footer/logout
    const logoutBtn = document.querySelector('.logout-btn-premium');
    if (logoutBtn) logoutBtn.innerHTML = '<i class="fas fa-sign-out-alt"></i> 로그아웃';
}

function ensureHeaderIcons() {
    const iconMap = [
        { key: '홈 슬라이더', icon: 'far fa-images' },
        { key: '공지', icon: 'fas fa-bullhorn' },
        { key: '업데이트', icon: 'fas fa-sync' },
        { key: '계정', icon: 'fas fa-users-cog' },
        { key: '캐릭터', icon: 'fas fa-user-shield' },
        { key: '제재', icon: 'fas fa-user-shield' },
        { key: '로그', icon: 'fas fa-list-ul' },
        { key: '통계', icon: 'fas fa-chart-line' },
        { key: '콘텐츠', icon: 'fas fa-cubes' },
        { key: '게시판', icon: 'fas fa-clipboard-list' },
        { key: '선술집', icon: 'fas fa-store' },
        { key: '경매장', icon: 'fas fa-gavel' },
        { key: '캘린더', icon: 'far fa-calendar-alt' },
        { key: 'GM', icon: 'fas fa-tools' },
        { key: '서버', icon: 'fas fa-server' },
        { key: '문의', icon: 'fas fa-circle-question' },
        { key: '메시지', icon: 'far fa-envelope' },
        { key: '알림', icon: 'far fa-bell' },
        { key: '카드뽑기', icon: 'fas fa-clone' },
        { key: '접속방법', icon: 'fas fa-link' },
        { key: '마이페이지', icon: 'fas fa-user' }
    ];

    const headers = document.querySelectorAll('.card-header h2');
    headers.forEach((h2) => {
        if (!h2) return;
        if (h2.querySelector('i, img, svg')) return;
        const text = String(h2.textContent || '').trim();
        if (!text) return;
        let iconClass = 'fas fa-circle';
        for (let i = 0; i < iconMap.length; i += 1) {
            if (text.includes(iconMap[i].key)) {
                iconClass = iconMap[i].icon;
                break;
            }
        }
        const icon = document.createElement('i');
        icon.className = iconClass;
        h2.prepend(icon);
    });
}

async function loadEnvironmentBadge() {
    const badge = document.getElementById('header-env-badge');
    const watermark = document.getElementById('environment-watermark');
    if (!badge) return;
    const session = (window.g_sessionUser && typeof window.g_sessionUser === 'object') ? window.g_sessionUser : null;
    const canSeeBadge = !!(session && (Number(session.gmLevel || 0) >= 2 || session.isAdmin === true || Number(session.webRank || 0) >= 2));
    if (!canSeeBadge) {
        badge.style.display = 'none';
        badge.classList.remove('dev', 'prod');
        if (watermark) watermark.style.display = 'none';
        return;
    }
    try {
        const res = await fetch('/api/meta/environment');
        if (!res.ok) return;
        const data = await res.json();
        if (data && data.is_development === true) {
            badge.style.display = 'inline-flex';
            badge.textContent = '개발';
            badge.classList.remove('prod');
            badge.classList.add('dev');
            if (watermark) watermark.style.display = 'inline-flex';
        } else {
            badge.style.display = 'inline-flex';
            badge.textContent = '운영';
            badge.classList.remove('dev');
            badge.classList.add('prod');
            if (watermark) watermark.style.display = 'none';
        }
    } catch (e) {
        badge.style.display = 'none';
        badge.classList.remove('dev', 'prod');
        if (watermark) watermark.style.display = 'none';
    }
}

function buildWowheadItemUrl(entry) {
    const itemEntry = Number(entry) || 0;
    if (itemEntry <= 0) return '';
    return `https://www.wowhead.com/ko/?item=${itemEntry}`;
}

let g_serverItemTooltipEl = null;
const g_serverItemTooltipCache = new Map();
let g_serverTooltipApiAvailable = true;

function ensureServerItemTooltipEl() {
    if (g_serverItemTooltipEl) return g_serverItemTooltipEl;
    const el = document.createElement('div');
    el.id = 'server-item-tooltip';
    el.style.position = 'fixed';
    el.style.zIndex = '22000';
    el.style.minWidth = '320px';
    el.style.maxWidth = '420px';
    el.style.background = '#111827';
    el.style.color = '#f8fafc';
    el.style.border = '1px solid #374151';
    el.style.borderRadius = '10px';
    el.style.boxShadow = '0 16px 40px rgba(0,0,0,0.45)';
    el.style.padding = '10px 12px';
    el.style.fontSize = '0.86rem';
    el.style.lineHeight = '1.45';
    el.style.display = 'none';
    el.style.pointerEvents = 'none';
    document.body.appendChild(el);
    g_serverItemTooltipEl = el;
    return el;
}

function formatItemMoney(copper) {
    const n = Number(copper || 0);
    if (n <= 0) return '0';
    const gold = Math.floor(n / 10000);
    const silver = Math.floor((n % 10000) / 100);
    const c = n % 100;
    const out = [];
    if (gold > 0) out.push(`${gold}g`);
    if (silver > 0) out.push(`${silver}s`);
    if (c > 0) out.push(`${c}c`);
    return out.join(' ');
}

function getItemQualityColor(q) {
    const quality = Number(q || 0);
    const map = {
        0: '#9ca3af',
        1: '#ffffff',
        2: '#1eff00',
        3: '#0070dd',
        4: '#a335ee',
        5: '#ff8000'
    };
    return map[quality] || '#ffffff';
}

function escItemTooltip(v) {
    const s = String(v ?? '');
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function renderServerItemTooltipHtml(data) {
    const titleColor = getItemQualityColor(data.quality);
    const lines = [];

    if (data.inventory_name) lines.push(`<div>${escItemTooltip(data.inventory_name)}</div>`);
    if (data.class_name || data.subclass_name) {
        lines.push(`<div style="opacity:0.9;">${escItemTooltip([data.class_name, data.subclass_name].filter(Boolean).join(' / '))}</div>`);
    }
    if (Number(data.item_level || 0) > 0) lines.push(`<div>아이템 레벨 ${Number(data.item_level)}</div>`);
    if (Number(data.required_level || 0) > 0) lines.push(`<div>요구 레벨 ${Number(data.required_level)}</div>`);
    if (Number(data.armor || 0) > 0) lines.push(`<div>방어도 ${Number(data.armor)}</div>`);
    if (Number(data.max_damage || 0) > 0) {
        const speed = Number(data.speed_ms || 0) > 0 ? ` (속도 ${(Number(data.speed_ms) / 1000).toFixed(2)})` : '';
        lines.push(`<div>피해량 ${Number(data.min_damage || 0).toFixed(0)} - ${Number(data.max_damage || 0).toFixed(0)}${speed}</div>`);
    }

    const stats = Array.isArray(data.stats) ? data.stats : [];
    const spells = Array.isArray(data.spells) ? data.spells : [];
    const desc = String(data.description || '').trim();

    return `
        <div style="font-weight:800; color:${titleColor}; margin-bottom:6px;">${escItemTooltip(data.name || `Item ${data.entry}`)}</div>
        ${lines.length ? `<div style="margin-bottom:7px; color:#d1d5db;">${lines.join('')}</div>` : ''}
        ${stats.length ? `<div style="margin-bottom:7px; color:#93c5fd;">${stats.map(s => `<div>${escItemTooltip(s)}</div>`).join('')}</div>` : ''}
        ${spells.length ? `<div style="margin-bottom:7px; color:#fca5a5;">${spells.map(s => `<div>${escItemTooltip(s)}</div>`).join('')}</div>` : ''}
        ${desc ? `<div style="margin-bottom:7px; color:#cbd5e1; white-space:pre-wrap;">${escItemTooltip(desc)}</div>` : ''}
        <div style="display:flex; gap:10px; color:#fde68a;">
            <span>구매가: ${formatItemMoney(data.buy_price)}</span>
            <span>판매가: ${formatItemMoney(data.sell_price)}</span>
        </div>
    `;
}

function positionServerItemTooltip(ev) {
    const el = ensureServerItemTooltipEl();
    const gap = 14;
    const vw = window.innerWidth || document.documentElement.clientWidth || 1200;
    const vh = window.innerHeight || document.documentElement.clientHeight || 800;
    const rect = el.getBoundingClientRect();
    let left = (ev.clientX || 0) + gap;
    let top = (ev.clientY || 0) + gap;
    if (left + rect.width > vw - 8) left = Math.max(8, (ev.clientX || 0) - rect.width - gap);
    if (top + rect.height > vh - 8) top = Math.max(8, (ev.clientY || 0) - rect.height - gap);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
}

async function loadServerItemTooltip(entry) {
    const itemEntry = Number(entry || 0);
    if (itemEntry <= 0) throw new Error('invalid entry');
    if (g_serverItemTooltipCache.has(itemEntry)) return g_serverItemTooltipCache.get(itemEntry);
    if (g_serverTooltipApiAvailable) {
        try {
            const res = await fetch(`/api/content/item/tooltip?entry=${itemEntry}`);
            if (res.ok) {
                const data = await res.json();
                g_serverItemTooltipCache.set(itemEntry, data);
                return data;
            }
            // Server binary without new route: switch to fallback mode and stop hitting this endpoint.
            if (res.status === 404) g_serverTooltipApiAvailable = false;
        } catch (e) {
            // ignore and fallback
        }
    }

    // Fallback: use existing item search API (available on current server versions)
    const fallbackRes = await fetch(`/api/content/item/search?q=${itemEntry}`);
    if (!fallbackRes.ok) throw new Error(`HTTP ${fallbackRes.status}`);
    const list = await fallbackRes.json();
    const items = Array.isArray(list) ? list : (Array.isArray(list.items) ? list.items : []);
    const found = items.find(i => Number(i.entry) === itemEntry) || items[0];
    if (!found) throw new Error('no item');

    const fallbackData = {
        status: 'success',
        entry: itemEntry,
        name: found.name || `Item ${itemEntry}`,
        description: '서버 툴팁 API 미반영 상태입니다. 기본 정보를 표시합니다.',
        quality: Number(found.quality || 0),
        item_level: 0,
        required_level: 0,
        class_name: '',
        subclass_name: '',
        inventory_name: '',
        buy_price: 0,
        sell_price: 0,
        armor: 0,
        min_damage: 0,
        max_damage: 0,
        speed_ms: 0,
        stats: [],
        spells: []
    };
    g_serverItemTooltipCache.set(itemEntry, fallbackData);
    return fallbackData;
}

window.showServerItemTooltip = async function (ev, entry) {
    const itemEntry = Number(entry || 0);
    if (itemEntry <= 0) return;
    const el = ensureServerItemTooltipEl();
    el.innerHTML = '<div style="color:#cbd5e1;">아이템 정보를 불러오는 중...</div>';
    el.style.display = 'block';
    positionServerItemTooltip(ev);
    try {
        const data = await loadServerItemTooltip(itemEntry);
        if (!data || data.status !== 'success') throw new Error('no data');
        el.innerHTML = renderServerItemTooltipHtml(data);
        positionServerItemTooltip(ev);
    } catch (e) {
        el.innerHTML = '<div style="color:#fca5a5;">서버 아이템 정보를 불러오지 못했습니다.</div>';
        positionServerItemTooltip(ev);
    }
};

window.moveServerItemTooltip = function (ev) {
    if (!g_serverItemTooltipEl || g_serverItemTooltipEl.style.display === 'none') return;
    positionServerItemTooltip(ev);
};

window.hideServerItemTooltip = function () {
    if (!g_serverItemTooltipEl) return;
    g_serverItemTooltipEl.style.display = 'none';
};

function wrapWithWowheadItemLink(entry, innerHtml, title = '') {
    const itemEntry = Number(entry) || 0;
    const safeTitle = String(title || '').replace(/"/g, '&quot;');
    if (itemEntry <= 0) return innerHtml;
    return `<a href="${buildWowheadItemUrl(itemEntry)}" target="_blank" rel="noopener noreferrer" title="${safeTitle}" class="item-tooltip-link" data-item-entry="${itemEntry}" onmouseenter="showServerItemTooltip(event, ${itemEntry})" onmousemove="moveServerItemTooltip(event)" onmouseleave="hideServerItemTooltip()" style="text-decoration:none; color:inherit;">${innerHtml}</a>`;
}

function refreshWowheadTooltips() {
    try {
        if (window.WH && window.WH.Tooltips && typeof window.WH.Tooltips.refreshLinks === 'function') {
            window.WH.Tooltips.refreshLinks(true);
        }
        if (window.$WowheadPower && typeof window.$WowheadPower.refreshLinks === 'function') {
            window.$WowheadPower.refreshLinks(true);
        }
        // Dynamic table rendering often finishes asynchronously; retry shortly.
        setTimeout(() => {
            try {
                if (window.WH && window.WH.Tooltips && typeof window.WH.Tooltips.refreshLinks === 'function') {
                    window.WH.Tooltips.refreshLinks(true);
                }
                if (window.$WowheadPower && typeof window.$WowheadPower.refreshLinks === 'function') {
                    window.$WowheadPower.refreshLinks(true);
                }
            } catch (e) {
                // Ignore tooltip refresh errors
            }
        }, 120);
    } catch (e) {
        // Ignore tooltip refresh errors
    }
}


function buildAppState(tabName, extra = {}) {
    return Object.assign({ app: true, tab: tabName }, extra || {});
}

function pushTabHistory(tabName) {
    if (!window.history || typeof window.history.pushState !== 'function') return;
    const state = buildAppState(tabName);
    const curr = window.history.state;
    if (curr && curr.app === true && curr.tab === tabName) return;
    window.history.pushState(state, '', window.location.pathname + window.location.search);
}

function restoreFromHistoryState(state) {
    if (!state || state.app !== true) return false;
    const tab = state.tab || 'home';
    if (tab === 'board' && typeof window.restoreBoardState === 'function') {
        window.restoreBoardState(state);
        return true;
    }
    openTab(tab, { trackHistory: false });
    return true;
}

function openTab(tabName, options) {
    options = options || {};
    const trackHistory = options.trackHistory !== false;
    const contents = document.querySelectorAll('.tab-content');
    contents.forEach(content => content.classList.remove('active'));

    const buttons = document.querySelectorAll('.tab-btn');
    buttons.forEach(btn => btn.classList.remove('active'));

    const targetElem = document.getElementById(tabName);
    if (targetElem) {
        targetElem.classList.add('active');
    } else {
    }

    // Find and activate the correct button by ID
    const targetBtn = document.getElementById(tabName === 'calendar-page' ? 'tab-btn-calendar' : `tab-btn-${tabName}`);
    if (targetBtn) targetBtn.classList.add('active');
    ensureHeaderIcons();

    if (trackHistory && tabName !== 'board') {
        pushTabHistory(tabName);
    }

    const subTabParents = ['remote', 'account', 'gm', 'ban', 'log', 'logs', 'stats', 'content', 'board-admin', 'notification-admin', 'shop-admin'];
    
    if (subTabParents.includes(tabName)) {
        if (tabName === 'remote') {
            if (canUseLauncherApis()) {
                loadRemoteData();
                checkStatus();
                loadAnnouncementHistory();
            }
        }

        // Immediately trigger first visible subtab click if exists
        const prefix = tabName === 'logs' ? 'log' : tabName;
        const subBtns = document.querySelectorAll(`[id^="sub-btn-${prefix}-"]`);
        for (let btn of subBtns) {
            if (btn.style.display !== 'none') {
                btn.click();
                break;
            }
        }

        // Fallback: load primary data for tabs that have no sub buttons
        if (tabName === 'logs' && typeof loadLogs === 'function') {
            loadLogs(1, true);
        }
        if (tabName === 'stats' && typeof openStatsSubTab === 'function') {
            openStatsSubTab('account');
        }
        if (tabName === 'board-admin') {
            if (typeof openBoardSubTab === 'function') openBoardSubTab('list');
            else if (typeof loadBoardListAdmin === 'function') loadBoardListAdmin();
        }
        if (tabName === 'notification-admin' && typeof loadNotificationHistory === 'function') {
            loadNotificationHistory(1);
        }
        if (tabName === 'shop-admin' && typeof loadShopAdminPage === 'function') {
            loadShopAdminPage();
        }
        if (tabName === 'ban' && typeof openCharSubTab === 'function') {
            openCharSubTab('characters');
        }
        if (tabName === 'account' && typeof openAccountSubTab === 'function') {
            openAccountSubTab('list');
        }
        if (tabName === 'gm' && typeof GMManager?.switchSubTab === 'function') {
            GMManager.switchSubTab('todos'); // 업무관리(투두) 기본 로딩
        }
        if (tabName === 'content' && typeof openContentSubTab === 'function') {
            openContentSubTab('blackmarket'); // 콘텐츠 관리 기본 탭(암시장 품목)
        }
    } else if (tabName === 'mypage') {
        loadMyPage();
    } else if (tabName === 'mailbox') {
        if (typeof loadMailbox === 'function') loadMailbox(1);
    } else if (tabName === 'shop') {
        location.href = '/shop/';
        return;
    } else if (tabName === 'auction') {
        if (typeof loadAuctionPage === 'function') loadAuctionPage();
    } else if (tabName === 'home') {
        loadHomeSlider();
        loadOnlineCount();
        loadHomeNoticePreview();
    } else if (tabName === 'calendar-page') {
        initUserCalendarTab();
    } else if (tabName === 'board') {
        if (typeof loadPosts === 'function') loadPosts(1, { trackHistory: trackHistory });
    }

    // Auto-close sidebar on mobile after navigation
    if (window.innerWidth <= 768) {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        if (sidebar && sidebar.classList.contains('active')) {
            toggleSidebar();
        }
    }
}

// --- Global Utilities ---

function loadScript(url) {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${url}"]`)) {
            resolve();
            return;
        }
        const script = document.createElement('script');
        script.src = url;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

async function initBoardSystem() {
    try {
        // board.js is statically included in index.html. Do not reload dynamically
        // to avoid duplicate global declarations.
        if (typeof initBoard === 'function') {
            await initBoard(g_sessionUser || null);
        } else {
            console.error('[System] initBoard function not found in board.js');
        }

        if (typeof loadBoardsToSidebar === 'function') {
            loadBoardsToSidebar();
        }
    } catch (e) {
        console.error('[System] Failed to load board.js:', e);
    }
}

function renderPagination(container, data, loadFunc) {
    if (!container) return;
    container.innerHTML = '';
    container.className = 'pagination-stable';

    const currentPage = data.page || 1;
    const totalPages = Math.max(1, data.totalPages || 0);

    // Left Slot (Previous)
    const leftSlot = document.createElement('div');
    leftSlot.className = 'pg-slot';
    const prevBtn = document.createElement('button');
    prevBtn.className = 'page-btn';
    prevBtn.innerHTML = '<i class="fas fa-chevron-left"></i> 이전';
    if (currentPage <= 1) {
        prevBtn.disabled = true;
    } else {
        prevBtn.onclick = () => loadFunc(currentPage - 1);
    }
    leftSlot.appendChild(prevBtn);
    container.appendChild(leftSlot);

    // Middle Slot (Numbers)
    const midSlot = document.createElement('div');
    midSlot.className = 'pg-numbers';
    midSlot.style.display = 'flex';
    midSlot.style.gap = '0.5rem';
    for (let i = 1; i <= totalPages; i++) {
        if (totalPages > 10 && (i > 3 && i < totalPages - 2 && (i < currentPage - 2 || i > currentPage + 2))) {
            if (i === 4 || i === totalPages - 2) {
                const dot = document.createElement('span');
                dot.textContent = '...';
                dot.className = 'page-ellipsis';
                midSlot.appendChild(dot);
            }
            continue;
        }
        const btn = document.createElement('button');
        btn.className = 'page-btn' + (i === currentPage ? ' active' : '');
        btn.textContent = i;
        btn.onclick = () => loadFunc(i);
        midSlot.appendChild(btn);
    }
    container.appendChild(midSlot);

    // Right Slot (Next)
    const rightSlot = document.createElement('div');
    rightSlot.className = 'pg-slot';
    const nextBtn = document.createElement('button');
    nextBtn.className = 'page-btn';
    nextBtn.innerHTML = '다음 <i class="fas fa-chevron-right"></i>';
    if (currentPage >= totalPages) {
        nextBtn.disabled = true;
    } else {
        nextBtn.onclick = () => loadFunc(currentPage + 1);
    }
    rightSlot.appendChild(nextBtn);
    container.appendChild(rightSlot);
}

async function loadLogs(page = 1, clearFilters = false) {
    const tbody = document.getElementById('logs-list');
    const pgContainer = document.getElementById('logs-pagination');
    const tableContainer = document.querySelector('.scroll-table');
    if (!tbody) return;

    if (clearFilters) {
        if (document.getElementById('filter-user')) document.getElementById('filter-user').value = '';
        if (document.getElementById('filter-role')) document.getElementById('filter-role').value = '';
        if (document.getElementById('filter-ip')) document.getElementById('filter-ip').value = '';
        if (document.getElementById('filter-btn')) document.getElementById('filter-btn').value = '';
    }

    tbody.style.opacity = '0.4';
    if (page === 1 && clearFilters) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">로딩 중...</td></tr>';
    }

    try {
        const user = document.getElementById('filter-user')?.value || '';
        const role = document.getElementById('filter-role')?.value || '';
        const ip = document.getElementById('filter-ip')?.value || '';
        const btn = document.getElementById('filter-btn')?.value || '';

        const params = new URLSearchParams({
            page: page,
            limit: 20,
            user: user,
            role: role,
            ip: ip,
            button: btn
        });

        const response = await fetch('/api/logs/list?' + params.toString());
        if (!response.ok) {
            const errText = await response.text();
            ModalUtils.handleError(errText);
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:red;">로그를 불러오는데 실패했습니다.</td></tr>';
            tbody.style.opacity = '1';
            return;
        }
        const data = await response.json();
        const logs = data.logs || [];

        if (!logs || logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">로그가 없습니다.</td></tr>';
            tbody.style.opacity = '1';
            renderPagination(pgContainer, data, (p) => loadLogs(p));
            return;
        }

        tbody.innerHTML = logs.map(log => `
            <tr>
                <td>${log.no}</td>
                <td style="font-weight:700;">${log.user}</td>
                <td>
                    <span class="badge ${log.role === 'Admin' ? 'admin' : 'user'}">${log.role}</span>
                </td>
                <td style="font-family:monospace; opacity:0.7;">${log.ip}</td>
                <td style="font-size:0.85rem; color: var(--text-secondary);">${log.date}</td>
                <td style="font-weight:600;">${log.button}</td>
            </tr>
        `).join('');

        renderPagination(pgContainer, data, (p) => loadLogs(p));

        tbody.style.opacity = '1';
        if (tableContainer) tableContainer.scrollTop = 0;
    } catch (e) {
        console.error("Failed to load logs", e);
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:red;">로그를 불러오는데 실패했습니다.</td></tr>';
        tbody.style.opacity = '1';
    }
}

// Log Sub-Tab Management
let currentLogTab = 'action';

function openLogSubTab(tabName) {
    // Update current tab tracker
    currentLogTab = tabName;

    const parent = document.getElementById('logs');
    if (!parent) return;

    // Hide all sub-tab contents within this tab
    const contents = parent.querySelectorAll('.log-sub-content');
    contents.forEach(content => content.classList.remove('active'));

    // Remove active class from all sub-tab buttons within this tab
    const buttons = parent.querySelectorAll('.log-sub-tab-btn');
    buttons.forEach(btn => btn.classList.remove('active'));

    // Show selected sub-tab content
    const targetContent = document.getElementById(`log-${tabName}`);
    if (targetContent) targetContent.classList.add('active');

    // Activate clicked button
    const clickedButton = Array.from(buttons).find(btn =>
        btn.getAttribute('onclick')?.includes(`'${tabName}'`)
    );
    if (clickedButton) clickedButton.classList.add('active');

    // Load data for the selected tab
    if (tabName === 'action') {
        loadLogs(1, true);
    } else if (tabName === 'blackmarket') {
        loadBlackMarketLogs(1, true);
    } else if (tabName === 'karazhan') {
        loadKarazhanLogs(1, true);
    } else if (tabName === 'playtime') {
        loadPlaytimeLogs(1, true);
    } else if (tabName === 'mail') {
        loadMailLogs(1, true);
    }
}

function refreshCurrentLogTab() {
    openLogSubTab(currentLogTab);
}

// Stats Sub-Tab Management
let currentStatsTab = 'account';
let statsDashboardCache = null;
const statsDashboardCacheMap = {};
const statsDateFilters = {
    account: { from: '', to: '' },
    character: { from: '', to: '' },
    gold: { from: '', to: '' },
    item: { from: '', to: '' }
};
const statsCharts = {};

function destroyStatsChart(key) {
    if (statsCharts[key]) {
        try { statsCharts[key].destroy(); } catch (e) {}
        delete statsCharts[key];
    }
}

function splitCoins(totalCopper) {
    const n = Math.max(0, Number(totalCopper) || 0);
    const gold = Math.floor(n / 10000);
    const silver = Math.floor((n % 10000) / 100);
    const copper = Math.floor(n % 100);
    return { gold, silver, copper };
}

function formatCoinsText(totalCopper) {
    const c = splitCoins(totalCopper);
    return `${c.gold.toLocaleString()}골드 ${c.silver}실버 ${c.copper}코퍼`;
}

function formatCoinsHtml(totalCopper) {
    const c = splitCoins(totalCopper);
    return `
        <span style="display:inline-flex; align-items:center; gap:6px;">
            <span style="display:inline-flex; align-items:center; gap:3px;"><b style="color:#f59e0b;">${c.gold.toLocaleString()}</b><img src="/img/gold_emoji.png" alt="골드" style="width:14px; height:14px;"></span>
            <span style="display:inline-flex; align-items:center; gap:3px;"><b style="color:#94a3b8;">${c.silver}</b><img src="/img/silver_emoji.png" alt="실버" style="width:14px; height:14px;"></span>
            <span style="display:inline-flex; align-items:center; gap:3px;"><b style="color:#b45309;">${c.copper}</b><img src="/img/copper_emoji.png" alt="코퍼" style="width:14px; height:14px;"></span>
        </span>
    `;
}

function statsPalette(alpha = 0.85) {
    return [
        `rgba(59,130,246,${alpha})`,   // blue
        `rgba(16,185,129,${alpha})`,   // emerald
        `rgba(245,158,11,${alpha})`,   // amber
        `rgba(236,72,153,${alpha})`,   // pink
        `rgba(139,92,246,${alpha})`,   // violet
        `rgba(14,165,233,${alpha})`,   // sky
        `rgba(251,113,133,${alpha})`,  // rose
        `rgba(34,197,94,${alpha})`,    // green
        `rgba(249,115,22,${alpha})`,   // orange
        `rgba(99,102,241,${alpha})`,   // indigo
        `rgba(234,179,8,${alpha})`,    // yellow
        `rgba(6,182,212,${alpha})`     // cyan
    ];
}

function renderStatsChart(canvasId, chartKey, type, labels, values, label, color, usePalette = false, valueFormatter = null) {
    const el = document.getElementById(canvasId);
    if (!el || typeof Chart === 'undefined') return;
    destroyStatsChart(chartKey);
    const paletteBg = statsPalette(0.65);
    const paletteBorder = statsPalette(0.95);
    const bg = usePalette ? (labels || []).map((_, i) => paletteBg[i % paletteBg.length]) : (color || 'rgba(59, 91, 219, 0.35)');
    const border = usePalette ? (labels || []).map((_, i) => paletteBorder[i % paletteBorder.length]) : (color || 'rgba(59, 91, 219, 1)');
    const isScaleChart = type === 'bar' || type === 'line';
    statsCharts[chartKey] = new Chart(el.getContext('2d'), {
        type,
        data: {
            labels: labels || [],
            datasets: [{
                label: label || '',
                data: values || [],
                backgroundColor: bg,
                borderColor: border,
                borderWidth: 1.5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: type !== 'bar' },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: valueFormatter ? {
                        label: (ctx) => {
                            const v = Number(ctx.raw || 0);
                            return `${ctx.dataset.label}: ${valueFormatter(v)}`;
                        }
                    } : undefined
                }
            },
            scales: isScaleChart ? {
                y: {
                    beginAtZero: true,
                    ticks: valueFormatter ? {
                        callback: (value) => valueFormatter(Number(value || 0))
                    } : undefined
                }
            } : {}
        }
    });
}

function renderStatsSubTab(tabName) {
    if (!statsDashboardCache) return;
    const d = statsDashboardCache;
    const rangeLabel = getStatsRangeLabel(tabName);
    if (tabName === 'account') {
        const sum = document.getElementById('stats-account-summary');
        const totalAcc = (d.account && d.account.total) || 0;
        if (sum) sum.textContent = `총 계정: ${Number(totalAcc).toLocaleString()} / 조회 기간: ${rangeLabel}`;
        renderStatsChart(
            'stats-account-daily-chart',
            'accountDaily',
            'line',
            d.account?.daily?.labels || [],
            d.account?.daily?.values || [],
            '계정 생성 수',
            'rgba(37, 99, 235, 0.9)'
        );
        renderStatsChart(
            'stats-account-post-rank-chart',
            'accountPostRank',
            'bar',
            d.account?.postRank?.labels || [],
            d.account?.postRank?.values || [],
            '작성 글 수',
            'rgba(99, 102, 241, 0.85)',
            true
        );
        renderStatsChart(
            'stats-account-login-daily-chart',
            'accountLoginDaily',
            'line',
            d.account?.loginDaily?.labels || [],
            d.account?.loginDaily?.values || [],
            '접속자 수(중복 사용자 제외)',
            'rgba(20, 184, 166, 0.9)',
            false
        );
    } else if (tabName === 'character') {
        const sum = document.getElementById('stats-character-summary');
        if (sum) sum.textContent = `총 캐릭터: ${Number((d.character && d.character.total) || 0).toLocaleString()} / 조회 기간: ${rangeLabel}`;
        renderStatsChart(
            'stats-character-class-chart',
            'charClass',
            'doughnut',
            d.character?.classDist?.labels || [],
            d.character?.classDist?.values || [],
            '직업 분포',
            'rgba(16, 185, 129, 0.85)',
            true
        );
        renderStatsChart(
            'stats-character-level-chart',
            'charLevel',
            'bar',
            d.character?.levelDist?.labels || [],
            d.character?.levelDist?.values || [],
            '레벨 구간',
            'rgba(245, 158, 11, 0.85)',
            true
        );
        renderStatsChart(
            'stats-character-race-chart',
            'charRace',
            'bar',
            d.character?.raceDist?.labels || [],
            d.character?.raceDist?.values || [],
            '종족 분포',
            'rgba(59, 130, 246, 0.9)',
            true
        );
        renderStatsChart(
            'stats-character-faction-chart',
            'charFaction',
            'pie',
            d.character?.factionDist?.labels || [],
            d.character?.factionDist?.values || [],
            '진영 분포',
            'rgba(234, 179, 8, 0.9)',
            true
        );
    } else if (tabName === 'gold') {
        const sum = document.getElementById('stats-gold-summary');
        if (sum) {
            sum.innerHTML = `
                총 보유 골드: ${formatCoinsHtml(d.gold?.total || 0)}
                <span style="margin-left:10px;">/ 캐릭터 평균: ${formatCoinsHtml(d.gold?.avgPerChar || 0)}</span>
                <span style="margin-left:10px;">/ 조회 기간: ${rangeLabel}</span>
            `;
        }
        renderStatsChart(
            'stats-gold-top-chart',
            'goldTop',
            'bar',
            d.gold?.top10?.labels || [],
            d.gold?.top10?.values || [],
            '보유 골드',
            'rgba(234, 179, 8, 0.9)',
            true,
            formatCoinsText
        );
        renderStatsChart(
            'stats-gold-bracket-chart',
            'goldBracket',
            'doughnut',
            d.gold?.bracket?.labels || [],
            d.gold?.bracket?.values || [],
            '골드 구간 분포',
            'rgba(59, 130, 246, 0.9)',
            true
        );
        renderStatsChart(
            'stats-gold-race-chart',
            'goldRace',
            'bar',
            d.gold?.raceDist?.labels || [],
            d.gold?.raceDist?.values || [],
            '종족별 보유 골드',
            'rgba(16, 185, 129, 0.9)',
            true,
            formatCoinsText
        );
        renderStatsChart(
            'stats-gold-faction-chart',
            'goldFaction',
            'pie',
            d.gold?.factionDist?.labels || [],
            d.gold?.factionDist?.values || [],
            '진영별 보유 골드',
            'rgba(245, 158, 11, 0.9)',
            true,
            formatCoinsText
        );
    } else if (tabName === 'item') {
        renderStatsChart(
            'stats-item-top-chart',
            'itemTop',
            'bar',
            d.item?.top10?.labels || [],
            d.item?.top10?.values || [],
            '아이템 수량',
            'rgba(168, 85, 247, 0.9)',
            true
        );
    }
}

function getStatsActiveFilter(tabName = currentStatsTab) {
    return statsDateFilters[tabName] || { from: '', to: '' };
}

function getStatsCacheKey(tabName = currentStatsTab) {
    const f = getStatsActiveFilter(tabName);
    return `${tabName}|${String(f.from || '')}|${String(f.to || '')}`;
}

function getStatsRangeLabel(tabName = currentStatsTab) {
    const f = getStatsActiveFilter(tabName);
    if (f.from && f.to) return `${f.from} ~ ${f.to}`;
    return '전체 기간';
}

function syncStatsDateInputsFromState(tabName = currentStatsTab) {
    const fromEl = document.getElementById('stats-date-from');
    const toEl = document.getElementById('stats-date-to');
    const f = getStatsActiveFilter(tabName);
    if (fromEl) fromEl.value = f.from || '';
    if (toEl) toEl.value = f.to || '';
}

function persistStatsDateInputsToState(tabName = currentStatsTab) {
    const fromEl = document.getElementById('stats-date-from');
    const toEl = document.getElementById('stats-date-to');
    const from = String((fromEl && fromEl.value) || '').trim();
    const to = String((toEl && toEl.value) || '').trim();
    statsDateFilters[tabName] = { from, to };
}

async function loadStatsDashboard(force = false, tabName = currentStatsTab) {
    const cacheKey = getStatsCacheKey(tabName);
    if (!force && statsDashboardCacheMap[cacheKey]) {
        statsDashboardCache = statsDashboardCacheMap[cacheKey];
        return statsDashboardCache;
    }
    const f = getStatsActiveFilter(tabName);
    const qs = new URLSearchParams();
    if (f.from && f.to) {
        qs.set('from', f.from);
        qs.set('to', f.to);
    }
    const url = qs.toString() ? `/api/stats/dashboard?${qs.toString()}` : '/api/stats/dashboard';
    const res = await fetch(url);
    if (!res.ok) throw new Error('통계 정보를 불러오지 못했습니다.');
    statsDashboardCache = await res.json();
    statsDashboardCacheMap[cacheKey] = statsDashboardCache;
    return statsDashboardCache;
}

function openStatsSubTab(tabName) {
    currentStatsTab = tabName;
    const parent = document.getElementById('stats');
    if (!parent) return;

    const contents = parent.querySelectorAll('.log-sub-content');
    contents.forEach(content => content.classList.remove('active'));
    const buttons = parent.querySelectorAll('.log-sub-tab-btn');
    buttons.forEach(btn => btn.classList.remove('active'));

    const targetContent = document.getElementById(`stats-${tabName}`);
    if (targetContent) targetContent.classList.add('active');

    const clickedButton = Array.from(buttons).find(btn => btn.getAttribute('onclick')?.includes(`'${tabName}'`));
    if (clickedButton) clickedButton.classList.add('active');

    syncStatsDateInputsFromState(tabName);
    loadStatsDashboard(false, tabName)
        .then(() => renderStatsSubTab(tabName))
        .catch((e) => {
            console.error('[stats] load failed', e);
            ModalUtils.showAlert('통계 데이터를 불러오지 못했습니다.');
        });
}

function refreshCurrentStatsTab() {
    loadStatsDashboard(true, currentStatsTab || 'account')
        .then(() => renderStatsSubTab(currentStatsTab || 'account'))
        .catch((e) => {
            console.error('[stats] refresh failed', e);
            ModalUtils.showAlert('통계 새로고침에 실패했습니다.');
        });
}

function applyStatsDateFilter() {
    const tabName = currentStatsTab || 'account';
    persistStatsDateInputsToState(tabName);
    loadStatsDashboard(true, tabName)
        .then(() => renderStatsSubTab(tabName))
        .catch((e) => {
            console.error('[stats] date filter failed', e);
            ModalUtils.showAlert('기간별 통계 조회에 실패했습니다.');
        });
}

function resetStatsDateFilter() {
    const tabName = currentStatsTab || 'account';
    statsDateFilters[tabName] = { from: '', to: '' };
    syncStatsDateInputsFromState(tabName);
    loadStatsDashboard(true, tabName)
        .then(() => renderStatsSubTab(tabName))
        .catch((e) => {
            console.error('[stats] date reset failed', e);
            ModalUtils.showAlert('기간 초기화에 실패했습니다.');
        });
}

// Character Management Sub-Tab Management
let currentCharTab = 'characters';

function openCharSubTab(tabName) {
    currentCharTab = tabName;
    const parent = document.getElementById('ban');
    if (!parent) return;

    const contents = parent.querySelectorAll('.log-sub-content');
    contents.forEach(content => content.classList.remove('active'));
    const buttons = parent.querySelectorAll('.log-sub-tab-btn');
    buttons.forEach(btn => btn.classList.remove('active'));

    const targetContent = document.getElementById(`char-${tabName}`);
    if (targetContent) targetContent.classList.add('active');

    const clickedButton = Array.from(buttons).find(btn => btn.getAttribute('onclick')?.includes(`'${tabName}'`));
    if (clickedButton) clickedButton.classList.add('active');

    if (tabName === 'characters') {
        loadCharacterList(1, true);
    } else if (tabName === 'accountban') {
        loadBanList('account');
    } else if (tabName === 'ipban') {
        // sendmail tab doesn't need to load anything
    }
}

// Server Management Sub-Tab Management
let currentServerTab = 'control';

function openServerSubTab(tabName) {
    currentServerTab = tabName;
    const parent = document.getElementById('remote');
    if (!parent) return;

    const contents = parent.querySelectorAll('.log-sub-content');
    contents.forEach(content => content.classList.remove('active'));
    const buttons = parent.querySelectorAll('.log-sub-tab-btn');
    buttons.forEach(btn => btn.classList.remove('active'));

    const targetContent = document.getElementById(`mn-${tabName}`);
    if (targetContent) targetContent.classList.add('active');

    const clickedButton = Array.from(buttons).find(btn => btn.getAttribute('onclick')?.includes(`'${tabName}'`));
    if (clickedButton) clickedButton.classList.add('active');

    if (tabName === 'control') {
        loadRemoteData();
        loadAnnouncementHistory();
        // Server status is auto-updated by SSE or existing periodic checks, 
        // but we can force check if needed. Existing startServer/stopServer handlers usually trigger updates.
    } else if (tabName === 'schedule') {
        loadSchedule(1);
    }
}

function refreshCurrentServerTab() {
    openServerSubTab(currentServerTab);
}

// Account Management Sub-Tab Management
let currentAccountTab = 'statistics';

function openAccountSubTab(tabName) {
    currentAccountTab = tabName;
    const contents = document.querySelectorAll('#account .log-sub-content');
    contents.forEach(content => content.classList.remove('active'));
    const buttons = document.querySelectorAll('#account .log-sub-tab-btn');
    buttons.forEach(btn => btn.classList.remove('active'));

    const targetContent = document.getElementById(`acc-${tabName}`);
    if (targetContent) targetContent.classList.add('active');

    // Find button 
    const clickedButton = Array.from(buttons).find(btn => btn.getAttribute('onclick')?.includes(tabName));
    if (clickedButton) clickedButton.classList.add('active');

    if (tabName === 'statistics') {
        loadStats();
    } else if (tabName === 'permissions') {
        loadUserList(1, true);
    } else if (tabName === 'menu') {
        loadMenuPermissions();
    } else if (tabName === 'notification') {
        const targetId = document.getElementById('notif-target-id');
        if(targetId) {
            targetId.value = '';
            document.getElementById('notif-target-user').value = '';
            document.getElementById('notif-title').value = '';
            document.getElementById('notif-message').value = '';
            document.getElementById('notif-link').value = '';
            document.getElementById('notif-user-result').textContent = '';
        }
    }
}

async function loadMenuPermissions() {
    const tbody = document.getElementById('role-perm-menu-body');
    const menuSection = document.getElementById('role-perm-menu-section');
    const boardBody = document.getElementById('role-perm-board-body');
    const boardSection = document.getElementById('role-perm-board-section');
    const loading = document.getElementById('role-perm-loading');

    if (!tbody) return;
    
    // Show loading, hide table initially
    if (loading) loading.style.display = 'block';
    if (menuSection) menuSection.style.display = 'none';
    if (boardSection) boardSection.style.display = 'none';

    tbody.innerHTML = ''; // Clear existing rows
    if (boardBody) boardBody.innerHTML = '';

    try {
        const res = await fetch('/api/admin/role-permissions');
        if (!res.ok) throw new Error("권한 정보를 불러오는데 실패했습니다.");
        const data = await res.json();
        const permissions = data.permissions || [];
        
        // Split into Menus and Boards
        const menuPerms = permissions.filter(p => p && p.resource_type && !p.resource_type.startsWith('board'));
        const boardPerms = permissions.filter(p => p && p.resource_type && p.resource_type.startsWith('board'));

        // Fallback: ensure notification send menu is always visible in permission table.
        if (!menuPerms.some(p => p.resource_type === 'menu' && p.resource_id === 'notification-admin')) {
            menuPerms.push({
                resource_type: 'menu',
                resource_id: 'notification-admin',
                resource_name: '알림발송',
                rank_1: false,
                rank_2: true,
                rank_3: true,
                order_index: 95
            });
        }
        if (!menuPerms.some(p => p.resource_type === 'menu' && p.resource_id === 'mailbox')) {
            menuPerms.push({
                resource_type: 'menu',
                resource_id: 'mailbox',
                resource_name: '알림함',
                rank_1: true,
                rank_2: true,
                rank_3: true,
                order_index: 12
            });
        }
        if (!menuPerms.some(p => p.resource_type === 'menu' && p.resource_id === 'shop')) {
            menuPerms.push({
                resource_type: 'menu',
                resource_id: 'shop',
                resource_name: '선술집',
                rank_1: true,
                rank_2: true,
                rank_3: true,
                order_index: 13
            });
        }
        if (!menuPerms.some(p => p.resource_type === 'menu' && p.resource_id === 'shop-admin')) {
            menuPerms.push({
                resource_type: 'menu',
                resource_id: 'shop-admin',
                resource_name: '선술집관리',
                rank_1: false,
                rank_2: true,
                rank_3: true,
                order_index: 96
            });
        }

        const sortedMenu = [...menuPerms].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));

        // Render Menus (Groups by parent if possible, but for now just flat with indentation)
        // To implement true tree structure with folding, we need to identify parents.
        // Assuming 'menu' types are parents and 'subprocess' are children of the preceding menu.
        // We will stick to the visual structure based on order_index which seems to be correct.
        
        // Enhanced rendering with folding support
        let currentParentId = null;
        let html = '';
        
        sortedMenu.forEach(p => {
             const rType = (p.resource_type || '').trim().toLowerCase();
             const safeName = (typeof escapeHtmlAccount === 'function') ? escapeHtmlAccount(p.resource_name || '') : (p.resource_name || '');
             
             if (rType === 'menu') {
                 currentParentId = p.resource_id;
                 html += `
                    <tr class="menu-parent-row" data-target="group-${p.resource_id}" onclick="toggleMenuGroup('${p.resource_id}')" style="background-color: #f8fafc; border-bottom: 2px solid #e2e8f0; cursor: pointer;">
                        <td style="font-weight: 700; color: #1e293b; font-size: 1.05rem; padding: 12px 16px;">
                            <span class="menu-toggle-icon" id="icon-${p.resource_id}" style="display:inline-block; width:24px; text-align:center; margin-right:8px; color:#3b82f6;"><i class="fas fa-folder-open"></i></span>
                            ${safeName}
                        </td>
                        <td style="color: var(--text-secondary);">${p.resource_id}</td>
                        <td>
                             <div style="display:flex; justify-content:center; gap:20px;">
                                <label style="display:flex; align-items:center; gap:8px; cursor:pointer;" onclick="event.stopPropagation();">
                                    <input type="checkbox" id="perm-rank1-${p.resource_type}-${p.resource_id}" data-rtype="${p.resource_type}" data-rid="${p.resource_id}" data-rank="1" ${p.rank_1 ? 'checked' : ''} style="width:18px; height:18px;"> 
                                    <span style="font-weight:600; color:#475569;">유저</span>
                                </label>
                                <label style="display:flex; align-items:center; gap:8px; cursor:pointer;" onclick="event.stopPropagation();">
                                    <input type="checkbox" id="perm-rank2-${p.resource_type}-${p.resource_id}" data-rtype="${p.resource_type}" data-rid="${p.resource_id}" data-rank="2" ${p.rank_2 ? 'checked' : ''} style="width:18px; height:18px;">
                                    <span style="font-weight:600; color:#475569;">GM</span>
                                </label>
                                <label style="display:flex; align-items:center; gap:8px; opacity:0.6;" onclick="event.stopPropagation();">
                                    <input type="checkbox" checked disabled style="width:18px; height:18px;">
                                    <span style="font-weight:600; color:#94a3b8;">관리자</span>
                                </label>
                            </div>
                        </td>
                        <td style="text-align:center;">
                            <button onclick="event.stopPropagation(); updateRolePermission('${p.resource_type}', '${p.resource_id}')" class="btn btn-primary" style="padding:0.5rem 1.5rem; font-size:0.9rem;">
                                <i class="fas fa-save"></i> 저장
                            </button>
                        </td>
                    </tr>
                 `;
             } else {
                 const parentGroupClass = currentParentId ? `group-${currentParentId}` : '';
                 html += `
                    <tr class="menu-child-row ${parentGroupClass}" style="background-color: #ffffff; border-bottom: 1px solid #f1f5f9;">
                        <td style="color: #475569; padding: 12px 16px;">
                            <span style="display:inline-block; width:24px; text-align:center; margin-right:8px; margin-left:24px; color:#94a3b8;"><i class="fas fa-turn-up fa-rotate-90"></i></span>
                            ${safeName}
                        </td>
                        <td style="color: var(--text-secondary);">${p.resource_id}</td>
                        <td>
                            <div style="display:flex; justify-content:center; gap:20px;">
                                <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                                    <input type="checkbox" id="perm-rank1-${p.resource_type}-${p.resource_id}" data-rtype="${p.resource_type}" data-rid="${p.resource_id}" data-rank="1" ${p.rank_1 ? 'checked' : ''} style="width:18px; height:18px;">
                                    <span style="font-weight:600; color:#475569;">유저</span>
                                </label>
                                <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                                    <input type="checkbox" id="perm-rank2-${p.resource_type}-${p.resource_id}" data-rtype="${p.resource_type}" data-rid="${p.resource_id}" data-rank="2" ${p.rank_2 ? 'checked' : ''} style="width:18px; height:18px;">
                                    <span style="font-weight:600; color:#475569;">GM</span>
                                </label>
                                <label style="display:flex; align-items:center; gap:8px; opacity:0.6;">
                                    <input type="checkbox" checked disabled style="width:18px; height:18px;">
                                    <span style="font-weight:600; color:#94a3b8;">관리자</span>
                                </label>
                            </div>
                        </td>
                        <td style="text-align:center;">
                            <button onclick="updateRolePermission('${p.resource_type}', '${p.resource_id}')" class="btn btn-primary" style="padding:0.5rem 1.5rem; font-size:0.9rem;">
                                <i class="fas fa-save"></i> 저장
                            </button>
                        </td>
                    </tr>
                 `;
             }
        });
        tbody.innerHTML = html;

        // Render Boards
        if (boardBody && boardPerms.length > 0) {
            boardBody.innerHTML = boardPerms.map(p => {
                 const safeName = (typeof escapeHtmlAccount === 'function') ? escapeHtmlAccount(p.resource_name || '') : (p.resource_name || '');
                 // Determine read/write label
                 const typeLabel = p.resource_type === 'board_read' ? 
                    '<span style="font-size:0.75rem; background:#dbeafe; color:#1d4ed8; padding:2px 6px; border-radius:4px; margin-left:6px;">읽기</span>' : 
                    '<span style="font-size:0.75rem; background:#fef3c7; color:#92400e; padding:2px 6px; border-radius:4px; margin-left:6px;">쓰기</span>';

                 return `
                    <tr style="background-color: #ffffff; border-bottom: 1px solid #f1f5f9;">
                        <td style="font-weight: 600; color: #1e293b; padding: 12px 16px;">
                            ${safeName} ${typeLabel}
                        </td>
                        <td style="color: var(--text-secondary);">${p.resource_id}</td>
                        <td>
                            <div style="display:flex; justify-content:center; gap:20px;">
                                <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                                    <input type="checkbox" id="perm-rank1-${p.resource_type}-${p.resource_id}" data-rtype="${p.resource_type}" data-rid="${p.resource_id}" data-rank="1" ${p.rank_1 ? 'checked' : ''} style="width:18px; height:18px;">
                                    <span style="font-weight:600; color:#475569;">유저</span>
                                </label>
                                <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                                    <input type="checkbox" id="perm-rank2-${p.resource_type}-${p.resource_id}" data-rtype="${p.resource_type}" data-rid="${p.resource_id}" data-rank="2" ${p.rank_2 ? 'checked' : ''} style="width:18px; height:18px;">
                                    <span style="font-weight:600; color:#475569;">GM</span>
                                </label>
                                <label style="display:flex; align-items:center; gap:8px; opacity:0.6;">
                                    <input type="checkbox" checked disabled style="width:18px; height:18px;">
                                    <span style="font-weight:600; color:#94a3b8;">관리자</span>
                                </label>
                            </div>
                        </td>
                        <td style="text-align:center;">
                            <button onclick="updateRolePermission('${p.resource_type}', '${p.resource_id}')" class="btn btn-primary" style="padding:0.5rem 1.5rem; font-size:0.9rem;">
                                <i class="fas fa-save"></i> 저장
                            </button>
                        </td>
                    </tr>
                 `;
            }).join('');
        }
        
        // Hide loading, Show sections
        if (loading) loading.style.display = 'none';
        if (menuSection) menuSection.style.display = 'block';
        if (boardSection && boardPerms.length > 0) boardSection.style.display = 'block';

    } catch (e) {
        console.error(e);
        if (loading) loading.style.display = 'none';
        if (menuSection) menuSection.style.display = 'block'; // Show section to display error in body
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:20px; color:red;">${e.message}</td></tr>`;
    }
}

function toggleMenuGroup(groupId) {
    const rows = document.querySelectorAll(`.group-${groupId}`);
    const icon = document.getElementById(`icon-${groupId}`);
    let isHidden = false;

    rows.forEach(row => {
        if (row.style.display === 'none') {
            row.style.display = 'table-row';
        } else {
            row.style.display = 'none';
            isHidden = true;
        }
    });

    if (icon) {
        icon.innerHTML = isHidden ? '<i class="fas fa-folder"></i>' : '<i class="fas fa-folder-open"></i>';
    }
}

function cssEscapeSafe(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') {
        return window.CSS.escape(String(value));
    }
    return String(value).replace(/["\\]/g, '\\$&');
}

function collectRolePermissionPayload() {
    const resourceMap = {};
    const inputs = document.querySelectorAll('input[type="checkbox"][data-rtype][data-rid][data-rank]');
    if (!inputs.length) {
        return [];
    }

    inputs.forEach(cb => {
        const rType = cb.dataset.rtype || '';
        const rId = cb.dataset.rid || '';
        const rank = cb.dataset.rank || '';
        if (!rType || !rId || (rank !== '1' && rank !== '2')) return;

        const key = `${rType}|${rId}`;
        if (!resourceMap[key]) {
            resourceMap[key] = {
                resource_type: rType,
                resource_id: rId,
                rank_1: false,
                rank_2: false
            };
        }
        if (rank === '1') resourceMap[key].rank_1 = cb.checked;
        if (rank === '2') resourceMap[key].rank_2 = cb.checked;
    });
    return Object.values(resourceMap);
}

// Bulk save function
async function saveRolePermissions() {
    ModalUtils.showConfirm('변경된 권한 설정을 모두 저장하시겠습니까?', async () => {
        try {
            const payload = { permissions: collectRolePermissionPayload() };

            if (payload.permissions.length === 0) {
                ModalUtils.showAlert('저장할 항목이 없습니다.');
                return;
            }

            const res = await fetch('/api/admin/role-permissions/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                ModalUtils.showAlert('모든 권한 설정이 성공적으로 저장되었습니다.');
                loadMenuPermissions();
            } else {
                const err = await res.json();
                throw new Error(err.message || '저장 실패');
            }

        } catch (e) {
            console.error(e);
            ModalUtils.showAlert('저장 중 오류가 발생했습니다: ' + e.message);
        }
    }); // End confirm callback
}

async function updateRolePermission(resourceType, resourceId) {
    const safeType = cssEscapeSafe(resourceType);
    const safeId = cssEscapeSafe(resourceId);
    const rank1El = document.querySelector(`input[data-rtype="${safeType}"][data-rid="${safeId}"][data-rank="1"]`) ||
        document.getElementById(`perm-rank1-${resourceType}-${resourceId}`);
    const rank2El = document.querySelector(`input[data-rtype="${safeType}"][data-rid="${safeId}"][data-rank="2"]`) ||
        document.getElementById(`perm-rank2-${resourceType}-${resourceId}`);
    const rank1 = rank1El ? rank1El.checked : false;
    const rank2 = rank2El ? rank2El.checked : false;

    ModalUtils.showConfirm(`'${resourceId}' (${resourceType}) 권한 설정을 저장하시겠습니까?`, async () => {
        try {
            const payload = {
                permissions: [{
                    resource_type: resourceType,
                    resource_id: resourceId,
                    rank_1: rank1,
                    rank_2: rank2
                }]
            };

            const res = await fetch('/api/admin/role-permissions/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                ModalUtils.showAlert('권한 설정이 저장되었습니다.');
                loadMenuPermissions();
            } else {
                const err = await res.json();
                throw new Error(err.message || '저장 실패');
            }
        } catch (e) {
            console.error(e);
            ModalUtils.showAlert('오류 발생: ' + e.message);
        }
    });
}

function refreshCurrentAccountTab() {
    openAccountSubTab(currentAccountTab);
}

function refreshCurrentCharTab() {
    openCharSubTab(currentCharTab);
}

async function loadCharacterList(page = 1, clearFilters = false) {
    const tbody = document.getElementById('character-list-table');
    const pgContainer = document.getElementById('character-list-pagination');
    const tableContainer = document.querySelector('#char-characters .scroll-table');
    if (!tbody) return;

    if (clearFilters) {
        if (document.getElementById('filter-char-name')) document.getElementById('filter-char-name').value = '';
        if (document.getElementById('filter-char-account')) document.getElementById('filter-char-account').value = '';
        if (document.getElementById('filter-char-level')) document.getElementById('filter-char-level').value = '';
    }

    tbody.style.opacity = '0.4';
    if (page === 1 && clearFilters) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">로딩 중...</td></tr>';
    }

    try {
        const charName = document.getElementById('filter-char-name')?.value || '';
        const account = document.getElementById('filter-char-account')?.value || '';
        const level = document.getElementById('filter-char-level')?.value || '';

        const params = new URLSearchParams({ page, limit: 20, name: charName, account, level });
        const response = await fetch('/api/characters/list?' + params.toString());
        if (!response.ok) {
            const errText = await response.text();
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px; color:red;">서버 오류: ${errText}</td></tr>`;
            tbody.style.opacity = '1';
            return;
        }
        const data = await response.json();
        const characters = data.characters || [];

        if (!characters || characters.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">캐릭터가 없습니다.</td></tr>';
            tbody.style.opacity = '1';
            renderPagination(pgContainer, data, (p) => loadCharacterList(p));
            return;
        }

        tbody.innerHTML = characters.map(char => `
            <tr>
                <td style="font-weight:700;" class="text-ellipsis">
                    <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background-color:${char.online ? '#10b981' : '#cbd5e1'}; margin-right:8px;"></span>
                    ${char.name}
                </td>
                <td style="text-align:center;">
                    <span class="lvl-badge">Lv.${char.level}</span>
                </td>
                <td style="font-size:0.85rem; color: var(--text-secondary);">
                    ${char.race}/${char.class}
                </td>
                <td style="color:#f59e0b; font-weight:700;">${(char.gold / 10000).toFixed(2)} Gold</td>
                <td style="font-family:monospace; opacity:0.7;">${char.account}</td>
                <td style="text-align:center;">
                    <button onclick="openCharacterItemsModal('${char.name}', ${char.guid})" class="btn-action btn-edit" title="아이템 보기">
                        <i class="fas fa-box-open"></i> 아이템
                    </button>
                </td>
            </tr>
        `).join('');

        renderPagination(pgContainer, data, (p) => loadCharacterList(p));
        tbody.style.opacity = '1';
        if (tableContainer) tableContainer.scrollTop = 0;
    } catch (e) {
        console.error("Failed to load character list", e);
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:red;">캐릭터 목록을 불러오는데 실패했습니다.</td></tr>';
        tbody.style.opacity = '1';
    }
}

function openSendMailTab(characterName) {
    openCharSubTab('sendmail');
    setTimeout(() => {
        const nameInput = document.getElementById('mail-char-name');
        if (nameInput) {
            nameInput.value = characterName;
            nameInput.focus();
        }
    }, 100);
}

async function sendMailToCharacter() {
    const charName = document.getElementById('mail-char-name')?.value.trim();
    const subject = document.getElementById('mail-subject')?.value.trim();
    const body = document.getElementById('mail-body')?.value.trim() || '';
    const itemEntry = document.getElementById('mail-item-entry')?.value || 0;
    const itemCount = document.getElementById('mail-item-count')?.value || 1;
    const gold = document.getElementById('mail-gold')?.value || 0;

    if (!charName) { ModalUtils.showAlert('캐릭터 이름을 입력해주세요.'); return; }
    if (!subject) { ModalUtils.showAlert('메일 제목을 입력해주세요.'); return; }

    try {
        const response = await fetch('/api/characters/sendmail', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                character: charName, subject, body,
                item_entry: parseInt(itemEntry),
                item_count: parseInt(itemCount),
                gold: parseInt(gold)
            })
        });

        const result = await response.json();
        if (response.ok && result.status === 'success') {
            ModalUtils.showAlert(`메일이 ${charName}에게 성공적으로 발송되었습니다!`);
            document.getElementById('mail-char-name').value = '';
            document.getElementById('mail-subject').value = '';
            document.getElementById('mail-body').value = '';
            document.getElementById('mail-item-entry').value = '';
            document.getElementById('mail-item-count').value = '1';
            document.getElementById('mail-gold').value = '0';
        } else {
            ModalUtils.showAlert(`메일 발송 실패: ${result.message || '알 수 없는 오류'}`);
        }
    } catch (e) {
        console.error("Failed to send mail", e);
        ModalUtils.showAlert('메일 발송 중 오류가 발생했습니다.');
    }
}

// Black Market Logs
async function loadBlackMarketLogs(page = 1, clearFilters = false) {
    const tbody = document.getElementById('blackmarket-logs-list');
    const pgContainer = document.getElementById('blackmarket-logs-pagination');
    const tableContainer = document.querySelector('#log-blackmarket .scroll-table');
    if (!tbody) return;

    if (clearFilters) {
        if (document.getElementById('filter-bm-char')) document.getElementById('filter-bm-char').value = '';
        if (document.getElementById('filter-bm-item')) document.getElementById('filter-bm-item').value = '';
    }

    tbody.style.opacity = '0.4';
    if (page === 1 && clearFilters) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">로딩 중...</td></tr>';
    }

    try {
        const character = document.getElementById('filter-bm-char')?.value || '';
        const item = document.getElementById('filter-bm-item')?.value || '';

        const params = new URLSearchParams({
            page: page,
            limit: 20,
            character: character,
            item: item
        });

        const response = await fetch('/api/logs/blackmarket?' + params.toString());
        if (!response.ok) {
            const errText = await response.text();
            ModalUtils.handleError(errText);
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:red;">로그를 불러오는데 실패했습니다.</td></tr>';
            tbody.style.opacity = '1';
            return;
        }
        const data = await response.json();
        const logs = data.logs || [];

        if (!logs || logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">로그가 없습니다.</td></tr>';
            tbody.style.opacity = '1';
            renderPagination(pgContainer, data, (p) => loadBlackMarketLogs(p));
            return;
        }

        tbody.innerHTML = logs.map(log => `
            <tr>
                <td>${log.id}</td>
                <td style="font-weight:700;">${log.character}</td>
                <td>
                    <div id="bm-log-item-${log.id}" class="log-item-container" data-entry="${log.item_entry}">
                        <span class="item-name-placeholder">${log.item}</span>
                    </div>
                </td>
                <td style="color:#f59e0b; font-weight:700;">${log.price.toLocaleString()}g</td>
                <td style="color: var(--text-secondary); font-size:0.85rem;">${log.purchase_date}</td>
            </tr>
        `).join('');

        // Fetch icons and localized names
        logs.forEach(log => {
            if (log.item_entry) {
                fetchItemInfo(log.id, log.item_entry, `bm-log-item-${log.id}`);
            }
        });
        refreshWowheadTooltips();

        renderPagination(pgContainer, data, (p) => loadBlackMarketLogs(p));

        tbody.style.opacity = '1';
        if (tableContainer) tableContainer.scrollTop = 0;
    } catch (e) {
        console.error("Failed to load Black Market logs", e);
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:red;">로그를 불러오는데 실패했습니다.</td></tr>';
        tbody.style.opacity = '1';
    }
}

// Karazhan Enchantment Logs
async function loadKarazhanLogs(page = 1, clearFilters = false) {
    const tbody = document.getElementById('karazhan-logs-list');
    const pgContainer = document.getElementById('karazhan-logs-pagination');
    const tableContainer = document.querySelector('#log-karazhan .scroll-table');
    if (!tbody) return;

    if (clearFilters) {
        if (document.getElementById('filter-kz-char')) document.getElementById('filter-kz-char').value = '';
        if (document.getElementById('filter-kz-item')) document.getElementById('filter-kz-item').value = '';
    }

    tbody.style.opacity = '0.4';
    if (page === 1 && clearFilters) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">로딩 중...</td></tr>';
    }

    try {
        const character = document.getElementById('filter-kz-char')?.value || '';
        const item = document.getElementById('filter-kz-item')?.value || '';

        const params = new URLSearchParams({
            page: page,
            limit: 20,
            character: character,
            item: item
        });

        const response = await fetch('/api/logs/karazhan?' + params.toString());
        if (!response.ok) {
            const errText = await response.text();
            ModalUtils.handleError(errText);
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:red;">로그를 불러오는데 실패했습니다.</td></tr>';
            tbody.style.opacity = '1';
            return;
        }
        const data = await response.json();
        const logs = data.logs || [];

        if (!logs || logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">로그가 없습니다.</td></tr>';
            tbody.style.opacity = '1';
            renderPagination(pgContainer, data, (p) => loadKarazhanLogs(p));
            return;
        }

        tbody.innerHTML = logs.map(log => {
            const isSuccess = log.result === 'Success';
            const statusBg = isSuccess ? '#ecfdf5' : '#fef2f2';
            const statusColor = isSuccess ? '#10b981' : '#ef4444';
            const statusIcon = isSuccess ? 'fa-check-circle' : 'fa-times-circle';

            return `
                <tr>
                    <td>${log.id}</td>
                    <td style="font-weight:700;">${log.character}</td>
                    <td style="font-weight:600;">${log.item}</td>
                    <td style="text-align:center;">
                        <span class="lvl-badge" style="background:#f5f3ff; color:#7c3aed;">+${log.level}</span>
                    </td>
                    <td style="text-align:center;">
                        <span style="display:inline-flex; align-items:center; gap:4px; padding:0.25rem 0.6rem; border-radius:100px; background:${statusBg}; color:${statusColor}; font-weight:700; font-size:0.75rem;">
                            <i class="fas ${statusIcon}"></i> ${log.result.toUpperCase()}
                        </span>
                    </td>
                    <td style="color: var(--text-secondary); font-size:0.85rem;">${log.enhance_date}</td>
                </tr>
            `;
        }).join('');

        renderPagination(pgContainer, data, (p) => loadKarazhanLogs(p));

        tbody.style.opacity = '1';
        if (tableContainer) tableContainer.scrollTop = 0;
    } catch (e) {
        console.error("Failed to load Karazhan logs", e);
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:red;">로그를 불러오는데 실패했습니다.</td></tr>';
        tbody.style.opacity = '1';
    }
}

// Playtime Reward Logs
async function loadPlaytimeLogs(page = 1, clearFilters = false) {
    const tbody = document.getElementById('playtime-logs-list');
    const pgContainer = document.getElementById('playtime-logs-pagination');
    const tableContainer = document.querySelector('#log-playtime .scroll-table');
    if (!tbody) return;

    if (clearFilters) {
        if (document.getElementById('filter-pt-char')) document.getElementById('filter-pt-char').value = '';
        if (document.getElementById('filter-pt-item')) document.getElementById('filter-pt-item').value = '';
    }

    tbody.style.opacity = '0.4';
    if (page === 1 && clearFilters) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">로딩 중...</td></tr>';
    }

    try {
        const character = document.getElementById('filter-pt-char')?.value || '';
        const item = document.getElementById('filter-pt-item')?.value || '';

        const params = new URLSearchParams({
            page: page,
            limit: 20,
            character: character,
            item: item
        });

        const response = await fetch('/api/logs/playtime?' + params.toString());
        if (!response.ok) {
            const errText = await response.text();
            ModalUtils.handleError(errText);
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:red;">로그를 불러오는데 실패했습니다.</td></tr>';
            tbody.style.opacity = '1';
            return;
        }
        const data = await response.json();
        const logs = data.logs || [];

        if (!logs || logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">로그가 없습니다.</td></tr>';
            tbody.style.opacity = '1';
            renderPagination(pgContainer, data, (p) => loadPlaytimeLogs(p));
            return;
        }

        tbody.innerHTML = logs.map(log => `
            <tr>
                <td>${log.id}</td>
                <td style="font-weight:700;">${log.character}</td>
                <td style="font-weight:600;">${log.item}</td>
                <td style="text-align:center;">
                    <span style="display:inline-flex; align-items:center; gap:4px; color:#3b82f6; font-weight:800;">
                        <i class="fas fa-layer-group" style="font-size:0.7rem; opacity:0.5;"></i> ${log.quantity}
                    </span>
                </td>
                <td style="color: var(--text-secondary); font-size:0.85rem;">${log.reward_date}</td>
            </tr>
        `).join('');

        renderPagination(pgContainer, data, (p) => loadPlaytimeLogs(p));

        tbody.style.opacity = '1';
        if (tableContainer) tableContainer.scrollTop = 0;
    } catch (e) {
        console.error("Failed to load Playtime logs", e);
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:red;">로그를 불러오는데 실패했습니다.</td></tr>';
        tbody.style.opacity = '1';
    }
}


// Stats Logic
async function loadStats() {
    try {
        const res = await fetch('/api/stats/summary');
        const data = await res.json();

        document.getElementById('total-accounts').textContent = data.accounts.total || 0;
        document.getElementById('total-chars').textContent = data.characters.total || 0;

        const accList = document.getElementById('stats-accounts-list');
        accList.innerHTML = '';
        (data.accounts.daily_counts || []).forEach(row => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td style="padding:10px; border-bottom:1px solid #eee;">${row.date}</td><td style="padding:10px; border-bottom:1px solid #eee;">${row.count}</td>`;
            accList.appendChild(tr);
        });

        const charList = document.getElementById('stats-chars-list');
        charList.innerHTML = '';
        (data.characters.daily_counts || []).forEach(row => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${row.date}</td><td style="font-weight:700; color: var(--primary-color);">${row.count}</td>`;
            charList.appendChild(tr);
        });

        const recentAccList = document.getElementById('recent-accounts-list');
        recentAccList.innerHTML = '';
        (data.accounts.recent || []).forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td style="font-weight:700;">${item.name}</td><td style="font-size:0.8rem; color: var(--text-secondary);">${item.date}</td>`;
            recentAccList.appendChild(tr);
        });

        const recentCharList = document.getElementById('recent-chars-list');
        recentCharList.innerHTML = '';
        (data.characters.recent || []).forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td style="font-weight:700;">${item.name}</td><td style="font-size:0.8rem; color: var(--text-secondary);">${item.date}</td>`;
            recentCharList.appendChild(tr);
        });

    } catch (e) {
        console.error("Failed to load stats", e);
    }
}

// Schedule Logic
async function loadSchedule(page = 1) {
    const tbody = document.getElementById('schedule-list');
    const pgContainer = document.getElementById('schedule-pagination');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:10px;">Loading...</td></tr>';

    try {
        const res = await fetch(`/api/scheduler/list?page=${page}&limit=20`);
        const data = await res.json();
        const list = data.list || [];

        tbody.innerHTML = '';
        if (list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:10px;">등록된 작업이 없습니다.</td></tr>';
            renderPagination(pgContainer, data, (p) => loadSchedule(p));
            return;
        }

        tbody.innerHTML = list.map(item => {
            const isProcessed = item.processed === 1;
            const statusBg = isProcessed ? '#ecfdf5' : '#fff7ed';
            const statusColor = isProcessed ? '#10b981' : '#f59e0b';
            const statusIcon = isProcessed ? 'fa-check-circle' : 'fa-clock';

            return `
                <tr>
                    <td>${item.no}</td>
                    <td style="font-weight:600;">${item.date}</td>
                    <td style="opacity:0.8;">${item.target}</td>
                    <td style="font-weight:700; color: var(--primary-color);">${item.action}</td>
                    <td>
                        <span style="display:inline-flex; align-items:center; gap:4px; padding:0.2rem 0.6rem; border-radius:100px; background:${statusBg}; color:${statusColor}; font-weight:700; font-size:0.75rem;">
                            <i class="fas ${statusIcon}"></i> ${isProcessed ? '완료됨' : '대기 중'}
                        </span>
                    </td>
                </tr>
            `;
        }).join('');

        renderPagination(pgContainer, data, (p) => loadSchedule(p));
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:10px; color:red;">Error: ${e.message}</td></tr>`;
    }
}

async function addSchedule() {
    const date = document.getElementById('sched-date').value;
    const target = document.getElementById('sched-target').value;
    const action = document.getElementById('sched-action').value;

    if (!date) {
        ModalUtils.showAlert('날짜를 선택해주세요.');
        return;
    }

    const formData = new URLSearchParams();
    formData.append('date', date);
    formData.append('target', target);
    formData.append('action', action);

    try {
        const res = await fetch('/api/scheduler/add', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        if (res.ok && data.status === 'success') {
            ModalUtils.showAlert('점검 예약이 성곡적으로 등록되었습니다.');
            loadSchedule();
        } else if (data.status === 'forbidden') {
            ModalUtils.showAlert(data.message);
        } else {
            ModalUtils.showAlert('작업 등록에 실패했습니다.');
        }
    } catch (e) {
        console.error(e);
        ModalUtils.showAlert('작업 등록 중 오류가 발생했습니다.');
    }
}

// Server Control
async function startServer(target) {
    appendLog(target, '시스템', '서버 가동 명령을 보냅니다...');
    try {
        const res = await fetch(`/api/launcher/start?target=${target}`, { method: 'POST' });
        const data = await res.json();
        if (data.status === 'success') {
            appendLog(target, '시스템', '성공적으로 가동되었습니다.');
            connectLogStream(target);
            updateStatusUI(target, true);
        } else if (data.status === 'forbidden') {
            ModalUtils.showAlert(data.message);
            appendLog(target, '오류', data.message);
        } else {
            appendLog(target, '오류', data.message);
        }
    } catch (e) {
        appendLog(target, '오류', e.message);
    }
}

async function stopServer(target) {
    appendLog(target, '시스템', '서버 중지 명령을 보냅니다...');
    try {
        const res = await fetch(`/api/launcher/stop?target=${target}`, { method: 'POST' });
        const data = await res.json();
        if (data.status === 'success') {
            appendLog(target, '시스템', '성공적으로 중지되었습니다.');
            updateStatusUI(target, false);
            if (eventSources[target]) {
                eventSources[target].close();
                delete eventSources[target];
            }
        } else if (data.status === 'forbidden') {
            ModalUtils.showAlert(data.message);
            appendLog(target, '오류', data.message);
        } else {
            appendLog(target, '오류', data.message);
        }
    } catch (e) {
        appendLog(target, '오류', e.message);
    }
}

async function sendWorldAnnouncement() {
    const input = document.getElementById('announce-text');
    if (!input) return;
    const soapUserEl = document.getElementById('announce-soap-user');
    const soapPassEl = document.getElementById('announce-soap-pass');

    const text = (input.value || '').trim();
    const soapUser = soapUserEl ? (soapUserEl.value || '').trim() : '';
    const soapPass = soapPassEl ? (soapPassEl.value || '') : '';
    if (!text) {
        ModalUtils.showAlert('공지 내용을 입력해주세요.');
        input.focus();
        return;
    }

    try {
        const res = await fetch('/api/launcher/announce', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: text, soapUser: soapUser, soapPass: soapPass })
        });

        const data = await res.json().catch(() => ({}));
        if (res.ok && data.status === 'success') {
            appendLog('world', '시스템', `.an ${text}`);
            ModalUtils.showAlert('인게임 공지가 전송되었습니다.');
            input.value = '';
            loadAnnouncementHistory();
            return;
        }

        if (data && data.message) {
            ModalUtils.showAlert(data.message);
            return;
        }
        ModalUtils.showAlert('공지 전송에 실패했습니다.');
    } catch (e) {
        console.error(e);
        ModalUtils.showAlert('공지 전송 중 오류가 발생했습니다.');
    }
}

function escapeAnnounceHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

async function loadAnnouncementHistory() {
    const tbody = document.getElementById('announce-history-list');
    if (!tbody) return;

    try {
        const res = await fetch('/api/launcher/announce/history?limit=20');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const list = Array.isArray(data.list) ? data.list : [];

        if (list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:var(--text-secondary);">전송 이력이 없습니다.</td></tr>';
            return;
        }

        tbody.innerHTML = list.map(item => `
            <tr class="hover-row announce-history-row" data-message="${escapeAnnounceHtml(item.messageText || '')}" style="cursor:pointer;">
                <td style="white-space:nowrap;">${escapeAnnounceHtml(item.sentAt || '')}</td>
                <td style="font-weight:700;">${escapeAnnounceHtml(item.senderName || item.senderAccount || '')}</td>
                <td class="text-ellipsis">${escapeAnnounceHtml(item.messageText || '')}</td>
            </tr>
        `).join('');

        tbody.querySelectorAll('.announce-history-row').forEach(row => {
            row.addEventListener('click', () => {
                const input = document.getElementById('announce-text');
                if (!input) return;
                input.value = row.getAttribute('data-message') || '';
                input.focus();
            });
        });
    } catch (e) {
        console.error('Failed to load announcement history', e);
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:#ef4444;">전송 이력을 불러오지 못했습니다.</td></tr>';
    }
}



async function checkStatus() {
    try {
        if (!canUseLauncherApis()) return;
        const res = await fetch('/api/launcher/status');
        if (!res.ok) {
            return;
        }
        const data = await res.json();

        updateStatusUI('auth', data.auth);
        updateStatusUI('world', data.world);

        // If running but no stream, connect
        if (data.auth && !eventSources['auth']) {
            connectLogStream('auth');
        }
        if (data.world && !eventSources['world']) {
            connectLogStream('world');
        }

        // Also update online players list
        loadOnlineCount();

    } catch (e) {
        console.error("Status check failed", e);
    }
}

// Load Boards to Sidebar (Stub for now, or implement if needed)
// Note: loadBoardsToSidebar is now fully implemented in board.js.
// We removed the stub from here to avoid naming conflicts and ensuring the correct version is called.

function updateStatusUI(target, isRunning) {
    const badge = document.getElementById(`${target}-status`);
    if (!badge) return; // Guard against missing element on login page

    if (isRunning) {
        badge.textContent = '가동 중';
        badge.className = 'status-badge running';
    } else {
        badge.textContent = '중지됨';
        badge.className = 'status-badge stopped';
    }
}

// Log Streaming via SSE
const eventSources = {};

function connectLogStream(target) {
    if (eventSources[target]) return; // Already connected

    const consoleDiv = document.getElementById(`${target}-log`);
    appendLog(target, '시스템', '로그 스트림에 연결 중...');

    const es = new EventSource(`/api/launcher/logs?target=${target}`);

    es.onmessage = function (event) {
        // Log line received
        const line = event.data;
        const p = document.createElement('div');
        p.className = 'log-line';
        p.textContent = line;
        consoleDiv.appendChild(p);
        consoleDiv.scrollTop = consoleDiv.scrollHeight;
    };

    es.onerror = function () {
        // SSE often disconnects when page hidden or network hiccup.
        // We can try reconnect or just leave it.
        // For now, close and let status check reconnect if needed.
        es.close();
        delete eventSources[target];
    };

    eventSources[target] = es;
}

function appendLog(target, type, msg) {
    const consoleDiv = document.getElementById(`${target}-log`);
    const p = document.createElement('div');
    p.className = 'log-line ' + (type === 'System' ? 'system' : '');
    p.textContent = `[${type}] ${msg}`;
    consoleDiv.appendChild(p);
    consoleDiv.scrollTop = consoleDiv.scrollHeight;
}

// Data Load (Existing)
async function loadRemoteData() {
    const container = document.getElementById('remote-data');
    if (!container) return; // Might not exist in new layout? It does.
    container.innerHTML = '<div class="loading">데이터 로드 중...</div>';

    try {
        const response = await fetch('/api/launcher/latest');
        if (!response.ok) throw new Error('Data load failed');
        const data = await response.json();

        container.innerHTML = '';
        if (Object.keys(data).length === 0) {
            container.innerHTML = '데이터 없음';
            return;
        }

        for (const [key, value] of Object.entries(data)) {
            const div = document.createElement('div');
            div.className = 'data-item';
            div.innerHTML = `
                <div class="data-label">${key}</div>
                <div class="data-value">${value}</div>
            `;
            container.appendChild(div);
        }
    } catch (error) {
        console.error("Failed to load remote data", error);
        container.innerHTML = '<div class="error">데이터 로드 실패</div>';
    }
}

function updateWelcomeMsg(name, points) {
    const welcome = document.getElementById('welcome-msg');
    const text = document.getElementById('welcome-text');
    const iconWrap = document.getElementById('welcome-user-icon');
    if (welcome && text) {
        text.textContent = `${name}님 환영합니다`;
    }
    if (iconWrap) {
        const raceIcon = currentUserMainChar ? getRaceImage(currentUserMainChar.race, currentUserMainChar.gender) : null;
        if (raceIcon) {
            iconWrap.innerHTML = `<img src="${raceIcon}" alt="race" style="width:20px; height:20px; border-radius:50%; object-fit:cover; vertical-align:middle;" onerror="this.outerHTML='<i class=&quot;far fa-user-circle&quot;></i>'">`;
        } else {
            iconWrap.innerHTML = '<i class="far fa-user-circle"></i>';
        }
    }
    
    // Update Desktop Points
    const desktopPoints = document.getElementById('user-points-display-desktop');
    if (desktopPoints) {
        desktopPoints.textContent = points !== undefined ? points.toLocaleString() : '0';
    }

    // Update Mobile Points (if exists)
    const mobilePoints = document.getElementById('user-points-display');
    if (mobilePoints) {
        mobilePoints.textContent = points !== undefined ? points.toLocaleString() : '0';
    }
}

async function loadUserList(page = 1, clearFilters = false) {
    const tbody = document.getElementById('user-list');
    const pgContainer = document.getElementById('permissions-pagination');
    const tableContainer = document.querySelector('#permissions .scroll-table');
    if (!tbody) return;

    if (clearFilters) {
        if (document.getElementById('filter-perm-user')) document.getElementById('filter-perm-user').value = '';
        if (document.getElementById('filter-perm-email')) document.getElementById('filter-perm-email').value = '';
        if (document.getElementById('filter-perm-rank')) document.getElementById('filter-perm-rank').value = '';
    }

    tbody.style.opacity = '0.4';
    if (page === 1 && clearFilters) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">로딩 중...</td></tr>';
    }

    try {
        const username = document.getElementById('filter-perm-user')?.value || '';
        const email = document.getElementById('filter-perm-email')?.value || '';
        const rank = document.getElementById('filter-perm-rank')?.value || '';
        const webrank = document.getElementById('filter-perm-webrank')?.value || '';

        const params = new URLSearchParams({
            page: page,
            limit: 20,
            username: username,
            email: email,
            gmlevel: rank,
            webrank: webrank
        });

        const res = await fetch('/api/admin/users/list?' + params.toString());
        if (!res.ok) throw new Error("Unauthorized");
        const data = await res.json();
        const users = data.users || [];

        if (users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">검색 결과가 없습니다.</td></tr>';
            tbody.style.opacity = '1';
            renderPagination(pgContainer, data, (p) => loadUserList(p));
            return;
        }

        tbody.innerHTML = users.map(user => `
            <tr>
                <td>${user.id}</td>
                <td style="font-weight:700;">${user.username}</td>
                <td style="color: var(--text-secondary); opacity:0.8;">${user.email}</td>
                <td>
                    <select onchange="updateUserRank(${user.id}, this.value, null)" class="input-premium" style="padding:0.4rem; font-size:0.85rem; width:100%;">
                        <option value="0" ${user.gmlevel === 0 ? 'selected' : ''}>일반 (0)</option>
                        <option value="1" ${user.gmlevel === 1 ? 'selected' : ''}>중재자 (1)</option>
                        <option value="2" ${user.gmlevel === 2 ? 'selected' : ''}>GM (2)</option>
                        <option value="3" ${user.gmlevel === 3 ? 'selected' : ''}>관리자 (3)</option>
                    </select>
                </td>
                <td>
                    <select onchange="updateUserRank(${user.id}, null, this.value)" class="input-premium" style="padding:0.4rem; font-size:0.85rem; width:100%;">
                        <option value="0" ${(user.webRank || 0) === 0 ? 'selected' : ''}>일반 (0)</option>
                        <option value="1" ${(user.webRank || 0) === 1 ? 'selected' : ''}>스태프 (1)</option>
                        <option value="2" ${(user.webRank || 0) === 2 ? 'selected' : ''}>최고관리자 (2)</option>
                    </select>
                </td>
                <td style="text-align:center;">
                    <button class="btn-action" onclick="openAccountDetail(${user.id})" style="padding: 4px 8px; font-size: 0.8rem;">상세보기</button>
                </td>
            </tr>
        `).join('');

        renderPagination(pgContainer, data, (p) => loadUserList(p));

        tbody.style.opacity = '1';
        if (tableContainer) tableContainer.scrollTop = 0;
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:red;">오류가 발생했습니다.</td></tr>';
        tbody.style.opacity = '1';
    }
}

function resetUserSearch() {
    if(document.getElementById('filter-perm-user')) document.getElementById('filter-perm-user').value = '';
    if(document.getElementById('filter-perm-email')) document.getElementById('filter-perm-email').value = '';
    if(document.getElementById('filter-perm-rank')) document.getElementById('filter-perm-rank').value = '';
    if(document.getElementById('filter-perm-webrank')) document.getElementById('filter-perm-webrank').value = '';
    loadUserList(1);
}

async function updateUserRank(userId, newRank, newWebRank) {
    const type = newWebRank !== null ? '웹 권한' : '인게임 권한';
    ModalUtils.showConfirm(`사용자(ID: ${userId})의 ${type}을 변경하시겠습니까?`, async () => {
        const formData = new URLSearchParams();
        formData.append('id', userId);
        if (newRank !== null) formData.append('rank', newRank);
        if (newWebRank !== null) formData.append('webRank', newWebRank);

        try {
            const res = await fetch('/api/admin/users/update', {
                method: 'POST',
                body: formData
            });
            if (res.ok) {
                ModalUtils.showAlert(`${type}이 성공적으로 변경되었습니다.`);
                loadUserList(1); 
            } else {
                ModalUtils.showAlert('변경 실패');
            }
        } catch (e) {
            ModalUtils.showAlert('서버 오류');
        }
    });
}

const logoutBtn = document.querySelector('.logout-btn');
if (logoutBtn) logoutBtn.addEventListener('click', logout);

async function loadBanList(accPage = 1, ipPage = 1) {
    try {
        const res = await fetch(`/api/admin/bans/list?accPage=${accPage}&ipPage=${ipPage}`);
        if (!res.ok) throw new Error("Unauthorized");
        const data = await res.json();

        // Account Bans
        const accTbody = document.getElementById('ban-acc-list');
        const accPgContainer = document.getElementById('acc-ban-pagination');
        accTbody.innerHTML = (data.accountBans || []).map(b => `
            <tr>
                <td style="font-weight:700;">${b.username} <span style="opacity:0.5; font-weight:400;">(ID:${b.id})</span></td>
                <td style="color: var(--text-secondary);">${b.reason}</td>
                <td style="font-size:0.85rem; color: var(--text-secondary);">${b.unbandate}</td>
                <td style="text-align:center;">
                    ${b.active ? `<button onclick="removeBan('account', ${b.id})" class="btn-action btn-edit"><i class="fas fa-unlock"></i> 해제</button>` : '<span style="color:#cbd5e1; font-weight:600;"><i class="fas fa-check"></i> 해제됨</span>'}
                </td>
            </tr>
        `).join('');
        renderPagination(accPgContainer, { page: data.accPage, totalPages: data.accTotalPages }, (p) => loadBanList(p, ipPage));

        // IP Bans
        const ipTbody = document.getElementById('ban-ip-list');
        const ipPgContainer = document.getElementById('ip-ban-pagination');
        ipTbody.innerHTML = (data.ipBans || []).map(b => `
            <tr>
                <td style="font-weight:700; font-family:monospace;">${b.ip}</td>
                <td style="color: var(--text-secondary);">${b.reason}</td>
                <td style="font-size:0.85rem; color: var(--text-secondary);">${b.unbandate}</td>
                <td style="text-align:center;">
                    <button onclick="removeBan('ip', '${b.ip}')" class="btn-action btn-edit"><i class="fas fa-unlock"></i> 해제</button>
                </td>
            </tr>
        `).join('');
        renderPagination(ipPgContainer, { page: data.ipPage, totalPages: data.ipTotalPages }, (p) => loadBanList(accPage, p));

    } catch (e) {
        console.error("Failed to load ban list", e);
    }
}

async function addBan(type) {
    let target, value, unit, reason;
    if (type === 'account') {
        target = document.getElementById('ban-acc-id').value;
        value = document.getElementById('ban-acc-duration').value;
        unit = document.getElementById('ban-acc-unit').value;
        reason = document.getElementById('ban-acc-reason').value;
    } else {
        target = document.getElementById('ban-ip-val').value;
        value = document.getElementById('ban-ip-duration').value;
        unit = document.getElementById('ban-ip-unit').value;
        reason = document.getElementById('ban-ip-reason').value;
    }

    if (!target || !value || !reason) {
        ModalUtils.showAlert('모든 항목을 입력해주세요.');
        return;
    }

    const duration = parseInt(value) * parseInt(unit);

    const formData = new URLSearchParams();
    formData.append('type', type);
    formData.append('target', target);
    formData.append('duration', duration);
    formData.append('reason', reason);

    try {
        const res = await fetch('/api/admin/bans/add', {
            method: 'POST',
            body: formData
        });
        if (res.ok) {
            ModalUtils.showAlert('밴이 성공적으로 등록되었습니다.');
            loadBanList();
        } else {
            ModalUtils.showAlert('밴 등록에 실패했습니다.');
        }
    } catch (e) {
        ModalUtils.showAlert('서버 오류가 발생했습니다.');
    }
}

async function removeBan(type, target) {
    ModalUtils.showConfirm(`${type} 밴을 해제하시겠습니까?`, async () => {

        const formData = new URLSearchParams();
        formData.append('type', type);
        formData.append('target', target);

        try {
            const res = await fetch('/api/admin/bans/remove', {
                method: 'POST',
                body: formData
            });
            if (res.ok) {
                ModalUtils.showAlert('밴이 해제되었습니다.');
                loadBanList();
            } else {
                ModalUtils.showAlert('밴 해제에 실패했습니다.');
            }
        } catch (e) {
            ModalUtils.showAlert('서버 오류가 발생했습니다.');
        }
    });
}

async function loadOnlineCount() {
    const listContainer = document.getElementById('character-list');
    const section = document.getElementById('home-characters');
    const countEl = document.getElementById('online-players-count');
    if (!listContainer || !section) return;

    // Keep section visible regardless of transient API/status errors.
    section.style.display = 'block';

    try {
        const res = await fetch('/api/server/online');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const text = await res.text();
        const data = text ? JSON.parse(text) : { onlineCount: 0, onlineCharacters: [] };

        // 1. Update Count
        if (countEl) countEl.textContent = data.onlineCount || 0;

        // 2. Render Online List
        const chars = Array.isArray(data.onlineCharacters) ? data.onlineCharacters : [];
        if (chars.length > 0) {
            const classMap = {
                1: 'warrior', 2: 'paladin', 3: 'hunter', 4: 'rogue', 5: 'priest',
                6: 'deathknight', 7: 'shaman', 8: 'mage', 9: 'warlock', 11: 'druid'
            };
            const raceMap = {
                1: 'human', 2: 'orc', 3: 'dwarf', 4: 'nightelf', 5: 'undead',
                6: 'tauren', 7: 'gnome', 8: 'troll', 10: 'bloodelf', 11: 'draenei'
            };

            listContainer.innerHTML = chars.map(c => {
                const className = classMap[c.class] || 'unknown';
                const raceName = raceMap[c.race] || 'unknown';
                const genderName = c.gender === 0 ? 'male' : 'female';
                const zoneText = Number(c.zone || 0) > 0 ? getZoneName(c.zone) : '알 수 없음';

                const classIcon = getClassImage(c.class) || getClassImage(1);
                const raceIcon = getRaceImage(c.race, c.gender) || `/img/icons/race_${raceName}_${genderName}.gif`;

                // Faction Logic
                const allianceRaces = [1, 3, 4, 7, 11];
                const isAlliance = allianceRaces.includes(c.race);
                const factionIcon = isAlliance ? '/img/icons/faction_alliance.gif' : '/img/icons/faction_horde.gif';
                const factionName = isAlliance ? 'Alliance' : 'Horde';

                return `
                    <tr>
                        <td style="text-align:center;">
                            <img src="${factionIcon}" class="char-icon" title="${factionName}" style="width:20px; height:20px;">
                        </td>
                        <td style="text-align:center;">
                            <img src="${raceIcon}" class="char-icon" title="${getRaceName(c.race)}" onerror="this.src='/img/icons/faction_alliance.gif'">
                        </td>
                        <td style="text-align:center;">
                            <img src="${classIcon}" class="char-icon" title="${getClassName(c.class)}" onerror="this.src='https://warcraft.wiki.gg/wiki/Special:FilePath/ClassIcon_warrior.png'">
                        </td>
                        <td style="text-align:center;">
                            <span class="lvl-badge">Lv.${c.level || 80}</span>
                        </td>
                        <td class="char-name">${c.name}</td>
                        <td class="char-zone">
                            <i class="fas fa-map-marker-alt" style="margin-right: 6px; opacity: 0.5;"></i>
                            ${zoneText}
                        </td>
                    </tr>
                `;
            }).join('');
        } else {
            listContainer.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:var(--text-secondary);">접속중인 유저가 없습니다.</td></tr>';
        }
    } catch (e) { 
        console.error("Online count load failed", e);
        if (countEl) countEl.textContent = '0';
        listContainer.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:#ef4444;">접속자 정보를 불러오지 못했습니다.</td></tr>';
    }
}
window.saveRolePermissions = saveRolePermissions;
window.updateRolePermission = updateRolePermission;

async function loadUserCharacters(page = 1) {
    const listContainer = document.getElementById('character-list');
    const section = document.getElementById('home-characters');
    const pgContainer = document.getElementById('char-pagination');
    if (!listContainer || !section) return;

    try {
        const res = await fetch(`/api/user/characters?page=${page}&limit=20`);
        if (!res.ok) throw new Error("Failed to fetch characters");
        const data = await res.json();
        const chars = data.characters || [];

        section.style.display = 'block';

        if (!chars || chars.length === 0) {
            listContainer.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:#999;">현재 접속 중인 플레이어가 없습니다.</td></tr>';
            renderPagination(pgContainer, data, (p) => loadUserCharacters(p));
            return;
        }

        const classMap = {
            1: 'warrior', 2: 'paladin', 3: 'hunter', 4: 'rogue', 5: 'priest',
            6: 'deathknight', 7: 'shaman', 8: 'mage', 9: 'warlock', 11: 'druid'
        };
        const raceMap = {
            1: 'human', 2: 'orc', 3: 'dwarf', 4: 'nightelf', 5: 'undead',
            6: 'tauren', 7: 'gnome', 8: 'troll', 10: 'bloodelf', 11: 'draenei'
        };

        listContainer.innerHTML = chars.map(c => {
            const className = classMap[c.class] || 'unknown';
            const raceName = raceMap[c.race] || 'unknown';
            const genderName = c.gender === 0 ? 'male' : 'female';

            const classIcon = getClassImage(c.class) || getClassImage(1);
            const raceIcon = getRaceImage(c.race, c.gender) || `/img/icons/race_${raceName}_${genderName}.gif`;

            return `
                <tr>
                    <td style="text-align:center;">
                        <img src="${raceIcon}" class="char-icon" title="${raceName}" onerror="this.src='/img/icons/faction_alliance.gif'">
                    </td>
                    <td style="text-align:center;">
                        <img src="${classIcon}" class="char-icon" title="${className}" onerror="this.src='https://warcraft.wiki.gg/wiki/Special:FilePath/ClassIcon_warrior.png'">
                    </td>
                    <td style="text-align:center;">
                        <span class="lvl-badge">Lv.${c.level}</span>
                    </td>
                    <td class="char-name">${c.name}</td>
                    <td class="char-zone">
                        <i class="fas fa-map-marker-alt" style="margin-right: 6px; opacity: 0.5;"></i>
                        ${getZoneName(c.zone)}
                    </td>
                </tr>
            `;
        }).join('');

        renderPagination(pgContainer, data, (p) => loadUserCharacters(p));

    } catch (e) {
        console.error(e);
        listContainer.innerHTML = '<tr><td colspan="5" class="loading-state" style="text-align:center; padding:20px;">캐릭터 정보를 불러오지 못했습니다.</td></tr>';
    }
}

function resetCharacterSearch() {
    document.getElementById('filter-char-name').value = '';
    document.getElementById('filter-char-account').value = '';
    document.getElementById('filter-char-level').value = '';
    loadCharacterList(1);
}

// Simple Zone ID to Name Mapping (Common areas)
function getZoneName(id) {
    const zones = {
        1: "Dun Morogh", 12: "Elwynn Forest", 14: "Durotar", 141: "Teldrassil", 148: "Darkshore",
        1519: "Stormwind City", 1637: "Orgrimmar", 1657: "Darnassus", 1537: "Ironforge",
        1581: "Ironforge", 11: "Wetlands", 10: "Duskwood", 44: "Redridge Mountains",
        38: "Loch Modan", 40: "Westfall", 17: "The Barrens", 130: "Silverpine Forest",
        85: "Tirisfal Glades", 215: "Mulgore", 210: "Icecrown", 495: "Howling Fjord",
        3537: "Borean Tundra", 65: "Dragonblight", 394: "Grizzly Hills", 401: "Zul'Drak",
        66: "Zul'Drak", 4395: "Dalaran", 3487: "Silvermoon City", 3524: "Azuremyst Isle",
        3525: "Bloodmyst Isle", 3433: "Ghostlands", 3430: "Eversong Woods", 3557: "Exodar",
        405: "Desolace", 400: "Thousand Needles", 406: "Stonetalon Mountains"
    };
    return zones[id] || `Zone ${id}`;
}

// Mail Logs
async function loadMailLogs(page = 1, clearFilters = false) {
    const tbody = document.getElementById('mail-logs-list');
    const pgContainer = document.getElementById('mail-logs-pagination');
    const tableContainer = document.querySelector('#log-mail .scroll-table');
    if (!tbody) return;

    if (clearFilters) {
        if (document.getElementById('filter-mail-sender')) document.getElementById('filter-mail-sender').value = '';
        if (document.getElementById('filter-mail-receiver')) document.getElementById('filter-mail-receiver').value = '';
    }

    tbody.style.opacity = '0.4';
    if (page === 1 && clearFilters) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">로딩 중...</td></tr>';
    }

    try {
        const sender = document.getElementById('filter-mail-sender')?.value || '';
        const receiver = document.getElementById('filter-mail-receiver')?.value || '';

        const params = new URLSearchParams({
            page: page,
            limit: 20,
            sender: sender,
            receiver: receiver
        });

        const response = await fetch('/api/logs/mail?' + params.toString());
        if (!response.ok) {
            const errText = await response.text();
            ModalUtils.handleError(errText);
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:red;">로그를 불러오는데 실패했습니다.</td></tr>';
            tbody.style.opacity = '1';
            return;
        }
        const data = await response.json();
        const logs = data.logs || [];

        if (!logs || logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">로그가 없습니다.</td></tr>';
            tbody.style.opacity = '1';
            renderPagination(pgContainer, data, (p) => loadMailLogs(p));
            return;
        }

        tbody.innerHTML = logs.map(log => `
            <tr>
                <td>${log.id}</td>
                <td style="font-weight:700;">${log.sender}</td>
                <td style="font-weight:700;">${log.receiver}</td>
                <td style="font-weight:600;">${log.subject}</td>
                <td>
                    <div id="mail-log-item-${log.id}" class="log-item-container" data-entry="${log.item_entry}">
                        <div style="display:flex; flex-direction:column; gap:2px;">
                            <span style="font-weight:600;">${log.item}</span>
                            <span style="font-size:0.85rem; color:#f59e0b; font-weight:700;"><i class="fas fa-coins" style="font-size:0.7rem;"></i> ${log.gold.toLocaleString()}g</span>
                        </div>
                    </div>
                </td>
                <td style="color: var(--text-secondary); font-size:0.85rem;">${log.sent_at}</td>
            </tr>
        `).join('');

        // Fetch icons and localized names
        logs.forEach(log => {
            if (log.item_entry) {
                fetchItemInfo(log.id, log.item_entry, `mail-log-item-${log.id}`, true);
            }
        });
        refreshWowheadTooltips();

        renderPagination(pgContainer, data, (p) => loadMailLogs(p));

        tbody.style.opacity = '1';
        if (tableContainer) tableContainer.scrollTop = 0;
    } catch (e) {
        console.error("Failed to load Mail logs", e);
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:red;">로그를 불러오는데 실패했습니다.</td></tr>';
        tbody.style.opacity = '1';
    }
}

function resetMailLogSearch() {
    const sender = document.getElementById('filter-mail-sender');
    const receiver = document.getElementById('filter-mail-receiver');
    if(sender) sender.value = '';
    if(receiver) receiver.value = '';
    loadMailLogs(1);
}

// Content Tab Management
let currentContentTab = 'blackmarket';

function openContentSubTab(tabName) {
    currentContentTab = tabName;
    const buttons = document.querySelectorAll('#content .log-sub-tabs .log-sub-tab-btn');
    buttons.forEach(btn => btn.classList.remove('active'));
    const activeBtn = Array.from(buttons).find(btn => (btn.getAttribute('onclick') || '').includes(`'${tabName}'`));
    if (activeBtn) activeBtn.classList.add('active');

    const contents = document.querySelectorAll('#content .log-sub-content');
    contents.forEach(content => content.classList.remove('active'));

    const targetContent = document.getElementById(`content-${tabName}`);
    if (targetContent) targetContent.classList.add('active');

    if (tabName === 'blackmarket') {
        loadBlackMarketItems(1);
    } else if (tabName === 'carddraw') {
        loadCarddrawContentItems(1);
    }
}

function refreshCurrentContentTab() {
    if (currentContentTab === 'blackmarket') {
        loadBlackMarketItems(1);
    } else if (currentContentTab === 'carddraw') {
        loadCarddrawContentItems(1);
    }
}

// BlackMarket Manager Logic
async function loadBlackMarketItems(page = 1) {
    const tbody = document.getElementById('blackmarket-list');
    const pgContainer = document.getElementById('blackmarket-pagination');
    if (!tbody) return;

    tbody.style.opacity = '0.4';
    if (page === 1) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:20px;">로딩 중...</td></tr>';
    }

    try {
        const res = await fetch(`/api/content/blackmarket/list?page=${page}`);
        if (!res.ok) throw new Error("데이터를 불러오는데 실패했습니다.");
        const data = await res.json();
        const items = data.items || [];

        if (items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:20px;">등록된 물품이 없습니다.</td></tr>';
            renderPagination(pgContainer, data, (p) => loadBlackMarketItems(p));
            tbody.style.opacity = '1';
            return;
        }


        tbody.innerHTML = items.map(item => `
            <tr>
                <td>${item.id}</td>
                <td style="text-align:center;">
                    <div id="bm-icon-${item.id}" class="item-icon-small" data-entry="${item.item_entry}">
                    </div>
                </td>
                <td>${item.item_entry}</td>
                <td style="font-weight:700;">${wrapWithWowheadItemLink(item.item_entry, String(item.name || ''))}</td>
                <td style="color:#f59e0b; font-weight:700;">${item.price_gold.toLocaleString()}g</td>
                <td>${item.weight}</td>
                <td>${item.max_per_spawn}</td>
                <td>
                    <div style="display:flex; gap:8px;">
                        <button onclick="openBlackMarketModal(${item.id}, ${item.item_entry}, ${item.price_gold}, ${item.weight}, ${item.max_per_spawn})" 
                                class="btn-action btn-edit">
                            <i class="fas fa-edit"></i> 수정
                        </button>
                        <button onclick="deleteBlackMarketItem(${item.id})" 
                                class="btn-action btn-delete">
                            <i class="fas fa-trash"></i> 삭제
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');

        // Fetch icons asynchronously
        items.forEach(item => fetchItemIcon(item.id, item.item_entry));
        refreshWowheadTooltips();

        renderPagination(pgContainer, data, (p) => loadBlackMarketItems(p));
        tbody.style.opacity = '1';
    } catch (e) {
        console.error(e);
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:20px; color:red;">Error: ${e.message}</td></tr>`;
        tbody.style.opacity = '1';
    }
}

async function fetchItemIcon(rowId, entry) {
    const container = document.getElementById(`bm-icon-${rowId}`);
    if (!container) return;

    try {
        const response = await fetch(`/api/external/item_icon?entry=${entry}`);
        const data = await response.json();

        if (data && data.url) {
            const iconImg = `<img src="${data.url}" style="width:30px; height:30px; border-radius:2px; vertical-align:middle; cursor:pointer;" onerror="this.style.display='none';">`;
            container.innerHTML = wrapWithWowheadItemLink(entry, iconImg, `아이템 ${entry}`);
            refreshWowheadTooltips();
        }
    } catch (e) {
        console.error('Failed to fetch icon for entry:', entry, e);
    }
}

async function fetchItemInfo(rowId, entry, containerId, includeGold = false) {
    const container = document.getElementById(containerId);
    if (!container) return;

    try {
        const response = await fetch(`/api/content/item/search?q=${entry}`);
        const data = await response.json();
        const items = data.items || [];
        const item = items.find(i => i.entry == entry);

        if (item) {
            const iconUrl = item.icon_url || '/static/img/default_icon.png';
            const goldInfo = includeGold ? container.querySelector('span:last-child')?.outerHTML || '' : '';
            const linkedName = wrapWithWowheadItemLink(entry, `<span style="font-weight:600; color:var(--primary-color);">${item.name}</span>`, item.name || `아이템 ${entry}`);
            const itemHtml = `
                <div style="display:flex; align-items:center; gap:10px;">
                    <img src="${iconUrl}" style="width:24px; height:24px; border-radius:4px; border:1px solid #ddd;" onerror="this.src='/static/img/default_icon.png'">
                    <div style="display:flex; flex-direction:column;">
                        ${linkedName}
                        ${goldInfo}
                    </div>
                </div>
            `;
            container.innerHTML = wrapWithWowheadItemLink(entry, itemHtml, item.name || `아이템 ${entry}`);
            refreshWowheadTooltips();
        }
    } catch (e) {
        console.error('Failed to fetch item info:', entry, e);
    }
}

function openBlackMarketModal(id = null, entry = '', price = 0, weight = 100, spawn = 1) {
    const modal = document.getElementById('blackmarket-modal');
    const title = document.getElementById('bm-modal-title');

    if (id) {
        title.innerText = '암시장 물품 수정';
        document.getElementById('bm-id').value = id;
        document.getElementById('bm-entry').value = entry;
        document.getElementById('bm-price').value = price;
        document.getElementById('bm-weight').value = weight;
        document.getElementById('bm-spawn').value = spawn;
    } else {
        title.innerText = '암시장 물품 추가';
        document.getElementById('bm-form').reset();
        document.getElementById('bm-id').value = '';
        document.getElementById('bm-price').value = 0;
        document.getElementById('bm-weight').value = 100;
        document.getElementById('bm-spawn').value = 1;
    }
    modal.style.display = 'flex';
}

function closeBlackMarketModal() {
    document.getElementById('blackmarket-modal').style.display = 'none';
}

async function deleteBlackMarketItem(id) {
    ModalUtils.showConfirm('정말로 이 물품을 삭제하시겠습니까?', async () => {
        try {
            const formData = new URLSearchParams();
            formData.append('id', id);
            const res = await fetch('/api/content/blackmarket/delete', { method: 'POST', body: formData });
            if (res.ok) {
                ModalUtils.showAlert('성공적으로 삭제되었습니다.');
                loadBlackMarketItems(1);
            } else {
                ModalUtils.showAlert('삭제에 실패했습니다.');
            }
        } catch (e) {
            ModalUtils.showAlert('삭제 중 오류가 발생했습니다.');
        }
    });
}

document.getElementById('bm-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('bm-id').value;
    const entry = document.getElementById('bm-entry').value;
    const price = document.getElementById('bm-price').value;
    const weight = document.getElementById('bm-weight').value;
    const spawn = document.getElementById('bm-spawn').value;

    const formData = new FormData();
    formData.append('item_entry', entry);
    formData.append('price_gold', price);
    formData.append('weight', weight);
    formData.append('max_per_spawn', spawn);

    let url = '/api/content/blackmarket/add';
    if (id) {
        url = '/api/content/blackmarket/update';
        formData.append('id', id);
    }

    try {
        const res = await fetch(url, { method: 'POST', body: formData });
        if (res.ok) {
            ModalUtils.showAlert('저장되었습니다.');
            closeBlackMarketModal();
            loadBlackMarketItems(1);
        } else {
            ModalUtils.showAlert('저장에 실패했습니다.');
        }
    } catch (e) {
        ModalUtils.showAlert('저장 중 오류가 발생했습니다.');
    }
});

// Carddraw Content Manager Logic
let currentCarddrawContentPage = 1;

function getCarddrawRarityLabel(code) {
    switch (String(code || '').toLowerCase()) {
        case 'common': return '일반';
        case 'uncommon': return '희귀';
        case 'rare': return '레어';
        case 'legendary': return '전설';
        default: return '일반';
    }
}

function getCarddrawRarityClass(code) {
    switch (String(code || '').toLowerCase()) {
        case 'uncommon': return 'rarity-uncommon';
        case 'rare': return 'rarity-rare';
        case 'legendary': return 'rarity-legendary';
        default: return 'rarity-common';
    }
}

function renderCarddrawIcon(iconName, itemEntry, containerId) {
    const icon = String(iconName || '').trim();
    const entry = Number(itemEntry || 0);
    let src = '';
    if (icon) {
        const lower = icon.toLowerCase();
        if (lower.startsWith('http://') || lower.startsWith('https://') || icon.startsWith('/')) {
            src = icon;
        } else {
            src = `https://wow.zamimg.com/images/wow/icons/large/${lower}.jpg`;
        }
    }
    return `
        <div id="${containerId}" style="width:30px; height:30px; display:inline-flex; align-items:center; justify-content:center;">
            ${src
                ? `<img src="${src}" alt="item-${entry}" style="width:30px; height:30px; border-radius:3px; border:1px solid #cbd5e1; object-fit:cover;" onerror="this.remove()">`
                : '<span style="color:#94a3b8;">-</span>'}
        </div>
    `;
}

async function loadCarddrawIconByEntry(entry, containerId) {
    const itemEntry = Number(entry || 0);
    const container = document.getElementById(containerId);
    if (!container || itemEntry <= 0) return;
    if (container.querySelector('img')) return;
    try {
        const res = await fetch(`/api/external/item_icon?entry=${itemEntry}`);
        if (!res.ok) return;
        const data = await res.json().catch(() => ({}));
        const url = String(data && data.url ? data.url : '').trim();
        if (!url) return;
        container.innerHTML = `<img src="${url}" alt="item-${itemEntry}" style="width:30px; height:30px; border-radius:3px; border:1px solid #cbd5e1; object-fit:cover;" onerror="this.remove()">`;
    } catch (_) {
        // keep fallback
    }
}

async function loadCarddrawContentItems(page = 1) {
    currentCarddrawContentPage = page;
    const tbody = document.getElementById('carddraw-content-list');
    const pgContainer = document.getElementById('carddraw-content-pagination');
    if (!tbody) return;

    const q = ((document.getElementById('carddraw-filter-q') || {}).value || '').trim();
    const rarity = ((document.getElementById('carddraw-filter-rarity') || {}).value || '').trim();
    const active = ((document.getElementById('carddraw-filter-active') || {}).value || '').trim();
    const params = new URLSearchParams();
    params.set('page', String(page));
    if (q) params.set('q', q);
    if (rarity) params.set('rarity', rarity);
    if (active === '0' || active === '1') params.set('active', active);

    tbody.style.opacity = '0.4';
    if (page === 1) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:20px;">로딩 중...</td></tr>';
    }

    try {
        const res = await fetch(`/api/content/carddraw/list?${params.toString()}`);
        if (!res.ok) throw new Error('데이터를 불러오는데 실패했습니다.');
        const data = await res.json();
        const items = data.items || [];

        if (!items.length) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:20px;">등록된 품목이 없습니다.</td></tr>';
            renderPagination(pgContainer, data, (p) => loadCarddrawContentItems(p));
            tbody.style.opacity = '1';
            return;
        }

        const pageSize = 20;
        const totalCount = Number(data.total || 0);
        const startIndex = (Number(data.page || page) - 1) * pageSize;

        tbody.innerHTML = items.map((item, idx) => {
            const iconId = `carddraw-content-icon-${Number(item.id || 0)}`;
            return `
            <tr>
                <td>${Math.max(1, totalCount - (startIndex + idx))}</td>
                <td>${item.item_entry}</td>
                <td style="text-align:center;">${renderCarddrawIcon(item.icon, item.item_entry, iconId)}</td>
                <td style="font-weight:700;">${wrapWithWowheadItemLink(item.item_entry, String(item.item_name || ''))}</td>
                <td>
                    <span class="badge ${getCarddrawRarityClass(item.rarity)}">${getCarddrawRarityLabel(item.rarity)}</span>
                </td>
                <td>${Number(item.chance_percent || 0).toFixed(2)}%</td>
                <td>${Number(item.max_count || 1).toLocaleString()}</td>
                <td>${Number(item.is_active) === 1 ? '<span style="color:#16a34a; font-weight:700;">활성</span>' : '<span style="color:#64748b;">비활성</span>'}</td>
                <td>
                    <div style="display:flex; gap:8px; justify-content:center;">
                        <button onclick="openCarddrawContentModal(${Number(item.id)}, ${Number(item.item_entry)}, '${String(item.rarity || 'common')}', ${Number(item.chance_percent || 0)}, ${Number(item.max_count || 1)}, ${Number(item.is_active || 0)}, decodeURIComponent('${encodeURIComponent(String(item.item_name || ''))}'))" class="btn-action btn-edit"><i class="fas fa-edit"></i> 수정</button>
                        <button onclick="deleteCarddrawContentItem(${Number(item.id)})" class="btn-action btn-delete"><i class="fas fa-trash"></i> 삭제</button>
                    </div>
                </td>
            </tr>
        `;
        }).join('');
        items.forEach((item) => {
            const iconId = `carddraw-content-icon-${Number(item.id || 0)}`;
            loadCarddrawIconByEntry(item.item_entry, iconId);
        });
        refreshWowheadTooltips();
        renderPagination(pgContainer, data, (p) => loadCarddrawContentItems(p));
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:20px; color:red;">${e.message}</td></tr>`;
    } finally {
        tbody.style.opacity = '1';
    }
}

function searchCarddrawContentItems() {
    loadCarddrawContentItems(1);
}

function resetCarddrawContentFilters() {
    const qEl = document.getElementById('carddraw-filter-q');
    const rarityEl = document.getElementById('carddraw-filter-rarity');
    const activeEl = document.getElementById('carddraw-filter-active');
    if (qEl) qEl.value = '';
    if (rarityEl) rarityEl.value = '';
    if (activeEl) activeEl.value = '';
    loadCarddrawContentItems(1);
}

function openCarddrawContentModal(id = null, itemEntry = '', rarity = 'common', chancePercent = 1, maxCount = 1, isActive = 1, itemName = '') {
    const modal = document.getElementById('carddraw-content-modal');
    if (!modal) return;
    const titleEl = document.getElementById('carddraw-content-modal-title');
    const idEl = document.getElementById('carddraw-content-id');
    const entryEl = document.getElementById('carddraw-content-entry');
    const nameEl = document.getElementById('carddraw-content-name');
    const rarityEl = document.getElementById('carddraw-content-rarity');
    const chanceEl = document.getElementById('carddraw-content-chance');
    const maxCountEl = document.getElementById('carddraw-content-max-count');
    const activeEl = document.getElementById('carddraw-content-active');

    if (id) {
        if (titleEl) titleEl.textContent = '카드뽑기 품목 수정';
        if (idEl) idEl.value = String(id);
        if (entryEl) entryEl.value = String(itemEntry || '');
        if (nameEl) nameEl.value = String(itemName || '');
        if (rarityEl) rarityEl.value = String(rarity || 'common');
        if (chanceEl) chanceEl.value = String(Number(chancePercent || 0).toFixed(2));
        if (maxCountEl) maxCountEl.value = String(maxCount || 1);
        if (activeEl) activeEl.value = Number(isActive) === 1 ? '1' : '0';
    } else {
        if (titleEl) titleEl.textContent = '카드뽑기 품목 추가';
        document.getElementById('carddraw-content-form')?.reset();
        if (idEl) idEl.value = '';
        if (nameEl) nameEl.value = '';
        if (rarityEl) rarityEl.value = 'common';
        if (chanceEl) chanceEl.value = '1.00';
        if (maxCountEl) maxCountEl.value = '1';
        if (activeEl) activeEl.value = '1';
    }
    modal.style.display = 'flex';
}

function closeCarddrawContentModal() {
    const modal = document.getElementById('carddraw-content-modal');
    if (modal) modal.style.display = 'none';
}

async function deleteCarddrawContentItem(id) {
    ModalUtils.showConfirm('정말로 이 품목을 삭제하시겠습니까?', async () => {
        try {
            const formData = new URLSearchParams();
            formData.append('id', String(id));
            const res = await fetch('/api/content/carddraw/delete', { method: 'POST', body: formData });
            if (!res.ok) throw new Error();
            ModalUtils.showAlert('삭제되었습니다.');
            loadCarddrawContentItems(currentCarddrawContentPage || 1);
        } catch (_) {
            ModalUtils.showAlert('삭제에 실패했습니다.');
        }
    });
}

document.getElementById('carddraw-content-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = ((document.getElementById('carddraw-content-id') || {}).value || '').trim();
    const itemEntry = ((document.getElementById('carddraw-content-entry') || {}).value || '').trim();
    const itemName = ((document.getElementById('carddraw-content-name') || {}).value || '').trim();
    const rarity = ((document.getElementById('carddraw-content-rarity') || {}).value || 'common').trim();
    const chancePercent = ((document.getElementById('carddraw-content-chance') || {}).value || '1').trim();
    const maxCount = ((document.getElementById('carddraw-content-max-count') || {}).value || '1').trim();
    const isActive = ((document.getElementById('carddraw-content-active') || {}).value || '1').trim();

    const formData = new URLSearchParams();
    formData.append('item_entry', itemEntry);
    formData.append('item_name', itemName);
    formData.append('rarity', rarity);
    formData.append('chance_percent', chancePercent);
    formData.append('max_count', maxCount);
    formData.append('is_active', isActive);
    if (id) formData.append('id', id);

    const url = id ? '/api/content/carddraw/update' : '/api/content/carddraw/add';
    try {
        const res = await fetch(url, { method: 'POST', body: formData });
        if (!res.ok) throw new Error();
        ModalUtils.showAlert('저장되었습니다.');
        closeCarddrawContentModal();
        loadCarddrawContentItems(1);
    } catch (_) {
        ModalUtils.showAlert('저장에 실패했습니다.');
    }
});

// Main Character System
function showMainCharModal(force = false) {
    const modal = document.getElementById('main-char-modal');
    const closeBtn = document.getElementById('btn-close-char-modal');
    if (!modal) return;

    modal.style.display = 'flex';
    
    // If forced (first login without main char), hide close button
    if (force) {
        if(closeBtn) closeBtn.style.display = 'none';
        // Prevent closing by clicking outside
        modal.onclick = null;
    } else {
        if(closeBtn) closeBtn.style.display = 'inline-block';
        // Close on click outside
        modal.onclick = (e) => {
            if (e.target === modal) closeMainCharModal();
        };
    }

    loadUserCharactersForSelection();
}

async function loadMyPage() {
    try {
        // 1. Get User Status (Account Info)
        const response = await fetch('/api/user/status');
        if (response.ok) {
            const data = await response.json();
            g_sessionUser = data;
            window.g_sessionUser = data;
             
            // Update Text Fields
            if (data.points !== undefined) {
                // Update both mobile and desktop points displays
                const pointDisplays = document.querySelectorAll('#user-points-display');
                pointDisplays.forEach(el => el.textContent = data.points.toLocaleString());
            }

            // Set global main character state
            currentUserMainChar = data.mainCharacter;
            const headerDisplayName = (data.mainCharacter && Number(data.mainCharacter.guid || 0) > 0 && data.mainCharacter.name)
                ? data.mainCharacter.name
                : (data.username || '');
            updateWelcomeMsg(headerDisplayName, data.points, data.enhancedStoneActive === true);
            if (data.username) {
                const mypageUser = document.getElementById('mypage-username');
                if (mypageUser) mypageUser.textContent = data.username;
            }
            if(document.getElementById('mypage-email')) document.getElementById('mypage-email').textContent = data.email || '이메일 없음';
            
            // GM Badge
            const gmBadge = document.getElementById('mypage-gm-badge');
            if(gmBadge) gmBadge.style.display = (data.gmLevel > 0) ? 'inline-block' : 'none';
            const secondBadge = document.getElementById('mypage-second-account-badge');
            if (secondBadge) secondBadge.style.display = data.isSecondAccountUser ? 'inline-block' : 'none';
            const enhancedStoneBadge = document.getElementById('mypage-enhanced-stone-badge');
            if (enhancedStoneBadge) {
                const active = data.enhancedStoneActive === true;
                enhancedStoneBadge.style.display = active ? 'inline-block' : 'none';
                enhancedStoneBadge.title = active && data.enhancedStoneExpiresAt
                    ? `유효기간: ${data.enhancedStoneExpiresAt}`
                    : '';
            }
            renderEnhancedStoneStatusPanel(data);

            try {
                const subRes = await fetch('/api/shop/subscription/status?code=enhanced_enchant_stone');
                if (subRes.ok) {
                    const sub = await subRes.json();
                    if (sub && sub.status === 'success') {
                        data.enhancedStoneSubscribed = sub.subscribed === true;
                        data.enhancedStoneActive = sub.active === true;
                        data.enhancedStoneStartedAt = sub.startedAt || '';
                        data.enhancedStoneExpiresAt = sub.expiresAt || '';
                        data.enhancedStoneRemainingDays = Number(sub.remainingDays || 0);
                        data.enhancedStoneProgressPercent = Number(sub.progressPercent || 0);
                        if (enhancedStoneBadge) {
                            enhancedStoneBadge.style.display = data.enhancedStoneActive ? 'inline-block' : 'none';
                            enhancedStoneBadge.title = data.enhancedStoneActive && data.enhancedStoneExpiresAt
                                ? `유효기간: ${data.enhancedStoneExpiresAt}`
                                : '';
                        }
                        updateWelcomeMsg(headerDisplayName, data.points, data.enhancedStoneActive === true);
                        renderEnhancedStoneStatusPanel(data);
                    }
                }
            } catch (e) {
                // ignore fallback API errors
            }

            // Main Character Status
            const mainCharText = document.getElementById('mypage-main-char');
            const avatarDiv = document.getElementById('mypage-avatar');
            
            if(mainCharText && data.mainCharacter) {
                const char = data.mainCharacter;
                const raceName = getRaceName(char.race);
                const className = getClassName(char.class);
                const enhancedIcon = data.enhancedStoneActive === true
                    ? `<i class="fas fa-gem" title="빛나는 영웅석 구독" style="color:#7c3aed; font-size:0.95em; margin-right:4px;"></i>`
                    : '';
                
                mainCharText.innerHTML = `${enhancedIcon}<span style="color:#eab308; font-weight:bold;">Lv.${char.level}</span> ${raceName} ${className} <span style="color:#10b981; font-weight:bold;">${char.name}</span>`;
                
                // Update Points in Header
                if (data.points !== undefined) {
                    const pointsDisplay = document.getElementById('user-points-display');
                    if (pointsDisplay) pointsDisplay.textContent = data.points.toLocaleString();
                }

                // Update Avatar
                if(avatarDiv) {
                    const raceIcon = getRaceImage(char.race, char.gender);
                    if(raceIcon) {
                        avatarDiv.innerHTML = `<img src="${raceIcon}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;" onerror="this.src='/img/icons/faction_alliance.gif'">`;
                    }
                }
            } else if(mainCharText) {
                mainCharText.textContent = '대표 캐릭터 미설정';
                mainCharText.style.color = '#ef4444'; // Red
            }
        }
    } catch (e) {
        console.error("Failed to load user status for My Page", e);
    }

    // 2. Load Character List
    loadUserCharactersForSelection('mypage-char-list');

    // 3. Load Point History
    loadPointHistory(1);
    // 4. Load Shop Orders in MyPage tab
    if (typeof loadShopMyOrders === 'function') {
        loadShopMyOrders('mypage-shop-orders-body');
    }
}

function renderEnhancedStoneStatusPanel(data) {
    const panel = document.getElementById('mypage-enhanced-stone-panel');
    const periodEl = document.getElementById('mypage-enhanced-stone-period');
    const progressBar = document.getElementById('mypage-enhanced-stone-progress-bar');
    const progressText = document.getElementById('mypage-enhanced-stone-progress-text');
    if (!panel || !periodEl || !progressBar || !progressText) return;

    const active = data && data.enhancedStoneActive === true;
    if (!active) {
        panel.style.display = 'none';
        return;
    }

    const startedAt = data.enhancedStoneStartedAt || '-';
    const expiresAt = data.enhancedStoneExpiresAt || '-';
    const remainDays = Math.max(0, Number(data.enhancedStoneRemainingDays || 0));
    const percent = Math.max(1, Math.min(100, Number(data.enhancedStoneProgressPercent || 0)));

    panel.style.display = 'block';
    progressBar.style.width = `${percent}%`;
    progressText.textContent = `${percent}%`;
    periodEl.textContent = `유효기간: ${startedAt} ~ ${expiresAt} (남은 ${remainDays}일)`;
}

function showEnhancedStoneExpiryWarning(data) {
    const active = data && data.enhancedStoneActive === true;
    const remainDays = Number(data && data.enhancedStoneRemainingDays ? data.enhancedStoneRemainingDays : 0);
    const expiresAt = String((data && data.enhancedStoneExpiresAt) || '');
    if (!active || remainDays <= 0 || remainDays > 7 || !expiresAt) return;

    const shownKey = `enhancedStoneExpiryWarn:${expiresAt}`;
    if (sessionStorage.getItem(shownKey) === '1') return;
    sessionStorage.setItem(shownKey, '1');

    const msg = `빛나는 영웅석 유효기간이 ${remainDays}일 남았습니다.\n만료 예정일: ${expiresAt}`;
    ModalUtils.showAlert(msg, '유효기간 안내');
}

function openMyPageSubTab(tabName) {
    const pointsBtn = document.getElementById('mypage-sub-btn-points');
    const ordersBtn = document.getElementById('mypage-sub-btn-orders');
    const pointsPanel = document.getElementById('mypage-sub-points');
    const ordersPanel = document.getElementById('mypage-sub-orders');

    if (pointsBtn) pointsBtn.classList.remove('active');
    if (ordersBtn) ordersBtn.classList.remove('active');
    if (pointsPanel) pointsPanel.style.display = 'none';
    if (ordersPanel) ordersPanel.style.display = 'none';

    if (tabName === 'orders') {
        if (ordersBtn) ordersBtn.classList.add('active');
        if (ordersPanel) ordersPanel.style.display = 'block';
        if (typeof loadShopMyOrders === 'function') {
            loadShopMyOrders('mypage-shop-orders-body');
        }
        return;
    }

    if (pointsBtn) pointsBtn.classList.add('active');
    if (pointsPanel) pointsPanel.style.display = 'block';
}

// Helper Functions for Icons
function getRaceImage(race, gender) {
    // Use only Charactercreate-races_* files from gallery entries sized 130 × 130.
    const raceSlugMap = {
        1: 'human',
        2: 'orc',
        3: 'dwarf',
        4: 'nightelf',
        5: 'undead',
        6: 'tauren',
        7: 'gnome',
        8: 'troll',
        10: 'bloodelf',
        11: 'draenei'
    };
    const slug = raceSlugMap[Number(race)];
    if (!slug) return null;
    const genderPart = Number(gender) === 0 ? 'male' : 'female';
    const fileName = `Charactercreate-races_${slug}-${genderPart}.png`;
    return `https://warcraft.wiki.gg/wiki/Special:FilePath/${encodeURIComponent(fileName)}`;
}

function getRaceName(race) {
    const races = {
        1: '휴먼', 2: '오크', 3: '드워프', 4: '나이트엘프', 5: '언데드', 6: '타우렌', 7: '노움', 8: '트롤', 10: '블러드엘프', 11: '드레나이'
    };
    return races[race] || '알수없음';
}

function getClassImage(cls) {
    // Use only 100x100 class icons from:
    // https://warcraft.wiki.gg/wiki/Category:Class_icons
    const classFileMap = {
        1: 'ClassIcon_warrior.png',
        2: 'ClassIcon_paladin.png',
        3: 'ClassIcon_hunter.png',
        4: 'ClassIcon_rogue.png',
        5: 'ClassIcon_priest.png',
        6: 'ClassIcon_deathknight.png',
        7: 'ClassIcon_shaman.png',
        8: 'ClassIcon_mage.png',
        9: 'ClassIcon_warlock.png',
        11: 'ClassIcon_druid.png'
    };
    const fileName = classFileMap[Number(cls)];
    if (!fileName) return null;
    return `https://warcraft.wiki.gg/wiki/Special:FilePath/${encodeURIComponent(fileName)}`;
}

function getZoneName(mapId) {
    // Basic Zone Map (Expand as needed)
    const zones = {
        0: '동부 왕국', 1: '칼림도어', 530: '아웃랜드', 571: '노스렌드',
        1519: '스톰윈드', 1637: '오그리마', 1537: '아이언포지', 1638: '썬더블러프',
        1657: '다르나서스', 1497: '언더시티', 3487: '실버문', 3557: '엑소다르',
        4395: '달라란', 
    };
    return zones[mapId] || `Map ${mapId}`;
}

function getClassName(cls) {
    const classes = {
        1: '전사', 2: '성기사', 3: '사냥꾼', 4: '도적', 5: '사제', 6: '죽음의기사', 7: '주술사', 8: '마법사', 9: '흑마법사', 11: '드루이드'
    };
    return classes[cls] || '알수없음';
}

function closeMainCharModal() {
    const modal = document.getElementById('main-char-modal');
    if (modal) modal.style.display = 'none';
}

async function loadUserCharactersForSelection(targetId = 'char-list-container') {
    const container = document.getElementById(targetId);
    if (!container) return;
    const isMyPageList = targetId === 'mypage-char-list';

    container.innerHTML = '<div style="padding:20px; text-align:center;">로딩 중...</div>';

    try {
        const response = await fetch('/api/user/characters');
        if (!response.ok) throw new Error('Failed to load characters');
        const chars = await response.json();

        if (!chars || !Array.isArray(chars) || chars.length === 0) {
            container.innerHTML = '<div style="padding:20px; text-align:center;">캐릭터가 없습니다.<br>게임 내에서 캐릭터를 생성해주세요.</div>';
            return;
        }

        // Setup Class/Race maps if not available globally (reusing logic from loadUserCharacters)
        const classMap = {
            1: 'warrior', 2: 'paladin', 3: 'hunter', 4: 'rogue', 5: 'priest',
            6: 'deathknight', 7: 'shaman', 8: 'mage', 9: 'warlock', 11: 'druid'
        };
        const raceMap = {
            1: 'human', 2: 'orc', 3: 'dwarf', 4: 'nightelf', 5: 'undead',
            6: 'tauren', 7: 'gnome', 8: 'troll', 10: 'bloodelf', 11: 'draenei'
        };

        let html = '<div class="char-select-grid">';
        chars.forEach(c => {
            const className = classMap[c.class] || 'unknown';
            const raceName = raceMap[c.race] || 'unknown';
            const genderName = c.gender === 0 ? 'male' : 'female';
            const classKo = getClassName(c.class);
            const raceKo = getRaceName(c.race);

            // Determine Race Icon (Warcraft Wiki)
            const raceIcon = getRaceImage(c.race, c.gender) || `/img/icons/race_${raceName}_${genderName}.gif`;
            
            // Determine Class Icon (100x100 class icon set)
            const classIcon = getClassImage(c.class) || getClassImage(1);
            const isSelected = currentUserMainChar && currentUserMainChar.guid === c.guid;
            const activeClass = isSelected ? 'active' : '';
            if (isMyPageList) {
                html += `
                    <div class="rpg-char-card ${activeClass} mypage-class-focus mypage-wireframe" onclick="setMainCharacter(${c.guid}, '${c.name}')">
                        <div class="mypage-wireframe-row">
                            <div class="mypage-emblem-race">
                                <img src="${raceIcon}" alt="${raceKo}" onerror="this.src='/img/icons/race_${raceName}_${genderName}.gif'">
                            </div>
                            <div class="mypage-wireframe-meta">
                                <div class="mypage-wireframe-meta-top">
                                    <div class="mypage-emblem-class">
                                        <img src="${classIcon}" alt="${classKo}" onerror="this.style.display='none'">
                                    </div>
                                    <div class="mypage-wireframe-level">
                                        <b>Lv.${c.level}</b>
                                    </div>
                                </div>
                                <div class="mypage-wireframe-name">${c.name}</div>
                            </div>
                        </div>
                        <i class="fas fa-check-circle rpg-check-icon"></i>
                    </div>
                `;
            } else {
                html += `
                    <div class="rpg-char-card ${activeClass}" onclick="setMainCharacter(${c.guid}, '${c.name}')">
                        <img src="${classIcon}" class="rpg-class-bg" onerror="this.style.display='none'">
                        
                        <div class="rpg-card-content">
                            <div class="rpg-avatar-frame">
                                <img src="${raceIcon}" class="rpg-avatar-img" onerror="this.src='/img/icons/race_${raceName}_${genderName}.gif'">
                            </div>
                            <div class="rpg-card-info">
                                <div class="rpg-char-name">
                                    <span class="rpg-level-badge">Lv.${c.level}</span> ${c.name}
                                </div>
                                <div class="rpg-char-desc">
                                    ${raceKo} ${classKo}
                                </div>
                            </div>
                            <i class="fas fa-check-circle rpg-check-icon"></i>
                        </div>

                        <div class="rpg-card-footer">
                            <span><i class="fas fa-map-marker-alt"></i> ${getZoneName(c.map || 0).substring(0, 15)}</span>
                            ${c.zone ? `<span>Zone ${c.zone}</span>` : ''} 
                        </div>
                    </div>
                `;
            }
        });
        html += '</div>';
        container.innerHTML = html;

    } catch (e) {
        console.error(e);
        container.innerHTML = `<div style="padding:20px; text-align:center; color:red;">목록 로드 실패: ${e.message}</div>`;
    }
}

async function setMainCharacter(guid, name) {
    ModalUtils.showConfirm(`'${name}' 캐릭터를 대표 캐릭터로 설정하시겠습니까?`, async () => {

    try {
        const response = await fetch('/api/user/main_character', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ guid: guid, name: name })
        });

        if (response.ok) {
            ModalUtils.showAlert('대표 캐릭터가 설정되었습니다.');
            currentUserMainChar = { guid: guid, name: name };
            updateWelcomeMsg(name, g_sessionUser ? g_sessionUser.points : undefined); // Immediate UI update
            closeMainCharModal();
            
            // Refresh lists to show new selection
            if(document.getElementById('char-list-container')) loadUserCharactersForSelection('char-list-container');
            if(document.getElementById('mypage-char-list')) loadUserCharactersForSelection('mypage-char-list');
        } else {
            ModalUtils.showAlert('설정 실패: 서버 오류');
        }
    } catch (e) {
        console.error(e);
        ModalUtils.showAlert('설정 중 오류가 발생했습니다.');
    }
    });
}

function applySubscriptionMenuState(userStatus) {
    const isSubscriber = !!(userStatus && userStatus.enhancedStoneActive === true);
    window.g_isSubscriberUser = isSubscriber;

    const subscriberSeparator = document.getElementById('subscriber-separator');
    const subscriberPlaceholder = document.getElementById('subscriber-menu-placeholder');

    if (subscriberSeparator) {
        subscriberSeparator.style.display = isSubscriber ? 'block' : 'none';
    }
    if (subscriberPlaceholder) {
        subscriberPlaceholder.style.display = isSubscriber ? 'flex' : 'none';
    }

    if (document && document.body) {
        document.body.classList.toggle('subscriber-user', isSubscriber);
        document.body.classList.toggle('normal-user', !isSubscriber);
    }
}

async function checkAdminAccess() {
    try {
        const response = await fetch('/api/user/status');
        if (response.status === 401) {
            location.href = '/';
            return;
        }

        const data = await response.json();
        g_sessionUser = data; // Restore global user state
        window.g_sessionUser = data;
        loadEnvironmentBadge();
        showEnhancedStoneExpiryWarning(data);
        applySubscriptionMenuState(data);
        
        // Ban Check
        if (data.isBanned) {
            ModalUtils.showAlert(`계정이 제재되었습니다.\n사유: ${data.reason}\n해제일: ${data.unban}`);
            await fetch('/api/logout', { method: 'POST' });
            location.href = '/';
            return;
        }

        // Store Main Character
        if (data.mainCharacter && data.mainCharacter.guid !== 0) {
            currentUserMainChar = data.mainCharacter;
            updateWelcomeMsg(data.mainCharacter.name, data.points);
        } else {
            // Main Character not set
            currentUserMainChar = null;
            updateWelcomeMsg(data.username, data.points); // Show username
            // showMainCharModal(true); // Disable forced modal
        }

        // Initialize Board with User Session
        if (typeof initBoard === 'function') {
            initBoard(data);
        }

        // Reload board sidebar now that user state is set with correct webRank
        if (typeof loadBoardsToSidebar === 'function') {
            loadBoardsToSidebar();
        }
        
        // Show/Hide Tabs based on permissions map
        try {
            // Normalize permissions map
            if (!data.permissions || typeof data.permissions !== 'object') {
                data.permissions = {};
                if (Array.isArray(data.allowedMenus)) {
                    data.allowedMenus.forEach(m => data.permissions[`menu_${m}`] = true);
                }
            }
            // Fallback: treat GM/Admin rank as full admin
            if (data.webRank >= 2 || data.isAdmin) data.permissions.admin_all = true;

            
            const isAdmin = data.webRank >= 2 || data.permissions.admin_all === true;
            const coreMenus = ['home', 'mypage', 'board', 'mailbox', 'carddraw', 'connect-guide', 'promotion'];
            
            // 1. Dynamic Main Menus
            const allTabBtns = document.querySelectorAll('[id^="tab-btn-"]');
            allTabBtns.forEach(btn => {
                const menuStr = btn.id.replace('tab-btn-', '');
                if (menuStr === 'shop') {
                    btn.style.display = 'none';
                    return;
                }
                const isCoreMenu = coreMenus.includes(menuStr);
                const isAllowed = isCoreMenu || isAdmin || data.permissions[`menu_${menuStr}`] === true;
                btn.style.display = isAllowed ? 'flex' : 'none';
            });

            // 2. Dynamic Sub-Menus
            const allSubBtns = document.querySelectorAll('[id^="sub-btn-"]');
            allSubBtns.forEach(btn => {
                const subStr = btn.id.replace('sub-btn-', ''); // e.g. "gm-todos"
                const isAllowed = isAdmin || data.permissions[`submenu_${subStr}`] === true;
                btn.style.display = isAllowed ? 'inline-block' : 'none';
            });

            // 3. Dynamic Separator
            const separator = document.getElementById('admin-separator');
            if (separator) {
            const adminMenuIds = new Set([
                    'gm',
                    'remote',
                    'update',
                    'account',
                    'ban',
                    'logs',
                    'stats',
                    'content',
                    'board-admin',
                    'notification-admin',
                    'shop-admin'
                ]);
                let hasAdmin = false;
                Object.keys(data.permissions).forEach((k) => {
                    if (!k.startsWith('menu_')) return;
                    const name = k.replace('menu_', '');
                    if (adminMenuIds.has(name) && data.permissions[k] === true) {
                        hasAdmin = true;
                    }
                });
                separator.style.display = isAdmin || hasAdmin ? 'block' : 'none';
            }
            applyAdminMenuOrder();
        } catch(err) {
            console.error("[ERROR] Failed to show admin tabs:", err);
        }

    } catch (e) {
        console.error("Status check failed", e);
    }
}

function updateWelcomeMsg(name, points, hasEnhancedStone = null) {
    const text = document.getElementById('welcome-text');
    const mobileText = document.getElementById('welcome-text-mobile');
    const displayName = String(name || '');
    const activeStone = hasEnhancedStone === null
        ? (g_sessionUser && g_sessionUser.enhancedStoneActive === true)
        : (hasEnhancedStone === true);
    const gem = activeStone ? '<i class="fas fa-gem" style="color:#7c3aed; font-size:0.9em; margin-right:6px;" title="빛나는 영웅석"></i>' : '';
    const safeName = displayName
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    const html = `${gem}${safeName}`;
    if (text) text.innerHTML = html;
    if (mobileText) mobileText.innerHTML = html;

    if (points !== undefined && points !== null) {
        const mobilePoints = document.getElementById('user-points-display');
        const desktopPoints = document.getElementById('user-points-display-desktop');
        const formatted = Number(points).toLocaleString();
        if (mobilePoints) mobilePoints.textContent = formatted;
        if (desktopPoints) desktopPoints.textContent = formatted;
    }
}

async function applyAdminMenuOrder() {
    try {
        const res = await fetch('/api/admin/menu-order/list');
        if (!res.ok) return;
        const data = await res.json();
        const adminMenuIds = new Set(['gm', 'remote', 'update', 'account', 'ban', 'logs', 'stats', 'content', 'board-admin', 'notification-admin', 'shop-admin']);
        const menus = (Array.isArray(data.menus) ? data.menus : []).filter(m => adminMenuIds.has(m.id));
        if (!menus.length) return;

        const nav = document.querySelector('.sidebar-nav');
        if (!nav) return;
        const adminSep = document.getElementById('admin-separator');
        const frag = document.createDocumentFragment();
        menus.forEach(m => {
            const btn = document.getElementById(`tab-btn-${m.id}`);
            if (btn) frag.appendChild(btn);
        });
        if (!frag.childNodes.length) return;
        if (adminSep && adminSep.parentElement === nav) {
            nav.insertBefore(frag, adminSep.nextSibling);
        } else {
            nav.appendChild(frag);
        }
    } catch (e) {
        // ignore ordering fetch errors
    }
}

// Modal Utilities using SweetAlert2
class ModalUtils {
    static hasSwal() {
        return typeof window !== 'undefined' && typeof window.Swal !== 'undefined' && typeof window.Swal.fire === 'function';
    }

    static showAlert(message, title = '알림', callback = null) {
        if (!this.hasSwal()) {
            alert(`${title}\n\n${message}`);
            if (callback) callback();
            return Promise.resolve();
        }
        // Auto-detect icon based on keywords
        let icon = 'info';
        if (message.includes('성공') || message.includes('완료') || message.includes('되었습니다')) icon = 'success';
        else if (message.includes('실패') || message.includes('오류') || message.includes('에러')) icon = 'error';
        else if (message.includes('경고') || message.includes('주의')) icon = 'warning';
        else if (message.includes('삭제') || message.includes('취소')) icon = 'warning';

        return Swal.fire({
            title: title,
            text: message,
            icon: icon,
            confirmButtonText: '확인',
            confirmButtonColor: '#3085d6',
            showClass: {
                popup: 'swal2-show swal2-animate-show'
            },
            hideClass: {
                popup: 'swal2-hide swal2-animate-hide'
            }
        }).then((result) => {
            if (callback) callback();
        });
    }

    static showConfirm(message, callback, title = '확인') {
        if (!this.hasSwal()) {
            if (confirm(`${title}\n\n${message}`)) callback();
            return;
        }
        Swal.fire({
            title: title,
            text: message,
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#3085d6',
            cancelButtonColor: '#d33',
            confirmButtonText: '확인',
            cancelButtonText: '취소',
            showClass: {
                popup: 'swal2-show swal2-animate-show'
            },
            hideClass: {
                popup: 'swal2-hide swal2-animate-hide'
            }
        }).then((result) => {
            if (result.isConfirmed) {
                callback();
            }
        });
    }

    static handleError(error, defaultMsg = '오류가 발생했습니다.') {
        let msg = typeof error === 'string' ? error : (error.message || defaultMsg);
        
        // Try to parse JSON error message if it looks like one
        // User reported: {"message":"권한이 부족합니다.","status":"forbidden"}
        if (msg.includes('{"message":') || (msg.trim().startsWith('{') && msg.includes('"status":'))) {
            try {
                // Extract JSON part if mixed with text (e.g. "Server Error: {...}") or just strict parsing
                let jsonStr = msg;
                const jsonStart = msg.indexOf('{');
                const jsonEnd = msg.lastIndexOf('}') + 1;
                
                if (jsonStart >= 0 && jsonEnd > jsonStart) {
                    jsonStr = msg.substring(jsonStart, jsonEnd);
                }
                
                const parsed = JSON.parse(jsonStr);
                
                if (parsed.message) msg = parsed.message;
                
                if (parsed.status === 'forbidden' || msg.includes('권한') || msg.includes('Permission')) {
                    return this.showAlert(msg, '권한 오류', () => {
                        location.href = '/';
                    });
                }
            } catch (e) {
                console.error("Error parsing error message:", e);
            }
        } 
        
        if (msg.includes('forbidden') || msg.includes('status: 403') || msg.includes('권한이 부족합니다')) {
             return this.showAlert('접근 권한이 없습니다.', '권한 오류', () => {
                location.href = '/';
            });
        }

        this.showAlert(msg, '오류');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    LoadingUX.init();
    normalizeKoreanLabels();
    ensureHeaderIcons();
    // Initial Load
    checkAdminAccess(); // Check User Status & Permissions
    updatePointsHeader(); // Initial Points Load
    checkStatus();      // Check Server Status
    loadOnlineCount();  // Load home online list independently from launcher status
    loadHomeNoticePreview(); // Load notice preview on home
    initBoardSystem(); // Initialize board module and populate sidebar boards
    
    // Periodically check server status
    setInterval(checkStatus, 30000);

    // Initial Load - Delay slightly to ensure board.js might be ready for any dependencies
    setTimeout(() => {
        openTab('home', { trackHistory: false });
        if (window.history && typeof window.history.replaceState === 'function') {
            window.history.replaceState(buildAppState('home'), '', window.location.pathname + window.location.search);
        }
    }, 100);

    loadHomeSlider();

    // --- Search Enter Key Handlers ---
    
    // 1. User Permissions
    const permInputs = ['filter-perm-user', 'filter-perm-email', 'filter-perm-rank'];
    permInputs.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.addEventListener('keypress', (e) => { if(e.key === 'Enter') loadUserList(1); });
    });

    // 2. Character List
    const charInputs = ['filter-char-name', 'filter-char-account', 'filter-char-level'];
    charInputs.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.addEventListener('keypress', (e) => { if(e.key === 'Enter') loadCharacterList(1); });
    });

    // 3. Action Logs
    const logInputs = ['filter-user', 'filter-role', 'filter-ip', 'filter-btn'];
    logInputs.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.addEventListener('keypress', (e) => { if(e.key === 'Enter') loadLogs(1); });
    });

    // 4. Black Market Logs
    const bmLogInputs = ['filter-bm-char', 'filter-bm-item'];
    bmLogInputs.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.addEventListener('keypress', (e) => { if(e.key === 'Enter') loadBlackMarketLogs(1); });
    });

    // 5. Karazhan Logs
    const kzInputs = ['filter-kz-char', 'filter-kz-item'];
    kzInputs.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.addEventListener('keypress', (e) => { if(e.key === 'Enter') loadKarazhanLogs(1); });
    });

    // 6. Playtime Logs
    const ptInputs = ['filter-pt-char', 'filter-pt-item'];
    ptInputs.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.addEventListener('keypress', (e) => { if(e.key === 'Enter') loadPlaytimeLogs(1); });
    });

    // 7. Mail Logs
    const mailInputs = ['filter-mail-sender', 'filter-mail-receiver'];
    mailInputs.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.addEventListener('keypress', (e) => { if(e.key === 'Enter') loadMailLogs(1); });
    });
    
    // 8. Board Search
    const boardSearch = document.getElementById('board-search');
    if(boardSearch) boardSearch.addEventListener('keypress', (e) => { if(e.key === 'Enter') { if(typeof loadPosts === 'function') loadPosts(1); } });
    
    // ---------------------------------
});

window.addEventListener('popstate', (event) => {
    const state = event.state;
    if (!restoreFromHistoryState(state)) {
        openTab('home', { trackHistory: false });
    }
});


// Home Calendar Global State
var HomeCalendarState = {
    monthData: {},
    selectedDate: null,
    calendarInstance: null
};

var HomeSliderState = {
    items: [],
    index: 0,
    timer: null
};

function normalizeSliderPath(src) {
    const v = String(src || '').trim();
    if (!v) return '';
    if (v.startsWith('http://') || v.startsWith('https://') || v.startsWith('/')) return v;
    return '/' + v.replace(/^\.?\//, '');
}

function renderHomeSlider() {
    const track = document.getElementById('home-slider-track');
    const dots = document.getElementById('home-slider-dots');
    if (!track || !dots) return;
    const items = Array.isArray(HomeSliderState.items) ? HomeSliderState.items : [];

    if (!items.length) {
        track.innerHTML = `<div class="home-slide-item" style="display:flex; align-items:center; justify-content:center; background:linear-gradient(135deg, #0f172a, #1e293b); color:#cbd5e1;">등록된 슬라이더 이미지가 없습니다.</div>`;
        dots.innerHTML = '';
        track.style.transform = 'translateX(0%)';
        return;
    }

    track.innerHTML = items.map((item) => {
        const img = escapeHomeNotice(normalizeSliderPath(item.image_url || item.imageURL || ''));
        const title = escapeHomeNotice(item.title || '');
        const link = escapeHomeNotice(item.link_url || item.linkURL || '');
        return `
            <div class="home-slide-item" onclick="openHomeSliderLink('${link}')">
                <img src="${img}" alt="${title || '홈 슬라이더'}" onerror="this.style.opacity='0.35'">
                ${title ? `<div class="home-slide-caption">${title}</div>` : ''}
            </div>
        `;
    }).join('');

    dots.innerHTML = items.map((_, i) => `<button type="button" class="home-slider-dot${i === HomeSliderState.index ? ' active' : ''}" onclick="homeSliderGo(${i})"></button>`).join('');
    track.style.transform = `translateX(-${HomeSliderState.index * 100}%)`;
}

function restartHomeSliderAuto() {
    if (HomeSliderState.timer) clearInterval(HomeSliderState.timer);
    if (!Array.isArray(HomeSliderState.items) || HomeSliderState.items.length < 2) return;
    HomeSliderState.timer = setInterval(() => {
        homeSliderNext();
    }, 5000);
}

async function loadHomeSlider() {
    const track = document.getElementById('home-slider-track');
    if (!track) return;
    try {
        const res = await fetch('/api/home/slider/list');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        HomeSliderState.items = Array.isArray(data) ? data : [];
        if (HomeSliderState.index >= HomeSliderState.items.length) HomeSliderState.index = 0;
        renderHomeSlider();
        restartHomeSliderAuto();
    } catch (e) {
        HomeSliderState.items = [];
        HomeSliderState.index = 0;
        renderHomeSlider();
    }
}
window.loadHomeSlider = loadHomeSlider;

function homeSliderGo(index) {
    const size = Array.isArray(HomeSliderState.items) ? HomeSliderState.items.length : 0;
    if (!size) return;
    HomeSliderState.index = Math.max(0, Math.min(size - 1, Number(index) || 0));
    renderHomeSlider();
    restartHomeSliderAuto();
}
window.homeSliderGo = homeSliderGo;

function homeSliderPrev() {
    const size = Array.isArray(HomeSliderState.items) ? HomeSliderState.items.length : 0;
    if (!size) return;
    HomeSliderState.index = (HomeSliderState.index - 1 + size) % size;
    renderHomeSlider();
    restartHomeSliderAuto();
}
window.homeSliderPrev = homeSliderPrev;

function homeSliderNext() {
    const size = Array.isArray(HomeSliderState.items) ? HomeSliderState.items.length : 0;
    if (!size) return;
    HomeSliderState.index = (HomeSliderState.index + 1) % size;
    renderHomeSlider();
}
window.homeSliderNext = homeSliderNext;

function openHomeSliderLink(url) {
    const v = String(url || '').trim();
    if (!v) return;
    window.open(v, '_blank', 'noopener');
}
window.openHomeSliderLink = openHomeSliderLink;

var UserCalendarState = {
    monthData: {},
    selectedDate: null,
    calendarInstance: null,
    canWrite: false
};
var calendarRightTab = 'day';
var calendarMyEvents = [];
var calendarRaidHeroEvents = [];
var calendarSubMenu = 'calendar';
var calendarWriteEditingId = 0;
var calendarWriteParticipants = [];
var calendarCharSuggestTimer = null;

function getCalendarMainCharacter() {
    const fromGlobal = (typeof currentUserMainChar === 'object' && currentUserMainChar) ? currentUserMainChar : null;
    if (fromGlobal && Number(fromGlobal.guid || 0) > 0 && String(fromGlobal.name || '').trim()) {
        return fromGlobal;
    }
    const fromSession = (window.g_sessionUser && typeof window.g_sessionUser === 'object')
        ? window.g_sessionUser.mainCharacter
        : null;
    if (fromSession && Number(fromSession.guid || 0) > 0 && String(fromSession.name || '').trim()) {
        return fromSession;
    }
    return null;
}

function ensureCalendarAuthorParticipant() {
    const category = String(document.getElementById('calendar-write-category')?.value || '').trim();
    if (category !== '레이드') return true;
    const mainChar = getCalendarMainCharacter();
    if (!mainChar) {
        ModalUtils.showAlert('대표 캐릭터를 설정해야 레이드 일정을 작성할 수 있습니다.');
        return false;
    }

    const authorGuid = Number(mainChar.guid || 0);
    const authorName = String(mainChar.name || '').trim();
    if (!authorGuid || !authorName) {
        ModalUtils.showAlert('대표 캐릭터를 설정해야 레이드 일정을 작성할 수 있습니다.');
        return false;
    }

    const next = [];
    let authorRow = null;
    for (let i = 0; i < calendarWriteParticipants.length; i += 1) {
        const p = calendarWriteParticipants[i];
        const same = Number(p.guid || 0) === authorGuid || String(p.name || '').trim() === authorName;
        if (same) {
            authorRow = {
                guid: authorGuid,
                name: authorName,
                race: Number(mainChar.race || p.race || 0),
                class: Number(mainChar.class || p.class || 0),
                level: Number(mainChar.level || p.level || 1),
                isAuthor: true
            };
        } else {
            next.push({
                guid: Number(p.guid || 0),
                name: String(p.name || '').trim(),
                race: Number(p.race || 0),
                class: Number(p.class || 0),
                level: Number(p.level || 1),
                isAuthor: false
            });
        }
    }

    if (!authorRow) {
        authorRow = {
            guid: authorGuid,
            name: authorName,
            race: Number(mainChar.race || 0),
            class: Number(mainChar.class || 0),
            level: Number(mainChar.level || 1),
            isAuthor: true
        };
    }

    calendarWriteParticipants = [authorRow].concat(next);
    renderCalendarSelectedParticipants();
    return true;
}

function initHomeCalendar(element) {
    const fetchJsonSafe = async (url, fallbackValue = []) => {
        try {
            const res = await fetch(url);
            if (!res.ok) return fallbackValue;
            const text = await res.text();
            if (!text) return fallbackValue;
            return JSON.parse(text);
        } catch (e) {
            return fallbackValue;
        }
    };

    const calendar = new FullCalendar.Calendar(element, {
        initialView: 'dayGridMonth',
        locale: 'ko',
        height: '100%',
        selectable: true, // Enable selection
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: ''
        },
        titleFormat: { year: 'numeric', month: 'long' },
        events: (fetchInfo, successCallback, failureCallback) => {
            const viewCenter = new Date(fetchInfo.start.valueOf() + 15 * 24 * 60 * 60 * 1000);
            const year = viewCenter.getFullYear();
            const month = viewCenter.getMonth() + 1;
            const str = `${year}-${String(month).padStart(2,'0')}`;
            
            // Fetch Server Events (Custom)
            const p1 = fetchJsonSafe(`/api/server/events?month=${str}`, []);
            // Fetch Game Events (Auto from DB)
            const p2 = fetchJsonSafe(`/api/server/game_events?month=${str}`, []);

            Promise.all([p1, p2])
                .then(([serverEvents, gameEvents]) => {
                    const events = [];

                    // 1. Server Events (Purple)
                    (serverEvents || []).forEach(item => {
                        events.push({
                            title: item.title,
                            start: item.target_date, // Or construct from date + time
                            color: '#8b5cf6',
                            borderColor: '#7c3aed',
                            textColor: 'white',
                            extendedProps: { ...item, type: 'server' }
                        });
                    });

                    // 2. Game Events (Green)
                    (gameEvents || []).forEach(item => {
                        events.push({
                            title: item.description,
                            start: item.start,
                            end: item.end,
                            color: '#10b981',
                            borderColor: '#059669',
                            textColor: 'white',
                            extendedProps: { ...item, type: 'game' }
                        });
                    });
                    
                    // Group by date for quick access (Merged)
                    HomeCalendarState.monthData = {};
                    events.forEach(evt => {
                        let d;
                        if (evt.start.includes('T')) d = evt.start.split('T')[0];
                        else d = evt.start.split(' ')[0];
                        
                        if (!HomeCalendarState.monthData[d]) HomeCalendarState.monthData[d] = [];
                        HomeCalendarState.monthData[d].push(evt);
                    });

                    successCallback(events);
                    
                    if (HomeCalendarState.selectedDate) {
                        renderHomeEvents(HomeCalendarState.selectedDate);
                    }
                })
                .catch(err => {
                    console.error("Calendar Fetch Error:", err);
                    failureCallback(err);
                });
        },
        dateClick: (info) => {
            // Highlight selected day? - FullCalendar select handles this if selectable is true, or we can just use dateClick
            HomeCalendarState.selectedDate = info.dateStr;
            renderHomeEvents(info.dateStr);
            
            // Visual feedback (simple bg change for now, or rely on FullCalendar's fc-highlight if specific)
             document.querySelectorAll('.fc-daygrid-day').forEach(el => el.style.backgroundColor = '');
             if(info.dayEl) info.dayEl.style.backgroundColor = '#f0fdf4';
        },
        eventClick: (info) => {
            // Select the date of the event
            const dateStr = info.event.startStr.split('T')[0];
            HomeCalendarState.selectedDate = dateStr;
            renderHomeEvents(dateStr);
        }
    });
    calendar.render();
    HomeCalendarState.calendarInstance = calendar;
}

function renderHomeEvents(dateStr) {
    const listContainer = document.getElementById('home-event-list');
    const titleContainer = document.getElementById('home-selected-date-title');
    
    if (!listContainer || !titleContainer) return;

    // Update Title
    const d = new Date(dateStr);
    const dayName = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
    titleContainer.innerHTML = `<i class="far fa-calendar-check" style="color:var(--primary-color)"></i> <span>${d.getMonth() + 1}월 ${d.getDate()}일 (${dayName}) 일정</span>`;

    const events = HomeCalendarState.monthData[dateStr] || [];

    if (events.length === 0) {
        listContainer.innerHTML = `
            <div style="text-align: center; color: var(--text-secondary); margin-top: 3rem;">
                <i class="far fa-calendar-times" style="font-size: 2rem; margin-bottom: 1rem; opacity: 0.5;"></i>
                <p>해당 날짜에 등록된<br>일정이 없습니다.</p>
            </div>`;
        return;
    }

    let html = '';
    events.forEach(fullEvent => {
        // Handle merged structure (FullCalendar Event Object)
        const props = fullEvent.extendedProps || {};
        const type = props.type || 'server';
        
        let timeStr = '';
        let content = '';
        let author = '';
        let borderColor = '#e2e8f0'; // Default gray
        let titleColor = '#1e293b';

        if (type === 'server') {
            borderColor = '#e9d5ff'; // Light Purple
            titleColor = '#7c3aed';
            
            timeStr = (props.start_time && props.start_time !== '00:00:00') ? 
            `<span style="color:#64748b; font-size:0.85rem; background:#f1f5f9; padding:2px 8px; border-radius:99px;">${props.start_time.substring(0,5)} ~ ${props.end_time ? props.end_time.substring(0,5) : ''}</span>` : 
            `<span style="color:#64748b; font-size:0.85rem; background:#f1f5f9; padding:2px 8px; border-radius:99px;">하루 종일</span>`;
            
            content = props.content ? props.content.replace(/\n/g, '<br>') : '';
            author = `<div style="margin-top:10px; padding-top:10px; border-top:1px solid #f1f5f9; font-size:0.8rem; color:#94a3b8; text-align:right;">작성자: ${props.author || 'GM'}</div>`;
        
        } else if (type === 'game') {
            borderColor = '#bbf7d0'; // Light Green
            titleColor = '#059669';
            
            // Format start/end for display if needed, or just show Title
            // Game events often span days, so showing time might be redundant if checking specific day.
            timeStr = `<span style="color:#059669; font-size:0.85rem; background:#ecfdf5; padding:2px 8px; border-radius:99px; font-weight:600;">게임 이벤트</span>`;
            content = `<div style="font-size:0.9rem; color:#64748b;">이벤트 기간:<br>${fullEvent.start.replace('T', ' ')} ~ ${fullEvent.end.replace('T', ' ')}</div>`;
        }

        html += `
            <div class="event-card-premium" style="background:white; border:1px solid ${borderColor}; border-left: 4px solid ${titleColor}; border-radius:12px; padding:1.25rem; margin-bottom:1rem; box-shadow:0 2px 4px rgba(0,0,0,0.02); transition:transform 0.2s;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <div style="font-weight:700; font-size:1.05rem; color:${titleColor};">${fullEvent.title}</div>
                    ${timeStr}
                </div>
                <div style="color:#475569; line-height:1.6; font-size:0.95rem;">${content}</div>
                ${author}
            </div>
        `;
    });
    listContainer.innerHTML = html;
}

function formatHomeNoticeDate(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '-';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function escapeHomeNotice(s) {
    if (s === null || s === undefined) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

async function loadHomeNoticePreview() {
    const titleEl = document.getElementById('home-notice-latest-title');
    const metaEl = document.getElementById('home-notice-latest-meta');
    if (!titleEl || !metaEl) return;
    titleEl.textContent = '불러오는 중...';
    metaEl.textContent = '-';
    window.__homeLatestNoticeId = 0;

    try {
        const res = await fetch('/api/board/posts?board_id=notice&page=1&limit=1');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const posts = Array.isArray(data.posts) ? data.posts : [];

        if (!posts.length) {
            titleEl.textContent = '등록된 공지사항이 없습니다.';
            metaEl.textContent = '-';
            return;
        }
        const post = posts[0];
        window.__homeLatestNoticeId = Number(post.id || 0);
        titleEl.textContent = post.title || '제목 없음';
        metaEl.textContent = `${post.author_name || '-'} · ${formatHomeNoticeDate(post.created_at)}`;
    } catch (e) {
        titleEl.textContent = '공지사항을 불러오지 못했습니다.';
        metaEl.textContent = '-';
    }
}
window.loadHomeNoticePreview = loadHomeNoticePreview;

async function openHomeNoticeBoard() {
    if (typeof openBoard === 'function') {
        await openBoard('notice');
    } else if (typeof openTab === 'function') {
        openTab('board');
    }
}
window.openHomeNoticeBoard = openHomeNoticeBoard;

async function openHomeNoticePost(postId) {
    if (!postId) return;
    if (typeof openBoard === 'function') {
        await openBoard('notice');
    } else if (typeof openTab === 'function') {
        openTab('board');
    }
    if (typeof viewPost === 'function') {
        setTimeout(() => viewPost(postId, true), 80);
    }
}

function initUserCalendarTab() {
    showCalendarListView();
    const writeBtn = document.getElementById('calendar-write-btn');
    const perms = (g_sessionUser && g_sessionUser.permissions && typeof g_sessionUser.permissions === 'object')
        ? g_sessionUser.permissions
        : {};
    const canWrite = !!(g_sessionUser && (g_sessionUser.webRank >= 2 || perms.admin_all === true || perms['submenu_calendar-write'] === true));
    UserCalendarState.canWrite = canWrite;
    if (writeBtn) writeBtn.style.display = canWrite ? 'inline-flex' : 'none';

    const element = document.getElementById('user-calendar-view');
    if (!element || typeof FullCalendar === 'undefined') return;

    if (UserCalendarState.calendarInstance) {
        try { UserCalendarState.calendarInstance.destroy(); } catch (_) {}
        UserCalendarState.calendarInstance = null;
    }

    const fetchJsonSafe = async (url, fallbackValue = []) => {
        try {
            const res = await fetch(url);
            if (!res.ok) return fallbackValue;
            const text = await res.text();
            if (!text) return fallbackValue;
            return JSON.parse(text);
        } catch (_) {
            return fallbackValue;
        }
    };

    const calendar = new FullCalendar.Calendar(element, {
        initialView: 'dayGridMonth',
        locale: 'ko',
        height: '100%',
        selectable: true,
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: ''
        },
        titleFormat: { year: 'numeric', month: 'long' },
        events: (fetchInfo, successCallback, failureCallback) => {
            const viewCenter = new Date(fetchInfo.start.valueOf() + 15 * 24 * 60 * 60 * 1000);
            const year = viewCenter.getFullYear();
            const month = viewCenter.getMonth() + 1;
            const str = `${year}-${String(month).padStart(2, '0')}`;
            fetchJsonSafe(`/api/calendar/events/list?month=${str}`, [])
                .then((list) => {
                    const events = [];
                    UserCalendarState.monthData = {};
                    (list || []).forEach((item) => {
                        const d = String(item.target_date || '').split('T')[0];
                        if (!d) return;
                        const color = item.category === '자유' ? '#2563eb'
                            : item.category === '레이드' ? '#8b5cf6'
                            : item.category === '영던' ? '#16a34a'
                            : '#64748b';
                        const startDate = d;
                        const endDate = String(item.end_date || item.target_date || d).split('T')[0] || startDate;
                        const endExclusive = addDaysForCalendarEnd(endDate, 1);
                        events.push({
                            title: item.title || '제목 없음',
                            start: startDate,
                            end: endExclusive,
                            color,
                            borderColor: color,
                            textColor: 'white',
                            extendedProps: { ...item }
                        });
                        const mapStart = new Date(startDate);
                        const mapEnd = new Date(endDate);
                        if (!Number.isNaN(mapStart.getTime()) && !Number.isNaN(mapEnd.getTime()) && mapStart <= mapEnd) {
                            const cursor = new Date(mapStart);
                            while (cursor <= mapEnd) {
                                const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
                                if (!UserCalendarState.monthData[key]) UserCalendarState.monthData[key] = [];
                                UserCalendarState.monthData[key].push(item);
                                cursor.setDate(cursor.getDate() + 1);
                            }
                        } else {
                            if (!UserCalendarState.monthData[d]) UserCalendarState.monthData[d] = [];
                            UserCalendarState.monthData[d].push(item);
                        }
                    });
                    successCallback(events);
                    if (UserCalendarState.selectedDate) {
                        renderUserCalendarEvents(UserCalendarState.selectedDate);
                    }
                })
                .catch((err) => failureCallback(err));
        },
        dateClick: (info) => {
            UserCalendarState.selectedDate = info.dateStr;
            renderUserCalendarEvents(info.dateStr);
            document.querySelectorAll('#calendar-page .fc-daygrid-day').forEach(el => { el.style.backgroundColor = ''; });
            if (info.dayEl) info.dayEl.style.backgroundColor = '#eff6ff';
        },
        eventClick: (info) => {
            const dateStr = String(info.event.startStr || '').split('T')[0];
            UserCalendarState.selectedDate = dateStr;
            renderUserCalendarEvents(dateStr);
        }
    });
    calendar.render();
    UserCalendarState.calendarInstance = calendar;

    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    UserCalendarState.selectedDate = today;
    renderUserCalendarEvents(today);
    switchUserCalendarRightTab(calendarRightTab || 'day');
    openCalendarSubMenu(calendarSubMenu || 'calendar');
}

function escapeCalendarText(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function openCalendarSubMenu(menuName) {
    calendarSubMenu = (menuName === 'dungeon') ? 'dungeon' : 'calendar';
    const calBtn = document.getElementById('calendar-submenu-calendar');
    const dungBtn = document.getElementById('calendar-submenu-dungeon');
    const calView = document.getElementById('calendar-submenu-calendar-view');
    const dungView = document.getElementById('calendar-submenu-dungeon-view');
    const writeBtn = document.getElementById('calendar-write-btn');

    if (calendarSubMenu === 'dungeon') {
        if (calBtn) calBtn.classList.remove('active');
        if (dungBtn) dungBtn.classList.add('active');
        if (calView) calView.style.display = 'none';
        if (dungView) dungView.style.display = 'block';
        if (writeBtn) writeBtn.style.display = 'none';
        loadDungeonPageEvents();
        return;
    }

    if (calBtn) calBtn.classList.add('active');
    if (dungBtn) dungBtn.classList.remove('active');
    if (calView) calView.style.display = 'block';
    if (dungView) dungView.style.display = 'none';
    if (writeBtn) writeBtn.style.display = UserCalendarState.canWrite ? 'inline-flex' : 'none';
}

function addDaysForCalendarEnd(dateStr, addDays = 1) {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;
    d.setDate(d.getDate() + addDays);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function renderUserCalendarEvents(dateStr) {
    const listContainer = document.getElementById('user-calendar-event-list');
    const titleContainer = document.getElementById('user-calendar-selected-date-title');
    if (!listContainer || !titleContainer) return;

    const d = new Date(dateStr);
    const dayName = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
    if (calendarRightTab === 'day') {
        titleContainer.innerHTML = `<span style="color:#2563eb;">${d.getMonth() + 1}월 ${d.getDate()}일</span> <span style="font-weight:normal; color:#64748b;">(${dayName}) 일정</span>`;
    }

    const events = UserCalendarState.monthData[dateStr] || [];
    if (!events.length) {
        listContainer.innerHTML = `<div style="text-align:center; padding:40px 20px; color:#94a3b8;"><i class="far fa-calendar-times" style="font-size:2rem; margin-bottom:10px;"></i><div>등록된 일정이 없습니다.</div></div>`;
        return;
    }

    const categoryBadge = (cat) => {
        const c = String(cat || '').trim() || '기타';
        const map = {
            '자유': { bg: '#dbeafe', fg: '#1d4ed8' },
            '레이드': { bg: '#ede9fe', fg: '#6d28d9' },
            '영던': { bg: '#dcfce7', fg: '#166534' },
            '기타': { bg: '#e2e8f0', fg: '#334155' }
        };
        const s = map[c] || map['기타'];
        return `<span style="display:inline-flex; align-items:center; padding:3px 10px; border-radius:999px; background:${s.bg}; color:${s.fg}; font-size:0.8rem; font-weight:700;">${escapeCalendarText(c)}</span>`;
    };

    listContainer.innerHTML = events.map((item) => {
        const content = escapeCalendarText(item.content || '').replace(/\n/g, '<br>');
        const author = escapeCalendarText(item.author || 'SYSTEM');
        const participants = String(item.participants || '').trim();
        const participantsMeta = Array.isArray(item.participants_meta) ? item.participants_meta : [];
        const participantsMetaEncoded = encodeURIComponent(JSON.stringify(participantsMeta));
        const encodedItem = encodeURIComponent(JSON.stringify(item || {}));
        const startDate = escapeCalendarText(item.target_date || '-');
        const endDate = escapeCalendarText(item.end_date || item.target_date || '-');
        const startTime = String(item.start_time || '00:00:00').substring(0, 5);
        const endTime = String(item.end_time || '00:00:00').substring(0, 5);
        const actionButtons = [];
        if (participants) {
            actionButtons.push(`
                <button class="refresh-btn" style="padding:4px 8px;" onclick="openCalendarParticipantsModal('${encodeURIComponent(String(item.title || '일정'))}', '${encodeURIComponent(participants)}', '${participantsMetaEncoded}', '${encodeURIComponent(String(item.author || ''))}')">
                    <i class="fas fa-list"></i> 참여목록
                </button>
            `);
        }
        if (item.can_delete === true) {
            actionButtons.push(`
                <button class="refresh-btn" style="padding:4px 8px; background:#dbeafe; color:#1d4ed8; border:1px solid #bfdbfe;" onclick="openUserCalendarEditFromEncoded('${encodedItem}')">
                    <i class="fas fa-edit"></i> 수정
                </button>
            `);
            actionButtons.push(`
                <button class="refresh-btn" style="padding:4px 8px; background:#fee2e2; color:#b91c1c; border:1px solid #fecaca;" onclick="deleteUserCalendarEvent(${Number(item.id || 0)})">
                    <i class="fas fa-trash"></i> 삭제
                </button>
            `);
        }
        return `
            <div style="background:white; border:1px solid #e2e8f0; border-radius:10px; padding:12px; margin-bottom:10px; box-shadow:0 1px 2px rgba(0,0,0,0.02);">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:8px;">
                    <div style="font-weight:700; color:#1e293b;">${escapeCalendarText(item.title || '제목 없음')}</div>
                    ${categoryBadge(item.category)}
                </div>
                <div style="font-size:0.84rem; color:#64748b; margin-bottom:8px;">
                    <i class="far fa-calendar-alt"></i> ${startDate} ~ ${endDate}
                    <span style="margin:0 6px; color:#cbd5e1;">|</span>
                    <i class="far fa-clock"></i> ${startTime} ~ ${endTime}
                </div>
                <div style="font-size:0.92rem; color:#334155; line-height:1.6;">${content || '내용 없음'}</div>
                ${participants ? `<div style="margin-top:8px; font-size:0.84rem; color:#475569;"><i class="fas fa-users"></i> 참여: ${escapeCalendarText(participants)}</div>` : ''}
                <div style="margin-top:10px; padding-top:8px; border-top:1px solid #f1f5f9; display:flex; align-items:center; justify-content:space-between; gap:8px;">
                    <div style="font-size:0.8rem; color:#94a3b8;">작성자: ${author}</div>
                    ${actionButtons.length ? `<div style="display:flex; align-items:center; gap:6px;">${actionButtons.join('')}</div>` : '<div></div>'}
                </div>
            </div>
        `;
    }).join('');
}

function switchUserCalendarRightTab(tabName) {
    calendarRightTab = (tabName === 'mine') ? 'mine' : 'day';
    const dayBtn = document.getElementById('user-calendar-tab-day');
    const myBtn = document.getElementById('user-calendar-tab-mine');
    const dayList = document.getElementById('user-calendar-event-list');
    const myList = document.getElementById('user-calendar-my-list');
    const titleEl = document.getElementById('user-calendar-selected-date-title');

    if (calendarRightTab === 'mine') {
        if (dayBtn) dayBtn.classList.remove('active');
        if (myBtn) myBtn.classList.add('active');
        if (dayList) dayList.style.display = 'none';
        if (myList) myList.style.display = 'block';
        if (titleEl) titleEl.textContent = '본인 작성 일정';
        loadMyUserCalendarEvents();
        return;
    }

    if (dayBtn) dayBtn.classList.add('active');
    if (myBtn) myBtn.classList.remove('active');
    if (dayList) dayList.style.display = 'block';
    if (myList) myList.style.display = 'none';

    if (UserCalendarState.selectedDate) {
        renderUserCalendarEvents(UserCalendarState.selectedDate);
    }
}

async function loadMyUserCalendarEvents() {
    const el = document.getElementById('user-calendar-my-list');
    if (!el) return;
    el.innerHTML = '<div style="padding:12px; color:#64748b;">불러오는 중...</div>';
    try {
        const res = await fetch('/api/calendar/events/my');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        calendarMyEvents = Array.isArray(data) ? data : [];
        renderMyUserCalendarEvents();
    } catch (e) {
        el.innerHTML = '<div style="padding:12px; color:#ef4444;">본인 일정을 불러오지 못했습니다.</div>';
    }
}

async function loadDungeonPageEvents() {
    const el = document.getElementById('dungeon-event-list');
    if (!el) return;
    el.innerHTML = '<div style="padding:12px; color:#64748b;">불러오는 중...</div>';
    try {
        const res = await fetch('/api/calendar/events/list');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const list = Array.isArray(data) ? data : [];
        calendarRaidHeroEvents = list.filter((v) => {
            const c = String(v.category || '').trim();
            return c === '레이드' || c === '영던';
        });
        renderDungeonPageEvents();
    } catch (_) {
        el.innerHTML = '<div style="padding:12px; color:#ef4444;">던전 일정을 불러오지 못했습니다.</div>';
    }
}

function renderDungeonPageEvents() {
    const el = document.getElementById('dungeon-event-list');
    if (!el) return;
    if (!calendarRaidHeroEvents.length) {
        el.innerHTML = '<div style="padding:12px; color:#94a3b8;">던전 일정이 없습니다.</div>';
        return;
    }
    el.innerHTML = calendarRaidHeroEvents.map((item) => {
        const title = escapeCalendarText(item.title || '제목 없음');
        const content = escapeCalendarText(item.content || '').replace(/\n/g, '<br>');
        const category = escapeCalendarText(item.category || '');
        const participants = String(item.participants || '').trim();
        const participantsMeta = Array.isArray(item.participants_meta) ? item.participants_meta : [];
        const participantsMetaEncoded = encodeURIComponent(JSON.stringify(participantsMeta));
        const startDate = escapeCalendarText(item.target_date || '-');
        const endDate = escapeCalendarText(item.end_date || item.target_date || '-');
        const startTime = String(item.start_time || '00:00:00').substring(0, 5);
        const endTime = String(item.end_time || '00:00:00').substring(0, 5);
        const author = escapeCalendarText(item.author || 'SYSTEM');
        return `
            <div style="background:white; border:1px solid #e2e8f0; border-radius:10px; padding:12px; margin-bottom:10px;">
                <div style="display:flex; justify-content:space-between; gap:8px; align-items:center; margin-bottom:8px;">
                    <div style="font-weight:700; color:#1e293b;">${title}</div>
                    <span style="display:inline-flex; align-items:center; padding:3px 10px; border-radius:999px; background:${category === '레이드' ? '#ede9fe' : '#dcfce7'}; color:${category === '레이드' ? '#6d28d9' : '#166534'}; font-size:0.8rem; font-weight:700;">${category}</span>
                </div>
                <div style="font-size:0.84rem; color:#64748b; margin-bottom:8px;">
                    <i class="far fa-calendar-alt"></i> ${startDate} ~ ${endDate}
                    <span style="margin:0 6px; color:#cbd5e1;">|</span>
                    <i class="far fa-clock"></i> ${startTime} ~ ${endTime}
                </div>
                <div style="font-size:0.9rem; color:#334155; line-height:1.6;">${content || '내용 없음'}</div>
                <div style="margin-top:10px; padding-top:8px; border-top:1px solid #f1f5f9; display:flex; align-items:center; justify-content:space-between; gap:8px;">
                    <div style="font-size:0.8rem; color:#94a3b8;">작성자: ${author}</div>
                    ${participants ? `<button class="refresh-btn" style="padding:4px 8px;" onclick="openCalendarParticipantsModal('${encodeURIComponent(String(item.title || '일정'))}', '${encodeURIComponent(participants)}', '${participantsMetaEncoded}', '${encodeURIComponent(String(item.author || ''))}')"><i class="fas fa-list"></i> 참여목록</button>` : '<div></div>'}
                </div>
            </div>
        `;
    }).join('');
}

function renderMyUserCalendarEvents() {
    const el = document.getElementById('user-calendar-my-list');
    if (!el) return;
    if (!calendarMyEvents.length) {
        el.innerHTML = '<div style="padding:12px; color:#94a3b8;">작성한 일정이 없습니다.</div>';
        return;
    }

    const badge = (cat) => {
        const c = String(cat || '').trim() || '기타';
        const map = {
            '자유': { bg: '#dbeafe', fg: '#1d4ed8' },
            '레이드': { bg: '#ede9fe', fg: '#6d28d9' },
            '영던': { bg: '#dcfce7', fg: '#166534' },
            '기타': { bg: '#e2e8f0', fg: '#334155' }
        };
        const s = map[c] || map['기타'];
        return `<span style="display:inline-flex; align-items:center; padding:3px 10px; border-radius:999px; background:${s.bg}; color:${s.fg}; font-size:0.8rem; font-weight:700;">${escapeCalendarText(c)}</span>`;
    };

    el.innerHTML = calendarMyEvents.map((item) => {
        const id = Number(item.id || 0);
        const title = escapeCalendarText(item.title || '제목 없음');
        const content = escapeCalendarText(item.content || '').replace(/\n/g, '<br>');
        const startDate = escapeCalendarText(item.target_date || '-');
        const endDate = escapeCalendarText(item.end_date || item.target_date || '-');
        const startTime = String(item.start_time || '00:00:00').substring(0, 5);
        const endTime = String(item.end_time || '00:00:00').substring(0, 5);
        return `
            <div style="background:white; border:1px solid #e2e8f0; border-radius:10px; padding:12px; margin-bottom:10px;">
                <div style="display:flex; justify-content:space-between; gap:8px; align-items:center; margin-bottom:8px;">
                    <div style="font-weight:700; color:#1e293b;">${title}</div>
                    ${badge(item.category)}
                </div>
                <div style="font-size:0.84rem; color:#64748b; margin-bottom:8px;">
                    <i class="far fa-calendar-alt"></i> ${startDate} ~ ${endDate}
                    <span style="margin:0 6px; color:#cbd5e1;">|</span>
                    <i class="far fa-clock"></i> ${startTime} ~ ${endTime}
                </div>
                <div style="font-size:0.9rem; color:#334155; line-height:1.6;">${content || '내용 없음'}</div>
                <div style="margin-top:10px; display:flex; justify-content:flex-end; gap:8px;">
                    <button class="refresh-btn" style="padding:4px 10px; background:#dbeafe; color:#1d4ed8; border:1px solid #bfdbfe;" onclick="openUserCalendarEdit(${id})"><i class="fas fa-edit"></i> 수정</button>
                    <button class="refresh-btn" style="padding:4px 10px; background:#fee2e2; color:#b91c1c; border:1px solid #fecaca;" onclick="deleteUserCalendarEvent(${id})"><i class="fas fa-trash"></i> 삭제</button>
                </div>
            </div>
        `;
    }).join('');
}

function openUserCalendarEdit(eventId) {
    const id = Number(eventId || 0);
    if (!id) return;
    const item = calendarMyEvents.find(v => Number(v.id || 0) === id);
    if (!item) {
        ModalUtils.showAlert('수정할 일정을 찾지 못했습니다.');
        return;
    }
    showCalendarWriteView(item);
}

function openUserCalendarEditFromEncoded(encodedItem) {
    try {
        const parsed = JSON.parse(decodeURIComponent(String(encodedItem || '')));
        if (!parsed || Number(parsed.id || 0) <= 0) {
            ModalUtils.showAlert('수정할 일정을 찾지 못했습니다.');
            return;
        }
        showCalendarWriteView(parsed);
    } catch (_) {
        ModalUtils.showAlert('수정할 일정을 찾지 못했습니다.');
    }
}

async function deleteUserCalendarEvent(eventId) {
    const id = Number(eventId || 0);
    if (!id) return;
    ModalUtils.showConfirm('이 일정을 삭제하시겠습니까?', async () => {
        try {
            const res = await fetch('/api/calendar/events/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id })
            });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || `HTTP ${res.status}`);
            }
            ModalUtils.showAlert('일정이 삭제되었습니다.');
            if (UserCalendarState.calendarInstance) {
                UserCalendarState.calendarInstance.refetchEvents();
            } else {
                refreshUserCalendar();
            }
            if (calendarRightTab === 'mine') {
                loadMyUserCalendarEvents();
            } else if (calendarSubMenu === 'dungeon') {
                loadDungeonPageEvents();
            }
        } catch (e) {
            ModalUtils.handleError(e, '일정 삭제에 실패했습니다.');
        }
    });
}

function goTodayUserCalendar() {
    if (!UserCalendarState.calendarInstance) return;
    UserCalendarState.calendarInstance.today();
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    UserCalendarState.selectedDate = today;
    renderUserCalendarEvents(today);
}

function refreshUserCalendar() {
    if (calendarRightTab === 'mine') {
        loadMyUserCalendarEvents();
    } else if (calendarSubMenu === 'dungeon') {
        loadDungeonPageEvents();
    }
    if (UserCalendarState.calendarInstance) {
        UserCalendarState.calendarInstance.refetchEvents();
        return;
    }
    initUserCalendarTab();
}

function showCalendarWriteView(editItem) {
    openCalendarSubMenu('calendar');
    const mainChar = getCalendarMainCharacter();
    if (!mainChar) {
        ModalUtils.showAlert('대표 캐릭터를 설정해야 게시글을 작성할 수 있습니다.');
        return;
    }
    const listView = document.getElementById('calendar-list-view');
    const writeView = document.getElementById('calendar-write-view');
    if (listView) listView.style.display = 'none';
    if (writeView) writeView.style.display = 'block';
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const isEdit = !!(editItem && Number(editItem.id || 0) > 0);
    const startDateEl = document.getElementById('calendar-write-start-date');
    const endDateEl = document.getElementById('calendar-write-end-date');
    if (startDateEl) startDateEl.value = isEdit ? String(editItem.target_date || '').substring(0, 10) : (UserCalendarState.selectedDate || today);
    if (endDateEl) endDateEl.value = isEdit ? String(editItem.end_date || editItem.target_date || '').substring(0, 10) : (UserCalendarState.selectedDate || today);
    const startTimeEl = document.getElementById('calendar-write-start-time');
    const endTimeEl = document.getElementById('calendar-write-end-time');
    if (startTimeEl) startTimeEl.value = isEdit ? String(editItem.start_time || '00:00:00').substring(0, 5) : '00:00';
    if (endTimeEl) endTimeEl.value = isEdit ? String(editItem.end_time || '00:00:00').substring(0, 5) : '00:00';
    const titleEl = document.getElementById('calendar-write-title');
    const contentEl = document.getElementById('calendar-write-content');
    const categoryEl = document.getElementById('calendar-write-category');
    const searchEl = document.getElementById('calendar-char-search');
    const suggestEl = document.getElementById('calendar-char-suggest-list');
    if (titleEl) titleEl.value = isEdit ? String(editItem.title || '') : '';
    if (contentEl) contentEl.value = isEdit ? String(editItem.content || '') : '';
    if (categoryEl) categoryEl.value = isEdit ? String(editItem.category || '') : '';
    if (searchEl) searchEl.value = '';
    if (suggestEl) {
        suggestEl.innerHTML = '';
        suggestEl.style.display = 'none';
    }
    calendarWriteEditingId = isEdit ? Number(editItem.id || 0) : 0;
    if (isEdit) {
        const meta = Array.isArray(editItem.participants_meta) ? editItem.participants_meta : [];
        const rawNames = String(editItem.participants || '').split(',').map(v => String(v || '').trim()).filter(Boolean);
        if (meta.length) {
            calendarWriteParticipants = meta.map((p) => ({
                guid: Number(p.guid || 0),
                name: String(p.name || '').trim(),
                race: Number(p.race || 0),
                class: Number(p.class || 0),
                level: Number(p.level || 1),
                isAuthor: false
            })).filter((p) => p.name);
        } else {
            calendarWriteParticipants = rawNames.map((name, idx) => ({
                guid: -(idx + 1),
                name,
                race: 0,
                class: 0,
                level: 1,
                isAuthor: false
            }));
        }
    } else {
        calendarWriteParticipants = [];
    }
    const writeTitleEl = document.getElementById('calendar-write-view-title');
    const submitBtn = document.getElementById('calendar-submit-btn');
    if (writeTitleEl) writeTitleEl.innerHTML = isEdit ? '<i class="fas fa-edit"></i> 캘린더 일정 수정' : '<i class="fas fa-pen"></i> 캘린더 일정 작성';
    if (submitBtn) submitBtn.innerHTML = isEdit ? '<i class="fas fa-save"></i> 수정 저장' : '<i class="fas fa-check"></i> 저장하기';
    renderCalendarSelectedParticipants();
    onCalendarCategoryChanged();
}

function showCalendarListView() {
    const listView = document.getElementById('calendar-list-view');
    const writeView = document.getElementById('calendar-write-view');
    if (writeView) writeView.style.display = 'none';
    if (listView) listView.style.display = 'flex';
    calendarWriteEditingId = 0;
    const writeTitleEl = document.getElementById('calendar-write-view-title');
    const submitBtn = document.getElementById('calendar-submit-btn');
    if (writeTitleEl) writeTitleEl.innerHTML = '<i class="fas fa-pen"></i> 캘린더 일정 작성';
    if (submitBtn) submitBtn.innerHTML = '<i class="fas fa-check"></i> 저장하기';
}

async function submitCalendarEvent() {
    const mainChar = getCalendarMainCharacter();
    if (!mainChar) {
        ModalUtils.showAlert('대표 캐릭터를 설정해야 게시글을 작성할 수 있습니다.');
        return;
    }
    const startDate = String(document.getElementById('calendar-write-start-date')?.value || '').trim();
    const endDate = String(document.getElementById('calendar-write-end-date')?.value || '').trim();
    const category = String(document.getElementById('calendar-write-category')?.value || '').trim();
    const startTime = String(document.getElementById('calendar-write-start-time')?.value || '').trim();
    const endTime = String(document.getElementById('calendar-write-end-time')?.value || '').trim();
    const title = String(document.getElementById('calendar-write-title')?.value || '').trim();
    const content = String(document.getElementById('calendar-write-content')?.value || '').trim();

    if (!startDate || !endDate || !category || !title) {
        ModalUtils.showAlert('시작일, 종료일, 카테고리, 제목은 필수입니다.');
        return;
    }
    if (endDate < startDate) {
        ModalUtils.showAlert('종료일은 시작일보다 빠를 수 없습니다.');
        return;
    }
    if (category === '레이드' && !ensureCalendarAuthorParticipant()) {
        return;
    }
    const participants = calendarWriteParticipants.map(p => p.name).join(', ');
    if ((category === '레이드' || category === '영던') && !participants) {
        ModalUtils.showAlert('레이드/영던은 참여 캐릭터를 1명 이상 추가해야 합니다.');
        return;
    }

    try {
        const isEdit = calendarWriteEditingId > 0;
        const url = isEdit ? '/api/calendar/events/update' : '/api/calendar/events/add';
        const payload = {
            target_date: startDate,
            end_date: endDate,
            start_time: startTime ? `${startTime}:00` : '00:00:00',
            end_time: endTime ? `${endTime}:00` : '00:00:00',
            category,
            participants,
            title,
            content
        };
        if (isEdit) payload.id = calendarWriteEditingId;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(text || `HTTP ${res.status}`);
        }
        showCalendarListView();
        ModalUtils.showAlert(isEdit ? '일정이 수정되었습니다.' : '일정이 등록되었습니다.');
        if (UserCalendarState.calendarInstance) {
            UserCalendarState.calendarInstance.refetchEvents();
        }
        if (calendarRightTab === 'mine') {
            loadMyUserCalendarEvents();
        } else if (calendarSubMenu === 'dungeon') {
            loadDungeonPageEvents();
        }
    } catch (e) {
        ModalUtils.handleError(e, calendarWriteEditingId > 0 ? '일정 수정에 실패했습니다.' : '일정 등록에 실패했습니다.');
    }
}

function onCalendarCategoryChanged() {
    const category = String(document.getElementById('calendar-write-category')?.value || '').trim();
    const pane = document.getElementById('calendar-participants-pane');
    const selectedHeader = document.getElementById('calendar-selected-header');
    const selectedList = document.getElementById('calendar-selected-participants');
    const enabled = category === '레이드' || category === '영던';
    if (pane) pane.style.display = enabled ? 'block' : 'none';
    if (selectedHeader) selectedHeader.style.display = enabled ? 'flex' : 'none';
    if (selectedList) selectedList.style.display = enabled ? 'block' : 'none';
    if (!enabled) {
        calendarWriteParticipants = [];
        renderCalendarSelectedParticipants();
        const suggestEl = document.getElementById('calendar-char-suggest-list');
        if (suggestEl) {
            suggestEl.innerHTML = '';
            suggestEl.style.display = 'none';
        }
    } else if (category === '레이드') {
        ensureCalendarAuthorParticipant();
    } else {
        calendarWriteParticipants = calendarWriteParticipants.map((p) => ({
            guid: Number(p.guid || 0),
            name: String(p.name || '').trim(),
            race: Number(p.race || 0),
            class: Number(p.class || 0),
            level: Number(p.level || 1),
            isAuthor: false
        }));
        renderCalendarSelectedParticipants();
    }
}

function onCalendarCharSearchInput() {
    const q = String(document.getElementById('calendar-char-search')?.value || '').trim();
    if (calendarCharSuggestTimer) clearTimeout(calendarCharSuggestTimer);
    calendarCharSuggestTimer = setTimeout(() => {
        searchCalendarCharacters(q);
    }, 180);
}

async function searchCalendarCharacters() {
    const q = String(arguments.length ? (arguments[0] || '') : (document.getElementById('calendar-char-search')?.value || '')).trim();
    const suggestEl = document.getElementById('calendar-char-suggest-list');
    if (!suggestEl) return;
    if (!q) {
        suggestEl.innerHTML = '';
        suggestEl.style.display = 'none';
        return;
    }
    suggestEl.innerHTML = '<div class="calendar-char-msg">검색 중...</div>';
    suggestEl.style.display = 'block';
    try {
        const res = await fetch(`/api/calendar/characters/search?q=${encodeURIComponent(q)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const list = await res.json();
        const rows = Array.isArray(list) ? list : [];
        if (!rows.length) {
            suggestEl.innerHTML = '<div class="calendar-char-msg">검색 결과가 없습니다.</div>';
            suggestEl.style.display = 'block';
            return;
        }
        suggestEl.innerHTML = rows.map((c) => {
            const raceIcon = getRaceImage(c.race, 0) || '/img/icons/faction_alliance.gif';
            const classIcon = getClassImage(c.class) || 'https://warcraft.wiki.gg/wiki/Special:FilePath/ClassIcon_warrior.png';
            return `
            <div class="calendar-char-option"
                 data-guid="${Number(c.guid || 0)}"
                 data-name="${encodeURIComponent(String(c.name || ''))}"
                 data-race="${Number(c.race || 0)}"
                 data-class="${Number(c.class || 0)}"
                 data-level="${Number(c.level || 1)}"
                 onclick="addCalendarParticipantFromBtn(this)">
                <div class="calendar-char-option-main">
                    <img src="${raceIcon}" alt="race" style="width:20px; height:20px; border-radius:50%; object-fit:cover;" onerror="this.src='/img/icons/faction_alliance.gif'">
                    <img src="${classIcon}" alt="class" style="width:20px; height:20px; object-fit:contain;" onerror="this.src='https://warcraft.wiki.gg/wiki/Special:FilePath/ClassIcon_warrior.png'">
                    <div class="calendar-char-option-text">
                        <b>${escapeCalendarText(c.name || '')}</b>
                        <span style="color:#64748b; margin-left:6px;">Lv.${Number(c.level || 1)}</span>
                    </div>
                </div>
                <span class="calendar-char-option-add">추가</span>
            </div>
        `;
        }).join('');
        suggestEl.style.display = 'block';
    } catch (e) {
        suggestEl.innerHTML = '<div class="calendar-char-msg" style="color:#ef4444;">검색에 실패했습니다.</div>';
        suggestEl.style.display = 'block';
    }
}

function addCalendarParticipant(guid, name) {
    const id = Number(guid || 0);
    const nm = String(name || '').trim();
    if (!id || !nm) return;
    if (calendarWriteParticipants.some(p => Number(p.guid) === id)) return;
    calendarWriteParticipants.push({
        guid: id,
        name: nm,
        race: Number(arguments[2] || 0),
        class: Number(arguments[3] || 0),
        level: Number(arguments[4] || 1),
        isAuthor: false
    });
    const category = String(document.getElementById('calendar-write-category')?.value || '').trim();
    if (category === '레이드') {
        ensureCalendarAuthorParticipant();
        return;
    }
    renderCalendarSelectedParticipants();
}

function addCalendarParticipantFromBtn(btn) {
    if (!btn) return;
    const guid = Number(btn.getAttribute('data-guid') || 0);
    const encoded = String(btn.getAttribute('data-name') || '');
    const name = decodeURIComponent(encoded);
    const race = Number(btn.getAttribute('data-race') || 0);
    const cls = Number(btn.getAttribute('data-class') || 0);
    const level = Number(btn.getAttribute('data-level') || 1);
    addCalendarParticipant(guid, name, race, cls, level);
    const searchEl = document.getElementById('calendar-char-search');
    const suggestEl = document.getElementById('calendar-char-suggest-list');
    if (searchEl) searchEl.value = '';
    if (suggestEl) {
        suggestEl.innerHTML = '';
        suggestEl.style.display = 'none';
    }
}

function removeCalendarParticipant(guid) {
    const id = Number(guid || 0);
    const found = calendarWriteParticipants.find(p => Number(p.guid) === id);
    if (found && found.isAuthor) {
        ModalUtils.showAlert('작성자 캐릭터는 참여 목록에서 제외할 수 없습니다.');
        return;
    }
    calendarWriteParticipants = calendarWriteParticipants.filter(p => Number(p.guid) !== id);
    const category = String(document.getElementById('calendar-write-category')?.value || '').trim();
    if (category === '레이드') {
        ensureCalendarAuthorParticipant();
        return;
    }
    renderCalendarSelectedParticipants();
}

function clearCalendarParticipants() {
    const category = String(document.getElementById('calendar-write-category')?.value || '').trim();
    if (category === '레이드') {
        calendarWriteParticipants = calendarWriteParticipants.filter(p => p.isAuthor === true);
        ensureCalendarAuthorParticipant();
    } else {
        calendarWriteParticipants = [];
        renderCalendarSelectedParticipants();
    }
    const suggestEl = document.getElementById('calendar-char-suggest-list');
    const searchEl = document.getElementById('calendar-char-search');
    if (searchEl) searchEl.value = '';
    if (suggestEl) {
        suggestEl.innerHTML = '';
        suggestEl.style.display = 'none';
    }
}

function renderCalendarSelectedParticipants() {
    const el = document.getElementById('calendar-selected-participants');
    const countEl = document.getElementById('calendar-selected-count');
    const category = String(document.getElementById('calendar-write-category')?.value || '').trim();
    const enabled = category === '레이드' || category === '영던';
    if (!el) return;
    if (!enabled) {
        if (countEl) countEl.textContent = '0명';
        el.innerHTML = '';
        return;
    }
    if (countEl) countEl.textContent = `${calendarWriteParticipants.length}명`;
    if (!calendarWriteParticipants.length) {
        el.innerHTML = '<div class="calendar-char-msg">선택된 캐릭터가 없습니다.</div>';
        return;
    }
    el.innerHTML = calendarWriteParticipants.map((p, idx) => `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:6px; border-bottom:1px solid #f1f5f9; padding:6px;">
            <div style="display:flex; align-items:center; gap:8px; min-width:0;">
                <span style="width:22px; height:22px; border-radius:50%; background:${p.isAuthor ? '#fef3c7' : '#eef2ff'}; color:${p.isAuthor ? '#b45309' : '#4338ca'}; display:inline-flex; align-items:center; justify-content:center; font-size:0.75rem; font-weight:800;">${idx + 1}</span>
                <img src="${getRaceImage(p.race, 0) || '/img/icons/faction_alliance.gif'}" alt="race" style="width:18px; height:18px; border-radius:50%; object-fit:cover;" onerror="this.src='/img/icons/faction_alliance.gif'">
                <img src="${getClassImage(p.class) || 'https://warcraft.wiki.gg/wiki/Special:FilePath/ClassIcon_warrior.png'}" alt="class" style="width:18px; height:18px; object-fit:contain;" onerror="this.src='https://warcraft.wiki.gg/wiki/Special:FilePath/ClassIcon_warrior.png'">
                <div style="font-size:0.85rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                    ${p.isAuthor ? '<i class="fas fa-crown" style="color:#f59e0b; margin-right:4px;" title="작성자"></i>' : ''}
                    <b>${escapeCalendarText(p.name)}</b>
                    <span style="color:#64748b; margin-left:6px;">Lv.${Number(p.level || 1)}</span>
                </div>
            </div>
            ${p.isAuthor
                ? '<span style="font-size:0.78rem; color:#b45309; font-weight:700;">작성자</span>'
                : `<button class="refresh-btn" style="padding:4px 8px; background:#fee2e2; color:#b91c1c; border:1px solid #fecaca;" onclick="removeCalendarParticipant(${Number(p.guid)})">삭제</button>`
            }
        </div>
    `).join('');
}

document.addEventListener('click', (e) => {
    const suggestEl = document.getElementById('calendar-char-suggest-list');
    if (!suggestEl || suggestEl.style.display === 'none') return;
    const wrap = document.getElementById('calendar-participants-pane');
    if (!wrap) return;
    if (!wrap.contains(e.target)) {
        suggestEl.style.display = 'none';
    }
});

function openCalendarParticipantsModal(encodedTitle, encodedParticipants, encodedParticipantsMeta, encodedAuthor) {
    const modal = document.getElementById('calendar-participants-modal');
    const titleEl = document.getElementById('calendar-participants-title');
    const listEl = document.getElementById('calendar-participants-list');
    if (!modal || !titleEl || !listEl) return;

    const title = decodeURIComponent(String(encodedTitle || ''));
    const participantsRaw = decodeURIComponent(String(encodedParticipants || ''));
    const names = participantsRaw.split(',').map(v => String(v || '').trim()).filter(Boolean);
    const authorName = decodeURIComponent(String(encodedAuthor || '')).trim();
    const norm = (v) => String(v || '').trim().toLowerCase();
    const isAuthorRow = (name) => norm(name) && norm(name) === norm(authorName);
    let metaRows = [];
    try {
        const parsed = JSON.parse(decodeURIComponent(String(encodedParticipantsMeta || '[]')));
        metaRows = Array.isArray(parsed) ? parsed : [];
    } catch (_) {
        metaRows = [];
    }
    const rows = metaRows.length
        ? metaRows.map((p) => ({
            guid: Number(p.guid || 0),
            name: String(p.name || '').trim(),
            race: Number(p.race || 0),
            class: Number(p.class || 0),
            level: Number(p.level || 1)
        })).filter((p) => p.name)
        : names.map((name) => ({ guid: 0, name, race: 0, class: 0, level: 1 }));

    rows.sort((a, b) => {
        const aa = isAuthorRow(a.name) ? 0 : 1;
        const bb = isAuthorRow(b.name) ? 0 : 1;
        return aa - bb;
    });

    titleEl.textContent = `${title} 참여 캐릭터`;
    if (!rows.length) {
        listEl.innerHTML = '<div style="padding:10px; color:#94a3b8;">참여 캐릭터가 없습니다.</div>';
    } else {
        listEl.innerHTML = rows.map((p, idx) => `
            <div style="display:flex; align-items:center; gap:10px; padding:8px 10px; border-bottom:1px solid #f1f5f9;">
                <span style="width:22px; height:22px; border-radius:50%; background:${isAuthorRow(p.name) ? '#fef3c7' : '#eef2ff'}; color:${isAuthorRow(p.name) ? '#b45309' : '#4338ca'}; display:inline-flex; align-items:center; justify-content:center; font-size:0.75rem; font-weight:800;">${idx + 1}</span>
                <img src="${getRaceImage(p.race, 0) || '/img/icons/faction_alliance.gif'}" alt="race" style="width:18px; height:18px; border-radius:50%; object-fit:cover;" onerror="this.src='/img/icons/faction_alliance.gif'">
                <img src="${getClassImage(p.class) || 'https://warcraft.wiki.gg/wiki/Special:FilePath/ClassIcon_warrior.png'}" alt="class" style="width:18px; height:18px; object-fit:contain;" onerror="this.src='https://warcraft.wiki.gg/wiki/Special:FilePath/ClassIcon_warrior.png'">
                <span style="font-size:0.9rem; color:#1e293b; font-weight:600;">${isAuthorRow(p.name) ? '<i class="fas fa-crown" style="color:#f59e0b; margin-right:4px;" title="작성자"></i>' : ''}${escapeCalendarText(p.name)}</span>
            </div>
        `).join('');
    }
    modal.style.display = 'flex';
}

function closeCalendarParticipantsModal() {
    const modal = document.getElementById('calendar-participants-modal');
    if (modal) modal.style.display = 'none';
}
window.openHomeNoticePost = openHomeNoticePost;

// remove showEventModal as it's no longer used

// Points System
async function updatePointsHeader() {
    try {
        const response = await fetch('/api/user/status');
        if (response.ok) {
            const data = await response.json();
            // Update mobile and desktop points
            const pointDisplays = document.querySelectorAll('#user-points-display, #user-points-display-desktop');
            if (data.points !== undefined) {
                pointDisplays.forEach(el => el.textContent = data.points.toLocaleString());
            }
        }
    } catch (e) {
        console.error("Failed to update points header", e);
    }
}

async function loadPointHistory(page = 1) {
    const tbody = document.getElementById('point-history-list');
    const pagination = document.getElementById('point-history-pagination');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:20px;">로딩 중...</td></tr>';

    try {
        const response = await fetch(`/api/user/points/history?page=${page}`);
        if (!response.ok) throw new Error('Failed to fetch history');
        
        const data = await response.json();
        tbody.innerHTML = '';

        if (!data.logs || data.logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:20px; color:#64748b;">포인트 이용 내역이 없습니다.</td></tr>';
            if (pagination) pagination.innerHTML = '';
            return;
        }

        data.logs.forEach(log => {
            const row = document.createElement('tr');
            
            // Format Amount (+/- color)
            let amountHtml = '';
            if (log.amount > 0) {
                amountHtml = `<span style="color:#10b981; font-weight:bold;">+${log.amount.toLocaleString()}</span>`;
            } else {
                amountHtml = `<span style="color:#ef4444; font-weight:bold;">${log.amount.toLocaleString()}</span>`;
            }

            row.innerHTML = `
                <td>${amountHtml}</td>
                <td style="color:#334155;">${log.reason || '-'}</td>
                <td style="color:#64748b; font-size:0.9rem;">${log.createdAt}</td>
            `;
            tbody.appendChild(row);
        });

        renderPagination(pagination, data, loadPointHistory);

    } catch (e) {
        console.error("Error loading point history:", e);
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:20px; color:#ef4444;">내역을 불러오는데 실패했습니다.</td></tr>';
    }
}

function updateClock() {
    const now = new Date();
    const dateOptions = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' };
    const dateStr = now.toLocaleDateString('ko-KR', dateOptions);
    const timeStr = now.toLocaleTimeString('ko-KR', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const dateEl = document.getElementById('live-date');
    const timeEl = document.getElementById('live-time');

    if (dateEl) dateEl.textContent = dateStr;
    if (timeEl) timeEl.textContent = timeStr;
}
setInterval(updateClock, 1000);
document.addEventListener('DOMContentLoaded', () => {
    LoadingUX.init();
    updateClock();
    updatePointsHeader();
});
window.addEventListener('pageshow', function(event) {
    // Always re-check session status to handle back/forward navigation
    // This ensures UI updates even if the page was restored from bfcache or memory cache
    checkAdminAccess();
});

function escapeHtmlAccount(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}



