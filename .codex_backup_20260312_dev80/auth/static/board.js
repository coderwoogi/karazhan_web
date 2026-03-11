// ========================================
// Board Module - board.js
// ========================================

// Global State
let g_currentBoard = null;
let g_currentBoardPage = 1;
let g_currentPostId = null;
let g_currentUser = null;
let quillEditor = null;

// ========================================
// Initialization
// ========================================
function initBoard(user) {
    g_currentUser = user;
    
    // Update write button if it exists and we're on a board
    const writeBtn = document.getElementById('board-write-btn');
    if (writeBtn) {
        // Default to false, check board_write_<currentBoard>
        let canWrite = false;
        if (g_currentUser && g_currentUser.permissions) {
            canWrite = g_currentUser.permissions[`board_write_${g_currentBoard}`] === true;
        }
        writeBtn.style.display = canWrite ? 'inline-flex' : 'none';
    }
}
window.initBoard = initBoard;

// ========================================
// Board Navigation
// ========================================
async function openBoard(boardId) {
    g_currentBoard = boardId;
    g_currentBoardPage = 1;

    // Update board title
    const titles = { 'notice': '공지사항', 'free': '자유게시판' };
    const boardTitle = document.getElementById('board-title');
    if (boardTitle && titles[boardId]) boardTitle.textContent = titles[boardId];

    // Show write button if has permission
    const writeBtn = document.getElementById('board-write-btn');
    if (writeBtn) {
        let canWrite = false;
        if (g_currentUser && g_currentUser.permissions) {
            canWrite = g_currentUser.permissions[`board_write_${boardId}`] === true;
        }
        writeBtn.style.display = canWrite ? 'inline-flex' : 'none';
    }

    // Switch to board tab
    if (typeof openTab === 'function') openTab('board');

    showBoardListView();
    await loadPosts(1);
}
window.openBoard = openBoard;

function showBoardListView() {
    const listView = document.getElementById('board-list-view');
    const detailView = document.getElementById('board-detail-view');
    const writeView = document.getElementById('board-write-view');
    const filterBar = document.querySelector('#board .filter-bar');
    if (listView) listView.style.display = 'flex';
    if (detailView) detailView.style.display = 'none';
    if (writeView) writeView.style.display = 'none';
    if (filterBar) filterBar.style.display = 'flex';
}

function showBoardDetailView(pushHistory) {
    const listView = document.getElementById('board-list-view');
    const detailView = document.getElementById('board-detail-view');
    const writeView = document.getElementById('board-write-view');
    const filterBar = document.querySelector('#board .filter-bar');
    if (listView) listView.style.display = 'none';
    if (detailView) detailView.style.display = 'block';
    if (writeView) writeView.style.display = 'none';
    if (filterBar) filterBar.style.display = 'none';
}

function showBoardWriteView() {
    const listView = document.getElementById('board-list-view');
    const detailView = document.getElementById('board-detail-view');
    const writeView = document.getElementById('board-write-view');
    const filterBar = document.querySelector('#board .filter-bar');
    if (listView) listView.style.display = 'none';
    if (detailView) detailView.style.display = 'none';
    if (writeView) writeView.style.display = 'block';
    if (filterBar) filterBar.style.display = 'none';
}

// ========================================
// Board List (Sidebar)
// ========================================
async function loadBoardsToSidebar() {
    try {
        const res = await fetch('/api/board/list');
        if (!res.ok) return;
        const data = await res.json();
        const boards = data.boards || [];

        const container = document.getElementById('board-sidebar-list');
        if (!container) return;

        container.innerHTML = '';
        boards.forEach(board => {
            // Check if user has read permission for this board
            let canRead = true; // Default to true if permissions not yet loaded or for compatibility
            if (g_currentUser && g_currentUser.permissions) {
                canRead = g_currentUser.permissions[`board_read_${board.id}`] === true;
            }
            if (!canRead) return;

            const item = document.createElement('div');
            item.className = 'sidebar-board-item';
            item.textContent = board.name;
            item.onclick = () => {
                const boardTitle = document.getElementById('board-title');
                if (boardTitle) boardTitle.textContent = board.name;
                openBoard(board.id);
                switchTab('board');
            };
            container.appendChild(item);
        });
    } catch (e) {
        console.error('Failed to load boards:', e);
    }
}
window.loadBoardsToSidebar = loadBoardsToSidebar;

