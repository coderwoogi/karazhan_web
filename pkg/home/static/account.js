let currentAccountSubTab = 'list';
let g_accountList = []; // Global list to store fetched accounts

function openAccountSubTab(tabName) {
    currentAccountSubTab = tabName;
    const tabs = document.querySelectorAll('#account .log-sub-tab-btn');
    const contents = document.querySelectorAll('#account .log-sub-content');

    tabs.forEach((t) => t.classList.remove('active'));
    contents.forEach((c) => c.classList.remove('active'));

    const targetBtn = Array.from(tabs).find((btn) => btn.getAttribute('onclick').includes(`'${tabName}'`));
    if (targetBtn) targetBtn.classList.add('active');

    const targetContent = document.getElementById(`acc-${tabName}`);
    if (targetContent) {
        targetContent.classList.add('active');
    } else {
        if (tabName === 'stats' && document.getElementById('acc-stats')) document.getElementById('acc-stats').classList.add('active');
        if (tabName === 'permissions' && document.getElementById('acc-permissions')) document.getElementById('acc-permissions').classList.add('active');
        if (tabName === 'menu' && document.getElementById('acc-menu')) document.getElementById('acc-menu').classList.add('active');
    }

    if (tabName === 'list') loadAccountList(1);
    else if (tabName === 'stats') {
        if (typeof loadStats === 'function') loadStats();
    } else if (tabName === 'permissions') {
        if (typeof loadUserList === 'function') loadUserList(1);
    } else if (tabName === 'menu') {
        if (typeof loadMenuPermissions === 'function') loadMenuPermissions();
    }
}

function refreshAccountTab() {
    if (currentAccountSubTab === 'list') loadAccountList(1);
    else if (currentAccountSubTab === 'stats') {
        if (typeof loadStats === 'function') loadStats();
    } else if (currentAccountSubTab === 'permissions') {
        if (typeof loadUserList === 'function') loadUserList(1);
    } else if (currentAccountSubTab === 'menu') {
        if (typeof loadMenuPermissions === 'function') loadMenuPermissions();
    }
}

