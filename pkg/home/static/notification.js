let isNotificationDropdownOpen = false;
let currentMailboxData = [];
let selectedNotifUsers = [];
let selectedMailboxIds = new Set();
let currentMailboxPage = 1;

document.addEventListener('DOMContentLoaded', () => {
    fetchNotifications();
    setInterval(fetchNotifications, 60000);

    document.addEventListener('click', (e) => {
        const container = document.querySelector('.notification-container');
        if (container && !container.contains(e.target) && isNotificationDropdownOpen) {
            closeNotificationDropdown();
        }
    });
});

function toggleNotificationDropdown() {
    const dropdown = document.getElementById('notification-dropdown');
    if (!dropdown) return;
    isNotificationDropdownOpen = !isNotificationDropdownOpen;
    dropdown.style.display = isNotificationDropdownOpen ? 'flex' : 'none';
    if (isNotificationDropdownOpen) fetchNotifications();
}

function closeNotificationDropdown() {
    const dropdown = document.getElementById('notification-dropdown');
    if (!dropdown) return;
    dropdown.style.display = 'none';
    isNotificationDropdownOpen = false;
}

async function fetchNotifications() {
    try {
        const response = await fetch('/api/notifications/list?limit=20&dropdown=true');
        if (response.status === 401) return;
        if (!response.ok) return;
        const data = await response.json();
        updateNotificationUI(data.notifications || [], data.unread_count || 0);
    } catch (e) {
        console.error('Failed to fetch notifications', e);
    }
}

function updateNotificationUI(notifications, unreadCount) {
    const badge = document.getElementById('notification-badge');
    if (badge) {
        if (unreadCount > 0) {
            badge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
            badge.style.display = 'block';
        } else {
            badge.style.display = 'none';
        }
    }

    const listContainer = document.getElementById('notification-list');
    if (!listContainer) return;

    if (!notifications.length) {
        listContainer.innerHTML = '<div class="notification-empty">수신된 알림이 없습니다.</div>';
        return;
    }

    listContainer.innerHTML = notifications.map((n) => `
        <div class="notification-item ${n.is_read ? '' : 'unread'}" onclick="handleNotificationClick(${n.id}, '${(n.link || '').replace(/'/g, '&#39;')}', '${(n.type || '').replace(/'/g, '&#39;')}')">
            <div class="notification-icon">${getNotificationIcon(n.type)}</div>
            <div class="notification-content">
                <div class="notification-title">${escapeHtmlNotif(normalizeNotifText(n.title || '알림'))}</div>
                <div class="notification-message">${escapeHtmlNotif(normalizeNotifText(n.message || ''))}</div>
                <div class="notification-time">${escapeHtmlNotif(timeAgo(new Date(n.created_at)))}</div>
            </div>
        </div>
    `).join('');
}

function getNotificationIcon(type) {
    switch (type) {
        case 'comment': return '<i class="fas fa-comment-dots" style="color:#3b82f6;"></i>';
        case 'point': return '<i class="fas fa-coins" style="color:#f59e0b;"></i>';
        case 'admin_msg': return '<i class="fas fa-envelope" style="color:#8b5cf6;"></i>';
        case 'success': return '<i class="fas fa-check-circle" style="color:#10b981;"></i>';
        case 'warning': return '<i class="fas fa-exclamation-triangle" style="color:#f97316;"></i>';
        default: return '<i class="fas fa-bell" style="color:#64748b;"></i>';
    }
}

function notificationTypeLabel(type) {
    if (type === 'point') return '포인트 사용/지급';
    if (type === 'admin_msg') return '일반 메시지';
    if (type === 'comment') return '댓글';
    if (type === 'success') return '성공';
    if (type === 'warning') return '경고';
    return '알림';
}

async function handleNotificationClick(id, link, type) {
    try {
        await fetch('/api/notifications/read', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: id, all: false })
        });
        fetchNotifications();
        if (type === 'comment' && link) {
            const handled = await navigateCommentNotification(link);
            if (handled) return;
        }
        openTab('mailbox');
        setTimeout(() => openMailboxDetailFromNotification(id), 100);
    } catch (e) {
        console.error('Failed to handle notification click', e);
        if (link) location.href = link;
    }
}

