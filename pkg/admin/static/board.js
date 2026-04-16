// ========================================
// Board Module - board.js
// ========================================

// Global State
// Use `var` for top-level globals so accidental duplicate script loads
// do not crash with "already been declared" syntax errors.
var g_currentBoard = null;
var g_currentBoardPage = 1;
var g_currentPostId = null;
var g_editingPostId = null; // Track which post is being edited
var g_currentUser = null;
var currentUserMainChar = window.currentUserMainChar || null;
var quillEditor = null;
var g_boards = {}; // Cache board metadata for permission checks
var BOARD_PAGE_SIZE = 10;
var quillEditorSelector = null;
var g_boardAdminAll = [];
var g_boardAdminFiltered = [];
var g_boardAdminPage = 1;
var g_promotionWriteUrls = [''];

function isElementVisible(el) {
    if (!el) return false;
    if (el.offsetParent !== null) return true;
    const style = window.getComputedStyle ? window.getComputedStyle(el) : null;
    return !!(style && style.display !== 'none' && style.visibility !== 'hidden');
}

function pickVisibleElement(candidates) {
    for (var i = 0; i < candidates.length; i++) {
        if (isElementVisible(candidates[i])) return candidates[i];
    }
    for (var j = 0; j < candidates.length; j++) {
        if (candidates[j]) return candidates[j];
    }
    return null;
}

function getBoardTitleInput() {
    const writeView = document.getElementById('board-write-view');
    const inWriteViewBoardTitle = writeView ? writeView.querySelector('#board-post-title') : null;
    const inWriteViewWriteTitle = writeView ? writeView.querySelector('#write-title') : null;
    const globalWriteTitle = document.getElementById('write-title');
    const globalBoardTitle = document.getElementById('board-post-title');
    return pickVisibleElement([
        inWriteViewBoardTitle,
        inWriteViewWriteTitle,
        globalWriteTitle,
        globalBoardTitle
    ]);
}

function getBoardPlainContentInput() {
    const writeView = document.getElementById('board-write-view');
    const inWriteViewBoardContent = writeView ? writeView.querySelector('#board-post-content') : null;
    const inWriteViewWriteContent = writeView ? writeView.querySelector('#write-content') : null;
    const globalWriteContent = document.getElementById('write-content');
    const globalBoardContent = document.getElementById('board-post-content');
    return pickVisibleElement([
        inWriteViewBoardContent,
        inWriteViewWriteContent,
        globalWriteContent,
        globalBoardContent
    ]);
}

function getBoardEditorSelector() {
    const writeView = document.getElementById('board-write-view');
    const inWriteViewBoardEditor = writeView ? writeView.querySelector('#board-post-editor') : null;
    const inWriteViewLegacyEditor = writeView ? writeView.querySelector('#editor-container') : null;
    const globalBoardEditor = document.getElementById('board-post-editor');
    const globalLegacyEditor = document.getElementById('editor-container');
    const selected = pickVisibleElement([
        inWriteViewBoardEditor,
        inWriteViewLegacyEditor,
        globalLegacyEditor,
        globalBoardEditor
    ]);
    if (selected && selected.id === 'board-post-editor') return '#board-post-editor';
    if (selected && selected.id === 'editor-container') return '#editor-container';
    return null;
}

function setBoardWriteBtnState(canWrite) {
    const writeBtn = document.getElementById('board-write-btn');
    if (!writeBtn) return;

    // Always route to full write flow so editor/init state is prepared.
    writeBtn.onclick = openPostWriteModal;

    // Keep layout space reserved to prevent header height shift.
    writeBtn.style.display = 'inline-flex';
    writeBtn.style.visibility = canWrite ? 'visible' : 'hidden';
    writeBtn.style.pointerEvents = canWrite ? 'auto' : 'none';
}

function canCurrentUserWriteBoard(boardId) {
    if (!boardId || !g_currentUser) return false;
    const perms = (g_currentUser.permissions && typeof g_currentUser.permissions === 'object')
        ? g_currentUser.permissions
        : {};
    const permKey = `board_write_${boardId}`;
    if (perms[permKey] === true) return true;

    // Fallback: if permission map is missing/stale, use board metadata rank rule.
    const boardMeta = g_boards && g_boards[boardId] ? g_boards[boardId] : null;
    if (boardMeta) {
        const userRank = Number(g_currentUser.webRank ?? g_currentUser.web_rank ?? 0);
        const minWrite = Number(boardMeta.min_web_write ?? boardMeta.minWebWrite ?? 999);
        if (Number.isFinite(minWrite) && userRank >= minWrite) return true;
    }
    return false;
}

function isPrivilegedBoardWriter() {
    if (!g_currentUser) return false;
    const webRank = Number(g_currentUser.webRank ?? g_currentUser.web_rank ?? 0);
    if (webRank >= 2) return true;
    const perms = (g_currentUser.permissions && typeof g_currentUser.permissions === 'object')
        ? g_currentUser.permissions
        : {};
    return perms.admin_all === true;
}

function getCurrentRepresentativeCharacter() {
    if (window.currentUserMainChar && Number(window.currentUserMainChar.guid || 0) > 0 && String(window.currentUserMainChar.name || '').trim()) {
        return window.currentUserMainChar;
    }
    if (window.g_sessionUser && window.g_sessionUser.mainCharacter &&
        Number(window.g_sessionUser.mainCharacter.guid || 0) > 0 &&
        String(window.g_sessionUser.mainCharacter.name || '').trim()) {
        return window.g_sessionUser.mainCharacter;
    }
    if (currentUserMainChar && Number(currentUserMainChar.guid || 0) > 0 && String(currentUserMainChar.name || '').trim()) {
        return currentUserMainChar;
    }
    return null;
}

function ensureRepresentativeCharacterForWrite() {
    if (isPrivilegedBoardWriter()) return true;
    const rep = getCurrentRepresentativeCharacter();
    if (rep) return true;
    ModalUtils.showAlert('대표 캐릭터를 설정해야 글을 작성할 수 있습니다.');
    return false;
}

function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

window.escapeHtml = escapeHtml;

function renderBoardAuthor(authorName, isStaff, hasEnhancedStone) {
    const safeName = escapeHtml(authorName || '');
    let prefix = '';
    if (hasEnhancedStone === true) {
        prefix += `<i class="fas fa-gem" title="빛나는 영웅석 구독" style="color:#7c3aed; font-size:0.95em;"></i>`;
    }
    if (isStaff) {
        prefix += `<img src="/img/Battlenet_2021_icon.svg" alt="staff" style="width:1em; height:1em; object-fit:contain;">`;
    }
    if (!prefix) return safeName;
    return `<span style="display:inline-flex; align-items:center; gap:4px;">${prefix}${safeName}</span>`;
}

function renderPostTitleWithCommentCount(title, commentCount) {
    const safeTitle = escapeHtml(title || '');
    const count = Number(commentCount || 0);
    if (count <= 0) return safeTitle;
    return `${safeTitle} <span style="color:#3b82f6; font-weight:700;">[${count}]</span>`;
}

function getPostContentHtml(content) {
    const value = (content == null) ? '' : String(content).trim();
    if (!value || value === 'undefined' || value === 'null' || value === '<p><br></p>') {
        return '<div style="color:#94a3b8;">입력된 내용이 없습니다.</div>';
    }
    return value;
}

function isInquiryBoardActive() {
    return String(g_currentBoard || '').toLowerCase() === 'inquiry';
}

function isPromotionBoardActive() {
    return String(g_currentBoard || '').toLowerCase() === 'promotion';
}

function isCurrentUserStaff() {
    if (!g_currentUser) return false;
    const webRank = Number(g_currentUser.web_rank ?? g_currentUser.webRank ?? 0);
    const gmLevel = Number(g_currentUser.gmLevel ?? 0);
    return webRank >= 1 || gmLevel > 0;
}

function getInquiryCategoryInput() {
    return document.getElementById('board-inquiry-category');
}

function toggleInquiryListCategoryFilter() {
    const wrap = document.getElementById('board-inquiry-category-filter-wrap');
    const infoWrap = document.getElementById('board-inquiry-info-wrap');
    const promoInfoWrap = document.getElementById('board-promotion-info-wrap');
    const select = document.getElementById('board-inquiry-category-filter');
    const show = isInquiryBoardActive();
    const showPromo = isPromotionBoardActive();
    if (wrap) wrap.style.display = show ? 'flex' : 'none';
    if (infoWrap) infoWrap.style.display = show ? 'flex' : 'none';
    if (promoInfoWrap) promoInfoWrap.style.display = showPromo ? 'flex' : 'none';
    if (!show && select) select.value = '';
}

function getBoardSubmitButton() {
    const candidates = Array.from(document.querySelectorAll('button[onclick="submitPost()"]'));
    return pickVisibleElement(candidates);
}

function toggleInquiryFields() {
    const wrap = document.getElementById('board-inquiry-fields');
    const promoWrap = document.getElementById('board-promotion-fields');
    const editorWrap = document.getElementById('board-content-field');
    if (wrap) wrap.style.display = isInquiryBoardActive() ? 'block' : 'none';
    if (promoWrap) promoWrap.style.display = isPromotionBoardActive() ? 'block' : 'none';
    if (editorWrap) editorWrap.style.display = isPromotionBoardActive() ? 'none' : 'block';
    bindInquiryCategoryChangeHandler();
    bindInquirySponsorAgreeChangeHandler();
    updateInquirySponsorAgreementUI();
    renderPromotionUrlList();
}

function renderPromotionUrlList() {
    const list = document.getElementById('board-promotion-url-list');
    if (!list) return;
    if (!Array.isArray(g_promotionWriteUrls) || g_promotionWriteUrls.length === 0) g_promotionWriteUrls = [''];
    list.innerHTML = g_promotionWriteUrls.map((u, idx) => `
        <div style="display:flex; gap:8px; align-items:center;">
            <span style="min-width:28px; text-align:right; font-weight:700; color:#475569;">${idx + 1}.</span>
            <input type="text" class="input-premium board-promotion-url-input" data-index="${idx}" value="${escapeHtml(u || '')}" placeholder="https://example.com/promotion">
            <button type="button" class="btn" style="padding:6px 10px; background:#e2e8f0; color:#334155;" onclick="removePromotionUrlInput(${idx})">삭제</button>
        </div>
    `).join('');
}

function collectPromotionUrls() {
    const inputs = document.querySelectorAll('#board-promotion-url-list .board-promotion-url-input');
    const out = [];
    inputs.forEach((el) => {
        const v = String(el.value || '').trim();
        if (v) out.push(v);
    });
    g_promotionWriteUrls = out.length ? out.slice() : [''];
    return out;
}

function addPromotionUrlInput(value) {
    if (!Array.isArray(g_promotionWriteUrls) || g_promotionWriteUrls.length === 0) g_promotionWriteUrls = [''];
    g_promotionWriteUrls.push(String(value || '').trim());
    renderPromotionUrlList();
}
window.addPromotionUrlInput = addPromotionUrlInput;

function removePromotionUrlInput(index) {
    if (!Array.isArray(g_promotionWriteUrls)) g_promotionWriteUrls = [''];
    g_promotionWriteUrls = g_promotionWriteUrls.filter((_, i) => i !== Number(index));
    if (!g_promotionWriteUrls.length) g_promotionWriteUrls = [''];
    renderPromotionUrlList();
}
window.removePromotionUrlInput = removePromotionUrlInput;

function bindInquiryCategoryChangeHandler() {
    const categoryEl = getInquiryCategoryInput();
    if (!categoryEl || categoryEl.dataset.boundChange === '1') return;
    categoryEl.addEventListener('change', updateInquirySponsorAgreementUI);
    categoryEl.dataset.boundChange = '1';
}

