(function () {
  const K = {
    board: '\uAC8C\uC2DC\uD310',
    eyebrow: '\uC804\uC124\uC758 \uC131\uCC44\uAC00 \uB2F9\uC2E0\uC744 \uBD80\uB978\uB2E4',
    title: '\uCE74\uB77C\uC794',
    subtitle: '\uBAA8\uD5D8\uC758 \uC2DC\uAC04, \uC6B4\uBA85\uC758 \uC138\uACC4\uB85C',
    description: '\uC5B4\uB460\uC774 \uAE43\uB4E0 \uC131\uCC44\uC640 \uBCF4\uB78F\uBE5B \uB9C8\uB825\uC758 \uADE0\uC5F4 \uC18D\uC5D0\uC11C \uC0C8\uB85C\uC6B4 \uB3C4\uC804\uC774 \uC2DC\uC791\uB429\uB2C8\uB2E4. \uC811\uC18D \uBC29\uBC95\uBD80\uD130 \uB358\uC804 \uBCF4\uC0C1, \uCE74\uB4DC \uBF51\uAE30, \uC120\uC220\uC9D1\uAE4C\uC9C0 \uD544\uC694\uD55C \uC815\uBCF4\uB97C \uD55C \uD654\uBA74\uC5D0\uC11C \uBE60\uB974\uAC8C \uD655\uC778\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.',
    notice: '\uACF5\uC9C0\uC0AC\uD56D',
    connect: '\uC811\uC18D\uBC29\uBC95',
    carddraw: '\uCE74\uB4DC\uBF51\uAE30',
    shop: '\uC120\uC220\uC9D1',
    community: '\uCEE4\uBBA4\uB2C8\uD2F0',
    guide: '\uAC00\uC774\uB4DC',
    auction: '\uACBD\uB9E4\uC7A5',
    welcome: '\uB2D8 \uD658\uC601\uD569\uB2C8\uB2E4.',
    loadingBoards: '\uAC8C\uC2DC\uD310\uC744 \uBD88\uB7EC\uC624\uB294 \uC911...',
    loadingPosts: '\uAC8C\uC2DC\uAE00\uC744 \uBD88\uB7EC\uC624\uB294 \uC911\uC785\uB2C8\uB2E4.',
    noBoards: '\uD45C\uC2DC\uD560 \uAC8C\uC2DC\uD310\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.',
    noPosts: '\uAC8C\uC2DC\uAE00\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.',
    search: '\uAC80\uC0C9',
    write: '\uAE00\uC4F0\uAE30',
    home: '\uD648\uC73C\uB85C',
    detail: '\uAC8C\uC2DC\uAE00 \uC0C1\uC138',
    back: '\uBAA9\uB85D\uC73C\uB85C',
    save: '\uC800\uC7A5',
    cancel: '\uCDE8\uC18C',
    titleRequired: '\uC81C\uBAA9\uC740 \uD544\uC218\uC785\uB2C8\uB2E4.',
    contentRequired: '\uB0B4\uC6A9\uC740 \uD544\uC218\uC785\uB2C8\uB2E4.',
    writeDenied: '\uC774 \uAC8C\uC2DC\uD310\uC5D0\uB294 \uAE00\uC4F0\uAE30 \uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.',
    titlePlaceholder: '\uC81C\uBAA9\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694.',
    bodyPlaceholder: '\uB0B4\uC6A9\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694.',
    commentPlaceholder: '\uB313\uAE00\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694.',
    commentsEmpty: '\uB4F1\uB85D\uB41C \uB313\uAE00\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.',
    commentsNeedLogin: '\uB85C\uADF8\uC778\uD574\uC57C \uB313\uAE00\uC744 \uC791\uC131\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.',
    previous: '\uC774\uC804',
    next: '\uB2E4\uC74C',
    number: '\uBC88\uD638',
    titleCol: '\uC81C\uBAA9',
    author: '\uC791\uC131\uC790',
    time: '\uC2DC\uAC04',
    edit: '\uC218\uC815',
    remove: '\uC0AD\uC81C',
    commentWrite: '\uB313\uAE00 \uC791\uC131',
    register: '\uB4F1\uB85D'
  };

  const fallback = {
    hero: {
      background: '/img/main_bg.png?v=20260416_1',
      eyebrow: K.eyebrow,
      title: K.title,
      subtitle: K.subtitle,
      description: K.description
    },
    nav: [
      { label: K.notice, url: '#notice-section' },
      { label: K.connect, url: '#connect-section' },
      { label: K.carddraw, url: '/carddraw/' },
      { label: K.shop, url: '/shop/' },
      { label: K.community, url: '#community-section' },
      { label: K.guide, url: '#guide-section' },
      { label: K.auction, url: '#auction-section' }
    ],
    cards: []
  };

  let boards = [];
  let activeBoard = '';
  let activePage = 1;
  let activeSearch = '';
  let activePostId = 0;
  let editingPostId = 0;
  let user = null;
  let userLoaded = false;
  let editor = null;

  const qs = (selector) => document.querySelector(selector);
  const qsa = (selector) => Array.from(document.querySelectorAll(selector));
  const esc = (value) => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  const fmt = (value) => value ? String(value).replace('T', ' ').slice(0, 16) : '';
  const getBoard = (id) => boards.find((board) => String(board.id) === String(id)) || null;
  const getDefaultBoardId = () => boards[0] ? String(boards[0].id) : '';

  function ensureDialogUi() {
    if (document.getElementById('public-home-dialog-style')) return;
    const style = document.createElement('style');
    style.id = 'public-home-dialog-style';
    style.textContent = `
      .ph-dialog-overlay{position:fixed;inset:0;z-index:20000;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(7,7,13,.72);backdrop-filter:blur(6px)}
      .ph-dialog-card{width:min(460px,calc(100vw - 32px));background:linear-gradient(180deg,rgba(22,16,35,.96),rgba(13,10,20,.98));border:1px solid rgba(218,183,109,.28);border-radius:18px;box-shadow:0 24px 90px rgba(0,0,0,.45);padding:24px;color:#f4ecdc}
      .ph-dialog-card h3{margin:0 0 10px;font-size:22px;font-weight:800;color:#f3dfab}
      .ph-dialog-card p{margin:0;white-space:pre-wrap;line-height:1.7;color:#ddd3bf}
      .ph-dialog-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:20px}
      .ph-dialog-btn{border:1px solid rgba(218,183,109,.28);background:linear-gradient(180deg,rgba(119,72,29,.92),rgba(64,36,18,.96));color:#f7ecd4;border-radius:12px;padding:10px 18px;font-weight:700;cursor:pointer}
      .ph-dialog-btn-cancel{background:rgba(255,255,255,.04);color:#e8dcc1}
      .ph-dialog-progress{display:flex;flex-direction:column;align-items:center;gap:14px;text-align:center}
      .ph-dialog-spinner{display:inline-flex;width:72px;height:72px}
      .ph-dialog-spinner svg{width:72px;height:72px;overflow:visible}
      .ph-dialog-spinner circle{fill:none;stroke-linecap:round}
      .ph-dialog-spinner .ph-spinner-track{stroke:rgba(125,211,252,.18);stroke-width:8}
      .ph-dialog-spinner .ph-spinner-arc{stroke:#7dd3fc;stroke-width:8;stroke-dasharray:46 188;transform-origin:50% 50%;animation:ph-dialog-dashspin 1.2s ease-in-out infinite;filter:drop-shadow(0 0 12px rgba(125,211,252,.4))}
      @keyframes ph-dialog-dashspin{
        0%{transform:rotate(0deg);stroke-dasharray:26 194;stroke-dashoffset:0}
        50%{stroke-dasharray:92 156}
        100%{transform:rotate(360deg);stroke-dasharray:26 194;stroke-dashoffset:-118}
      }
    `;
    document.head.appendChild(style);
  }

  function showDialog({ title = '알림', message = '', showCancel = false, confirmText = '확인', cancelText = '취소' }) {
    if (window.Swal && typeof window.Swal.fire === 'function') {
      return window.Swal.fire({
        title,
        text: message,
        icon: showCancel ? 'question' : 'info',
        showCancelButton: showCancel,
        confirmButtonText: confirmText,
        cancelButtonText: cancelText,
        confirmButtonColor: '#8d6a2f',
        cancelButtonColor: '#46331a'
      }).then((result) => !!result.isConfirmed);
    }
    ensureDialogUi();
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'ph-dialog-overlay';
      overlay.innerHTML = `
        <div class="ph-dialog-card" role="dialog" aria-modal="true">
          <h3></h3>
          <p></p>
          <div class="ph-dialog-actions">
            ${showCancel ? '<button type="button" class="ph-dialog-btn ph-dialog-btn-cancel" data-role="cancel"></button>' : ''}
            <button type="button" class="ph-dialog-btn" data-role="confirm"></button>
          </div>
        </div>`;
      overlay.querySelector('h3').textContent = String(title || '알림');
      overlay.querySelector('p').textContent = String(message || '');
      overlay.querySelector('[data-role="confirm"]').textContent = confirmText;
      const cancelBtn = overlay.querySelector('[data-role="cancel"]');
      if (cancelBtn) cancelBtn.textContent = cancelText;
      const cleanup = (value) => {
        overlay.remove();
        window.removeEventListener('keydown', onKeyDown);
        resolve(value);
      };
      const onKeyDown = (event) => {
        if (event.key === 'Escape' && showCancel) cleanup(false);
        if (event.key === 'Enter') cleanup(true);
      };
      overlay.querySelector('[data-role="confirm"]').addEventListener('click', () => cleanup(true), { once: true });
      if (cancelBtn) cancelBtn.addEventListener('click', () => cleanup(false), { once: true });
      window.addEventListener('keydown', onKeyDown);
      document.body.appendChild(overlay);
    });
  }

  function showProgress(message) {
    ensureDialogUi();
    hideProgress();
    const overlay = document.createElement('div');
    overlay.className = 'ph-dialog-overlay';
    overlay.id = 'public-home-progress';
    overlay.innerHTML = `
      <div class="ph-dialog-card ph-dialog-progress" role="status" aria-live="polite">
        <div class="ph-dialog-spinner" aria-hidden="true">
          <svg viewBox="0 0 104 104">
            <circle class="ph-spinner-track" cx="52" cy="52" r="34"></circle>
            <circle class="ph-spinner-arc" cx="52" cy="52" r="34"></circle>
          </svg>
        </div>
        <h3>잠시만 기다려주세요</h3>
        <p>${esc(message || '처리 중입니다.')}</p>
      </div>`;
    document.body.appendChild(overlay);
  }

  function hideProgress() {
    document.getElementById('public-home-progress')?.remove();
  }

  async function runWithProgress(message, task) {
    showProgress(message);
    try {
      return await task();
    } finally {
      hideProgress();
    }
  }

  const showAlert = (message, title = '알림') => showDialog({ title, message });
  const showConfirm = (message, title = '확인') => showDialog({ title, message, showCancel: true });

  function setText(selector, value) {
    const el = qs(selector);
    if (el) el.textContent = value;
  }

  function sanitize(html) {
    const template = document.createElement('template');
    template.innerHTML = String(html || '');
    template.content.querySelectorAll('script,iframe,object,embed').forEach((el) => el.remove());
    return template.innerHTML;
  }

  function isAdmin() {
    return !!user && (
      Number(user.webRank || user.web_rank || 0) >= 2 ||
      Number(user.gmLevel || 0) > 0 ||
      ((user.permissions || {}).admin_all === true)
    );
  }

  function canWrite(boardId) {
    const board = getBoard(boardId);
    if (!board || !user) return false;
    if (isAdmin()) return true;
    const perms = user.permissions && typeof user.permissions === 'object' ? user.permissions : {};
    return perms.admin_all === true || perms['board_write_' + boardId] === true || Number(user.webRank || user.web_rank || 0) >= Number(board.min_web_write || 999);
  }

  function canEditPost(post) {
    return !!user && (isAdmin() || Number(post.account_id || 0) === Number(user.accountID || user.id || 0));
  }

  function canEditComment(comment) {
    return !!user && (isAdmin() || Number(comment.account_id || 0) === Number(user.accountID || user.id || 0));
  }

  async function loadUser() {
    if (userLoaded) return user;
    userLoaded = true;
    try {
      const res = await fetch('/api/user/status', { headers: { 'X-Background-Request': '1' } });
      if (!res.ok) return null;
      user = await res.json();
      return user;
    } catch {
      return null;
    }
  }

  function applyLoginState() {
    if (!user) return;
    const name = user.mainCharacter && user.mainCharacter.name ? String(user.mainCharacter.name).trim() : String(user.username || '').trim();
    const action = qs('.nav-action');
    if (!action || !name) return;
    action.removeAttribute('href');
    action.classList.add('nav-user');
    action.innerHTML = '<span class="nav-user-avatar" aria-hidden="true"></span><span class="nav-user-text"></span>';
    action.querySelector('.nav-user-text').textContent = name + K.welcome;
  }

  function renderNav(nav) {
    const wrap = qs('.nav-links');
    if (!wrap) return;
    wrap.innerHTML = nav.map((item) => {
      if (item.label === K.notice) {
        return '<span class="nav-dropdown"><a href="/?board=notice" data-public-board-default="notice">' + esc(K.board) + '</a><span class="board-dropdown-menu" id="public-board-menu"><a href="/?board=notice" data-public-board-default="notice">' + esc(K.loadingBoards) + '</a></span></span>';
      }
      return '<a href="' + esc(item.url) + '">' + esc(item.label) + '</a>';
    }).join('');
  }

  function renderCards(cards) {
    const wrap = qs('.challenge-grid');
    if (!wrap || !cards.length) return;
    wrap.innerHTML = cards.map((card, index) => (
      '<article class="challenge-card" style="--bg-img: url(\'' + esc(card.image || '/img/shop_bg.jpg') + '\')">' +
        '<span class="card-number">' + String(index + 1).padStart(2, '0') + '</span>' +
        '<div class="challenge-content">' +
          '<h3>' + esc(card.title || '') + '</h3>' +
          '<p>' + esc(card.description || '') + '</p>' +
          '<a class="btn btn-small" href="' + esc(card.url || '#') + '">자세히 보기</a>' +
        '</div>' +
      '</article>'
    )).join('');
  }

  function applySettings(settings) {
    const data = settings || fallback;
    const hero = data.hero || fallback.hero;
    if (hero.background) {
      document.documentElement.style.setProperty('--public-hero-bg', 'url("' + hero.background + '")');
    }
    setText('.eyebrow', hero.eyebrow || K.eyebrow);
    setText('h1', hero.title || K.title);
    setText('.hero-subtitle', hero.subtitle || K.subtitle);
    setText('.hero-desc', hero.description || K.description);
    qsa('.footer img').forEach((img) => img.setAttribute('src', data.logo || '/img/wowlogo_white.png'));
    renderNav(Array.isArray(data.nav) ? data.nav : fallback.nav);
    renderCards(Array.isArray(data.cards) ? data.cards : []);
  }

  function initEditor() {
    if (editor || typeof Quill === 'undefined') return;
    editor = new Quill('#public-write-editor', {
      theme: 'snow',
      placeholder: K.bodyPlaceholder,
      modules: {
        toolbar: [
          [{ header: [1, 2, 3, false] }],
          ['bold', 'italic', 'underline'],
          [{ list: 'ordered' }, { list: 'bullet' }],
          ['link', 'image'],
          ['clean']
        ]
      }
    });
  }

  function setEditorContent(html) {
    initEditor();
    if (editor) editor.root.innerHTML = html || '';
  }

  function getEditorContent() {
    return editor ? editor.root.innerHTML : String(qs('#public-write-content')?.value || '');
  }

  function showHome(push) {
    qs('#public-home-view').hidden = false;
    qs('#public-board-view').hidden = true;
    if (push) history.pushState({ view: 'home' }, '', '/');
  }

  function showBoard(push) {
    qs('#public-home-view').hidden = true;
    qs('#public-board-view').hidden = false;
    if (push) {
      const nextUrl = activeSearch ? '/?board=' + encodeURIComponent(activeBoard) + '&search=' + encodeURIComponent(activeSearch) : '/?board=' + encodeURIComponent(activeBoard);
      history.pushState({ view: 'board' }, '', nextUrl);
    }
  }

  function showListScreen() {
    qs('#public-board-list-screen').hidden = false;
    qs('#public-post-detail-screen').hidden = true;
    qs('#public-post-write-screen').hidden = true;
  }

  function showDetailScreen() {
    qs('#public-board-list-screen').hidden = true;
    qs('#public-post-detail-screen').hidden = false;
    qs('#public-post-write-screen').hidden = true;
  }

  function showWriteScreen() {
    qs('#public-board-list-screen').hidden = true;
    qs('#public-post-detail-screen').hidden = true;
    qs('#public-post-write-screen').hidden = false;
  }

  async function loadBoards() {
    await loadUser();
    const res = await fetch('/api/board/list', { headers: { 'X-Background-Request': '1' } });
    if (!res.ok) return;
    const data = await res.json();
    boards = Array.isArray(data) ? data.filter((board) => {
      if (isAdmin()) return true;
      const perms = user && user.permissions && typeof user.permissions === 'object' ? user.permissions : {};
      return perms.admin_all === true || perms['board_read_' + board.id] === true || Number(user?.webRank || user?.web_rank || 0) >= Number(board.min_web_read || 0);
    }) : [];

    const list = qs('#public-board-list');
    if (list) {
      list.innerHTML = boards.length
        ? boards.map((board) => '<button class="public-board-btn" type="button" data-public-board="' + esc(board.id) + '">' + esc(board.name) + '</button>').join('')
        : '<div class="public-board-status">' + esc(K.noBoards) + '</div>';
    }

    const menu = qs('#public-board-menu');
    if (menu && boards.length) {
      menu.innerHTML = boards.map((board) => '<a href="/?board=' + encodeURIComponent(board.id) + '" data-public-board="' + esc(board.id) + '">' + esc(board.name) + '</a>').join('');
    } else if (menu) {
      menu.innerHTML = '<a href="/?board=notice" data-public-board-default="notice">' + esc(K.noBoards) + '</a>';
    }
  }

  function renderPosts(posts) {
    const wrap = qs('#public-post-list');
    if (!wrap) return;
    if (!posts.length) {
      wrap.innerHTML = '<div class="public-board-status" style="padding:20px;">' + esc(K.noPosts) + '</div>';
      return;
    }

    wrap.innerHTML = '<div class="public-post-table-wrap"><table class="public-post-table"><thead><tr><th>' + K.number + '</th><th>' + K.titleCol + '</th><th>' + K.author + '</th><th>' + K.time + '</th></tr></thead><tbody>' +
      posts.map((post) => '<tr data-post-id="' + esc(post.id) + '"><td data-label="' + K.number + '">' + esc(post.display_number || post.id || '') + '</td><td data-label="' + K.titleCol + '" class="public-post-title-cell"><span class="public-post-title">' + esc(post.title || K.titleCol) + (Number(post.comment_count || 0) > 0 ? ' <span style="color:#d9b766;">[' + Number(post.comment_count) + ']</span>' : '') + '</span></td><td data-label="' + K.author + '">' + esc(post.author_name || '-') + '</td><td data-label="' + K.time + '">' + esc(fmt(post.created_at)) + '</td></tr>').join('') +
      '</tbody></table></div>';
  }

  function renderPager(page, totalPages) {
    const pager = qs('#public-board-pager');
    if (!pager) return;
    if (totalPages <= 1) {
      pager.innerHTML = '';
      return;
    }
    pager.innerHTML = '<button type="button" data-board-page="' + Math.max(1, page - 1) + '" ' + (page <= 1 ? 'disabled' : '') + '>' + K.previous + '</button>' +
      '<button type="button" disabled>' + page + ' / ' + totalPages + '</button>' +
      '<button type="button" data-board-page="' + Math.min(totalPages, page + 1) + '" ' + (page >= totalPages ? 'disabled' : '') + '>' + K.next + '</button>';
  }

  async function openBoard(boardId, page, search, push) {
    const board = getBoard(boardId);
    if (!board) return;

    activeBoard = String(boardId);
    activePage = page || 1;
    activeSearch = String(search || '').trim();

    qsa('[data-public-board]').forEach((el) => el.classList.toggle('active', el.getAttribute('data-public-board') === String(boardId)));
    setText('#public-board-title', board.name);
    setText('#public-board-view-title', board.name);
    setText('#public-post-write-title', board.name + ' 글 작성');
    setText('#public-board-status', K.loadingPosts);

    const searchInput = qs('#public-board-search');
    if (searchInput) searchInput.value = activeSearch;

    const writeBtn = qs('#public-board-write-btn');
    if (writeBtn) writeBtn.style.display = canWrite(boardId) ? 'inline-flex' : 'none';

    showListScreen();
    showBoard(push !== false);

    const query = new URLSearchParams({ board_id: boardId, page: String(activePage), limit: '20' });
    if (activeSearch) query.set('search', activeSearch);

    const res = await fetch('/api/board/posts?' + query.toString(), { headers: { 'X-Background-Request': '1' } });
    if (!res.ok) {
      qs('#public-post-list').innerHTML = '<div class="public-board-status" style="padding:20px;">' + esc(K.loadingPosts) + '</div>';
      return;
    }

    const data = await res.json();
    renderPosts(data.posts || []);
    renderPager(Number(data.page || activePage), Number(data.totalPages || 1));
    setText('#public-board-status', '총 ' + Number(data.total || 0) + '개');
  }

  function renderComments(comments) {
    if (!comments.length) return '<div class="public-comment">' + K.commentsEmpty + '</div>';
    return comments.map((comment) => (
      '<div class="public-comment">' +
        '<div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;">' +
          '<strong>' + esc(comment.author_name || '-') + '</strong>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
            '<span style="color:#9d93ae;font-size:12px;">' + esc(fmt(comment.created_at)) + '</span>' +
            (canEditComment(comment) ? '<button class="btn btn-small" type="button" data-delete-comment-id="' + esc(comment.id) + '">' + K.remove + '</button>' : '') +
          '</div>' +
        '</div>' +
        '<div style="margin-top:8px;white-space:pre-wrap;">' + esc(comment.content || '') + '</div>' +
      '</div>'
    )).join('');
  }

  async function openPost(postId) {
    activePostId = Number(postId || 0);
    showDetailScreen();
    const detail = qs('#public-post-detail');
    detail.innerHTML = '<div class="public-board-status">' + K.loadingPosts + '</div>';

    const res = await fetch('/api/board/post?id=' + encodeURIComponent(postId), { headers: { 'X-Background-Request': '1' } });
    if (!res.ok) {
      detail.innerHTML = '<div class="public-board-status">' + K.loadingPosts + '</div>';
      return;
    }

    const data = await res.json();
    const post = data.post || {};
    const comments = Array.isArray(data.comments) ? data.comments : [];
    detail.innerHTML = '<h3>' + esc(post.title || K.titleCol) + '</h3>' +
      '<div class="public-post-meta">' + esc(post.author_name || '-') + ' · ' + esc(fmt(post.created_at)) + ' · 조회 ' + Number(post.views || 0) + '</div>' +
      (canEditPost(post)
        ? '<div class="public-post-write-actions" style="margin-top:16px;justify-content:flex-start;"><button class="btn btn-small" type="button" id="public-post-edit-btn">' + K.edit + '</button><button class="btn btn-small" type="button" id="public-post-delete-btn">' + K.remove + '</button></div>'
        : '') +
      '<div class="public-post-content">' + sanitize(post.content || '') + '</div>' +
      '<div class="public-comments"><h4 style="margin:0 0 6px;color:#f3dfab;">댓글 ' + comments.length + '</h4>' + renderComments(comments) +
      (user
        ? '<div class="public-comment" style="margin-top:8px;"><strong>' + K.commentWrite + '</strong><textarea id="comment-input" class="public-board-textarea" style="min-height:120px;margin-top:10px;" placeholder="' + K.commentPlaceholder + '"></textarea><div class="public-post-write-actions" style="margin-top:10px;"><button class="btn btn-small" type="button" id="public-comment-submit-btn">' + K.register + '</button></div></div>'
        : '<div class="public-comment">' + K.commentsNeedLogin + '</div>') +
      '</div>';
  }

  async function savePost() {
    const title = String(qs('#public-write-title')?.value || '').trim();
    const content = String(getEditorContent() || '').trim();
    if (!title) { await showAlert(K.titleRequired); return; }
    if (!content || content === '<p><br></p>') { await showAlert(K.contentRequired); return; }

    const endpoint = editingPostId ? '/api/board/post/update' : '/api/board/post/create';
    const payload = editingPostId ? { id: editingPostId, title, content } : { board_id: activeBoard, title, content };
    const res = await runWithProgress('게시글을 저장하는 중입니다.', () => fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Background-Request': '1' },
      body: JSON.stringify(payload)
    }));

    if (!res.ok) {
      await showAlert((await res.text()) || '게시글 저장에 실패했습니다.');
      return;
    }

    editingPostId = 0;
    await openBoard(activeBoard, 1, '', false);
  }

  async function deletePost() {
    if (!activePostId || !(await showConfirm('게시글을 삭제하시겠습니까?'))) return;
    const res = await runWithProgress('게시글을 삭제하는 중입니다.', () => fetch('/api/board/post/delete?id=' + encodeURIComponent(activePostId), {
      method: 'POST',
      headers: { 'X-Background-Request': '1' }
    }));
    if (!res.ok) {
      await showAlert('게시글 삭제에 실패했습니다.');
      return;
    }
    activePostId = 0;
    await openBoard(activeBoard, activePage, activeSearch, false);
  }

  async function submitComment() {
    const content = String(qs('#comment-input')?.value || '').trim();
    if (!content) { await showAlert(K.contentRequired); return; }

    const res = await runWithProgress('댓글을 등록하는 중입니다.', () => fetch('/api/board/comment/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Background-Request': '1' },
      body: JSON.stringify({ post_id: activePostId, content: content })
    }));

    if (!res.ok) {
      await showAlert((await res.text()) || '댓글 등록에 실패했습니다.');
      return;
    }
    await openPost(activePostId);
  }

  async function deleteComment(id) {
    if (!(await showConfirm('댓글을 삭제하시겠습니까?'))) return;
    const res = await runWithProgress('댓글을 삭제하는 중입니다.', () => fetch('/api/board/comment/delete?id=' + encodeURIComponent(id), {
      method: 'POST',
      headers: { 'X-Background-Request': '1' }
    }));
    if (!res.ok) {
      await showAlert((await res.text()) || '댓글 삭제에 실패했습니다.');
      return;
    }
    await openPost(activePostId);
  }

  async function restoreView() {
    const params = new URLSearchParams(location.search);
    const boardId = params.get('board');
    activeSearch = String(params.get('search') || '').trim();
    if (boardId && getBoard(boardId)) {
      await openBoard(boardId, 1, activeSearch, false);
      return;
    }
    showHome(false);
  }

  document.addEventListener('DOMContentLoaded', async function () {
    try {
      const res = await fetch('/api/public/home', { headers: { 'X-Background-Request': '1' } });
      const payload = res.ok ? await res.json() : { content: fallback };
      applySettings(payload.content || fallback);
    } catch {
      applySettings(fallback);
    }

    await loadBoards();
    await loadUser();
    applyLoginState();
    initEditor();
    await restoreView();
  });

  document.addEventListener('click', async function (event) {
    const defaultBoard = event.target.closest('[data-public-board-default]');
    if (defaultBoard) {
      event.preventDefault();
      await openBoard(getBoard('notice') ? 'notice' : getDefaultBoardId(), 1, '', true);
      return;
    }

    const board = event.target.closest('[data-public-board]');
    if (board) {
      event.preventDefault();
      await openBoard(board.getAttribute('data-public-board'), 1, '', true);
      return;
    }

    const anchor = event.target.closest('.nav-links a');
    if (anchor) {
      const href = anchor.getAttribute('href') || '';
      if (href.startsWith('#')) {
        event.preventDefault();
        showHome(true);
        setTimeout(() => document.querySelector(href)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 20);
      }
      return;
    }

    const post = event.target.closest('[data-post-id]');
    if (post) {
      await openPost(post.getAttribute('data-post-id'));
      return;
    }

    const page = event.target.closest('[data-board-page]');
    if (page && !page.disabled) {
      await openBoard(activeBoard, Number(page.getAttribute('data-board-page') || activePage || 1), activeSearch, true);
      return;
    }

    if (event.target?.id === 'public-board-home-btn') {
      showHome(true);
      return;
    }

    if (event.target?.id === 'public-post-close') {
      showListScreen();
      return;
    }

    if (event.target?.id === 'public-board-write-btn') {
      if (!canWrite(activeBoard)) {
        await showAlert(K.writeDenied);
        return;
      }
      editingPostId = 0;
      showWriteScreen();
      setText('#public-post-write-title', (getBoard(activeBoard)?.name || '게시판') + ' 글 작성');
      qs('#public-write-title').value = '';
      setEditorContent('');
      return;
    }

    if (event.target?.id === 'public-write-cancel-btn') {
      showListScreen();
      return;
    }

    if (event.target?.id === 'public-write-submit-btn') {
      await savePost();
      return;
    }

    if (event.target?.id === 'public-post-edit-btn') {
      const res = await fetch('/api/board/post?id=' + encodeURIComponent(activePostId), { headers: { 'X-Background-Request': '1' } });
      if (!res.ok) {
        await showAlert('게시글 정보를 불러오지 못했습니다.');
        return;
      }
      const data = await res.json();
      if (!canEditPost(data.post || {})) {
        await showAlert('수정 권한이 없습니다.');
        return;
      }
      editingPostId = Number((data.post || {}).id || 0);
      showWriteScreen();
      setText('#public-post-write-title', (getBoard(activeBoard)?.name || '게시판') + ' 글 수정');
      qs('#public-write-title').value = String((data.post || {}).title || '');
      setEditorContent(String((data.post || {}).content || ''));
      return;
    }

    if (event.target?.id === 'public-post-delete-btn') {
      await deletePost();
      return;
    }

    if (event.target?.id === 'public-comment-submit-btn') {
      await submitComment();
      return;
    }

    const deleteCommentButton = event.target.closest('[data-delete-comment-id]');
    if (deleteCommentButton) {
      await deleteComment(deleteCommentButton.getAttribute('data-delete-comment-id'));
    }
  });

  document.addEventListener('keydown', async function (event) {
    if (event.target?.id === 'public-board-search' && event.key === 'Enter') {
      activeSearch = String(event.target.value || '').trim();
      await openBoard(activeBoard || getDefaultBoardId(), 1, activeSearch, true);
    }
  });

  document.addEventListener('click', async function (event) {
    if (event.target?.id === 'public-board-search-btn') {
      activeSearch = String(qs('#public-board-search')?.value || '').trim();
      await openBoard(activeBoard || getDefaultBoardId(), 1, activeSearch, true);
    }
  });

  window.addEventListener('popstate', async function () {
    await restoreView();
  });
})();

