// Board System - Complete Rebuild (No TinyMCE, View Switching)
let g_currentBoard = 'notice';
let g_currentBoardPage = 1;
let g_currentPostId = null;
let g_allBoards = [];
let g_currentBoardSettings = null; // Store current board's feature settings

// Browser History Management
// popstate listener moved to the bottom of the file

function updateSidebarActive(boardID) {
    const allBoardBtns = document.querySelectorAll('[id^="tab-btn-board-"]');
    allBoardBtns.forEach(btn => btn.classList.remove('active'));
    
    const boardBtn = document.getElementById(`tab-btn-board-${boardID}`);
    if (boardBtn) boardBtn.classList.add('active');
    
    // Also update title if needed
    loadBoardSettings(boardID).then(() => {
        const boardTitle = document.getElementById('board-title');
        if (boardTitle) {
            boardTitle.innerText = (g_currentBoardSettings && g_currentBoardSettings.name) ? g_currentBoardSettings.name : boardID.toUpperCase() + ' Board';
        }
    });
}

// ========================================
// Board Navigation
// ========================================
window.openBoard = async function(boardID) {
    console.log(`[DEBUG] openBoard called with: ${boardID}`);
    g_currentBoard = boardID;
    g_currentBoardPage = 1;
    openTab('board');
    
    updateSidebarActive(boardID);
    
    showBoardListView();
    loadPosts(1);
    checkBoardPermissions();
}

async function loadBoardSettings(boardID) {
    try {
        const res = await fetch('/api/board/list');
        const boards = await res.json();
        g_currentBoardSettings = boards.find(b => b.id === boardID);
        
        if (!g_currentBoardSettings) {
            // Default settings if board not found
            g_currentBoardSettings = {
                allow_attachments: true,
                allow_rich_editor: true,
                allow_emoji: true,
                allow_nested_comments: true
            };
        }
    } catch (e) {
        console.error('Failed to load board settings:', e);
        // Default settings on error
        g_currentBoardSettings = {
            allow_attachments: true,
            allow_rich_editor: true,
            allow_emoji: true,
            allow_nested_comments: true
        };
    }
}

async function checkBoardPermissions() {
    const writeBtn = document.getElementById('board-write-btn');
    if (writeBtn) {
        writeBtn.style.display = 'inline-block';
    }
}

// ========================================
// View Switching
// ========================================
window.showBoardListView = function(pushHistory = true) {
    document.getElementById('board-list-view').style.setProperty('display', 'flex', 'important');
    document.getElementById('board-pagination').style.setProperty('display', 'flex', 'important');
    document.getElementById('board-detail-view').style.setProperty('display', 'none', 'important');
    document.getElementById('board-write-view').style.display = 'none';
    
    if (pushHistory) {
        history.pushState(
            { view: 'list', board: g_currentBoard, page: g_currentBoardPage },
            '',
            `#board/${g_currentBoard}`
        );
    }
}

function showBoardDetailView(pushHistory = true) {
    document.getElementById('board-list-view').style.setProperty('display', 'none', 'important');
    document.getElementById('board-pagination').style.setProperty('display', 'none', 'important');
    document.getElementById('board-detail-view').style.setProperty('display', 'flex', 'important'); // or block, but board.js uses flex
    document.getElementById('board-write-view').style.display = 'none';
    
    // Also hide search bar if it's separate? CSS says #board-list-view .card-header
    // Since #board-list-view is hidden, the search should be hidden too (it's inside it).
    
    window.scrollTo(0, 0);

    if (pushHistory) {
        history.pushState(
            { view: 'detail', postId: g_currentPostId, board: g_currentBoard },
            '',
            `#board/${g_currentBoard}/post/${g_currentPostId}`
        );
    }
}

function showBoardWriteView(pushHistory = true) {
    document.getElementById('board-list-view').style.display = 'none';
    document.getElementById('board-detail-view').style.display = 'none';
    document.getElementById('board-write-view').style.display = 'flex';
    
    if (pushHistory) {
        history.pushState(
            { view: 'write', board: g_currentBoard },
            '',
            `#board/${g_currentBoard}/write`
        );
    }
}