function bindInquirySponsorAgreeChangeHandler() {
    const agreeEl = document.getElementById('board-inquiry-sponsor-agree');
    if (!agreeEl || agreeEl.dataset.boundChange === '1') return;
    agreeEl.addEventListener('change', updateInquirySponsorAgreementUI);
    agreeEl.dataset.boundChange = '1';
}

function bindInquirySponsorTransferHandlers() {
    const nameEl = document.getElementById('board-inquiry-sponsor-name');
    const amountEl = document.getElementById('board-inquiry-sponsor-amount');
    const completeBtn = document.getElementById('board-inquiry-sponsor-complete-btn');
    if (nameEl && nameEl.dataset.boundInput !== '1') {
        nameEl.addEventListener('input', updateInquirySponsorAgreementUI);
        nameEl.dataset.boundInput = '1';
    }
    if (amountEl && amountEl.dataset.boundInput !== '1') {
        amountEl.addEventListener('input', updateInquirySponsorAgreementUI);
        amountEl.dataset.boundInput = '1';
    }
    if (completeBtn && completeBtn.dataset.boundClick !== '1') {
        completeBtn.addEventListener('click', markInquirySponsorTransferDone);
        completeBtn.dataset.boundClick = '1';
    }
}

function parseInquirySponsorAmount(value) {
    const raw = String(value || '').replace(/[^\d]/g, '');
    const amount = Number(raw || 0);
    return Number.isFinite(amount) ? amount : 0;
}

function formatInquiryNumber(value) {
    const n = Number(value || 0);
    if (!Number.isFinite(n)) return '0';
    return n.toLocaleString();
}

function resetInquirySponsorTransferDone() {
    const doneEl = document.getElementById('board-inquiry-sponsor-transfer-done');
    const completeBtn = document.getElementById('board-inquiry-sponsor-complete-btn');
    if (doneEl) doneEl.value = '0';
    if (completeBtn) {
        completeBtn.textContent = '입금완료';
        completeBtn.classList.remove('btn-success');
        completeBtn.classList.add('btn-primary');
    }
}

function markInquirySponsorTransferDone() {
    const nameEl = document.getElementById('board-inquiry-sponsor-name');
    const amountEl = document.getElementById('board-inquiry-sponsor-amount');
    const doneEl = document.getElementById('board-inquiry-sponsor-transfer-done');
    const completeBtn = document.getElementById('board-inquiry-sponsor-complete-btn');
    const name = String(nameEl ? nameEl.value : '').trim();
    const amount = parseInquirySponsorAmount(amountEl ? amountEl.value : '');
    if (!name) {
        ModalUtils.showAlert('입금자명을 입력하세요.');
        return;
    }
    if (amount <= 0) {
        ModalUtils.showAlert('금액을 입력하세요.');
        return;
    }
    if (doneEl) doneEl.value = '1';
    if (completeBtn) {
        completeBtn.textContent = '입금완료 처리됨';
        completeBtn.classList.remove('btn-primary');
        completeBtn.classList.add('btn-success');
    }
    updateInquirySponsorAgreementUI();
}

function updateInquirySponsorAgreementUI() {
    const warningEl = document.getElementById('board-inquiry-sponsor-warning');
    const categoryEl = getInquiryCategoryInput();
    const agreeEl = document.getElementById('board-inquiry-sponsor-agree');
    const transferWrapEl = document.getElementById('board-inquiry-sponsor-transfer');
    const transferDoneEl = document.getElementById('board-inquiry-sponsor-transfer-done');
    const sponsorNameEl = document.getElementById('board-inquiry-sponsor-name');
    const sponsorAmountEl = document.getElementById('board-inquiry-sponsor-amount');
    const pointPreviewEl = document.getElementById('board-inquiry-sponsor-point-preview');
    const submitBtn = getBoardSubmitButton();
    if (!warningEl) return;
    bindInquirySponsorTransferHandlers();
    const category = categoryEl ? String(categoryEl.value || '').trim() : '';
    const isSponsorCategory = isInquiryBoardActive() && category === '후원';
    const requireSponsorFlow = isSponsorCategory && !g_editingPostId;
    const show = requireSponsorFlow;
    warningEl.style.display = show ? 'block' : 'none';
    const agreed = !!(agreeEl && agreeEl.checked === true);
    const amount = parseInquirySponsorAmount(sponsorAmountEl ? sponsorAmountEl.value : '');
    const point = Math.floor(amount / 1000);
    if (sponsorAmountEl) {
        const normalized = amount > 0 ? formatInquiryNumber(amount) : '';
        if (sponsorAmountEl.value !== normalized) sponsorAmountEl.value = normalized;
    }
    if (pointPreviewEl) {
        pointPreviewEl.textContent = `예상 지급 포인트: ${formatInquiryNumber(point)}pt (1,000원당 1pt)`;
    }

    if (!show) {
        if (agreeEl) agreeEl.checked = false;
        if (sponsorNameEl) sponsorNameEl.value = '';
        if (sponsorAmountEl) sponsorAmountEl.value = '';
        if (transferWrapEl) {
            transferWrapEl.style.display = 'none';
            transferWrapEl.style.opacity = '1';
        }
        if (sponsorNameEl) sponsorNameEl.disabled = false;
        if (sponsorAmountEl) sponsorAmountEl.disabled = false;
        const completeBtn = document.getElementById('board-inquiry-sponsor-complete-btn');
        if (completeBtn) completeBtn.disabled = false;
        resetInquirySponsorTransferDone();
    } else {
        if (transferWrapEl) {
            transferWrapEl.style.display = 'block';
            transferWrapEl.style.opacity = agreed ? '1' : '0.55';
        }
        if (sponsorNameEl) sponsorNameEl.disabled = !agreed;
        if (sponsorAmountEl) sponsorAmountEl.disabled = !agreed;
        const completeBtn = document.getElementById('board-inquiry-sponsor-complete-btn');
        if (completeBtn) completeBtn.disabled = !agreed;
        if (!agreed) {
            resetInquirySponsorTransferDone();
        }
        const done = transferDoneEl && transferDoneEl.value === '1';
        const nameFilled = !!(sponsorNameEl && String(sponsorNameEl.value || '').trim() !== '');
        if (agreed && (!done || !nameFilled || amount <= 0)) {
            resetInquirySponsorTransferDone();
        }
    }

    if (submitBtn) {
        const done = transferDoneEl && transferDoneEl.value === '1';
        const canSubmit = !requireSponsorFlow || (agreed && done);
        submitBtn.disabled = !canSubmit;
        submitBtn.style.opacity = canSubmit ? '1' : '0.5';
        submitBtn.style.cursor = canSubmit ? 'pointer' : 'not-allowed';
    }
}

function getInquiryCategoryLabel(value) {
    const v = String(value || '').trim();
    return v || '-';
}

function renderInquiryCategoryBadge(category) {
    const label = getInquiryCategoryLabel(category);
    const safe = escapeHtml(label);
    const map = {
        '건의': { icon: 'fa-lightbulb', bg: '#fef3c7', fg: '#92400e', bd: '#fcd34d' },
        '질문': { icon: 'fa-circle-question', bg: '#dbeafe', fg: '#1e40af', bd: '#93c5fd' },
        '후원': { icon: 'fa-hand-holding-heart', bg: '#dcfce7', fg: '#166534', bd: '#86efac' },
        '기타': { icon: 'fa-folder-open', bg: '#f1f5f9', fg: '#334155', bd: '#cbd5e1' }
    };
    const style = map[label] || map['기타'];
    return `<span style="display:inline-flex; align-items:center; gap:6px; background:${style.bg}; color:${style.fg}; border:1px solid ${style.bd}; padding:4px 10px; border-radius:999px; font-size:0.8rem; font-weight:700; white-space:nowrap;"><i class="fas ${style.icon}"></i>${safe}</span>`;
}

function getInquiryStatusLabel(status) {
    const v = String(status || '').toLowerCase().trim();
    if (v === 'done') return '완료';
    if (v === 'point_paid') return '지급완료';
    if (v === 'in_progress') return '진행중';
    return '접수';
}

function renderInquiryStatusBadge(status) {
    const v = String(status || '').toLowerCase().trim();
    const map = {
        'received': { label: '접수', bg: '#e0e7ff', fg: '#3730a3', bd: '#c7d2fe', icon: 'fa-inbox' },
        'in_progress': { label: '진행중', bg: '#fef3c7', fg: '#92400e', bd: '#fcd34d', icon: 'fa-person-digging' },
        'done': { label: '완료', bg: '#dcfce7', fg: '#166534', bd: '#86efac', icon: 'fa-circle-check' },
        'point_paid': { label: '지급완료', bg: '#ffedd5', fg: '#9a3412', bd: '#fdba74', icon: 'fa-coins' }
    };
    const style = map[v] || map['received'];
    return `<span style="display:inline-flex; align-items:center; gap:6px; background:${style.bg}; color:${style.fg}; border:1px solid ${style.bd}; padding:4px 10px; border-radius:999px; font-size:0.8rem; font-weight:700; white-space:nowrap;"><i class="fas ${style.icon}"></i>${style.label}</span>`;
}

// ========================================
// Initialization
// ========================================
function initBoard(user) {
    g_currentUser = user;
    
    // Update write button if it exists and we're on a board
    // Default to false, check board_write_<currentBoard>
    let canWrite = canCurrentUserWriteBoard(g_currentBoard);
    setBoardWriteBtnState(canWrite);
}
window.initBoard = initBoard;
window.openBoard = openBoard;
window.loadPosts = loadPosts;
window.loadBoardsToSidebar = loadBoardsToSidebar;
window.openPromotionBoard = async function() {
    const boardTitle = document.getElementById('board-title');
    if (boardTitle) boardTitle.textContent = '홍보게시판';
    await openBoard('promotion');
    const btn = document.getElementById('tab-btn-promotion');
    if (btn) {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    }
};

// ========================================
// Board Navigation
// ========================================
function pushBoardState(state, replace) {
    if (!window.history || typeof window.history.pushState !== 'function') return;
    const nextState = Object.assign({ app: true, tab: 'board' }, state || {});
    if (replace && typeof window.history.replaceState === 'function') {
        window.history.replaceState(nextState, '', window.location.pathname + window.location.search);
        return;
    }
    const curr = window.history.state || {};
    if (
        curr.app === true &&
        curr.tab === 'board' &&
        curr.view === nextState.view &&
        curr.boardId === nextState.boardId &&
        Number(curr.postId || 0) === Number(nextState.postId || 0) &&
        Number(curr.page || 1) === Number(nextState.page || 1)
    ) {
        return;
    }
    window.history.pushState(nextState, '', window.location.pathname + window.location.search);
}

function pushBoardListState(page, replace) {
    pushBoardState({
        view: 'list',
        boardId: g_currentBoard,
        page: Number(page || g_currentBoardPage || 1)
    }, replace === true);
}

function pushBoardPostState(postId, replace) {
    pushBoardState({
        view: 'post',
        boardId: g_currentBoard,
        page: Number(g_currentBoardPage || 1),
        postId: Number(postId || 0)
    }, replace === true);
}

async function openBoard(boardId, options) {
    options = options || {};
    const trackHistory = options.trackHistory !== false;
    g_currentBoard = boardId;
    g_currentBoardPage = 1;
    toggleInquiryListCategoryFilter();

    // Update board title
    const titles = { 'notice': '공지사항', 'free': '자유게시판' };
    // Ensure metadata exists
    if (!g_boards[boardId]) {
        await loadBoardsToSidebar();
    }

    // Show write button if has permission
    let canWrite = canCurrentUserWriteBoard(boardId);
    setBoardWriteBtnState(canWrite);

    // Switch to board tab
    if (typeof openTab === 'function') openTab('board', { trackHistory: false });

    showBoardListView();
    await loadPosts(1, { trackHistory: false });
    if (trackHistory) {
        pushBoardListState(1, false);
    }
}
window.openBoard = openBoard;

