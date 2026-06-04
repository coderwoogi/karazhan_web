// Global State
var currentUserMainChar = window.currentUserMainChar || null;

// Modal Utilities using SweetAlert2
class ModalUtils {
    static hasSwal() {
        return typeof window !== 'undefined' && typeof window.Swal !== 'undefined' && typeof window.Swal.fire === 'function';
    }

    static ensureFallbackUi() {
        if (typeof document === 'undefined' || !document.body) return null;
        if (!document.getElementById('auth-modal-utils-style')) {
            const style = document.createElement('style');
            style.id = 'auth-modal-utils-style';
            style.textContent = `
                .mu-overlay{position:fixed;inset:0;z-index:20000;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(7,7,13,.72);backdrop-filter:blur(6px)}
                .mu-panel{width:min(460px,calc(100vw - 32px));background:linear-gradient(180deg,rgba(22,16,35,.96),rgba(13,10,20,.98));border:1px solid rgba(218,183,109,.28);border-radius:18px;box-shadow:0 24px 90px rgba(0,0,0,.45);padding:24px;color:#f4ecdc}
                .mu-title{margin:0 0 10px;font-size:22px;font-weight:800;color:#f3dfab}
                .mu-message{white-space:pre-wrap;line-height:1.7;color:#ddd3bf}
                .mu-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:20px}
                .mu-btn{border:1px solid rgba(218,183,109,.28);background:linear-gradient(180deg,rgba(119,72,29,.92),rgba(64,36,18,.96));color:#f7ecd4;border-radius:12px;padding:10px 18px;font-weight:700;cursor:pointer}
                .mu-btn-cancel{background:rgba(255,255,255,.04);color:#e8dcc1}
                .mu-progress{display:flex;flex-direction:column;align-items:center;gap:14px;text-align:center}
                .mu-spinner{display:inline-flex;width:72px;height:72px}
                .mu-spinner svg{width:72px;height:72px;overflow:visible}
                .mu-spinner circle{fill:none;stroke-linecap:round}
                .mu-spinner .mu-spinner-track{stroke:rgba(125,211,252,.18);stroke-width:8}
                .mu-spinner .mu-spinner-arc{stroke:#7dd3fc;stroke-width:8;stroke-dasharray:46 188;transform-origin:50% 50%;animation:mu-dashspin 1.2s ease-in-out infinite;filter:drop-shadow(0 0 12px rgba(125,211,252,.4))}
                @keyframes mu-dashspin{
                    0%{transform:rotate(0deg);stroke-dasharray:26 194;stroke-dashoffset:0}
                    50%{stroke-dasharray:92 156}
                    100%{transform:rotate(360deg);stroke-dasharray:26 194;stroke-dashoffset:-118}
                }
            `;
            document.head.appendChild(style);
        }
        return true;
    }

    static showFallbackDialog({ title = '\uC54C\uB9BC', message = '', confirmText = '\uD655\uC778', cancelText = '\uCDE8\uC18C', showCancel = false }) {
        if (!this.ensureFallbackUi()) return Promise.resolve(showCancel ? false : true);
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'mu-overlay';
            overlay.innerHTML = `
                <div class="mu-panel" role="dialog" aria-modal="true">
                    <h3 class="mu-title"></h3>
                    <div class="mu-message"></div>
                    <div class="mu-actions">
                        ${showCancel ? '<button type="button" class="mu-btn mu-btn-cancel" data-role="cancel"></button>' : ''}
                        <button type="button" class="mu-btn" data-role="confirm"></button>
                    </div>
                </div>`;
            overlay.querySelector('.mu-title').textContent = String(title || '\uC54C\uB9BC');
            overlay.querySelector('.mu-message').textContent = String(message || '');
            overlay.querySelector('[data-role="confirm"]').textContent = String(confirmText || '\uD655\uC778');
            const cancelBtn = overlay.querySelector('[data-role="cancel"]');
            if (cancelBtn) cancelBtn.textContent = String(cancelText || '\uCDE8\uC18C');
            const cleanup = (result) => {
                overlay.remove();
                window.removeEventListener('keydown', onKeyDown);
                resolve(result);
            };
            const onKeyDown = (event) => {
                if (event.key === 'Escape' && showCancel) cleanup(false);
                if (event.key === 'Enter') cleanup(true);
            };
            overlay.querySelector('[data-role="confirm"]').addEventListener('click', () => cleanup(true), { once: true });
            if (cancelBtn) cancelBtn.addEventListener('click', () => cleanup(false), { once: true });
            window.addEventListener('keydown', onKeyDown);
            document.body.appendChild(overlay);
        });
    }

    static showAlert(message, title = '?뚮┝') {
        if (!this.hasSwal()) {
            return this.showFallbackDialog({ title, message });
        }
        // Auto-detect icon based on keywords
        let icon = 'info';
        if (message.includes('성공') || message.includes('완료') || message.includes('되었습니다')) icon = 'success';
        else if (message.includes('실패') || message.includes('오류') || message.includes('에러')) icon = 'error';
        else if (message.includes('경고') || message.includes('주의')) icon = 'warning';

        return Swal.fire({
            title: title,
            text: message,
            icon: icon,
            confirmButtonText: '?뺤씤',
            confirmButtonColor: '#3085d6'
        });
    }

    static showConfirm(message, callback, title = '?뺤씤') {
        if (!this.hasSwal()) {
            return this.showFallbackDialog({ title, message, showCancel: true }).then((confirmed) => {
                if (confirmed) return callback();
            });
        }
        return Swal.fire({
            title: title,
            text: message,
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#3085d6',
            cancelButtonColor: '#d33',
            confirmButtonText: '?뺤씤',
            cancelButtonText: '痍⑥냼'
        }).then((result) => {
            if (result.isConfirmed) {
                return callback();
            } else if (result.dismiss === Swal.DismissReason.cancel && arguments.length > 2 && typeof arguments[2] === 'function') {
                // Handle optional cancel callback if provided (though standard signature here is msg, cb, title)
                // Adjusting signature match might be needed, but for now simple callback on confirm is primary.
            }
        });
    }

    static showProgress(message = '\uCC98\uB9AC \uC911\uC785\uB2C8\uB2E4.', title = '\uC7A0\uC2DC\uB9CC \uAE30\uB2E4\uB824\uC8FC\uC138\uC694') {
        if (!this.ensureFallbackUi()) return;
        this.hideProgress();
        const overlay = document.createElement('div');
        overlay.className = 'mu-overlay';
        overlay.id = 'auth-modal-utils-progress';
        overlay.innerHTML = `
            <div class="mu-panel mu-progress" role="status" aria-live="polite">
                <div class="mu-spinner" aria-hidden="true">
                    <svg viewBox="0 0 104 104">
                        <circle class="mu-spinner-track" cx="52" cy="52" r="34"></circle>
                        <circle class="mu-spinner-arc" cx="52" cy="52" r="34"></circle>
                    </svg>
                </div>
                <h3 class="mu-title">${String(title || '\uC7A0\uC2DC\uB9CC \uAE30\uB2E4\uB824\uC8FC\uC138\uC694')}</h3>
                <div class="mu-message">${String(message || '\uCC98\uB9AC \uC911\uC785\uB2C8\uB2E4.')}</div>
            </div>`;
        document.body.appendChild(overlay);
    }

    static hideProgress() {
        const overlay = typeof document !== 'undefined' ? document.getElementById('auth-modal-utils-progress') : null;
        if (overlay) overlay.remove();
    }

    static async runWithProgress(message, task, title = '\uC7A0\uC2DC\uB9CC \uAE30\uB2E4\uB824\uC8FC\uC138\uC694') {
        this.showProgress(message, title);
        try {
            return await task();
        } finally {
            this.hideProgress();
        }
    }
}

