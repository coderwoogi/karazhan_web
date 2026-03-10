(() => {
  const state = {
    listPage: 1,
    myPage: 1,
    listTotalPages: 1,
    myTotalPages: 1,
    rows: [],
    myRows: [],
    myChars: [],
    createItems: [],
    selectedCreateItemGuid: 0,
    selectedSubTab: 'list',
    classMap: {
      0: '소모품',
      1: '가방',
      2: '무기',
      3: '보석',
      4: '방어구',
      5: '재료',
      6: '투사체',
      7: '거래상품',
      9: '요리',
      11: '화살통',
      12: '퀘스트',
      13: '열쇠',
      15: '기타'
    }
  };

  const subclassMap = {
    2: {
      0: '한손 도끼', 1: '양손 도끼', 2: '활', 3: '총', 4: '한손 둔기', 5: '양손 둔기',
      6: '장창', 7: '한손 검', 8: '양손 검', 10: '지팡이', 13: '주먹 무기', 14: '기타',
      15: '단검', 16: '투척', 17: '창', 18: '석궁', 19: '마법봉', 20: '낚싯대'
    },
    4: {
      0: '기타', 1: '천', 2: '가죽', 3: '사슬', 4: '판금', 6: '방패',
      7: '성서', 8: '우상', 9: '토템', 10: '인장'
    }
  };

  const qualityMap = {
    0: { text: '일반(회색)', color: '#9ca3af' },
    1: { text: '일반(회색)', color: '#9ca3af' },
    2: { text: '고급(녹색)', color: '#22c55e' },
    3: { text: '희귀(파랑)', color: '#3b82f6' },
    4: { text: '영웅(보라)', color: '#a855f7' },
    5: { text: '전설(주황)', color: '#f59e0b' }
  };

  function esc(v) {
    return String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async function parseJsonSafe(res) {
    const text = await res.text();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch (_) {
      return { status: 'error', message: text };
    }
  }

  async function apiGet(url) {
    const res = await fetch(url, { credentials: 'same-origin' });
    const data = await parseJsonSafe(res);
    if (!res.ok || data.status === 'error') {
      throw new Error(data.message || `요청 실패 (${res.status})`);
    }
    return data;
  }

  async function apiPost(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    });
    const data = await parseJsonSafe(res);
    if (!res.ok || data.status === 'error') {
      throw new Error(data.message || `요청 실패 (${res.status})`);
    }
    return data;
  }

  function formatCoins(v) {
    const n = Math.max(0, Number(v || 0));
    const gold = Math.floor(n / 10000);
    const silver = Math.floor((n % 10000) / 100);
    const copper = n % 100;
    return `
      <span style="white-space:nowrap; display:inline-flex; align-items:center; gap:3px;">
        <b style="color:#f59e0b;">${gold.toLocaleString()}</b><img src="/img/gold_emoji.png" alt="골드" style="width:14px; height:14px;">
        <b style="color:#94a3b8;">${silver}</b><img src="/img/silver_emoji.png" alt="실버" style="width:14px; height:14px;">
        <b style="color:#b45309;">${copper}</b><img src="/img/copper_emoji.png" alt="코퍼" style="width:14px; height:14px;">
      </span>
    `;
  }

  function getQualityCell(q) {
    const meta = qualityMap[Number(q)] || qualityMap[1];
    return `<span style="font-weight:700; color:${meta.color};">${meta.text}</span>`;
  }

  function getClassText(itemClass, itemSubclass) {
    const className = state.classMap[Number(itemClass)] || `분류 ${Number(itemClass)}`;
    const subMap = subclassMap[Number(itemClass)] || {};
    const subName = subMap[Number(itemSubclass)] || `세부 ${Number(itemSubclass)}`;
    return `${className} / ${subName}`;
  }

  function getAuctionFallbackIcon() {
    return '<span style="display:inline-flex; width:28px; height:28px; align-items:center; justify-content:center; border-radius:6px; background:#e2e8f0; color:#64748b;"><i class="fas fa-cube"></i></span>';
  }

  async function loadAuctionIcon(entry, containerId) {
    const itemEntry = Number(entry || 0);
    const container = document.getElementById(containerId);
    if (!container || itemEntry <= 0) return;
    try {
      const res = await fetch(`/api/external/item_icon?entry=${itemEntry}`);
      if (!res.ok) return;
      const data = await res.json();
      if (!data || !data.url) return;
      container.innerHTML = `<img src="${esc(data.url)}" alt="item-${itemEntry}" style="width:28px; height:28px; border-radius:6px; object-fit:cover;" onerror="this.style.display='none';">`;
    } catch (_) {
      // keep fallback icon
    }
  }

  function remainText(endUnix) {
    const diff = Number(endUnix || 0) - Math.floor(Date.now() / 1000);
    if (diff <= 0) return '<span style="color:#ef4444;">종료</span>';
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    if (h >= 24) {
      const d = Math.floor(h / 24);
      return `${d}일 ${h % 24}시간`;
    }
    return `${h}시간 ${m}분`;
  }

  function refreshClassOptions() {
    const sel = document.getElementById('auction-class-filter');
    if (!sel) return;
    const current = sel.value;
    const keys = Object.keys(state.classMap).map(Number).sort((a, b) => a - b);
    sel.innerHTML = '<option value="">전체</option>' + keys.map(k => `<option value="${k}">${esc(state.classMap[k])}</option>`).join('');
    sel.value = current;
  }

  window.updateAuctionSubclassOptions = function () {
    const classSel = document.getElementById('auction-class-filter');
    const subSel = document.getElementById('auction-subclass-filter');
    if (!classSel || !subSel) return;
    const cls = Number(classSel.value);
    const map = subclassMap[cls] || {};
    subSel.innerHTML = '<option value="">전체</option>' + Object.keys(map)
      .map(Number)
      .sort((a, b) => a - b)
      .map(k => `<option value="${k}">${esc(map[k])}</option>`)
      .join('');
  };

  function buildAuctionNameCell(row) {
    const name = esc(row.item_name || `아이템 ${row.item_entry || ''}`);
    const colored = `<span style="font-weight:700; color:${(qualityMap[Number(row.item_quality)] || qualityMap[1]).color};">${name}</span>`;
    if (typeof window.wrapWithWowheadItemLink === 'function') {
      return window.wrapWithWowheadItemLink(row.item_entry, colored, row.item_name || '');
    }
    return colored;
  }

  function renderAuctionListRows(rows) {
    const tbody = document.getElementById('auction-list-body');
    if (!tbody) return;
    if (!Array.isArray(rows) || rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="13" style="text-align:center; color:#64748b;">검색 결과가 없습니다.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map((row, idx) => {
      const currentBid = Number(row.last_bid || 0) > 0 ? Number(row.last_bid) : Number(row.start_bid || 0);
      const iconId = `auction-list-icon-${Number(row.id || 0)}-${idx}`;
      return `
        <tr>
          <td>${Number(row.id || 0)}</td>
          <td style="text-align:center;"><span id="${iconId}">${getAuctionFallbackIcon()}</span></td>
          <td>${buildAuctionNameCell(row)}</td>
          <td>${getQualityCell(row.item_quality)}</td>
          <td>${esc(getClassText(row.item_class, row.item_subclass))}</td>
          <td>${Number(row.item_count || 1)}</td>
          <td>${formatCoins(row.start_bid)}</td>
          <td>${formatCoins(currentBid)}</td>
          <td>${formatCoins(row.buyout_price)}</td>
          <td>${esc(row.owner_name || '-')}</td>
          <td>${esc(row.bidder_name || '-')}</td>
          <td>${remainText(row.end_unix)}</td>
          <td>
            <div style="display:flex; gap:6px; justify-content:center;">
              <button class="btn btn-primary" style="padding:5px 8px;" onclick="openAuctionBuyoutModal(${Number(row.id || 0)})">즉구</button>
              <button class="btn" style="padding:5px 8px; background:#e2e8f0; color:#1e293b;" onclick="openAuctionBidModal(${Number(row.id || 0)})">입찰</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
    rows.forEach((row, idx) => loadAuctionIcon(row.item_entry, `auction-list-icon-${Number(row.id || 0)}-${idx}`));
    if (typeof window.refreshWowheadTooltips === 'function') window.refreshWowheadTooltips();
  }

  function renderAuctionMyRows(rows) {
    const tbody = document.getElementById('auction-my-list-body');
    if (!tbody) return;
    if (!Array.isArray(rows) || rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#64748b;">등록한 경매가 없습니다.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map((row, idx) => {
      const currentBid = Number(row.last_bid || 0) > 0 ? Number(row.last_bid) : Number(row.start_bid || 0);
      const iconId = `auction-my-icon-${Number(row.id || 0)}-${idx}`;
      return `
        <tr>
          <td>${Number(row.id || 0)}</td>
          <td style="text-align:center;"><span id="${iconId}">${getAuctionFallbackIcon()}</span></td>
          <td>${buildAuctionNameCell(row)}</td>
          <td>${formatCoins(currentBid)}</td>
          <td>${formatCoins(row.buyout_price)}</td>
          <td>${remainText(row.end_unix)}</td>
          <td><button class="btn" style="background:#fee2e2; color:#b91c1c; border:1px solid #fecaca; padding:5px 10px;" onclick="cancelAuctionItem(${Number(row.id || 0)})"><i class="fas fa-trash"></i> 삭제</button></td>
        </tr>
      `;
    }).join('');
    rows.forEach((row, idx) => loadAuctionIcon(row.item_entry, `auction-my-icon-${Number(row.id || 0)}-${idx}`));
    if (typeof window.refreshWowheadTooltips === 'function') window.refreshWowheadTooltips();
  }

  function mountPagination(containerId, page, totalPages, callback) {
    const el = document.getElementById(containerId);
    if (!el) return;
    if (typeof window.renderPagination === 'function') {
      window.renderPagination(el, { page, totalPages }, callback);
      return;
    }
    el.innerHTML = '';
  }

  function readFilters() {
    const q = id => document.getElementById(id);
    const params = new URLSearchParams();
    params.set('page', String(state.listPage));
    params.set('limit', '10');
    const search = (q('auction-search-input')?.value || '').trim();
    const quality = (q('auction-quality-filter')?.value || '').trim();
    const itemClass = (q('auction-class-filter')?.value || '').trim();
    const itemSubclass = (q('auction-subclass-filter')?.value || '').trim();
    const owner = (q('auction-owner-filter')?.value || '').trim();
    const bidder = (q('auction-bidder-filter')?.value || '').trim();
    const status = (q('auction-status-filter')?.value || '').trim();
    if (search) params.set('search', search);
    if (quality !== '') params.set('quality', quality);
    if (itemClass !== '') params.set('item_class', itemClass);
    if (itemSubclass !== '') params.set('item_subclass', itemSubclass);
    if (owner) params.set('owner', owner);
    if (bidder) params.set('bidder', bidder);
    if (status) params.set('status', status);
    return params;
  }

  window.loadAuctionList = async function (page = 1) {
    state.listPage = Math.max(1, Number(page || 1));
    const tbody = document.getElementById('auction-list-body');
    if (tbody) tbody.innerHTML = '<tr><td colspan="13" style="text-align:center; color:#64748b;">불러오는 중...</td></tr>';
    try {
      const params = readFilters();
      params.set('page', String(state.listPage));
      const data = await apiGet(`/api/auction/list?${params.toString()}`);
      state.rows = Array.isArray(data.rows) ? data.rows.slice() : [];
      state.rows.sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
      state.listTotalPages = Math.max(1, Number(data.totalPages || 1));
      renderAuctionListRows(state.rows);
      mountPagination('auction-pagination', state.listPage, state.listTotalPages, p => window.loadAuctionList(p));
    } catch (e) {
      if (typeof window.ModalUtils?.showAlert === 'function') window.ModalUtils.showAlert(e.message || '경매 목록을 불러오지 못했습니다.');
      if (tbody) tbody.innerHTML = `<tr><td colspan="13" style="text-align:center; color:#ef4444;">${esc(e.message || '경매 목록을 불러오지 못했습니다.')}</td></tr>`;
    }
  };

  window.loadAuctionMyList = async function (page = 1) {
    state.myPage = Math.max(1, Number(page || 1));
    const tbody = document.getElementById('auction-my-list-body');
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#64748b;">불러오는 중...</td></tr>';
    try {
      const data = await apiGet(`/api/auction/my-list?page=${state.myPage}`);
      state.myRows = Array.isArray(data.rows) ? data.rows.slice() : [];
      state.myRows.sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
      state.myTotalPages = Math.max(1, Number(data.totalPages || 1));
      renderAuctionMyRows(state.myRows);
      mountPagination('auction-my-pagination', state.myPage, state.myTotalPages, p => window.loadAuctionMyList(p));
    } catch (e) {
      if (typeof window.ModalUtils?.showAlert === 'function') window.ModalUtils.showAlert(e.message || '내 경매 목록을 불러오지 못했습니다.');
      if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#ef4444;">${esc(e.message || '내 경매 목록을 불러오지 못했습니다.')}</td></tr>`;
    }
  };

  window.openAuctionSubTab = function (name) {
    state.selectedSubTab = name === 'my' ? 'my' : 'list';
    const listBtn = document.getElementById('auction-sub-btn-list');
    const myBtn = document.getElementById('auction-sub-btn-my');
    const list = document.getElementById('auction-sub-list');
    const my = document.getElementById('auction-sub-my');
    if (listBtn) listBtn.classList.toggle('active', state.selectedSubTab === 'list');
    if (myBtn) myBtn.classList.toggle('active', state.selectedSubTab === 'my');
    if (list) {
      list.classList.toggle('active', state.selectedSubTab === 'list');
      list.style.display = state.selectedSubTab === 'list' ? 'flex' : 'none';
    }
    if (my) {
      my.classList.toggle('active', state.selectedSubTab === 'my');
      my.style.display = state.selectedSubTab === 'my' ? 'flex' : 'none';
    }
    if (state.selectedSubTab === 'list') window.loadAuctionList(1);
    else window.loadAuctionMyList(1);
  };

  window.resetAuctionFilters = function () {
    const ids = ['auction-search-input', 'auction-quality-filter', 'auction-class-filter', 'auction-subclass-filter', 'auction-owner-filter', 'auction-bidder-filter', 'auction-status-filter'];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (el.tagName === 'SELECT') el.value = '';
      else el.value = '';
    });
    window.updateAuctionSubclassOptions();
    window.loadAuctionList(1);
  };

  window.loadAuctionPage = function () {
    refreshClassOptions();
    window.updateAuctionSubclassOptions();
    if (state.selectedSubTab === 'my') window.loadAuctionMyList(1);
    else window.loadAuctionList(1);
  };

  function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'flex';
  }

  function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }

  async function loadAuctionCharacters() {
    const data = await apiGet('/api/auction/my-characters');
    state.myChars = Array.isArray(data.characters) ? data.characters : [];
    return state.myChars;
  }

  function getCharacterOptionText(c) {
    const online = c.online ? '접속중' : '오프라인';
    return `${c.name} (Lv.${c.level}, ${online})`;
  }

  window.openAuctionCreateModal = async function () {
    try {
      openModal('auction-create-modal');
      const chars = await loadAuctionCharacters();
      const sel = document.getElementById('auction-create-character');
      if (!sel) return;
      if (!chars.length) {
        sel.innerHTML = '<option value="">보유 캐릭터 없음</option>';
        return;
      }
      sel.innerHTML = chars.map(c => `<option value="${Number(c.guid)}">${esc(getCharacterOptionText(c))}</option>`).join('');
      await window.loadAuctionCreateItems();
    } catch (e) {
      if (typeof window.ModalUtils?.showAlert === 'function') window.ModalUtils.showAlert(e.message || '캐릭터 정보를 불러오지 못했습니다.');
    }
  };

  window.closeAuctionCreateModal = function () {
    closeModal('auction-create-modal');
  };

  window.loadAuctionCreateItems = async function () {
    const charSel = document.getElementById('auction-create-character');
    const body = document.getElementById('auction-create-items-body');
    const goldEl = document.getElementById('auction-create-character-gold');
    state.selectedCreateItemGuid = 0;
    if (!charSel || !body) return;
    const charGuid = Number(charSel.value || 0);
    const c = state.myChars.find(x => Number(x.guid) === charGuid);
    if (goldEl && c) goldEl.innerHTML = formatCoins(c.money || 0);
    if (!charGuid) {
      body.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#64748b;">캐릭터를 선택하세요.</td></tr>';
      return;
    }
    body.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#64748b;">불러오는 중...</td></tr>';
    try {
      const data = await apiGet(`/api/auction/my-items?char_guid=${charGuid}`);
      state.createItems = Array.isArray(data.items) ? data.items : [];
      renderCreateItems(state.createItems);
    } catch (e) {
      body.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#ef4444;">${esc(e.message || '아이템을 불러오지 못했습니다.')}</td></tr>`;
    }
  };

  function renderCreateItems(items) {
    const body = document.getElementById('auction-create-items-body');
    if (!body) return;
    if (!Array.isArray(items) || items.length === 0) {
      body.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#64748b;">등록 가능한 아이템이 없습니다.</td></tr>';
      return;
    }
    body.innerHTML = items.map((item, idx) => {
      const checked = Number(item.item_guid) === Number(state.selectedCreateItemGuid) ? 'checked' : '';
      const iconId = `auction-create-icon-${Number(item.item_guid || 0)}-${idx}`;
      const label = `<span style="font-weight:700; color:${(qualityMap[Number(item.item_quality)] || qualityMap[1]).color};">${esc(item.item_name || `아이템 ${item.item_entry}`)}</span>`;
      const linked = typeof window.wrapWithWowheadItemLink === 'function'
        ? window.wrapWithWowheadItemLink(item.item_entry, label, item.item_name || '')
        : label;
      return `
        <tr>
          <td style="text-align:center;"><input type="radio" name="auction-create-item" value="${Number(item.item_guid)}" ${checked} onchange="selectAuctionCreateItem(${Number(item.item_guid)})"></td>
          <td style="text-align:center;"><span id="${iconId}">${getAuctionFallbackIcon()}</span></td>
          <td>${linked}</td>
          <td>${Number(item.item_count || 1)}</td>
          <td>${getQualityCell(item.item_quality)}</td>
        </tr>
      `;
    }).join('');
    items.forEach((item, idx) => loadAuctionIcon(item.item_entry, `auction-create-icon-${Number(item.item_guid || 0)}-${idx}`));
    if (typeof window.refreshWowheadTooltips === 'function') window.refreshWowheadTooltips();
  }

  window.selectAuctionCreateItem = function (itemGuid) {
    state.selectedCreateItemGuid = Number(itemGuid || 0);
  };

  window.filterAuctionCreateItems = function () {
    const keyword = (document.getElementById('auction-create-item-search')?.value || '').trim().toLowerCase();
    if (!keyword) {
      renderCreateItems(state.createItems);
      return;
    }
    const filtered = state.createItems.filter(it => {
      const n = String(it.item_name || '').toLowerCase();
      const e = String(it.item_entry || '');
      return n.includes(keyword) || e.includes(keyword);
    });
    renderCreateItems(filtered);
  };

  window.submitAuctionCreate = async function () {
    const charGuid = Number(document.getElementById('auction-create-character')?.value || 0);
    const startBid = Number(document.getElementById('auction-create-start-bid')?.value || 0);
    const buyoutPrice = Number(document.getElementById('auction-create-buyout')?.value || 0);
    const durationHours = Number(document.getElementById('auction-create-duration')?.value || 24);

    if (!charGuid || !state.selectedCreateItemGuid || !startBid || !buyoutPrice) {
      if (typeof window.ModalUtils?.showAlert === 'function') window.ModalUtils.showAlert('필수 항목을 모두 입력하고 아이템을 선택하세요.');
      return;
    }

    try {
      await apiPost('/api/auction/create', {
        char_guid: charGuid,
        item_guid: state.selectedCreateItemGuid,
        start_bid: startBid,
        buyout_price: buyoutPrice,
        duration_hours: durationHours
      });
      if (typeof window.ModalUtils?.showAlert === 'function') window.ModalUtils.showAlert('경매가 등록되었습니다.');
      window.closeAuctionCreateModal();
      if (state.selectedSubTab === 'my') window.loadAuctionMyList(1);
      else window.loadAuctionList(1);
    } catch (e) {
      if (typeof window.ModalUtils?.showAlert === 'function') window.ModalUtils.showAlert(e.message || '경매 등록에 실패했습니다.');
    }
  };

  window.cancelAuctionItem = function (auctionId) {
    const fn = async () => {
      try {
        await apiPost('/api/auction/cancel', { auction_id: Number(auctionId || 0) });
        if (typeof window.ModalUtils?.showAlert === 'function') window.ModalUtils.showAlert('삭제되었습니다.');
        window.loadAuctionMyList(state.myPage);
        window.loadAuctionList(state.listPage);
      } catch (e) {
        if (typeof window.ModalUtils?.showAlert === 'function') window.ModalUtils.showAlert(e.message || '삭제에 실패했습니다.');
      }
    };
    if (typeof window.ModalUtils?.showConfirm === 'function') window.ModalUtils.showConfirm('해당 경매를 삭제하시겠습니까?', fn, '삭제 확인');
    else fn();
  };

  async function openActionModal(kind, auctionId) {
    const target = state.rows.find(r => Number(r.id) === Number(auctionId));
    if (!target) {
      if (typeof window.ModalUtils?.showAlert === 'function') window.ModalUtils.showAlert('대상 경매 정보를 찾지 못했습니다.');
      return;
    }

    let chars;
    try {
      chars = await loadAuctionCharacters();
    } catch (e) {
      if (typeof window.ModalUtils?.showAlert === 'function') window.ModalUtils.showAlert(e.message || '캐릭터 정보를 불러오지 못했습니다.');
      return;
    }
    if (!chars.length) {
      if (typeof window.ModalUtils?.showAlert === 'function') window.ModalUtils.showAlert('사용 가능한 캐릭터가 없습니다.');
      return;
    }

    const charOptions = chars.map(c => `<option value="${Number(c.guid)}">${esc(getCharacterOptionText(c))}</option>`).join('');
    const isBid = kind === 'bid';
    const minBid = Number(target.last_bid || 0) > 0 ? Number(target.last_bid) + 1 : Number(target.start_bid || 1);

    if (typeof window.Swal === 'undefined') {
      if (typeof window.ModalUtils?.showAlert === 'function') window.ModalUtils.showAlert('SweetAlert2가 필요합니다.');
      return;
    }

    const result = await window.Swal.fire({
      title: isBid ? '입찰하기' : '즉시구매',
      html: `
        <div style="text-align:left; font-size:0.92rem;">
          <div style="margin-bottom:8px; color:#475569;">대상: <b>${esc(target.item_name || `아이템 ${target.item_entry}`)}</b></div>
          <div style="margin-bottom:12px; color:#475569;">${isBid ? '최소 입찰가' : '즉시구매가'}: ${formatCoins(isBid ? minBid : target.buyout_price)}</div>
          <label style="display:block; margin-bottom:6px;">구매/입찰 캐릭터</label>
          <select id="auction-action-char" class="swal2-input" style="margin:0; width:100%;">${charOptions}</select>
          ${isBid ? `
          <label style="display:block; margin-top:10px; margin-bottom:6px;">입찰 금액</label>
          <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px; margin-bottom:2px;">
            <div style="display:flex; align-items:center; gap:6px;"><input id="auction-bid-g" type="number" min="0" value="0" class="swal2-input" style="margin:0; width:100%;"><img src="/img/gold_emoji.png" style="width:18px; height:18px;"></div>
            <div style="display:flex; align-items:center; gap:6px;"><input id="auction-bid-s" type="number" min="0" max="99" value="0" class="swal2-input" style="margin:0; width:100%;"><img src="/img/silver_emoji.png" style="width:18px; height:18px;"></div>
            <div style="display:flex; align-items:center; gap:6px;"><input id="auction-bid-c" type="number" min="0" max="99" value="0" class="swal2-input" style="margin:0; width:100%;"><img src="/img/copper_emoji.png" style="width:18px; height:18px;"></div>
          </div>
          <div style="font-size:0.8rem; color:#64748b; margin-top:6px;">최소 입찰: ${formatCoins(minBid)}</div>
          ` : ''}
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: isBid ? '입찰' : '구매',
      cancelButtonText: '취소',
      preConfirm: () => {
        const charGuid = Number(document.getElementById('auction-action-char')?.value || 0);
        if (!charGuid) {
          window.Swal.showValidationMessage('캐릭터를 선택하세요.');
          return false;
        }
        if (isBid) {
          const g = Math.max(0, Number(document.getElementById('auction-bid-g')?.value || 0));
          const s = Math.max(0, Number(document.getElementById('auction-bid-s')?.value || 0));
          const c = Math.max(0, Number(document.getElementById('auction-bid-c')?.value || 0));
          const bidPrice = g * 10000 + s * 100 + c;
          if (bidPrice < minBid) {
            window.Swal.showValidationMessage('최소 입찰가 이상으로 입력하세요.');
            return false;
          }
          return { charGuid, bidPrice };
        }
        return { charGuid };
      }
    });

    if (!result.isConfirmed || !result.value) return;

    try {
      if (isBid) {
        await apiPost('/api/auction/bid', {
          auction_id: Number(auctionId),
          buyer_char_guid: Number(result.value.charGuid),
          bid_price: Number(result.value.bidPrice)
        });
        if (typeof window.ModalUtils?.showAlert === 'function') window.ModalUtils.showAlert('입찰이 완료되었습니다.');
      } else {
        await apiPost('/api/auction/buyout', {
          auction_id: Number(auctionId),
          buyer_char_guid: Number(result.value.charGuid)
        });
        if (typeof window.ModalUtils?.showAlert === 'function') window.ModalUtils.showAlert('구매가 완료되었습니다.');
      }
      window.loadAuctionList(state.listPage);
      window.loadAuctionMyList(state.myPage);
    } catch (e) {
      if (typeof window.ModalUtils?.showAlert === 'function') window.ModalUtils.showAlert(e.message || '처리에 실패했습니다.');
    }
  }

  window.openAuctionBuyoutModal = function (auctionId) {
    openActionModal('buyout', auctionId);
  };

  window.openAuctionBidModal = function (auctionId) {
    openActionModal('bid', auctionId);
  };

  document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('auction-create-modal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal('auction-create-modal');
      });
    }
  });
})();
