
// Character Management Sub-Tab Management
let currentCharTab = 'characters';

function openCharSubTab(tabName) {
    // Update current tab tracker
    currentCharTab = tabName;

    // Hide all sub-tab contents
    const contents = document.querySelectorAll('#ban .log-sub-content');
    contents.forEach(content => content.classList.remove('active'));

    // Remove active class from all sub-tab buttons
    const buttons = document.querySelectorAll('#ban .log-sub-tab-btn');
    buttons.forEach(btn => btn.classList.remove('active'));

    // Show selected sub-tab content
    const targetContent = document.getElementById(`char-${tabName}`);
    if (targetContent) targetContent.classList.add('active');

    // Activate clicked button
    const clickedButton = Array.from(buttons).find(btn =>
        btn.getAttribute('onclick')?.includes(tabName)
    );
    if (clickedButton) clickedButton.classList.add('active');

    // Load data for the selected tab
    if (tabName === 'characters') {
        loadCharacterList(1, true);
    } else if (tabName === 'accountban') {
        loadBanList('account');
    } else if (tabName === 'ipban') {
        loadBanList('ip');
    }
    // sendmail tab doesn't need to load anything
}

function refreshCurrentCharTab() {
    openCharSubTab(currentCharTab);
}

// Character List Loading
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

        const params = new URLSearchParams({
            page: page,
            limit: 20,
            name: charName,
            account: account,
            level: level
        });

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
                <td style="font-weight:600;">${char.name}</td>
                <td style="text-align:center; color:#8b5cf6; font-weight:600;">${char.level}</td>
                <td>${char.race}/${char.class}</td>
                <td style="color:#f59e0b; font-weight:600;">${char.gold.toLocaleString()}g</td>
                <td>${char.account}</td>
                <td style="text-align:center;">
                    <button onclick="openSendMailTab('${char.name}')" class="btn btn-start" style="padding: 4px 8px; font-size: 0.8rem;">Mail</button>
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

// Open Send Mail Tab with pre-filled character name
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

// Send Mail to Character
async function sendMailToCharacter() {
    const charName = document.getElementById('mail-char-name')?.value.trim();
    const subject = document.getElementById('mail-subject')?.value.trim();
    const body = document.getElementById('mail-body')?.value.trim() || '';
    const itemEntry = document.getElementById('mail-item-entry')?.value || 0;
    const itemCount = document.getElementById('mail-item-count')?.value || 1;
    const gold = document.getElementById('mail-gold')?.value || 0;

    if (!charName) {
        alert('캐릭터 이름을 입력해주세요.');
        return;
    }

    if (!subject) {
        alert('메일 제목을 입력해주세요.');
        return;
    }

    try {
        const response = await fetch('/api/characters/sendmail', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                character: charName,
                subject: subject,
                body: body,
                item_entry: parseInt(itemEntry),
                item_count: parseInt(itemCount),
                gold: parseInt(gold)
            })
        });

        const result = await response.json();

        if (response.ok && result.status === 'success') {
            alert(`메일이 ${charName}에게 성공적으로 발송되었습니다!`);
            // Clear form
            document.getElementById('mail-char-name').value = '';
            document.getElementById('mail-subject').value = '';
            document.getElementById('mail-body').value = '';
            document.getElementById('mail-item-entry').value = '';
            document.getElementById('mail-item-count').value = '1';
            document.getElementById('mail-gold').value = '0';
        } else {
            alert(`메일 발송 실패: ${result.message || '알 수 없는 오류'}`);
        }
    } catch (e) {
        console.error("Failed to send mail", e);
        alert('메일 발송 중 오류가 발생했습니다.');
    }
}