async function loadAccountList(page = 1) {
    const tbody = document.getElementById('account-mgmt-list');
    const pgContainer = document.getElementById('account-mgmt-pagination');
    if (!tbody) return;

    tbody.style.opacity = '0.4';
    if (page === 1) {
        tbody.innerHTML = '<tr><td colspan="11" style="text-align:center; padding:20px;">로딩 중...</td></tr>';
    }

    try {
        const username = document.getElementById('filter-acc-name')?.value || '';
        const email = document.getElementById('filter-acc-email')?.value || '';
        const ip = document.getElementById('filter-acc-ip')?.value || '';

        const params = new URLSearchParams({
            page,
            limit: 20,
            username,
            email,
            ip
        });

        const res = await fetch(`/api/admin/users/list?${params.toString()}`);
        if (!res.ok) {
            const err = await res.text();
            throw new Error(err);
        }

        const data = await res.json();
        g_accountList = data.users || [];

        if (g_accountList.length === 0) {
            tbody.innerHTML = '<tr><td colspan="11" style="text-align:center; padding:20px;">검색 결과가 없습니다.</td></tr>';
            renderPagination(pgContainer, data, (p) => loadAccountList(p));
            tbody.style.opacity = '1';
            return;
        }

        tbody.innerHTML = g_accountList
            .map((u) => {
                const webRankNames = { 0: '일반', 1: 'GM 스태프', 2: '최고 관리자' };
                const webRankColors = { 0: 'user', 1: 'staff', 2: 'admin' };

                return `
                <tr onclick="openAccountDetail(${u.id})" style="cursor:pointer;" class="hover-row">
                    <td>${u.id}</td>
                    <td style="font-weight:700;">
                        ${u.username}
                        ${u.online == 1 ? '<span class="badge online" style="margin-left:5px; background:#10b981; color:white; font-size:0.7rem;">Online</span>' : ''}
                    </td>
                    <td style="color:var(--text-secondary);">${u.email}</td>
                    <td style="color:var(--text-secondary); font-family:monospace;">${u.last_ip}</td>
                    <td style="text-align:center;">
                        <span class="badge ${u.gmlevel > 0 ? 'admin' : 'user'}">${u.gmlevel}</span>
                    </td>
                    <td style="text-align:center;">
                        <span class="badge ${webRankColors[u.webRank] || 'user'}">${webRankNames[u.webRank] || `일반 (${u.webRank})`}</span>
                    </td>
                    <td style="text-align:right; font-weight:600; color:#f59e0b;">
                        <button class="btn-action" style="background:none; border:none; color:#f59e0b; font-weight:800; cursor:pointer; padding:0; text-decoration:underline;" onclick="event.stopPropagation(); openPointModal(${u.id}, '${u.username}', ${u.points || 0})">
                            ${(u.points || 0).toLocaleString()}
                        </button>
                    </td>
                    <td style="text-align:right; font-weight:600; color:#3b82f6;">
                        <button class="btn-action" style="background:none; border:none; color:#3b82f6; font-weight:800; cursor:pointer; padding:0; text-decoration:underline;" onclick="event.stopPropagation(); openCarddrawCountModal(${u.id}, '${u.username}', ${u.carddrawCount || 0})">
                            ${(u.carddrawCount || 0).toLocaleString()}
                        </button>
                    </td>
                    <td style="text-align:center; font-weight:600;">
                        ${u.charCount || 0}
                    </td>
                    <td style="text-align: center;">
                        <button class="btn-action btn-edit" style="width:auto; display:inline-block; padding: 4px 12px; white-space:nowrap;" onclick="event.stopPropagation(); openAccountDetail(${u.id})">
                            <i class="fas fa-info-circle"></i> 상세
                        </button>
                    </td>
                    <td style="text-align: center;">
                        <button class="btn-action btn-edit" style="width:auto; display:inline-block; padding: 4px 12px; white-space:nowrap; background-color:#3b82f6; color:#ffffff; margin-right: 4px;" onclick="event.stopPropagation(); openPasswordModal(${u.id}, '${u.username}')">
                            <i class="fas fa-key"></i> 비번 초기화
                        </button>
                        ${u.is_banned
                            ? `<button class="btn-action btn-delete" style="width:auto; display:inline-block; padding: 4px 12px; white-space:nowrap; background-color:#10b981; color:#ffffff;" onclick="event.stopPropagation(); submitUnban(${u.id})"><i class="fas fa-unlock"></i> 해제</button>`
                            : `<button class="btn-action btn-delete" style="width:auto; display:inline-block; padding: 4px 12px; white-space:nowrap;" onclick="event.stopPropagation(); openBanModal(${u.id}, '${u.username}')"><i class="fas fa-ban"></i> 밴</button>`
                        }
                    </td>
                </tr>
            `;
            })
            .join('');

        renderPagination(pgContainer, data, (p) => loadAccountList(p));
        tbody.style.opacity = '1';
    } catch (e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="11" style="text-align:center; padding:20px; color:red;">오류가 발생했습니다.</td></tr>';
        tbody.style.opacity = '1';
    }
}