async function logout() {
    ModalUtils.showConfirm('\uB85C\uADF8\uC544\uC6C3 \uD558\uC2DC\uACA0\uC2B5\uB2C8\uAE4C?', async () => {
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

function openTab(tabName) {
    const contents = document.querySelectorAll('.tab-content');
    contents.forEach(content => content.classList.remove('active'));

    const buttons = document.querySelectorAll('.tab-btn');
    buttons.forEach(btn => btn.classList.remove('active'));

    const targetElem = document.getElementById(tabName);
    if (targetElem) targetElem.classList.add('active');

    // Find and activate the correct button by ID
    const targetBtn = document.getElementById(`tab-btn-${tabName}`);
    if (targetBtn) targetBtn.classList.add('active');

    if (tabName === 'remote') {
        loadRemoteData();
        checkStatus();
        openServerSubTab('control');
    } else if (tabName === 'account') {
        openAccountSubTab('list');
    } else if (tabName === 'logs') {
        openLogSubTab('action'); // Initialize with action logs
    } else if (tabName === 'gm') {
        if(typeof GMManager !== 'undefined') {
            // Delay slightly to ensure #gm is visible (display:block) before initializing calendar
            setTimeout(() => {
                GMManager.switchSubTab('todos');
            }, 50);
        }
    } else if (tabName === 'ban') {
        openCharSubTab('characters'); // Initialize with characters tab
    } else if (tabName === 'content') {
        openContentSubTab('blackmarket');
    } else if (tabName === 'mypage') {
        loadMyPage();
    } else if (tabName === 'home') {
        // Refresh Home Calendar if initialized
        if (HomeCalendarState && HomeCalendarState.calendarInstance) {
            // Slight delay to ensure visibility
            setTimeout(() => {
                HomeCalendarState.calendarInstance.updateSize();
                HomeCalendarState.calendarInstance.refetchEvents();
            }, 50);
        }
    } else if (tabName === 'board') {
        if(typeof loadPosts === 'function') loadPosts(1);
    } else if (tabName === 'board-admin') {
        if(typeof loadBoardListAdmin === 'function') loadBoardListAdmin();
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
    prevBtn.innerHTML = '<i class="fas fa-chevron-left"></i> ?댁쟾';
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
                dot.style.padding = '0.5rem';
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
    nextBtn.innerHTML = '?ㅼ쓬 <i class="fas fa-chevron-right"></i>';
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
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">濡쒕뵫 以?..</td></tr>';
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
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px; color:red;">\uC11C\uBC84 \uC624\uB958: ${errText}</td></tr>`;
            tbody.style.opacity = '1';
            return;
        }
        const data = await response.json();
        const logs = data.logs || [];

        if (!logs || logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">\uB85C\uADF8\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.</td></tr>';
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
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:red;">\uB85C\uADF8\uB97C \uBD88\uB7EC\uC624\uB294\uB370 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.</td></tr>';
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

    const targetContent = document.getElementById(`mn-${tabName}`);
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
    }
}

async function loadMenuPermissions() {
    const tbody = document.getElementById('role-perm-menu-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px;">遺덈윭?ㅻ뒗 以?..</td></tr>';

    try {
        const res = await fetch('/api/admin/role-permissions');
        if (!res.ok) throw new Error("\uAD8C\uD55C \uC815\uBCF4\uB97C \uBD88\uB7EC\uC624\uB294\uB370 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.");
        const data = await res.json();
        const permissions = data.permissions || [];

        // Sort by order_index
        const sorted = [...permissions].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));

        tbody.innerHTML = sorted.map(p => {
            let rowStyle = '';
            let namePrefix = '';
            const rType = (p.resource_type || '').trim().toLowerCase();

            if (rType === 'submenu') {
                rowStyle = 'background-color: #f8fafc;';
                namePrefix = '<i class="fas fa-level-up-alt fa-rotate-90" style="margin-right:8px; color:#cbd5e1;"></i>';
            } else if (rType === 'menu') {
                rowStyle = 'font-weight: 700; background-color: #f1f5f9;';
            }

            return `
                <tr style="${rowStyle}">
                    <td>${namePrefix}${p.resource_id}</td>
                    <td style="color: var(--text-secondary);">${p.resource_name || ''}</td>
                    <td>
                        <div style="display:flex; gap:10px;">
                            <label style="display:flex; align-items:center; gap:4px; cursor:pointer;">
                                <input type="checkbox" id="perm-rank1-${p.resource_type}-${p.resource_id}" ${p.rank_1 ? 'checked' : ''}> ?좎?
                            </label>
                            <label style="display:flex; align-items:center; gap:4px; cursor:pointer;">
                                <input type="checkbox" id="perm-rank2-${p.resource_type}-${p.resource_id}" ${p.rank_2 ? 'checked' : ''}> GM
                            </label>
                            <label style="display:flex; align-items:center; gap:4px; opacity:0.6;">
                                <input type="checkbox" checked disabled> 愿由ъ옄
                            </label>
                        </div>
                    </td>
                    <td>
                        <button onclick="updateRolePermission('${p.resource_type}', '${p.resource_id}')" class="btn btn-primary" style="padding:0.4rem 1rem; font-size:0.85rem;">
                            <i class="fas fa-save"></i> \uC800\uC7A5
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:20px; color:red;">${e.message}</td></tr>`;
    }
}

async function updateRolePermission(type, id) {
    const r1 = document.getElementById(`perm-rank1-${type}-${id}`).checked;
    const r2 = document.getElementById(`perm-rank2-${type}-${id}`).checked;

    const btn = event.currentTarget;
    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    try {
        const res = await fetch('/api/admin/role-permissions/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                permissions: [{
                    resource_type: type,
                    resource_id: id,
                    rank_1: r1,
                    rank_2: r2
                }]
            })
        });

        if (res.ok) {
            ModalUtils.showAlert('??λ릺?덉뒿?덈떎.');
        } else {
            ModalUtils.showAlert('\uC800\uC7A5\uB418\uC5C8\uC2B5\uB2C8\uB2E4.');
        }
    } catch (e) {
        ModalUtils.showAlert('?ㅻ쪟 諛쒖깮');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalHtml;
    }
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
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">濡쒕뵫 以?..</td></tr>';
    }

    try {
        const charName = document.getElementById('filter-char-name')?.value || '';
        const account = document.getElementById('filter-char-account')?.value || '';
        const level = document.getElementById('filter-char-level')?.value || '';

        const params = new URLSearchParams({ page, limit: 20, name: charName, account, level });
        const response = await fetch('/api/characters/list?' + params.toString());
        if (!response.ok) {
            const errText = await response.text();
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px; color:red;">?쒕쾭 ?ㅻ쪟: ${errText}</td></tr>`;
            tbody.style.opacity = '1';
            return;
        }
        const data = await response.json();
        const characters = data.characters || [];

        if (!characters || characters.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">\uCE90\uB9AD\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.</td></tr>';
            tbody.style.opacity = '1';
            renderPagination(pgContainer, data, (p) => loadCharacterList(p));
            return;
        }

        tbody.innerHTML = characters.map(char => `
            <tr>
                <td style="font-weight:700;" class="text-ellipsis">
                    <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background-color:${char.online ? '#10b981' : '#cbd5e1'}; margin-right:8px; box-shadow: 0 0 0 2px ${char.online ? 'rgba(16, 185, 129, 0.1)' : 'transparent'};"></span>
                    ${char.name}
                </td>
                <td style="text-align:center;">
                    <span class="lvl-badge">Lv.${char.level}</span>
                </td>
                <td style="font-size:0.85rem; opacity:0.8;">
                    ${char.race}/${char.class}
                </td>
                <td style="color:#f59e0b; font-weight:700;">${(char.gold / 10000).toFixed(2)} Gold</td>
                <td style="opacity:0.7;">${char.account}</td>
                <td style="text-align:center;">
                    <button onclick="openCharacterItemsModal('${char.name}', ${char.guid})" class="btn-action btn-edit" title="?꾩씠??蹂닿린">
                        <i class="fas fa-box-open"></i> ?꾩씠??
                    </button>
                </td>
            </tr>
        `).join('');

        renderPagination(pgContainer, data, (p) => loadCharacterList(p));
        tbody.style.opacity = '1';
        if (tableContainer) tableContainer.scrollTop = 0;
    } catch (e) {
        console.error("Failed to load character list", e);
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:red;">\uCE90\uB9AD\uD130 \uBAA9\uB85D\uC744 \uBD88\uB7EC\uC624\uB294\uB370 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.</td></tr>';
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

    if (!charName) { ModalUtils.showAlert('\uCE90\uB9AD\uD130 \uC774\uB984\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694.'); return; }
    if (!subject) { ModalUtils.showAlert('\uBA54\uC77C \uC81C\uBAA9\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694.'); return; }

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
            ModalUtils.showAlert(`\uBA54\uC77C\uC744 ${charName}\uB2D8\uC5D0\uAC8C \uC131\uACF5\uC801\uC73C\uB85C \uBC1C\uC1A1\uD588\uC2B5\uB2C8\uB2E4.`);
            document.getElementById('mail-char-name').value = '';
            document.getElementById('mail-subject').value = '';
            document.getElementById('mail-body').value = '';
            document.getElementById('mail-item-entry').value = '';
            document.getElementById('mail-item-count').value = '1';
            document.getElementById('mail-gold').value = '0';
        } else {
            ModalUtils.showAlert(`\uBA54\uC77C \uBC1C\uC1A1 \uC2E4\uD328: ${result.message || '\uC54C \uC218 \uC5C6\uB294 \uC624\uB958'}`);
        }
    } catch (e) {
        console.error("Failed to send mail", e);
        ModalUtils.showAlert('\uBA54\uC77C \uBC1C\uC1A1 \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.');
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
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">濡쒕뵫 以?..</td></tr>';
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
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px; color:red;">?쒕쾭 ?ㅻ쪟: ${errText}</td></tr>`;
            tbody.style.opacity = '1';
            return;
        }
        const data = await response.json();
        const logs = data.logs || [];

        if (!logs || logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">\uB85C\uADF8\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.</td></tr>';
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

        renderPagination(pgContainer, data, (p) => loadBlackMarketLogs(p));

        tbody.style.opacity = '1';
        if (tableContainer) tableContainer.scrollTop = 0;
    } catch (e) {
        console.error("Failed to load Black Market logs", e);
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:red;">\uB85C\uADF8\uB97C \uBD88\uB7EC\uC624\uB294\uB370 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.</td></tr>';
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
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">濡쒕뵫 以?..</td></tr>';
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
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px; color:red;">?쒕쾭 ?ㅻ쪟: ${errText}</td></tr>`;
            tbody.style.opacity = '1';
            return;
        }
        const data = await response.json();
        const logs = data.logs || [];

        if (!logs || logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">\uB85C\uADF8\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.</td></tr>';
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
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:red;">\uB85C\uADF8\uB97C \uBD88\uB7EC\uC624\uB294\uB370 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.</td></tr>';
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
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">濡쒕뵫 以?..</td></tr>';
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
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px; color:red;">?쒕쾭 ?ㅻ쪟: ${errText}</td></tr>`;
            tbody.style.opacity = '1';
            return;
        }
        const data = await response.json();
        const logs = data.logs || [];

        if (!logs || logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">\uB85C\uADF8\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.</td></tr>';
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
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:red;">\uB85C\uADF8\uB97C \uBD88\uB7EC\uC624\uB294\uB370 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.</td></tr>';
        tbody.style.opacity = '1';
    }
}