// ========================================
// Post List
// ========================================
async function loadPosts(page = 1) {
    g_currentBoardPage = page;
    const searchEl = document.getElementById('board-search');
    const search = searchEl ? searchEl.value : '';
    const searchTypeEl = document.getElementById('board-search-type');
    const searchType = searchTypeEl ? searchTypeEl.value : 'title_content';
    
    try {
        const res = await fetch(`/api/board/posts?board_id=${g_currentBoard}&page=${page}&limit=20&search=${encodeURIComponent(search)}&search_type=${searchType}`);
        const data = await res.json();
        
        g_totalPosts = data.total || 0; // Store total for numbering calculation
        
        renderPosts(data.posts || []);
        renderPagination(data.page, data.totalPages);
    } catch (e) {
        console.error('Failed to load posts:', e);
    }
}

function renderPosts(posts) {
    const container = document.getElementById('board-posts-container');
    if (!container) return;

    if (window.innerWidth <= 768) {
        // --- MOBILE MODE: Semantic UL/LI ---
        if (!posts || posts.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding: 40px; color: #94a3b8;">게시글이 없습니다</div>';
            return;
        }

        container.innerHTML = `
            <ul class="mobile-post-list">
                ${posts.map(p => `
                    <li class="mobile-post-item" onclick="viewPost(${p.id})">
                        <span class="post-title">${escapeHtml(p.title)}</span>
                        <div class="post-meta">
                            <span class="author">${escapeHtml(p.author_name)}</span>
                            <span class="divider">|</span>
                            <span class="date">${escapeHtml(p.created_at)}</span>
                        </div>
                    </li>
                `).join('')}
            </ul>
        `;
    } else {
        // --- PC MODE: Traditional Table ---
        if (!posts || posts.length === 0) {
            container.innerHTML = `
                <div class="scroll-table premium-table">
                    <table>
                        <thead>
                            <tr>
                                <th style="width: 80px; text-align: center;">번호</th>
                                <th>제목</th>
                                <th style="width: 150px; text-align: center;">작성자</th>
                                <th style="width: 150px; text-align: center;">날짜</th>
                                <th style="width: 80px; text-align: center;">조회</th>
                            </tr>
                        </thead>
                        <tbody><tr><td colspan="5" style="text-align:center; padding: 40px; color: #94a3b8;">게시글이 없습니다</td></tr></tbody>
                    </table>
                </div>
            `;
            return;
        }

        const offset = (g_currentBoardPage - 1) * 20;
        const rows = posts.map((p, index) => {
            const postNumber = g_totalPosts - offset - index;
            return `
            <tr class="board-post-row" onclick="viewPost(${p.id})">
                <td class="col-no">${postNumber}</td>
                <td class="col-title">
                    <div class="post-title-wrapper">
                        <strong class="post-title">${escapeHtml(p.title)}</strong>
                    </div>
                </td>
                <td class="col-author">${escapeHtml(p.author_name)}</td>
                <td class="col-date">${escapeHtml(p.created_at)}</td>
                <td class="col-views">${p.views || 0}</td>
            </tr>
            `;
        }).join('');

        container.innerHTML = `
            <div class="scroll-table premium-table">
                <table>
                    <thead>
                        <tr>
                            <th style="width: 80px; text-align: center;">번호</th>
                            <th>제목</th>
                            <th style="width: 150px; text-align: center;">작성자</th>
                            <th style="width: 150px; text-align: center;">날짜</th>
                            <th style="width: 80px; text-align: center;">조회</th>
                        </tr>
                    </thead>
                    <tbody id="board-posts-list">${rows}</tbody>
                </table>
            </div>
        `;
    }
}

function renderPagination(currentPage, totalPages) {
    const container = document.getElementById('board-pagination');
    if (!container) return;

    if (window.innerWidth <= 768) {
        // Mobile style: "Current / Total" matching screenshot
        container.innerHTML = `<div class="mobile-pagination-info">${currentPage} / ${totalPages}</div>`;
        return;
    }

    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }
    
    let html = '';
    for (let i = 1; i <= totalPages; i++) {
        if (i === currentPage) {
            html += `<button class="btn btn-primary" style="padding: 6px 12px; margin: 0 2px;">${i}</button>`;
        } else {
            html += `<button class="btn" style="padding: 6px 12px; margin: 0 2px; background: #f1f5f9; color: #64748b;" onclick="loadPosts(${i})">${i}</button>`;
        }
    }
    container.innerHTML = html;
}