function showBoardListView() {
    const listView = document.getElementById('board-list-view');
    const detailView = document.getElementById('board-detail-view');
    const writeView = document.getElementById('board-write-view');
    const filterBar = document.querySelector('#board .filter-bar');
    if (listView) listView.style.display = 'flex';
    if (detailView) detailView.style.display = 'none';
    if (writeView) writeView.style.display = 'none';
    if (filterBar) filterBar.style.display = 'flex';
}

function showBoardDetailView(pushHistory) {
    const listView = document.getElementById('board-list-view');
    const detailView = document.getElementById('board-detail-view');
    const writeView = document.getElementById('board-write-view');
    const filterBar = document.querySelector('#board .filter-bar');
    if (listView) listView.style.display = 'none';
    if (detailView) detailView.style.display = 'block';
    if (writeView) writeView.style.display = 'none';
    if (filterBar) filterBar.style.display = 'none';
}

function showBoardWriteView() {
    if (!ensureRepresentativeCharacterForWrite()) {
        return false;
    }
    const listView = document.getElementById('board-list-view');
    const detailView = document.getElementById('board-detail-view');
    const writeView = document.getElementById('board-write-view');
    const filterBar = document.querySelector('#board .filter-bar');
    if (listView) listView.style.display = 'none';
    if (detailView) detailView.style.display = 'none';
    if (writeView) writeView.style.display = 'block';
    if (filterBar) filterBar.style.display = 'none';
    toggleInquiryFields();
    return true;
}

// ========================================
// Board List (Sidebar)
// ========================================
async function loadBoardsToSidebar() {
    try {
        const res = await fetch('/api/board/list');
        if (!res.ok) return;
        const data = await res.json();
        const boards = Array.isArray(data) ? data : (data.value || []);

        // Cache ALL board metadata regardless of rank (server enforces read permissions)
        boards.forEach(board => {
            g_boards[board.id] = board;
        });

        const container = document.getElementById('board-sidebar-list');
        if (!container) return;

        // Use current user rank for sidebar display filtering
        const userRank = g_currentUser ? (g_currentUser.webRank || 0) : 0;

        container.innerHTML = '';
        
        // 1. Separate boards by type/permission
        const publicBoards = [];
        const adminBoards = [];

        boards.forEach(board => {
            if (String(board.id || '').toLowerCase() === 'promotion') return;
            // Check if user has read permission for this board
            let canRead = true;
            if (g_currentUser && g_currentUser.permissions) {
                canRead = g_currentUser.permissions[`board_read_${board.id}`] === true;
            }
            if (!canRead) return;

            // Notice, Update, Free are "Public". Others (with rank condition or specific types) might be Admin.
            if (board.min_web_read > 0 || ['report', 'bug'].includes(board.id)) {
                 adminBoards.push(board);
            } else {
                 publicBoards.push(board);
            }
        });

        // 2. Render Public Boards
        publicBoards.forEach(board => createBoardNavItem(container, board));

        // 3. Render Admin Boards with Separator if user has access
        if (adminBoards.length > 0) {
            const separator = document.createElement('div');
            separator.className = 'nav-separator';
            separator.innerHTML = '<span>관리자 게시판</span>';
            container.appendChild(separator);

            adminBoards.forEach(board => createBoardNavItem(container, board));
        }

        await loadSidebarContentMenuOrder();

    } catch (e) {
        console.error('Failed to load boards:', e);
    }
}

function createBoardNavItem(container, board) {
    const div = document.createElement('div');
    div.className = 'nav-item tab-btn';
    div.id = `tab-btn-board-${board.id}`;
    div.onclick = () => {
        const boardTitle = document.getElementById('board-title');
        if (boardTitle) boardTitle.textContent = board.name;
        openBoard(board.id);
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        div.classList.add('active');
    };

    let iconClass = 'fas fa-clipboard-list';
    if (board.id === 'notice') iconClass = 'fas fa-bullhorn';
    else if (board.id === 'free') iconClass = 'fas fa-comments';
    else if (board.id === 'promotion') iconClass = 'fas fa-bullhorn';
    else if (board.type === 'gallery') iconClass = 'fas fa-images';
    else if (board.type === 'update') iconClass = 'fas fa-sync';

    div.innerHTML = `<i class="${iconClass}"></i> ${escapeHtml(board.name)}`;
    container.appendChild(div);
}
window.loadBoardsToSidebar = loadBoardsToSidebar;

// ========================================
// Post List
// ========================================
async function loadPosts(page, options) {
    options = options || {};
    const trackHistory = options.trackHistory !== false;
    if (!g_currentBoard) {
        await loadBoardsToSidebar();
        const firstBoardBtn = document.querySelector('#board-sidebar-list .nav-item.tab-btn[id^="tab-btn-board-"]');
        if (firstBoardBtn && firstBoardBtn.id) {
            g_currentBoard = firstBoardBtn.id.replace('tab-btn-board-', '');
            const boardTitle = document.getElementById('board-title');
            if (boardTitle && g_boards[g_currentBoard]) {
                boardTitle.textContent = g_boards[g_currentBoard].name;
            }
        }
    }

    if (!g_currentBoard) {
        const container = document.getElementById('board-posts-container');
        if (container) {
            container.innerHTML = `<div style="text-align:center; padding:3rem; color:#94a3b8;">표시할 게시판이 없습니다.</div>`;
        }
        return;
    }

    g_currentBoardPage = page;
    const searchEl = document.getElementById('board-search');
    const search = searchEl ? searchEl.value : '';
    const searchTypeEl = document.getElementById('board-search-type');
    const searchType = searchTypeEl ? searchTypeEl.value : 'title_content';
    const inquiryCategoryFilterEl = document.getElementById('board-inquiry-category-filter');
    const inquiryCategoryFilter = inquiryCategoryFilterEl ? String(inquiryCategoryFilterEl.value || '').trim() : '';

    const container = document.getElementById('board-posts-container');
    
    // Force all parents to be visible up to #board (Safety measure)
    let curr = container;
    while(curr && curr.id !== 'board') {
        curr.style.display = (curr.tagName === 'DIV' && !curr.classList.contains('card-body') && curr.id !== 'board-list-view') ? 'block' : ''; 
        if (getComputedStyle(curr).display === 'none') {
            curr.style.display = 'flex';
        }
        curr = curr.parentElement;
    }

    const parentView = document.getElementById('board-list-view');
    if (parentView) parentView.style.display = 'flex';

    if (container) {
        container.style.display = 'block'; 
        // Visual debugs removed
    }

    try {
        const categoryQuery = isInquiryBoardActive() && inquiryCategoryFilter ? `&category=${encodeURIComponent(inquiryCategoryFilter)}` : '';
        const url = `/api/board/posts?board_id=${g_currentBoard}&page=${page}&limit=${BOARD_PAGE_SIZE}&search=${encodeURIComponent(search)}&search_type=${searchType}${categoryQuery}`;
        
        let res = await fetch(url);
        if (res.status === 404) {
            // Board definition may be stale (deleted/renamed). Reload list once and retry.
            await loadBoardsToSidebar();
            if (!g_boards[g_currentBoard]) {
                const firstBoardBtn = document.querySelector('#board-sidebar-list .nav-item.tab-btn[id^="tab-btn-board-"]');
                if (firstBoardBtn && firstBoardBtn.id) {
                    g_currentBoard = firstBoardBtn.id.replace('tab-btn-board-', '');
                }
            }
            const retryCategoryQuery = isInquiryBoardActive() && inquiryCategoryFilter ? `&category=${encodeURIComponent(inquiryCategoryFilter)}` : '';
            const retryUrl = `/api/board/posts?board_id=${g_currentBoard}&page=${page}&limit=${BOARD_PAGE_SIZE}&search=${encodeURIComponent(search)}&search_type=${searchType}${retryCategoryQuery}`;
            res = await fetch(retryUrl);
        }
        if (!res.ok) {
            console.error('loadPosts failed:', res.status, res.statusText);
            if (container) container.innerHTML = `<div style="text-align:center; padding:3rem; color:#ef4444;">게시글을 불러오지 못했습니다. (${res.status})</div>`;
            return;
        }
        const data = await res.json();

        const posts = data.posts || [];
        const total = data.total || 0;
        const totalPages = data.totalPages || data.total_pages || 1;

        renderPostList(posts, total);
        renderBoardPagination(page, totalPages);
        const listView = document.getElementById('board-list-view');
        const detailView = document.getElementById('board-detail-view');
        if (trackHistory && listView && detailView && listView.style.display !== 'none' && detailView.style.display === 'none') {
            pushBoardListState(page, false);
        }
    } catch (e) {
        console.error('Failed to load posts:', e);
        if (container) container.innerHTML = `<div style="text-align:center; padding:3rem; color:#ef4444;">오류 발생: ${e.message}</div>`;
    }
}

function renderPostList(posts, total) {
    const container = document.getElementById('board-posts-container');
    if (!container) {
        return;
    }
    container.style.display = 'block'; // Force visibility check again

    const board = g_boards[g_currentBoard];
    const type = board ? (board.type || 'normal') : 'normal';

    if (posts.length === 0 && type !== 'normal') {
        container.innerHTML = '<div style="text-align:center; padding: 3rem; color: #94a3b8;">게시글이 없습니다.</div>';
        return;
    }

    if (type === 'gallery') {
        renderGalleryBoard(container, posts);
    } else if (type === 'update') {
        renderUpdateBoard(container, posts);
    } else {
        renderNormalBoard(container, posts, total);
    }
}

