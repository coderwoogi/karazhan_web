
// Character Items Modal Functions
async function openCharacterItemsModal(characterName, characterGuid) {
    const modal = document.getElementById('character-items-modal');
    const modalTitle = document.getElementById('modal-character-name');
    const modalInfo = document.getElementById('modal-character-info');
    const loadingDiv = document.getElementById('modal-items-loading');
    const contentDiv = document.getElementById('modal-items-content');
    const itemsList = document.getElementById('modal-items-list');

    modalTitle.textContent = `${characterName} - 아이템`;
    modalTitle.dataset.charName = characterName;
    modal.style.display = 'flex';
    loadingDiv.style.display = 'block';
    contentDiv.style.display = 'none';
    itemsList.innerHTML = '';
    modalInfo.innerHTML = '';

    try {
        const response = await fetch(`/api/characters/items?guid=${characterGuid}`);
        if (!response.ok) throw new Error('Failed to load items');

        const data = await response.json();

        modalInfo.innerHTML = `
            <div class="modal-info-grid">
                <div class="info-item">
                    <span class="info-label">이름</span>
                    <span class="info-value">${data.character.name}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">레벨</span>
                    <span class="info-value">${data.character.level}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">종족/직업</span>
                    <span class="info-value">${data.character.race}/${data.character.class}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">소지금</span>
                    <span class="info-value" style="color:#f59e0b;">${data.character.gold.toLocaleString()}g</span>
                </div>
            </div>
        `;

        const items = data.items || [];
        if (items.length === 0) {
            itemsList.innerHTML = '<tr><td colspan="5" class="empty-state">아이템을 찾을 수 없습니다.</td></tr>';
        } else {
            const slotNames = {
                0: '머리', 1: '목', 2: '어깨', 3: '셔츠', 4: '가슴',
                5: '허리', 6: '다리', 7: '발', 8: '손목', 9: '손',
                10: '손가락 1', 11: '손가락 2', 12: '장신구 1', 13: '장신구 2',
                14: '등', 15: '주무기', 16: '보조무기', 17: '원거리', 18: '휘장',
                19: '가방 1', 20: '가방 2', 21: '가방 3', 22: '가방 4'
            };

            itemsList.innerHTML = items.map(item => {
                const slotName = item.slot < 23 ? (slotNames[item.slot] || `Slot ${item.slot}`) : `Bag ${Math.floor((item.slot - 23) / 16)} Slot ${(item.slot - 23) % 16}`;
                const enchants = item.enchantments && item.enchantments.length > 0 ? item.enchantments.join(', ') : '-';

                return `
                    <tr>
                        <td>${slotName}</td>
                        <td style="font-weight:600;">${item.name || '알 수 없는 아이템'}</td>
                        <td style="text-align:center; color: var(--text-secondary);">${item.entry}</td>
                        <td style="text-align:center; font-weight:600;">${item.count}</td>
                        <td style="text-align:center; font-size:0.85rem;">${enchants}</td>
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
