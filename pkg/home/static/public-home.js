(function () {
  const fallback = {
    logo: '/img/wowlogo_white.png',
    hero: {
      background: '/img/karazhan-purple-web-bg-wide.jpeg',
      eyebrow: '전설의 성채가 당신을 부른다',
      title: '카라잔',
      subtitle: '모험의 시간, 운명의 세계로',
      description: '어둠이 깃든 성채와 보랏빛 마력의 균열 속에서 새로운 도전이 시작됩니다. 접속 방법부터 던전 보상, 카드 뽑기, 선술집까지 필요한 정보를 한 화면에서 빠르게 확인할 수 있습니다.'
    },
    nav: [
      { label: '공지사항', url: '#notice-section' },
      { label: '접속방법', url: '#connect-section' },
      { label: '카드뽑기', url: '/carddraw/' },
      { label: '선술집', url: '/shop/' },
      { label: '커뮤니티', url: '#community-section' },
      { label: '가이드', url: '#guide-section' },
      { label: '경매장', url: '#auction-section' }
    ],
    cards: []
  };

  function text(selector, value) {
    const el = document.querySelector(selector);
    if (el && typeof value === 'string') el.textContent = value;
  }

  function attr(selector, name, value) {
    document.querySelectorAll(selector).forEach((el) => {
      if (typeof value === 'string' && value) el.setAttribute(name, value);
    });
  }

  function applyNav(nav) {
    const wrap = document.querySelector('.nav-links');
    if (!wrap || !Array.isArray(nav)) return;
    wrap.innerHTML = nav
      .filter((item) => item && item.label && item.url)
      .map((item) => {
        if (item.label === '공지사항') {
          return `
            <span class="nav-dropdown">
              <a href="${escapeAttr(item.url)}">${escapeHtml(item.label)}</a>
              <span class="board-dropdown-menu" id="public-board-menu">
                <a href="/user/">게시판 불러오는 중...</a>
              </span>
            </span>
          `;
        }
        return `<a href="${escapeAttr(item.url)}">${escapeHtml(item.label)}</a>`;
      })
      .join('');
    loadBoardMenu();
  }

  async function loadBoardMenu() {
    const menu = document.getElementById('public-board-menu');
    if (!menu) return;
    try {
      const res = await fetch('/api/board/list', { headers: { 'X-Background-Request': '1' } });
      if (!res.ok) throw new Error('게시판 목록을 불러오지 못했습니다.');
      const boards = await res.json();
      const userBoards = Array.isArray(boards)
        ? boards.filter((board) => board && board.id && board.name && Number(board.min_web_read || 0) <= 0)
        : [];
      if (userBoards.length === 0) {
        menu.innerHTML = '<a href="/user/">게시판</a>';
        return;
      }
      menu.innerHTML = userBoards
        .map((board) => `<a href="/user/?board=${encodeURIComponent(board.id)}">${escapeHtml(board.name)}</a>`)
        .join('');
    } catch (err) {
      console.warn('[public-home] 게시판 메뉴를 기본값으로 표시합니다.', err);
      menu.innerHTML = '<a href="/user/">게시판</a>';
    }
  }

  function applyCards(cards) {
    const wrap = document.querySelector('.challenge-grid');
    if (!wrap || !Array.isArray(cards) || cards.length === 0) return;
    wrap.innerHTML = cards.map((card, idx) => `
      <article class="challenge-card" style="--bg-img: url('${escapeAttr(card.image || '/img/shop_bg.jpg')}')">
        <span class="card-number">${String(idx + 1).padStart(2, '0')}</span>
        <div class="challenge-content">
          <h3>${escapeHtml(card.title || '')}</h3>
          <p>${escapeHtml(card.description || '')}</p>
          <a class="btn btn-small" href="${escapeAttr(card.url || '#')}">자세히 보기</a>
        </div>
      </article>
    `).join('');
  }

  function applySettings(settings) {
    const data = settings || fallback;
    const hero = data.hero || fallback.hero;
    if (hero.background) {
      document.documentElement.style.setProperty('--public-hero-bg', `url("${hero.background}")`);
    }
    attr('.nav-logo img, .hero-emblem, .footer img', 'src', data.logo || fallback.logo);
    text('.eyebrow', hero.eyebrow);
    text('h1', hero.title);
    text('.hero-subtitle', hero.subtitle);
    text('.hero-desc', hero.description);
    applyNav(data.nav || fallback.nav);
    applyCards(data.cards || fallback.cards);
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, '&#96;');
  }

  document.addEventListener('DOMContentLoaded', async () => {
    try {
      const res = await fetch('/api/public/home', { headers: { 'X-Background-Request': '1' } });
      if (!res.ok) throw new Error('홈 설정을 불러오지 못했습니다.');
      const payload = await res.json();
      applySettings(payload.content || fallback);
    } catch (err) {
      console.warn('[public-home] 기본 홈 설정을 사용합니다.', err);
      applySettings(fallback);
    }
  });
})();