function renderNormalBoard(container, posts, total) {
    const isMobile = window.innerWidth <= 768;
    const pageSize = BOARD_PAGE_SIZE;
    const isInquiry = isInquiryBoardActive();
    const isPromotion = isPromotionBoardActive();

    if (isMobile) {
        if (!posts.length) {
            container.innerHTML = `
                <table style="width: 100%; border-collapse: collapse;">
                    <thead style="position: sticky; top: 0; background: #f8fafc; z-index: 10;">
                        <tr>
                            <th style="padding: 12px; text-align: center; color: #64748b; font-weight: 600; width: 60px;">번호</th>
                            ${isInquiry ? '<th style="padding: 12px; text-align: center; color: #64748b; font-weight: 600; width: 120px;">카테고리</th>' : ''}
                            ${isInquiry ? '<th style="padding: 12px; text-align: center; color: #64748b; font-weight: 600; width: 120px;">상태</th>' : ''}
                            <th style="padding: 12px; text-align: left; color: #64748b; font-weight: 600;">제목</th>
                            <th style="padding: 12px; text-align: center; color: #64748b; font-weight: 600; width: 120px;">작성자</th>
                            ${isPromotion ? '<th style="padding: 12px; text-align: center; color: #64748b; font-weight: 600; width: 110px;">심사 결과</th>' : ''}
                            ${isPromotion ? '<th style="padding: 12px; text-align: center; color: #64748b; font-weight: 600; width: 120px;">보상 지급</th>' : ''}
                            <th style="padding: 12px; text-align: center; color: #64748b; font-weight: 600; width: 150px;">작성일</th>
                            <th style="padding: 12px; text-align: center; color: #64748b; font-weight: 600; width: 80px;">조회</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td colspan="${isInquiry ? 7 : (isPromotion ? 7 : 5)}" style="padding: 24px; text-align:center; color:#94a3b8;">게시글이 없습니다.</td>
                        </tr>
                    </tbody>
                </table>
            `;
            return;
        }
        container.innerHTML = `
            <ul style="list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:12px;">
                ${posts.map((post, idx) => {
                    const virtualNum = total - ((g_currentBoardPage - 1) * pageSize) - idx;
                    return `
                    <li onclick="viewPost(${post.id})" style="background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:16px; cursor:pointer; box-shadow:0 2px 8px rgba(0,0,0,0.04);">
                        <div style="font-weight:700; font-size:1rem; color:#1e293b; margin-bottom:8px;">
                            <span style="color:#94a3b8; font-size:0.85rem; margin-right:8px;">#${virtualNum}</span>
                            ${renderPostTitleWithCommentCount(post.title, post.comment_count)}
                        </div>
                        <div style="font-size:0.8rem; color:#94a3b8; display:flex; gap:12px; flex-wrap:wrap;">
                            ${isInquiry ? `<span><b>카테고리:</b> ${renderInquiryCategoryBadge(post.category)}</span>` : ''}
                            ${isInquiry ? `<span><b>상태:</b> ${renderInquiryStatusBadge(post.inquiry_status)}</span>` : ''}
                            ${isPromotion ? `<span><b>심사:</b> ${renderPromotionReviewBadge(post.review_status)}</span>` : ''}
                            ${isPromotion ? `<span><b>보상:</b> ${renderPromotionRewardBadge(post.reward_paid)}</span>` : ''}
                            <span>${renderBoardAuthor(post.author_name, post.is_staff_author === true, post.has_enhanced_stone === true)}</span>
                            <span>|</span>
                            <span>${post.created_at}</span>
                        </div>
                    </li>
                `;
                }).join('')}
            </ul>
        `;
    } else {
        container.innerHTML = `
            <table style="width: 100%; border-collapse: collapse;">
                <thead style="position: sticky; top: 0; background: #f8fafc; z-index: 10;">
                    <tr>
                        <th style="padding: 12px; text-align: center; color: #64748b; font-weight: 600; width: 60px;">번호</th>
                        ${isInquiry ? '<th style="padding: 12px; text-align: center; color: #64748b; font-weight: 600; width: 120px;">카테고리</th>' : ''}
                        ${isInquiry ? '<th style="padding: 12px; text-align: center; color: #64748b; font-weight: 600; width: 120px;">상태</th>' : ''}
                        <th style="padding: 12px; text-align: left; color: #64748b; font-weight: 600;">제목</th>
                        <th style="padding: 12px; text-align: center; color: #64748b; font-weight: 600; width: 120px;">작성자</th>
                        ${isPromotion ? '<th style="padding: 12px; text-align: center; color: #64748b; font-weight: 600; width: 110px;">심사 결과</th>' : ''}
                        ${isPromotion ? '<th style="padding: 12px; text-align: center; color: #64748b; font-weight: 600; width: 120px;">보상 지급</th>' : ''}
                        <th style="padding: 12px; text-align: center; color: #64748b; font-weight: 600; width: 150px;">작성일</th>
                        <th style="padding: 12px; text-align: center; color: #64748b; font-weight: 600; width: 80px;">조회</th>
                    </tr>
                </thead>
                <tbody>
                    ${posts.length ? posts.map((post, idx) => {
                        const virtualNum = total - ((g_currentBoardPage - 1) * pageSize) - idx;
                        return `
                        <tr onclick="viewPost(${post.id})" style="cursor:pointer; border-bottom: 1px solid #f1f5f9; transition: background 0.2s;">
                            <td style="padding: 12px; text-align:center; color:#94a3b8;">${virtualNum}</td>
                            ${isInquiry ? `<td style="padding: 12px; text-align:center; color:#334155;">${renderInquiryCategoryBadge(post.category)}</td>` : ''}
                            ${isInquiry ? `<td style="padding: 12px; text-align:center; color:#334155;">${renderInquiryStatusBadge(post.inquiry_status)}</td>` : ''}
                            <td style="padding: 12px; font-weight:500; color: #334155;">${renderPostTitleWithCommentCount(post.title, post.comment_count)}</td>
                            <td style="padding: 12px; text-align:center; color: #475569;">${renderBoardAuthor(post.author_name, post.is_staff_author === true, post.has_enhanced_stone === true)}</td>
                            ${isPromotion ? `<td style="padding: 12px; text-align:center;">${renderPromotionReviewBadge(post.review_status)}</td>` : ''}
                            ${isPromotion ? `<td style="padding: 12px; text-align:center;">${renderPromotionRewardBadge(post.reward_paid)}</td>` : ''}
                            <td style="padding: 12px; text-align:center; font-size:0.85rem; color:#64748b;">${post.created_at}</td>
                            <td style="padding: 12px; text-align:center; color: #64748b;">${post.views || 0}</td>
                        </tr>
                    `;
                    }).join('') : `<tr><td colspan="${isInquiry ? 7 : (isPromotion ? 7 : 5)}" style="padding: 24px; text-align:center; color:#94a3b8;">게시글이 없습니다.</td></tr>`}
                </tbody>
            </table>
        `;
    }
}

function renderPromotionReviewBadge(status) {
    const v = String(status || 'pending').toLowerCase().trim();
    if (v === 'approved') {
        return '<span class="badge active">승인</span>';
    }
    if (v === 'rejected') {
        return '<span class="badge" style="background:#fee2e2; color:#991b1b;">반려</span>';
    }
    return '<span class="badge">대기</span>';
}

function renderPromotionRewardBadge(paid) {
    return paid === true
        ? '<span class="badge active">지급완료</span>'
        : '<span class="badge">미지급</span>';
}

function renderGalleryBoard(container, posts) {
    // Gallery Layout: Grid of cards with thumbnails
    container.innerHTML = `
        <div class="board-gallery-grid">
            ${posts.map(post => {
                // Determine thumbnail (placeholder for now, or extract from content if possible)
                // In a real app, we'd check 'attachments' or parse HTML for first image
                let thumbnail = '/img/no-image.png'; // Default
                const hasImage = post.content && post.content.includes('<img');
                if(hasImage) {
                    const match = post.content.match(/<img[^>]+src="([^">]+)"/);
                    if(match) thumbnail = match[1];
                }

                return `
                <div class="board-gallery-card" onclick="viewPost(${post.id})">
                    <div class="gallery-thumb" style="background-image: url('${thumbnail}');"></div>
                    <div class="gallery-info">
                        <div class="gallery-title">${renderPostTitleWithCommentCount(post.title, post.comment_count)}</div>
                        <div class="gallery-meta">
                            <span>${renderBoardAuthor(post.author_name, post.is_staff_author === true, post.has_enhanced_stone === true)}</span>
                            <span>${post.created_at.split(' ')[0]}</span>
                        </div>
                    </div>
                </div>
                `;
            }).join('')}
        </div>
    `;
}

function renderUpdateBoard(container, posts) {
    // Update Layout: Accordion style (Default collapsed)
    container.innerHTML = `
        <div class="board-update-feed">
            ${posts.map(post => {
                // Determine thumbnail for mini-thumb
                let thumbnail = '';
                const hasImage = post.content && post.content.includes('<img');
                if(hasImage) {
                    const match = post.content.match(/<img[^>]+src="([^">]+)"/);
                    if(match) thumbnail = match[1];
                }

                const thumbHtml = thumbnail
                    ? `<div class="update-thumb-mini" style="background-image: url('${thumbnail}');"></div>`
                    : `<div class="update-thumb-mini"><i class="fas fa-sync-alt"></i></div>`;

                // Version badge
                const versionHtml = post.version
                    ? `<span class="update-version-badge">v${escapeHtml(post.version)}</span>`
                    : `<span class="update-badge">UPDATE</span>`;

                return `
                <div class="update-card" id="update-card-${post.id}" onclick="toggleUpdateAccordion(${post.id})">
                    <div class="update-card-header" style="padding-left: 30px;">
                        ${thumbHtml}
                        <div class="update-info-main">
                            <div style="display: flex; align-items: center; gap: 12px; width: 100%;">
                                ${versionHtml}
                                <div class="update-title">${renderPostTitleWithCommentCount(post.title, post.comment_count)}</div>
                                <span class="update-date" style="margin-left: auto; font-size: 0.8rem; color: #94a3b8; white-space: nowrap;">${post.created_at ? post.created_at.split(' ')[0] : ''}</span>
                            </div>
                        </div>
                        <div class="update-toggle-icon">
                            <i class="fas fa-chevron-down"></i>
                        </div>
                    </div>
                    <div class="update-content-box">
                        <div class="update-full-content">
                            <div style="margin-bottom: 1rem; color: #94a3b8; font-size: 0.85rem; display: flex; gap: 10px;">
                                <span><i class="fas fa-user-circle"></i> ${renderBoardAuthor(post.author_name, post.is_staff_author === true, post.has_enhanced_stone === true)}</span>
                                <span><i class="far fa-calendar-alt"></i> ${post.created_at}</span>
                            </div>
                            ${getPostContentHtml(post.content)}
                            <div style="margin-top: 2rem; padding-top: 1rem; border-top: 1px dashed #e2e8f0; display: flex; justify-content: flex-end; gap: 8px;">
                                ${ ( () => {
                                    const currentUserId = g_currentUser ? (g_currentUser.accountID || g_currentUser.id) : null;
                                    const postAuthorId = post.account_id || post.accountID;
                                    const isAuthor = currentUserId && postAuthorId && (parseInt(postAuthorId) === parseInt(currentUserId));
                                    const isAdmin = g_currentUser && (g_currentUser.web_rank >= 2 || g_currentUser.gmLevel > 0);
                                    return (isAuthor || isAdmin);
                                })() ? `
                                    <button onclick="event.stopPropagation(); openPostEdit(${post.id})" class="btn" style="font-size: 0.85rem; padding: 6px 12px; background: var(--primary-color); color: white;">
                                        수정
                                    </button>
                                    <button onclick="event.stopPropagation(); deletePost(${post.id})" class="btn btn-stop" style="font-size: 0.85rem; padding: 6px 12px;">
                                        삭제
                                    </button>
                                ` : '' }
                                <button onclick="event.stopPropagation(); viewPost(${post.id})" class="btn" style="font-size: 0.85rem; padding: 6px 12px; background: #f1f5f9; color: #475569;">
                                    <i class="fas fa-external-link-alt"></i> 상세 페이지로 보기
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                `;
            }).join('')}
        </div>
    `;
}

function toggleUpdateAccordion(postId) {
    const card = document.getElementById(`update-card-${postId}`);
    if (!card) return;

    // Optional: Close other expanded cards (UI choice, normally better to allow multiple)
    /*
    document.querySelectorAll('.update-card.expanded').forEach(otherCard => {
        if (otherCard !== card) otherCard.classList.remove('expanded');
    });
    */

    card.classList.toggle('expanded');
}
window.toggleUpdateAccordion = toggleUpdateAccordion;

function renderBoardPagination(currentPage, totalPages) {
    const container = document.getElementById('board-pagination');
    if (!container) return;
    const safePage = Math.max(1, Number(currentPage || 1));
    const safeTotalPages = Math.max(1, Number(totalPages || 1));
    if (typeof renderPagination === 'function') {
        renderPagination(container, { page: safePage, totalPages: safeTotalPages }, (p) => loadPosts(p));
        return;
    }

    // Fallback when shared paginator is unavailable
    let html = '<div class="pagination-stable"><div class="pg-slot">';
    html += `<button onclick="loadPosts(${Math.max(1, safePage - 1)})" class="page-btn" ${safePage <= 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i> 이전</button>`;
    html += '</div><div class="pg-numbers">';
    for (let i = 1; i <= safeTotalPages; i++) {
        html += `<button onclick="loadPosts(${i})" class="page-btn ${i === safePage ? 'active' : ''}">${i}</button>`;
    }
    html += '</div><div class="pg-slot">';
    html += `<button onclick="loadPosts(${Math.min(safeTotalPages, safePage + 1)})" class="page-btn" ${safePage >= safeTotalPages ? 'disabled' : ''}>다음 <i class="fas fa-chevron-right"></i></button>`;
    html += '</div></div>';
    container.innerHTML = html;
}