function resetBoardSearch() {
    document.getElementById('board-search').value = '';
    loadPosts(1);
}

function searchPosts() {
    loadPosts(1);
}

function refreshBoard() {
    loadPosts(g_currentBoardPage);
}

// ========================================
// Post Detail View
// ========================================
async function viewPost(id, pushHistory = true) {
    g_currentPostId = id;
    
    try {
        const res = await fetch(`/api/board/post?id=${id}`);
        if (!res.ok) {
            alert('게시글을 불러올 수 없습니다');
            return;
        }
        
        const data = await res.json();
        const post = data.post;  // API returns {post: {...}, comments: [...]}
        const comments = data.comments || [];  // Get comments from same response
        
        const detailView = document.getElementById('board-detail-view');
        detailView.innerHTML = `
            <div style="display: flex; justify-content: space-between; margin-bottom: 1.5rem; align-items: center;">
                <button onclick="showBoardListView()" class="btn" style="background: #e2e8f0; color: #475569; padding: 8px 16px; border-radius: 8px; font-weight: 600;">
                    <i class="fas fa-arrow-left" style="margin-right: 6px;"></i> 목록으로
                </button>
                <div style="display: flex; gap: 0.5rem;">
                    ${post.author_id === (g_currentUser && g_currentUser.id) ? `<button onclick="deletePost(${id})" class="btn btn-stop" style="padding: 8px 16px; border-radius: 8px;">삭제</button>` : ''}
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
                        style="width: 100%; padding: 12px; border: 1px solid #cbd5e1; border-radius: 8px; min-height: 80px; resize: vertical; margin-bottom: 1rem; font-size: 0.95rem;"></textarea>
                    <div style="display: flex; justify-content: flex-end;">
                        <button onclick="submitComment(${id})" class="btn btn-primary" style="padding: 10px 24px; font-weight: 600; border-radius: 8px;">댓글 작성</button>
                    </div>
                </div>
            </div>
        `;
        
        showBoardDetailView(pushHistory);
        renderComments(comments);  // Render comments from initial response
        
    } catch (e) {
        console.error('Failed to load post:', e);
        alert('게시글을 불러오는 중 오류가 발생했습니다');
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

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
        alert('오류 발생');
    }
}

// Comment pagination
let g_commentPage = 1;
let g_commentPageSize = 10;
let g_allComments = [];

function renderComments(comments) {
    g_allComments = comments;
    g_commentPage = 1;
    renderCommentPage();
}

function renderCommentPage() {
    const totalComments = g_allComments.length;
    document.getElementById('comment-count').textContent = totalComments;
    
    const commentList = document.getElementById('comment-list');
    if (totalComments === 0) {
        commentList.innerHTML = '<p style="text-align: center; color: #94a3b8; padding: 2rem;">첫 댓글을 작성해보세요!</p>';
        return;
    }
    
    // Build tree structure
    const tree = buildCommentTree(g_allComments);
    
    // Flatten tree for pagination
    const flatComments = flattenCommentTree(tree);
    
    // Paginate
    const totalPages = Math.ceil(flatComments.length / g_commentPageSize);
    const start = (g_commentPage - 1) * g_commentPageSize;
    const end = start + g_commentPageSize;
    const pageComments = flatComments.slice(start, end);
    
    // Render comments
    commentList.innerHTML = pageComments.map(item => renderSingleComment(item.comment, item.depth)).join('');
    
    // Render pagination
    renderCommentPagination(g_commentPage, totalPages);
}

function flattenCommentTree(tree, depth = 0) {
    let result = [];
    tree.forEach(comment => {
        result.push({ comment, depth });
        if (comment.children && comment.children.length > 0) {
            result = result.concat(flattenCommentTree(comment.children, depth + 1));
        }
    });
    return result;
}

