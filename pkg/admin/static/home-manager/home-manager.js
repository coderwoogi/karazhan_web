let current = null;
let defaultContent = null;

function status(message, type = '') {
  const el = document.getElementById('status');
  el.textContent = message;
  el.className = `status ${type}`;
}

async function loadSettings() {
  try {
    const res = await fetch('/api/admin/home/settings', { headers: { 'X-Background-Request': '1' } });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    defaultContent = data.defaultContent;
    current = (data.draft && data.draft.content) || (data.published && data.published.content) || defaultContent;
    renderForm(current);
    renderMeta(data);
    status('홈 설정을 불러왔습니다.', 'ok');
  } catch (err) {
    console.error(err);
    status(`홈 설정을 불러오지 못했습니다. ${err.message || err}`, 'err');
  }
}

function renderMeta(data) {
  const published = data.published;
  const draft = data.draft;
  document.getElementById('publishedMeta').textContent = published
    ? `운영 버전 ${published.version} / 반영자 ${published.publishedBy || '-'} / ${published.publishedAt || '-'}`
    : '운영 반영 정보 없음';
  document.getElementById('draftMeta').textContent = draft
    ? `임시 버전 ${draft.version} / 수정자 ${draft.updatedBy || '-'} / ${draft.updatedAt || '-'}`
    : '임시 저장 정보 없음';
}

function renderForm(data) {
  const hero = data.hero || {};
  document.getElementById('logo').value = data.logo || '';
  document.getElementById('heroBackground').value = hero.background || '';
  document.getElementById('heroEyebrow').value = hero.eyebrow || '';
  document.getElementById('heroTitle').value = hero.title || '';
  document.getElementById('heroSubtitle').value = hero.subtitle || '';
  document.getElementById('heroDescription').value = hero.description || '';
  renderNav(data.nav || []);
  renderCards(data.cards || []);
}

function renderNav(nav) {
  document.getElementById('navRows').innerHTML = nav.map((item) => navRow(item)).join('');
}

function navRow(item = {}) {
  return `
    <div class="row nav-row">
      <div><label>메뉴명</label><input class="nav-label" value="${escapeAttr(item.label || '')}"></div>
      <div><label>링크</label><input class="nav-url" value="${escapeAttr(item.url || '')}"></div>
      <button class="danger" type="button" onclick="this.closest('.row').remove()">삭제</button>
    </div>
  `;
}

function renderCards(cards) {
  document.getElementById('cardRows').innerHTML = cards.map((item) => cardRow(item)).join('');
}

function cardRow(item = {}) {
  return `
    <div class="row card-row">
      <div><label>제목</label><input class="card-title" value="${escapeAttr(item.title || '')}"></div>
      <div><label>설명</label><input class="card-description" value="${escapeAttr(item.description || '')}"></div>
      <div><label>이미지</label><input class="card-image" value="${escapeAttr(item.image || '')}"></div>
      <div><label>링크</label><input class="card-url" value="${escapeAttr(item.url || '#')}"></div>
      <button class="danger" type="button" onclick="this.closest('.row').remove()">삭제</button>
    </div>
  `;
}

function addNav() {
  document.getElementById('navRows').insertAdjacentHTML('beforeend', navRow({ label: '새 메뉴', url: '#' }));
}

function addCard() {
  document.getElementById('cardRows').insertAdjacentHTML('beforeend', cardRow({ title: '새 카드', description: '', image: '/img/shop_bg.jpg', url: '#' }));
}

function collect() {
  return {
    logo: document.getElementById('logo').value.trim(),
    hero: {
      background: document.getElementById('heroBackground').value.trim(),
      eyebrow: document.getElementById('heroEyebrow').value.trim(),
      title: document.getElementById('heroTitle').value.trim(),
      subtitle: document.getElementById('heroSubtitle').value.trim(),
      description: document.getElementById('heroDescription').value.trim()
    },
    nav: Array.from(document.querySelectorAll('.nav-row')).map((row) => ({
      label: row.querySelector('.nav-label').value.trim(),
      url: row.querySelector('.nav-url').value.trim()
    })).filter((item) => item.label && item.url),
    cards: Array.from(document.querySelectorAll('.card-row')).map((row) => ({
      title: row.querySelector('.card-title').value.trim(),
      description: row.querySelector('.card-description').value.trim(),
      image: row.querySelector('.card-image').value.trim(),
      url: row.querySelector('.card-url').value.trim() || '#'
    })).filter((item) => item.title)
  };
}

async function saveDraft() {
  await save('/api/admin/home/draft', '임시 저장했습니다.');
}

async function publish() {
  if (!confirm('현재 입력한 내용을 유저 메인 화면에 운영 반영하시겠습니까?')) return;
  await save('/api/admin/home/publish', '운영 반영했습니다. 유저 화면을 새로고침하면 적용됩니다.');
}

async function save(url, okMessage) {
  try {
    const content = collect();
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });
    if (!res.ok) throw new Error(await res.text());
    status(okMessage, 'ok');
    await loadSettings();
  } catch (err) {
    console.error(err);
    status(`저장에 실패했습니다. ${err.message || err}`, 'err');
  }
}

function resetDefault() {
  if (!defaultContent) return;
  renderForm(defaultContent);
  status('기본값을 불러왔습니다. 저장 또는 운영 반영을 눌러야 적용됩니다.', 'ok');
}

function escapeAttr(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

document.addEventListener('DOMContentLoaded', loadSettings);