// Stats Logic
async function loadStats() {
    try {
        console.log("Loading stats...");
        const res = await fetch('/api/stats/summary');
        const data = await res.json();
        console.log("Stats data received:", data);

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
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:10px;">?깅줉???묒뾽???놁뒿?덈떎.</td></tr>';
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
                            <i class="fas ${statusIcon}"></i> ${isProcessed ? '\uC644\uB8CC' : '\uB300\uAE30 \uC911'}
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
        ModalUtils.showAlert('?좎쭨瑜??좏깮?댁＜?몄슂.');
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
            ModalUtils.showAlert('\uC791\uC5C5 \uC608\uC57D\uC774 \uC131\uACF5\uC801\uC73C\uB85C \uB4F1\uB85D\uB418\uC5C8\uC2B5\uB2C8\uB2E4.');
            loadSchedule();
        } else if (data.status === 'forbidden') {
            ModalUtils.showAlert(data.message);
        } else {
            ModalUtils.showAlert('\uC791\uC5C5 \uB4F1\uB85D\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.');
        }
    } catch (e) {
        console.error(e);
        ModalUtils.showAlert('\uC791\uC5C5 \uB4F1\uB85D \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.');
    }
}

// Server Control
async function startServer(target) {
    appendLog(target, 'System', '\uC11C\uBC84 \uC2DC\uC791 \uBA85\uB839\uC744 \uBCF4\uB0B4\uB294 \uC911\uC785\uB2C8\uB2E4...');
    try {
        const res = await fetch(`/api/launcher/start?target=${target}`, { method: 'POST' });
        const data = await res.json();
        if (data.status === 'success') {
            appendLog(target, 'System', '\uC131\uACF5\uC801\uC73C\uB85C \uAC00\uB3D9\uB418\uC5C8\uC2B5\uB2C8\uB2E4.');
            connectLogStream(target);
            updateStatusUI(target, true);
        } else if (data.status === 'forbidden') {
            appendLog(target, '\uC624\uB958', data.message);
            appendLog(target, '?ㅻ쪟', data.message);
        } else {
            appendLog(target, '\uC624\uB958', data.message);
        }
    } catch (e) {
        appendLog(target, '\uC624\uB958', e.message);
    }
}