function renderSingleComment(c, depth) {
    const indent = depth * 40;
    const bgColor = depth > 0 ? '#f8fafc' : 'white';
    const borderLeft = depth > 0 ? '3px solid #3b82f6' : 'none';
    const arrow = depth > 0 ? '<span style="color: #3b82f6; margin-right: 0.5rem;">↳</span>' : '';
    
    // Check if nested comments are allowed and depth limit
    const maxDepth = (g_currentBoardSettings && g_currentBoardSettings.allow_nested_comments) ? 2 : 0;
    const showReplyButton = depth < maxDepth;
    
    return `
        <div style="margin-left: ${indent}px; padding: 1rem; border-left: ${borderLeft}; margin-bottom: 0.75rem; background: ${bgColor}; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    ${arrow}
                    <span style="font-weight: 600; color: #1e293b;">${escapeHtml(c.author_name)}</span>
                    <span style="font-size: 0.75rem; color: #94a3b8;">•</span>
                    <span style="font-size: 0.875rem; color: #64748b;">${c.created_at}</span>
                </div>
            </div>
            <div style="color: #334155; margin-bottom: 0.75rem; white-space: pre-wrap; padding-left: ${depth > 0 ? '1.5rem' : '0'};">${escapeHtml(c.content)}</div>
            ${showReplyButton ? `<button onclick="showReplyForm(${c.id})" class="btn" style="font-size: 0.75rem; padding: 4px 12px; background: #3b82f6; color: white;"><i class="fas fa-reply"></i> 답글</button>` : ''}
            <div id="reply-form-${c.id}" style="display: none; margin-top: 1rem; padding-left: ${depth > 0 ? '1.5rem' : '0'};"></div>
        </div>
    `;
}

function renderCommentPagination(currentPage, totalPages) {
    const container = document.getElementById('comment-pagination');
    if (!container) return;
    
    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }
    
    let html = '<div style="display: flex; justify-content: center; gap: 0.5rem; margin-top: 1rem;">';
    
    // Previous button
    if (currentPage > 1) {
        html += `<button class="btn" style="padding: 6px 12px; background: #f1f5f9; color: #64748b;" onclick="changeCommentPage(${currentPage - 1})">이전</button>`;
    }
    
    // Page numbers
    for (let i = 1; i <= totalPages; i++) {
        if (i === currentPage) {
            html += `<button class="btn btn-primary" style="padding: 6px 12px;">${i}</button>`;
        } else {
            html += `<button class="btn" style="padding: 6px 12px; background: #f1f5f9; color: #64748b;" onclick="changeCommentPage(${i})">${i}</button>`;
        }
    }
    
    // Next button
    if (currentPage < totalPages) {
        html += `<button class="btn" style="padding: 6px 12px; background: #f1f5f9; color: #64748b;" onclick="changeCommentPage(${currentPage + 1})">다음</button>`;
    }
    
    html += '</div>';
    container.innerHTML = html;
}

function changeCommentPage(page) {
    g_commentPage = page;
    renderCommentPage();
}

async function reloadComments() {
    try {
        const res = await fetch(`/api/board/post?id=${g_currentPostId}`);
        const data = await res.json();
        renderComments(data.comments || []);
    } catch (e) {
        console.error('Failed to reload comments:', e);
    }
}

function buildCommentTree(comments) {
    const map = {};
    const roots = [];
    
    comments.forEach(c => {
        c.children = [];
        map[c.id] = c;
    });
    
    comments.forEach(c => {
        if (c.parent_id && map[c.parent_id]) {
            map[c.parent_id].children.push(c);
        } else {
            roots.push(c);
        }
    });
    
    return roots;
}

function showReplyForm(parentId) {
    const formDiv = document.getElementById(`reply-form-${parentId}`);
    formDiv.style.display = 'block';
    formDiv.innerHTML = `
        <textarea id="reply-content-${parentId}" placeholder="답글을 입력하세요" 
                  style="width: 100%; padding: 8px; border: 1px solid #e2e8f0; border-radius: 6px; min-height: 60px; font-family: inherit; resize: vertical;"></textarea>
        <div style="margin-top: 0.5rem; display: flex; gap: 0.5rem;">
            <button onclick="submitComment(${g_currentPostId}, ${parentId})" class="btn btn-primary" style="font-size: 0.875rem;">답글 작성</button>
            <button onclick="document.getElementById('reply-form-${parentId}').style.display='none'" class="btn" style="font-size: 0.875rem; background: #e2e8f0; color: #475569;">취소</button>
        </div>
    `;
}

