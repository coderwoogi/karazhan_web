const instanceBonusApp = (() => {
    const state = {
        currentTab: 'dashboard',
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
        ['map_id', 'map_id', 'number'], ['mission_key', 'mission_key'], ['name', '이름'], ['description', '설명', 'textarea', true],
        ['briefing_text', '브리핑', 'textarea', true], ['mission_type', 'mission_type'], ['objective_type', 'objective_type'],
        ['target_entry', 'target_entry', 'number'], ['target_label', 'target_label'], ['target_count', 'target_count', 'number'],
        ['time_limit_sec', 'time_limit_sec', 'number'], ['failure_condition_type', 'failure_condition_type'], ['required_boss_entry', 'required_boss_entry', 'number'],
        ['required_before_boss_entry', 'required_before_boss_entry', 'number'], ['allowed_death_count', 'allowed_death_count', 'number'],
        ['allowed_wipe_count', 'allowed_wipe_count', 'number'], ['reward_profile_id', 'reward_profile_id', 'number'], ['difficulty_weight', 'difficulty_weight', 'number'],
        ['min_party_size', '최소 파티 수', 'number'], ['max_party_size', '최대 파티 수', 'number'], ['min_avg_item_level', '최소 평균 템렙', 'number'],
        ['max_avg_item_level', '최대 평균 템렙', 'number'], ['required_tank', '탱커 필요', 'checkbox'], ['required_healer', '힐러 필요', 'checkbox'],
        ['enabled', '활성', 'checkbox'], ['publish_status', '게시 상태', 'select', false, ['draft','review','published','archived']]
    ];
    const themeFields = [
        ['map_id', 'map_id', 'number'], ['theme_key', 'theme_key'], ['name', '이름'], ['description', '설명', 'textarea', true],
        ['briefing_style', 'briefing_style'], ['min_party_size', '최소 파티 수', 'number'], ['max_party_size', '최대 파티 수', 'number'],
        ['min_avg_item_level', '최소 평균 템렙', 'number'], ['max_avg_item_level', '최대 평균 템렙', 'number'], ['required_tank', '탱커 필요', 'checkbox'],
        ['required_healer', '힐러 필요', 'checkbox'], ['weight', '가중치', 'number'], ['enabled', '활성', 'checkbox'],
        ['publish_status', '게시 상태', 'select', false, ['draft','review','published','archived']]
    ];
    const publishStatuses = ['draft', 'review', 'published', 'archived'];
    const mapFields = [
        { name: 'map_id', label: 'map_id', type: 'number', help: '던전/레이드 맵 ID입니다.' },
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

    function init() {
        bindTabs();
        bindRunTabs();
        renderMapForm();
        renderMissionForm();
        renderThemeForm();
        renderRewardForm();
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

    function badge(value) {
        return `<span class="ib-badge ${value ? 'ok' : 'off'}">${value ? '사용' : '비활성'}</span>`;
    }

    function publishBadge(value) {
        const klass = value === 'published' ? 'ok' : (value === 'review' ? 'warn' : 'off');
        return `<span class="ib-badge ${klass}">${escapeHtml(value || 'draft')}</span>`;
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
        if (type === 'select') return `<div class="ib-field ${full ? 'full' : ''}"><label>${label}</label><select name="${name}">${options.map((v) => `<option value="${v}">${v}</option>`).join('')}</select>${helpHtml}</div>`;
        return `<div class="ib-field ${full ? 'full' : ''}"><label>${label}</label><input type="${type}" name="${name}">${helpHtml}</div>`;
    }

    function confirmPublishWorkflow(name) {
        const acknowledged = prompt(`${name}을(를) published 상태로 저장합니다.\n운영 중인 콘텐츠라면 검토 후 진행해야 합니다.\n계속하려면 published 를 입력하세요.`, '');
        return acknowledged === 'published';
    }

    function renderRowsTable(columns, rows, emptyMessage = '데이터가 없습니다.') {
        if (!rows || !rows.length) {
            return `<div class="ib-empty">${emptyMessage}</div>`;
        }
        return `<div class="ib-table-wrap"><table class="ib-table"><thead><tr>${columns.map((col) => `<th>${col.label}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${columns.map((col) => `<td>${escapeHtml(col.render ? col.render(row) : row[col.key])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    }

    async function loadDashboard() {
        const data = await api('/instance-bonus/dashboard');
        document.getElementById('dashboard-stats').innerHTML = [
            ['최근 실행 런 수', data.recentRuns || 0],
            ['오늘 성공 런', data.todaySuccess || 0],
            ['오늘 실패 런', data.todayFailed || 0],
            ['최근 fallback 발생 수', data.recentFallbacks || 0]
        ].map(([label, value]) => `<div class="ib-stat"><small>${label}</small><strong>${value}</strong></div>`).join('');
        document.getElementById('dashboard-map-runs').innerHTML = (data.mapRunCounts || []).length
            ? data.mapRunCounts.map((row) => `<div class="ib-list-item"><div class="ib-kv"><strong>map_id</strong><span>${escapeHtml(row.map_id)}</span></div><div class="ib-kv"><strong>실행 수</strong><span>${escapeHtml(row.run_count)}</span></div></div>`).join('')
            : '<div class="ib-empty">최근 실행 데이터가 없습니다.</div>';
        document.getElementById('dashboard-failed-runs').innerHTML = (data.recentFailedRuns || []).length
            ? data.recentFailedRuns.map((row) => `<div class="ib-list-item"><div><strong>#${row.run_id}</strong> · ${escapeHtml(row.mission_name || '-')}</div><div class="ib-help">${escapeHtml(row.status || '-')} / ${escapeHtml(row.failure_reason || '실패 사유 없음')}</div></div>`).join('')
            : '<div class="ib-empty">최근 실패 런이 없습니다.</div>';
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
            ...mapFields.map((field) => fieldTemplate(field)),
            `<div class="ib-field full"><div class="ib-actions"><button type="button" class="ib-btn ib-btn-primary" onclick="instanceBonusApp.saveMap()">저장</button><button type="button" class="ib-btn ib-btn-secondary" onclick="instanceBonusApp.closeMapForm()">닫기</button></div></div>`
        ].join('');
    }

    function openMapForm(data = null) {
        state.mapEditingId = data ? data.map_id : null;
        document.getElementById('map-form-card').style.display = 'block';
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
    }

    function closeMapForm() {
        document.getElementById('map-form-card').style.display = 'none';
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
        if (!payload.map_id || payload.map_id <= 0) throw new Error('map_id는 필수입니다.');
        return payload;
    }

    async function saveMap() {
        const payload = mapPayload();
        if (state.mapEditingId) {
            await api(`/instance-bonus/maps/${state.mapEditingId}`, { method: 'PUT', body: JSON.stringify(payload) });
        } else {
            await api('/instance-bonus/maps', { method: 'POST', body: JSON.stringify(payload) });
        }
        closeMapForm();
        loadMaps();
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
                <td>${row.map_id}</td>
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
            fieldTemplate({ name: 'map_id', label: 'map_id', type: 'number', help: '어떤 던전/레이드 맵에 속하는 미션인지 지정합니다.' }),
            fieldTemplate({ name: 'mission_key', label: 'mission_key', help: '중복되지 않는 내부 식별자입니다.' }),
            fieldTemplate({ name: 'name', label: '이름', help: '운영자/유저 화면에 표시되는 미션 이름입니다.' }),
            fieldTemplate({ name: 'description', label: '설명', type: 'textarea', full: true }),
            fieldTemplate({ name: 'briefing_text', label: '브리핑', type: 'textarea', full: true, help: '인게임 진입 시 노출될 짧은 안내 텍스트입니다.' }),

            formSection('목표 조건', '미션 성공/실패 판정을 위한 핵심 목표값을 설정합니다.'),
            fieldTemplate({ name: 'mission_type', label: 'mission_type', help: '예: massacre, speedrun, boss_focus 등' }),
            fieldTemplate({ name: 'objective_type', label: 'objective_type', help: '예: kill_count, boss_clear, no_death 등' }),
            fieldTemplate({ name: 'target_entry', label: 'target_entry', type: 'number' }),
            fieldTemplate({ name: 'target_label', label: 'target_label' }),
            fieldTemplate({ name: 'target_count', label: 'target_count', type: 'number' }),
            fieldTemplate({ name: 'time_limit_sec', label: 'time_limit_sec', type: 'number' }),
            fieldTemplate({ name: 'failure_condition_type', label: 'failure_condition_type' }),
            fieldTemplate({ name: 'required_boss_entry', label: 'required_boss_entry', type: 'number' }),
            fieldTemplate({ name: 'required_before_boss_entry', label: 'required_before_boss_entry', type: 'number' }),
            fieldTemplate({ name: 'allowed_death_count', label: 'allowed_death_count', type: 'number' }),
            fieldTemplate({ name: 'allowed_wipe_count', label: 'allowed_wipe_count', type: 'number' }),

            formSection('보상/난이도', '보상 프로파일과 미션 가중치를 연결합니다.'),
            fieldTemplate({ name: 'reward_profile_id', label: 'reward_profile_id', type: 'number' }),
            fieldTemplate({ name: 'difficulty_weight', label: 'difficulty_weight', type: 'number' }),

            formSection('파티 조건 및 게시', '파티 규모와 게시 워크플로우를 함께 관리합니다.'),
            fieldTemplate({ name: 'min_party_size', label: '최소 파티 수', type: 'number' }),
            fieldTemplate({ name: 'max_party_size', label: '최대 파티 수', type: 'number' }),
            fieldTemplate({ name: 'min_avg_item_level', label: '최소 평균 템렙', type: 'number' }),
            fieldTemplate({ name: 'max_avg_item_level', label: '최대 평균 템렙', type: 'number' }),
            fieldTemplate({ name: 'required_tank', label: '탱커 필요', type: 'checkbox' }),
            fieldTemplate({ name: 'required_healer', label: '힐러 필요', type: 'checkbox' }),
            fieldTemplate({ name: 'enabled', label: '활성', type: 'checkbox' }),
            fieldTemplate({ name: 'publish_status', label: '게시 상태', type: 'select', options: publishStatuses, help: 'draft / review / published / archived 단계로 관리합니다.' }),
            `<div class="ib-field full"><div class="ib-actions"><button type="button" class="ib-btn ib-btn-primary" onclick="instanceBonusApp.saveMission()">저장</button><button type="button" class="ib-btn ib-btn-secondary" onclick="instanceBonusApp.closeMissionForm()">닫기</button></div></div>`
        ];
        form.innerHTML = sections.join('');
    }

    function openMissionForm(data = null) {
        state.missionEditingId = data ? data.mission_id : null;
        document.getElementById('mission-form-card').style.display = 'block';
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
    }

    function closeMissionForm() {
        document.getElementById('mission-form-card').style.display = 'none';
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
        if (!data.mission_key || !data.name) throw new Error('mission_key와 이름은 필수입니다.');
        return data;
    }

    async function saveMission() {
        const payload = missionPayload();
        if (payload.publish_status === 'published' && !confirmPublishWorkflow('미션')) return;
        if (state.missionEditingId) await api(`/instance-bonus/missions/${state.missionEditingId}`, { method: 'PUT', body: JSON.stringify(payload) });
        else await api('/instance-bonus/missions', { method: 'POST', body: JSON.stringify(payload) });
        closeMissionForm();
        loadMissions();
        loadMissionCandidates();
    }

    function resetMissionFilter() {
        ['missions-filter-map-id','missions-filter-publish','missions-filter-enabled','missions-filter-type','missions-filter-objective','missions-filter-keyword'].forEach((id) => { const el = document.getElementById(id); if (el) el.value = ''; });
        state.missionsPage = 1;
        loadMissions();
    }

    async function loadMissions(page = state.missionsPage) {
        state.missionsPage = page;
        const params = new URLSearchParams({ page: String(page), limit: '20' });
        [['map_id','missions-filter-map-id'],['publish_status','missions-filter-publish'],['enabled','missions-filter-enabled'],['mission_type','missions-filter-type'],['objective_type','missions-filter-objective'],['keyword','missions-filter-keyword']].forEach(([key,id]) => {
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
            </tr>`).join('') : '<tr><td colspan="14" class="ib-empty">등록된 미션이 없습니다.</td></tr>';
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
            fieldTemplate({ name: 'map_id', label: 'map_id', type: 'number' }),
            fieldTemplate({ name: 'theme_key', label: 'theme_key', help: '예: massacre, flawless, speedrun' }),
            fieldTemplate({ name: 'name', label: '이름' }),
            fieldTemplate({ name: 'description', label: '설명', type: 'textarea', full: true }),
            fieldTemplate({ name: 'briefing_style', label: 'briefing_style', help: '출력 톤이나 브리핑 스타일 키' }),

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
            `<div class="ib-field full"><div class="ib-actions"><button type="button" class="ib-btn ib-btn-primary" onclick="instanceBonusApp.saveTheme()">저장</button><button type="button" class="ib-btn ib-btn-secondary" onclick="instanceBonusApp.closeThemeForm()">닫기</button></div></div>`
        ];
        form.innerHTML = sections.join('');
    }

    function openThemeForm(data = null) {
        state.themeEditingId = data ? data.theme_id : null;
        document.getElementById('theme-form-card').style.display = 'block';
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
    }

    function closeThemeForm() {
        document.getElementById('theme-form-card').style.display = 'none';
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
        if (!data.theme_key || !data.name) throw new Error('theme_key와 이름은 필수입니다.');
        return data;
    }

    async function saveTheme() {
        const payload = themePayload();
        if (payload.publish_status === 'published' && !confirmPublishWorkflow('테마')) return;
        if (state.themeEditingId) await api(`/instance-bonus/themes/${state.themeEditingId}`, { method: 'PUT', body: JSON.stringify(payload) });
        else await api('/instance-bonus/themes', { method: 'POST', body: JSON.stringify(payload) });
        closeThemeForm();
        loadThemes();
    }

    function resetThemeFilter() {
        ['themes-filter-map-id','themes-filter-publish','themes-filter-enabled','themes-filter-keyword'].forEach((id) => { const el = document.getElementById(id); if (el) el.value = ''; });
        state.themesPage = 1;
        loadThemes();
    }

    async function loadThemes(page = state.themesPage) {
        state.themesPage = page;
        const params = new URLSearchParams({ page: String(page), limit: '20' });
        [['map_id','themes-filter-map-id'],['publish_status','themes-filter-publish'],['enabled','themes-filter-enabled'],['keyword','themes-filter-keyword']].forEach(([key,id]) => {
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
            </tr>`).join('') : '<tr><td colspan="11" class="ib-empty">등록된 테마가 없습니다.</td></tr>';
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
        if (keyword) params.set('keyword', keyword);
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
                <td>#${row.mission_id}</td>
                <td><select onchange="instanceBonusApp.updateThemeMission(${themeId}, ${row.mission_id}, 'required', this.value)"><option value="1" ${row.required ? 'selected' : ''}>필수</option><option value="0" ${!row.required ? 'selected' : ''}>선택</option></select></td>
                <td><input type="number" value="${row.slot_order || 0}" onchange="instanceBonusApp.updateThemeMission(${themeId}, ${row.mission_id}, 'slot_order', this.value)"></td>
                <td><input type="number" value="${row.weight || 0}" onchange="instanceBonusApp.updateThemeMission(${themeId}, ${row.mission_id}, 'weight', this.value)"></td>
                <td><button class="ib-btn ib-btn-danger" onclick="instanceBonusApp.removeThemeMission(${themeId}, ${row.mission_id})">삭제</button></td>
            </tr>`).join('') : '<tr><td colspan="5" class="ib-empty">연결된 미션이 없습니다.</td></tr>';
        renderThemeMissionCandidates();
    }

    async function addThemeMission(missionId) {
        const themeId = document.getElementById('theme-link-theme-select')?.value;
        if (!themeId) throw new Error('테마를 먼저 선택하세요.');
        await api(`/instance-bonus/themes/${themeId}/missions`, { method: 'POST', body: JSON.stringify({ mission_id: missionId, required: false, slot_order: 0, weight: 100 }) });
        loadThemeLinks();
    }

    async function updateThemeMission(themeId, missionId, field, value) {
        const items = await api(`/instance-bonus/themes/${themeId}/missions`);
        const current = items.find((item) => Number(item.mission_id) === Number(missionId));
        if (!current) return;
        const payload = { mission_id: missionId, required: current.required, slot_order: current.slot_order, weight: current.weight };
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
            <div class="ib-field"><label>map_id</label><input type="number" name="map_id"></div>
            <div class="ib-field"><label>profile_key</label><input type="text" name="profile_key"></div>
            <div class="ib-field"><label>이름</label><input type="text" name="name"></div>
            <div class="ib-field"><label>활성</label><select name="enabled"><option value="1">사용</option><option value="0">비활성</option></select></div>
            <div class="ib-field full"><label>설명</label><textarea name="description"></textarea></div>
            <div class="ib-field"><label>게시 상태</label><select name="publish_status"><option value="draft">draft</option><option value="review">review</option><option value="published">published</option><option value="archived">archived</option></select></div>
            ${formSection('보상 항목', 'S/A/B/C/D 등급별 아이템, 수량, 확률을 관리합니다.')}
            <div class="ib-field full"><label>보상 항목</label><div id="reward-items-box"></div><div class="ib-actions" style="margin-top:10px;"><button type="button" class="ib-btn ib-btn-ghost" onclick="instanceBonusApp.addRewardItemRow()"><i class="fas fa-plus"></i> 항목 추가</button></div></div>
            <div class="ib-field full"><div class="ib-actions"><button type="button" class="ib-btn ib-btn-primary" onclick="instanceBonusApp.saveReward()">저장</button><button type="button" class="ib-btn ib-btn-secondary" onclick="instanceBonusApp.closeRewardForm()">닫기</button></div></div>`;
        addRewardItemRow();
    }

    function rewardItemRow(item = {}) {
        return `<div class="ib-detail-row reward-item-row"><div class="ib-detail-grid"><div class="ib-field"><label>등급</label><select class="reward-grade"><option value="S" ${item.grade === 'S' ? 'selected' : ''}>S</option><option value="A" ${item.grade === 'A' ? 'selected' : ''}>A</option><option value="B" ${item.grade === 'B' ? 'selected' : ''}>B</option><option value="C" ${item.grade === 'C' ? 'selected' : ''}>C</option><option value="D" ${item.grade === 'D' ? 'selected' : ''}>D</option></select></div><div class="ib-field"><label>item_entry</label><input class="reward-item-entry" type="number" value="${item.item_entry || 0}"></div><div class="ib-field"><label>수량</label><input class="reward-item-count" type="number" value="${item.item_count || 1}"></div><div class="ib-field"><label>chance</label><input class="reward-item-chance" type="number" value="${item.chance || 100}" step="0.01"></div><div class="ib-field"><label>정렬</label><input class="reward-item-sort" type="number" value="${item.sort_order || 0}"></div><div class="ib-field"><label>관리</label><button type="button" class="ib-btn ib-btn-danger" onclick="this.closest('.reward-item-row').remove()">삭제</button></div></div></div>`;
    }

    function addRewardItemRow(item = {}) {
        document.getElementById('reward-items-box').insertAdjacentHTML('beforeend', rewardItemRow(item));
    }

    function openRewardForm(data = null) {
        state.rewardEditingId = data ? data.reward_profile_id : null;
        document.getElementById('reward-form-card').style.display = 'block';
        document.getElementById('reward-form-title').textContent = data ? `보상 프로파일 수정 #${data.reward_profile_id}` : '보상 프로파일 등록';
        const form = document.getElementById('reward-form');
        form.elements.map_id.value = data?.map_id ?? '';
        form.elements.profile_key.value = data?.profile_key ?? '';
        form.elements.name.value = data?.name ?? '';
        form.elements.enabled.value = data?.enabled ? '1' : '0';
        form.elements.description.value = data?.description ?? '';
        form.elements.publish_status.value = data?.publish_status ?? 'draft';
        const box = document.getElementById('reward-items-box');
        box.innerHTML = '';
        (data?.items || []).forEach((item) => addRewardItemRow(item));
        if (!(data?.items || []).length) addRewardItemRow();
    }

    function closeRewardForm() {
        document.getElementById('reward-form-card').style.display = 'none';
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

    async function saveReward() {
        const payload = rewardPayload();
        if (!payload.profile_key || !payload.name) throw new Error('profile_key와 이름은 필수입니다.');
        if (payload.publish_status === 'published' && !confirmPublishWorkflow('보상 프로파일')) return;
        if (state.rewardEditingId) await api(`/instance-bonus/reward-profiles/${state.rewardEditingId}`, { method: 'PUT', body: JSON.stringify(payload) });
        else await api('/instance-bonus/reward-profiles', { method: 'POST', body: JSON.stringify(payload) });
        closeRewardForm();
        loadRewards();
    }

    function resetRewardFilter() {
        ['rewards-filter-map-id','rewards-filter-publish','rewards-filter-keyword'].forEach((id) => { const el = document.getElementById(id); if (el) el.value = ''; });
        state.rewardsPage = 1;
        loadRewards();
    }

    async function loadRewards(page = state.rewardsPage) {
        state.rewardsPage = page;
        const params = new URLSearchParams({ page: String(page), limit: '20' });
        [['map_id','rewards-filter-map-id'],['publish_status','rewards-filter-publish'],['keyword','rewards-filter-keyword']].forEach(([key,id]) => {
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
                ['run_id', row.run_id], ['map_id', row.map_id], ['theme', row.theme_name || '-'], ['mission', row.mission_name || '-'],
                ['status', row.status || '-'], ['grade', row.grade || '-'], ['started_at', row.started_at || '-'], ['ended_at', row.ended_at || '-'],
                ['clear_time_sec', row.clear_time_sec || 0], ['deaths', row.deaths || 0], ['wipes', row.wipes || 0], ['score', row.score || 0],
                ['vote_yes', row.vote_yes || 0], ['vote_no', row.vote_no || 0], ['LLM 사용', row.llm_used ? '예' : '아니오'], ['fallback', row.fallback_used ? '예' : '아니오'], ['실패 사유', row.failure_reason || '-']
            ].map(([k,v]) => `<div class="ib-detail-row"><div class="ib-kv"><strong>${escapeHtml(k)}</strong><span>${escapeHtml(v)}</span></div></div>`).join('')}</div>`;
            return;
        }
        const map = { members: 'members', votes: 'votes', rewards: 'rewards', events: 'events', llm: 'llm' };
        const items = await api(`/instance-bonus/runs/${runId}/${map[tab]}`);
        const tableConfigs = {
            members: [
                { key: 'member_id', label: 'member_id' },
                { key: 'character_guid', label: 'GUID' },
                { key: 'character_name', label: '캐릭터명' },
                { key: 'account_id', label: '계정 ID' },
                { key: 'class_id', label: '직업' },
                { key: 'race_id', label: '종족' },
                { key: 'role_name', label: '역할' },
                { key: 'item_level', label: '아이템 레벨' },
                { key: 'joined_at', label: '참여 시각' }
            ],
            votes: [
                { key: 'vote_id', label: 'vote_id' },
                { key: 'character_guid', label: 'GUID' },
                { key: 'character_name', label: '캐릭터명' },
                { key: 'vote_value', label: '투표값' },
                { key: 'voted_at', label: '투표 시각' }
            ],
            rewards: [
                { key: 'reward_log_id', label: 'reward_log_id' },
                { key: 'character_guid', label: 'GUID' },
                { key: 'character_name', label: '캐릭터명' },
                { key: 'grade', label: '등급' },
                { key: 'item_entry', label: 'item_entry' },
                { key: 'item_count', label: '수량' },
                { key: 'granted_at', label: '지급 시각' }
            ],
            events: [
                { key: 'event_id', label: 'event_id' },
                { key: 'event_type', label: '이벤트 타입' },
                { key: 'event_message', label: '메시지' },
                { key: 'event_data', label: '세부 데이터' },
                { key: 'created_at', label: '생성 시각' }
            ],
            llm: [
                { key: 'llm_log_id', label: 'llm_log_id' },
                { key: 'candidate_theme', label: '후보 테마' },
                { key: 'candidate_mission', label: '후보 미션' },
                { key: 'selected_theme', label: '선택 테마' },
                { key: 'selected_mission', label: '선택 미션' },
                { key: 'fallback_used', label: 'fallback' , render: (row) => row.fallback_used ? '예' : '아니오' },
                { key: 'created_at', label: '생성 시각' }
            ]
        };
        body.innerHTML = renderRowsTable(tableConfigs[tab], items, `${tab} 데이터가 없습니다.`);
    }

    function refreshCurrent() {
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