function resetBoardSearch() {
    const searchEl = document.getElementById('board-search');
    const searchTypeEl = document.getElementById('board-search-type');
    const inquiryCategoryFilterEl = document.getElementById('board-inquiry-category-filter');
    if (searchEl) searchEl.value = '';
    if (searchTypeEl) searchTypeEl.value = 'title_content';
    if (inquiryCategoryFilterEl) inquiryCategoryFilterEl.value = '';
    loadPosts(1);
}

function refreshBoard() {
    loadPosts(g_currentBoardPage);
}

// ========================================
// Post Detail View
// ========================================
async function viewPost(id, pushHistory) {
    g_currentPostId = id;

    try {
        const res = await fetch(`/api/board/post?id=${id}`);
        if (!res.ok) {
            ModalUtils.showAlert('게시글을 불러올 수 없습니다');
            return;
        }

        const data = await res.json();
        const post = data.post;
        const isInquiryPost = String(post.board_id || '').toLowerCase() === 'inquiry';
        const comments = isInquiryPost ? (data.inquiry_messages || []) : (data.comments || []);

        const detailView = document.getElementById('board-detail-view');
        const currentUserId = g_currentUser ? (g_currentUser.accountID || g_currentUser.id) : null;
        const postAuthorId = post.account_id || post.accountID;
        
        const isAuthor = currentUserId && postAuthorId && (parseInt(postAuthorId) === parseInt(currentUserId));
        const isAdmin = g_currentUser && (g_currentUser.web_rank >= 2 || g_currentUser.gmLevel > 0);
        
        const canDelete = isAuthor || isAdmin;
        const canEdit = isAuthor || isAdmin;

        detailView.innerHTML = `
            <div style="display: flex; justify-content: space-between; margin-bottom: 1.5rem; align-items: center;">
                <button onclick="showBoardListView()" class="btn" style="background: #e2e8f0; color: #475569; padding: 8px 16px; border-radius: 8px; font-weight: 600;">
                    <i class="fas fa-arrow-left" style="margin-right: 6px;"></i> 목록으로
                </button>
                <div style="display: flex; gap: 0.5rem;">
                    ${canEdit ? `<button onclick="openPostEdit(${id})" class="btn" style="background: var(--primary-color); color: white; padding: 8px 16px; border-radius: 8px;">수정</button>` : ''}
                    ${canDelete ? `<button onclick="deletePost(${id})" class="btn btn-stop" style="padding: 8px 16px; border-radius: 8px;">삭제</button>` : ''}
                </div>
            </div>

            <div style="border-bottom: 1px solid #e2e8f0; padding-bottom: 1.5rem; margin-bottom: 1.5rem;">
                ${post.version ? `<div style="margin-bottom: 0.75rem;"><span style="background: rgba(16,185,129,0.1); color: #059669; border: 1px solid rgba(16,185,129,0.2); padding: 4px 12px; border-radius: 6px; font-size: 0.8rem; font-weight: 700;">v${escapeHtml(post.version)}</span></div>` : ''}
                ${isInquiryPost ? `<div style="margin-bottom: 0.75rem; display:flex; gap:8px; flex-wrap:wrap;">
                    ${renderInquiryCategoryBadge(post.category)}
                    ${renderInquiryStatusBadge(post.inquiry_status)}
                </div>` : ''}
                <h2 style="margin: 0 0 1rem 0; font-size: 1.5rem; color: #1e293b; font-weight: 800; line-height: 1.4;">${escapeHtml(post.title)}</h2>
                <div style="display: flex; gap: 1rem; color: #64748b; font-size: 0.9rem; flex-wrap: wrap;">
                    <span style="display: flex; align-items: center; gap: 6px;"><i class="fas fa-user-circle" style="color: var(--primary-color);"></i> ${renderBoardAuthor(post.author_name, post.is_staff_author === true, post.has_enhanced_stone === true)}</span>
                    <span style="display: flex; align-items: center; gap: 6px; color: #94a3b8;">|</span>
                    <span style="display: flex; align-items: center; gap: 6px;"><i class="far fa-clock"></i> ${post.created_at}</span>
                    <span style="display: flex; align-items: center; gap: 6px; color: #94a3b8;">|</span>
                    <span style="display: flex; align-items: center; gap: 6px;"><i class="far fa-eye"></i> ${post.views || 0}</span>
                </div>
            </div>

            <div style="min-height: 200px; line-height: 1.8; color: #334155; font-size: 1.05rem;">${post.content}</div>

            <hr style="margin: 3rem 0; border: 0; border-top: 1px solid #e2e8f0;">

            <div class="comments-section">
                <h4 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 1.5rem; display: flex; align-items: center; gap: 8px;">
                    <i class="far fa-comments" style="color: var(--primary-color);"></i> ${isInquiryPost ? '문의 대화' : '댓글'} <span style="color: var(--primary-color);">${comments.length}</span>
                </h4>

                <div id="post-comments-list" style="display: flex; flex-direction: column; gap: 1rem;">
                    ${renderComments(comments, isInquiryPost)}
                </div>

                ${
                    isInquiryPost
                        ? `<div style="margin-top:2rem; background:#f8fafc; padding:1.25rem 1.5rem; border-radius:12px; border:1px solid #e2e8f0; color:#64748b; font-size:0.95rem;">
                            <i class="fas fa-circle-info" style="margin-right:6px; color:#2563eb;"></i>
                            답변 등록은 문의관리에서만 가능합니다.
                           </div>`
                        : `<div style="margin-top: 2rem; background: #f8fafc; padding: 1.5rem; border-radius: 12px; border: 1px solid #e2e8f0;">
                            <textarea id="comment-input" placeholder="댓글을 남겨주세요..."
                                style="width: 100%; padding: 12px; border: 1px solid #cbd5e1; border-radius: 8px; min-height: 80px; resize: vertical; margin-bottom: 1rem; font-size: 0.95rem; box-sizing: border-box;"></textarea>
                            <div style="display: flex; justify-content: flex-end;">
                                <button onclick="submitComment(${id})" class="btn btn-primary" style="padding: 10px 24px; font-weight: 600; border-radius: 8px;">댓글 작성</button>
                            </div>
                           </div>`
                }
            </div>
        `;

        showBoardDetailView(false);
        if (pushHistory !== false) {
            pushBoardPostState(id, false);
        }

    } catch (e) {
        console.error('Failed to load post:', e);
        ModalUtils.showAlert('게시글을 불러오는 중 오류가 발생했습니다');
    }
}
window.viewPost = viewPost;

function renderComments(comments, isInquiryPost) {
    if (isInquiryPost) {
        if (!comments || comments.length === 0) {
            return '<div style="text-align:center; padding: 2rem; color: #94a3b8;">등록된 문의/답변이 없습니다.</div>';
        }
        return comments.map((m) => {
            const role = String(m.role || '').toLowerCase() === 'staff' ? 'staff' : 'user';
            const roleBadge = role === 'staff'
                ? '<span style="display:inline-flex;align-items:center;gap:4px;background:#dbeafe;color:#1e40af;border:1px solid #93c5fd;padding:2px 8px;border-radius:999px;font-size:0.75rem;font-weight:700;"><i class="fas fa-user-shield"></i>답변</span>'
                : '<span style="display:inline-flex;align-items:center;gap:4px;background:#f1f5f9;color:#334155;border:1px solid #cbd5e1;padding:2px 8px;border-radius:999px;font-size:0.75rem;font-weight:700;"><i class="fas fa-circle-question"></i>문의</span>';
            return `
                <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:1rem;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem; gap:8px;">
                        <span style="font-weight:600; color:#1e293b; font-size:0.9rem;">${renderBoardAuthor(m.author_name, m.is_staff_author === true, m.has_enhanced_stone === true)}</span>
                        <div style="display:flex; align-items:center; gap:8px;">
                            ${roleBadge}
                            <span style="font-size:0.8rem; color:#94a3b8;">${m.created_at || ''}</span>
                        </div>
                    </div>
                    <div style="color:#334155; line-height:1.6; white-space:pre-wrap;">${escapeHtml(m.content || '')}</div>
                </div>
            `;
        }).join('');
    }

    if (!comments || comments.length === 0) {
        return '<div style="text-align:center; padding: 2rem; color: #94a3b8;">첫 번째 댓글을 남겨보세요!</div>';
    }

    // Build Tree Structure
    const commentMap = {};
    const roots = [];

    comments.forEach(c => {
        c.children = [];
        commentMap[c.id] = c;
    });

    comments.forEach(c => {
        if (c.parent_id && commentMap[c.parent_id]) {
            commentMap[c.parent_id].children.push(c);
        } else {
            roots.push(c);
        }
    });

    return renderCommentTree(roots);
}

function renderCommentTree(nodes) {
    return nodes.map(comment => {
        const currentUserId = g_currentUser ? g_currentUser.id : null;
        const canDelete = comment.author_id === currentUserId;
        const depth = comment.depth || 0;
        const marginLeft = depth * 20; // Indentation

        let html = `
            <div id="comment-${comment.id}" data-comment-id="${comment.id}" style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 1rem; margin-left: ${marginLeft}px; margin-bottom: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                    <span style="font-weight: 600; color: #1e293b; font-size: 0.9rem;">
                        ${depth > 0 ? '<i class="fas fa-reply" style="transform: rotate(180deg); margin-right:4px; color:#94a3b8;"></i>' : ''}
                        ${renderBoardAuthor(comment.author_name, comment.is_staff_author === true, comment.has_enhanced_stone === true)}
                    </span>
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <span style="font-size: 0.8rem; color: #94a3b8;">${comment.created_at}</span>
                        <button onclick="openReplyForm(${comment.id})" style="background:none; border:none; color:#3b82f6; cursor:pointer; font-size:0.8rem; margin-left:8px;">${isInquiryBoardActive() ? '문의/답변' : '답글'}</button>
                        ${canDelete ? `<button onclick="deleteComment(${comment.id})" style="background:none; border:none; color:#ef4444; cursor:pointer; font-size:0.8rem;">삭제</button>` : ''}
                    </div>
                </div>
                <div style="color: #334155; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(comment.content)}</div>
                
                <!-- Reply Form -->
                <div id="reply-form-${comment.id}" style="display:none; margin-top:10px; padding-top:10px; border-top:1px dashed #e2e8f0;">
                    <textarea id="reply-input-${comment.id}" placeholder="${isInquiryBoardActive() ? '문의/답변 내용을 입력하세요...' : '답글을 입력하세요...'}" style="width:100%; padding:8px; border:1px solid #cbd5e1; border-radius:6px; min-height:60px;"></textarea>
                    <div style="text-align:right; margin-top:6px;">
                        <button onclick="submitReply(${g_currentPostId}, ${comment.id})" class="btn btn-primary" style="padding:4px 12px; font-size:0.8rem;">등록</button>
                    </div>
                </div>
            </div>
        `;

        // Configure recursive rendering for children
        if (comment.children && comment.children.length > 0) {
            html += renderCommentTree(comment.children);
        }

        return html;
    }).join('');
}

function openReplyForm(commentId) {
    const el = document.getElementById(`reply-form-${commentId}`);
    if (el) {
        el.style.display = el.style.display === 'none' ? 'block' : 'none';
    }
}
window.openReplyForm = openReplyForm;

function focusBoardComment(commentId) {
    const target = document.getElementById(`comment-${commentId}`);
    if (!target) return false;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const originalTransition = target.style.transition || '';
    const originalBoxShadow = target.style.boxShadow || '';
    const originalBorderColor = target.style.borderColor || '';
    target.style.transition = 'box-shadow 0.25s ease, border-color 0.25s ease';
    target.style.borderColor = '#2563eb';
    target.style.boxShadow = '0 0 0 3px rgba(37, 99, 235, 0.2)';
    setTimeout(() => {
        target.style.boxShadow = originalBoxShadow;
        target.style.borderColor = originalBorderColor;
        target.style.transition = originalTransition;
    }, 1800);
    return true;
}
window.focusBoardComment = focusBoardComment;

