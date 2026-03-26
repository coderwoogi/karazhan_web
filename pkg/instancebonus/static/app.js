function escapeItemPickerHtml(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const ItemPicker = {
    callback: null,
    searchTimeout: null,

    init() {
        const input = document.getElementById('item-picker-search');
        if (!input) return;
        input.addEventListener('input', (e) => {
            const query = e.target.value;
            if (this.searchTimeout) clearTimeout(this.searchTimeout);
            this.searchTimeout = setTimeout(() => this.search(query), 300);
        });
    },

    open(callback) {
        this.callback = callback;
        const modal = document.getElementById('item-picker-modal');
        if (!modal) return;
        modal.style.display = 'flex';
        const input = document.getElementById('item-picker-search');
        const results = document.getElementById('item-picker-results');
        if (input) input.value = '';
        if (results) results.innerHTML = '<div class="ib-empty">아이템 이름 또는 아이템 번호로 검색하세요.</div>';
        if (input) setTimeout(() => input.focus(), 30);
    },

    close() {
        const modal = document.getElementById('item-picker-modal');
        if (modal) modal.style.display = 'none';
        this.callback = null;
    },

    async search(query) {
        const resultsContainer = document.getElementById('item-picker-results');
        if (!resultsContainer) return;

        if (!query || query.length < 2) {
            resultsContainer.innerHTML = '<div class="ib-empty">\uB450 \uAE00\uC790 \uC774\uC0C1 \uC785\uB825\uD558\uC138\uC694.</div>';
            return;
        }

        resultsContainer.innerHTML = '<div class="ib-empty">\uAC80\uC0C9 \uC911...</div>';

        const endpoints = [
            `/api/content/item/search?q=${encodeURIComponent(query)}`,
            `/instance-bonus/item-search?q=${encodeURIComponent(query)}`
        ];

        const fetchWithTimeout = async (url, timeoutMs = 4000) => {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);
            try {
                const res = await fetch(url, { credentials: 'include', signal: controller.signal });
                if (!res.ok) return null;
                const data = await res.json();
                if (Array.isArray(data)) return data;
                if (Array.isArray(data?.items)) return data.items;
                if (Array.isArray(data?.data)) return data.data;
                return null;
            } finally {
                clearTimeout(timer);
            }
        };

        let items = null;
        for (const url of endpoints) {
            try {
                items = await fetchWithTimeout(url);
                if (Array.isArray(items)) break;
            } catch (error) {
                // Try the next available search route.
            }
        }

        if (!Array.isArray(items)) {
            resultsContainer.innerHTML = '<div class="ib-empty">\uC544\uC774\uD15C \uAC80\uC0C9\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.</div>';
            return;
        }

        if (items.length === 0) {
            resultsContainer.innerHTML = '<div class="ib-empty">\uAC80\uC0C9 \uACB0\uACFC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.</div>';
            return;
        }

        resultsContainer.innerHTML = items.slice(0, 20).map(item => {
            const entry = Number(item.entry || 0);
            const name = String(item.name || '');
            const quality = Number(item.quality || 0);
            return `
                <div class="item-search-row" onclick="ItemPicker.selectItem(${entry}, decodeURIComponent('${encodeURIComponent(name)}'), ${quality})">
                    <div id="ip-icon-${entry}" class="item-icon-small"></div>
                    <div class="item-search-info">
                        <div class="item-search-name ib-item-quality-${quality}">${escapeItemPickerHtml(name)}</div>
                        <div class="item-search-entry">\uC544\uC774\uD15C \uBC88\uD638: ${entry}</div>
                    </div>
                </div>
            `;
        }).join('');

        items.slice(0, 20).forEach(item => this.loadIcon(item.entry));
    },

    async loadIcon(entry) {
        const parsed = Number(entry || 0);
        const container = document.getElementById(`ip-icon-${parsed}`);
        if (!container || parsed <= 0) return;

        try {
            const res = await fetch(`/api/external/item_icon?entry=${parsed}`, { credentials: 'include' });
            if (!res.ok) return;
            const data = await res.json();
            if (data && data.url) {
                container.innerHTML = `<img src="${escapeItemPickerHtml(String(data.url))}" alt="" style="width:100%; height:100%; object-fit:cover; border-radius:4px;">`;
            }
        } catch (error) {
            container.innerHTML = '';
        }
    },

    selectItem(entry, name, quality) {
        if (this.callback) {
            this.callback({ entry, name, quality });
        }
        this.close();
    }
};
const instanceBonusApp = (() => {
    const state = {
        currentTab: 'dashboard',
        views: {
            maps: 'list',
            missions: 'list',
            rewards: 'list'
        },
        mapOptions: [],
        configuredMaps: [],
        mapsPage: 1,
        mapsCache: [],
        mapEditingId: null,
        dailyUsagePage: 1,
        missionsPage: 1,
        themesPage: 1,
        rewardsPage: 1,
        runsPage: 1,
        missionEditingId: null,
        themeEditingId: null,
        rewardEditingId: null,
        rewardSearchTarget: null,
        currentRunMeta: null,
        currentRunTab: 'overview',
        currentRunId: null,
        themesCache: [],
        missionsCache: [],
        themeLinksCache: [],
        mapDifficulty: {
            mapId: null,
            mapType: '',
            selected: 0,
            content: null,
            focusAfterOpen: false
        }
    };
    let applyingHistoryState = false;

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
        { name: 'map_id', label: '맵 ID', type: 'number', help: '던전이나 레이드의 맵 번호입니다.' },
        { name: 'map_name', label: '맵 이름', help: '운영 화면에서 확인할 이름입니다.' },
        { name: 'daily_limit_per_player', label: '추가미션 일일 제한(1인당)', type: 'number', help: '해당 던전에서 플레이어 1명이 하루에 추가미션 보상을 받을 수 있는 최대 횟수입니다. 0이면 제한 없음' },
        { name: 'default_time_limit_sec', label: '기본 시간(초)', type: 'number', help: '이 던전이나 레이드에서 공통으로 사용할 기본 제한 시간입니다. 미션에 개별 제한 시간을 넣지 않으면 이 값이 사용됩니다.' },
        { name: 'max_concurrent_missions', label: '한 번에 제시할 최대 미션 수', type: 'number', help: '한 번의 진행에서 동시에 제시되거나 활성화될 수 있는 추가미션의 최대 개수입니다.' },
        { name: 'min_party_size', label: '최소 파티 수', type: 'number', help: '이 값보다 적은 인원으로는 추가미션을 제시하지 않도록 제한합니다.' },
        { name: 'max_party_size', label: '최대 파티 수', type: 'number', help: '이 값보다 많은 인원 구성에는 이 맵 설정을 적용하지 않습니다.' },
        { name: 'enabled', label: '활성', type: 'checkbox', help: '미사용으로 두면 이 던전이나 레이드에서는 추가미션 기능을 끕니다.' },
        { name: 'allow_vote', label: '투표 허용', type: 'checkbox', help: '사용으로 두면 미션 수락 여부를 파티 투표로 결정할 수 있습니다.' },
        { name: 'allow_llm', label: 'LLM 사용', type: 'checkbox', help: '사용으로 두면 미션 추천 과정에서 LLM 보조 선택을 사용할 수 있습니다.' },
        { name: 'notes', label: '운영 메모', type: 'textarea', full: true, help: '운영자가 참고할 특이사항을 적습니다.' }
    ];
    const difficultyOptions = [
        { value: 1, label: '5인 노말', group: 'dungeon' },
        { value: 2, label: '5인 하드', group: 'dungeon' },
        { value: 4, label: '10인 노말', group: 'raid' },
        { value: 8, label: '10인 하드', group: 'raid' },
        { value: 16, label: '25인 노말', group: 'raid' },
        { value: 32, label: '25인 하드', group: 'raid' }
    ];

    function difficultyLabel(value, mapType = '', useDefault = false) {
        const normalized = normalizeMapDifficultyValue(value, mapType, useDefault);
        const found = difficultyOptions.find((item) => Number(item.value) === Number(normalized));
        return found ? found.label : '미설정';
    }

    function normalizeMapDifficultyValue(value, mapType = '', useDefault = false) {
        const parsed = Number(value || 0);
        if ([1, 2, 4, 8, 16, 32].includes(parsed)) return parsed;
        if (useDefault) {
            if (mapType === '레이드') return 4;
            if (mapType === '던전') return 1;
        }
        return 0;
    }


    async function init() {
        bindTabs();
        bindRunTabs();
        bindHistory();
        document.addEventListener('click', (event) => {
            if (event.target.closest('.ib-map-picker')) return;
            closeAllMapPickers();
        });
        renderMapForm();
        renderMissionForm();
        renderRewardForm();
        await loadMapOptions();
        await loadConfiguredMapOptions();
        await loadMaps(1, true);
        replaceHistoryState();
        refreshCurrent();
    }

    function currentHistoryState() {
        return {
            instanceBonus: true,
            tab: state.currentTab,
            views: { ...state.views }
        };
    }

    function replaceHistoryState() {
        history.replaceState(currentHistoryState(), '', location.href);
    }

    function pushHistoryState() {
        if (applyingHistoryState) return;
        history.pushState(currentHistoryState(), '', location.href);
    }

    function bindHistory() {
        window.addEventListener('popstate', (event) => {
            const nextState = event.state;
            if (!nextState || !nextState.instanceBonus) return;
            applyingHistoryState = true;
            state.currentTab = nextState.tab || 'dashboard';
            state.views = { ...state.views, ...(nextState.views || {}) };
            applyTabState();
            applyCrudStates();
            refreshCurrent();
            applyingHistoryState = false;
        });
    }

    function applyTabState() {
        if (state.currentTab === 'themes' || state.currentTab === 'theme-links') {
            state.currentTab = 'missions';
        }
        document.querySelectorAll('.ib-tabs .ib-tab[data-tab]').forEach((el) => el.classList.remove('active'));
        document.querySelectorAll('.ib-panel').forEach((el) => el.classList.remove('active'));
        document.querySelector(`.ib-tabs .ib-tab[data-tab="${state.currentTab}"]`)?.classList.add('active');
        document.querySelector(`.ib-panel[data-panel="${state.currentTab}"]`)?.classList.add('active');
    }

    function applyCrudStates() {
        toggleCrudView('maps', state.views.maps, { push: false });
        toggleCrudView('missions', state.views.missions, { push: false });
        toggleCrudView('rewards', state.views.rewards, { push: false });
    }

    function bindTabs() {
        document.querySelectorAll('.ib-tabs .ib-tab[data-tab]').forEach((btn) => {
            btn.addEventListener('click', () => {
                state.currentTab = btn.dataset.tab;
                applyTabState();
                pushHistoryState();
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

    async function loadConfiguredMapOptions() {
        const data = await api('/instance-bonus/maps?page=1&limit=200');
        state.configuredMaps = data.items || [];
        applyMapOptions();
    }

    function configuredMapOptions() {
        if (!state.configuredMaps.length) return state.mapOptions;
        const configuredIds = new Set(state.configuredMaps.map((row) => Number(row.map_id)));
        const filtered = state.mapOptions.filter((row) => configuredIds.has(Number(row.map_id)));
        return filtered.length ? filtered : state.mapOptions;
    }

    function configuredMapById(mapId) {
        return state.configuredMaps.find((row) => Number(row.map_id) === Number(mapId)) || null;
    }

    function filteredMapOptions(searchText, selectId = '') {
        const baseOptions = selectId === 'map-form-map-id' ? state.mapOptions : configuredMapOptions();
        const keyword = String(searchText || '').trim().toLowerCase();
        if (!keyword) return baseOptions;
        return baseOptions.filter((row) => {
            const maxPlayersText = row.max_players ? `최대 ${row.max_players}명` : '';
            const configured = configuredMapById(row.map_id);
            const difficultyText = configured ? difficultyLabel(configured.difficulty_mask, row.map_type, true) : '';
            const raw = `${row.map_name} ${row.map_type} ${row.map_id} ${maxPlayersText} ${difficultyText}`.toLowerCase();
            return raw.includes(keyword);
        });
    }

    function renderMapOptionsFromList(list, includeEmpty = true, emptyLabel = '전체', pickerOptions = {}) {
        const optionHtml = list.map((row) => {
            const suffix = row.max_players ? ` · 최대 ${row.max_players}명` : '';
            const configured = configuredMapById(row.map_id);
            const normalizedDifficulty = configured ? normalizeMapDifficultyValue(configured.difficulty_mask, row.map_type, true) : 0;
            const difficultyText = pickerOptions.includeDifficulty && normalizedDifficulty ? ` · ${difficultyLabel(normalizedDifficulty, row.map_type, true)}` : '';
            return `<option value="${row.map_id}">${escapeHtml(row.map_name)} (${escapeHtml(row.map_type)})${suffix}${escapeHtml(difficultyText)}</option>`;
        }).join('');
        if (!includeEmpty) return optionHtml;
        return `<option value="">${emptyLabel}</option>${optionHtml}`;
    }

    function mapOptionLabel(value, emptyLabel, options = {}) {
        if (!value) return emptyLabel;
        const selected = state.mapOptions.find((row) => String(row.map_id) === String(value));
        if (!selected) return emptyLabel;
        const suffix = selected.max_players ? ` · 최대 ${selected.max_players}명` : '';
        const configured = configuredMapById(selected.map_id);
        const normalizedDifficulty = configured ? normalizeMapDifficultyValue(configured.difficulty_mask, selected.map_type, true) : 0;
        const difficultyText = options.includeDifficulty && normalizedDifficulty ? ` · ${difficultyLabel(normalizedDifficulty, selected.map_type, true)}` : '';
        return `${selected.map_name} (${selected.map_type})${suffix}${difficultyText}`;
    }

    function mapNameById(mapId) {
        const row = state.mapOptions.find((item) => String(item.map_id) === String(mapId));
        if (!row) return `맵 ${mapId}`;
        const configured = configuredMapById(mapId);
        const normalizedDifficulty = configured ? normalizeMapDifficultyValue(configured.difficulty_mask, row.map_type, true) : 0;
        const difficultyText = normalizedDifficulty ? ` · ${difficultyLabel(normalizedDifficulty, row.map_type, true)}` : '';
        return `${row.map_name} (${row.map_type})${difficultyText}`;
    }

    function closeAllMapPickers(exceptTarget = '') {
        document.querySelectorAll('.ib-map-picker').forEach((picker) => {
            const target = picker.dataset.target || '';
            if (exceptTarget && target === exceptTarget) return;
            picker.classList.remove('open');
        });
    }

    function renderMapPicker(selectId, includeEmpty, emptyLabel, keyword = '') {
        const select = document.getElementById(selectId);
        const picker = document.querySelector(`.ib-map-picker[data-target="${selectId}"]`);
        if (!select || !picker) return;
        const pickerOptions = { includeDifficulty: selectId !== 'map-form-map-id' };
        const currentValue = select.value;
        const filtered = filteredMapOptions(keyword, selectId);
        select.innerHTML = renderMapOptionsFromList(filtered, includeEmpty, emptyLabel, pickerOptions);
        if (currentValue) select.value = currentValue;
        if (currentValue && !select.value) {
            const selected = state.mapOptions.find((row) => String(row.map_id) === String(currentValue));
            if (selected) {
                select.innerHTML = renderMapOptionsFromList([selected, ...filtered], includeEmpty, emptyLabel, pickerOptions);
                select.value = currentValue;
            }
        }
        const selectedLabel = mapOptionLabel(select.value, emptyLabel, pickerOptions);
        const selectedValue = select.value;
        const optionItems = [];
        if (includeEmpty) {
            optionItems.push(`<button type="button" class="ib-map-picker-option ${selectedValue === '' ? 'active' : ''}" data-value="">${emptyLabel}</button>`);
        }
        filtered.forEach((row) => {
            const suffix = row.max_players ? ` · 최대 ${row.max_players}명` : '';
            const configured = configuredMapById(row.map_id);
            const normalizedDifficulty = configured ? normalizeMapDifficultyValue(configured.difficulty_mask, row.map_type, true) : 0;
            const difficultyText = pickerOptions.includeDifficulty && normalizedDifficulty ? ` · ${difficultyLabel(normalizedDifficulty, row.map_type, true)}` : '';
            const label = `${row.map_name} (${row.map_type})${suffix}${difficultyText}`;
            optionItems.push(`<button type="button" class="ib-map-picker-option ${String(selectedValue) === String(row.map_id) ? 'active' : ''}" data-value="${row.map_id}">${escapeHtml(label)}</button>`);
        });
        picker.innerHTML = `
            <button type="button" class="ib-map-picker-trigger">
                <span>${escapeHtml(selectedLabel)}</span>
                <i class="fas fa-chevron-down"></i>
            </button>
            <div class="ib-map-picker-panel">
                <div class="ib-map-picker-search-wrap">
                    <input type="text" class="ib-map-picker-search" placeholder="던전/레이드 검색" value="${escapeHtml(keyword)}">
                </div>
                <div class="ib-map-picker-options">${optionItems.join('') || '<div class="ib-empty">검색 결과가 없습니다.</div>'}</div>
            </div>`;

        const trigger = picker.querySelector('.ib-map-picker-trigger');
        const searchInput = picker.querySelector('.ib-map-picker-search');
        const reopenPicker = (nextKeyword) => {
            renderMapPicker(selectId, includeEmpty, emptyLabel, nextKeyword);
            const reopened = document.querySelector(`.ib-map-picker[data-target="${selectId}"]`);
            reopened?.classList.add('open');
            const input = reopened?.querySelector('.ib-map-picker-search');
            if (input) {
                input.focus();
                const end = input.value.length;
                input.setSelectionRange(end, end);
            }
        };
        trigger?.addEventListener('click', () => {
            const willOpen = !picker.classList.contains('open');
            closeAllMapPickers(willOpen ? selectId : '');
            picker.classList.toggle('open', willOpen);
            if (willOpen) {
                setTimeout(() => searchInput?.focus(), 0);
            }
        });
        searchInput?.addEventListener('compositionstart', () => {
            searchInput.dataset.composing = '1';
        });
        searchInput?.addEventListener('compositionend', () => {
            searchInput.dataset.composing = '0';
            reopenPicker(searchInput.value);
        });
        searchInput?.addEventListener('input', () => {
            if (searchInput.dataset.composing === '1') return;
            reopenPicker(searchInput.value);
        });
        picker.querySelectorAll('.ib-map-picker-option').forEach((option) => {
            option.addEventListener('click', () => {
                select.value = option.dataset.value || '';
                renderMapPicker(selectId, includeEmpty, emptyLabel, '');
                select.dispatchEvent(new Event('change', { bubbles: true }));
                picker.classList.remove('open');
            });
        });
    }

    function applyMapOptions() {
        const mappings = [
            ['maps-filter-map-id', true, '전체'],
            ['missions-filter-map-id', true, '전체'],
            ['themes-filter-map-id', true, '전체'],
            ['rewards-filter-map-id', true, '전체'],
            ['daily-usage-filter-map-id', true, '전체'],
            ['runs-filter-map-id', true, '전체'],
            ['map-form-map-id', false, '던전/레이드를 선택해주세요.'],
            ['mission-form-map-id', false, '던전/레이드'],
            ['theme-form-map-id', false, '던전/레이드'],
            ['reward-form-map-id', false, '던전/레이드']
        ];
        mappings.forEach(([selectId, includeEmpty, emptyLabel]) => {
            renderMapPicker(selectId, includeEmpty, emptyLabel, '');
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

    function toggleCrudView(prefix, mode, options = {}) {
        const listCard = document.getElementById(`${prefix}-list-card`);
        const formCard = document.getElementById(`${prefix === 'maps' ? 'map' : prefix.slice(0, -1)}-form-card`);
        if (!listCard || !formCard) return;
        state.views[prefix] = mode;
        if (mode === 'form') {
            listCard.classList.add('ib-view-hidden');
            formCard.style.display = 'block';
        } else {
            listCard.classList.remove('ib-view-hidden');
            formCard.style.display = 'none';
        }
        if (options.push !== false) {
            pushHistoryState();
        }
    }

    async function loadDashboard() {
        const data = await api('/instance-bonus/dashboard');
        document.getElementById('dashboard-guide').innerHTML = [
            '1. 먼저 맵 설정에서 어떤 던전이나 레이드를 운영할지 등록합니다.',
            '2. 맵 설정에서 해당 던전이나 레이드의 난이도를 정합니다.',
            '3. 보상 프로파일에서 등급별 보상을 먼저 만듭니다.',
            '4. 미션 관리에서 보상 프로파일을 연결해 추가미션을 작성합니다.',
            '5. 검토가 끝나면 게시 상태를 게시로 바꿔 실제 운영에 투입합니다.',
            `현재 기존 게임 테이블에는 미션 ${data.runtimeMissionCount || 0}개가 있고, 관리용 v2 테이블에는 미션 ${data.v2MissionCount || 0}개가 있습니다.`
        ].map((line) => `<div class="ib-list-item">${line}</div>`).join('');
        document.getElementById('dashboard-stats').innerHTML = [
            ['최근 실행 런 수', data.recentRuns || 0],
            ['오늘 성공 수', data.todaySuccess || 0],
            ['오늘 실패 수', data.todayFailed || 0],
            ['최근 대체 선택 발생 수', data.recentFallbacks || 0]
        ].map(([label, value]) => `<div class="ib-stat"><small>${label}</small><strong>${value}</strong></div>`).join('');
        document.getElementById('dashboard-map-runs').innerHTML = (data.mapRunCounts || []).length
            ? data.mapRunCounts.map((row) => `<div class="ib-list-item"><div class="ib-kv"><strong>맵 ID</strong><span>${escapeHtml(row.mapId)}</span></div><div class="ib-kv"><strong>실행 수</strong><span>${escapeHtml(row.count)}</span></div></div><div class="ib-help">${escapeHtml(row.name || '')}</div>`).join('')
            : '<div class="ib-empty">최근 실행 데이터가 없습니다.</div>';
        document.getElementById('dashboard-failed-runs').innerHTML = (data.recentFailedRuns || []).length
            ? data.recentFailedRuns.map((row) => `<div class="ib-list-item"><div><strong>#${row.run_id}</strong> · ${escapeHtml(row.mission_name || '-')}</div><div class="ib-help">${escapeHtml(row.status || '-')} / ${escapeHtml(row.failure_reason || '실패 사유 없음')}</div></div>`).join('')
            : '<div class="ib-empty">최근 실패 데이터가 없습니다.</div>';
    }

    async function importRuntimeData() {
        if (!confirm('기존 게임 테이블의 미션과 보상 데이터를 관리 화면으로 가져오시겠습니까?\n기존 게임 테이블 자체는 수정하지 않습니다.')) return;
        const result = await api('/instance-bonus/runtime/import', { method: 'POST', body: '{}' });
        alert(`가져오기가 완료되었습니다.\n맵 설정 ${result.importedMaps}건\n미션 ${result.importedMissions}건\n보상 프로파일 ${result.importedRewards || 0}건`);
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
            formSection('맵 공통 설정', '맵 자체의 기본 규칙을 정하는 화면입니다. 여기서 정한 기본값은 미션이 별도 값을 가지지 않을 때 공통 기준으로 사용됩니다.'),
            `<div class="ib-field"><label>던전/레이드 선택</label><div class="ib-map-picker" data-target="map-form-map-id" data-empty="던전/레이드를 선택해주세요."></div><select id="map-form-map-id" name="map_id" hidden></select><small class="ib-help">추가미션을 적용할 던전이나 레이드를 선택하세요.</small></div>`,
            `<div class="ib-field"><label>맵 이름</label><input id="map-form-map-name" type="text" name="map_name" readonly><small class="ib-help">선택한 맵의 이름이 자동으로 채워집니다.</small></div>`,
            `<div class="ib-field full"><div id="map-difficulty-manager" class="ib-map-difficulty-manager"></div></div>`,
            ...mapFields.filter((field) => !['map_id', 'map_name'].includes(field.name)).map((field) => fieldTemplate(field)),
            `<div class="ib-field full"><div class="ib-actions"><button type="button" class="ib-btn ib-btn-primary" onclick="instanceBonusApp.saveMap(false)">저장 후 목록</button><button type="button" class="ib-btn ib-btn-ghost" onclick="instanceBonusApp.saveMap(true)">저장 후 계속 편집</button><button type="button" class="ib-btn ib-btn-secondary" onclick="instanceBonusApp.closeMapForm()">목록으로</button></div></div>`
        ].join('');
        applyMapOptions();
        document.getElementById('map-form-map-id')?.addEventListener('change', syncMapNameFromSelect);
    }
    function openMapForm(data = null, options = {}) {
        state.mapEditingId = data ? data.map_id : null;
        state.mapDifficulty.focusAfterOpen = !!options.focusDifficulty;
        state.mapDifficulty.mapType = data ? mapTypeForValue(data.map_id) : '던전';
        state.mapDifficulty.selected = normalizeMapDifficultyValue(data?.difficulty_mask, state.mapDifficulty.mapType, true);
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
            form.elements.daily_limit_per_player.value = '0';
            form.elements.min_party_size.value = '1';
            form.elements.max_party_size.value = '5';
            form.elements.max_concurrent_missions.value = '1';
        }
        const mapSelect = document.getElementById('map-form-map-id');
        if (mapSelect) {
            mapSelect.value = data ? String(data.map_id || '') : '';
            renderMapPicker('map-form-map-id', false, '던전/레이드를 선택해주세요.', '');
        }
        syncMapNameFromSelect();
        renderMapDifficultyManager();
    }

    function closeMapForm() {
        toggleCrudView('maps', 'list');
        state.mapEditingId = null;
        state.mapDifficulty.focusAfterOpen = false;
    }

    function mapPayload() {
        const form = document.getElementById('map-form');
        const payload = {};
        mapFields.forEach((field) => {
            const el = form.elements[field.name];
            if (!el) return;
            if (field.type === 'number') payload[field.name] = Number(el.value || 0);
            else if (field.type === 'checkbox') payload[field.name] = Number(el.value || 0);
            else payload[field.name] = el.value;
        });
        payload.difficulty_mask = normalizeMapDifficultyValue(
            document.getElementById('map-difficulty-select')?.value || 0,
            state.mapDifficulty.mapType,
            true
        );
        if (!payload.map_id || payload.map_id <= 0) throw new Error('맵 ID는 필수입니다.');
        if (payload.daily_limit_per_player < 0) throw new Error('추가미션 일일 제한은 0 이상이어야 합니다.');
        if (payload.daily_limit_per_player > 100) throw new Error('추가미션 일일 제한은 100 이하로만 설정할 수 있습니다.');
        return payload;
    }

    function syncMapNameFromSelect() {
        const select = document.getElementById('map-form-map-id');
        const input = document.getElementById('map-form-map-name');
        if (!select || !input) return;
        const selected = state.mapOptions.find((row) => Number(row.map_id) === Number(select.value));
        input.value = selected ? selected.map_name : '';
        if (select.id === 'map-form-map-id') {
            state.mapDifficulty.mapId = Number(select.value || 0) || null;
            state.mapDifficulty.mapType = selected?.map_type || '던전';
            refreshMapDifficultySelection(state.mapDifficulty.mapType);
            renderMapDifficultyManager();
        }
    }

    function mapTypeForValue(mapId) {
        const selected = state.mapOptions.find((row) => Number(row.map_id) === Number(mapId));
        return selected?.map_type || '던전';
    }

    function difficultyOptionsForMapType(mapType) {
        if (mapType === '레이드') return difficultyOptions.filter((item) => item.group === 'raid');
        return difficultyOptions.filter((item) => item.group === 'dungeon');
    }

    function currentMapDifficultyOption() {
        const options = difficultyOptionsForMapType(state.mapDifficulty.mapType || '던전');
        const normalized = normalizeMapDifficultyValue(state.mapDifficulty.selected, state.mapDifficulty.mapType, true);
        return options.find((item) => item.value === normalized) || options[0] || difficultyOptions[0];
    }

    function refreshMapDifficultySelection(mapType) {
        const options = difficultyOptionsForMapType(mapType);
        if (!options.length) {
            state.mapDifficulty.selected = 0;
            return;
        }
        const normalized = normalizeMapDifficultyValue(state.mapDifficulty.selected, mapType, true);
        if (!options.some((item) => item.value === normalized)) {
            state.mapDifficulty.selected = options[0].value;
            return;
        }
        state.mapDifficulty.selected = normalized;
    }

    function renderMapDifficultyManager() {
        const container = document.getElementById('map-difficulty-manager');
        if (!container) return;
        const mapId = Number(document.getElementById('map-form-map-id')?.value || 0);
        if (!mapId) {
            container.innerHTML = '';
            return;
        }
        state.mapDifficulty.mapId = mapId;
        const selected = currentMapDifficultyOption();
        const options = difficultyOptionsForMapType(state.mapDifficulty.mapType || '던전');
        container.innerHTML = `
            <div class="ib-field">
                <label>난이도 선택</label>
                <select id="map-difficulty-select" onchange="instanceBonusApp.selectMapDifficulty(this.value)">
                    ${options.map((item) => `<option value="${item.value}" ${item.value === selected.value ? 'selected' : ''}>${escapeHtml(item.label)}</option>`).join('')}
                </select>
            </div>`;
    }

    function selectMapDifficulty(value) {
        state.mapDifficulty.selected = normalizeMapDifficultyValue(value || 0, state.mapDifficulty.mapType, true);
        renderMapDifficultyManager();
    }

    async function saveMap(keepEditing = false) {
        const payload = mapPayload();
        if (state.mapEditingId) {
            await api(`/instance-bonus/maps/${state.mapEditingId}`, { method: 'PUT', body: JSON.stringify(payload) });
        } else {
            await api('/instance-bonus/maps', { method: 'POST', body: JSON.stringify(payload) });
        }
        await loadConfiguredMapOptions();
        loadMaps();
        if (!keepEditing) {
            closeMapForm();
        }
    }

    async function loadMaps(page = state.mapsPage, silent = false) {
        state.mapsPage = page;
        const params = new URLSearchParams({ page: String(page), limit: '20' });
        const mapId = document.getElementById('maps-filter-map-id')?.value.trim();
        const enabled = document.getElementById('maps-filter-enabled')?.value;
        if (mapId) params.set('map_id', mapId);
        if (enabled !== '') params.set('enabled', enabled);
        const data = await api(`/instance-bonus/maps?${params.toString()}`);
        state.mapsCache = data.items || [];
        if (silent) return data;
        const body = document.getElementById('maps-table');
        body.innerHTML = state.mapsCache.length ? state.mapsCache.map((row) => `
            <tr>
                <td>${escapeHtml(row.map_name || `맵 ${row.map_id}`)}<div class="ib-help">ID ${row.map_id}</div></td>
                <td>${escapeHtml(difficultyLabel(row.difficulty_mask || 0, mapTypeForValue(row.map_id), true))}</td>
                <td>${badge(row.enabled)}</td>
                <td>${badge(row.allow_vote)}</td>
                <td>${row.daily_limit_per_player === 0 ? '무제한' : `${row.daily_limit_per_player}회`}</td>
                <td>${badge(row.allow_llm)}</td>
                <td>${row.default_time_limit_sec || 0}</td>
                <td>${row.min_party_size || 0} ~ ${row.max_party_size || 0}</td>
                <td>${row.max_concurrent_missions || 0}</td>
                <td>${escapeHtml(row.updated_by || '-')}</td>
                <td><div class="ib-actions"><button class="ib-btn ib-btn-ghost" onclick="instanceBonusApp.editMapById(${row.map_id})">수정</button><button class="ib-btn ib-btn-danger" onclick="instanceBonusApp.deleteMap(${row.map_id})">삭제</button></div></td>
            </tr>`).join('') : '<tr><td colspan="11" class="ib-empty">등록된 맵 설정이 없습니다.</td></tr>';
        renderPagination('maps-pagination', data.page || 1, data.total || 0, data.limit || 20, 'loadMaps');
    }

    async function editMapById(mapID, focusDifficulty = false) {
        const row = state.mapsCache.find((item) => Number(item.map_id) === Number(mapID));
        if (!row) return;
        openMapForm(row, { focusDifficulty });
    }

    async function deleteMap(mapID) {
        const row = state.mapsCache.find((item) => Number(item.map_id) === Number(mapID));
        if (!row) return;
        if (!confirm(`map_id ${mapID} ?ㅼ젙??鍮꾪솢?깊솕?섏떆寃좎뒿?덇퉴?\n湲곗〈 ?고????뚯씠釉붿? 嫄대뱶由ъ? ?딄퀬 enabled留?0?쇰줈 蹂寃쏀빀?덈떎.`)) return;
        await api(`/instance-bonus/maps/${mapID}`, { method: 'DELETE' });
        loadMaps(state.mapsPage);
    }

    function renderMissionForm() {
        const form = document.getElementById('mission-form');
        const sections = [
            formSection('기본 정보', '맵 설정에 먼저 등록한 던전이나 레이드를 고른 뒤, 그 맵에서 사용할 추가미션을 작성하는 화면입니다.'),
            `<div class="ib-field"><label>던전/레이드 선택</label><div class="ib-map-picker" data-target="mission-form-map-id" data-empty="던전/레이드를 선택하세요"></div><select id="mission-form-map-id" name="map_id" hidden></select><small class="ib-help">맵 설정에 먼저 등록한 던전이나 레이드만 선택할 수 있습니다.</small></div>`,
            `<input type="hidden" id="mission-form-difficulty-mask" name="difficulty_mask" value="0">`,
            fieldTemplate({ name: 'mission_key', label: '미션 키', help: '내부 식별용 키입니다.' }),
            `<div class="ib-field"><label>미션 이름</label><input type="text" name="name"><small id="mission-selected-difficulty" class="ib-help">선택한 던전/레이드의 난이도가 여기에 표시됩니다.</small></div>`,
            fieldTemplate({ name: 'description', label: '설명', type: 'textarea', full: true, help: '운영자가 미션 내용을 이해하기 위한 설명입니다.' }),
            fieldTemplate({ name: 'briefing_text', label: '브리핑 문구', type: 'textarea', full: true, help: '게임 안에 보여줄 안내 문구입니다.' }),

            formSection('목표 조건', '플레이어가 무엇을 해야 성공하는지 정합니다.'),
            fieldTemplate({ name: 'mission_type', label: '미션 종류', help: '예: 처치형, 보스형, 생존형 등 운영자가 구분하기 위한 분류입니다.' }),
            fieldTemplate({ name: 'objective_type', label: '목표 방식', help: '예: 몬스터 처치, 보스 격파, 생존 등 실제 목표의 성격을 적습니다.' }),
            fieldTemplate({ name: 'target_entry', label: '대상 번호', type: 'number', help: 'NPC나 오브젝트 등 목표 대상의 번호입니다.' }),
            fieldTemplate({ name: 'target_label', label: '목표 이름', help: '대상 번호를 사람이 읽기 쉽게 적어두는 이름입니다.' }),
            fieldTemplate({ name: 'target_count', label: '목표 수량', type: 'number', help: '몇 개를 달성해야 성공하는지 적습니다.' }),
            fieldTemplate({ name: 'time_limit_sec', label: '미션 개별 제한 시간(초)', type: 'number', help: '이 미션에만 따로 적용할 제한 시간입니다. 0으로 두거나 비워두면 맵 설정의 기본 시간이 사용됩니다.' }),
            fieldTemplate({ name: 'failure_condition_type', label: '실패 조건', help: '언제 이 미션을 실패로 볼지 정하는 기준입니다.' }),
            fieldTemplate({ name: 'required_boss_entry', label: '필수 보스 번호', type: 'number', help: '이 번호의 보스를 잡아야 성공 처리되는 경우 사용합니다.' }),
            fieldTemplate({ name: 'required_before_boss_entry', label: '선행 보스 번호', type: 'number', help: '먼저 처치되어야 하는 보스가 있다면 번호를 넣습니다.' }),
            fieldTemplate({ name: 'allowed_death_count', label: '허용 사망 수', type: 'number', help: '이 횟수를 넘겨 죽으면 미션을 실패시킵니다. 0이면 사망 허용이 없습니다.' }),
            fieldTemplate({ name: 'allowed_wipe_count', label: '허용 전멸 수', type: 'number', help: '이 횟수를 넘겨 전멸하면 미션을 실패시킵니다.' }),

            formSection('보상 설정', '미션 완료 시 연결할 보상과 선택 비중을 정합니다.'),
            fieldTemplate({ name: 'reward_profile_id', label: '보상 프로파일 ID', type: 'number', help: '완료 시 연결할 보상 프로파일 번호입니다.' }),
            fieldTemplate({ name: 'difficulty_weight', label: '난이도 가중치', type: 'number', help: '미션 선택 시 상대적인 등장 비율이나 난이도 보정을 위한 값입니다.' }),

            formSection('파티 조건 및 게시 상태', '어떤 파티에서 이 미션을 쓸 수 있는지와 운영 상태를 정합니다.'),
            fieldTemplate({ name: 'min_party_size', label: '최소 파티 수', type: 'number', help: '이보다 적은 인원에서는 미션을 사용하지 않습니다.' }),
            fieldTemplate({ name: 'max_party_size', label: '최대 파티 수', type: 'number', help: '이보다 많은 인원에서는 미션을 사용하지 않습니다.' }),
            fieldTemplate({ name: 'min_avg_item_level', label: '최소 평균 템렙', type: 'number', help: '이보다 낮은 평균 장비 수준의 파티에는 제시하지 않습니다.' }),
            fieldTemplate({ name: 'max_avg_item_level', label: '최대 평균 템렙', type: 'number', help: '이보다 높은 평균 장비 수준에는 제시하지 않으려면 설정합니다.' }),
            fieldTemplate({ name: 'required_tank', label: '탱커 필요', type: 'checkbox', help: '탱커 역할이 포함된 파티에서만 사용할지 여부입니다.' }),
            fieldTemplate({ name: 'required_healer', label: '힐러 필요', type: 'checkbox', help: '힐러 역할이 포함된 파티에서만 사용할지 여부입니다.' }),
            fieldTemplate({ name: 'enabled', label: '활성', type: 'checkbox', help: '비활성으로 두면 이 미션은 선택되지 않습니다.' }),
            fieldTemplate({ name: 'publish_status', label: '게시 상태', type: 'select', options: publishStatuses, help: '초안, 검토, 게시, 보관 상태로 운영할 수 있습니다.' }),
            `<div class="ib-field full"><div class="ib-actions"><button type="button" class="ib-btn ib-btn-primary" onclick="instanceBonusApp.saveMission(false)">저장 후 목록</button><button type="button" class="ib-btn ib-btn-ghost" onclick="instanceBonusApp.saveMission(true)">저장 후 계속 편집</button><button type="button" class="ib-btn ib-btn-secondary" onclick="instanceBonusApp.closeMissionForm()">목록으로</button></div></div>`
        ];
        form.innerHTML = sections.join('');
        applyMapOptions();
        document.getElementById('mission-form-map-id')?.addEventListener('change', syncMissionDifficultyHint);
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
        applyMapOptions();
        const missionDifficultyValue = data?.difficulty_mask ?? (
            state.mapDifficulty.mapId && Number(state.mapDifficulty.mapId) === Number(form.elements.map_id?.value || 0)
                ? currentMapDifficultyOption().value
                : 0
        );
        form.elements.difficulty_mask.value = String(normalizeMapDifficultyValue(missionDifficultyValue, mapTypeForValue(form.elements.map_id?.value || 0), true));
        syncMissionDifficultyHint();
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
        data.difficulty_mask = Number(form.elements.difficulty_mask?.value || 0);
        if (!data.mission_key || !data.name) throw new Error('미션 키와 이름은 필수입니다.');
        return data;
    }

    function syncMissionDifficultyHint() {
        const select = document.getElementById('mission-form-map-id');
        const hint = document.getElementById('mission-selected-difficulty');
        const hidden = document.getElementById('mission-form-difficulty-mask');
        if (!hint || !hidden) return;
        const mapId = Number(select?.value || 0);
        const configured = configuredMapById(mapId);
        const difficulty = normalizeMapDifficultyValue(configured?.difficulty_mask || 0, mapTypeForValue(mapId), true);
        hidden.value = String(difficulty || 0);
        hint.textContent = mapId
            ? `현재 선택 난이도: ${difficultyLabel(difficulty, mapTypeForValue(mapId), true)}`
            : '선택한 던전/레이드의 난이도가 여기에 표시됩니다.';
    }


    async function saveMission(keepEditing = false) {
        const payload = missionPayload();
        if (payload.publish_status === 'published' && !confirmPublishWorkflow('誘몄뀡')) return;
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
                <td>${row.mission_id}</td><td>${escapeHtml(mapNameById(row.map_id))}</td><td>${escapeHtml(row.mission_key)}</td><td>${escapeHtml(row.name)}</td>
                <td>${escapeHtml(row.mission_type)}</td><td>${escapeHtml(row.objective_type)}</td><td>${escapeHtml(row.target_label)}</td>
                <td>${row.target_count || 0}</td><td>${row.time_limit_sec || 0}</td><td>${badge(row.enabled)}</td>
                <td>${publishBadge(row.publish_status)}</td><td>${row.version || 1}</td><td>${escapeHtml(row.updated_at || '-')}</td>
                <td><div class="ib-actions"><button class="ib-btn ib-btn-ghost" onclick="instanceBonusApp.fetchMission(${row.mission_id})">수정</button></div></td>
            </tr>`).join('') : '<tr><td colspan="14" class="ib-empty">등록된 미션이 없습니다. 대시보드에서 기존 게임 데이터를 가져오거나 새 미션을 추가하세요.</td></tr>';
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
            formSection('기본 정보', '맵 설정에 먼저 등록한 던전이나 레이드를 고른 뒤, 해당 맵에서 사용할 테마를 작성하는 화면입니다.'),
            `<div class="ib-field"><label>던전/레이드 선택</label><div class="ib-map-picker" data-target="theme-form-map-id" data-empty="던전/레이드를 선택하세요"></div><select id="theme-form-map-id" name="map_id" hidden></select><small class="ib-help">맵 설정에 먼저 등록한 던전이나 레이드만 선택할 수 있습니다.</small></div>`,
            fieldTemplate({ name: 'theme_key', label: '테마 키', help: '내부 식별용 키입니다.' }),
            fieldTemplate({ name: 'name', label: '테마 이름', help: '운영 화면에 보여줄 테마 이름입니다.' }),
            fieldTemplate({ name: 'description', label: '설명', type: 'textarea', full: true, help: '테마가 어떤 성격인지 운영자가 이해하기 위한 설명입니다.' }),
            fieldTemplate({ name: 'briefing_style', label: '브리핑 방식', help: '게임 안 문구 스타일이나 설명 방식을 적습니다.' }),

            formSection('파티 조건', '어떤 파티 구성을 대상으로 할 테마인지 정합니다.'),
            fieldTemplate({ name: 'min_party_size', label: '최소 파티 수', type: 'number', help: '이보다 적은 인원에서는 테마를 사용하지 않습니다.' }),
            fieldTemplate({ name: 'max_party_size', label: '최대 파티 수', type: 'number', help: '이보다 많은 인원에서는 테마를 사용하지 않습니다.' }),
            fieldTemplate({ name: 'min_avg_item_level', label: '최소 평균 템렙', type: 'number', help: '이보다 낮은 평균 장비 수준의 파티에는 제시하지 않습니다.' }),
            fieldTemplate({ name: 'max_avg_item_level', label: '최대 평균 템렙', type: 'number', help: '이보다 높은 평균 장비 수준에는 제시하지 않으려면 설정합니다.' }),
            fieldTemplate({ name: 'required_tank', label: '탱커 필요', type: 'checkbox', help: '탱커 역할이 포함된 파티에서만 이 테마를 사용합니다.' }),
            fieldTemplate({ name: 'required_healer', label: '힐러 필요', type: 'checkbox', help: '힐러 역할이 포함된 파티에서만 이 테마를 사용합니다.' }),

            formSection('가중치 설정', '테마 등장 비율을 정합니다.'),
            fieldTemplate({ name: 'weight', label: '가중치', type: 'number', help: '선택 후보 중 이 테마가 등장할 상대 비율입니다.' }),
            `<input type="hidden" id="theme-form-difficulty-mask" name="difficulty_mask" value="0">`,
            `<div class="ib-field full"><label>적용 난이도</label><div class="ib-static-note">이 값은 맵 설정에서 선택한 난이도를 따라 자동으로 들어갑니다. 테마 관리 화면에서는 따로 바꾸지 않습니다.</div></div>`,
            fieldTemplate({ name: 'enabled', label: '활성', type: 'checkbox', help: '비활성으로 두면 이 테마는 선택되지 않습니다.' }),
            fieldTemplate({ name: 'publish_status', label: '게시 상태', type: 'select', options: publishStatuses, help: '초안, 검토, 게시, 보관 상태로 운영할 수 있습니다.' }),
            `<div class="ib-field full"><div class="ib-actions"><button type="button" class="ib-btn ib-btn-primary" onclick="instanceBonusApp.saveTheme(false)">저장 후 목록</button><button type="button" class="ib-btn ib-btn-ghost" onclick="instanceBonusApp.saveTheme(true)">저장 후 계속 편집</button><button type="button" class="ib-btn ib-btn-secondary" onclick="instanceBonusApp.closeThemeForm()">목록으로</button></div></div>`
        ];
        form.innerHTML = sections.join('');
        applyMapOptions();
        document.getElementById('theme-form-difficulty-mask').value = '0';
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
        applyMapOptions();
        const themeDifficultyValue = data?.difficulty_mask ?? (
            state.mapDifficulty.mapId && Number(state.mapDifficulty.mapId) === Number(form.elements.map_id?.value || 0)
                ? currentMapDifficultyOption().value
                : 0
        );
        form.elements.difficulty_mask.value = String(themeDifficultyValue || 0);
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
        data.difficulty_mask = Number(form.elements.difficulty_mask?.value || 0);
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
                <td><div class="ib-actions"><button class="ib-btn ib-btn-ghost" onclick="instanceBonusApp.fetchTheme(${row.theme_id})">?몄쭛</button></div></td>
            </tr>`).join('') : '<tr><td colspan="11" class="ib-empty">?깅줉???뚮쭏媛 ?놁뒿?덈떎. 湲곗〈 寃뚯엫 ?뚯씠釉붿뿉 ?ｌ뼱???뚮쭏????쒕낫?쒖쓽 "湲곗〈 寃뚯엫 ?곗씠??媛?몄삤湲?瑜?癒쇱? ?뚮윭二쇱꽭??</td></tr>';
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

    function resetThemeLinkFilter() {
        const keyword = document.getElementById('theme-link-keyword');
        if (keyword) keyword.value = '';
        loadThemeLinks();
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
        const linkedMissionIds = new Set((state.themeLinksCache || []).map((row) => Number(row.mission_id)));
        const visibleCandidates = state.missionsCache.filter((row) => !linkedMissionIds.has(Number(row.mission_id)));
        const countEl = document.getElementById('theme-link-candidate-count');
        if (countEl) countEl.textContent = `${visibleCandidates.length}건`;
        body.innerHTML = visibleCandidates.length ? visibleCandidates.map((row) => `
            <tr>
                <td>${escapeHtml(row.name)}<div class="ib-help">${escapeHtml(row.mission_key)}</div></td>
                <td>${escapeHtml(row.mission_type || '-')}</td>
                <td><span class="ib-theme-link-status off">대기</span></td>
                <td><button class="ib-btn ib-btn-primary" onclick="instanceBonusApp.addThemeMission(${row.mission_id})">추가</button></td>
            </tr>`).join('') : '<tr><td colspan="4" class="ib-empty">추가 가능한 후보 미션이 없습니다.</td></tr>';
    }

    async function loadThemeLinks() {
        const themeId = document.getElementById('theme-link-theme-select')?.value;
        if (!themeId) {
            state.themeLinksCache = [];
            const candidateCountEl = document.getElementById('theme-link-candidate-count');
            const linkedCountEl = document.getElementById('theme-link-linked-count');
            if (candidateCountEl) candidateCountEl.textContent = '0건';
            if (linkedCountEl) linkedCountEl.textContent = '0건';
            document.getElementById('theme-link-table').innerHTML = '<tr><td colspan="5" class="ib-empty">먼저 테마를 선택하세요.</td></tr>';
            renderThemeMissionCandidates();
            return;
        }
        const items = await api(`/instance-bonus/themes/${themeId}/missions`);
        state.themeLinksCache = items || [];
        const linkedCountEl = document.getElementById('theme-link-linked-count');
        if (linkedCountEl) linkedCountEl.textContent = `${state.themeLinksCache.length}건`;
        document.getElementById('theme-link-table').innerHTML = state.themeLinksCache.length ? state.themeLinksCache.map((row) => `
            <tr>
                <td>${escapeHtml(row.mission_name || `미션 #${row.mission_id}`)}<div class="ib-help">${escapeHtml(row.mission_key || '')}</div></td>
                <td><select class="ib-inline-select" onchange="instanceBonusApp.updateThemeMission(${themeId}, ${row.mission_id}, 'required', this.value)"><option value="1" ${row.required ? 'selected' : ''}>필수</option><option value="0" ${!row.required ? 'selected' : ''}>선택</option></select></td>
                <td><input class="ib-inline-input" type="number" value="${row.slot || 0}" onchange="instanceBonusApp.updateThemeMission(${themeId}, ${row.mission_id}, 'slot', this.value)"></td>
                <td><input class="ib-inline-input" type="number" value="${row.weight || 0}" onchange="instanceBonusApp.updateThemeMission(${themeId}, ${row.mission_id}, 'weight', this.value)"></td>
                <td><button class="ib-btn ib-btn-danger" onclick="instanceBonusApp.removeThemeMission(${themeId}, ${row.mission_id})">삭제</button></td>
            </tr>`).join('') : '<tr><td colspan="5" class="ib-empty">연결된 미션이 없습니다.</td></tr>';
        renderThemeMissionCandidates();
    }

    async function addThemeMission(missionId) {
        const themeId = document.getElementById('theme-link-theme-select')?.value;
        if (!themeId) throw new Error('테마를 먼저 선택하세요.');
        const nextSlot = (state.themeLinksCache?.length || 0) + 1;
        await api(`/instance-bonus/themes/${themeId}/missions`, { method: 'POST', body: JSON.stringify({ mission_id: Number(missionId), required: 0, slot: nextSlot, weight: 100 }) });
        await loadThemeLinks();
    }

    async function updateThemeMission(themeId, missionId, field, value) {
        const items = await api(`/instance-bonus/themes/${themeId}/missions`);
        const current = items.find((item) => Number(item.mission_id) === Number(missionId));
        if (!current) return;
        const payload = { mission_id: missionId, required: current.required, slot: current.slot, weight: current.weight };
        payload[field] = field === 'required' ? Number(value || 0) : Number(value || 0);
        await api(`/instance-bonus/themes/${themeId}/missions`, { method: 'POST', body: JSON.stringify(payload) });
        await loadThemeLinks();
    }

    async function removeThemeMission(themeId, missionId) {
        await api(`/instance-bonus/themes/${themeId}/missions/${missionId}`, { method: 'DELETE' });
        await loadThemeLinks();
    }

    function renderRewardForm() {
        const form = document.getElementById('reward-form');
        form.innerHTML = `
            ${formSection('\uAE30\uBCF8 \uC815\uBCF4', '\uBCF4\uC0C1 \uD504\uB85C\uD30C\uC77C \uC774\uB984\uACFC \uC5F0\uACB0\uD560 \uB358\uC804/\uB808\uC774\uB4DC\uB97C \uC124\uC815\uD569\uB2C8\uB2E4.')}
            <div class="ib-field"><label>\uB358\uC804/\uB808\uC774\uB4DC \uC120\uD0DD</label><div class="ib-map-picker" data-target="reward-form-map-id" data-empty="\uB358\uC804/\uB808\uC774\uB4DC\uB97C \uC120\uD0DD\uD558\uC138\uC694"></div><select id="reward-form-map-id" name="map_id" hidden></select><small class="ib-help">\uC774 \uBCF4\uC0C1 \uD504\uB85C\uD30C\uC77C\uC774 \uC801\uC6A9\uB420 \uB358\uC804/\uB808\uC774\uB4DC\uB97C \uACE0\uB985\uB2C8\uB2E4.</small></div>
            <div class="ib-field"><label>\uBCF4\uC0C1 \uD0A4</label><input type="text" name="profile_key" placeholder="\uC608: mana_tombs_reward_profile"><small class="ib-help">\uBCF4\uC0C1 \uD504\uB85C\uD30C\uC77C\uC744 \uAD6C\uBD84\uD560 \uACE0\uC720 \uD0A4\uC785\uB2C8\uB2E4. \uC601\uBB38 \uC18C\uBB38\uC790\uC640 \uBC11\uC904\uB97C \uC8FC\uB85C \uC0AC\uC6A9\uD558\uBA74 \uAD00\uB9AC\uD558\uAE30 \uC88B\uC2B5\uB2C8\uB2E4.</small></div>
            <div class="ib-field"><label>\uC774\uB984</label><input type="text" name="name" placeholder="\uC608: \uB9C8\uB098 \uBB34\uB364 \uAE30\uBCF8 \uBCF4\uC0C1"><small class="ib-help">\uD654\uBA74\uC5D0\uC11C \uBC14\uB85C \uC774\uD574\uD560 \uC218 \uC788\uB294 \uBCF4\uC0C1 \uD504\uB85C\uD30C\uC77C \uC774\uB984\uC744 \uC801\uC5B4\uC8FC\uC138\uC694.</small></div>
            <div class="ib-field"><label>\uD65C\uC131</label><select name="enabled"><option value="1">\uC0AC\uC6A9</option><option value="0">\uBE44\uD65C\uC131</option></select><small class="ib-help">\uBE44\uD65C\uC131\uC73C\uB85C \uB450\uBA74 \uAE30\uC874 \uB370\uC774\uD130\uB294 \uB0A8\uAE30\uACE0 \uD604\uC7AC \uC6B4\uC601\uC5D0\uC11C\uB9CC \uC81C\uC678\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.</small></div>
            <div class="ib-field"><label>\uAC8C\uC2DC \uC0C1\uD0DC</label><select name="publish_status"><option value="draft">\uCD08\uC548</option><option value="review">\uAC80\uD1A0</option><option value="published">\uAC8C\uC2DC</option><option value="archived">\uBCF4\uAD00</option></select><small class="ib-help">\uCD08\uC548\uC740 \uC791\uC131 \uC911, \uAC80\uD1A0\uB294 \uD655\uC778 \uB300\uAE30, \uAC8C\uC2DC\uB294 \uC2E4\uC81C \uC0AC\uC6A9, \uBCF4\uAD00\uC740 \uC774\uC804 \uAE30\uB85D \uBCF4\uAD00 \uC6A9\uB3C4\uC785\uB2C8\uB2E4.</small></div>
            <div class="ib-field full"><label>\uC124\uBA85</label><textarea name="description" placeholder="\uC6B4\uC601\uC790\uAC00 \uBCF4\uC0C1 \uD504\uB85C\uD30C\uC77C\uC758 \uC6A9\uB3C4\uC640 \uCC28\uC774\uB97C \uAD6C\uBD84\uD560 \uC218 \uC788\uB3C4\uB85D \uC801\uC2B5\uB2C8\uB2E4."></textarea><small class="ib-help">\uC5B4\uB5A4 \uD14C\uB9C8\uC5D0 \uC4F0\uB294 \uBCF4\uC0C1\uC778\uC9C0, \uAE30\uC874 \uBCF4\uC0C1\uACFC \uCC28\uC774\uAC00 \uBB34\uC5C7\uC778\uC9C0\uB97C \uBA54\uBAA8\uD558\uBA74 \uC6B4\uC601\uD560 \uB54C \uD5F7\uAC08\uB9AC\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.</small></div>
            ${formSection('\uBCF4\uC0C1 \uD56D\uBAA9', '\uB4F1\uAE09\uBCC4 \uBCF4\uC0C1 \uC544\uC774\uD15C\uC744 \uD45C \uD615\uD0DC\uB85C \uC815\uB9AC\uD574 \uAD00\uB9AC\uD569\uB2C8\uB2E4.')}
            <div class="ib-field full">
                <label>\uBCF4\uC0C1 \uD56D\uBAA9</label>
                <div class="ib-inline-notice">\uC544\uC774\uD15C \uAC80\uC0C9 \uBC84\uD2BC\uC73C\uB85C \uAE30\uC874 \uC544\uC774\uD15C \uAC80\uC0C9 \uCC3D\uC744 \uC5F4 \uC218 \uC788\uC2B5\uB2C8\uB2E4. \uAC19\uC740 \uB4F1\uAE09\uC5D0 \uC5EC\uB7EC \uC544\uC774\uD15C\uC744 \uC8FC\uB824\uBA74 \uAC19\uC740 \uB4F1\uAE09\uC73C\uB85C \uC5EC\uB7EC \uC904\uC744 \uCD94\uAC00\uD558\uC138\uC694.</div>
                <div class="ib-reward-toolbar">
                    <button type="button" class="ib-btn ib-btn-ghost" onclick="instanceBonusApp.seedDefaultRewardRows()"><i class="fas fa-layer-group"></i> S/A/B/C/D \uAE30\uBCF8 \uC904 \uB9CC\uB4E4\uAE30</button>
                    <button type="button" class="ib-btn ib-btn-primary" onclick="instanceBonusApp.addRewardItemRow()"><i class="fas fa-plus"></i> \uD56D\uBAA9 \uCD94\uAC00</button>
                </div>
                <div class="ib-table-wrap ib-reward-table-wrap">
                    <table class="ib-table ib-reward-table">
                        <thead>
                            <tr>
                                <th>\uB4F1\uAE09</th>
                                <th>\uBCF4\uC0C1 \uC544\uC774\uD15C</th>
                                <th>\uC218\uB7C9</th>
                                <th>\uD655\uB960(%)</th>
                                <th>\uC815\uB82C</th>
                                <th>\uAD00\uB9AC</th>
                            </tr>
                        </thead>
                        <tbody id="reward-items-box"></tbody>
                    </table>
                </div>
            </div>
            <div class="ib-field full"><div class="ib-actions"><button type="button" class="ib-btn ib-btn-primary" onclick="instanceBonusApp.saveReward(false)">\uC800\uC7A5 \uD6C4 \uBAA9\uB85D</button><button type="button" class="ib-btn ib-btn-ghost" onclick="instanceBonusApp.saveReward(true)">\uC800\uC7A5 \uD6C4 \uACC4\uC18D \uD3B8\uC9D1</button><button type="button" class="ib-btn ib-btn-secondary" onclick="instanceBonusApp.closeRewardForm()">\uB2EB\uAE30</button></div></div>`;
        applyMapOptions();
        seedDefaultRewardRows();
    }

    function rewardItemRow(item = {}) {
        const grade = item.grade || 'S';
        const itemName = item.item_name || '';
        const qualityClass = Number.isFinite(Number(item.quality)) ? `ib-item-quality-${Number(item.quality)}` : '';
        const iconMarkup = item.icon_url ? `<span class="ib-item-inline-icon"><img src="${escapeHtml(item.icon_url)}" alt="" style="width:100%;height:100%;object-fit:cover;"></span>` : '';
        const itemPreview = itemName
            ? `${iconMarkup}<span class="ib-item-inline-text">${escapeHtml(itemName)}</span>`
            : '\uC544\uC774\uD15C\uC744 \uC120\uD0DD\uD558\uC138\uC694.';
        return `<tr class="reward-item-row" data-grade="${grade}">
            <td>
                <select class="reward-grade ib-inline-select" onchange="instanceBonusApp.refreshRewardGradeLabel(this)">
                    <option value="S" ${grade === 'S' ? 'selected' : ''}>S</option>
                    <option value="A" ${grade === 'A' ? 'selected' : ''}>A</option>
                    <option value="B" ${grade === 'B' ? 'selected' : ''}>B</option>
                    <option value="C" ${grade === 'C' ? 'selected' : ''}>C</option>
                    <option value="D" ${grade === 'D' ? 'selected' : ''}>D</option>
                </select>
            </td>
            <td>
                <div class="ib-reward-item-cell">
                    <input class="reward-item-entry" type="hidden" value="${item.item_entry ?? ''}">
                    <div class="ib-item-name-preview ${qualityClass}">${itemPreview}</div>
                    <div class="ib-reward-entry-actions">
                        <button type="button" class="ib-btn ib-btn-secondary" onclick="instanceBonusApp.openRewardItemSearchModal(this)">\uBCC0\uACBD</button>
                    </div>
                </div>
            </td>
            <td><input class="reward-item-count" type="number" value="${item.item_count ?? 1}" min="1"></td>
            <td><input class="reward-item-chance" type="number" value="${item.chance ?? 100}" step="0.01" min="0" max="100"></td>
            <td><input class="reward-item-sort" type="number" value="${item.sort_order ?? ''}" placeholder="\uC790\uB3D9"></td>
            <td><button type="button" class="ib-btn ib-btn-danger" onclick="this.closest('.reward-item-row').remove()">\uC0AD\uC81C</button></td>
        </tr>`;
    }

    function addRewardItemRow(item = {}) {
        document.getElementById('reward-items-box').insertAdjacentHTML('beforeend', rewardItemRow(item));
    }

    function seedDefaultRewardRows() {
        const box = document.getElementById('reward-items-box');
        if (!box || box.children.length) return;
        ['S', 'A', 'B', 'C', 'D'].forEach((grade, index) => addRewardItemRow({ grade, item_count: 1, chance: 100, sort_order: index + 1 }));
    }

    function refreshRewardGradeLabel(selectEl) {
        const row = selectEl.closest('.reward-item-row');
        if (!row) return;
        row.dataset.grade = selectEl.value || 'S';
    }

    function openRewardItemSearchModal(buttonEl) {
        const row = buttonEl.closest('.reward-item-row');
        if (!row || typeof ItemPicker === 'undefined') return;
        state.rewardSearchTarget = row;
        ItemPicker.open(async (item) => {
            await applyRewardItemSelection(row, item);
        });
    }

    function closeRewardItemSearchModal() {
        state.rewardSearchTarget = null;
    }

    async function applyRewardItemSelection(row, item) {
        if (!row || !item) return;
        const entryEl = row.querySelector('.reward-item-entry');
        const previewEl = row.querySelector('.ib-item-name-preview');
        if (entryEl) entryEl.value = Number(item.entry || 0) || '';
        const iconUrl = await fetchRewardItemIcon(item.entry);
        if (previewEl) {
            const qualityClass = `ib-item-name-preview ib-item-quality-${Number(item.quality || 0)}`;
            const iconMarkup = iconUrl ? `<span class="ib-item-inline-icon"><img src="${escapeHtml(iconUrl)}" alt="" style="width:100%;height:100%;object-fit:cover;"></span>` : '';
            previewEl.className = qualityClass;
            previewEl.innerHTML = `${iconMarkup}<span class="ib-item-inline-text">${escapeHtml(String(item.name || ''))}</span>`;
        }
        closeRewardItemSearchModal();
    }

    function clearRewardItemPreview(inputEl) {
        const row = inputEl.closest('.reward-item-row');
        if (!row) return;
        const previewEl = row.querySelector('.ib-item-name-preview');
        if (!previewEl) return;
        previewEl.textContent = '\uC544\uC774\uD15C\uC744 \uC120\uD0DD\uD558\uC138\uC694.';
        previewEl.className = 'ib-item-name-preview';
    }

    async function fetchRewardItemIcon(entry) {
        const parsed = Number(entry || 0);
        if (parsed <= 0) return '';
        try {
            const res = await fetch(`/api/external/item_icon?entry=${parsed}`, { credentials: 'include' });
            if (!res.ok) return '';
            const data = await res.json();
            return String(data.url || '').trim();
        } catch (e) {
            return '';
        }
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
        const box = document.getElementById('reward-items-box');
        box.innerHTML = '';
        (data?.items || []).forEach((item) => addRewardItemRow(item));
        if (!(data?.items || []).length) seedDefaultRewardRows();
        hydrateRewardItemPreviews();
    }

    function closeRewardForm() {
        toggleCrudView('rewards', 'list');
        state.rewardEditingId = null;
    }
    async function hydrateRewardItemPreviews() {
        const rows = [...document.querySelectorAll('.reward-item-row')];
        for (const row of rows) {
            const entryEl = row.querySelector('.reward-item-entry');
            const previewEl = row.querySelector('.ib-item-name-preview');
            if (!entryEl || !previewEl) continue;
            const entry = Number(entryEl.value || 0);
            if (entry <= 0) continue;
            const hasIcon = previewEl.querySelector('img');
            if (hasIcon) continue;
            const iconUrl = await fetchRewardItemIcon(entry);
            if (!iconUrl) continue;
            const current = previewEl.innerHTML || previewEl.textContent || '';
            if (!current.trim()) continue;
            const safeText = previewEl.querySelector('.ib-item-inline-text') ? previewEl.querySelector('.ib-item-inline-text').textContent : previewEl.textContent;
            previewEl.innerHTML = `<span class="ib-item-inline-icon"><img src="${escapeHtml(iconUrl)}" alt="" style="width:100%;height:100%;object-fit:cover;"></span><span class="ib-item-inline-text">${escapeHtml(safeText || '')}</span>`;
        }
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
                <td><div class="ib-actions"><button class="ib-btn ib-btn-ghost" onclick="instanceBonusApp.fetchReward(${row.reward_profile_id})">수정</button></div></td>
            </tr>`).join('') : '<tr><td colspan="8" class="ib-empty">등록된 보상 프로파일이 없습니다.</td></tr>';
        renderPagination('rewards-pagination', data.page || 1, data.total || 0, data.limit || 20, 'loadRewards');
    }

    async function fetchReward(id) {
        const data = await api(`/instance-bonus/reward-profiles/${id}`);
        openRewardForm(data);
    }

    function resetRunFilter() {
        ['runs-filter-map-id','runs-filter-mission-id','runs-filter-status','runs-filter-grade','runs-filter-llm','runs-filter-from','runs-filter-to','runs-filter-keyword'].forEach((id) => { const el = document.getElementById(id); if (el) el.value = ''; });
        state.runsPage = 1;
        loadRuns();
    }

    function resetDailyUsageFilter() {
        ['daily-usage-filter-date', 'daily-usage-filter-map-id', 'daily-usage-filter-guid', 'daily-usage-filter-keyword'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        state.dailyUsagePage = 1;
        loadDailyUsage();
    }

    async function loadDailyUsage(page = state.dailyUsagePage) {
        state.dailyUsagePage = page;
        const params = new URLSearchParams({ page: String(page), limit: '20' });
        [['usage_date', 'daily-usage-filter-date'], ['map_id', 'daily-usage-filter-map-id'], ['guid', 'daily-usage-filter-guid'], ['keyword', 'daily-usage-filter-keyword']].forEach(([key, id]) => {
            const value = document.getElementById(id)?.value.trim();
            if (value) params.set(key, value);
        });
        const data = await api(`/instance-bonus/daily-usage?${params.toString()}`);
        const body = document.getElementById('daily-usage-table');
        const notice = document.getElementById('daily-usage-notice');
        const limitedMaps = (state.mapsCache || []).filter((row) => Number(row.daily_limit_per_player || 0) > 0);
        if (notice) {
            if (!(data.items || []).length && limitedMaps.length === 0) {
                notice.style.display = 'block';
                notice.textContent = '현재 활성 던전과 레이드의 일일 제한 값이 모두 0(무제한)이라 사용량 기록이 쌓이지 않고 있습니다.';
            } else {
                notice.style.display = 'none';
                notice.textContent = '';
            }
        }
        body.innerHTML = (data.items || []).length ? data.items.map((row) => `
            <tr>
                <td>${escapeHtml(row.usage_date || '-')}</td>
                <td>${escapeHtml(row.map_name || `留?${row.map_id}`)}<div class="ib-help">ID ${row.map_id}</div></td>
                <td>${escapeHtml(row.character_name || '-')}</td>
                <td>${row.guid || 0}</td>
                <td>${row.success_count || 0}</td>
                <td>${escapeHtml(row.updated_at || '-')}</td>
                <td><button class="ib-btn ib-btn-danger" onclick='instanceBonusApp.resetDailyUsage(${JSON.stringify(row.usage_date || "")}, ${Number(row.map_id || 0)}, ${Number(row.guid || 0)}, ${JSON.stringify(row.character_name || "-")})'>초기화</button></td>
            </tr>`).join('') : '<tr><td colspan="7" class="ib-empty">조회된 일일 사용량이 없습니다.</td></tr>';
        renderPagination('daily-usage-pagination', data.page || 1, data.total || 0, data.limit || 20, 'loadDailyUsage');
    }

    async function resetDailyUsage(usageDate, mapId, guid, characterName) {
        if (!confirm(`${characterName}의 ${usageDate} 사용량 기록을 초기화하시겠습니까?`)) return;
        await api('/instance-bonus/daily-usage/reset', {
            method: 'POST',
            body: JSON.stringify({ usage_date: usageDate, map_id: Number(mapId), guid: Number(guid) })
        });
        loadDailyUsage(state.dailyUsagePage);
    }

    async function loadRuns(page = state.runsPage) {
        state.runsPage = page;
        const params = new URLSearchParams({ page: String(page), limit: '20' });
        [['map_id','runs-filter-map-id'],['mission_id','runs-filter-mission-id'],['status','runs-filter-status'],['grade','runs-filter-grade'],['llm_used','runs-filter-llm'],['started_from','runs-filter-from'],['started_to','runs-filter-to'],['keyword','runs-filter-keyword']].forEach(([key,id]) => {
            const value = document.getElementById(id)?.value.trim();
            if (value) params.set(key, value);
        });
        const data = await api(`/instance-bonus/runs?${params.toString()}`);
        const body = document.getElementById('runs-table');
        const notice = document.getElementById('runs-notice');
        const hasLegacyRows = (data.items || []).some((row) => row.source === 'legacy_live');
        if (notice) {
            if (hasLegacyRows) {
                notice.style.display = 'block';
                notice.textContent = '현재는 기존 실시간 미션 기록을 함께 표시하고 있습니다. 참가자, 투표, 보상, 이벤트, LLM 상세는 서버가 별도 로그 테이블에 기록해야 누적됩니다.';
            } else {
                notice.style.display = 'none';
                notice.textContent = '';
            }
        }
        body.innerHTML = (data.items || []).length ? data.items.map((row) => `
            <tr>
                <td>${row.run_id}</td><td>${escapeHtml(mapNameById(row.map_id))}<div class="ib-help">ID ${row.map_id}</div></td><td>${escapeHtml(row.mission_name || '-')}</td>
                <td>${escapeHtml(row.status || '-')} ${row.source === 'legacy_live' ? '<div class="ib-help">기존 실시간 기록</div>' : ''}</td><td>${escapeHtml(row.grade || '-')}</td><td>${escapeHtml(row.started_at || '-')}</td><td>${escapeHtml(row.ended_at || '-')}</td>
                <td>${row.clear_time_sec || 0}</td><td>${row.deaths || 0}</td><td>${row.wipes || 0}</td><td>${row.score || 0}</td><td>${row.vote_yes || 0} / ${row.vote_no || 0}</td>
                <td><button class="ib-btn ib-btn-ghost" onclick="instanceBonusApp.loadRunDetail(${row.run_id})">상세</button></td>
            </tr>`).join('') : '<tr><td colspan="13" class="ib-empty">런 로그가 없습니다.</td></tr>';
        renderPagination('runs-pagination', data.page || 1, data.total || 0, data.limit || 20, 'loadRuns');
    }

    async function loadRunDetail(runId) {
        state.currentRunId = runId;
        state.currentRunTab = 'overview';
        state.currentRunMeta = null;
        document.querySelectorAll('.ib-subtabs .ib-tab').forEach((el) => el.classList.toggle('active', el.dataset.runTab === 'overview'));
        document.getElementById('run-detail-card').style.display = 'block';
        document.getElementById('run-detail-title').textContent = `런 상세 #${runId}`;
        await loadRunDetailTab(runId, 'overview');
    }

    async function loadRunDetailTab(runId, tab) {
        const body = document.getElementById('run-detail-body');
        if (tab === 'overview') {
            const row = await api(`/instance-bonus/runs/${runId}`);
            state.currentRunMeta = row;
            body.innerHTML = `<div class="ib-detail-grid">${[
                ['기록 번호', row.run_id], ['던전/레이드', mapNameById(row.map_id)], ['미션', row.mission_name || '-'],
                ['기록 출처', row.source === 'legacy_live' ? '기존 실시간 미션 기록' : '상세 로그'],
                ['상태', row.status || '-'], ['등급', row.grade || '-'], ['시작 시각', row.started_at || '-'], ['종료 시각', row.ended_at || '-'],
                ['클리어 시간(초)', row.clear_time_sec || 0], ['사망 수', row.deaths || 0], ['전멸 수', row.wipes || 0], ['점수', row.score || 0],
                ['찬성 수', row.vote_yes || 0], ['반대 수', row.vote_no || 0], ['LLM 사용', row.llm_used ? '예' : '아니오'], ['대체 선택 사용', row.fallback_used ? '예' : '아니오'], ['실패 사유', row.failure_reason || '-']
            ].map(([k, v]) => `<div class="ib-detail-row"><div class="ib-kv"><strong>${escapeHtml(k)}</strong><span>${escapeHtml(v)}</span></div></div>`).join('')}</div>`;
            return;
        }
        if (state.currentRunMeta?.source === 'legacy_live') {
            body.innerHTML = '<div class="ib-empty">현재 선택한 기록은 기존 실시간 미션 기록입니다. 이 구조에서는 참가자, 투표, 보상, 이벤트, LLM 상세 로그가 별도 테이블에 저장되지 않아 표시할 수 없습니다.</div>';
            return;
        }
        const map = { members: 'members', votes: 'votes', rewards: 'rewards', events: 'events', llm: 'llm' };
        const items = await api(`/instance-bonus/runs/${runId}/${map[tab]}`);
        const tableConfigs = {
            members: [
                { key: 'member_id', label: '참가 번호' },
                { key: 'character_guid', label: '캐릭터 번호' },
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
                { key: 'character_guid', label: '캐릭터 번호' },
                { key: 'character_name', label: '캐릭터명' },
                { key: 'vote_value', label: '투표 결과' },
                { key: 'voted_at', label: '투표 시각' }
            ],
            rewards: [
                { key: 'reward_log_id', label: '보상 기록 번호' },
                { key: 'character_guid', label: '캐릭터 번호' },
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
                { key: 'event_data', label: '추가 데이터' },
                { key: 'created_at', label: '생성 시각' }
            ],
            llm: [
                { key: 'llm_log_id', label: 'LLM 기록 번호' },
                { key: 'candidate_mission', label: '후보 미션' },
                { key: 'selected_mission', label: '선택 미션' },
                { key: 'fallback_used', label: '대체 선택 사용', render: (row) => row.fallback_used ? '예' : '아니오' },
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
        applyTabState();
        applyCrudStates();
        switch (state.currentTab) {
            case 'dashboard': return loadDashboard();
            case 'maps': return loadMaps();
            case 'missions': return loadMissions();
            case 'rewards': return loadRewards();
            case 'daily-usage': return loadDailyUsage();
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
        seedDefaultRewardRows,
        refreshRewardGradeLabel,
        openRewardItemSearchModal,
        closeRewardItemSearchModal,
        clearRewardItemPreview,
        loadDailyUsage,
        resetDailyUsageFilter,
        resetDailyUsage,
        loadRuns,
        resetRunFilter,
        loadRunDetail,
        loadRunDetailTab
    };
})();

document.addEventListener('DOMContentLoaded', () => {
    ItemPicker.init();
    instanceBonusApp.init();
});