async function navigateCommentNotification(link) {
    try {
        const u = new URL(link, window.location.origin);
        if (!u.pathname.startsWith('/board/view')) return false;
        const postId = parseInt(u.searchParams.get('id') || '0', 10);
        const commentId = parseInt(u.searchParams.get('comment_id') || '0', 10);
        if (!postId) return false;

        closeNotificationDropdown();
        openTab('board');
        if (typeof viewPost === 'function') {
            await viewPost(postId, false);
        }
        if (commentId && typeof focusBoardComment === 'function') {
            setTimeout(() => focusBoardComment(commentId), 120);
        }
        return true;
    } catch (e) {
        console.error('Failed to navigate comment notification', e);
        return false;
    }
}

async function markAllNotificationsAsRead() {
    try {
        const response = await fetch('/api/notifications/read', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ all: true })
        });
        if (!response.ok) return;
        fetchNotifications();
        const mailbox = document.getElementById('mailbox');
        if (mailbox && mailbox.classList.contains('active')) loadMailbox(1);
    } catch (e) {
        console.error('Failed to mark all as read', e);
    }
}

async function clearDropdownNotifications(event) {
    if (event) event.stopPropagation();
    try {
        const response = await fetch('/api/notifications/clear-dropdown', {
            method: 'POST'
        });
        if (!response.ok) return;
        fetchNotifications();
        closeNotificationDropdown();
    } catch (e) {
        console.error('Failed to clear dropdown notifications', e);
    }
}

// Alias for legacy onclick names
function markAllNotificationsRead() {
    markAllNotificationsAsRead();
}

function deleteAllNotifications() {
    clearDropdownNotifications();
}

function timeAgo(date) {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return '방금 전';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}분 전`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}시간 전`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}일 전`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}개월 전`;
    return `${Math.floor(months / 12)}년 전`;
}

async function loadMailbox(page = 1) {
    try {
        currentMailboxPage = page;
        const response = await fetch(`/api/notifications/list?limit=10&page=${page}`);
        if (!response.ok) return;
        const data = await response.json();
        currentMailboxData = data.notifications || [];
        renderMailboxList(currentMailboxData, data.page || 1, data.total_pages || 1);
    } catch (e) {
        console.error('Failed to fetch mailbox', e);
    }
}

function loadNotificationHistory(page = 1) {
    loadMailbox(page);
}

