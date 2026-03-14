(function () {
    const ICON_POOL = [
        "inv_sword_04", "inv_sword_27", "inv_axe_17", "inv_mace_01", "inv_hammer_09",
        "inv_shield_06", "inv_helmet_06", "inv_chest_plate04", "inv_boots_plate_03", "inv_gauntlets_29",
        "inv_jewelry_ring_55", "inv_misc_gem_bloodstone_02", "inv_misc_gem_pearl_04", "inv_misc_gem_sapphire_02", "inv_misc_gem_emerald_02",
        "inv_potion_83", "inv_potion_54", "inv_scroll_07", "inv_scroll_02", "inv_misc_book_11",
        "spell_holy_borrowedtime", "spell_holy_powerwordshield", "spell_frost_frostnova", "spell_shadow_rainoffire", "spell_nature_lightning",
        "ability_warrior_defensivestance", "ability_rogue_eviscerate", "ability_hunter_bestialdiscipline", "ability_druid_travel_form", "ability_mage_firestarter",
        "ability_paladin_beaconoflight", "ability_shaman_heroism", "ability_warlock_everlastingaffliction", "ability_deathknight_brittlebones", "achievement_boss_lichking",
        "achievement_reputation_argentcrusader", "achievement_boss_kelthuzad_01", "achievement_boss_sapphiron_01", "inv_misc_cape_18", "inv_misc_herb_icecap"
    ];

    const REWARD_NAMES = [
        "냉기의 문장 상자", "리치왕의 징표", "왕관 보급품", "룬 강화 주문서", "원정대 보급 상자",
        "프로즌 오브 조각", "정복자의 휘장", "칼날의 인장", "전투 지원 토큰", "빛나는 얼음석"
    ];

    const RARITIES = [
        { id: "common", label: "일반", weight: 55 },
        { id: "rare", label: "희귀", weight: 28 },
        { id: "epic", label: "영웅", weight: 14 },
        { id: "legendary", label: "전설", weight: 3 }
    ];

    const PACK_IMAGE = "/img/pack.png";
    const PACK_BACK = "https://www.hearthcards.net/packs/images/card_back.png";
    const CARD_FRONT_BY_RARITY = {
        common: "/img/card/card1.png",
        uncommon: "/img/card/card2.png",
        rare: "/img/card/card3.png",
        legendary: "/img/card/card4.png"
    };
    const SOUND_PACK_LIFT = "https://www.hearthcards.net/packs/sounds/purchase_pack_lift_whoosh_1.ogg";
    const SOUND_PACK_DROP = "https://www.hearthcards.net/packs/sounds/purchase_pack_drop_impact_1.ogg";
    const SOUND_CARDDRAW_HOVER = "/carddraw/sounds/shop_hover.ogg";

    let activeTrackLevel = 0;
    let drawCount = 0;
    let selectedOpenCount = 1;
    let selectedCharacter = null;
    const obtainedItems = [];
    let cachedCharacters = [];
    let registeredRewardItems = [];
    let obtainedViewMode = "list";
    let carddrawHoverAudio = null;
    let lastCarddrawHoverSoundAt = 0;
    let carddrawHoverAudioReady = false;
    let carddrawHoverAudioPrimePromise = null;

    const RACE_ICON_MAP = {
        "1_0": "/img/icons/race_human_male.gif",
        "1_1": "/img/icons/race_human_female.gif",
        "2_0": "/img/icons/race_orc_male.gif",
        "2_1": "/img/icons/race_orc_female.gif",
        "3_0": "/img/icons/race_dwarf_male.gif",
        "3_1": "/img/icons/race_dwarf_female.gif",
        "4_0": "/img/icons/race_nightelf_male.gif",
        "4_1": "/img/icons/race_nightelf_female.gif",
        "5_0": "/img/icons/race_undead_male.gif",
        "5_1": "/img/icons/race_undead_female.gif",
        "6_0": "/img/icons/race_tauren_male.gif",
        "6_1": "/img/icons/race_tauren_female.gif",
        "7_0": "/img/icons/race_gnome_male.gif",
        "7_1": "/img/icons/race_gnome_female.gif",
        "8_0": "/img/icons/race_troll_male.gif",
        "8_1": "/img/icons/race_troll_female.gif",
        "10_0": "/img/icons/race_bloodelf_male.gif",
        "10_1": "/img/icons/race_bloodelf_female.gif",
        "11_0": "/img/icons/race_draenei_male.gif",
        "11_1": "/img/icons/race_draenei_female.gif"
    };

    function esc(v) {
        return String(v ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function shuffle(arr) {
        const out = arr.slice();
        for (let i = out.length - 1; i > 0; i -= 1) {
            const j = Math.floor(Math.random() * (i + 1));
            [out[i], out[j]] = [out[j], out[i]];
        }
        return out;
    }

    function pickRandomIcons(count) {
        const shuffled = shuffle(ICON_POOL);
        const out = [];
        for (let i = 0; i < count; i += 1) out.push(shuffled[i % shuffled.length]);
        return out;
    }

    function rollRarity() {
        const total = RARITIES.reduce((sum, r) => sum + r.weight, 0);
        let v = Math.random() * total;
        for (const r of RARITIES) {
            v -= r.weight;
            if (v <= 0) return r;
        }
        return RARITIES[0];
    }

    function buildIconUrl(iconName) {
        return `https://wow.zamimg.com/images/wow/icons/large/${iconName}.jpg`;
    }

    let g_carddrawTooltipEl = null;

    function ensureCarddrawTooltipEl() {
        if (g_carddrawTooltipEl && document.body.contains(g_carddrawTooltipEl)) return g_carddrawTooltipEl;
        const el = document.createElement("div");
        el.id = "carddraw-item-tooltip";
        el.style.position = "fixed";
        el.style.display = "none";
        el.style.zIndex = "20000";
        el.style.maxWidth = "340px";
        el.style.background = "rgba(9, 16, 30, 0.96)";
        el.style.border = "1px solid rgba(148, 163, 184, 0.35)";
        el.style.borderRadius = "10px";
        el.style.padding = "10px 12px";
        el.style.boxShadow = "0 12px 24px rgba(0,0,0,0.45)";
        el.style.color = "#e2e8f0";
        el.style.fontSize = "12px";
        el.style.lineHeight = "1.45";
        el.style.pointerEvents = "none";
        document.body.appendChild(el);
        g_carddrawTooltipEl = el;
        return el;
    }

    function positionCarddrawTooltip(ev) {
        const el = ensureCarddrawTooltipEl();
        const margin = 14;
        let x = (ev.clientX || 0) + margin;
        let y = (ev.clientY || 0) + margin;
        if (x + el.offsetWidth > window.innerWidth - 8) x = window.innerWidth - el.offsetWidth - 8;
        if (y + el.offsetHeight > window.innerHeight - 8) y = window.innerHeight - el.offsetHeight - 8;
        if (x < 8) x = 8;
        if (y < 8) y = 8;
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
    }

    function renderCarddrawTooltipHtml(data) {
        const stats = Array.isArray(data && data.stats) ? data.stats : [];
        const spells = Array.isArray(data && data.spells) ? data.spells : [];
        const quality = Number(data && data.quality || 0);
        const qColor = quality >= 4 ? "#a78bfa" : (quality >= 3 ? "#60a5fa" : (quality >= 2 ? "#34d399" : "#e2e8f0"));
        return `
            <div style="font-weight:700; color:${qColor}; margin-bottom:4px;">${esc(data && data.name ? data.name : "아이템")}</div>
            <div style="color:#94a3b8; margin-bottom:6px;">아이템 레벨 ${Number(data && data.item_level || 0)} / 요구 레벨 ${Number(data && data.required_level || 0)}</div>
            <div style="color:#cbd5e1; margin-bottom:6px;">${esc((data && data.class_name) || "")} ${esc((data && data.subclass_name) || "")}</div>
            ${stats.length ? `<div style="margin-top:4px;">${stats.map(s => `<div>${esc(s)}</div>`).join("")}</div>` : ""}
            ${spells.length ? `<div style="margin-top:6px; color:#fef08a;">${spells.map(s => `<div>${esc(s)}</div>`).join("")}</div>` : ""}
        `;
    }

    window.showCarddrawItemTooltip = async function (ev, itemEntry) {
        const entry = Number(itemEntry || 0);
        if (entry <= 0) return;
        const el = ensureCarddrawTooltipEl();
        el.style.display = "block";
        el.innerHTML = '<div style="color:#93c5fd;">아이템 정보를 불러오는 중...</div>';
        positionCarddrawTooltip(ev);
        try {
            const res = await fetch(`/api/content/item/tooltip?entry=${entry}`, { cache: "no-store" });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data || data.status !== "success") throw new Error("tooltip");
            el.innerHTML = renderCarddrawTooltipHtml(data);
            positionCarddrawTooltip(ev);
        } catch (_) {
            el.innerHTML = '<div style="color:#fca5a5;">아이템 정보를 불러오지 못했습니다.</div>';
            positionCarddrawTooltip(ev);
        }
    };

    window.moveCarddrawItemTooltip = function (ev) {
        if (!g_carddrawTooltipEl || g_carddrawTooltipEl.style.display === "none") return;
        positionCarddrawTooltip(ev);
    };

    window.hideCarddrawItemTooltip = function () {
        if (!g_carddrawTooltipEl) return;
        g_carddrawTooltipEl.style.display = "none";
    };

    function wrapWithWowheadItemLink(entry, innerHtml, title = "") {
        const itemEntry = Number(entry || 0);
        const safeTitle = String(title || "").replace(/"/g, "&quot;");
        if (itemEntry <= 0) return innerHtml;
        return `<span title="${safeTitle}" data-item-entry="${itemEntry}" onmouseenter="showCarddrawItemTooltip(event, ${itemEntry})" onmousemove="moveCarddrawItemTooltip(event)" onmouseleave="hideCarddrawItemTooltip()" style="text-decoration:none; color:inherit; cursor:help;">${innerHtml}</span>`;
    }

    function clampOpenCount(value) {
        const parsed = Number(value || 1);
        if (!Number.isFinite(parsed)) return 1;
        return Math.max(1, Math.min(5, Math.floor(parsed)));
    }

    function getEffectiveOpenCount() {
        return clampOpenCount(selectedOpenCount);
    }

    function syncOpenCountButtons() {
        const current = getEffectiveOpenCount();
        const available = Math.max(0, Number(drawCount || 0));
        document.querySelectorAll(".carddraw-count-btn").forEach((btn) => {
            const value = clampOpenCount(btn.getAttribute("data-open-count"));
            btn.classList.toggle("active", value === current);
            btn.disabled = available > 0 ? value > available : false;
        });
    }

    window.setCarddrawOpenCount = function (count) {
        const next = clampOpenCount(count);
        const available = Math.max(0, Number(drawCount || 0));
        if (available > 0 && next > available) {
            selectedOpenCount = clampOpenCount(Math.min(available, 5));
        } else {
            selectedOpenCount = next;
        }
        syncOpenCountButtons();
    };

    function refreshWowheadTooltips() {}

    async function resolveIconUrlByEntry(entry) {
        const itemEntry = Number(entry || 0);
        if (itemEntry <= 0) return "";
        try {
            const res = await fetch(`/api/external/item_icon?entry=${itemEntry}`);
            if (!res.ok) return "";
            const data = await res.json().catch(() => ({}));
            return String(data && data.url ? data.url : "").trim();
        } catch (_) {
            return "";
        }
    }

    function showCarddrawNotice(message, title = "알림") {
        const modal = document.getElementById("carddraw-notice-modal");
        const titleEl = document.getElementById("carddraw-notice-title");
        const messageEl = document.getElementById("carddraw-notice-message");
        const confirmBtn = document.getElementById("carddraw-notice-confirm");
        if (!modal || !messageEl || !confirmBtn) {
            window.alert(String(message || ""));
            return Promise.resolve();
        }
        if (titleEl) titleEl.textContent = String(title || "알림");
        messageEl.textContent = String(message || "");
        modal.style.display = "flex";
        return new Promise((resolve) => {
            const close = () => {
                modal.style.display = "none";
                confirmBtn.removeEventListener("click", onConfirm);
                window.removeEventListener("keydown", onEsc);
                resolve();
            };
            const onConfirm = () => close();
            const onEsc = (ev) => {
                if (ev.key === "Escape") close();
            };
            confirmBtn.addEventListener("click", onConfirm);
            window.addEventListener("keydown", onEsc);
        });
    }

    function createTrackData() {
        const icons = pickRandomIcons(30);
        const rows = [];
        for (let i = 1; i <= 30; i += 1) {
            const rewardName = REWARD_NAMES[(i - 1) % REWARD_NAMES.length];
            const rarity = rollRarity();
            rows.push({
                level: i,
                title: `${rewardName} ${i}단계`,
                description: `${rewardName} 보상 아이템`,
                icon: icons[i - 1],
                rarity: rarity.id,
                rarityLabel: rarity.label,
                opened: false
            });
        }
        return rows;
    }

    const tracks = createTrackData();

    function primeCarddrawHoverAudio() {
        if (!carddrawHoverAudio) return Promise.resolve();
        if (carddrawHoverAudioReady) return Promise.resolve();
        if (carddrawHoverAudioPrimePromise) return carddrawHoverAudioPrimePromise;

        carddrawHoverAudioPrimePromise = new Promise((resolve) => {
            let done = false;
            const finish = () => {
                if (done) return;
                done = true;
                carddrawHoverAudioReady = true;
                resolve();
            };
            const onReady = () => {
                carddrawHoverAudio.removeEventListener("canplaythrough", onReady);
                carddrawHoverAudio.removeEventListener("loadeddata", onReady);
                finish();
            };
            carddrawHoverAudio.addEventListener("canplaythrough", onReady, { once: true });
            carddrawHoverAudio.addEventListener("loadeddata", onReady, { once: true });
            try {
                carddrawHoverAudio.load();
            } catch (_) {
                finish();
            }
            setTimeout(finish, 1200);
        });
        return carddrawHoverAudioPrimePromise;
    }

    function renderObtainedListTable() {
        const tbody = document.getElementById("obtained-items-body");
        if (!tbody) return;
        if (!obtainedItems.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" class="obtained-empty">획득한 아이템이 없습니다.</td>
                </tr>
            `;
            return;
        }
        tbody.innerHTML = obtainedItems.map((row, idx) => `
            <tr>
                <td>${obtainedItems.length - idx}</td>
                <td class="obtained-item-name">
                    ${wrapWithWowheadItemLink(
                        row.itemEntry,
                        `<img src="${esc(row.iconUrl)}" alt="" class="obtained-icon"><span>${esc(row.title)}</span>`,
                        row.title
                    )}
                </td>
                <td>${esc(row.rarityLabel)}</td>
                <td>${esc(row.obtainedAt)}</td>
            </tr>
        `).join("");
        refreshWowheadTooltips();
    }

    function renderObtainedSummaryTable() {
        const tbody = document.getElementById("obtained-summary-body");
        if (!tbody) return;
        if (!obtainedItems.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" class="obtained-empty">획득한 아이템이 없습니다.</td>
                </tr>
            `;
            return;
        }

        const groupedMap = new Map();
        obtainedItems.forEach((row) => {
            const key = Number(row.itemEntry || 0) > 0 ? `entry:${Number(row.itemEntry || 0)}` : `name:${String(row.title || "")}`;
            if (!groupedMap.has(key)) {
                groupedMap.set(key, {
                    title: String(row.title || "알 수 없는 아이템"),
                    iconUrl: row.iconUrl || buildIconUrl("inv_misc_questionmark"),
                    itemEntry: Number(row.itemEntry || 0),
                    count: 0,
                    lastObtainedAt: row.obtainedAt || ""
                });
            }
            const g = groupedMap.get(key);
            g.count += 1;
        });

        const grouped = Array.from(groupedMap.values()).sort((a, b) => {
            if (b.count !== a.count) return b.count - a.count;
            return String(a.title || "").localeCompare(String(b.title || ""), "ko");
        });

        tbody.innerHTML = grouped.map((row, idx) => `
            <tr>
                <td>${idx + 1}</td>
                <td class="obtained-item-name">
                    ${wrapWithWowheadItemLink(
                        row.itemEntry,
                        `<img src="${esc(row.iconUrl)}" alt="" class="obtained-icon"><span>${esc(row.title)}</span>`,
                        row.title
                    )}
                </td>
                <td>${Number(row.count || 0)}개</td>
                <td>${esc(row.lastObtainedAt || "-")}</td>
            </tr>
        `).join("");
        refreshWowheadTooltips();
    }

    function applyObtainedViewMode() {
        const listWrap = document.getElementById("obtained-list-wrap");
        const summaryWrap = document.getElementById("obtained-summary-wrap");
        const listTab = document.getElementById("obtained-tab-list");
        const summaryTab = document.getElementById("obtained-tab-summary");
        const showList = obtainedViewMode !== "summary";
        if (listWrap) listWrap.style.display = showList ? "" : "none";
        if (summaryWrap) summaryWrap.style.display = showList ? "none" : "";
        if (listTab) listTab.classList.toggle("active", showList);
        if (summaryTab) summaryTab.classList.toggle("active", !showList);
    }

    function renderObtainedViews() {
        renderObtainedListTable();
        renderObtainedSummaryTable();
        applyObtainedViewMode();
    }

    function renderRegisteredItemListModal(items) {
        const bodyEl = document.getElementById("obtained-list-body");
        if (!bodyEl) return;
        if (!Array.isArray(items) || !items.length) {
            bodyEl.innerHTML = `<p class="char-picker-empty">등록된 카드뽑기 품목이 없습니다.</p>`;
            return;
        }
        bodyEl.innerHTML = items.map((row) => {
            const entry = Number(row && row.itemEntry ? row.itemEntry : 0);
            const name = String(row && row.name ? row.name : "").trim() || "알 수 없는 아이템";
            const rarityLabel = String(row && row.rarityLabel ? row.rarityLabel : "일반").trim() || "일반";
            const iconUrl = String(row && row.iconUrl ? row.iconUrl : "").trim() || buildIconUrl("inv_misc_questionmark");
            const nameHtml = wrapWithWowheadItemLink(entry, `<span class="obtained-list-item-name">${esc(name)}</span>`, name);
            return `
                <div class="obtained-list-item">
                    <img class="obtained-list-item-icon" data-entry="${entry}" src="${esc(iconUrl)}" alt="${esc(name)}">
                    <div>
                        ${nameHtml}
                        <div class="obtained-list-item-meta">아이템 ID: ${entry > 0 ? entry : "-"}</div>
                    </div>
                    <span class="obtained-list-rarity">${esc(rarityLabel)}</span>
                </div>
            `;
        }).join("");
        bodyEl.querySelectorAll(".obtained-list-item-icon").forEach((imgEl) => {
            const current = String(imgEl.getAttribute("src") || "").toLowerCase();
            const entry = Number(imgEl.getAttribute("data-entry") || 0);
            if (entry <= 0) return;
            if (!current.includes("inv_misc_questionmark")) return;
            resolveIconUrlByEntry(entry).then((url) => {
                if (!url) return;
                imgEl.setAttribute("src", url);
            });
        });
        refreshWowheadTooltips();
    }

    async function loadRegisteredItemListModal() {
        const bodyEl = document.getElementById("obtained-list-body");
        if (!bodyEl) return;
        bodyEl.innerHTML = `<p class="char-picker-empty">등록된 아이템을 불러오는 중입니다.</p>`;
        try {
            const res = await fetch("/api/carddraw/pool/list", {
                method: "GET",
                credentials: "same-origin",
                cache: "no-store"
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data || data.status !== "success" || !Array.isArray(data.items)) {
                throw new Error((data && data.message) || "목록을 불러오지 못했습니다.");
            }
            registeredRewardItems = data.items;
            renderRegisteredItemListModal(registeredRewardItems);
        } catch (e) {
            bodyEl.innerHTML = `<p class="char-picker-empty">${esc((e && e.message) || "목록을 불러오지 못했습니다.")}</p>`;
        }
    }

    function addObtainedItem(item) {
        const fallbackName = "알 수 없는 아이템";
        const resolvedName = String(item.itemName || item.title || "").trim() || fallbackName;
        obtainedItems.unshift({
            title: resolvedName,
            iconUrl: item.iconUrl || buildIconUrl("inv_misc_questionmark"),
            itemEntry: Number(item.itemEntry || 0),
            rarityLabel: item.rarityLabel,
            obtainedAt: new Date().toLocaleString("ko-KR")
        });
        renderObtainedViews();
    }

    function getRaceIcon(race, gender) {
        const key = `${Number(race || 0)}_${Number(gender || 0)}`;
        return RACE_ICON_MAP[key] || "/img/icons/race_human_male.gif";
    }

    function updateMainCharacterUI(character) {
        const nameEl = document.getElementById("main-char-name");
        const iconEl = document.getElementById("main-char-race-icon");
        selectedCharacter = character && character.guid ? character : null;
        if (nameEl) {
            nameEl.textContent = selectedCharacter && selectedCharacter.name
                ? selectedCharacter.name
                : "대표 캐릭터 미선택";
        }
        if (iconEl) {
            iconEl.src = getRaceIcon(
                selectedCharacter ? selectedCharacter.race : 1,
                selectedCharacter ? selectedCharacter.gender : 0
            );
        }
    }

    async function openNextPack(openCount) {
        const unopened = tracks.find((t) => !t.opened);
        const target = unopened || tracks[Math.floor(Math.random() * tracks.length)];
        if (!target) return;
        if (unopened) {
            await window.openRewardModal(unopened.level, openCount);
            return;
        }
        await window.openRewardModal(target.level, openCount);
    }

    function refreshSummary() {
        const drawAvailableEl = document.getElementById("draw-available-count");
        if (drawAvailableEl) drawAvailableEl.textContent = String(Math.max(0, Number(drawCount || 0)));
        if (Number(drawCount || 0) <= 0) {
            selectedOpenCount = 1;
        } else if (selectedOpenCount > drawCount) {
            selectedOpenCount = clampOpenCount(drawCount);
        }
        syncOpenCountButtons();
    }

    async function loadCardDrawState() {
        try {
            const res = await fetch("/api/carddraw/state", {
                method: "GET",
                credentials: "same-origin",
                cache: "no-store"
            });
            if (!res.ok) throw new Error("status");
            const data = await res.json();
            drawCount = Number(data && data.drawCount ? data.drawCount : 0);
            const stateChar = data && data.selectedCharacter ? data.selectedCharacter : null;
            if (stateChar && Number(stateChar.guid || 0) > 0 && String(stateChar.name || "").trim() !== "") {
                updateMainCharacterUI(stateChar);
            } else {
                await initDefaultCharacterFromHomeStatus();
            }
            refreshSummary();
            return true;
        } catch (_) {
            await initDefaultCharacterFromHomeStatus();
            refreshSummary();
            return false;
        }
    }

    async function checkCardDrawWorldStatus() {
        try {
            const res = await fetch("/api/carddraw/world-status", {
                method: "GET",
                credentials: "same-origin",
                cache: "no-store"
            });
            const data = await res.json().catch(() => ({}));
            return !!(res.ok && data && data.status === "success" && data.world_running === true);
        } catch (_) {
            return false;
        }
    }

    async function initDefaultCharacterFromHomeStatus() {
        try {
            const statusRes = await fetch("/api/user/status");
            const statusData = await statusRes.json().catch(() => ({}));
            const homeChar = statusData && statusData.mainCharacter ? statusData.mainCharacter : null;
            if (!statusRes.ok || !homeChar || Number(homeChar.guid || 0) <= 0 || String(homeChar.name || "").trim() === "") {
                updateMainCharacterUI(null);
                return;
            }

            // 카드뽑기 선택 캐릭터가 비어있는 경우에만 홈 대표캐릭터를 기본값으로 동기화
            try {
                await fetch("/api/carddraw/character/select", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ guid: Number(homeChar.guid) })
                });
            } catch (_) {
                // 저장 실패여도 화면에는 홈 대표캐릭터를 우선 표시
            }

            updateMainCharacterUI({
                guid: Number(homeChar.guid),
                name: homeChar.name,
                race: Number(homeChar.race || 0),
                class: Number(homeChar.class || 0),
                gender: Number(homeChar.gender || 0),
                level: Number(homeChar.level || 0)
            });
        } catch (_) {
            updateMainCharacterUI(null);
        }
    }

    async function requestDraw(track, rewards) {
        const rewardRows = Array.isArray(rewards) ? rewards.filter(Boolean) : [];
        const consumeCount = clampOpenCount(rewardRows.length || 1);
        try {
            const res = await fetch("/api/carddraw/draw", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    trackLevel: Number(track && track.level ? track.level : 1),
                    drawCount: consumeCount,
                    rewards: rewardRows.map((reward) => ({
                        rewardEntry: Number(reward && reward.itemEntry ? reward.itemEntry : 0),
                        rewardName: reward && reward.title ? reward.title : "",
                        rewardIcon: reward && reward.icon ? reward.icon : "",
                        rewardRarity: reward && reward.rarityLabel ? reward.rarityLabel : "일반"
                    }))
                })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || (data && data.status !== "success")) {
                await showCarddrawNotice((data && data.message) || "카드 뽑기에 실패했습니다.", "카드 뽑기");
                return false;
            }
            drawCount = Number(data && data.drawCount ? data.drawCount : drawCount);
            if (data && data.selectedCharacter) updateMainCharacterUI(data.selectedCharacter);
            refreshSummary();
            return true;
        } catch (_) {
            await showCarddrawNotice("카드 뽑기에 실패했습니다.", "카드 뽑기");
            return false;
        }
    }

    async function loadCharactersForPicker() {
        const bodyEl = document.getElementById("char-picker-body");
        if (!bodyEl) return;
        bodyEl.innerHTML = `<p class="char-picker-empty">캐릭터 목록을 불러오는 중입니다.</p>`;
        try {
            let list = [];
            const res = await fetch("/api/carddraw/characters");
            const data = await res.json().catch(() => ({}));
            if (res.ok && data && data.status === "success" && Array.isArray(data.characters)) {
                list = data.characters;
            } else {
                const fallbackRes = await fetch("/api/user/characters");
                const fallbackData = await fallbackRes.json().catch(() => ([]));
                if (!fallbackRes.ok) throw new Error("list");
                if (Array.isArray(fallbackData)) {
                    list = fallbackData;
                } else if (fallbackData && Array.isArray(fallbackData.characters)) {
                    list = fallbackData.characters;
                }
            }
            cachedCharacters = list;
            if (!list.length) {
                bodyEl.innerHTML = `<p class="char-picker-empty">보유 캐릭터가 없습니다.</p>`;
                return;
            }
            const currentGuid = Number(selectedCharacter && selectedCharacter.guid ? selectedCharacter.guid : 0);
            bodyEl.innerHTML = list.map((c) => `
                <button type="button" class="char-picker-item ${Number(c.guid) === currentGuid ? "active" : ""}" data-guid="${Number(c.guid)}">
                    <img src="${esc(getRaceIcon(c.race, c.gender))}" alt="">
                    <span>
                        <span class="char-picker-item-name">${esc(c.name)}</span>
                        <span class="char-picker-item-meta">Lv.${Number(c.level || 0)} · 종족 ${Number(c.race || 0)} · 직업 ${Number(c.class || 0)}</span>
                    </span>
                </button>
            `).join("");
            bodyEl.querySelectorAll(".char-picker-item").forEach((btn) => {
                btn.addEventListener("click", async () => {
                    const guid = Number(btn.getAttribute("data-guid") || 0);
                    if (guid <= 0) return;
                    await selectCharacter(guid);
                });
            });
        } catch (_) {
            bodyEl.innerHTML = `<p class="char-picker-empty">캐릭터 목록을 불러오지 못했습니다.</p>`;
        }
    }

    async function selectCharacter(guid) {
        try {
            const res = await fetch("/api/carddraw/character/select", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ guid: Number(guid) })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data || data.status !== "success") {
                await showCarddrawNotice((data && data.message) || "캐릭터 선택에 실패했습니다.", "대표 캐릭터");
                return;
            }
            if (data.selectedCharacter) updateMainCharacterUI(data.selectedCharacter);
            window.closeCharacterPickerModal();
        } catch (_) {
            await showCarddrawNotice("캐릭터 선택에 실패했습니다.", "대표 캐릭터");
        }
    }

    function mapPoolRarityCode(code) {
        const c = String(code || "").toLowerCase();
        if (c === "legendary") return "legendary";
        if (c === "rare") return "rare";
        if (c === "uncommon") return "uncommon";
        return "common";
    }

    function getCardFrontByRarity(rarityCode) {
        const code = String(rarityCode || "").toLowerCase();
        return CARD_FRONT_BY_RARITY[code] || CARD_FRONT_BY_RARITY.common;
    }

    function mapPoolRarityLabel(code, fallback) {
        const c = String(code || "").toLowerCase();
        if (c === "legendary") return "전설";
        if (c === "rare") return "레어";
        if (c === "uncommon") return "희귀";
        if (c === "common") return "일반";
        return fallback || "일반";
    }

    async function buildPackRewards(baseTrack, rewardCount) {
        const count = clampOpenCount(rewardCount);
        const res = await fetch(`/api/carddraw/pool/random?count=${count}`, {
            method: "GET",
            credentials: "same-origin",
            cache: "no-store"
        });
        const data = await res.json().catch(() => ({}));
        const rows = Array.isArray(data && data.rewards) ? data.rewards : [];
        if (!res.ok || !rows.length) {
            const message = String((data && data.message) || "카드뽑기 품목을 불러오지 못했습니다.");
            throw new Error(message);
        }
        const mapped = rows.map((row, idx) => {
            const entry = Number(row.itemEntry || row.item_entry || 0);
            const quantity = Math.max(1, Number(row.quantity || 1));
            const baseName = String(row.name || row.item_name || "").trim() || `알 수 없는 아이템 ${idx + 1}`;
            const name = quantity > 1 ? `${baseName} x${quantity}` : baseName;
            return ({
                level: Number(baseTrack && baseTrack.level ? baseTrack.level : 1),
                title: name,
                description: name,
                icon: String(row.icon || ""),
                iconUrl: "",
                rarity: mapPoolRarityCode(row.rarity),
                rarityLabel: mapPoolRarityLabel(row.rarity, row.rarityLabel),
                itemEntry: entry,
                quantity,
                opened: false
            });
        });
        const resolved = await Promise.all(mapped.map(async (item) => {
            const byEntry = await resolveIconUrlByEntry(item.itemEntry);
            if (byEntry) {
                item.iconUrl = byEntry;
                return item;
            }
            if (String(item.icon || "").trim()) {
                item.iconUrl = buildIconUrl(item.icon);
            } else {
                item.iconUrl = buildIconUrl("inv_misc_questionmark");
            }
            return item;
        }));
        return resolved;
    }

    function getPackCardPositions(count) {
        const key = clampOpenCount(count);
        const map = {
            1: [
                { x: 40, y: -100 }
            ],
            2: [
                { x: -78, y: -116 },
                { x: 156, y: -106 }
            ],
            3: [
                { x: 38, y: -250 },
                { x: -146, y: -6 },
                { x: 218, y: -2 }
            ],
            4: [
                { x: -82, y: -220 },
                { x: 158, y: -214 },
                { x: -76, y: 62 },
                { x: 164, y: 66 }
            ],
            5: [
                { x: 40, y: -285 },
                { x: -163, y: -215 },
                { x: 266, y: -212 },
                { x: -76, y: 70 },
                { x: 161, y: 81 }
            ]
        };
        return map[key] || map[1];
    }

    function renderPackScene(rewards) {
        const positions = getPackCardPositions(rewards.length);
        const cards = rewards.map((r, idx) => {
            const iconUrl = String(r.iconUrl || "").trim()
                || (String(r.icon || "").trim() ? buildIconUrl(r.icon) : buildIconUrl("inv_misc_questionmark"));
            const pos = positions[idx] || { x: 0, y: 0 };
            return `
                <button type="button" class="pack-card" data-card-index="${idx}" data-title="${esc(r.title)}" data-rarity="${esc(r.rarityLabel)}" data-track="${r.level}" data-entry="${Number(r.itemEntry || 0)}" data-icon="${esc(iconUrl)}" data-quantity="${Number(r.quantity || 1)}" style="--mx:${pos.x}px; --my:${pos.y}px;">
                    <div class="pack-card-inner">
                        <img class="pack-card-face pack-card-back" src="${PACK_BACK}" alt="card back">
                        <div class="pack-card-face pack-card-front rarity-${esc(r.rarity)}">
                            <img class="pack-card-front-frame" src="${getCardFrontByRarity(r.rarity)}" alt="card front">
                            <img class="pack-card-item-icon" data-entry="${Number(r.itemEntry || 0)}" src="${esc(iconUrl)}" alt="item icon">
                            <div class="pack-card-item-desc">${wrapWithWowheadItemLink(r.itemEntry, esc(r.title || r.description || "아이템"), r.title || r.description || "아이템")}</div>
                        </div>
                    </div>
                </button>
            `;
        }).join("");

        return `
            <div class="pack-open-scene" id="pack-open-scene">
                <video id="pack-glow-video" class="pack-glow-video" playsinline preload="auto" loop>
                    <source src="/img/class/glow_sequence.mp4" type="video/mp4">
                </video>
                <video id="deck_open_sequence" class="deck-open-video" playsinline preload="auto">
                    <source src="/img/class/deck_open_sequence_0.mp4" type="video/mp4">
                </video>
                <div class="pack-zone" id="pack-zone">
                    <div class="pack-drop-zone" id="pack-drop-zone" aria-hidden="true">
                        <div class="pack-drop-core"></div>
                    </div>
                    <div class="pack-drag-wrap" id="pack-drag-wrap">
                        <button type="button" class="pack-image" id="pack-image" aria-label="pack open">
                            <img src="${PACK_IMAGE}" alt="pack">
                        </button>
                    </div>
                </div>
                <div class="pack-cards" id="pack-cards" aria-hidden="true">
                    ${cards}
                </div>
            </div>
        `;
    }

    function initPackInteraction(stage, targetTrack, rewards) {
        const closeBtn = document.querySelector("#reward-modal .modal-close");
        const showCloseBtn = () => {
            if (!closeBtn) return;
            closeBtn.style.visibility = "visible";
            closeBtn.style.opacity = "1";
            closeBtn.style.pointerEvents = "auto";
        };
        const scene = stage.querySelector("#pack-open-scene");
        const glowVideo = stage.querySelector("#pack-glow-video");
        const deckOpenVideo = stage.querySelector("#deck_open_sequence");
        const packZone = stage.querySelector("#pack-zone");
        const dropZone = stage.querySelector("#pack-drop-zone");
        const dragWrap = stage.querySelector("#pack-drag-wrap");
        const packImage = stage.querySelector("#pack-image");
        const cardsWrap = stage.querySelector("#pack-cards");
        const cards = Array.from(stage.querySelectorAll(".pack-card"));
        if (!scene || !packZone || !dropZone || !dragWrap || !packImage || !cardsWrap || !cards.length) return;

        // Fill icon URL by item entry when available (more accurate than static icon names).
        cards.forEach((card) => {
            const img = card.querySelector(".pack-card-item-icon");
            const entry = Number(card.dataset.entry || 0);
            if (!img || entry <= 0) return;
            resolveIconUrlByEntry(entry).then((url) => {
                if (!url) return;
                img.src = url;
                card.dataset.icon = url;
            });
        });
        refreshWowheadTooltips();

        const audioPackLift = new Audio(SOUND_PACK_LIFT);
        const audioPackDrop = new Audio(SOUND_PACK_DROP);
        audioPackLift.preload = "auto";
        audioPackDrop.preload = "auto";
        audioPackLift.volume = 1;
        audioPackDrop.volume = 1;

        const enterThresholdPx = 92;
        const exitThresholdPx = 140;
        let packOpened = false;
        let openingInProgress = false;
        let dragging = false;
        let inHomeRange = false;
        let startX = 0;
        let startY = 0;
        let tx = 0;
        let ty = 0;
        let pointerId = null;

        function setTransform() {
            dragWrap.style.transform = `translate(${tx}px, calc(-50% + ${ty}px))`;
        }

        function getCenter(rect) {
            return {
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2
            };
        }

        function getDropDelta() {
            const packCenter = getCenter(dragWrap.getBoundingClientRect());
            const zoneCenter = getCenter(dropZone.getBoundingClientRect());
            const dx = zoneCenter.x - packCenter.x;
            const dy = zoneCenter.y - packCenter.y;
            const distance = Math.hypot(dx, dy);
            return {
                distance,
                dx,
                dy
            };
        }

        const enableCards = () => {
            cardsWrap.classList.add("show");
            cardsWrap.setAttribute("aria-hidden", "false");
            cards.forEach((card) => card.classList.add("ready"));
        };

        const playDeckSequence = () => {
            if (!deckOpenVideo) {
                enableCards();
                showCloseBtn();
                return;
            }
            let done = false;
            let preloaded = false;
            let preloadTimer = null;
            const finish = () => {
                if (done) return;
                done = true;
                if (preloadTimer) clearTimeout(preloadTimer);
                if (!preloaded) {
                    preloaded = true;
                    enableCards();
                }
                // Keep final frame visible after playback ends.
                showCloseBtn();
            };
            const preloadCards = () => {
                if (preloaded) return;
                preloaded = true;
                enableCards();
                showCloseBtn();
            };
            deckOpenVideo.classList.add("show");
            deckOpenVideo.currentTime = 0;
            deckOpenVideo.onended = finish;
            deckOpenVideo.ontimeupdate = () => {
                if (!Number.isFinite(deckOpenVideo.duration) || deckOpenVideo.duration <= 0) return;
                if (deckOpenVideo.currentTime >= Math.max(0, deckOpenVideo.duration - 2.0)) {
                    preloadCards();
                    deckOpenVideo.ontimeupdate = null;
                }
            };
            deckOpenVideo.play().then(() => {
                const durationMs = Number.isFinite(deckOpenVideo.duration) && deckOpenVideo.duration > 0
                    ? Math.ceil(deckOpenVideo.duration * 1000)
                    : 2600;
                const preloadAt = Math.max(200, durationMs - 1000);
                preloadTimer = setTimeout(preloadCards, preloadAt);
                setTimeout(finish, durationMs + 80);
            }).catch(() => {
                setTimeout(finish, 1200);
            });
        };

        async function openPackWithAnimation() {
            if (packOpened || openingInProgress) return;
            openingInProgress = true;
            const ok = await requestDraw(targetTrack, rewards);
            if (!ok) {
                openingInProgress = false;
                packZone.classList.remove("is-opened");
                dropZone.classList.remove("matched");
                scene.classList.remove("matched");
                tx = 0;
                ty = 0;
                setTransform();
                return;
            }
            packOpened = true;
            try {
                audioPackDrop.currentTime = 0;
                audioPackDrop.play().catch(() => {});
            } catch (_) {}
            dropZone.classList.add("matched");
            scene.classList.remove("near");
            scene.classList.add("matched");
            if (glowVideo) {
                try {
                    glowVideo.currentTime = 0;
                    glowVideo.play().catch(() => {});
                } catch (_) {}
            }
            packZone.classList.add("is-opened");
            if (targetTrack && !targetTrack.opened) targetTrack.opened = true;
            refreshSummary();
            playDeckSequence();
            openingInProgress = false;
        }

        function onPointerMove(ev) {
            if (!dragging || packOpened) return;
            if (pointerId !== null && ev.pointerId !== pointerId) return;
            tx = ev.clientX - startX;
            ty = ev.clientY - startY;
            setTransform();

            const delta = getDropDelta();
            if (inHomeRange) {
                if (delta.distance > exitThresholdPx) inHomeRange = false;
            } else if (delta.distance <= enterThresholdPx) {
                inHomeRange = true;
            }
            dropZone.classList.toggle("near", inHomeRange);
            scene.classList.toggle("near", inHomeRange);
            if (glowVideo && !packOpened) {
                if (dragging || inHomeRange) {
                    glowVideo.play().catch(() => {});
                } else {
                    glowVideo.pause();
                    glowVideo.currentTime = 0;
                }
            }
        }

        function onPointerUp(ev) {
            if (!dragging || packOpened) return;
            if (pointerId !== null && ev.pointerId !== pointerId) return;
            dragging = false;
            pointerId = null;
            dragWrap.classList.remove("dragging");
            packImage.classList.remove("dragging");
            scene.classList.remove("dragging");
            window.removeEventListener("pointermove", onPointerMove);
            window.removeEventListener("pointerup", onPointerUp);
            window.removeEventListener("pointercancel", onPointerUp);

            const { distance, dx, dy } = getDropDelta();
            const matched = distance <= enterThresholdPx;
            if (matched) {
                tx += dx;
                ty += dy;
                setTransform();
                dropZone.classList.remove("near");
                scene.classList.remove("near");
                inHomeRange = false;
                setTimeout(() => { void openPackWithAnimation(); }, 160);
                return;
            }

            tx = 0;
            ty = 0;
            setTransform();
            dropZone.classList.remove("near");
            scene.classList.remove("near");
            inHomeRange = false;
            if (glowVideo && !packOpened) {
                glowVideo.pause();
                glowVideo.currentTime = 0;
            }
        }

        const onPointerDown = (ev) => {
            if (packOpened) return;
            ev.preventDefault();
            try {
                audioPackLift.currentTime = 0;
                audioPackLift.play().catch(() => {});
            } catch (_) {}
            dragging = true;
            pointerId = ev.pointerId;
            startX = ev.clientX - tx;
            startY = ev.clientY - ty;
            dragWrap.classList.add("dragging");
            packImage.classList.add("dragging");
            scene.classList.add("dragging");
            if (glowVideo) {
                glowVideo.play().catch(() => {});
            }
            if (typeof packImage.setPointerCapture === "function") {
                try { packImage.setPointerCapture(ev.pointerId); } catch (_) {}
            }
            window.addEventListener("pointermove", onPointerMove);
            window.addEventListener("pointerup", onPointerUp);
            window.addEventListener("pointercancel", onPointerUp);
        };

        packImage.addEventListener("pointerdown", onPointerDown);
        dragWrap.addEventListener("pointerdown", onPointerDown);

        cards.forEach((card) => {
            card.addEventListener("click", () => {
                if (!cardsWrap.classList.contains("show")) return;
                if (card.classList.contains("revealed")) return;
                card.classList.add("revealed");
                const pickedTitle = String(card.dataset.title || "").trim();
                const pickedEntry = Number(card.dataset.entry || 0);
                addObtainedItem({
                    itemName: pickedTitle || "알 수 없는 아이템",
                    title: pickedTitle || "알 수 없는 아이템",
                    itemEntry: pickedEntry,
                    rarityLabel: card.dataset.rarity || "일반",
                    iconUrl: card.dataset.icon || ""
                });
                if (cards.every((v) => v.classList.contains("revealed"))) {
                    scene.classList.add("all-revealed");
                    showCloseBtn();
                }
            });
        });
    }

    window.openRewardModal = async function (level, openCount) {
        const t = tracks.find((row) => row.level === Number(level));
        if (!t) return;
        activeTrackLevel = t.level;
        const rewardCount = clampOpenCount(openCount || selectedOpenCount);

        const modal = document.getElementById("reward-modal");
        const stage = document.getElementById("reveal-stage");
        if (!modal || !stage) return;
        const closeBtn = modal.querySelector(".modal-close");
        if (closeBtn) {
            closeBtn.style.visibility = "visible";
            closeBtn.style.opacity = "1";
            closeBtn.style.pointerEvents = "auto";
        }

        modal.style.display = "flex";
        stage.innerHTML = `<div style="height:100%; display:flex; align-items:center; justify-content:center; color:#cbd5e1;">보상 정보를 불러오는 중...</div>`;
        try {
            const rewards = await buildPackRewards(t, rewardCount);
            stage.innerHTML = renderPackScene(rewards);
            initPackInteraction(stage, t, rewards);
        } catch (e) {
            window.closeRewardModal();
            await showCarddrawNotice((e && e.message) || "카드뽑기 품목을 불러오지 못했습니다.", "카드 뽑기");
            return;
        }
    };

    window.closeRewardModal = function () {
        const modal = document.getElementById("reward-modal");
        const stage = document.getElementById("reveal-stage");
        const closeBtn = modal ? modal.querySelector(".modal-close") : null;
        if (stage) stage.innerHTML = "";
        if (modal) modal.style.display = "none";
        if (closeBtn) {
            closeBtn.style.visibility = "visible";
            closeBtn.style.opacity = "1";
            closeBtn.style.pointerEvents = "auto";
        }
        activeTrackLevel = 0;
    };

    window.applyCardEdit = function () {
        void activeTrackLevel;
    };

    window.scrollToTrack = function () {
        const el = document.getElementById("track-area");
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    window.setObtainedViewMode = function (mode) {
        obtainedViewMode = String(mode || "").toLowerCase() === "summary" ? "summary" : "list";
        applyObtainedViewMode();
    };

    window.openObtainedListModal = function () {
        const modal = document.getElementById("obtained-list-modal");
        if (!modal) return;
        modal.style.display = "flex";
        void loadRegisteredItemListModal();
    };

    window.closeObtainedListModal = function () {
        const modal = document.getElementById("obtained-list-modal");
        if (modal) modal.style.display = "none";
    };

    window.openFirstTrack = async function () {
        const worldRunning = await checkCardDrawWorldStatus();
        if (!worldRunning) {
            await showCarddrawNotice("월드서버가 가동 중이 아닙니다. 서버 가동 후 카드뽑기가 가능합니다.", "경고");
            return;
        }
        await loadCardDrawState();
        if (Number(drawCount || 0) <= 0) {
            await showCarddrawNotice("카드 뽑기 가능 횟수가 없어 카드 뽑기가 불가능 합니다.", "경고");
            return;
        }
        const openCount = getEffectiveOpenCount();
        if (openCount > Number(drawCount || 0)) {
            await showCarddrawNotice(`선택한 카드 오픈 수량(${openCount}회)보다 보유 횟수가 부족합니다.`, "경고");
            return;
        }
        await openNextPack(openCount);
    };

    window.openCharacterPickerModal = function () {
        const modal = document.getElementById("char-picker-modal");
        if (!modal) return;
        modal.style.display = "flex";
        loadCharactersForPicker();
    };

    window.closeCharacterPickerModal = function () {
        const modal = document.getElementById("char-picker-modal");
        if (modal) modal.style.display = "none";
    };

    document.addEventListener("DOMContentLoaded", () => {
        renderObtainedViews();
        loadCardDrawState();
        syncOpenCountButtons();

        carddrawHoverAudio = new Audio(SOUND_CARDDRAW_HOVER);
        carddrawHoverAudio.preload = "auto";
        carddrawHoverAudio.volume = 0.75;
        carddrawHoverAudio.loop = false;
        void primeCarddrawHoverAudio();

        const drawBtn = document.querySelector(".hero-side-btn-main");
        if (drawBtn) {
            drawBtn.addEventListener("mouseenter", async () => {
                if (!carddrawHoverAudio) return;
                await primeCarddrawHoverAudio();
                const now = Date.now();
                if (now - lastCarddrawHoverSoundAt < 120) return;
                lastCarddrawHoverSoundAt = now;
                try {
                    carddrawHoverAudio.currentTime = 0;
                    carddrawHoverAudio.play().catch(() => {});
                } catch (_) {}
            });
        }

        const modal = document.getElementById("reward-modal");
        if (modal) {
            modal.addEventListener("click", (ev) => {
                if (ev.target === modal) window.closeRewardModal();
            });
        }

        const pickerModal = document.getElementById("char-picker-modal");
        if (pickerModal) {
            pickerModal.addEventListener("click", (ev) => {
                if (ev.target === pickerModal) window.closeCharacterPickerModal();
            });
        }

        const obtainedListModal = document.getElementById("obtained-list-modal");
        if (obtainedListModal) {
            obtainedListModal.addEventListener("click", (ev) => {
                if (ev.target === obtainedListModal) window.closeObtainedListModal();
            });
        }
    });
})();