async function stopServer(target) {
    appendLog(target, 'System', '\uC11C\uBC84 \uC911\uC9C0 \uBA85\uB839\uC744 \uBCF4\uB0B4\uB294 \uC911\uC785\uB2C8\uB2E4...');
    try {
        const res = await fetch(`/api/launcher/stop?target=${target}`, { method: 'POST' });
        const data = await res.json();
        if (data.status === 'success') {
            appendLog(target, 'System', '\uC131\uACF5\uC801\uC73C\uB85C \uC911\uC9C0\uB418\uC5C8\uC2B5\uB2C8\uB2E4.');
            updateStatusUI(target, false);
            if (eventSources[target]) {
                eventSources[target].close();
                delete eventSources[target];
            }
        } else if (data.status === 'forbidden') {
            ModalUtils.showAlert(data.message);
            appendLog(target, '?ㅻ쪟', data.message);
        } else {
            appendLog(target, '?ㅻ쪟', data.message);
        }
    } catch (e) {
        appendLog(target, '?ㅻ쪟', e.message);
    }
}



async function checkStatus() {
    try {
        console.log("Checking status...");
        const res = await fetch('/api/launcher/status');
        const data = await res.json();
        console.log("Status data:", data);

        updateStatusUI('auth', data.auth);
        updateStatusUI('world', data.world);

        // If running but no stream, connect
        if (data.auth && !eventSources['auth']) {
            console.log("Auth running, connecting logs...");
            connectLogStream('auth');
        }
        if (data.world && !eventSources['world']) {
            console.log("World running, connecting logs...");
            connectLogStream('world');
        }

        // Also update online players list
        loadOnlineCount();

    } catch (e) {
        console.error("Status check failed", e);
    }
}

// Load Boards to Sidebar (Stub for now, to match home/static/script.js)
async function loadBoardsToSidebar() {
    console.log("loadBoardsToSidebar called (auth static)");
    try {
        const response = await fetch('/api/board/list');
        if (response.ok) {
            const data = await response.json();
        }
    } catch (e) {
        console.warn("Failed to load boards for sidebar", e);
    }
}

function updateStatusUI(target, isRunning) {
    const badge = document.getElementById(`${target}-status`);
    if (!badge) return; // Guard against missing element

    if (isRunning) {
        badge.textContent = '\uAC00\uB3D9 \uC911';
        badge.className = 'status-badge running';
    } else {
        badge.textContent = '\uC911\uC9C0\uB428';
        badge.className = 'status-badge stopped';
    }
}

// Log Streaming via SSE
const eventSources = {};