async function submitReply(postId, parentId) {
    if (isInquiryBoardActive()) {
        ModalUtils.showAlert('문의 답변은 문의관리에서만 가능합니다.');
        return;
    }
    const contentEl = document.getElementById(`reply-input-${parentId}`);
    const content = contentEl ? contentEl.value.trim() : '';

    if (!content) {
        ModalUtils.showAlert('내용을 입력하세요');
        return;
    }

    try {
        const res = await fetch('/api/board/comment/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                post_id: postId,
                content: content,
                parent_id: parentId
            })
        });

        if (res.ok) {
            await viewPost(postId, false);
        } else {
            const err = await res.text(); // Get error message
            ModalUtils.handleError(err, '답글 작성 실패');
        }
    } catch (e) {
        console.error('Failed to submit reply:', e);
        ModalUtils.showAlert('오류가 발생했습니다');
    }
}
window.submitReply = submitReply;

// ========================================
// Post Write / Edit
// ========================================
function openPostWriteModal() {
    g_editingPostId = null; // Clear edit mode
    if (!showBoardWriteView()) {
        return;
    }
    initQuillEditor();

    // Reset title and header
    const titleEl = getBoardTitleInput();
    if (titleEl) titleEl.value = '';
    const plainContentEl = getBoardPlainContentInput();
    if (plainContentEl) plainContentEl.value = '';
    const inquiryCategoryEl = getInquiryCategoryInput();
    if (inquiryCategoryEl) inquiryCategoryEl.value = '';
    const sponsorAgreeEl = document.getElementById('board-inquiry-sponsor-agree');
    if (sponsorAgreeEl) sponsorAgreeEl.checked = false;
    const sponsorNameEl = document.getElementById('board-inquiry-sponsor-name');
    if (sponsorNameEl) sponsorNameEl.value = '';
    const sponsorAmountEl = document.getElementById('board-inquiry-sponsor-amount');
    if (sponsorAmountEl) sponsorAmountEl.value = '';
    g_promotionWriteUrls = [''];
    resetInquirySponsorTransferDone();
    const headerEl = document.querySelector('#board-write-view h3');
    if (headerEl) headerEl.textContent = '게시글 작성';
    toggleInquiryFields();

    // Show version preview for update-type boards
    const board = g_boards[g_currentBoard];
    const isUpdateBoard = board && board.type === 'update';
    const versionRow = document.getElementById('board-version-row');
    if (versionRow) {
        if (isUpdateBoard) {
            versionRow.style.display = 'block';
            const versionPreview = document.getElementById('board-version-preview');
            if (versionPreview) versionPreview.textContent = '불러오는 중...';
            // Fetch next version from backend
            fetch(`/api/board/next-version?board_id=${g_currentBoard}`)
                .then(r => r.json())
                .then(data => {
                    if (versionPreview) {
                        versionPreview.textContent = `v${data.next}`;
                    }
                })
                .catch(() => {
                    if (versionPreview) versionPreview.textContent = 'v1.0.0';
                });
        } else {
            versionRow.style.display = 'none';
        }
    }
}

async function openPostEdit(postId) {
    g_editingPostId = postId;
    showBoardWriteView();
    initQuillEditor();

    try {
        const res = await fetch(`/api/board/post?id=${postId}`);
        if (!res.ok) {
            const errorText = await res.text();
            console.error(`[DEBUG] Fetch failed with status ${res.status}:`, errorText);
            throw new Error(`Failed to load post data (Status: ${res.status})`);
        }
        
        const data = await res.json();
        const post = data.post || data.value || data;
        
        if (!post) {
            throw new Error('Post data is null in response');
        }

        // Fill fields
        const titleEl = getBoardTitleInput();
        if (titleEl) {
            titleEl.value = post.title || '';
        } else {
        }
        const inquiryCategoryEl = getInquiryCategoryInput();
        if (inquiryCategoryEl) inquiryCategoryEl.value = post.category || '';
        if (isPromotionBoardActive()) {
            g_promotionWriteUrls = Array.isArray(post.promotion_urls) && post.promotion_urls.length
                ? post.promotion_urls.slice()
                : [''];
        } else {
            g_promotionWriteUrls = [''];
        }
        updateInquirySponsorAgreementUI();

        if (quillEditor) {
            quillEditor.root.innerHTML = post.content || '';
        } else {
            const plainContentEl = getBoardPlainContentInput();
            if (plainContentEl) {
                plainContentEl.value = post.content || '';
            } else {
            }
        }

        // Update header UI
        const headerEl = document.querySelector('#board-write-view h3');
        if (headerEl) headerEl.textContent = '게시글 수정';

        // Version row is typically hidden for edits as version is auto-managed
        const versionRow = document.getElementById('board-version-row');
        if (versionRow) versionRow.style.display = 'none';
        toggleInquiryFields();


    } catch (e) {
        console.error('Failed to open post edit:', e);
        ModalUtils.showAlert(`게시글 정보를 불러오는 중 오류가 발생했습니다: ${e.message}`);
        showBoardListView();
    }
}
window.openPostEdit = openPostEdit;
window.openPostWriteModal = openPostWriteModal;

function initQuillEditor() {
    const selector = getBoardEditorSelector();
    if (!selector) {
        quillEditor = null;
        quillEditorSelector = null;
        return;
    }

    if (!quillEditor || quillEditorSelector !== selector) {
        try {
            quillEditor = new Quill(selector, {
            theme: 'snow',
            placeholder: '내용을 입력하세요...',
            modules: {
                toolbar: {
                    container: [
                        [{ 'header': [1, 2, 3, false] }],
                        ['bold', 'italic', 'underline', 'strike'],
                        [{ 'color': [] }, { 'background': [] }],
                        [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                        ['link', 'image'],
                        ['clean']
                    ],
                    handlers: {
                        image: function() {
                            const input = document.createElement('input');
                            input.setAttribute('type', 'file');
                            input.setAttribute('accept', 'image/*');
                            input.click();
                            input.onchange = async () => {
                                const file = input.files[0];
                                if (!file) return;
                                const formData = new FormData();
                                formData.append('file', file);
                                try {
                                    const res = await fetch('/api/board/upload', {
                                        method: 'POST',
                                        body: formData
                                    });
                                    if (res.ok) {
                                        const data = await res.json();
                                        const range = quillEditor.getSelection(true);
                                        quillEditor.insertEmbed(range.index, 'image', data.url);
                                        quillEditor.setSelection(range.index + 1);
                                    } else {
                                        ModalUtils.showAlert('이미지 업로드에 실패했습니다.');
                                    }
                                } catch (e) {
                                    console.error('Image upload error:', e);
                                    ModalUtils.showAlert('이미지 업로드 중 오류가 발생했습니다.');
                                }
                            };
                        }
                    }
                }
            }
        });
            quillEditorSelector = selector;
        } catch (e) {
            console.error('Quill editor initialization failed:', e);
            quillEditor = null;
            quillEditorSelector = null;
        }
    } else {
        quillEditor.setContents([]);
    }
}

async function submitPost() {
    if (!ensureRepresentativeCharacterForWrite()) {
        return;
    }
    const titleEl = getBoardTitleInput();
    const title = titleEl ? titleEl.value.trim() : '';

    if (!title) {
        ModalUtils.showAlert('제목을 입력하세요');
        return;
    }

    let content = '';
    if (quillEditor) {
        content = quillEditor.root.innerHTML;
    } else {
        const plainContentEl = getBoardPlainContentInput();
        if (plainContentEl) {
            content = plainContentEl.value || '';
        } else {
            const legacyEditorEl = document.getElementById('editor-container');
            if (legacyEditorEl) content = legacyEditorEl.innerHTML || '';
        }
    }

    if (!isPromotionBoardActive() && (!content || content === '<p><br></p>')) {
        ModalUtils.showAlert('내용을 입력하세요');
        return;
    }

    try {
        const url = g_editingPostId ? '/api/board/post/update' : '/api/board/post/create';
        const payload = {
            board_id: g_currentBoard,
            title: title,
            content: content
        };
        if (isPromotionBoardActive()) {
            const urls = collectPromotionUrls();
            if (!urls.length) {
                ModalUtils.showAlert('홍보 URL을 1개 이상 입력하세요.');
                return;
            }
            payload.promotion_urls = urls;
        }
        if (isInquiryBoardActive()) {
            const inquiryCategoryEl = getInquiryCategoryInput();
            const category = inquiryCategoryEl ? inquiryCategoryEl.value : '';
            if (!category) {
                ModalUtils.showAlert('문의 카테고리를 선택하세요');
                return;
            }
            if (!g_editingPostId && String(category).trim() === '후원') {
                const sponsorAgreeEl = document.getElementById('board-inquiry-sponsor-agree');
                if (!sponsorAgreeEl || sponsorAgreeEl.checked !== true) {
                    ModalUtils.showAlert('후원 카테고리는 안내문 동의 후 등록할 수 있습니다.');
                    return;
                }
                const sponsorDoneEl = document.getElementById('board-inquiry-sponsor-transfer-done');
                const sponsorNameEl = document.getElementById('board-inquiry-sponsor-name');
                const sponsorAmountEl = document.getElementById('board-inquiry-sponsor-amount');
                const sponsorName = sponsorNameEl ? String(sponsorNameEl.value || '').trim() : '';
                const sponsorAmount = parseInquirySponsorAmount(sponsorAmountEl ? sponsorAmountEl.value : '');
                if (!sponsorName || sponsorAmount <= 0) {
                    ModalUtils.showAlert('입금자명과 금액을 입력하세요.');
                    return;
                }
                if (!sponsorDoneEl || sponsorDoneEl.value !== '1') {
                    ModalUtils.showAlert('입금완료 버튼을 눌러야 등록할 수 있습니다.');
                    return;
                }
                const sponsorPoint = Math.floor(sponsorAmount / 1000);
                payload.content = `${content}<hr><p><strong>[후원 입금 정보]</strong></p><p>입금자명: ${escapeHtml(sponsorName)}</p><p>입금금액: ${formatInquiryNumber(sponsorAmount)}원</p><p>예상 포인트: ${formatInquiryNumber(sponsorPoint)}pt</p>`;
            }
            payload.category = category;
        }

        if (g_editingPostId) {
            payload.id = g_editingPostId;
        }

        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            if (g_editingPostId) {
                viewPost(g_editingPostId);
            } else {
                showBoardListView();
                loadPosts(1);
            }
            g_editingPostId = null;
        } else {
            ModalUtils.showAlert(g_editingPostId ? '게시글 수정에 실패했습니다' : '게시글 작성에 실패했습니다');
        }
    } catch (e) {
        console.error('Failed to submit post:', e);
        ModalUtils.showAlert('게시글 처리 중 오류가 발생했습니다');
    }
}

function cancelPostWrite() {
    showBoardListView();
}
window.cancelPostWrite = cancelPostWrite;

function closePostWrite() {
    showBoardListView();
}
window.closePostWrite = closePostWrite;

// ========================================
// Post Delete
// ========================================
async function deletePost(id) {
    ModalUtils.showConfirm('게시글을 삭제하시겠습니까?', async () => {
        try {
            const res = await fetch(`/api/board/post/delete?id=${id}`, { method: 'POST' });
            if (res.ok) {
                showBoardListView();
                loadPosts(g_currentBoardPage);
            } else {
                ModalUtils.showAlert('삭제 실패');
            }
        } catch (e) {
            console.error('Failed to delete post:', e);
            ModalUtils.showAlert('오류가 발생했습니다');
        }
    });
}