async function openCarddrawCountModal(id, username, currentCount) {
    const current = Number(currentCount || 0);
    const askWithPrompt = async () => {
        const v = prompt(`${username} 계정의 카드뽑기 횟수를 입력하세요.`, String(current));
        if (v === null) return null;
        const n = Number(v);
        if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
            ModalUtils.showAlert('0 이상의 정수를 입력해주세요.');
            return null;
        }
        return n;
    };

    let nextCount = null;
    if (typeof window !== 'undefined' && window.Swal && typeof window.Swal.fire === 'function') {
        const result = await window.Swal.fire({
            title: '카드뽑기 횟수 수정',
            text: `${username} 계정`,
            input: 'number',
            inputValue: current,
            inputAttributes: { min: 0, step: 1 },
            showCancelButton: true,
            confirmButtonText: '저장',
            cancelButtonText: '취소',
            inputValidator: (value) => {
                const n = Number(value);
                if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
                    return '0 이상의 정수를 입력해주세요.';
                }
                return null;
            }
        });
        if (!result.isConfirmed) return;
        nextCount = Number(result.value);
    } else {
        nextCount = await askWithPrompt();
        if (nextCount === null) return;
    }

    ModalUtils.showConfirm(`${username} 계정의 카드뽑기 횟수를 ${nextCount}로 변경하시겠습니까?`, async () => {
        try {
            const formData = new URLSearchParams();
            formData.append('id', String(id));
            formData.append('count', String(nextCount));
            const res = await fetch('/api/admin/users/carddraw/update', {
                method: 'POST',
                body: formData
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || data.status !== 'success') {
                ModalUtils.showAlert(`변경 실패: ${data.message || 'Server Error'}`);
                return;
            }

            const targetUser = g_accountList.find((u) => Number(u.id) === Number(id));
            if (targetUser) targetUser.carddrawCount = Number(data.count || nextCount);
            loadAccountList(1);
            ModalUtils.showAlert('카드뽑기 횟수가 반영되었습니다.', '성공');
        } catch (e) {
            ModalUtils.showAlert(`요청 처리 중 오류가 발생했습니다. ${e.message}`);
        }
    });
}

function resetAccountSearch() {
    if (document.getElementById('filter-acc-name')) document.getElementById('filter-acc-name').value = '';
    if (document.getElementById('filter-acc-email')) document.getElementById('filter-acc-email').value = '';
    if (document.getElementById('filter-acc-ip')) document.getElementById('filter-acc-ip').value = '';
    loadAccountList(1);
}

async function openAccountDetail(id) {
    const modal = document.getElementById('account-detail-modal');
    if (!modal) return;

    const user = g_accountList.find((u) => u.id === id);

    if (user) {
        document.getElementById('acc-detail-username').textContent = user.username;
        document.getElementById('acc-detail-email').textContent = user.email || '이메일 정보 없음';
        document.getElementById('acc-detail-id').textContent = user.id;

        const gmBadge = document.getElementById('acc-detail-gm');
        const gmLevels = { 0: '일반 유저', 1: '중재자', 2: '게임 마스터', 3: '관리자' };
        gmBadge.textContent = gmLevels[user.gmlevel] || `Level ${user.gmlevel}`;

        const webBadge = document.getElementById('acc-detail-web');
        const webRanks = { 0: '일반 유저', 1: 'GM 스태프', 2: '최고 관리자' };
        webBadge.textContent = webRanks[user.webRank] || `Rank ${user.webRank}`;

        document.getElementById('acc-detail-points').textContent = (user.points || 0).toLocaleString();

        document.getElementById('acc-update-gm').value = user.gmlevel;
        document.getElementById('acc-update-web').value = user.webRank || 0;
    } else {
        document.getElementById('acc-detail-username').textContent = 'Unknown';
        document.getElementById('acc-detail-id').textContent = id;
    }

    document.getElementById('acc-detail-char-list').innerHTML = '<tr><td colspan="4" style="text-align:center; padding:40px; color:#64748b;"><i class="fas fa-circle-notch fa-spin"></i> 캐릭터 정보를 불러오는 중...</td></tr>';

    showAccountCharList();
    modal.style.display = 'flex';

    try {
        const resChars = await fetch(`/api/admin/users/characters?id=${id}`);
        const dataChars = await resChars.json();

        const charList = document.getElementById('acc-detail-char-list');
        if (dataChars.characters && dataChars.characters.length > 0) {
            const classMap = {
                1: '전사',
                2: '성기사',
                3: '사냥꾼',
                4: '도적',
                5: '사제',
                6: '죽음의 기사',
                7: '주술사',
                8: '마법사',
                9: '흑마법사',
                11: '드루이드'
            };
            const raceMap = {
                1: '인간',
                2: '오크',
                3: '드워프',
                4: '나이트 엘프',
                5: '언데드',
                6: '타우렌',
                7: '노움',
                8: '트롤',
                10: '블러드 엘프',
                11: '드레나이'
            };

            charList.innerHTML = dataChars.characters
                .map(
                    (c) => `
                <tr onclick="showAccountCharDetail(${c.guid}, '${c.name}', '${raceMap[c.race] || c.race}', '${classMap[c.class] || c.class}', ${c.level})" style="cursor:pointer;" class="hover-row">
                    <td style="font-weight:700;">${c.name}</td>
                    <td style="text-align:center;"><span class="lvl-badge">Lv.${c.level}</span></td>
                    <td style="text-align:center;">${raceMap[c.race] || c.race} / ${classMap[c.class] || c.class}</td>
                    <td>${getZoneName(c.zone) || `Zone ${c.zone}`}</td>
                </tr>
            `
                )
                .join('');
        } else {
            charList.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:#999;">캐릭터가 없습니다.</td></tr>';
        }
    } catch (e) {
        console.error(e);
        document.getElementById('acc-detail-char-list').innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:red;">데이터 로드 실패</td></tr>';
    }
}