function connectLogStream(target) {
    if (eventSources[target]) return; // Already connected

    const consoleDiv = document.getElementById(`${target}-log`);
    appendLog(target, 'System', '\uB85C\uADF8 \uC2A4\uD2B8\uB9BC\uC5D0 \uC5F0\uACB0 \uC911...');

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
    container.innerHTML = '<div class="loading">\uB370\uC774\uD130\uB97C \uBD88\uB7EC\uC624\uB294 \uC911...</div>';

    try {
        const response = await fetch('/api/launcher/latest');
        if (!response.ok) throw new Error('Data load failed');
        const data = await response.json();

        container.innerHTML = '';
        if (Object.keys(data).length === 0) {
            container.innerHTML = '\uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.';
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
        container.innerHTML = '<div class="error">\uB370\uC774\uD130\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.</div>';
    }
}

function updateWelcomeMsg(name) {
    const welcome = document.getElementById('welcome-msg');
    const text = document.getElementById('welcome-text');
    if (welcome && text) {
        text.textContent = `${name}\uB2D8 \uD658\uC601\uD569\uB2C8\uB2E4.`;
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
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">濡쒕뵫 以?..</td></tr>';
    }

    try {
        const username = document.getElementById('filter-perm-user')?.value || '';
        const email = document.getElementById('filter-perm-email')?.value || '';
        const rank = document.getElementById('filter-perm-rank')?.value || '';

        const params = new URLSearchParams({
            page: page,
            limit: 20,
            username: username,
            email: email,
            gmlevel: rank
        });

        const res = await fetch('/api/admin/users/list?' + params.toString());
        if (!res.ok) throw new Error("Unauthorized");
        const data = await res.json();
        const users = data.users || [];

        if (users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">\uAC80\uC0C9 \uACB0\uACFC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.</td></tr>';
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
                    <span class="badge ${user.gmlevel > 0 ? 'admin' : 'user'}">\uAD8C\uD55C ${user.gmlevel}</span>
                </td>
                <td>
                    <select onchange="updateUserRank(${user.id}, this.value)" class="input-premium" style="padding:0.4rem; font-size:0.85rem;">
                        <option value="0" ${user.gmlevel === 0 ? 'selected' : ''}>\uC77C\uBC18 \uC720\uC800 (0)</option>
                        <option value="1" ${user.gmlevel === 1 ? 'selected' : ''}>\uC911\uC7AC\uC790 (1)</option>
                        <option value="2" ${user.gmlevel === 2 ? 'selected' : ''}>\uAC8C\uC784 \uB9C8\uC2A4\uD130 (2)</option>
                        <option value="3" ${user.gmlevel === 3 ? 'selected' : ''}>\uAD00\uB9AC\uC790 (3)</option>
                    </select>
                </td>
            </tr>
        `).join('');

        renderPagination(pgContainer, data, (p) => loadUserList(p));

        tbody.style.opacity = '1';
        if (tableContainer) tableContainer.scrollTop = 0;
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:red;">\uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.</td></tr>';
        tbody.style.opacity = '1';
    }
}

function resetUserSearch() {
    document.getElementById('filter-perm-user').value = '';
    document.getElementById('filter-perm-email').value = '';
    document.getElementById('filter-perm-rank').value = '';
    loadUserList(1);
}

async function updateUserRank(userId, newRank) {
    ModalUtils.showConfirm(`\uC0AC\uC6A9\uC790 ID: ${userId}\uC758 \uAD8C\uD55C\uC744 \uBCC0\uACBD\uD558\uC2DC\uACA0\uC2B5\uB2C8\uAE4C?`, async () => {
        const formData = new URLSearchParams();
        formData.append('id', userId);
        formData.append('rank', newRank);

        try {
            const res = await fetch('/api/admin/users/update', {
                method: 'POST',
                body: formData
            });
            if (res.ok) {
                ModalUtils.showAlert('\uAD8C\uD55C\uC774 \uC131\uACF5\uC801\uC73C\uB85C \uBCC0\uACBD\uB418\uC5C8\uC2B5\uB2C8\uB2E4.');
                loadUserList(); // This will refresh current page with current filters
            } else {
                ModalUtils.showAlert('\uAD8C\uD55C \uBCC0\uACBD\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.');
            }
        } catch (e) {
            ModalUtils.showAlert('\uC11C\uBC84 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.');
        }
    }, () => {
        loadUserList(); // Reset selection if cancelled
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
                <td style="font-size:0.85rem; opacity:0.8;">${b.unbandate}</td>
                <td>
                    ${b.active ? `<button onclick="removeBan('account', ${b.id})" class="btn-action btn-edit" style="background:#f1f5f9; color:#64748b; border:none;"><i class="fas fa-unlock"></i> ?댁젣</button>` : '<span style="color:#cbd5e1; font-weight:600;"><i class="fas fa-check"></i> ?댁젣??/span>'}
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
                <td style="font-size:0.85rem; opacity:0.8;">${b.unbandate}</td>
                <td>
                    <button onclick="removeBan('ip', '${b.ip}')" class="btn-action btn-edit" style="background:#f1f5f9; color:#64748b; border:none;"><i class="fas fa-unlock"></i> ?댁젣</button>
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
        ModalUtils.showAlert('紐⑤뱺 ??ぉ???낅젰?댁＜?몄슂.');
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
            ModalUtils.showAlert('諛댁씠 ?깃났?곸쑝濡??깅줉?섏뿀?듬땲??');
            loadBanList();
        } else {
            ModalUtils.showAlert('諛??깅줉???ㅽ뙣?덉뒿?덈떎.');
        }
    } catch (e) {
        ModalUtils.showAlert('\uC11C\uBC84 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.');
    }
}

async function removeBan(type, target) {
    ModalUtils.showConfirm(`${type} 諛댁쓣 ?댁젣?섏떆寃좎뒿?덇퉴?`, async () => {
        const formData = new URLSearchParams();
        formData.append('type', type);
        formData.append('target', target);

        try {
            const res = await fetch('/api/admin/bans/remove', {
                method: 'POST',
                body: formData
            });
            if (res.ok) {
                ModalUtils.showAlert('諛댁씠 ?댁젣?섏뿀?듬땲??');
                loadBanList();
            } else {
                ModalUtils.showAlert('諛??댁젣???ㅽ뙣?덉뒿?덈떎.');
            }
        } catch (e) {
            ModalUtils.showAlert('\uC11C\uBC84 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.');
        }
    });
}

async function loadOnlineCount() {
    try {
        console.log("Loading online count...");
        const res = await fetch('/api/server/online');
        if (res.ok) {
            const data = await res.json();
            
            // 1. Update Count
            if(document.getElementById('online-players-count')) {
                document.getElementById('online-players-count').textContent = data.onlineCount;
            }

            // 2. Render Online List
            const listContainer = document.getElementById('character-list');
            const section = document.getElementById('home-characters');
            
            if (listContainer && section) {
                const chars = data.onlineCharacters || [];

                section.style.display = 'block'; // Always show section if connected

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

                        const classIcon = `/img/icons/class_${className}.gif`;
                        const raceIcon = `/img/icons/race_${raceName}_${genderName}.gif`;

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
                                    <img src="${classIcon}" class="char-icon" title="${getClassName(c.class)}" onerror="this.src='/img/icons/faction_horde.gif'">
                                </td>
                                <td style="text-align:center;">
                                    <span class="lvl-badge">Lv.${c.level || 80}</span>
                                </td>
                                <td class="char-name">${c.name}</td>
                                <td class="char-zone">
                                    <span style="color:#10b981; font-weight:bold;">Online</span>
                                </td>
                            </tr>
                        `;
                    }).join('');
                } else {
                    listContainer.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:var(--text-secondary);">\uC811\uC18D \uC911\uC778 \uC720\uC800\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.</td></tr>';
                }
            }
        } else {
            console.error("Online count response not ok:", res.status, res.statusText);
        }
    } catch (e) { 
        console.error("Online count load failed", e);
    }
}

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
            listContainer.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:#999;">\uD604\uC7AC \uC811\uC18D \uC911\uC778 \uD50C\uB808\uC774\uC5B4\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.</td></tr>';
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

            const classIcon = `/img/icons/class_${className}.gif`;
            const raceIcon = `/img/icons/race_${raceName}_${genderName}.gif`;

            return `
                <tr>
                    <td style="text-align:center;">
                        <img src="${raceIcon}" class="char-icon" title="${raceName}" onerror="this.src='/img/icons/faction_alliance.gif'">
                    </td>
                    <td style="text-align:center;">
                        <img src="${classIcon}" class="char-icon" title="${className}" onerror="this.src='/img/icons/faction_horde.gif'">
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
        listContainer.innerHTML = '<tr><td colspan="5" class="loading-state" style="text-align:center; padding:20px;">\uCE90\uB9AD\uD130 \uC815\uBCF4\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.</td></tr>';
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
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">濡쒕뵫 以?..</td></tr>';
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
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px; color:red;">?쒕쾭 ?ㅻ쪟: ${errText}</td></tr>`;
            tbody.style.opacity = '1';
            return;
        }
        const data = await response.json();
        const logs = data.logs || [];

        if (!logs || logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">\uB85C\uADF8\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.</td></tr>';
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

        renderPagination(pgContainer, data, (p) => loadMailLogs(p));

        tbody.style.opacity = '1';
        if (tableContainer) tableContainer.scrollTop = 0;
    } catch (e) {
        console.error("Failed to load Mail logs", e);
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:red;">\uB85C\uADF8\uB97C \uBD88\uB7EC\uC624\uB294\uB370 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.</td></tr>';
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
    const contents = document.querySelectorAll('#content .log-sub-content');
    contents.forEach(content => content.classList.remove('active'));

    const targetContent = document.getElementById(`content-${tabName}`);
    if (targetContent) targetContent.classList.add('active');

    if (tabName === 'blackmarket') {
        loadBlackMarketItems(1);
    }
}

function refreshCurrentContentTab() {
    if (currentContentTab === 'blackmarket') {
        loadBlackMarketItems(1);
    }
}