// ========================================
// Comments
// ========================================
async function submitComment(postId, parentId) {
    if (isInquiryBoardActive()) {
        ModalUtils.showAlert('문의 답변은 문의관리에서만 가능합니다.');
        return;
    }

    const contentEl = document.getElementById('comment-input');
    const content = contentEl ? contentEl.value.trim() : '';

    if (!content) {
        ModalUtils.showAlert('내용을 입력하세요');
        return;
    }

    try {
        const res = await fetch('/api/board/comment/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                post_id: postId,
                content: content,
                parent_id: parentId
            })
        });

        if (res.ok) {
            if (contentEl) contentEl.value = '';
            await viewPost(postId, false);
        } else {
            ModalUtils.showAlert('댓글 작성에 실패했습니다');
        }
    } catch (e) {
        console.error('Failed to submit comment:', e);
        ModalUtils.showAlert('댓글 작성 중 오류가 발생했습니다');
    }
}

async function deleteComment(commentId) {
    ModalUtils.showConfirm('댓글을 삭제하시겠습니까?', async () => {
        try {
            const res = await fetch(`/api/board/comment/delete?id=${commentId}`, { method: 'POST' });
            if (res.ok) {
                await viewPost(g_currentPostId, false);
            } else {
                ModalUtils.showAlert('댓글 삭제에 실패했습니다');
            }
        } catch (e) {
            console.error('Failed to delete comment:', e);
            ModalUtils.showAlert('댓글 삭제 중 오류가 발생했습니다');
        }
    });
}

// ========================================
// Board Management (Admin)
// ========================================
function openBoardDefModal(id = '', name = '', read = 0, write = 0, attach = true, rich = true, emoji = true, nested = true, type = 'normal') {
    const modal = document.getElementById('board-def-modal');
    if (!modal) return;

    document.getElementById('board-def-id').value = id;
    document.getElementById('board-def-name').value = name;
    document.getElementById('board-def-read').value = read;
    document.getElementById('board-def-write').value = write;
    document.getElementById('board-def-attachments').checked = attach;
    document.getElementById('board-def-richeditor').checked = rich;
    document.getElementById('board-def-emoji').checked = emoji;
    document.getElementById('board-def-write').value = write;
    document.getElementById('board-def-type').value = type || 'normal';
    document.getElementById('board-def-attachments').checked = attach;
    document.getElementById('board-def-richeditor').checked = rich;
    document.getElementById('board-def-emoji').checked = emoji;
    document.getElementById('board-def-nested').checked = nested;

    // If ID is provided, it's an update
    document.getElementById('board-def-id').disabled = id !== '';
    document.getElementById('board-def-modal-title').textContent = id ? '게시판 수정' : '새 게시판 생성';

    modal.style.display = 'flex';
}
window.openBoardDefModal = openBoardDefModal;

function closeBoardDefModal() {
    const modal = document.getElementById('board-def-modal');
    if (modal) modal.style.display = 'none';
}
window.closeBoardDefModal = closeBoardDefModal;

async function submitBoardDef() {
    const id = document.getElementById('board-def-id').value;
    const name = document.getElementById('board-def-name').value;
    const minWebRead = parseInt(document.getElementById('board-def-read').value);
    const minWebWrite = parseInt(document.getElementById('board-def-write').value);
    const type = document.getElementById('board-def-type').value;
    const allowAttachments = document.getElementById('board-def-attachments').checked;
    const allowRichEditor = document.getElementById('board-def-richeditor').checked;
    const allowEmoji = document.getElementById('board-def-emoji').checked;
    const allowNested = document.getElementById('board-def-nested').checked;

    if (!id || !name) {
        ModalUtils.showAlert('필수 정보를 입력하세요.');
        return;
    }

    const isUpdate = document.getElementById('board-def-id').disabled;
    const url = isUpdate ? '/api/admin/board/update' : '/api/admin/board/create';

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: id,
                name: name,
                min_web_read: minWebRead,
                min_web_write: minWebWrite,
                type: type,
                allow_attachments: allowAttachments,
                allow_rich_editor: allowRichEditor,
                allow_emoji: allowEmoji,
                allow_nested_comments: allowNested
            })
        });

        if (res.ok) {
            ModalUtils.showAlert(isUpdate ? '게시판이 수정되었습니다.' : '게시판이 생성되었습니다.');
            closeBoardDefModal();
            loadBoardsToSidebar();
        } else {
            const err = await res.text();
            ModalUtils.showAlert('저장 실패: ' + err);
        }
    } catch (e) {
        console.error('Failed to submit board def:', e);
        ModalUtils.showAlert('저장 중 오류가 발생했습니다.');
    }
}
window.submitBoardDef = submitBoardDef;

async function deleteBoard(id) {
    ModalUtils.showConfirm(`'${id}' 게시판을 삭제하시겠습니까? 모든 게시글과 댓글이 삭제됩니다.`, async () => {
        try {
            const res = await fetch(`/api/admin/board/delete?id=${id}`, { method: 'POST' });
            if (res.ok) {
                ModalUtils.showAlert('게시판이 삭제되었습니다.');
                loadBoardsToSidebar();
            } else {
                ModalUtils.showAlert('삭제 실패');
            }
        } catch (e) {
            console.error('Failed to delete board:', e);
        }
    });
}
window.deleteBoard = deleteBoard;

// ========================================
// Board Admin List
// ========================================
async function loadBoardListAdmin() {
    const tbody = document.getElementById('board-admin-list');
    const pg = document.getElementById('board-admin-pagination');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">로딩 중...</td></tr>';
    if (pg) pg.innerHTML = '';

    try {
        const res = await fetch('/api/board/list');
        if (!res.ok) throw new Error('Failed to load');
        g_boardAdminAll = await res.json();
        g_boardAdminFiltered = Array.isArray(g_boardAdminAll) ? [...g_boardAdminAll] : [];

        if (!g_boardAdminFiltered.length) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">게시판이 없습니다.</td></tr>';
            return;
        }
        renderBoardAdminPage(1);
    } catch (e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:red;">로딩 실패</td></tr>';
    }
}
window.loadBoardListAdmin = loadBoardListAdmin;