function showAccountCharList() {
    document.getElementById('acc-detail-view-list').style.display = 'flex';
    document.getElementById('acc-detail-view-char').style.display = 'none';
}

async function showAccountCharDetail(guid, name, race, cls, level) {
    const listView = document.getElementById('acc-detail-view-list');
    const charView = document.getElementById('acc-detail-view-char');
    const loading = document.getElementById('acc-detail-char-items-loading');
    const table = document.getElementById('acc-detail-char-items-table');
    const list = document.getElementById('acc-detail-char-items-list');
    const title = document.getElementById('acc-detail-char-title');
    const quickInfo = document.getElementById('acc-detail-char-quick-info');

    listView.style.display = 'none';
    charView.style.display = 'flex';

    title.textContent = `${name} - 아이템 정보`;
    quickInfo.textContent = `Lv.${level} ${race} ${cls}`;

    loading.style.display = 'block';
    table.style.display = 'none';
    list.innerHTML = '';

    try {
        const response = await fetch(`/api/characters/items?guid=${guid}`);
        if (!response.ok) throw new Error('Failed to load items');
        const data = await response.json();
        const items = data.items || [];

        if (items.length === 0) {
            list.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:#999;">보유 아이템이 없습니다.</td></tr>';
        } else {
            const slotNames = {
                0: '머리',
                1: '목',
                2: '어깨',
                3: '셔츠',
                4: '가슴',
                5: '허리',
                6: '다리',
                7: '발',
                8: '손목',
                9: '손',
                10: '반지 1',
                11: '반지 2',
                12: '장신구 1',
                13: '장신구 2',
                14: '등',
                15: '주무기',
                16: '보조무기',
                17: '원거리',
                18: '셔틀',
                19: '가방 1',
                20: '가방 2',
                21: '가방 3',
                22: '가방 4'
            };

            list.innerHTML = items
                .map((item) => {
                    const slotName = item.slot < 23 ? slotNames[item.slot] || `Slot ${item.slot}` : `Bag ${Math.floor((item.slot - 23) / 16)} Slot ${(item.slot - 23) % 16}`;
                    const enchants = item.enchantments && item.enchantments.length > 0 ? item.enchantments.join(', ') : '-';
                    return `
                    <tr>
                        <td style="font-size:0.85rem; color:#64748b;">${slotName}</td>
                        <td style="font-weight:600;">${item.name || '알 수 없는 아이템'}</td>
                        <td style="text-align:center; color:#94a3b8; font-size:0.8rem;">${item.entry}</td>
                        <td style="text-align:center; font-weight:700; color:var(--primary-color);">${item.count}</td>
                        <td style="font-size:0.8rem; color:#64748b;">${enchants}</td>
                    </tr>
                `;
                })
                .join('');
        }

        loading.style.display = 'none';
        table.style.display = 'table';
    } catch (e) {
        console.error(e);
        loading.innerHTML = '<div style="color:red; padding:10px;">아이템 정보를 불러오지 못했습니다.</div>';
    }
}