// BlackMarket Manager Logic
async function loadBlackMarketItems(page = 1) {
    const tbody = document.getElementById('blackmarket-list');
    const pgContainer = document.getElementById('blackmarket-pagination');
    if (!tbody) return;

    tbody.style.opacity = '0.4';
    if (page === 1) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:20px;">濡쒕뵫 以?..</td></tr>';
    }

    try {
        const res = await fetch(`/api/content/blackmarket/list?page=${page}`);
        if (!res.ok) throw new Error("\uB370\uC774\uD130\uB97C \uBD88\uB7EC\uC624\uB294\uB370 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.");
        const data = await res.json();
        const items = data.items || [];

        if (items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:20px;">?깅줉??臾쇳뭹???놁뒿?덈떎.</td></tr>';
            renderPagination(pgContainer, data, (p) => loadBlackMarketItems(p));
            tbody.style.opacity = '1';
            return;
        }

        console.log('Received BlackMarket Items:', items);

        tbody.innerHTML = items.map(item => `
            <tr>
                <td>${item.id}</td>
                <td style="text-align:center;">
                    <div id="bm-icon-${item.id}" class="item-icon-small" data-entry="${item.item_entry}">
                    </div>
                </td>
                <td>${item.item_entry}</td>
                <td style="font-weight:700;">${item.name}</td>
                <td style="color:#f59e0b; font-weight:700;">${item.price_gold.toLocaleString()}g</td>
                <td>${item.weight}</td>
                <td>${item.max_per_spawn}</td>
                <td>
                    <div style="display:flex; gap:8px;">
                        <button onclick="openBlackMarketModal(${item.id}, ${item.item_entry}, ${item.price_gold}, ${item.weight}, ${item.max_per_spawn})" 
                                class="btn-action btn-edit">
                            <i class="fas fa-edit"></i> ?섏젙
                        </button>
                        <button onclick="deleteBlackMarketItem(${item.id})" 
                                class="btn-action btn-delete">
                            <i class="fas fa-trash"></i> ??젣
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');

        // Fetch icons asynchronously
        items.forEach(item => fetchItemIcon(item.id, item.item_entry));

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
            container.innerHTML = `<img src="${data.url}" style="width:30px; height:30px; border-radius:2px; vertical-align:middle; cursor:pointer;" 
                onerror="this.style.display='none';" onclick="window.open('https://wotlkdb.com/?item=${entry}', '_blank')">`;
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

            container.innerHTML = `
                <div style="display:flex; align-items:center; gap:10px;">
                    <img src="${iconUrl}" style="width:24px; height:24px; border-radius:4px; border:1px solid #ddd;" 
                         onerror="this.src='/static/img/default_icon.png'">
                    <div style="display:flex; flex-direction:column;">
                        <span style="font-weight:600; color:var(--primary-color);">${item.name}</span>
                        ${goldInfo}
                    </div>
                </div>
            `;
        }
    } catch (e) {
        console.error('Failed to fetch item info:', entry, e);
    }
}

function openBlackMarketModal(id = null, entry = '', price = 0, weight = 100, spawn = 1) {
    const modal = document.getElementById('blackmarket-modal');
    const title = document.getElementById('bm-modal-title');

    if (id) {
        title.innerText = '?붿떆??臾쇳뭹 ?섏젙';
        document.getElementById('bm-id').value = id;
        document.getElementById('bm-entry').value = entry;
        document.getElementById('bm-price').value = price;
        document.getElementById('bm-weight').value = weight;
        document.getElementById('bm-spawn').value = spawn;
    } else {
        title.innerText = '?붿떆??臾쇳뭹 異붽?';
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
    ModalUtils.showConfirm('?뺣쭚濡???臾쇳뭹????젣?섏떆寃좎뒿?덇퉴?', async () => {
        const formData = new URLSearchParams();
        formData.append('id', id);

        try {
            const res = await fetch('/api/admin/blackmarket/delete', {
                method: 'POST',
                body: formData
            });

            if (res.ok) {
                ModalUtils.showAlert('\uC131\uACF5\uC801\uC73C\uB85C \uD574\uC81C\uD588\uC2B5\uB2C8\uB2E4.');
                loadBlackMarketItems();
            } else {
                ModalUtils.showAlert('\uD574\uC81C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.');
            }
        } catch (e) {
            ModalUtils.showAlert('\uD574\uC81C \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.');
        }
    }, () => {
        // Cancel callback (optional)
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
            ModalUtils.showAlert('??λ릺?덉뒿?덈떎.');
            loadBlackMarketItems();
            closeBlackMarketModal(); // Changed from closeEditModal() to closeBlackMarketModal() for consistency
        } else {
            ModalUtils.showAlert('??μ뿉 ?ㅽ뙣?덉뒿?덈떎.');
        }
    } catch (e) {
        ModalUtils.showAlert('\uB300\uD45C \uCC98\uB9AC \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.');
    }
});

// Main Character System
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
            
            // Update Text Fields
            if (data.points !== undefined) {
                // Update both mobile and desktop points displays
                const pointDisplays = document.querySelectorAll('#user-points-display');
                pointDisplays.forEach(el => el.textContent = data.points.toLocaleString());
            }
            if (data.username) {
                // Update both mobile and desktop welcome/nickname displays
                const welcomeTexts = [document.getElementById('welcome-text'), document.getElementById('welcome-text-mobile')];
                welcomeTexts.forEach(el => {
                    if (el) el.textContent = data.username;
                });
                
                // Also update mypage username if it exists
                const mypageUser = document.getElementById('mypage-username');
                if (mypageUser) mypageUser.textContent = data.username;
            }
            if(document.getElementById('mypage-email')) document.getElementById('mypage-email').textContent = data.email || '?대찓???놁쓬';
            
            // GM Badge
            const gmBadge = document.getElementById('mypage-gm-badge');
            if(gmBadge) gmBadge.style.display = (data.gmLevel > 0) ? 'inline-block' : 'none';

            // Main Character Status
            const mainCharText = document.getElementById('mypage-main-char');
            const avatarDiv = document.getElementById('mypage-avatar');
            
            if(mainCharText && data.mainCharacter) {
                const char = data.mainCharacter;
                const raceName = getRaceName(char.race);
                const className = getClassName(char.class);
                
                mainCharText.innerHTML = `<span style="color:#eab308; font-weight:bold;">Lv.${char.level}</span> ${raceName} ${className} <span style="color:#10b981; font-weight:bold;">${char.name}</span>`;
                
                // Update Points in Header
                if (data.points !== undefined) {
                    const pointsDisplay = document.getElementById('user-points-display');
                    if (pointsDisplay) pointsDisplay.textContent = data.points.toLocaleString();
                }

                // Update Avatar
                if(avatarDiv) {
                    const raceFile = getRaceImage(char.race, char.gender);
                    if(raceFile) {
                        avatarDiv.innerHTML = `<img src="/img/icons/${raceFile}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
                    }
                }
            } else if(mainCharText) {
                mainCharText.textContent = '\uB300\uD45C \uCE90\uB9AD\uD130 \uBBF8\uC124\uC815';
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
}

// Helper Functions for Icons
function getRaceImage(race, gender) {
    const genderStr = (gender === 0) ? 'male' : 'female';
    const races = {
        1: 'human', 2: 'orc', 3: 'dwarf', 4: 'nightelf', 5: 'undead', 6: 'tauren', 7: 'gnome', 8: 'troll', 10: 'bloodelf', 11: 'draenei'
    };
    if(races[race]) return `race_${races[race]}_${genderStr}.gif`;
    return null;
}