function renderMailboxList(notifications, currentPage, totalPages) {
    const tbody = document.getElementById('mailbox-list-tbody');
    const pagination = document.getElementById('mailbox-pagination');
    if (!tbody) return;

    if (!notifications || notifications.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 2rem;">받은 알림이 없습니다.</td></tr>';
        const selectAll = document.getElementById('mailbox-select-all');
        if (selectAll) selectAll.checked = false;
        if (pagination) pagination.innerHTML = '';
        return;
    }

    tbody.innerHTML = notifications.map((n) => {
        const safe = JSON.stringify(n).replace(/'/g, '&apos;');
        const sender = n.sender_name ? escapeHtmlNotif(normalizeNotifText(n.sender_name)) : '시스템';
        const checked = selectedMailboxIds.has(n.id) ? 'checked' : '';
        return `
        <tr class="${n.is_read ? 'read-row' : 'unread-row'}" style="cursor:pointer; ${n.is_read ? '' : 'font-weight:700; background:#f8fafc;'}" onclick='showMailboxDetail(${safe})'>
            <td style="text-align:center;" onclick="event.stopPropagation();">
                <input type="checkbox" ${checked} onchange="toggleMailboxSelection(${n.id}, this.checked)" onclick="event.stopPropagation();">
            </td>
            <td style="text-align:center; color:${n.is_read ? '#cbd5e1' : '#f59e0b'};">
                <i class="fas ${n.is_read ? 'fa-envelope-open' : 'fa-envelope'}"></i>
            </td>
            <td>${getNotificationIcon(n.type)}</td>
            <td style="font-weight:600; color:#334155; white-space:nowrap;">${sender}</td>
            <td style="color:#0f172a; text-overflow:ellipsis; overflow:hidden; white-space:nowrap; max-width:460px;">
                ${escapeHtmlNotif(normalizeNotifText(n.title || '알림'))}
            </td>
            <td><span class="lvl-badge">${notificationTypeLabel(n.type)}</span></td>
            <td style="color:var(--text-secondary); font-size:0.9rem;">${escapeHtmlNotif(timeAgo(new Date(n.created_at)))}</td>
        </tr>`;
    }).join('');

    syncMailboxSelectAllState();
    renderPaginationMailbox(currentPage, totalPages);
}

function toggleMailboxSelection(id, checked) {
    if (checked) {
        selectedMailboxIds.add(id);
    } else {
        selectedMailboxIds.delete(id);
    }
    syncMailboxSelectAllState();
}

function toggleMailboxSelectAll(checked) {
    const currentIds = (currentMailboxData || []).map((n) => n.id);
    for (const id of currentIds) {
        if (checked) {
            selectedMailboxIds.add(id);
        } else {
            selectedMailboxIds.delete(id);
        }
    }
    const checkboxes = document.querySelectorAll('#mailbox-list-tbody input[type="checkbox"]');
    checkboxes.forEach((cb) => {
        cb.checked = checked;
    });
}

function syncMailboxSelectAllState() {
    const selectAll = document.getElementById('mailbox-select-all');
    if (!selectAll) return;
    const rows = currentMailboxData || [];
    if (!rows.length) {
        selectAll.checked = false;
        return;
    }
    const allSelected = rows.every((n) => selectedMailboxIds.has(n.id));
    selectAll.checked = allSelected;
}

async function deleteSelectedMailboxNotifications() {
    const ids = Array.from(selectedMailboxIds);
    if (!ids.length) {
        if (window.Swal) {
            await Swal.fire({ icon: 'info', title: '선택된 메시지가 없습니다.', timer: 1200, showConfirmButton: false });
        } else {
            alert('선택된 메시지가 없습니다.');
        }
        return;
    }

    let confirmed = true;
    if (window.Swal) {
        const result = await Swal.fire({
            icon: 'warning',
            title: `선택한 ${ids.length}개 메시지를 삭제하시겠습니까?`,
            text: '메시지는 알림 목록에서만 숨김 처리됩니다.',
            showCancelButton: true,
            confirmButtonText: '삭제',
            cancelButtonText: '취소'
        });
        confirmed = !!result.isConfirmed;
    } else {
        confirmed = confirm(`선택한 ${ids.length}개 메시지를 삭제하시겠습니까?`);
    }
    if (!confirmed) return;

    try {
        const response = await fetch('/api/notifications/delete-selected', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: ids })
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        for (const id of ids) {
            selectedMailboxIds.delete(id);
        }
        await loadMailbox(currentMailboxPage || 1);
        fetchNotifications();

        if (window.Swal) {
            await Swal.fire({ icon: 'success', title: '선택한 메시지를 삭제했습니다.', timer: 1200, showConfirmButton: false });
        }
    } catch (e) {
        console.error('Failed to delete selected mailbox notifications', e);
        if (window.Swal) {
            await Swal.fire({ icon: 'error', title: '선택 삭제에 실패했습니다.' });
        } else {
            alert('선택 삭제에 실패했습니다.');
        }
    }
}
function renderPaginationMailbox(currentPage, totalPages) {
    const container = document.getElementById('mailbox-pagination');
    if (!container) return;
    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }
    if (typeof renderPagination === 'function') {
        renderPagination(container, { page: currentPage, totalPages: totalPages }, (p) => loadMailbox(p));
        return;
    }

    // Fallback
    let html = '<div class="pagination-stable"><div class="pg-slot">';
    html += `<button onclick="loadMailbox(${Math.max(1, currentPage - 1)})" class="page-btn" ${currentPage <= 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i> 이전</button>`;
    html += '</div><div class="pg-numbers">';
    const start = Math.max(1, currentPage - 2);
    const end = Math.min(totalPages, currentPage + 2);
    for (let i = start; i <= end; i++) {
        html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="loadMailbox(${i})">${i}</button>`;
    }
    html += '</div><div class="pg-slot">';
    html += `<button onclick="loadMailbox(${Math.min(totalPages, currentPage + 1)})" class="page-btn" ${currentPage >= totalPages ? 'disabled' : ''}>다음 <i class="fas fa-chevron-right"></i></button>`;
    html += '</div></div>';
    container.innerHTML = html;
}

function showMailboxList() {
    const detail = document.getElementById('mailbox-detail-view');
    const list = document.getElementById('mailbox-list-view');
    if (detail) detail.style.display = 'none';
    if (list) list.style.display = 'block';
    loadMailbox(1);
}

function showMailboxDetail(notification) {
    const detail = document.getElementById('mailbox-detail-view');
    const list = document.getElementById('mailbox-list-view');
    if (!detail || !list) return;

    list.style.display = 'none';
    detail.style.display = 'block';

    const iconDiv = document.getElementById('mailbox-detail-icon');
    const title = document.getElementById('mailbox-detail-title');
    const date = document.getElementById('mailbox-detail-date');
    const typeLabel = document.getElementById('mailbox-detail-type');
    const sender = document.getElementById('mailbox-detail-sender');
    const content = document.getElementById('mailbox-detail-content');
    const linkContainer = document.getElementById('mailbox-detail-link-container');
    const linkBtn = document.getElementById('mailbox-detail-link');

    if (iconDiv) iconDiv.innerHTML = getNotificationIcon(notification.type);
    if (title) title.textContent = normalizeNotifText(notification.title || '알림');
    if (typeLabel) typeLabel.textContent = notificationTypeLabel(notification.type);
    if (sender) sender.textContent = normalizeNotifText(notification.sender_name || '시스템');
    if (content) content.textContent = normalizeNotifText(notification.message || '');

    if (date) {
        const d = new Date(notification.created_at);
        date.textContent = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }

    if (notification.link && linkContainer && linkBtn) {
        linkContainer.style.display = 'block';
        linkBtn.href = notification.link;
    } else if (linkContainer) {
        linkContainer.style.display = 'none';
    }

    if (!notification.is_read) {
        fetch('/api/notifications/read', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: notification.id, all: false })
        }).then(() => fetchNotifications());
    }
}

async function openMailboxDetailFromNotification(id) {
    let notif = currentMailboxData.find(n => n.id === id);
    if (!notif) {
        await loadMailbox(1);
        notif = currentMailboxData.find(n => n.id === id);
    }
    if (notif) {
        showMailboxDetail(notif);
    } else {
        showMailboxList();
    }
}

function toggleNotifTargetType() {
    const target = document.querySelector('input[name="notif-target-type"]:checked');
    const type = target ? target.value : 'user';
    const rankSelect = document.getElementById('notif-rank-select');
    const userSelect = document.getElementById('notif-user-select');
    const selectedPanel = document.getElementById('notif-selected-panel');
    if (!rankSelect || !userSelect) return;

    rankSelect.style.display = type === 'rank' ? 'block' : 'none';
    userSelect.style.display = type === 'user' ? 'block' : 'none';
    if (selectedPanel) selectedPanel.style.display = type === 'user' ? 'block' : 'none';
}

function renderSelectedNotifUsers() {
    const container = document.getElementById('notif-selected-users');
    if (!container) return;
    if (!selectedNotifUsers.length) {
        container.innerHTML = '선택된 유저가 없습니다.';
        return;
    }
    container.innerHTML = selectedNotifUsers.map(u => `
        <div style="display:flex; justify-content:space-between; align-items:center; border:1px solid #e2e8f0; border-radius:6px; padding:6px 8px;">
            <span>${escapeHtmlNotif(u.username)} (ID: ${u.id})</span>
            <button type="button" onclick="removeNotifSelectedUser(${u.id})" class="btn" style="padding:2px 8px; background:#fee2e2; color:#b91c1c;">삭제</button>
        </div>
    `).join('');
}

function clearNotifSelectedUsers() {
    selectedNotifUsers = [];
    const targetId = document.getElementById('notif-target-id');
    const result = document.getElementById('notif-user-result');
    if (targetId) targetId.value = '';
    if (result) result.textContent = '';
    renderSelectedNotifUsers();
}

function removeNotifSelectedUser(id) {
    selectedNotifUsers = selectedNotifUsers.filter(u => parseInt(u.id, 10) !== parseInt(id, 10));
    renderSelectedNotifUsers();
}

async function searchUserForNotification() {
    const inputEl = document.getElementById('notif-target-user');
    const resultDiv = document.getElementById('notif-user-result');
    const hiddenId = document.getElementById('notif-target-id');
    if (!inputEl || !resultDiv || !hiddenId) return;

    const input = inputEl.value.trim();
    if (!input) {
        resultDiv.textContent = '아이디 또는 계정명을 입력해주세요.';
        return;
    }

    resultDiv.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 검색 중...';
    hiddenId.value = '';

    try {
        const response = await fetch(`/api/admin/users/list?username=${encodeURIComponent(input)}&limit=5`);
        if (!response.ok) throw new Error('search failed');
        const data = await response.json();
        const users = data.users || [];
        if (!users.length) {
            resultDiv.textContent = '일치하는 사용자가 없습니다.';
            return;
        }

        const exact = users.find(u => String(u.username || '').toLowerCase() === input.toLowerCase());
        if (exact) {
            selectNotifUser(exact.id, exact.username);
            return;
        }

        resultDiv.innerHTML = users.map(u =>
            `<a href="#" onclick="selectNotifUser(${u.id}, '${String(u.username).replace(/'/g, '&#39;')}'); return false;" style="display:block; padding:4px 0; color:#334155;">- ${escapeHtmlNotif(u.username)} (ID: ${u.id})</a>`
        ).join('');
    } catch (e) {
        console.error(e);
        resultDiv.textContent = '검색 중 오류가 발생했습니다.';
    }
}

function selectNotifUser(id, username) {
    const targetUser = document.getElementById('notif-target-user');
    const targetID = document.getElementById('notif-target-id');
    const result = document.getElementById('notif-user-result');
    if (targetUser) targetUser.value = username;
    if (targetID) targetID.value = id;
    if (result) result.innerHTML = `<span style="color:#10b981;"><i class="fas fa-check"></i> 선택됨: <b>${escapeHtmlNotif(username)}</b> (ID: ${id})</span>`;
    const exists = selectedNotifUsers.some(u => parseInt(u.id, 10) === parseInt(id, 10));
    if (!exists) {
        selectedNotifUsers.push({ id: parseInt(id, 10), username: username || String(id) });
    }
    renderSelectedNotifUsers();
}

async function sendAdminNotification() {
    const targetType = document.querySelector('input[name="notif-target-type"]:checked')?.value || 'user';
    const targetID = document.getElementById('notif-target-id')?.value || '';
    const targetRank = document.getElementById('notif-target-rank')?.value || '';
    const title = document.getElementById('notif-title')?.value || '';
    const message = document.getElementById('notif-message')?.value || '';
    const link = document.getElementById('notif-link')?.value || '';

    if (!message.trim()) {
        ModalUtils.showAlert('메시지 내용을 입력해주세요.');
        return;
    }
    if (targetType === 'user' && selectedNotifUsers.length === 0 && !targetID) {
        ModalUtils.showAlert('대상 사용자를 선택해주세요.');
        return;
    }

    const payload = {
        target_type: targetType,
        title: title.trim(),
        message: message.trim(),
        link: link.trim()
    };
    if (targetType === 'user') {
        const ids = selectedNotifUsers.map(u => parseInt(u.id, 10)).filter(v => Number.isInteger(v) && v > 0);
        if (!ids.length && targetID) ids.push(parseInt(targetID, 10));
        payload.target_user_ids = Array.from(new Set(ids));
        if (payload.target_user_ids.length > 0) payload.target_user_id = payload.target_user_ids[0];
    }
    if (targetType === 'rank') payload.target_rank = parseInt(targetRank || '0', 10);

    try {
        const response = await fetch('/api/admin/notifications/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            const text = await response.text();
            ModalUtils.showAlert(`발송 실패: ${text}`);
            return;
        }
        ModalUtils.showAlert('알림이 발송되었습니다.');

        const targetIdEl = document.getElementById('notif-target-id');
        const targetUserEl = document.getElementById('notif-target-user');
        const titleEl = document.getElementById('notif-title');
        const msgEl = document.getElementById('notif-message');
        const linkEl = document.getElementById('notif-link');
        const resultEl = document.getElementById('notif-user-result');
        if (targetIdEl) targetIdEl.value = '';
        if (targetUserEl) targetUserEl.value = '';
        if (titleEl) titleEl.value = '';
        if (msgEl) msgEl.value = '';
        if (linkEl) linkEl.value = '';
        if (resultEl) resultEl.textContent = '';
        clearNotifSelectedUsers();
    } catch (e) {
        console.error(e);
        ModalUtils.showAlert('발송 중 오류가 발생했습니다.');
    }
}

function escapeHtmlNotif(s) {
    if (s === null || s === undefined) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function normalizeNotifText(value) {
    if (value === null || value === undefined) return '';
    const text = String(value);

    if (!text) return '';
    if (/[가-힣]/.test(text)) return text;
    if (!/[ÃÂÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßà-ÿ]/.test(text)) return text;

    try {
        const bytes = Uint8Array.from(Array.from(text, (ch) => ch.charCodeAt(0) & 0xff));
        const decoded = new TextDecoder('utf-8').decode(bytes);
        if (/[가-힣]/.test(decoded)) return decoded;
    } catch (e) {
    }

    return text;
}