// ========================================
// Post List
// ========================================
async function loadPosts(page) {
    g_currentBoardPage = page;
    const searchEl = document.getElementById('board-search');
    const search = searchEl ? searchEl.value : '';
    const searchTypeEl = document.getElementById('board-search-type');
    const searchType = searchTypeEl ? searchTypeEl.value : 'title_content';

    try {
        const res = await fetch(`/api/board/posts?board_id=${g_currentBoard}&page=${page}&limit=20&search=${encodeURIComponent(search)}&search_type=${searchType}`);
        const data = await res.json();

        const posts = data.posts || [];
        const total = data.total || 0;
        const totalPages = data.total_pages || 1;

        renderPostList(posts, total);
        renderBoardPagination(page, totalPages);
    } catch (e) {
        console.error('Failed to load posts:', e);
    }
}

function renderPostList(posts, total) {
    const container = document.getElementById('board-posts-container');
    if (!container) return;

    if (posts.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding: 3rem; color: #94a3b8;">게시글이 없습니다.</div>';
        return;
    }

    const isMobile = window.innerWidth <= 768;
    const pageSize = 20;

    if (isMobile) {
        container.innerHTML = `
            <ul style="list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:12px;">
                ${posts.map((post, idx) => {
                    const virtualNum = total - ((g_currentBoardPage - 1) * pageSize) - idx;
                    return `
                    <li onclick="viewPost(${post.id})" style="background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:16px; cursor:pointer; box-shadow:0 2px 8px rgba(0,0,0,0.04);">
                        <div style="font-weight:700; font-size:1rem; color:#1e293b; margin-bottom:8px;">
                            <span style="color:#94a3b8; font-size:0.85rem; margin-right:8px;">#${virtualNum}</span>
                            ${escapeHtml(post.title)}
                        </div>
                        <div style="font-size:0.8rem; color:#94a3b8; display:flex; gap:12px; flex-wrap:wrap;">
                            <span>${escapeHtml(post.author_name)}</span>
                            <span>|</span>
                            <span>${post.created_at}</span>
                        </div>
                    </li>
                `;
                }).join('')}
            </ul>
        `;
    } else {
        container.innerHTML = `
            <div class="scroll-table premium-table">
                <table>
                    <thead>
                        <tr>
                            <th style="width:60px;">번호</th>
                            <th>제목</th>
                            <th style="width:120px;">작성자</th>
                            <th style="width:160px;">작성일</th>
                            <th style="width:60px;">조회</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${posts.map((post, idx) => {
                            const virtualNum = total - ((g_currentBoardPage - 1) * pageSize) - idx;
                            return `
                            <tr onclick="viewPost(${post.id})" style="cursor:pointer;">
                                <td style="text-align:center; color:#94a3b8;">${virtualNum}</td>
                                <td style="font-weight:500;">${escapeHtml(post.title)}</td>
                                <td style="text-align:center;">${escapeHtml(post.author_name)}</td>
                                <td style="text-align:center; font-size:0.85rem; color:#64748b;">${post.created_at}</td>
                                <td style="text-align:center;">${post.views || 0}</td>
                            </tr>
                        `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }
}

function renderBoardPagination(currentPage, totalPages) {
    const container = document.getElementById('board-pagination');
    if (!container) return;

    if (totalPages <= 1) {
        container.innerHTML = `<span style="color:#94a3b8; font-size:0.9rem;">${currentPage} / ${totalPages}</span>`;
        return;
    }

    let html = '';
    if (currentPage > 1) {
        html += `<button onclick="loadPosts(${currentPage - 1})" class="btn" style="padding:6px 12px;">&laquo;</button>`;
    }
    for (let i = 1; i <= totalPages; i++) {
        if (i === currentPage) {
            html += `<button class="btn btn-primary" style="padding:6px 12px;">${i}</button>`;
        } else {
            html += `<button onclick="loadPosts(${i})" class="btn" style="padding:6px 12px;">${i}</button>`;
        }
    }
    if (currentPage < totalPages) {
        html += `<button onclick="loadPosts(${currentPage + 1})" class="btn" style="padding:6px 12px;">&raquo;</button>`;
    }
    container.innerHTML = html;
}

function resetBoardSearch() {
    const searchEl = document.getElementById('board-search');
    const searchTypeEl = document.getElementById('board-search-type');
    if (searchEl) searchEl.value = '';
    if (searchTypeEl) searchTypeEl.value = 'title_content';
    loadPosts(1);
}

function refreshBoard() {
    loadPosts(g_currentBoardPage);
}

// ========================================
// Post Detail View
// ========================================
async function viewPost(id, pushHistory) {
    g_currentPostId = id;

    try {
        const res = await fetch(`/api/board/post?id=${id}`);
        if (!res.ok) {
            alert('게시글을 불러올 수 없습니다');
            return;
        }

        const data = await res.json();
        const post = data.post;
        const comments = data.comments || [];

        const detailView = document.getElementById('board-detail-view');
        const currentUserId = g_currentUser ? g_currentUser.id : null;
        const canDelete = post.author_id === currentUserId;

        detailView.innerHTML = `
            <div style="display: flex; justify-content: space-between; margin-bottom: 1.5rem; align-items: center;">
                <button onclick="showBoardListView()" class="btn" style="background: #e2e8f0; color: #475569; padding: 8px 16px; border-radius: 8px; font-weight: 600;">
                    <i class="fas fa-arrow-left" style="margin-right: 6px;"></i> 목록으로
                </button>
                <div style="display: flex; gap: 0.5rem;">
                    ${canDelete ? `<button onclick="deletePost(${id})" class="btn btn-stop" style="padding: 8px 16px; border-radius: 8px;">삭제</button>` : ''}
                </div>
            </div>

            <div style="border-bottom: 1px solid #e2e8f0; padding-bottom: 1.5rem; margin-bottom: 1.5rem;">
                <h2 style="margin: 0 0 1rem 0; font-size: 1.5rem; color: #1e293b; font-weight: 800; line-height: 1.4;">${escapeHtml(post.title)}</h2>
                <div style="display: flex; gap: 1rem; color: #64748b; font-size: 0.9rem; flex-wrap: wrap;">
                    <span style="display: flex; align-items: center; gap: 6px;"><i class="fas fa-user-circle" style="color: var(--primary-color);"></i> ${escapeHtml(post.author_name)}</span>
                    <span style="display: flex; align-items: center; gap: 6px; color: #94a3b8;">|</span>
                    <span style="display: flex; align-items: center; gap: 6px;"><i class="far fa-clock"></i> ${post.created_at}</span>
                    <span style="display: flex; align-items: center; gap: 6px; color: #94a3b8;">|</span>
                    <span style="display: flex; align-items: center; gap: 6px;"><i class="far fa-eye"></i> ${post.views || 0}</span>
                </div>
            </div>

            <div style="min-height: 200px; line-height: 1.8; color: #334155; font-size: 1.05rem; white-space: pre-wrap;">${post.content}</div>

            <hr style="margin: 3rem 0; border: 0; border-top: 1px solid #e2e8f0;">

            <div class="comments-section">
                <h4 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 1.5rem; display: flex; align-items: center; gap: 8px;">
                    <i class="far fa-comments" style="color: var(--primary-color);"></i> 댓글 <span style="color: var(--primary-color);">${comments.length}</span>
                </h4>

                <div id="post-comments-list" style="display: flex; flex-direction: column; gap: 1rem;">
                    ${renderComments(comments)}
                </div>

                <div style="margin-top: 2rem; background: #f8fafc; padding: 1.5rem; border-radius: 12px; border: 1px solid #e2e8f0;">
                    <textarea id="comment-input" placeholder="댓글을 남겨주세요..."
                        style="width: 100%; padding: 12px; border: 1px solid #cbd5e1; border-radius: 8px; min-height: 80px; resize: vertical; margin-bottom: 1rem; font-size: 0.95rem; box-sizing: border-box;"></textarea>
                    <div style="display: flex; justify-content: flex-end;">
                        <button onclick="submitComment(${id})" class="btn btn-primary" style="padding: 10px 24px; font-weight: 600; border-radius: 8px;">댓글 작성</button>
                    </div>
                </div>
            </div>
        `;

        showBoardDetailView(pushHistory);

    } catch (e) {
        console.error('Failed to load post:', e);
        alert('게시글을 불러오는 중 오류가 발생했습니다');
    }
}

function renderComments(comments) {
    if (!comments || comments.length === 0) {
        return '<div style="text-align:center; padding: 2rem; color: #94a3b8;">첫 번째 댓글을 남겨보세요!</div>';
    }

    return comments.map(comment => {
        const currentUserId = g_currentUser ? g_currentUser.id : null;
        const canDelete = comment.author_id === currentUserId;
        return `
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 1rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                    <span style="font-weight: 600; color: #1e293b; font-size: 0.9rem;">${escapeHtml(comment.author_name)}</span>
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <span style="font-size: 0.8rem; color: #94a3b8;">${comment.created_at}</span>
                        ${canDelete ? `<button onclick="deleteComment(${comment.id})" style="background:none; border:none; color:#ef4444; cursor:pointer; font-size:0.8rem;">삭제</button>` : ''}
                    </div>
                </div>
                <div style="color: #334155; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(comment.content)}</div>
            </div>
        `;
    }).join('');
}

// ========================================
// Post Write / Edit
// ========================================
function openPostWriteModal() {
    showBoardWriteView();
    initQuillEditor();
}
window.openPostWriteModal = openPostWriteModal;

function initQuillEditor() {
    if (!quillEditor) {
        quillEditor = new Quill('#board-post-editor', {
            theme: 'snow',
            placeholder: '내용을 입력하세요...',
            modules: {
                toolbar: [
                    [{ 'header': [1, 2, 3, false] }],
                    ['bold', 'italic', 'underline', 'strike'],
                    [{ 'color': [] }, { 'background': [] }],
                    [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                    ['link', 'image'],
                    ['clean']
                ]
            }
        });
    } else {
        quillEditor.setContents([]);
    }
}

async function submitPost() {
    const titleEl = document.getElementById('board-post-title');
    const title = titleEl ? titleEl.value.trim() : '';

    if (!title) {
        alert('제목을 입력하세요');
        return;
    }

    let content = '';
    if (quillEditor) {
        content = quillEditor.root.innerHTML;
    }

    if (!content || content === '<p><br></p>') {
        alert('내용을 입력하세요');
        return;
    }

    try {
        const res = await fetch('/api/board/post/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                board_id: g_currentBoard,
                title: title,
                content: content
            })
        });

        if (res.ok) {
            showBoardListView();
            loadPosts(1);
        } else {
            alert('게시글 작성에 실패했습니다');
        }
    } catch (e) {
        console.error('Failed to submit post:', e);
        alert('게시글 작성 중 오류가 발생했습니다');
    }
}

function cancelPostWrite() {
    showBoardListView();
}
window.cancelPostWrite = cancelPostWrite;

function closePostWrite() {
    showBoardListView();
}
window.closePostWrite = closePostWrite;

// ========================================
// Post Delete
// ========================================
async function deletePost(id) {
    if (!confirm('게시글을 삭제하시겠습니까?')) return;

    try {
        const res = await fetch(`/api/board/post/delete?id=${id}`, { method: 'POST' });
        if (res.ok) {
            showBoardListView();
            loadPosts(g_currentBoardPage);
        } else {
            alert('삭제 실패');
        }
    } catch (e) {
        console.error('Failed to delete post:', e);
        alert('삭제 중 오류가 발생했습니다');
    }
}

// ========================================
// Comments
// ========================================
async function submitComment(postId, parentId) {
    const contentEl = document.getElementById('comment-input');
    const content = contentEl ? contentEl.value.trim() : '';

    if (!content) {
        alert('내용을 입력하세요');
        return;
    }

    try {
        const res = await fetch('/api/board/comment/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                post_id: postId,
                content: content,
                parent_id: parentId
            })
        });

        if (res.ok) {
            if (contentEl) contentEl.value = '';
            await viewPost(postId, false);
        } else {
            alert('댓글 작성에 실패했습니다');
        }
    } catch (e) {
        console.error('Failed to submit comment:', e);
        alert('댓글 작성 중 오류가 발생했습니다');
    }
}

async function deleteComment(commentId) {
    if (!confirm('댓글을 삭제하시겠습니까?')) return;

    try {
        const res = await fetch(`/api/board/comment/delete?id=${commentId}`, { method: 'POST' });
        if (res.ok) {
            await viewPost(g_currentPostId, false);
        } else {
            alert('댓글 삭제에 실패했습니다');
        }
    } catch (e) {
        console.error('Failed to delete comment:', e);
        alert('댓글 삭제 중 오류가 발생했습니다');
    }
}

// ========================================
// Utility
// ========================================
function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ========================================
// Board Write Button Visibility
// ========================================
function updateBoardWriteBtn(user) {
    g_currentUser = user;
    const writeBtn = document.getElementById('board-write-btn');
    if (writeBtn) {
        writeBtn.style.display = user ? 'inline-flex' : 'none';
    }
}

// ========================================
// URL Hash Navigation
// ========================================
window.addEventListener('hashchange', function() {
    const hash = window.location.hash;
    if (hash.startsWith('#board/post/')) {
        const postId = parseInt(hash.replace('#board/post/', ''));
        if (postId) viewPost(postId, false);
    }
});