function getRaceName(race) {
    const races = {
        1: '\uC778\uAC04', 2: '\uC624\uD06C', 3: '\uB4DC\uC6CC\uD504', 4: '\uB098\uC774\uD2B8\uC5D8\uD504', 5: '\uC5B8\uB370\uB4DC',
        6: '\uD0C0\uC6B0\uB80C', 7: '\uB178\uC6C0', 8: '\uD2B8\uB864', 10: '\uBE14\uB7EC\uB4DC\uC5D8\uD504', 11: '\uB4DC\uB808\uB098\uC774'
    };
    return races[race] || '\uC54C \uC218 \uC5C6\uC74C';
}

function getZoneName(mapId) {
    const zones = {
        0: '\uB3D9\uBD80 \uC655\uAD6D', 1: '\uCE7C\uB9BC\uB3C4\uC5B4', 530: '\uC544\uC6C3\uB79C\uB4DC', 571: '\uB178\uC2A4\uB80C\uB4DC',
        1519: '\uC2A4\uD1B0\uC708\uB4DC', 1637: '\uC624\uADF8\uB9AC\uB9C8', 1537: '\uC544\uC774\uC5B8\uD3EC\uC9C0', 1638: '\uC36C\uB354 \uBE14\uB7EC\uD504',
        1657: '\uB2E4\uB974\uB098\uC11C\uC2A4', 1497: '\uC5B8\uB354\uC2DC\uD2F0', 3487: '\uC2E4\uBC84\uBB38', 3557: '\uC5D1\uC18C\uB2E4\uB974',
        4395: '\uB2EC\uB77C\uB780'
    };
    return zones[mapId] || `Map ${mapId}`;
}

function getClassName(cls) {
    const classes = {
        1: '\uC804\uC0AC', 2: '\uC131\uAE30\uC0AC', 3: '\uC0AC\uB0E5\uAFBC', 4: '\uB3C4\uC801', 5: '\uC0AC\uC81C',
        6: '\uC8FD\uC74C\uC758 \uAE30\uC0AC', 7: '\uC8FC\uC220\uC0AC', 8: '\uB9C8\uBC95\uC0AC', 9: '\uD751\uB9C8\uBC95\uC0AC', 11: '\uB4DC\uB8E8\uC774\uB4DC'
    };
    return classes[cls] || '\uC54C \uC218 \uC5C6\uC74C';
}

function closeMainCharModal() {
    const modal = document.getElementById('main-char-modal');
    if (modal) modal.style.display = 'none';
}

async function loadUserCharactersForSelection(targetId = 'char-list-container') {
    container.innerHTML = '<div style="padding:20px; text-align:center;">\uB85C\uB529 \uC911...</div>';
    if (!container) return;

    container.innerHTML = '<div style="padding:20px; text-align:center;">濡쒕뵫 以?..</div>';

    try {
        const response = await fetch('/api/user/characters');
            container.innerHTML = '<div style="padding:20px; text-align:center;">\uCE90\uB9AD\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.<br>\uAC8C\uC784 \uB0B4\uC5D0\uC11C \uCE90\uB9AD\uD130\uB97C \uC0DD\uC131\uD574 \uC8FC\uC138\uC694.</div>';
        const chars = await response.json();

        if (!chars || !Array.isArray(chars) || chars.length === 0) {
            container.innerHTML = '<div style="padding:20px; text-align:center;">???? ????.<br>?? ??? ???? ??? ???.</div>';
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

            let raceFile = raceName;
            if (raceName === 'nightelf') raceFile = 'nelf';
            
            // Icon Pack Path
            const iconPackPath = '/img/iconpack/Characters%20and%20Creatures/';
            
            // Determine Race Icon
            let raceIcon = `${iconPackPath}${raceFile}.png`;
            if (c.gender === 1) { // Female
                raceIcon = `${iconPackPath}female${raceFile}.png`;
            }
            
            // Determine Class Icon
            const classIcon = `${iconPackPath}${className}.png`;

            // Fallback for missing icons (Blood Elf, Draenei, DK, etc to original system or faction)
            // Note: HTML onerror will handle final fallback to faction icons
            const isSelected = currentUserMainChar && currentUserMainChar.guid === c.guid;
            const activeClass = isSelected ? 'active' : '';

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
                                ${raceName} ${className}
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
        });
        html += '</div>';
        container.innerHTML = html;

    } catch (e) {
        console.error(e);
        container.innerHTML = `<div style="padding:20px; text-align:center; color:red;">紐⑸줉 濡쒕뱶 ?ㅽ뙣: ${e.message}</div>`;
    }
}

async function setMainCharacter(guid, name) {
    ModalUtils.showConfirm(`'${name}' \uCE90\uB9AD\uD130\uB97C \uB300\uD45C \uCE90\uB9AD\uD130\uB85C \uC124\uC815\uD558\uC2DC\uACA0\uC2B5\uB2C8\uAE4C?`, async () => {
        try {
            const response = await fetch('/api/user/main_character', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ guid: guid, name: name })
            });

            if (response.ok) {
                ModalUtils.showAlert('\uB300\uD45C \uCE90\uB9AD\uD130\uAC00 \uC124\uC815\uB418\uC5C8\uC2B5\uB2C8\uB2E4.');
                currentUserMainChar = { guid: guid, name: name };
                updateWelcomeMsg(name);
                closeMainCharModal();

                if (document.getElementById('char-list-container')) loadUserCharactersForSelection('char-list-container');
                if (document.getElementById('mypage-char-list')) loadUserCharactersForSelection('mypage-char-list');
            } else {
                ModalUtils.showAlert('\uC124\uC815 \uC2E4\uD328: \uC11C\uBC84 \uC624\uB958');
            }
        } catch (e) {
            console.error(e);
            ModalUtils.showAlert('\uC124\uC815 \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.');
        }
    });
}