async function submitComment(postId, parentId) {
    const contentId = parentId ? `reply-content-${parentId}` : 'comment-content';
    const content = document.getElementById(contentId).value;
    
    if (!content.trim()) {
        alert('내용을 입력하세요');
        return;
    }
    
    try {
        const res = await fetch('/api/board/comment/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                post_id: postId,
                content,
                parent_id: parentId
            })
        });
        
        if (res.ok) {
            document.getElementById(contentId).value = '';
            if (parentId) {
                document.getElementById(`reply-form-${parentId}`).style.display = 'none';
            }
            reloadComments();  // Reload comments after creation
        } else {
            alert('댓글 작성 실패');
        }
    } catch (e) {
        alert('오류 발생');
    }
}

// ========================================
// Post Write
// ========================================
let quillEditor = null;

function initQuillEditor() {
    // Check if rich editor is allowed for this board
    if (!g_currentBoardSettings || !g_currentBoardSettings.allow_rich_editor) {
        // Use plain textarea instead
        const editorContainer = document.getElementById('board-post-editor');
        if (editorContainer && !editorContainer.querySelector('textarea')) {
            editorContainer.innerHTML = '<textarea id="board-post-content-plain" placeholder="내용을 입력하세요" style="width: 100%; min-height: 400px; padding: 12px; border: none; font-family: inherit; resize: vertical;"></textarea>';
        }
        quillEditor = null;
        return;
    }
    
    // Initialize Quill editor if allowed
    if (!quillEditor) {
        quillEditor = new Quill('#board-post-editor', {
            theme: 'snow',
            placeholder: '내용을 입력하세요...',
            modules: {
                toolbar: [
                    [{ 'header': [1, 2, 3, false] }],
                    ['bold', 'italic', 'underline', 'strike'],
                    [{ 'color': [] }, { 'background': [] }],
                    [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                    [{ 'align': [] }],
                    ['link', 'image'],
                    ['clean']
                ]
            }
        });
    }
}

function openPostWriteModal() {
    document.getElementById('board-post-title').value = '';
    
    // Initialize Quill if not already done
    initQuillEditor();
    
    // Clear editor content
    quillEditor.setContents([]);
    
    showBoardWriteView();
}

function closePostWrite() {
    showBoardListView();
}

async function submitPost() {
    const title = document.getElementById('board-post-title').value;
    let content;
    
    // Get content based on editor type
    if (quillEditor && g_currentBoardSettings && g_currentBoardSettings.allow_rich_editor) {
        content = quillEditor.root.innerHTML;  // Get HTML content from Quill
        
        if (!quillEditor.getText().trim()) {
            alert('내용을 입력하세요');
            return;
        }
    } else {
        // Get plain text content
        const plainTextarea = document.getElementById('board-post-content-plain');
        content = plainTextarea ? plainTextarea.value : '';
        
        if (!content.trim()) {
            alert('내용을 입력하세요');
            return;
        }
    }

    if (!title.trim()) {
        alert('제목을 입력하세요');
        return;
    }

    try {
        const res = await fetch('/api/board/post/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                board_id: g_currentBoard,
                title,
                content
            })
        });

        if (res.ok) {
            closePostWrite();
            loadPosts(1);
        } else {
            alert('게시글 작성 실패');
        }
    } catch (e) {
        alert('오류 발생');
    }
}

// ========================================
// Board Admin (CMS)
// ========================================
async function loadBoardListAdmin() {
    try {
        const res = await fetch('/api/board/list');
        const boards = await res.json();
        g_allBoards = boards;
        renderBoardAdminList(boards);
    } catch (e) {
        console.error('Failed to load boards:', e);
    }
}