function closeAccountDetailModal() {
    const modal = document.getElementById('account-detail-modal');
    if (modal) modal.style.display = 'none';
}

async function submitRankUpdateDetailed() {
    const userId = document.getElementById('acc-detail-id').textContent;
    const gmLevel = document.getElementById('acc-update-gm').value;
    const webRank = document.getElementById('acc-update-web').value;

    if (!userId || userId === '-') return;

    ModalUtils.showConfirm('권한 설정을 저장하시겠습니까?', async () => {
        try {
            const formData = new URLSearchParams();
            formData.append('id', userId);
            formData.append('rank', gmLevel);
            formData.append('webRank', webRank);

            const res = await fetch('/api/admin/users/update', {
                method: 'POST',
                body: formData
            });

            const data = await res.json();
            if (data.status === 'success') {
                ModalUtils.showAlert('권한이 변경되었습니다.');
                loadAccountList(1);

                const gmLevels = { 0: '일반 유저', 1: '중재자', 2: '게임 마스터', 3: '관리자' };
                const webRankNames = { 0: '일반 유저', 1: 'GM 스태프', 2: '최고 관리자' };
                document.getElementById('acc-detail-gm').textContent = gmLevels[gmLevel] || gmLevel;
                document.getElementById('acc-detail-web').textContent = webRankNames[webRank] || `일반 (${webRank})`;

                const user = g_accountList.find((u) => u.id == userId);
                if (user) {
                    user.gmlevel = parseInt(gmLevel, 10);
                    user.webRank = parseInt(webRank, 10);
                }
            } else {
                ModalUtils.showAlert(`오류: ${data.message || 'Unknown Error'}`);
            }
        } catch (e) {
            console.error(e);
            ModalUtils.showAlert('요청 처리 중 오류가 발생했습니다.');
        }
    });
}

// Ban Logic
let currentBanUserId = 0;

function openBanModal(id, username) {
    currentBanUserId = id;
    document.getElementById('ban-modal-username').textContent = username;
    document.getElementById('ban-reason').value = '';
    document.getElementById('ban-duration').value = '1';
    document.getElementById('account-ban-modal').style.display = 'flex';
}

function closeBanModal() {
    document.getElementById('account-ban-modal').style.display = 'none';
    currentBanUserId = 0;
}

async function submitBan() {
    if (!currentBanUserId) return;

    const duration = parseInt(document.getElementById('ban-duration').value, 10);
    const reason = document.getElementById('ban-reason').value;

    if (!reason) {
        ModalUtils.showAlert('사유를 입력해주세요.');
        return;
    }

    ModalUtils.showConfirm('해당 계정을 차단하시겠습니까?', async () => {
        try {
            const res = await fetch('/api/admin/users/ban', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: currentBanUserId, duration, reason })
            });
            const data = await res.json();

            if (data.status === 'success') {
                ModalUtils.showAlert('차단 처리되었습니다.');
                closeBanModal();
                loadAccountList(1);
            } else {
                ModalUtils.showAlert(`오류: ${data.message || 'Unknown Error'}`);
            }
        } catch (e) {
            console.error(e);
            ModalUtils.showAlert('요청 처리 중 오류가 발생했습니다.');
        }
    });
}