async function checkAdminAccess() {
    try {
        const response = await fetch('/api/user/status');
        if (response.status === 401) {
            // Prevent infinite loop if already on login page
            const path = window.location.pathname;
            if (path !== '/' && path !== '/index.html' && path !== '/auth/') {
                location.href = '/';
            }
            return;
        }

        const data = await response.json();
        
        // Ban Check
        if (data.isBanned) {
            ModalUtils.showAlert(`\uACC4\uC815\uC774 \uC815\uC9C0\uB418\uC5C8\uC2B5\uB2C8\uB2E4.\n\uC0AC\uC720: ${data.reason}\n\uD574\uC81C\uC77C: ${data.unban}`);
            await fetch('/api/logout', { method: 'POST' });
            location.href = '/';
            return;
        }

        // Store Main Character
        if (data.mainCharacter && data.mainCharacter.guid !== 0) {
            currentUserMainChar = data.mainCharacter;
            updateWelcomeMsg(data.mainCharacter.name);
        } else {
            // Main Character not set
            currentUserMainChar = null;
            updateWelcomeMsg(data.username); // Show username
            // showMainCharModal(true); // Disable forced modal
        }

        // Initialize Board with User Session
        if (typeof initBoard === 'function') {
            initBoard(data);
            if(typeof loadBoardsToSidebar === 'function') loadBoardsToSidebar();
        }
        
        // Show/Hide Tabs based on permissions
        const adminTabs = ['remote', 'update', 'account', 'ban', 'logs', 'content', 'gm', 'board-admin'];
        adminTabs.forEach(tab => {
            const btn = document.getElementById(`tab-btn-${tab}`);
            if(btn) btn.style.display = 'none';
        });

        if (data.allowedMenus) {
            data.allowedMenus.forEach(menuId => {
                const btn = document.getElementById(`tab-btn-${menuId}`);
                if (btn) btn.style.display = 'flex';
            });

            // Show separator if any admin menu is visible
            const hasAdminMenu = data.allowedMenus.some(menuId => adminTabs.includes(menuId));
            const separator = document.getElementById('admin-separator');
            if(separator) separator.style.display = hasAdminMenu ? 'block' : 'none';
        }

    } catch (e) {
        console.error("Status check failed", e);
    }
}

function updateWelcomeMsg(name) {
    const text = document.getElementById('welcome-text');
    const mobileText = document.getElementById('welcome-text-mobile');
    if (text) text.textContent = name;
    if (mobileText) mobileText.textContent = name;
}

document.addEventListener('DOMContentLoaded', () => {
    // Initial Load
    // Initial Load
    // openTab('home'); // Login page doesn't have tabs
    // checkAdminAccess(); // unauthorized
    // updatePointsHeader(); // unauthorized
    // checkStatus();      // unauthorized
    // loadBoardsToSidebar(); // unauthorized
    
    // Periodically check server status
    // setInterval(checkStatus, 30000);

    // Initialize Home Calendar if element exists
    // Initialize Home Calendar if element exists - Removed for Login Page
    /*
    const homeCalendarEl = document.getElementById('home-calendar-view');
    if (homeCalendarEl) {
        // Ensure FullCalendar is loaded. It is in <head> now.
        if (typeof FullCalendar !== 'undefined') {
            initHomeCalendar(homeCalendarEl);
        } else {
            console.error("FullCalendar not loaded");
            // Retry once after short delay
            setTimeout(() => {
                if (typeof FullCalendar !== 'undefined') initHomeCalendar(homeCalendarEl);
            }, 500);
        }
    }
    */

    // Login Form Handler
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(loginForm);
            const params = new URLSearchParams(formData);
            try {
                const response = await fetch('/api/login', {
                    method: 'POST',
                    body: params
                });

                if (response.ok) {
                    location.replace('/home/');
                } else {
                    ModalUtils.showAlert('\uB85C\uADF8\uC778 \uC2E4\uD328: ' + text);
                    ModalUtils.showAlert('??? ??: ' + text);
                }
            } catch (error) {
                ModalUtils.showAlert('\uB85C\uADF8\uC778 \uC694\uCCAD \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.');
                ModalUtils.showAlert('??? ?? ? ??? ??????.');
            }
        });
    }

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


// Home Calendar Global State
var HomeCalendarState = {
    monthData: {},
    selectedDate: null,
    calendarInstance: null
};

function initHomeCalendar(element) {
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
            const p1 = fetch(`/api/server/events?month=${str}`).then(res => res.json());
            // Fetch Game Events (Auto from DB)
            const p2 = fetch(`/api/server/game_events?month=${str}`).then(res => res.json());

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
    const dayName = ['\uC77C', '\uC6D4', '\uD654', '\uC218', '\uBAA9', '\uAE08', '\uD1A0'][d.getDay()];
    titleContainer.innerHTML = `<i class="far fa-calendar-check" style="color:var(--primary-color)"></i> <span>${d.getMonth() + 1}\uC6D4 ${d.getDate()}\uC77C (${dayName}) \uC77C\uC815</span>`;

    const events = HomeCalendarState.monthData[dateStr] || [];

    if (events.length === 0) {
        listContainer.innerHTML = `
            <div style="text-align: center; color: var(--text-secondary); margin-top: 3rem;">
                <i class="far fa-calendar-times" style="font-size: 2rem; margin-bottom: 1rem; opacity: 0.5;"></i>
                <p>?대떦 ?좎쭨???깅줉??br>?쇱젙???놁뒿?덈떎.</p>
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
            `<span style="color:#64748b; font-size:0.85rem; background:#f1f5f9; padding:2px 8px; border-radius:99px;">?섎（ 醫낆씪</span>`;
            
            content = props.content ? props.content.replace(/\n/g, '<br>') : '';
            author = `<div style="margin-top:10px; padding-top:10px; border-top:1px solid #f1f5f9; font-size:0.8rem; color:#94a3b8; text-align:right;">?묒꽦?? ${props.author || 'GM'}</div>`;
        
        } else if (type === 'game') {
            borderColor = '#bbf7d0'; // Light Green
            titleColor = '#059669';
            
            // Format start/end for display if needed, or just show Title
            // Game events often span days, so showing time might be redundant if checking specific day.
            timeStr = `<span style="color:#059669; font-size:0.85rem; background:#ecfdf5; padding:2px 8px; border-radius:99px; font-weight:600;">寃뚯엫 ?대깽??/span>`;
            content = `<div style="font-size:0.9rem; color:#64748b;">?대깽??湲곌컙:<br>${fullEvent.start.replace('T', ' ')} ~ ${fullEvent.end.replace('T', ' ')}</div>`;
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

// remove showEventModal as it's no longer used

// Points System
async function updatePointsHeader() {
    try {
        const response = await fetch('/api/user/status');
        if (response.ok) {
            const data = await response.json();
            const pointDisplays = document.querySelectorAll('#user-points-display');
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

    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:20px;">濡쒕뵫 以?..</td></tr>';

    try {
        const response = await fetch(`/api/user/points/history?page=${page}`);
        if (!response.ok) throw new Error('Failed to fetch history');
        
        const data = await response.json();
        tbody.innerHTML = '';

        if (!data.logs || data.logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:20px; color:#64748b;">?ъ씤???댁슜 ?댁뿭???놁뒿?덈떎.</td></tr>';
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
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:20px; color:#ef4444;">?댁뿭??遺덈윭?ㅻ뒗???ㅽ뙣?덉뒿?덈떎.</td></tr>';
    }
}

// function updateClock() { ... } // Removed for Login Page
// setInterval(updateClock, 1000); // Removed for Login Page
// BFCache Fix: Reload page if restored from cache
window.addEventListener('pageshow', function(event) {
    if (event.persisted) {
        window.location.reload();
    }
});

// document.addEventListener('DOMContentLoaded', updateClock); // Removed for Login Page