function renderBoardAdminList(boards) {
    const list = document.getElementById('board-admin-list');
    
    list.innerHTML = boards.map(b => `
        <tr>
            <td><code>${b.id}</code></td>
            <td style="font-weight:700;">${b.name}</td>
            <td style="text-align:center;">${b.min_gm_read}</td>
            <td style="text-align:center;">${b.min_gm_write}</td>
            <td style="text-align:center;">
                ${b.id === 'notice' ? 
                    `<button class="btn" style="padding:2px 8px; font-size:0.8rem; background:#3b82f6; color:white;" onclick="editBoard('${b.id}')"><i class="fas fa-edit"></i> 수정</button>` : 
                    `<button class="btn" style="padding:2px 8px; font-size:0.8rem; background:#3b82f6; color:white;" onclick="editBoard('${b.id}')"><i class="fas fa-edit"></i> 수정</button>
                     <button class="btn btn-stop" style="padding:2px 8px; font-size:0.8rem;" onclick="deleteBoard('${b.id}')">삭제</button>`
                }
            </td>
        </tr>
    `).join('');
    
    // Also update sidebar when in admin page
    renderBoardsToSidebar(boards);
}

async function loadBoardsToSidebar() {
    try {
        const res = await fetch('/api/board/list');
        const boards = await res.json();
        renderBoardsToSidebar(boards);
    } catch (e) {
        console.error('Failed to load boards:', e);
    }
}

function renderBoardsToSidebar(boards) {
    const sideBoards = document.getElementById('sidebar-boards');
    if (!sideBoards) return;
    
    // Get current user's GM level (from global state if available)
    const userGMLevel = window.g_user ? (window.g_user.gmlevel || 0) : 0;
    
    // Filter boards by read permission
    const visibleBoards = boards.filter(b => (b.min_gm_read || 0) <= userGMLevel);
    
    // Separate notice from other boards
    const noticeBoard = visibleBoards.find(b => b.id === 'notice');
    const otherBoards = visibleBoards.filter(b => b.id !== 'notice');
    
    let html = '';
    
    // Always show notice board first if user has permission
    if (noticeBoard) {
        html += `
            <div id="tab-btn-board-notice" class="nav-item tab-btn" onclick="openBoard('notice')">
                <i class="fas fa-bullhorn"></i> ${noticeBoard.name}
            </div>
        `;
    }
    
    // Add other boards
    html += otherBoards.map(b => `
        <div id="tab-btn-board-${b.id}" class="nav-item tab-btn" onclick="openBoard('${b.id}')">
            <i class="fas fa-list-alt"></i> ${b.name}
        </div>
    `).join('');
    
    sideBoards.innerHTML = html;
}

function openBoardCreateModal() {
    document.getElementById('board-def-id').value = '';
    document.getElementById('board-def-name').value = '';
    document.getElementById('board-def-read').value = '0';
    document.getElementById('board-def-write').value = '0';
    document.getElementById('board-def-attachments').checked = true;
    document.getElementById('board-def-richeditor').checked = true;
    document.getElementById('board-def-emoji').checked = true;
    document.getElementById('board-def-nested').checked = true;
    
    // Enable ID field for new board
    document.getElementById('board-def-id').disabled = false;
    document.getElementById('board-def-id').style.background = 'white';
    
    document.getElementById('board-def-modal').classList.add('active');
}

async function editBoard(boardId) {
    try {
        const res = await fetch('/api/board/list');
        const boards = await res.json();
        const board = boards.find(b => b.id === boardId);
        
        if (!board) {
            alert('게시판을 찾을 수 없습니다');
            return;
        }
        
        // Fill modal with existing data
        document.getElementById('board-def-id').value = board.id;
        document.getElementById('board-def-name').value = board.name;
        document.getElementById('board-def-read').value = board.min_gm_read || 0;
        document.getElementById('board-def-write').value = board.min_gm_write || 0;
        document.getElementById('board-def-attachments').checked = board.allow_attachments !== false;
        document.getElementById('board-def-richeditor').checked = board.allow_rich_editor !== false;
        document.getElementById('board-def-emoji').checked = board.allow_emoji !== false;
        document.getElementById('board-def-nested').checked = board.allow_nested_comments !== false;
        
        // Disable ID field (cannot change primary key)
        document.getElementById('board-def-id').disabled = true;
        document.getElementById('board-def-id').style.background = '#f1f5f9';
        
        document.getElementById('board-def-modal').classList.add('active');
        
    } catch (e) {
        console.error('Failed to load board:', e);
        alert('게시판 정보를 불러올 수 없습니다');
    }
}