async function submitUnban(id) {
    ModalUtils.showConfirm('해당 계정의 차단을 해제하시겠습니까?', async () => {
        try {
            const res = await fetch('/api/admin/users/unban', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: id })
            });
            const data = await res.json();

            if (data.status === 'success') {
                ModalUtils.showAlert('차단 해제되었습니다.');
                loadAccountList(1);
            } else {
                ModalUtils.showAlert(`오류: ${data.message || 'Unknown Error'}`);
            }
        } catch (e) {
            console.error(e);
            ModalUtils.showAlert('요청 처리 중 오류가 발생했습니다.');
        }
    });
}

// Password Change Logic
let currentPwdUserId = 0;

function openPasswordModal(id, username) {
    currentPwdUserId = id;
    document.getElementById('pwd-modal-username').textContent = username;
    document.getElementById('pwd-new').value = '';
    document.getElementById('account-pwd-modal').style.display = 'flex';
}

function closePasswordModal() {
    document.getElementById('account-pwd-modal').style.display = 'none';
    currentPwdUserId = 0;
}

async function submitPasswordChange() {
    if (!currentPwdUserId) return;

    const newPwd = document.getElementById('pwd-new').value;

    if (!newPwd) {
        ModalUtils.showAlert('새 비밀번호를 입력해주세요.');
        return;
    }

    ModalUtils.showConfirm('비밀번호를 변경하시겠습니까?', async () => {
        try {
            const res = await fetch('/api/admin/users/password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: currentPwdUserId, new_password: newPwd })
            });
            const data = await res.json();

            if (data.status === 'success') {
                ModalUtils.showAlert('비밀번호가 초기화되었습니다.');
                closePasswordModal();
            } else {
                ModalUtils.showAlert(`오류: ${data.message || 'Unknown Error'}`);
            }
        } catch (e) {
            console.error(e);
            ModalUtils.showAlert('요청 처리 중 오류가 발생했습니다.');
        }
    });
}

// Point Management
let g_currentPointUserID = 0;
let g_currentPointUsername = '';

function openPointModal(id, username, currentPoints) {
    g_currentPointUserID = id;
    g_currentPointUsername = username || '';
    document.getElementById('point-modal-username').textContent = username;
    document.getElementById('point-modal-current').textContent = Number(currentPoints || 0).toLocaleString();
    document.getElementById('point-adjust-amount').value = '';
    document.getElementById('point-adjust-reason').value = '';

    document.getElementById('account-point-modal').style.display = 'flex';
    loadAdminPointHistory(1);
}

function closePointModal() {
    document.getElementById('account-point-modal').style.display = 'none';
    g_currentPointUserID = 0;
    g_currentPointUsername = '';
}

async function loadAdminPointHistory(page = 1) {
    const list = document.getElementById('admin-point-history-list');
    const pg = document.getElementById('admin-point-history-pagination');
    if (!list) {
        console.error("[Points] Table body 'admin-point-history-list' not found!");
        return;
    }

    list.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:10px;">로딩 중...</td></tr>';

    try {
        const res = await fetch(`/api/admin/users/points/history?id=${g_currentPointUserID}&page=${page}`);

        if (!res.ok) {
            const errText = await res.text();
            console.error(`[Points] API Error: ${res.status} ${errText}`);
            throw new Error(`Server error: ${res.status}`);
        }

        const data = await res.json();
        const logs = data.logs || [];

        if (logs.length === 0) {
            list.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:10px; color:#999;">내역이 없습니다.</td></tr>';
        } else {
            list.innerHTML = logs
                .map((log) => {
                    const isPositive = log.amount > 0;
                    const color = isPositive ? '#10b981' : '#ef4444';
                    const prefix = isPositive ? '+' : '';

                    return `
                    <tr>
                        <td style="font-size:0.8rem; color:#64748b; white-space:nowrap; padding-left: 15px;">${log.createdAt || '-'}</td>
                        <td style="text-align:right; font-weight:700; color:${color}; white-space:nowrap; padding-right: 15px;">${prefix}${(log.amount || 0).toLocaleString()}</td>
                        <td style="text-align:center; font-size:0.85rem; color:#64748b;">${log.admin || 'System'}</td>
                        <td style="font-size:0.85rem; word-break:break-all; padding-left: 15px;">${log.reason || '-'}</td>
                    </tr>
                `;
                })
                .join('');
        }

        if (typeof renderPagination === 'function') {
            renderPagination(pg, data, (p) => loadAdminPointHistory(p));
        }
    } catch (e) {
        console.error('[Points] Rendering error:', e);
        list.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:10px; color:red;">내역 조회 오류: ${e.message}</td></tr>`;
    }
}

