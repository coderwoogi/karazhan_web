
// Character Items Modal Functions

// 아이템 품질(0~7) → 색상
function itemQualityColor(q) {
    const c = ['#9d9d9d', '#ffffff', '#1eff00', '#0070dd', '#a335ee', '#ff8000', '#e6cc80', '#e6cc80'];
    return c[Number(q)] || '#ffffff';
}

async function openCharacterItemsModal(characterName, characterGuid) {
    const modal = document.getElementById('character-items-modal');
    const modalTitle = document.getElementById('modal-character-name');
    const modalInfo = document.getElementById('modal-character-info');
    const loadingDiv = document.getElementById('modal-items-loading');
    const contentDiv = document.getElementById('modal-items-content');
    const itemsList = document.getElementById('modal-items-list');

    modalTitle.textContent = `${characterName} - 아이템`;
    modalTitle.dataset.charName = characterName;
    modalTitle.dataset.charGuid = characterGuid;
    modal.style.display = 'flex';
    loadingDiv.style.display = 'block';
    contentDiv.style.display = 'none';
    itemsList.innerHTML = '';
    modalInfo.innerHTML = '';

    try {
        const response = await fetch(`/api/characters/items?guid=${characterGuid}`);
        if (!response.ok) throw new Error('Failed to load items');

        const data = await response.json();
        const ch = data.character || {};

        modalInfo.innerHTML = `
            <div class="modal-info-grid">
                <div class="info-item">
                    <span class="info-label">이름</span>
                    <span class="info-value">${ch.name || '-'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">레벨</span>
                    <span class="info-value">${ch.level || 0}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">종족/직업</span>
                    <span class="info-value">${ch.race || '-'}/${ch.class || '-'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">소지금</span>
                    <span class="info-value" style="color:var(--warning-color);">${Number(ch.gold || 0).toLocaleString()} G</span>
                </div>
            </div>
            <div class="char-gold-edit">
                <span class="char-gold-edit-label">골드 관리</span>
                <select id="char-gold-mode" class="input-premium">
                    <option value="add">추가 (+)</option>
                    <option value="sub">차감 (−)</option>
                    <option value="set">설정 (=)</option>
                </select>
                <input id="char-gold-amount" type="number" min="0" step="1" class="input-premium" placeholder="골드 수량">
                <button type="button" class="btn btn-primary char-gold-apply" onclick="applyCharacterGold()">적용</button>
            </div>
        `;

        const items = data.items || [];
        if (items.length === 0) {
            itemsList.innerHTML = '<tr><td colspan="5" class="empty-state">아이템을 찾을 수 없습니다.</td></tr>';
        } else {
            itemsList.innerHTML = items.map(item => {
                const loc = item.location || `Slot ${item.slot}`;
                const color = itemQualityColor(item.quality);
                const ilvl = Number(item.ilvl || 0);
                const equippedBadge = item.equipped
                    ? '<span style="display:inline-block; margin-left:6px; font-size:0.68rem; padding:1px 6px; border-radius:8px; background:rgba(201,162,74,.18); color:var(--primary-color);">장착</span>'
                    : '';
                return `
                    <tr>
                        <td style="white-space:nowrap;">${loc}${equippedBadge}</td>
                        <td style="font-weight:600; color:${color};">${item.name || '알 수 없는 아이템'}</td>
                        <td style="text-align:center; color: var(--text-secondary);">${item.entry}</td>
                        <td style="text-align:center; font-weight:600;">${item.count}</td>
                        <td style="text-align:center;">${ilvl > 0 ? ilvl : '-'}</td>
                    </tr>
                `;
            }).join('');
        }

        loadingDiv.style.display = 'none';
        contentDiv.style.display = 'block';

    } catch (e) {
        console.error("Failed to load character items", e);
        loadingDiv.innerHTML = '<div class="error-message">아이템을 불러오는데 실패했습니다. 서버 연결을 확인해주세요.</div>';
    }
}

// 소지금(골드) 변경 — 설정/추가/차감
function applyCharacterGold() {
    const title = document.getElementById('modal-character-name');
    const guid = Number((title && title.dataset.charGuid) || 0);
    const name = (title && title.dataset.charName) || '';
    if (!guid) return;
    const mode = (document.getElementById('char-gold-mode') || {}).value || 'add';
    const amount = Math.floor(Number((document.getElementById('char-gold-amount') || {}).value || 0));
    if (!(amount >= 0)) { if (window.ModalUtils) ModalUtils.showAlert('골드 수량을 올바르게 입력해주세요.'); return; }
    const label = mode === 'set' ? '설정' : (mode === 'sub' ? '차감' : '추가');

    const run = async () => {
        try {
            const res = await fetch('/api/characters/gold', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ guid, mode, amount })
            });
            const data = await res.json().catch(() => ({}));
            if (data.status === 'success') {
                if (window.ModalUtils) ModalUtils.showAlert(`골드를 변경했습니다. 현재 소지금: ${Number(data.gold || 0).toLocaleString()} G`);
                openCharacterItemsModal(name, guid); // 모달 새로고침
            } else if (window.ModalUtils) {
                ModalUtils.showAlert(data.message || '골드 변경에 실패했습니다.');
            }
        } catch (e) {
            if (window.ModalUtils) ModalUtils.showAlert('처리 중 오류가 발생했습니다.');
        }
    };

    if (window.ModalUtils && ModalUtils.showConfirm) {
        ModalUtils.showConfirm(`${name} 의 골드를 ${amount.toLocaleString()} G ${label}하시겠습니까?`, run);
    } else {
        run();
    }
}

function closeCharacterItemsModal() {
    document.getElementById('character-items-modal').style.display = 'none';
}

document.addEventListener('DOMContentLoaded', function () {
    const modal = document.getElementById('character-items-modal');
    if (modal) {
        modal.addEventListener('click', function (event) {
            if (event.target === modal) {
                closeCharacterItemsModal();
            }
        });
    }
});