function closeBoardDefModal() {
    document.getElementById('board-def-modal').classList.remove('active');
}

async function submitBoardDef() {
    const idField = document.getElementById('board-def-id');
    const id = idField.value;
    const name = document.getElementById('board-def-name').value;
    const minGMRead = parseInt(document.getElementById('board-def-read').value);
    const minGMWrite = parseInt(document.getElementById('board-def-write').value);
    
    const allowAttachments = document.getElementById('board-def-attachments').checked;
    const allowRichEditor = document.getElementById('board-def-richeditor').checked;
    const allowEmoji = document.getElementById('board-def-emoji').checked;
    const allowNestedComments = document.getElementById('board-def-nested').checked;

    if (!id || !name) {
        alert('ID와 이름을 입력하세요');
        return;
    }

    const isEditMode = idField.disabled;
    const endpoint = isEditMode ? '/api/admin/board/update' : '/api/admin/board/create';
    const successMsg = isEditMode ? '게시판이 수정되었습니다' : '게시판이 생성되었습니다';

    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id,
                name,
                min_gm_read: minGMRead,
                min_gm_write: minGMWrite,
                allow_attachments: allowAttachments,
                allow_rich_editor: allowRichEditor,
                allow_emoji: allowEmoji,
                allow_nested_comments: allowNestedComments
            })
        });

        if (res.ok) {
            closeBoardDefModal();
            loadBoardListAdmin();
            alert(successMsg);
        } else {
            alert('저장 실패');
        }
    } catch (e) {
        alert('오류 발생');
    }
}

async function deleteBoard(id) {
    if (id === 'notice') return alert('공지사항은 삭제할 수 없습니다.');
    if (!confirm('게시판을 삭제하면 모든 게시물과 댓글이 사라집니다. 계속할까요?')) return;
    
    try {
        const res = await fetch(`/api/admin/board/delete?id=${id}`, { method: 'POST' });
        if (res.ok) loadBoardListAdmin();
    } catch (e) {
        alert('오류 발생');
    }
}

function filterBoardAdmin() {
    const search = document.getElementById('board-admin-search').value.toLowerCase();
    if (!search) {
        renderBoardAdminList(g_allBoards);
        return;
    }
    
    const filtered = g_allBoards.filter(b => 
        b.id.toLowerCase().includes(search) || 
        b.name.toLowerCase().includes(search)
    );
    renderBoardAdminList(filtered);
}

function resetBoardAdminSearch() {
    document.getElementById('board-admin-search').value = '';
    renderBoardAdminList(g_allBoards);
}

// ========================================
// Browser History Management
// ========================================
window.addEventListener('popstate', function(event) {
    console.log('[DEBUG] Popstate event:', event.state);
    if (event.state && event.state.view) {
        switch(event.state.view) {
            case 'list':
                console.log(`[DEBUG] Navigating to list: ${event.state.board}`);
                if (event.state.board) {
                    g_currentBoard = event.state.board;
                    g_currentBoardPage = event.state.page || 1;
                }
                showBoardListView(false);
                updateSidebarActive(g_currentBoard);
                loadPosts(g_currentBoardPage);
                break;
            case 'detail':
                console.log(`[DEBUG] Navigating to detail: post ${event.state.postId} in board ${event.state.board}`);
                if (event.state.board) {
                    g_currentBoard = event.state.board;
                }
                if (event.state.postId) {
                    updateSidebarActive(g_currentBoard);
                    viewPost(event.state.postId, false);
                }
                break;
            case 'write':
                showBoardWriteView(false);
                break;
            default:
                showBoardListView(false);
        }
    } else {
        // Handle cases where there is no state (e.g. initial load or manually changed hash)
        const hash = window.location.hash;
        console.log(`[DEBUG] No state in popstate, hash: ${hash}`);
        if (hash.startsWith('#board/')) {
            const parts = hash.split('/');
            const boardID = parts[1];
            if (boardID) openBoard(boardID);
        }
    }
});