async function submitPointUpdate() {
    const amountVal = document.getElementById('point-adjust-amount').value;
    const amount = parseInt(amountVal, 10);
    const reason = document.getElementById('point-adjust-reason').value;

    if (isNaN(amount) || amount === 0 || !reason) {
        ModalUtils.showAlert('포인트와 사유를 모두 입력해주세요.');
        return;
    }

    ModalUtils.showConfirm(`${amount > 0 ? '+' : ''}${amount} 포인트를 반영하시겠습니까?`, async () => {
        try {
            const formData = new URLSearchParams();
            formData.append('id', g_currentPointUserID);
            formData.append('amount', amount);
            formData.append('reason', reason);

            const res = await fetch('/api/admin/users/points/update', {
                method: 'POST',
                body: formData
            });

            let data = { status: 'error', message: 'Unknown Error' };
            try {
                data = await res.json();
            } catch (err) {
                console.error(err);
            }

            if (res.ok && data.status === 'success') {
                const curEl = document.getElementById('point-modal-current');
                const prevTotal = Number((curEl.textContent || '0').replace(/,/g, ''));
                const newTotal = data && data.points !== undefined && data.points !== null ? Number(data.points) : prevTotal + amount;

                // 1) 모달 내부 값 즉시 갱신
                curEl.textContent = newTotal.toLocaleString();
                document.getElementById('point-adjust-amount').value = '';
                document.getElementById('point-adjust-reason').value = '';

                // 2) 현재 메모리 목록 즉시 갱신 (행 재렌더 전에도 값 유지)
                const targetUser = g_accountList.find((u) => Number(u.id) === Number(g_currentPointUserID));
                if (targetUser) {
                    targetUser.points = newTotal;
                }

                // 3) 본인 계정이면 상단 포인트 즉시 갱신
                const sessionUser =
                    (typeof g_sessionUser !== 'undefined' ? g_sessionUser : null) ||
                    window.g_sessionUser ||
                    null;
                const sessionUsername = sessionUser && sessionUser.username ? String(sessionUser.username) : '';
                const isSelfById = sessionUser && Number(sessionUser.id) > 0 && Number(sessionUser.id) === Number(g_currentPointUserID);
                const isSelfByName = sessionUsername && g_currentPointUsername && sessionUsername.toLowerCase() === String(g_currentPointUsername).toLowerCase();
                if (isSelfById || isSelfByName) {
                    document.querySelectorAll('#user-points-display, #user-points-display-desktop').forEach((el) => {
                        el.textContent = newTotal.toLocaleString();
                    });
                    if (sessionUser) {
                        sessionUser.points = newTotal;
                    }
                    if (window.g_sessionUser) {
                        window.g_sessionUser.points = newTotal;
                    }
                }

                if (typeof updatePointsHeader === 'function') {
                    updatePointsHeader();
                }

                // 4) 히스토리/목록 새로고침도 즉시 실행
                loadAdminPointHistory(1);
                refreshAccountTab();

                // 5) 알림은 마지막에 표시
                ModalUtils.showAlert('포인트가 반영되었습니다.', '성공');
            } else {
                ModalUtils.showAlert(`포인트 반영 실패: ${data.message || 'Server Error'}`);
            }
        } catch (e) {
            ModalUtils.showAlert(`요청 처리 중 오류가 발생했습니다. ${e.message}`);
        }
    });
}

// Role-Based Permission Matrix moved to script.js to avoid duplication
