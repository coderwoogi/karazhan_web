const instanceBonusApp = (() => {
    const state = {
        currentTab: 'dashboard',
        mapOptions: [],
        mapsPage: 1,
        mapsCache: [],
        mapEditingId: null,
        missionsPage: 1,
        themesPage: 1,
        rewardsPage: 1,
        runsPage: 1,
        missionEditingId: null,
        themeEditingId: null,
        rewardEditingId: null,
        currentRunTab: 'overview',
        currentRunId: null,
        themesCache: [],
        missionsCache: []
    };

    const missionFields = [
        ['map_id', '맵 ID', 'number'], ['mission_key', '미션 키'], ['name', '이름'], ['description', '설명', 'textarea', true],
        ['briefing_text', '브리핑', 'textarea', true], ['mission_type', '미션 종류'], ['objective_type', '목표 방식'],
        ['target_entry', '대상 번호', 'number'], ['target_label', '목표 이름'], ['target_count', '목표 수량', 'number'],
        ['time_limit_sec', '제한 시간(초)', 'number'], ['failure_condition_type', '실패 조건'], ['required_boss_entry', '필수 보스 번호', 'number'],
        ['required_before_boss_entry', '선행 보스 번호', 'number'], ['allowed_death_count', '허용 사망 수', 'number'],
        ['allowed_wipe_count', '허용 전멸 수', 'number'], ['reward_profile_id', '보상 프로파일 ID', 'number'], ['difficulty_weight', '난이도 가중치', 'number'],
        ['min_party_size', '최소 파티 수', 'number'], ['max_party_size', '최대 파티 수', 'number'], ['min_avg_item_level', '최소 평균 템렙', 'number'],
        ['max_avg_item_level', '최대 평균 템렙', 'number'], ['required_tank', '탱커 필요', 'checkbox'], ['required_healer', '힐러 필요', 'checkbox'],
        ['enabled', '활성', 'checkbox'], ['publish_status', '게시 상태', 'select', false, ['draft','review','published','archived']]
    ];
    const themeFields = [
        ['map_id', '맵 ID', 'number'], ['theme_key', '테마 키'], ['name', '이름'], ['description', '설명', 'textarea', true],
        ['briefing_style', '브리핑 방식'], ['min_party_size', '최소 파티 수', 'number'], ['max_party_size', '최대 파티 수', 'number'],
        ['min_avg_item_level', '최소 평균 템렙', 'number'], ['max_avg_item_level', '최대 평균 템렙', 'number'], ['required_tank', '탱커 필요', 'checkbox'],
        ['required_healer', '힐러 필요', 'checkbox'], ['weight', '가중치', 'number'], ['enabled', '활성', 'checkbox'],
        ['publish_status', '게시 상태', 'select', false, ['draft','review','published','archived']]
    ];
    const publishStatuses = ['draft', 'review', 'published', 'archived'];
    const publishStatusLabels = { draft: '초안', review: '검토', published: '게시', archived: '보관' };
    const mapFields = [
        { name: 'map_id', label: '맵 ID', type: 'number', help: '던전이나 레이드 맵 번호입니다.' },
        { name: 'map_name', label: '맵 이름', help: '운영 화면에서 확인할 이름입니다.' },
        { name: 'default_time_limit_sec', label: '기본 시간 제한(초)', type: 'number' },
        { name: 'max_concurrent_missions', label: '최대 동시 미션 수', type: 'number' },
        { name: 'min_party_size', label: '최소 파티 수', type: 'number' },
        { name: 'max_party_size', label: '최대 파티 수', type: 'number' },
        { name: 'enabled', label: '활성', type: 'checkbox' },
        { name: 'allow_vote', label: '투표 허용', type: 'checkbox' },
        { name: 'allow_llm', label: 'LLM 허용', type: 'checkbox' },
        { name: 'notes', label: '운영 메모', type: 'textarea', full: true, help: '운영자가 참고할 특이사항을 적습니다.' }
    ];

    async function init() {
        bindTabs();
        bindRunTabs();
        renderMapForm();
        renderMissionForm();
        renderThemeForm();
        renderRewardForm();
        await loadMapOptions();
        refreshCurrent();
    }

    function bindTabs() {
        document.querySelectorAll('.ib-tabs .ib-tab[data-tab]').forEach((btn) => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.ib-tabs .ib-tab[data-tab]').forEach((el) => el.classList.remove('active'));
                document.querySelectorAll('.ib-panel').forEach((el) => el.classList.remove('active'));
                btn.classList.add('active');
                state.currentTab = btn.dataset.tab;
                document.querySelector(`.ib-panel[data-panel="${btn.dataset.tab}"]`)?.classList.add('active');
                refreshCurrent();
            });
        });
    }

    function bindRunTabs() {
        document.querySelectorAll('.ib-subtabs .ib-tab').forEach((btn) => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.ib-subtabs .ib-tab').forEach((el) => el.classList.remove('active'));
                btn.classList.add('active');
                state.currentRunTab = btn.dataset.runTab;
                if (state.currentRunId) loadRunDetailTab(state.currentRunId, state.currentRunTab);
            });
        });
    }

    async function api(url, options = {}) {
        const res = await fetch(url, {
            credentials: 'include',
            headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
            ...options
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(text || `HTTP ${res.status}`);
        }
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) return res.json();
        return res.text();
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    async function loadMapOptions() {
        state.mapOptions = await api('/instance-bonus/map-options');
        applyMapOptions();
    }

    function filteredMapOptions(searchText) {
        const keyword = String(searchText || '').trim().toLowerCase();
        if (!keyword) return state.mapOptions;
        return state.mapOptions.filter((row) => {
            const maxPlayersText = row.max_players ? `최대 ${row.max_players}명` : '';
            const raw = `${row.map_name} ${row.map_type} ${row.map_id} ${maxPlayersText}`.toLowerCase();
            return raw.includes(keyword);
        });
    }

    function fillMapSearchInput(searchId, mapId) {
        const searchEl = document.getElementById(searchId);
        if (!searchEl) return;
        const selected = state.mapOptions.find((row) => Number(row.map_id) === Number(mapId));
        searchEl.value = selected ? selected.map_name : '';
    }

    function renderMapOptionsFromList(list, includeEmpty = true, emptyLabel = '전체') {
        const options = list.map((row) => {
            const suffix = row.max_players ? ` · 최대 ${row.max_players}명` : '';
            return `<option value="${row.map_id}">${escapeHtml(row.map_name)} (${escapeHtml(row.map_type)})${suffix}</option>`;
        }).join('');
        if (!includeEmpty) return options;
        return `<option value="">${emptyLabel}</option>${options}`;
    }

    function applyMapOptions() {
        const mappings = [
            ['maps-filter-map-id', 'maps-filter-map-id-search', true, '전체'],
            ['missions-filter-map-id', 'missions-filter-map-id-search', true, '전체'],
            ['themes-filter-map-id', 'themes-filter-map-id-search', true, '전체'],
            ['rewards-filter-map-id', 'rewards-filter-map-id-search', true, '전체'],
            ['runs-filter-map-id', 'runs-filter-map-id-search', true, '전체'],
            ['map-form-map-id', 'map-form-map-id-search', false, '던전/레이드를 선택하세요'],
            ['mission-form-map-id', 'mission-form-map-id-search', false, '던전/레이드를 선택하세요'],
            ['theme-form-map-id', 'theme-form-map-id-search', false, '던전/레이드를 선택하세요'],
            ['reward-form-map-id', 'reward-form-map-id-search', false, '던전/레이드를 선택하세요']
        ];
        mappings.forEach(([selectId, searchId, includeEmpty, emptyLabel]) => {
            const el = document.getElementById(selectId);
            const searchEl = document.getElementById(searchId);
            if (!el || !searchEl) return;
            const currentValue = el.value;
            const list = filteredMapOptions(searchEl.value);
            el.innerHTML = renderMapOptionsFromList(list, includeEmpty, emptyLabel);
            if (currentValue) el.value = currentValue;
            if (currentValue && !el.value) {
                const selected = state.mapOptions.find((row) => String(row.map_id) === String(currentValue));
                if (selected) {
                    el.innerHTML = renderMapOptionsFromList([selected, ...list], includeEmpty, emptyLabel);
                    el.value = currentValue;
                }
            }
            if (!searchEl.dataset.bound) {
                searchEl.addEventListener('input', () => {
                    const selectedValue = el.value;
                    const filtered = filteredMapOptions(searchEl.value);
                    el.innerHTML = renderMapOptionsFromList(filtered, includeEmpty, emptyLabel);
                    if (selectedValue) el.value = selectedValue;
                    if (selectId === 'map-form-map-id') syncMapNameFromSelect();
                });
                searchEl.dataset.bound = '1';
            }
        });
    }

    function badge(value) {
        return `<span class="ib-badge ${value ? 'ok' : 'off'}">${value ? '사용' : '비활성'}</span>`;
    }

    function publishBadge(value) {
        const klass = value === 'published' ? 'ok' : (value === 'review' ? 'warn' : 'off');
        const raw = value || 'draft';
        return `<span class="ib-badge ${klass}">${escapeHtml(publishStatusLabels[raw] || raw)}</span>`;
    }

    function renderPagination(containerId, current, total, limit, handlerName) {
        const container = document.getElementById(containerId);
        if (!container) return;
        const pageCount = Math.max(1, Math.ceil((total || 0) / (limit || 20)));
        if (pageCount <= 1) {
            container.innerHTML = '';
            return;
        }
        let html = '';
        for (let i = 1; i <= pageCount; i += 1) {
            html += `<button class="${i === current ? 'active' : ''}" onclick="instanceBonusApp.${handlerName}(${i})">${i}</button>`;
        }
        container.innerHTML = html;
    }

    function formSection(title, desc = '') {
        return `<div class="ib-form-section"><div><h4>${title}</h4>${desc ? `<p>${desc}</p>` : ''}</div></div>`;
    }

    function fieldTemplate({ name, label, type = 'text', full = false, options = [], help = '' }) {
        const helpHtml = help ? `<small class="ib-help">${help}</small>` : '';
        if (type === 'textarea') return `<div class="ib-field ${full ? 'full' : ''}"><label>${label}</label><textarea name="${name}"></textarea>${helpHtml}</div>`;
        if (type === 'checkbox') return `<div class="ib-field"><label>${label}</label><select name="${name}"><option value="1">사용</option><option value="0">미사용</option></select>${helpHtml}</div>`;
        if (type === 'select') return `<div class="ib-field ${full ? 'full' : ''}"><label>${label}</label><select name="${name}">${options.map((v) => `<option value="${v}">${publishStatusLabels[v] || v}</option>`).join('')}</select>${helpHtml}</div>`;
        return `<div class="ib-field ${full ? 'full' : ''}"><label>${label}</label><input type="${type}" name="${name}">${helpHtml}</div>`;
    }

    function confirmPublishWorkflow(name) {
        const acknowledged = prompt(`${name}을(를) 게시 상태로 저장합니다.\n운영 중인 콘텐츠라면 검토 후 진행해야 합니다.\n계속하려면 게시 를 입력하세요.`, '');
        return acknowledged === '게시' || acknowledged === 'published';
    }

    function renderRowsTable(columns, rows, emptyMessage = '데이터가 없습니다.') {
        if (!rows || !rows.length) {
            return `<div class="ib-empty">${emptyMessage}</div>`;
        }
        return `<div class="ib-table-wrap"><table class="ib-table"><thead><tr>${columns.map((col) => `<th>${col.label}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${columns.map((col) => `<td>${escapeHtml(col.render ? col.render(row) : row[col.key])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    }

    function toggleCrudView(prefix, mode) {
        const listCard = document.getElementById(`${prefix}-list-card`);
        const formCard = document.getElementById(`${prefix === 'maps' ? 'map' : prefix.slice(0, -1)}-form-card`);
        if (!listCard || !formCard) return;
        if (mode === 'form') {
            listCard.classList.add('ib-view-hidden');
            formCard.style.display = 'block';
        } else {
            listCard.classList.remove('ib-view-hidden');
            formCard.style.display = 'none';
        }
    }

    async function loadDashboard() {
        const data = await api('/instance-bonus/dashboard');
        document.getElementById('dashboard-guide').innerHTML = [
            '1. 먼저 맵 설정에서 어떤 던전/레이드를 운영할지 등록합니다.',
            '2. 보상 프로파일에서 등급별 보상을 먼저 만듭니다.',
            '3. 미션 관리에서 실제 추가 미션을 만듭니다.',
            '4. 테마 관리에서 미션을 묶을 테마를 만듭니다.',
            '5. 테마-미션 연결에서 테마에 미션을 연결하고 순서를 정합니다.',
            '6. 검토가 끝나면 게시 상태를 게시로 바꿔 운영에 투입합니다.',
            `현재 기존 게임 테이블에는 미션 ${data.runtimeMissionCount || 0}개, 테마 ${data.runtimeThemeCount || 0}개가 있고, 웹 관리용 v2 테이블에는 미션 ${data.v2MissionCount || 0}개, 테마 ${data.v2ThemeCount || 0}개가 있습니다.`
        ].map((line) => `<div class="ib-list-item">${line}</div>`).join('');
        document.getElementById('dashboard-stats').innerHTML = [
            ['최근 실행 런 수', data.recentRuns || 0],
            ['오늘 성공 런', data.todaySuccess || 0],
            ['오늘 실패 런', data.todayFailed || 0],
            ['최근 대체 선택 발생 수', data.recentFallbacks || 0]
        ].map(([label, value]) => `<div class="ib-stat"><small>${label}</small><strong>${value}</strong></div>`).join('');
        document.getElementById('dashboard-map-runs').innerHTML = (data.mapRunCounts || []).length
            ? data.mapRunCounts.map((row) => `<div class="ib-list-item"><div class="ib-kv"><strong>맵 ID</strong><span>${escapeHtml(row.mapId)}</span></div><div class="ib-kv"><strong>실행 수</strong><span>${escapeHtml(row.count)}</span></div></div><div class="ib-help">${escapeHtml(row.name || '')}</div>`).join('')
            : '<div class="ib-empty">최근 실행 데이터가 없습니다.</div>';
        document.getElementById('dashboard-failed-runs').innerHTML = (data.recentFailedRuns || []).length
            ? data.recentFailedRuns.map((row) => `<div class="ib-list-item"><div><strong>#${row.run_id}</strong> · ${escapeHtml(row.mission_name || '-')}</div><div class="ib-help">${escapeHtml(row.status || '-')} / ${escapeHtml(row.failure_reason || '실패 사유 없음')}</div></div>`).join('')
            : '<div class="ib-empty">최근 실패 런이 없습니다.</div>';
    }

    async function importRuntimeData() {
        if (!confirm('기존 게임 런타임 테이블의 미션/테마 데이터를 v2 관리 화면으로 가져오시겠습니까?\n기존 런타임 테이블은 수정하지 않습니다.')) return;
        const result = await api('/instance-bonus/runtime/import', { method: 'POST', body: '{}' });
        alert(`가져오기가 완료되었습니다.\n맵 설정 ${result.importedMaps}건\n미션 ${result.importedMissions}건\n테마 ${result.importedThemes}건\n연결 ${result.importedLinks}건`);
        refreshCurrent();
    }

    function resetMapsFilter() {
        ['maps-filter-map-id', 'maps-filter-enabled'].forEach((id) => { const el = document.getElementById(id); if (el) el.value = ''; });
        state.mapsPage = 1;
        loadMaps();
    }

    function renderMapForm() {
        const form = document.getElementById('map-form');
        form.innerHTML = [
            formSection('기본 설정', '어떤 맵에서 시스템을 사용할지와 기본 제한값을 설정합니다.'),
            `<div class="ib-field"><label>던전/레이드 선택</label><input id="map-form-map-id-search" type="text" placeholder="던전/레이드 검색"><select id="map-form-map-id" name="map_id"></select><small class="ib-help">게임에 등록된 인스턴스 던전/레이드 목록입니다.</small></div>`,
            `<div class="ib-field"><label>맵 이름</label><input id="map-form-map-name" type="text" name="map_name" readonly><small class="ib-help">선택한 맵 이름이 자동으로 입력됩니다.</small></div>`,
            ...mapFields.filter((field) => !['map_id', 'map_name'].includes(field.name)).map((field) => fieldTemplate(field)),
            `<div class="ib-field full"><div class="ib-actions"><button type="button" class="ib-btn ib-btn-primary" onclick="instanceBonusApp.saveMap(false)">저장 후 목록</button><button type="button" class="ib-btn ib-btn-ghost" onclick="instanceBonusApp.saveMap(true)">저장 후 계속 편집</button><button type="button" class="ib-btn ib-btn-secondary" onclick="instanceBonusApp.closeMapForm()">닫기</button></div></div>`
        ].join('');
        applyMapOptions();
        document.getElementById('map-form-map-id')?.addEventListener('change', syncMapNameFromSelect);
    }

    function openMapForm(data = null) {
        state.mapEditingId = data ? data.map_id : null;
        toggleCrudView('maps', 'form');
        document.getElementById('map-form-title').textContent = data ? `맵 설정 수정 #${data.map_id}` : '맵 설정 등록';
        const form = document.getElementById('map-form');
        mapFields.forEach((field) => {
            const el = form.elements[field.name];
            if (!el) return;
            const value = data ? data[field.name] : '';
            if (field.type === 'checkbox') el.value = value ? '1' : '0';
            else el.value = value ?? '';
            if (field.name === 'map_id') el.disabled = !!data;
        });
        if (!data) {
            form.elements.enabled.value = '1';
            form.elements.allow_vote.value = '1';
            form.elements.allow_llm.value = '0';
            form.elements.min_party_size.value = '1';
            form.elements.max_party_size.value = '5';
            form.elements.max_concurrent_missions.value = '1';
        }
        fillMapSearchInput('map-form-map-id-search', form.elements.map_id.value);
        syncMapNameFromSelect();
    }

    function closeMapForm() {
        toggleCrudView('maps', 'list');
        state.mapEditingId = null;
    }

    function mapPayload() {
        const form = document.getElementById('map-form');
        const payload = {};
        mapFields.forEach((field) => {
            const el = form.elements[field.name];
            if (!el) return;
            if (field.type === 'number') payload[field.name] = Number(el.value || 0);
            else if (field.type === 'checkbox') payload[field.name] = el.value === '1';
            else payload[field.name] = el.value;
        });
        if (!payload.map_id || payload.map_id <= 0) throw new Error('맵 ID는 필수입니다.');
        return payload;
    }

    function syncMapNameFromSelect() {
        const select = document.getElementById('map-form-map-id');
        const input = document.getElementById('map-form-map-name');
        if (!select || !input) return;
        const selected = state.mapOptions.find((row) => Number(row.map_id) === Number(select.value));
        input.value = selected ? selected.map_name : '';
        const searchInput = document.getElementById('map-form-map-id-search');
        if (searchInput && selected) searchInput.value = selected.map_name;
    }

    async function saveMap(keepEditing = false) {
        const payload = mapPayload();
        if (state.mapEditingId) {
            await api(`/instance-bonus/maps/${state.mapEditingId}`, { method: 'PUT', body: JSON.stringify(payload) });
        } else {
            await api('/instance-bonus/maps', { method: 'POST', body: JSON.stringify(payload) });
        }
        loadMaps();
        if (!keepEditing) {
            closeMapForm();
        }
    }

    async function loadMaps(page = state.mapsPage) {
        state.mapsPage = page;
        const params = new URLSearchParams({ page: String(page), limit: '20' });
        const mapId = document.getElementById('maps-filter-map-id')?.value.trim();
        const enabled = document.getElementById('maps-filter-enabled')?.value;
        if (mapId) params.set('map_id', mapId);
        if (enabled !== '') params.set('enabled', enabled);
        const data = await api(`/instance-bonus/maps?${params.toString()}`);
        state.mapsCache = data.items || [];
        const body = document.getElementById('maps-table');
        body.innerHTML = state.mapsCache.length ? state.mapsCache.map((row) => `
            <tr>
                <td>${escapeHtml(row.map_name || `맵 ${row.map_id}`)}<div class="ib-help">ID ${row.map_id}</div></td>
                <td>${badge(row.enabled)}</td>
                <td>${badge(row.allow_vote)}</td>
                <td>${badge(row.allow_llm)}</td>
                <td>${row.default_time_limit_sec || 0}</td>
                <td>${row.min_party_size || 0} ~ ${row.max_party_size || 0}</td>
                <td>${row.max_concurrent_missions || 0}</td>
                <td>${escapeHtml(row.updated_by || '-')}</td>
                <td><div class="ib-actions"><button class="ib-btn ib-btn-ghost" onclick="instanceBonusApp.editMapById(${row.map_id})">수정</button><button class="ib-btn ib-btn-danger" onclick="instanceBonusApp.deleteMap(${row.map_id})">삭제</button></div></td>
            </tr>`).join('') : '<tr><td colspan="9" class="ib-empty">등록된 맵 설정이 없습니다.</td></tr>';
        renderPagination('maps-pagination', data.page || 1, data.total || 0, data.limit || 20, 'loadMaps');
    }

    async function editMapById(mapID) {
        const row = state.mapsCache.find((item) => Number(item.map_id) === Number(mapID));
        if (!row) return;
        openMapForm(row);
    }

    async function deleteMap(mapID) {
        const row = state.mapsCache.find((item) => Number(item.map_id) === Number(mapID));
        if (!row) return;
        if (!confirm(`map_id ${mapID} 설정을 비활성화하시겠습니까?\n기존 런타임 테이블은 건드리지 않고 enabled만 0으로 변경합니다.`)) return;
        await api(`/instance-bonus/maps/${mapID}`, { method: 'DELETE' });
        loadMaps(state.mapsPage);
    }

    function renderMissionForm() {
        const form = document.getElementById('mission-form');
        const sections = [
            formSection('기본 정보', '운영자가 식별하는 미션 키와 화면 노출 이름, 설명을 설정합니다.'),
            `<div class="ib-field"><label>던전/레이드 선택</label><input id="mission-form-map-id-search" type="text" placeholder="던전/레이드 검색"><select id="mission-form-map-id" name="map_id"></select><small class="ib-help">이 미션이 속할 던전/레이드를 고릅니다.</small></div>`,
            fieldTemplate({ name: 'mission_key', label: '미션 키', help: '중복되지 않는 내부 식별자입니다.' }),
            fieldTemplate({ name: 'name', label: '이름', help: '운영자/유저 화면에 표시되는 미션 이름입니다.' }),
            fieldTemplate({ name: 'description', label: '설명', type: 'textarea', full: true }),
            fieldTemplate({ name: 'briefing_text', label: '브리핑', type: 'textarea', full: true, help: '인게임 진입 시 노출될 짧은 안내 텍스트입니다.' }),

            formSection('목표 조건', '미션 성공/실패 판정을 위한 핵심 목표값을 설정합니다.'),
            fieldTemplate({ name: 'mission_type', label: '미션 종류', help: '예: 빠른 클리어, 보스 집중, 처치형 등으로 구분합니다.' }),
            fieldTemplate({ name: 'objective_type', label: '목표 방식', help: '예: 처치 수, 보스 처치, 무사고 클리어 같은 판정 기준입니다.' }),
            fieldTemplate({ name: 'target_entry', label: '대상 번호', type: 'number' }),
            fieldTemplate({ name: 'target_label', label: '대상 이름' }),
            fieldTemplate({ name: 'target_count', label: '목표 수량', type: 'number' }),
            fieldTemplate({ name: 'time_limit_sec', label: '제한 시간(초)', type: 'number' }),
            fieldTemplate({ name: 'failure_condition_type', label: '실패 조건' }),
            fieldTemplate({ name: 'required_boss_entry', label: '필수 보스 번호', type: 'number' }),
            fieldTemplate({ name: 'required_before_boss_entry', label: '선행 보스 번호', type: 'number' }),
            fieldTemplate({ name: 'allowed_death_count', label: '허용 사망 수', type: 'number' }),
            fieldTemplate({ name: 'allowed_wipe_count', label: '허용 전멸 수', type: 'number' }),

            formSection('보상/난이도', '보상 프로파일과 미션 가중치를 연결합니다.'),
            fieldTemplate({ name: 'reward_profile_id', label: '보상 프로파일 ID', type: 'number' }),
            fieldTemplate({ name: 'difficulty_weight', label: '난이도 가중치', type: 'number' }),

            formSection('파티 조건 및 게시', '파티 규모와 게시 워크플로우를 함께 관리합니다.'),
            fieldTemplate({ name: 'min_party_size', label: '최소 파티 수', type: 'number' }),
            fieldTemplate({ name: 'max_party_size', label: '최대 파티 수', type: 'number' }),
            fieldTemplate({ name: 'min_avg_item_level', label: '최소 평균 템렙', type: 'number' }),
            fieldTemplate({ name: 'max_avg_item_level', label: '최대 평균 템렙', type: 'number' }),
            fieldTemplate({ name: 'required_tank', label: '탱커 필요', type: 'checkbox' }),
            fieldTemplate({ name: 'required_healer', label: '힐러 필요', type: 'checkbox' }),
            fieldTemplate({ name: 'enabled', label: '활성', type: 'checkbox' }),
            fieldTemplate({ name: 'publish_status', label: '게시 상태', type: 'select', options: publishStatuses, help: '초안, 검토, 게시, 보관 단계로 관리합니다.' }),
            `<div class="ib-field full"><div class="ib-actions"><button type="button" class="ib-btn ib-btn-primary" onclick="instanceBonusApp.saveMission(false)">저장 후 목록</button><button type="button" class="ib-btn ib-btn-ghost" onclick="instanceBonusApp.saveMission(true)">저장 후 계속 편집</button><button type="button" class="ib-btn ib-btn-secondary" onclick="instanceBonusApp.closeMissionForm()">닫기</button></div></div>`
        ];
        form.innerHTML = sections.join('');
        applyMapOptions();
    }

    function openMissionForm(data = null) {
        state.missionEditingId = data ? data.mission_id : null;
        toggleCrudView('missions', 'form');
        document.getElementById('mission-form-title').textContent = data ? `미션 수정 #${data.mission_id}` : '미션 등록';
        const form = document.getElementById('mission-form');
        missionFields.forEach(([name, , type]) => {
            const el = form.elements[name];
            if (!el) return;
            const value = data ? data[name] : '';
            if (type === 'checkbox') el.value = value ? '1' : '0';
            else el.value = value ?? '';
        });
        if (!data) {
            form.elements.publish_status.value = 'draft';
            form.elements.enabled.value = '1';
        }
        fillMapSearchInput('mission-form-map-id-search', form.elements.map_id.value);
    }

    function closeMissionForm() {
        toggleCrudView('missions', 'list');
        state.missionEditingId = null;
    }

    function missionPayload() {
        const form = document.getElementById('mission-form');
        const data = {};
        missionFields.forEach(([name, , type]) => {
            const el = form.elements[name];
            if (!el) return;
            if (type === 'number') data[name] = Number(el.value || 0);
            else if (type === 'checkbox') data[name] = el.value === '1';
            else data[name] = el.value;
        });
        if (!data.mission_key || !data.name) throw new Error('미션 키와 이름은 필수입니다.');
        return data;
    }

    async function saveMission(keepEditing = false) {
        const payload = missionPayload();
        if (payload.publish_status === 'published' && !confirmPublishWorkflow('미션')) return;
        if (state.missionEditingId) await api(`/instance-bonus/missions/${state.missionEditingId}`, { method: 'PUT', body: JSON.stringify(payload) });
        else await api('/instance-bonus/missions', { method: 'POST', body: JSON.stringify(payload) });
        loadMissions();
        loadMissionCandidates();
        if (!keepEditing) {
            closeMissionForm();
        }
    }

    function resetMissionFilter() {
        ['missions-filter-map-id','missions-filter-publish','missions-filter-enabled','missions-filter-type','missions-filter-objective','missions-filter-keyword'].forEach((id) => { const el = document.getElementById(id); if (el) el.value = ''; });
        state.missionsPage = 1;
        loadMissions();
    }

    async function loadMissions(page = state.missionsPage) {
        state.missionsPage = page;
        const params = new URLSearchParams({ page: String(page), limit: '20' });
        [['map_id','missions-filter-map-id'],['publish_status','missions-filter-publish'],['enabled','missions-filter-enabled'],['mission_type','missions-filter-type'],['objective_type','missions-filter-objective'],['search','missions-filter-keyword']].forEach(([key,id]) => {
            const value = document.getElementById(id)?.value.trim();
            if (value) params.set(key, value);
        });
        const data = await api(`/instance-bonus/missions?${params.toString()}`);
        state.missionsCache = data.items || [];
        const body = document.getElementById('missions-table');
        body.innerHTML = state.missionsCache.length ? state.missionsCache.map((row) => `
            <tr>
                <td>${row.mission_id}</td><td>${row.map_id}</td><td>${escapeHtml(row.mission_key)}</td><td>${escapeHtml(row.name)}</td>
                <td>${escapeHtml(row.mission_type)}</td><td>${escapeHtml(row.objective_type)}</td><td>${escapeHtml(row.target_label)}</td>
                <td>${row.target_count || 0}</td><td>${row.time_limit_sec || 0}</td><td>${badge(row.enabled)}</td>
                <td>${publishBadge(row.publish_status)}</td><td>${row.version || 1}</td><td>${escapeHtml(row.updated_at || '-')}</td>
                <td><div class="ib-actions"><button class="ib-btn ib-btn-ghost" onclick="instanceBonusApp.fetchMission(${row.mission_id})">편집</button></div></td>
            </tr>`).join('') : '<tr><td colspan="14" class="ib-empty">등록된 미션이 없습니다. 기존 게임 테이블에 넣어둔 미션은 대시보드의 "기존 게임 데이터 가져오기"를 먼저 눌러주세요.</td></tr>';
        renderPagination('missions-pagination', data.page || 1, data.total || 0, data.limit || 20, 'loadMissions');
        loadMissionCandidates();
    }

    async function fetchMission(id) {
        const data = await api(`/instance-bonus/missions/${id}`);
        openMissionForm(data);
    }

    function renderThemeForm() {
        const form = document.getElementById('theme-form');
        const sections = [
            formSection('기본 정보', '테마 이름, 키, 설명과 브리핑 스타일을 정의합니다.'),
            `<div class="ib-field"><label>던전/레이드 선택</label><input id="theme-form-map-id-search" type="text" placeholder="던전/레이드 검색"><select id="theme-form-map-id" name="map_id"></select><small class="ib-help">이 테마가 사용될 던전/레이드를 고릅니다.</small></div>`,
            fieldTemplate({ name: 'theme_key', label: '테마 키', help: '운영자가 구분하기 쉬운 짧은 이름을 쓰면 됩니다.' }),
            fieldTemplate({ name: 'name', label: '이름' }),
            fieldTemplate({ name: 'description', label: '설명', type: 'textarea', full: true }),
            fieldTemplate({ name: 'briefing_style', label: '브리핑 스타일', help: '설명 문체나 안내 톤을 구분하는 이름입니다.' }),

            formSection('파티 조건', '테마가 어떤 파티에 적합한지 제한합니다.'),
            fieldTemplate({ name: 'min_party_size', label: '최소 파티 수', type: 'number' }),
            fieldTemplate({ name: 'max_party_size', label: '최대 파티 수', type: 'number' }),
            fieldTemplate({ name: 'min_avg_item_level', label: '최소 평균 템렙', type: 'number' }),
            fieldTemplate({ name: 'max_avg_item_level', label: '최대 평균 템렙', type: 'number' }),
            fieldTemplate({ name: 'required_tank', label: '탱커 필요', type: 'checkbox' }),
            fieldTemplate({ name: 'required_healer', label: '힐러 필요', type: 'checkbox' }),

            formSection('가중치 및 게시', '테마 노출 가중치와 게시 상태를 관리합니다.'),
            fieldTemplate({ name: 'weight', label: '가중치', type: 'number' }),
            fieldTemplate({ name: 'enabled', label: '활성', type: 'checkbox' }),
            fieldTemplate({ name: 'publish_status', label: '게시 상태', type: 'select', options: publishStatuses }),
            `<div class="ib-field full"><div class="ib-actions"><button type="button" class="ib-btn ib-btn-primary" onclick="instanceBonusApp.saveTheme(false)">저장 후 목록</button><button type="button" class="ib-btn ib-btn-ghost" onclick="instanceBonusApp.saveTheme(true)">저장 후 계속 편집</button><button type="button" class="ib-btn ib-btn-secondary" onclick="instanceBonusApp.closeThemeForm()">닫기</button></div></div>`
        ];
        form.innerHTML = sections.join('');
        applyMapOptions();
    }

    function openThemeForm(data = null) {
        state.themeEditingId = data ? data.theme_id : null;
        toggleCrudView('themes', 'form');
        document.getElementById('theme-form-title').textContent = data ? `테마 수정 #${data.theme_id}` : '테마 등록';
        const form = document.getElementById('theme-form');
        themeFields.forEach(([name, , type]) => {
            const el = form.elements[name];
            if (!el) return;
            const value = data ? data[name] : '';
            if (type === 'checkbox') el.value = value ? '1' : '0';
            else el.value = value ?? '';
        });
        if (!data) {
            form.elements.publish_status.value = 'draft';
            form.elements.enabled.value = '1';
        }
        fillMapSearchInput('theme-form-map-id-search', form.elements.map_id.value);
    }

    function closeThemeForm() {
        toggleCrudView('themes', 'list');
        state.themeEditingId = null;
    }

    function themePayload() {
        const form = document.getElementById('theme-form');
        const data = {};
        themeFields.forEach(([name, , type]) => {
            const el = form.elements[name];
            if (!el) return;
            if (type === 'number') data[name] = Number(el.value || 0);
            else if (type === 'checkbox') data[name] = el.value === '1';
            else data[name] = el.value;
        });
        if (!data.theme_key || !data.name) throw new Error('테마 키와 이름은 필수입니다.');
        return data;
    }

    async function saveTheme(keepEditing = false) {
        const payload = themePayload();
        if (payload.publish_status === 'published' && !confirmPublishWorkflow('테마')) return;
        if (state.themeEditingId) await api(`/instance-bonus/themes/${state.themeEditingId}`, { method: 'PUT', body: JSON.stringify(payload) });
        else await api('/instance-bonus/themes', { method: 'POST', body: JSON.stringify(payload) });
        loadThemes();
        if (!keepEditing) {
            closeThemeForm();
        }
    }

    function resetThemeFilter() {
        ['themes-filter-map-id','themes-filter-publish','themes-filter-enabled','themes-filter-keyword'].forEach((id) => { const el = document.getElementById(id); if (el) el.value = ''; });
        state.themesPage = 1;
        loadThemes();
    }

    async function loadThemes(page = state.themesPage) {
        state.themesPage = page;
        const params = new URLSearchParams({ page: String(page), limit: '20' });
        [['map_id','themes-filter-map-id'],['publish_status','themes-filter-publish'],['enabled','themes-filter-enabled'],['search','themes-filter-keyword']].forEach(([key,id]) => {
            const value = document.getElementById(id)?.value.trim();
            if (value) params.set(key, value);
        });
        const data = await api(`/instance-bonus/themes?${params.toString()}`);
        state.themesCache = data.items || [];
        const body = document.getElementById('themes-table');
        body.innerHTML = state.themesCache.length ? state.themesCache.map((row) => `
            <tr>
                <td>${row.theme_id}</td><td>${row.map_id}</td><td>${escapeHtml(row.theme_key)}</td><td>${escapeHtml(row.name)}</td>
                <td>${escapeHtml(row.briefing_style)}</td><td>${row.weight || 0}</td><td>${badge(row.enabled)}</td>
                <td>${publishBadge(row.publish_status)}</td><td>${row.version || 1}</td><td>${escapeHtml(row.updated_at || '-')}</td>
                <td><div class="ib-actions"><button class="ib-btn ib-btn-ghost" onclick="instanceBonusApp.fetchTheme(${row.theme_id})">편집</button></div></td>
            </tr>`).join('') : '<tr><td colspan="11" class="ib-empty">등록된 테마가 없습니다. 기존 게임 테이블에 넣어둔 테마는 대시보드의 "기존 게임 데이터 가져오기"를 먼저 눌러주세요.</td></tr>';
        renderPagination('themes-pagination', data.page || 1, data.total || 0, data.limit || 20, 'loadThemes');
        renderThemeSelect();
    }

    async function fetchTheme(id) {
        const data = await api(`/instance-bonus/themes/${id}`);
        openThemeForm(data);
    }

    function renderThemeSelect() {
        const select = document.getElementById('theme-link-theme-select');
        if (!select) return;
        select.innerHTML = '<option value="">테마를 선택하세요</option>' + state.themesCache.map((row) => `<option value="${row.theme_id}">#${row.theme_id} ${escapeHtml(row.name)}</option>`).join('');
    }

    async function loadMissionCandidates() {
        const keyword = document.getElementById('theme-link-keyword')?.value.trim();
        const params = new URLSearchParams({ page: '1', limit: '50' });
        if (keyword) params.set('search', keyword);
        const data = await api(`/instance-bonus/missions?${params.toString()}`);
        state.missionsCache = data.items || [];
        renderThemeMissionCandidates();
    }

    function renderThemeMissionCandidates() {
        const body = document.getElementById('theme-link-candidate-table');
        if (!body) return;
        body.innerHTML = state.missionsCache.length ? state.missionsCache.map((row) => `
            <tr>
                <td>${escapeHtml(row.name)}<div class="ib-help">${escapeHtml(row.mission_key)}</div></td>
                <td>${escapeHtml(row.mission_type || '-')}</td>
                <td><button class="ib-btn ib-btn-primary" onclick="instanceBonusApp.addThemeMission(${row.mission_id})">추가</button></td>
            </tr>`).join('') : '<tr><td colspan="3" class="ib-empty">후보 미션이 없습니다.</td></tr>';
    }

    async function loadThemeLinks() {
        const themeId = document.getElementById('theme-link-theme-select')?.value;
        if (!themeId) {
            document.getElementById('theme-link-table').innerHTML = '<tr><td colspan="5" class="ib-empty">먼저 테마를 선택하세요.</td></tr>';
            return;
        }
        const items = await api(`/instance-bonus/themes/${themeId}/missions`);
        document.getElementById('theme-link-table').innerHTML = items.length ? items.map((row) => `
            <tr>
                <td>${escapeHtml(row.mission_name || `미션 #${row.mission_id}`)}<div class="ib-help">${escapeHtml(row.mission_key || '')}</div></td>
                <td><select onchange="instanceBonusApp.updateThemeMission(${themeId}, ${row.mission_id}, 'required', this.value)"><option value="1" ${row.required ? 'selected' : ''}>필수</option><option value="0" ${!row.required ? 'selected' : ''}>선택</option></select></td>
                <td><input type="number" value="${row.slot || 0}" onchange="instanceBonusApp.updateThemeMission(${themeId}, ${row.mission_id}, 'slot', this.value)"></td>
                <td><input type="number" value="${row.weight || 0}" onchange="instanceBonusApp.updateThemeMission(${themeId}, ${row.mission_id}, 'weight', this.value)"></td>
                <td><button class="ib-btn ib-btn-danger" onclick="instanceBonusApp.removeThemeMission(${themeId}, ${row.mission_id})">삭제</button></td>
            </tr>`).join('') : '<tr><td colspan="5" class="ib-empty">연결된 미션이 없습니다.</td></tr>';
        renderThemeMissionCandidates();
    }

    async function addThemeMission(missionId) {
        const themeId = document.getElementById('theme-link-theme-select')?.value;
        if (!themeId) throw new Error('테마를 먼저 선택하세요.');
        await api(`/instance-bonus/themes/${themeId}/missions`, { method: 'POST', body: JSON.stringify({ mission_id: missionId, required: false, slot: 0, weight: 100 }) });
        loadThemeLinks();
    }

    async function updateThemeMission(themeId, missionId, field, value) {
        const items = await api(`/instance-bonus/themes/${themeId}/missions`);
        const current = items.find((item) => Number(item.mission_id) === Number(missionId));
        if (!current) return;
        const payload = { mission_id: missionId, required: current.required, slot: current.slot, weight: current.weight };
        payload[field] = field === 'required' ? value === '1' : Number(value || 0);
        await api(`/instance-bonus/themes/${themeId}/missions`, { method: 'POST', body: JSON.stringify(payload) });
        loadThemeLinks();
    }

    async function removeThemeMission(themeId, missionId) {
        await api(`/instance-bonus/themes/${themeId}/missions/${missionId}`, { method: 'DELETE' });
        loadThemeLinks();
    }

    function renderRewardForm() {
        const form = document.getElementById('reward-form');
        form.innerHTML = `
            ${formSection('기본 정보', '등급별 보상 세트의 이름과 맵 연결 정보를 설정합니다.')}
            <div class="ib-field"><label>던전/레이드 선택</label><input id="reward-form-map-id-search" type="text" placeholder="던전/레이드 검색"><select id="reward-form-map-id" name="map_id"></select><small class="ib-help">이 보상 세트가 사용될 던전/레이드를 고릅니다.</small></div>
            <div class="ib-field"><label>보상 키</label><input type="text" name="profile_key"></div>
            <div class="ib-field"><label>이름</label><input type="text" name="name"></div>
            <div class="ib-field"><label>활성</label><select name="enabled"><option value="1">사용</option><option value="0">비활성</option></select></div>
            <div class="ib-field full"><label>설명</label><textarea name="description"></textarea></div>
            <div class="ib-field"><label>게시 상태</label><select name="publish_status"><option value="draft">초안</option><option value="review">검토</option><option value="published">게시</option><option value="archived">보관</option></select></div>
            ${formSection('보상 항목', 'S/A/B/C/D 등급별 아이템, 수량, 확률을 관리합니다.')}
            <div class="ib-field full"><label>보상 항목</label><div id="reward-items-box"></div><div class="ib-actions" style="margin-top:10px;"><button type="button" class="ib-btn ib-btn-ghost" onclick="instanceBonusApp.addRewardItemRow()"><i class="fas fa-plus"></i> 항목 추가</button></div></div>
            <div class="ib-field full"><div class="ib-actions"><button type="button" class="ib-btn ib-btn-primary" onclick="instanceBonusApp.saveReward(false)">저장 후 목록</button><button type="button" class="ib-btn ib-btn-ghost" onclick="instanceBonusApp.saveReward(true)">저장 후 계속 편집</button><button type="button" class="ib-btn ib-btn-secondary" onclick="instanceBonusApp.closeRewardForm()">닫기</button></div></div>`;
        applyMapOptions();
        addRewardItemRow();
    }

    function rewardItemRow(item = {}) {
        return `<div class="ib-detail-row reward-item-row"><div class="ib-detail-grid"><div class="ib-field"><label>등급</label><select class="reward-grade"><option value="S" ${item.grade === 'S' ? 'selected' : ''}>S</option><option value="A" ${item.grade === 'A' ? 'selected' : ''}>A</option><option value="B" ${item.grade === 'B' ? 'selected' : ''}>B</option><option value="C" ${item.grade === 'C' ? 'selected' : ''}>C</option><option value="D" ${item.grade === 'D' ? 'selected' : ''}>D</option></select></div><div class="ib-field"><label>아이템 번호</label><input class="reward-item-entry" type="number" value="${item.item_entry || 0}"></div><div class="ib-field"><label>수량</label><input class="reward-item-count" type="number" value="${item.item_count || 1}"></div><div class="ib-field"><label>확률</label><input class="reward-item-chance" type="number" value="${item.chance || 100}" step="0.01"></div><div class="ib-field"><label>정렬</label><input class="reward-item-sort" type="number" value="${item.sort_order || 0}"></div><div class="ib-field"><label>관리</label><button type="button" class="ib-btn ib-btn-danger" onclick="this.closest('.reward-item-row').remove()">삭제</button></div></div></div>`;
    }

    function addRewardItemRow(item = {}) {
        document.getElementById('reward-items-box').insertAdjacentHTML('beforeend', rewardItemRow(item));
    }

    function openRewardForm(data = null) {
        state.rewardEditingId = data ? data.reward_profile_id : null;
        toggleCrudView('rewards', 'form');
        document.getElementById('reward-form-title').textContent = data ? `보상 프로파일 수정 #${data.reward_profile_id}` : '보상 프로파일 등록';
        const form = document.getElementById('reward-form');
        form.elements.map_id.value = data?.map_id ?? '';
        form.elements.profile_key.value = data?.profile_key ?? '';
        form.elements.name.value = data?.name ?? '';
        form.elements.enabled.value = data?.enabled ? '1' : '0';
        form.elements.description.value = data?.description ?? '';
        form.elements.publish_status.value = data?.publish_status ?? 'draft';
        fillMapSearchInput('reward-form-map-id-search', form.elements.map_id.value);
        const box = document.getElementById('reward-items-box');
        box.innerHTML = '';
        (data?.items || []).forEach((item) => addRewardItemRow(item));
        if (!(data?.items || []).length) addRewardItemRow();
    }

    function closeRewardForm() {
        toggleCrudView('rewards', 'list');
        state.rewardEditingId = null;
    }

    function rewardPayload() {
        const form = document.getElementById('reward-form');
        const items = [...document.querySelectorAll('.reward-item-row')].map((row) => ({
            grade: row.querySelector('.reward-grade').value,
            item_entry: Number(row.querySelector('.reward-item-entry').value || 0),
            item_count: Number(row.querySelector('.reward-item-count').value || 0),
            chance: Number(row.querySelector('.reward-item-chance').value || 0),
            sort_order: Number(row.querySelector('.reward-item-sort').value || 0)
        }));
        return {
            map_id: Number(form.elements.map_id.value || 0),
            profile_key: form.elements.profile_key.value,
            name: form.elements.name.value,
            description: form.elements.description.value,
            enabled: form.elements.enabled.value === '1',
            publish_status: form.elements.publish_status.value,
            items
        };
    }

    async function saveReward(keepEditing = false) {
        const payload = rewardPayload();
        if (!payload.profile_key || !payload.name) throw new Error('보상 키와 이름은 필수입니다.');
        if (payload.publish_status === 'published' && !confirmPublishWorkflow('보상 프로파일')) return;
        if (state.rewardEditingId) await api(`/instance-bonus/reward-profiles/${state.rewardEditingId}`, { method: 'PUT', body: JSON.stringify(payload) });
        else await api('/instance-bonus/reward-profiles', { method: 'POST', body: JSON.stringify(payload) });
        loadRewards();
        if (!keepEditing) {
            closeRewardForm();
        }
    }

    function resetRewardFilter() {
        ['rewards-filter-map-id','rewards-filter-publish','rewards-filter-keyword'].forEach((id) => { const el = document.getElementById(id); if (el) el.value = ''; });
        state.rewardsPage = 1;
        loadRewards();
    }

    async function loadRewards(page = state.rewardsPage) {
        state.rewardsPage = page;
        const params = new URLSearchParams({ page: String(page), limit: '20' });
        [['map_id','rewards-filter-map-id'],['publish_status','rewards-filter-publish'],['search','rewards-filter-keyword']].forEach(([key,id]) => {
            const value = document.getElementById(id)?.value.trim();
            if (value) params.set(key, value);
        });
        const data = await api(`/instance-bonus/reward-profiles?${params.toString()}`);
        const body = document.getElementById('rewards-table');
        body.innerHTML = (data.items || []).length ? data.items.map((row) => `
            <tr>
                <td>${row.reward_profile_id}</td><td>${row.map_id}</td><td>${escapeHtml(row.profile_key)}</td><td>${escapeHtml(row.name)}</td>
                <td>${publishBadge(row.publish_status)}</td><td>${row.version || 1}</td><td>${escapeHtml(row.updated_at || '-')}</td>
                <td><div class="ib-actions"><button class="ib-btn ib-btn-ghost" onclick="instanceBonusApp.fetchReward(${row.reward_profile_id})">편집</button></div></td>
            </tr>`).join('') : '<tr><td colspan="8" class="ib-empty">등록된 보상 프로파일이 없습니다.</td></tr>';
        renderPagination('rewards-pagination', data.page || 1, data.total || 0, data.limit || 20, 'loadRewards');
    }

    async function fetchReward(id) {
        const data = await api(`/instance-bonus/reward-profiles/${id}`);
        openRewardForm(data);
    }

    function resetRunFilter() {
        ['runs-filter-map-id','runs-filter-theme-id','runs-filter-mission-id','runs-filter-status','runs-filter-grade','runs-filter-llm','runs-filter-from','runs-filter-to','runs-filter-keyword'].forEach((id) => { const el = document.getElementById(id); if (el) el.value = ''; });
        state.runsPage = 1;
        loadRuns();
    }

    async function loadRuns(page = state.runsPage) {
        state.runsPage = page;
        const params = new URLSearchParams({ page: String(page), limit: '20' });
        [['map_id','runs-filter-map-id'],['theme_id','runs-filter-theme-id'],['mission_id','runs-filter-mission-id'],['status','runs-filter-status'],['grade','runs-filter-grade'],['llm_used','runs-filter-llm'],['started_from','runs-filter-from'],['started_to','runs-filter-to'],['keyword','runs-filter-keyword']].forEach(([key,id]) => {
            const value = document.getElementById(id)?.value.trim();
            if (value) params.set(key, value);
        });
        const data = await api(`/instance-bonus/runs?${params.toString()}`);
        const body = document.getElementById('runs-table');
        body.innerHTML = (data.items || []).length ? data.items.map((row) => `
            <tr>
                <td>${row.run_id}</td><td>${row.map_id}</td><td>${escapeHtml(row.theme_name || '-')}</td><td>${escapeHtml(row.mission_name || '-')}</td>
                <td>${escapeHtml(row.status || '-')}</td><td>${escapeHtml(row.grade || '-')}</td><td>${escapeHtml(row.started_at || '-')}</td><td>${escapeHtml(row.ended_at || '-')}</td>
                <td>${row.clear_time_sec || 0}</td><td>${row.deaths || 0}</td><td>${row.wipes || 0}</td><td>${row.score || 0}</td><td>${row.vote_yes || 0} / ${row.vote_no || 0}</td>
                <td><button class="ib-btn ib-btn-ghost" onclick="instanceBonusApp.loadRunDetail(${row.run_id})">상세</button></td>
            </tr>`).join('') : '<tr><td colspan="14" class="ib-empty">런 로그가 없습니다.</td></tr>';
        renderPagination('runs-pagination', data.page || 1, data.total || 0, data.limit || 20, 'loadRuns');
    }

    async function loadRunDetail(runId) {
        state.currentRunId = runId;
        state.currentRunTab = 'overview';
        document.querySelectorAll('.ib-subtabs .ib-tab').forEach((el) => el.classList.toggle('active', el.dataset.runTab === 'overview'));
        document.getElementById('run-detail-card').style.display = 'block';
        document.getElementById('run-detail-title').textContent = `런 상세 #${runId}`;
        await loadRunDetailTab(runId, 'overview');
    }

    async function loadRunDetailTab(runId, tab) {
        const body = document.getElementById('run-detail-body');
        if (tab === 'overview') {
            const row = await api(`/instance-bonus/runs/${runId}`);
            body.innerHTML = `<div class="ib-detail-grid">${[
                ['기록 번호', row.run_id], ['맵 ID', row.map_id], ['테마', row.theme_name || '-'], ['미션', row.mission_name || '-'],
                ['상태', row.status || '-'], ['등급', row.grade || '-'], ['시작 시각', row.started_at || '-'], ['종료 시각', row.ended_at || '-'],
                ['클리어 시간(초)', row.clear_time_sec || 0], ['사망 수', row.deaths || 0], ['전멸 수', row.wipes || 0], ['점수', row.score || 0],
                ['찬성 수', row.vote_yes || 0], ['반대 수', row.vote_no || 0], ['LLM 사용', row.llm_used ? '예' : '아니오'], ['대체 선택 사용', row.fallback_used ? '예' : '아니오'], ['실패 사유', row.failure_reason || '-']
            ].map(([k,v]) => `<div class="ib-detail-row"><div class="ib-kv"><strong>${escapeHtml(k)}</strong><span>${escapeHtml(v)}</span></div></div>`).join('')}</div>`;
            return;
        }
        const map = { members: 'members', votes: 'votes', rewards: 'rewards', events: 'events', llm: 'llm' };
        const items = await api(`/instance-bonus/runs/${runId}/${map[tab]}`);
        const tableConfigs = {
            members: [
                { key: 'member_id', label: '참가 번호' },
                { key: 'character_guid', label: '참가자 번호' },
                { key: 'character_name', label: '캐릭터명' },
                { key: 'account_id', label: '계정 ID' },
                { key: 'class_id', label: '직업' },
                { key: 'race_id', label: '종족' },
                { key: 'role_name', label: '역할' },
                { key: 'item_level', label: '아이템 레벨' },
                { key: 'joined_at', label: '참여 시각' }
            ],
            votes: [
                { key: 'vote_id', label: '투표 번호' },
                { key: 'character_guid', label: '참가자 번호' },
                { key: 'character_name', label: '캐릭터명' },
                { key: 'vote_value', label: '투표 결과' },
                { key: 'voted_at', label: '투표 시각' }
            ],
            rewards: [
                { key: 'reward_log_id', label: '보상 기록 번호' },
                { key: 'character_guid', label: '참가자 번호' },
                { key: 'character_name', label: '캐릭터명' },
                { key: 'grade', label: '등급' },
                { key: 'item_entry', label: '아이템 번호' },
                { key: 'item_count', label: '수량' },
                { key: 'granted_at', label: '지급 시각' }
            ],
            events: [
                { key: 'event_id', label: '이벤트 번호' },
                { key: 'event_type', label: '이벤트 종류' },
                { key: 'event_message', label: '메시지' },
                { key: 'event_data', label: '세부 데이터' },
                { key: 'created_at', label: '생성 시각' }
            ],
            llm: [
                { key: 'llm_log_id', label: 'LLM 기록 번호' },
                { key: 'candidate_theme', label: '후보 테마' },
                { key: 'candidate_mission', label: '후보 미션' },
                { key: 'selected_theme', label: '선택 테마' },
                { key: 'selected_mission', label: '선택 미션' },
                { key: 'fallback_used', label: '대체 선택 사용' , render: (row) => row.fallback_used ? '예' : '아니오' },
                { key: 'created_at', label: '생성 시각' }
            ]
        };
        const emptyMessages = {
            members: '참가자 데이터가 없습니다.',
            votes: '투표 데이터가 없습니다.',
            rewards: '보상 데이터가 없습니다.',
            events: '이벤트 데이터가 없습니다.',
            llm: 'LLM 데이터가 없습니다.'
        };
        body.innerHTML = renderRowsTable(tableConfigs[tab], items, emptyMessages[tab] || '데이터가 없습니다.');
    }

    function refreshCurrent() {
        toggleCrudView('maps', 'list');
        toggleCrudView('missions', 'list');
        toggleCrudView('themes', 'list');
        toggleCrudView('rewards', 'list');
        switch (state.currentTab) {
            case 'dashboard': return loadDashboard();
            case 'maps': return loadMaps();
            case 'missions': return loadMissions();
            case 'themes': return loadThemes();
            case 'theme-links': return Promise.all([loadThemes(1), loadMissionCandidates()]).then(() => loadThemeLinks().catch(() => {}));
            case 'rewards': return loadRewards();
            case 'runs': return loadRuns();
            default: return loadDashboard();
        }
    }

    return {
        init,
        refreshCurrent,
        importRuntimeData,
        loadMaps,
        resetMapsFilter,
        openMapForm,
        closeMapForm,
        saveMap,
        editMapById,
        deleteMap,
        loadMissions,
        resetMissionFilter,
        openMissionForm,
        closeMissionForm,
        saveMission,
        fetchMission,
        loadThemes,
        resetThemeFilter,
        openThemeForm,
        closeThemeForm,
        saveTheme,
        fetchTheme,
        loadThemeLinks,
        addThemeMission,
        updateThemeMission,
        removeThemeMission,
        loadRewards,
        resetRewardFilter,
        openRewardForm,
        closeRewardForm,
        addRewardItemRow,
        saveReward,
        fetchReward,
        loadRuns,
        resetRunFilter,
        loadRunDetail,
        loadRunDetailTab
    };
})();

document.addEventListener('DOMContentLoaded', () => {
    instanceBonusApp.init();
});
