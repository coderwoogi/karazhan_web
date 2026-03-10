
// Playtime Reward Logs (Restored Manually)
async function loadPlaytimeLogs(page = 1, clearFilters = false) {
    const tbody = document.getElementById('playtime-logs-list');
    const pgContainer = document.getElementById('playtime-logs-pagination');
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
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:red;">로그를 불러오는데 실패했습니다.</td></tr>';
            tbody.style.opacity = '1';
            return;
        }
        const data = await response.json();
        const logs = data.logs || [];

        if (!logs || logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">로그가 없습니다.</td></tr>';
            tbody.style.opacity = '1';
            if(typeof renderPagination === 'function') renderPagination(pgContainer, data, (p) => loadPlaytimeLogs(p));
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

        if(typeof renderPagination === 'function') renderPagination(pgContainer, data, (p) => loadPlaytimeLogs(p));

        tbody.style.opacity = '1';
    } catch (e) {
        console.error(e);
        ModalUtils.handleError(e);
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:20px; color:red;">오류가 발생했습니다.</td></tr>`;
        tbody.style.opacity = '1';
    }
}