function renderBoardAdminPage(page = 1) {
    const tbody = document.getElementById('board-admin-list');
    const pg = document.getElementById('board-admin-pagination');
    if (!tbody) return;
    g_boardAdminPage = Math.max(1, page);

    if (!g_boardAdminFiltered.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">게시판이 없습니다.</td></tr>';
        if (pg) pg.innerHTML = '';
        return;
    }

    const start = (g_boardAdminPage - 1) * BOARD_PAGE_SIZE;
    const rows = g_boardAdminFiltered.slice(start, start + BOARD_PAGE_SIZE);

    let html = '';
    rows.forEach(b => {
        html += `
            <tr>
                <td>${b.id}</td>
                <td>${escapeHtml(b.name)}</td>
                <td style="text-align:center;">${b.min_web_read}</td>
                <td style="text-align:center;">${b.min_web_write}</td>
                <td style="text-align:center;"><span class="badge ${b.type === 'update' ? 'badge-update' : (b.type === 'gallery' ? 'badge-gallery' : 'badge-normal')}">${b.type}</span></td>
                <td style="text-align:center;">
                    <button onclick="openBoardDefModal('${b.id}', '${escapeHtml(b.name)}', ${b.min_web_read}, ${b.min_web_write}, ${b.allow_attachments}, ${b.allow_rich_editor}, ${b.allow_emoji}, ${b.allow_nested_comments}, '${b.type}')" class="btn btn-edit" style="padding:4px 8px; font-size:0.8rem;">수정</button>
                    <button onclick="deleteBoard('${b.id}')" class="btn btn-stop" style="padding:4px 8px; font-size:0.8rem;">삭제</button>
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html;

    if (pg && typeof renderPagination === 'function') {
        renderPagination(pg, {
            page: g_boardAdminPage,
            totalPages: Math.max(1, Math.ceil(g_boardAdminFiltered.length / BOARD_PAGE_SIZE))
        }, (p) => renderBoardAdminPage(p));
    }
}

function filterBoardAdmin() {
    const search = (document.getElementById('board-admin-search')?.value || '').toLowerCase().trim();
    g_boardAdminFiltered = (g_boardAdminAll || []).filter((b) => {
        const text = `${b.id || ''} ${b.name || ''} ${b.type || ''}`.toLowerCase();
        return !search || text.includes(search);
    });
    renderBoardAdminPage(1);
}
window.filterBoardAdmin = filterBoardAdmin;

function resetBoardAdminSearch() {
    const el = document.getElementById('board-admin-search');
    if (el) el.value = '';
    loadBoardListAdmin();
}
window.resetBoardAdminSearch = resetBoardAdminSearch;

// Alias for HTML onclick
window.openBoardCreateModal = () => openBoardDefModal();


// Utility functions have been moved to the top of this file to ensure early availability.

// ========================================
// Board Write Button Visibility
// ========================================
function updateBoardWriteBtn(user) {
    g_currentUser = user;
    let canWrite = false;
    if (g_currentUser && g_currentUser.permissions && g_currentBoard) {
        canWrite = g_currentUser.permissions[`board_write_${g_currentBoard}`] === true;
    }
    setBoardWriteBtnState(canWrite);
}

// ========================================
// URL Hash Navigation
// ========================================
window.addEventListener('hashchange', function() {
    const hash = window.location.hash;
    if (hash.startsWith('#board/post/')) {
        const postId = parseInt(hash.replace('#board/post/', ''));
        if (postId) viewPost(postId, false);
    }
});

window.restoreBoardState = async function(state) {
    const boardId = state && state.boardId ? String(state.boardId) : g_currentBoard;
    const page = Number((state && state.page) || 1);
    const view = state && state.view ? String(state.view) : 'list';
    const postId = Number((state && state.postId) || 0);

    if (!boardId) {
        if (typeof openTab === 'function') openTab('board', { trackHistory: false });
        await loadPosts(1, { trackHistory: false });
        showBoardListView();
        return;
    }

    g_currentBoard = boardId;
    g_currentBoardPage = page > 0 ? page : 1;
    toggleInquiryListCategoryFilter();
    if (typeof openTab === 'function') openTab('board', { trackHistory: false });

    if (!g_boards[g_currentBoard]) {
        await loadBoardsToSidebar();
    }
    const boardTitle = document.getElementById('board-title');
    if (boardTitle && g_boards[g_currentBoard]) {
        boardTitle.textContent = g_boards[g_currentBoard].name;
    }

    if (view === 'post' && postId > 0) {
        await viewPost(postId, false);
        return;
    }

    showBoardListView();
    await loadPosts(g_currentBoardPage, { trackHistory: false });
};

// ========================================
// Board Admin Tabs & Order Management
// ========================================
function openBoardSubTab(tabName) {
    // Buttons
    document.querySelectorAll('#board-admin .log-sub-tab-btn').forEach(btn => {
        const isTarget = btn.getAttribute('onclick').includes(`'${tabName}'`);
        btn.classList.toggle('active', isTarget);
    });

    // Content
    document.querySelectorAll('#board-admin .log-sub-content').forEach(content => {
        const isTarget = content.id === `board-sub-${tabName}`;
        content.style.display = isTarget ? 'block' : 'none';
        content.classList.toggle('active', isTarget);
    });

    if (tabName === 'order') {
        loadBoardOrderList();
    } else if (tabName === 'list') {
        loadBoardListAdmin();
    }
}
window.openBoardSubTab = openBoardSubTab;

async function loadBoardOrderList() {
    const userContainer = document.getElementById('board-order-list-user');
    const adminContainer = document.getElementById('board-order-list-admin');
    if (!userContainer || !adminContainer) return;

    userContainer.innerHTML = '<div style="text-align:center; padding:20px;">로딩 중...</div>';
    adminContainer.innerHTML = '<div style="text-align:center; padding:20px;">로딩 중...</div>';

    try {
        const [boardRes, menuRes] = await Promise.all([
            fetch('/api/board/list'),
            fetch('/api/admin/menu-order/list')
        ]);
        if (!boardRes.ok) throw new Error('Failed to load boards');
        const boards = await boardRes.json();
        let adminMenus = [];
        if (menuRes.ok) {
            const m = await menuRes.json();
            adminMenus = Array.isArray(m.menus) ? m.menus : [];
        }

        if (!boards || boards.length === 0) {
            userContainer.innerHTML = '<div style="text-align:center; padding:20px;">게시판이 없습니다.</div>';
            adminContainer.innerHTML = '<div style="text-align:center; padding:20px;">게시판이 없습니다.</div>';
            return;
        }
        const userBoards = boards.filter(b => !(b.min_web_read > 0 || ['report', 'bug'].includes(b.id)));
        const adminBoards = boards.filter(b => (b.min_web_read > 0 || ['report', 'bug'].includes(b.id)));

        const renderItem = (b) => `
            <div class="order-item" data-id="${b.id}" style="display:flex; align-items:center; padding:12px 16px; background:white; border:1px solid #e2e8f0; border-radius:8px; margin-bottom:8px; cursor:grab; transition: all 0.2s;">
                <i class="fas fa-grip-vertical" style="color:#94a3b8; margin-right:16px;"></i>
                <span style="font-weight:600; color:#1e293b; min-width:100px;">${b.id}</span>
                <span style="color:#64748b;">${escapeHtml(b.name)}</span>
            </div>
        `;

        userContainer.innerHTML = userBoards.length
            ? userBoards.map(renderItem).join('')
            : '<div style="text-align:center; padding:20px; color:#94a3b8;">유저 게시판이 없습니다.</div>';

        const contentMenuIds = new Set(['connect-guide', 'carddraw', 'shop']);
        const userMenuIds = new Set(['mailbox', 'calendar', 'auction']);
        const contentMenus = adminMenus.filter(m => contentMenuIds.has(String(m.id || '')));
        const userMenus = adminMenus.filter(m => userMenuIds.has(String(m.id || '')));
        const managerMenus = adminMenus.filter(m => !contentMenuIds.has(String(m.id || '')) && !userMenuIds.has(String(m.id || '')));

        const contentItems = [
            ...contentMenus.map((menu, idx) => ({
                id: menu.id,
                name: menu.name || menu.id,
                order: Number.isFinite(Number(menu.order)) ? Number(menu.order) : (100 + idx),
                badge: '컨텐츠'
            })),
            ...userMenus.map((menu, idx) => ({
                id: menu.id,
                name: menu.name || menu.id,
                order: Number.isFinite(Number(menu.order)) ? Number(menu.order) : (110 + idx),
                badge: '유저메뉴'
            }))
        ].sort((a, b) => {
            const orderDiff = Number(a.order || 0) - Number(b.order || 0);
            if (orderDiff !== 0) return orderDiff;
            return String(a.name || '').localeCompare(String(b.name || ''), 'ko');
        });

        const userBoardHtml = userBoards.length
            ? userBoards.map(renderItem).join('')
            : '<div style="text-align:center; padding:12px; color:#94a3b8;">유저 게시판이 없습니다.</div>';
        const contentListHtml = contentItems.length
            ? contentItems.map(item => `
                <div class="order-item order-item-user-content"
                    data-id="${item.id}"
                    data-menu-group="${contentMenuIds.has(String(item.id || '')) ? 'content' : 'user'}"
                    style="display:flex; align-items:center; padding:12px 16px; background:white; border:1px solid #e2e8f0; border-radius:8px; margin-bottom:8px; cursor:grab; transition: all 0.2s;">
                    <i class="fas fa-grip-vertical" style="color:#94a3b8; margin-right:16px;"></i>
                    <span style="font-weight:600; color:#1e293b; min-width:130px;">${escapeHtml(item.id)}</span>
                    <span style="color:#64748b; flex:1;">${escapeHtml(item.name)}</span>
                    <span style="font-size:0.75rem; font-weight:700; color:#475569; background:#f1f5f9; border:1px solid #e2e8f0; border-radius:999px; padding:4px 10px;">${escapeHtml(item.badge)}</span>
                </div>
            `).join('')
            : '<div style="text-align:center; padding:12px; color:#94a3b8;">컨텐츠 메뉴가 없습니다.</div>';

        userContainer.innerHTML = `
            <div style="margin-bottom:10px; font-weight:700; color:#334155;">게시판</div>
            <div id="board-order-list-user-boards" style="margin-bottom:16px;">${userBoardHtml}</div>
            <div style="margin-bottom:10px; font-weight:700; color:#334155;">컨텐츠</div>
            <div style="margin-bottom:10px; font-size:0.84rem; color:#64748b;">알림함, 캘린더, 경매장, 접속방법, 카드뽑기, 선술집 메뉴를 드래그하여 정렬할 수 있습니다.</div>
            <div id="board-order-list-user-content">${contentListHtml}</div>
        `;

        const adminBoardHtml = adminBoards.length
            ? adminBoards.map(renderItem).join('')
            : '<div style="text-align:center; padding:12px; color:#94a3b8;">관리자 게시판이 없습니다.</div>';
        const adminMenuHtml = managerMenus.length
            ? managerMenus.map(m => `
                <div class="order-item order-item-admin-menu" data-menu-id="${m.id}" style="display:flex; align-items:center; padding:12px 16px; background:white; border:1px solid #e2e8f0; border-radius:8px; margin-bottom:8px; cursor:grab; transition: all 0.2s;">
                    <i class="fas fa-grip-vertical" style="color:#94a3b8; margin-right:16px;"></i>
                    <span style="font-weight:600; color:#1e293b; min-width:130px;">${m.id}</span>
                    <span style="color:#64748b;">${escapeHtml(m.name || m.id)}</span>
                </div>
            `).join('')
            : '<div style="text-align:center; padding:12px; color:#94a3b8;">관리자 메뉴가 없습니다.</div>';

        adminContainer.innerHTML = `
            <div style="margin-bottom:10px; font-weight:700; color:#334155;">관리자 게시판</div>
            <div id="board-order-list-admin-boards" style="margin-bottom:14px;">${adminBoardHtml}</div>
            <div style="margin-bottom:10px; font-weight:700; color:#334155;">관리자 메뉴</div>
            <div id="board-order-list-admin-menus">${adminMenuHtml}</div>
        `;

        const initSortable = (el) => {
            if (!window.Sortable || !el) return;
            new Sortable(el, {
                animation: 150,
                ghostClass: 'sortable-ghost',
                dragClass: 'sortable-drag'
            });
        };
        initSortable(document.getElementById('board-order-list-user-boards'));
        initSortable(document.getElementById('board-order-list-user-content'));
        initSortable(document.getElementById('board-order-list-admin-boards'));
        initSortable(document.getElementById('board-order-list-admin-menus'));

    } catch (e) {
        console.error(e);
        userContainer.innerHTML = '<div style="text-align:center; padding:20px; color:red;">로딩 실패</div>';
        adminContainer.innerHTML = '<div style="text-align:center; padding:20px; color:red;">로딩 실패</div>';
    }
}

async function saveBoardOrder() {
    const userContainer = document.getElementById('board-order-list-user');
    const userBoardsContainer = document.getElementById('board-order-list-user-boards');
    const userContentContainer = document.getElementById('board-order-list-user-content');
    const adminBoardsContainer = document.getElementById('board-order-list-admin-boards');
    const adminMenusContainer = document.getElementById('board-order-list-admin-menus');
    if (!userContainer || !userBoardsContainer || !userContentContainer || !adminBoardsContainer || !adminMenusContainer) return;

    const userIds = Array.from(userBoardsContainer.querySelectorAll('.order-item')).map(item => item.getAttribute('data-id'));
    const adminIds = Array.from(adminBoardsContainer.querySelectorAll('.order-item')).map(item => item.getAttribute('data-id'));
    const contentItems = Array.from(userContentContainer.querySelectorAll('.order-item-user-content'));
    const contentMenuIds = contentItems
        .filter(item => item.getAttribute('data-menu-group') === 'content')
        .map(item => item.getAttribute('data-id'));
    const userMenuIds = contentItems
        .filter(item => item.getAttribute('data-menu-group') === 'user')
        .map(item => item.getAttribute('data-id'));
    const adminMenuIds = Array.from(adminMenusContainer.querySelectorAll('.order-item-admin-menu')).map(item => item.getAttribute('data-menu-id'));
    const ids = userIds.concat(adminIds);
    if (ids.length === 0 && contentMenuIds.length === 0 && userMenuIds.length === 0 && adminMenuIds.length === 0) return;

    try {
        let boardOk = true;
        let menuOk = true;
        let errMsg = '';

        if (ids.length > 0) {
            const res = await fetch('/api/admin/board/update-order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(ids)
            });
            boardOk = res.ok;
            if (!res.ok) errMsg = await res.text();
        }

        const menuPayload = {
            content_menu_ids: contentMenuIds,
            user_menu_ids: userMenuIds,
            admin_menu_ids: adminMenuIds
        };
        if (contentMenuIds.length > 0 || userMenuIds.length > 0 || adminMenuIds.length > 0) {
            const mres = await fetch('/api/admin/menu-order/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(menuPayload)
            });
            menuOk = mres.ok;
            if (!mres.ok) errMsg = await mres.text();
        }

        if (boardOk && menuOk) {
            if (window.ModalUtils && typeof ModalUtils.showAlert === 'function') {
                ModalUtils.showAlert('게시판/관리자 메뉴 순서가 성공적으로 변경되었습니다.');
            }
            loadBoardsToSidebar(); // Update sidebar order immediately
            if (typeof applyAdminMenuOrder === 'function') {
                applyAdminMenuOrder();
            }
            applySidebarContentMenuOrder(contentMenuIds);
        } else {
            ModalUtils.showAlert('저장 실패: ' + (errMsg || '권한 또는 서버 오류'));
        }
    } catch (e) {
        console.error('Failed to save board order:', e);
        ModalUtils.showAlert('저장 중 오류가 발생했습니다.');
    }
}
window.saveBoardOrder = saveBoardOrder;

function applySidebarContentMenuOrder(orderedIDs) {
    const container = document.getElementById('sidebar-content-menu-list');
    if (!container) return;
    const currentItems = Array.from(container.children).filter(item => item && item.id);
    if (!currentItems.length) return;

    const itemMap = new Map();
    currentItems.forEach(item => {
        itemMap.set(item.id.replace('tab-btn-', ''), item);
    });

    const fragment = document.createDocumentFragment();
    (Array.isArray(orderedIDs) ? orderedIDs : []).forEach(id => {
        const key = String(id || '');
        const item = itemMap.get(key);
        if (item) {
            fragment.appendChild(item);
            itemMap.delete(key);
        }
    });
    itemMap.forEach(item => fragment.appendChild(item));
    container.innerHTML = '';
    container.appendChild(fragment);
}
window.applySidebarContentMenuOrder = applySidebarContentMenuOrder;

async function loadSidebarContentMenuOrder() {
    try {
        const res = await fetch('/api/admin/menu-order/list');
        if (!res.ok) return;
        const data = await res.json();
        const menus = Array.isArray(data.menus) ? data.menus : [];
        const orderedIDs = menus
            .map(item => String(item.id || ''))
            .filter(id => ['mailbox', 'calendar', 'auction', 'connect-guide', 'carddraw', 'shop'].includes(id));
        if (orderedIDs.length > 0) {
            applySidebarContentMenuOrder(orderedIDs);
        }
    } catch (e) {
        console.error('Failed to apply content menu order:', e);
    }
}
