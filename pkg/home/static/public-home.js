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
  let publicBoards = [];
  let activeBoard = '';
  let activeBoardPage = 1;
  let publicUser = null;
  let publicUserLoaded = false;

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
                <a href="#public-board-section">게시판 불러오는 중...</a>
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
    const side = document.getElementById('public-board-list');
    try {
      const user = await getPublicUser();
      const webRank = user ? Number(user.webRank || 0) : 0;
      const res = await fetch('/api/board/list', { headers: { 'X-Background-Request': '1' } });
      if (!res.ok) throw new Error('게시판 목록을 불러오지 못했습니다.');
      const boards = await res.json();
      publicBoards = Array.isArray(boards)
        ? boards.filter((board) => board && board.id && board.name && Number(board.min_web_read || 0) <= webRank)
        : [];
      if (publicBoards.length === 0) {
        if (menu) menu.innerHTML = '<a href="#public-board-section">게시판</a>';
        if (side) side.innerHTML = '<div class="public-board-status">표시할 게시판이 없습니다.</div>';
        return;
      }
      if (menu) {
        menu.innerHTML = publicBoards
          .map((board) => `<a href="#public-board-section" data-public-board="${escapeAttr(board.id)}">${escapeHtml(board.name)}</a>`)
          .join('');
      }
      renderBoardButtons();
      const requestedBoard = new URLSearchParams(window.location.search).get('board');
      const first = publicBoards.find((board) => board.id === requestedBoard)
        || publicBoards.find((board) => board.id === 'notice')
        || publicBoards[0];
      openPublicBoard(first.id, 1);
    } catch (err) {
      console.warn('[public-home] 게시판 메뉴를 기본값으로 표시합니다.', err);
      if (menu) menu.innerHTML = '<a href="#public-board-section">게시판</a>';
      if (side) side.innerHTML = '<div class="public-board-status">게시판을 불러오지 못했습니다.</div>';
    }
  }

  function renderBoardButtons() {
    const side = document.getElementById('public-board-list');
    if (!side) return;
    side.innerHTML = publicBoards
      .map((board) => `<button class="public-board-btn" type="button" data-public-board="${escapeAttr(board.id)}">${escapeHtml(board.name)}</button>`)
      .join('');
  }

  async function openPublicBoard(boardId, page = 1) {
    activeBoard = boardId;
    activeBoardPage = page;
    const board = publicBoards.find((item) => item.id === boardId);
    document.querySelectorAll('[data-public-board]').forEach((el) => {
      el.classList.toggle('active', el.getAttribute('data-public-board') === boardId);
    });
    text('#public-board-title', board ? board.name : '게시판');
    text('#public-board-status', '글 목록을 불러오는 중입니다.');
    const list = document.getElementById('public-post-list');
    const detail = document.getElementById('public-post-detail');
    const pager = document.getElementById('public-board-pager');
    if (detail) {
      detail.classList.remove('active');
      detail.innerHTML = '';
    }
    if (pager) pager.innerHTML = '';
    if (list) list.innerHTML = '';

    try {
      const res = await fetch(`/api/board/posts?board_id=${encodeURIComponent(boardId)}&page=${page}&limit=8`, {
        headers: { 'X-Background-Request': '1' }
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      renderPosts(data.posts || []);
      renderPager(Number(data.page || page), Number(data.totalPages || 1));
      text('#public-board-status', `총 ${Number(data.total || 0)}개 글`);
    } catch (err) {
      console.error(err);
      if (list) list.innerHTML = '<div class="public-board-status" style="padding:20px;">글 목록을 불러오지 못했습니다.</div>';
      text('#public-board-status', '불러오기 실패');
    }
  }

  function renderPosts(posts) {
    const list = document.getElementById('public-post-list');
    if (!list) return;
    if (!Array.isArray(posts) || posts.length === 0) {
      list.innerHTML = '<div class="public-board-status" style="padding:20px;">등록된 글이 없습니다.</div>';
      return;
    }
    list.innerHTML = posts.map((post) => `
      <div class="public-post-row" data-post-id="${escapeAttr(post.id)}">
        <div>
          <div class="public-post-title">${escapeHtml(post.title || '제목 없음')} ${Number(post.comment_count || 0) > 0 ? `<span style="color:#d9b766;">[${Number(post.comment_count)}]</span>` : ''}</div>
          <div class="public-post-meta">${escapeHtml(post.author_name || '-')} · ${escapeHtml(formatDate(post.created_at))} · 조회 ${Number(post.views || 0)}</div>
        </div>
        <div class="public-post-number">#${escapeHtml(post.display_number || post.id || '')}</div>
      </div>
    `).join('');
  }

  function renderPager(page, totalPages) {
    const pager = document.getElementById('public-board-pager');
    if (!pager) return;
    if (totalPages <= 1) {
      pager.innerHTML = '';
      return;
    }
    pager.innerHTML = `
      <button type="button" data-board-page="${Math.max(1, page - 1)}" ${page <= 1 ? 'disabled' : ''}>이전</button>
      <button type="button" disabled>${page} / ${totalPages}</button>
      <button type="button" data-board-page="${Math.min(totalPages, page + 1)}" ${page >= totalPages ? 'disabled' : ''}>다음</button>
    `;
  }

  async function openPublicPost(postId) {
    const detail = document.getElementById('public-post-detail');
    if (!detail) return;
    detail.classList.add('active');
    detail.innerHTML = '<div class="public-board-status">글을 불러오는 중입니다.</div>';
    try {
      const res = await fetch(`/api/board/post?id=${encodeURIComponent(postId)}`, {
        headers: { 'X-Background-Request': '1' }
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const post = data.post || {};
      const comments = Array.isArray(data.comments) ? data.comments : [];
      detail.innerHTML = `
        <button class="btn btn-small" type="button" id="public-post-close">목록으로</button>
        <h3>${escapeHtml(post.title || '제목 없음')}</h3>
        <div class="public-post-meta">${escapeHtml(post.author_name || '-')} · ${escapeHtml(formatDate(post.created_at))} · 조회 ${Number(post.views || 0)}</div>
        <div class="public-post-content">${sanitizeContent(post.content || '')}</div>
        <div class="public-comments">
          ${comments.length ? comments.map((comment) => `
            <div class="public-comment">
              <strong>${escapeHtml(comment.author_name || '-')}</strong>
              <div>${sanitizeContent(comment.content || '')}</div>
            </div>
          `).join('') : '<div class="public-comment">댓글이 없습니다.</div>'}
        </div>
      `;
      detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      console.error(err);
      detail.innerHTML = '<div class="public-board-status">글을 불러오지 못했습니다.</div>';
    }
  }

  async function applyLoginState() {
    try {
      const user = await getPublicUser();
      if (!user) return;
      const mainName = user && user.mainCharacter && user.mainCharacter.name ? String(user.mainCharacter.name).trim() : '';
      const name = mainName || String(user.username || '').trim();
      const action = document.querySelector('.nav-action');
      if (action && name) {
        action.href = '#';
        action.textContent = `${name}님 환영합니다.`;
      }
    } catch (err) {
      console.warn('[public-home] 로그인 상태를 확인하지 못했습니다.', err);
    }
  }

  async function getPublicUser() {
    if (publicUserLoaded) return publicUser;
    publicUserLoaded = true;
    try {
      const res = await fetch('/api/user/status', { headers: { 'X-Background-Request': '1' } });
      if (!res.ok) return null;
      publicUser = await res.json();
      return publicUser;
    } catch (err) {
      console.warn('[public-home] 로그인 상태를 확인하지 못했습니다.', err);
      return null;
    }
  }

  function sanitizeContent(content) {
    const template = document.createElement('template');
    template.innerHTML = String(content || '');
    template.content.querySelectorAll('script, iframe, object, embed').forEach((el) => el.remove());
    template.content.querySelectorAll('*').forEach((el) => {
      Array.from(el.attributes).forEach((attr) => {
        if (/^on/i.test(attr.name)) el.removeAttribute(attr.name);
        if (attr.name === 'href' && /^javascript:/i.test(attr.value)) el.removeAttribute(attr.name);
      });
    });
    return template.innerHTML;
  }

  function formatDate(value) {
    if (!value) return '';
    return String(value).replace('T', ' ').slice(0, 16);
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
    applyLoginState();
  });

  document.addEventListener('click', (event) => {
    const boardTarget = event.target.closest('[data-public-board]');
    if (boardTarget) {
      event.preventDefault();
      const boardId = boardTarget.getAttribute('data-public-board');
      if (boardId) openPublicBoard(boardId, 1);
      document.getElementById('public-board-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const postTarget = event.target.closest('[data-post-id]');
    if (postTarget) {
      openPublicPost(postTarget.getAttribute('data-post-id'));
      return;
    }
    const pageTarget = event.target.closest('[data-board-page]');
    if (pageTarget && !pageTarget.disabled) {
      openPublicBoard(activeBoard, Number(pageTarget.getAttribute('data-board-page') || activeBoardPage || 1));
      return;
    }
    if (event.target && event.target.id === 'public-post-close') {
      document.getElementById('public-post-detail')?.classList.remove('active');
    }
  });
})();
