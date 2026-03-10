function renderPagination(container, data, loadFunc) {
    if (!container) return;
    container.innerHTML = '';
    container.className = 'pagination-stable';

    const currentPage = data.page || 1;
    const totalPages = Math.max(1, data.totalPages || 0);

    const leftSlot = document.createElement('div');
    leftSlot.className = 'pg-slot';
    const prevBtn = document.createElement('button');
    prevBtn.className = 'page-btn';
    prevBtn.innerHTML = '<i class="fas fa-chevron-left"></i> 이전';
    if (currentPage <= 1) prevBtn.disabled = true;
    else prevBtn.onclick = () => loadFunc(currentPage - 1);
    leftSlot.appendChild(prevBtn);
    container.appendChild(leftSlot);

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

    const rightSlot = document.createElement('div');
    rightSlot.className = 'pg-slot';
    const nextBtn = document.createElement('button');
    nextBtn.className = 'page-btn';
    nextBtn.innerHTML = '다음 <i class="fas fa-chevron-right"></i>';
    if (currentPage >= totalPages) nextBtn.disabled = true;
    else nextBtn.onclick = () => loadFunc(currentPage + 1);
    rightSlot.appendChild(nextBtn);
    container.appendChild(rightSlot);
}

async function initShopStandalonePage() {
    try {
        const res = await fetch('/api/user/status');
        const data = await res.json();
        if (!res.ok) {
            location.href = '/';
            return;
        }

        window.g_sessionUser = data || {};

        const permissions = (data && typeof data.permissions === 'object' && data.permissions) ? data.permissions : {};
        const allowedMenus = Array.isArray(data?.allowedMenus) ? data.allowedMenus : [];
        const webRank = Number(data.webRank || 0);
        const allowed = permissions.menu_shop === true || allowedMenus.includes('shop') || webRank >= 2 || data.isAdmin === true;
        if (!allowed) {
            await Swal.fire({ icon: 'warning', title: '선술집 접근 권한이 없습니다.' });
            location.href = '/home/';
            return;
        }

        const username = String(data.mainCharacter?.name || data.username || '');
        const labelEl = document.getElementById('shop-page-user-label');
        if (labelEl) labelEl.textContent = username ? `${username}님의 선술집` : '선술집';

        const points = Number(data.points || 0).toLocaleString();
        document.querySelectorAll('#user-points-display, #user-points-display-desktop').forEach(el => {
            el.textContent = points;
        });

        if (typeof loadShopPage === 'function') {
            loadShopPage();
        }
    } catch (e) {
        location.href = '/';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initShopStandalonePage();
});
