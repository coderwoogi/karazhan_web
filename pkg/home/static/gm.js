// GM Manager - Premium Redesign
var GMManager = {
    currentModule: null,
    modules: [],
    homeSliderItems: [],
    homeSliderEditId: 0,
    
    // Switch between Sub-Tabs (Modules / Memos)
    // Calendar State
    calendarInstance: null,
    selectedDate: new Date().toISOString().split('T')[0],
    monthData: {}, // Cache for month's todos { "2024-02-09": [task, task] }
    inquiryPage: 1,
    promotionPage: 1,
    promotionRows: [],
    promotionSelectedIds: new Set(),
    promotionDetailPostId: 0,
    inquiryReplyPostId: 0,
    inquiryPointTarget: null,
    renderInquiryCategoryBadge(category) {
        const label = String(category || '').trim() || '-';
        const safe = window.escapeHtml ? window.escapeHtml(label) : label;
        const map = {
            '건의': { icon: 'fa-lightbulb', bg: '#fef3c7', fg: '#92400e', bd: '#fcd34d' },
            '질문': { icon: 'fa-circle-question', bg: '#dbeafe', fg: '#1e40af', bd: '#93c5fd' },
            '후원': { icon: 'fa-hand-holding-heart', bg: '#dcfce7', fg: '#166534', bd: '#86efac' },
            '기타': { icon: 'fa-folder-open', bg: '#f1f5f9', fg: '#334155', bd: '#cbd5e1' }
        };
        const style = map[label] || map['기타'];
        return `<span style="display:inline-flex; align-items:center; gap:6px; background:${style.bg}; color:${style.fg}; border:1px solid ${style.bd}; padding:4px 10px; border-radius:999px; font-size:0.8rem; font-weight:700; white-space:nowrap;"><i class="fas ${style.icon}"></i>${safe}</span>`;
    },
    renderInquiryStatusBadge(status) {
        const v = String(status || '').toLowerCase().trim();
        const map = {
            'received': { label: '접수', bg: '#e0e7ff', fg: '#3730a3', bd: '#c7d2fe', icon: 'fa-inbox' },
            'in_progress': { label: '진행중', bg: '#fef3c7', fg: '#92400e', bd: '#fcd34d', icon: 'fa-person-digging' },
            'done': { label: '완료', bg: '#dcfce7', fg: '#166534', bd: '#86efac', icon: 'fa-circle-check' },
            'point_paid': { label: '지급완료', bg: '#ffedd5', fg: '#9a3412', bd: '#fdba74', icon: 'fa-coins' }
        };
        const style = map[v] || map['received'];
        return `<span style="display:inline-flex; align-items:center; gap:6px; background:${style.bg}; color:${style.fg}; border:1px solid ${style.bd}; padding:4px 10px; border-radius:999px; font-size:0.8rem; font-weight:700; white-space:nowrap;"><i class="fas ${style.icon}"></i>${style.label}</span>`;
    },
    isSuperAdmin() {
        const user = window.g_sessionUser || window.currentUser || {};
        const webRank = Number(user.webRank ?? user.web_rank ?? 0);
        return webRank >= 2;
    },

    switchSubTab(tabName) {
        // Enforce strict isolation
        document.querySelectorAll('#gm .log-sub-tab-btn').forEach(btn => btn.classList.remove('active'));
        
        // Hide all content divs explicitly and strictly
        ['todos', 'modules', 'memos', 'events', 'inquiries', 'home-slider', 'promotion'].forEach(name => {
            const el = document.getElementById(`gm-sub-${name}`);
            if(el) {
                el.style.display = 'none'; // Force hide
                el.classList.remove('active');
            }
        });

        // Activate button
        const tabs = ['todos', 'events', 'home-slider', 'promotion', 'inquiries', 'modules', 'memos'];
        const index = tabs.indexOf(tabName);
        if (index !== -1) {
             const btns = document.querySelectorAll('#gm .log-sub-tab-btn');
             if(btns[index]) btns[index].classList.add('active');
        }

        // Show Content
        const content = document.getElementById(`gm-sub-${tabName}`);
        if (content) {
            content.style.display = (tabName === 'todos' || tabName === 'events') ? 'flex' : (tabName === 'modules' ? 'flex' : 'block');
            if (tabName === 'modules') content.style.flexDirection = 'column'; // Restore flex-col for modules
            content.classList.add('active');
        }

        if (tabName === 'modules' && this.modules.length === 0) {
            loadGMModules();
        } else if (tabName === 'home-slider') {
            this.loadHomeSliderAdmin();
        } else if (tabName === 'promotion') {
            this.promotionDetailPostId = 0;
            this.promotionSelectedIds = new Set();
            this.closePromotionDetailModal();
            this.loadPromotionRewardConfig();
            this.loadPromotionVerifyConfig();
            this.loadPromotions(1);
        } else if (tabName === 'memos') {
             this.loadGlobalMemos();
        } else if (tabName === 'inquiries') {
             this.loadInquiries(1);
        } else if (tabName === 'todos' || tabName === 'events') {
             this.initFullCalendar(tabName);
             this.renderTodoList(tabName);
             
             // Brute force: Force render/resize repeatedly
             let attempts = 0;
             const interval = setInterval(() => {
                 attempts++;
                 if (this.calendarInstance) {
                     this.calendarInstance.updateSize();
                     this.calendarInstance.render();
                 }
                 if (attempts >= 10) clearInterval(interval);
             }, 100);
        }
    },

    initFullCalendar(mode = 'todos') {
        const calendarEl = document.getElementById(mode === 'events' ? 'calendar-events' : 'calendar');
        if (!calendarEl) return; 

        // If instance exists, destroy it first to ensure clean state
        if (this.calendarInstance) {
            this.calendarInstance.destroy();
            this.calendarInstance = null;
        }

        const apiPath = mode === 'events' ? '/api/gm/events/list' : '/api/gm/todos';

        this.calendarInstance = new FullCalendar.Calendar(calendarEl, {
            initialView: 'dayGridMonth',
            locale: 'ko',
            height: '100%',
            handleWindowResize: true,
            selectable: true, // Enable selection
            headerToolbar: {
                left: 'prev,next today',
                center: 'title',
                right: '' 
            },
            titleFormat: { year: 'numeric', month: 'long' },
            events: (fetchInfo, successCallback, failureCallback) => {
                const viewCenter = new Date(fetchInfo.start.valueOf() + 15 * 24 * 60 * 60 * 1000);
                const year = viewCenter.getFullYear();
                const month = viewCenter.getMonth() + 1;
                const str = `${year}-${String(month).padStart(2,'0')}`;
                
                fetch(`${apiPath}?month=${str}`)
                    .then(res => res.json())
                    .then(data => {
                        const events = (data || []).map(item => ({
                            title: item.title || item.content, // Events use title, Todos use content
                            start: item.target_date,
                            color: mode === 'events' ? '#8b5cf6' : (item.is_completed ? '#cbd5e1' : '#3b82f6'),
                            borderColor: mode === 'events' ? '#7c3aed' : (item.is_completed ? '#cbd5e1' : '#3b82f6'),
                            textColor: 'white',
                            extendedProps: { ...item, type: mode }
                        }));
                        successCallback(events);
                        
                        this.monthData = {}; 
                         (data || []).forEach(t => {
                            const d = t.target_date.split('T')[0];
                            if(!this.monthData[d]) this.monthData[d] = [];
                            this.monthData[d].push(t);
                         });
                         
                         // Refresh view if date selected
                         if(this.selectedDate) this.renderTodoList(mode);
                    })
                    .catch(err => {
                        console.error("Fetch Error:", err);
                        failureCallback(err);
                    });
            },
            dateClick: (info) => {
                this.selectDate(info.dateStr, mode);
                // Visual Highlight
                document.querySelectorAll('.fc-daygrid-day').forEach(el => el.style.backgroundColor = '');
                if(info.dayEl) info.dayEl.style.backgroundColor = '#eff6ff';
            },
            eventClick: (info) => {
                this.selectDate(info.event.startStr.split('T')[0], mode);
            }
        });
        this.calendarInstance.render();
    },

    loadToday(mode = 'todos') {
        if(this.calendarInstance) {
            this.calendarInstance.today();
            const now = new Date();
            const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
            this.selectDate(dateStr, mode);
        }
    },

    loadMonthData() {
        if(this.calendarInstance) this.calendarInstance.refetchEvents();
    },

    // Old manual methods removed/replaced
    // changeMonth, renderCalendar removed.

    selectDate(dateStr, mode) {
        this.selectedDate = dateStr;
        this.renderTodoList(mode);
        
        document.querySelectorAll('.fc-daygrid-day').forEach(el => el.style.backgroundColor = '');
        const dayEl = document.querySelector(`.fc-daygrid-day[data-date="${dateStr}"]`);
        if(dayEl) dayEl.style.backgroundColor = '#eff6ff';
    },

    renderTodoList(mode = 'todos') {
        const container = document.getElementById(mode === 'events' ? 'gm-event-list' : 'gm-todo-list');
        const title = document.getElementById(mode === 'events' ? 'gm-event-date-title' : 'gm-selected-date-title');
        
        if (title) {
            const d = new Date(this.selectedDate);
            const dayName = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
            title.innerHTML = `<span style="color:${mode === 'events' ? '#8b5cf6' : '#3b82f6'};">${d.getMonth() + 1}월 ${d.getDate()}일</span> <span style="font-weight:normal; color:#64748b;">(${dayName})</span> ${mode === 'events' ? '일정' : '업무'}`;
        }

        if (!container) return;
        container.innerHTML = '';

        const items = this.monthData[this.selectedDate] || [];

        if (items.length === 0) {
            container.innerHTML = `<div style="text-align:center; padding:40px 20px; color:#cbd5e1;">      
                <i class="far fa-calendar-${mode === 'events' ? 'alt' : 'times'}" style="font-size:2rem; margin-bottom:10px;"></i>
                <div style="font-size:0.9rem;">등록된 ${mode === 'events' ? '일정이' : '업무가'} 없습니다.</div>
            </div>`;
            return;
        }

        items.forEach(item => {
            const el = document.createElement('div');
            el.className = 'todo-item-card';
            el.style = `background:white; border:1px solid #e2e8f0; border-radius:8px; padding:12px; margin-bottom:10px; opacity:${item.is_completed ? 0.6 : 1}; transition:all 0.2s; box-shadow:0 1px 2px rgba(0,0,0,0.02);`;
            
            if (mode === 'events') {
                // Event Rendering
                const formattedContent = (item.content || '').replace(/\n/g, '<br>');
                el.innerHTML = `
                    <div style="display:flex; justify-content:space-between; margin-bottom:8px; align-items:flex-start;">
                         <div style="font-weight:700; color:#1e293b; font-size:1rem;">${item.title}</div>
                         <button onclick="GMManager.deleteEvent(${item.id})" style="border:none; background:none; cursor:pointer; color:#ef4444; opacity:0.6;" title="??젣" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.6">
                            <i class="fas fa-trash"></i>
                         </button>
                    </div>
                    <div style="font-size:0.85rem; color:#64748b; margin-bottom:6px;">
                        <i class="far fa-clock"></i> ${item.start_time ? item.start_time.substring(0,5) : '?섎（ 醫낆씪'} 
                        <span style="margin:0 4px; color:#cbd5e1;">|</span>
                        <i class="fas fa-user-edit"></i> ${item.author}
                    </div>
                    <div style="font-size:0.95rem; color:#334155; line-height:1.5;">${formattedContent}</div>
                `;
            } else {
                // Todo Rendering
                const formattedContent = item.content.replace(/\n/g, '<br>');
                el.innerHTML = `
                    <div style="display:flex; justify-content:space-between; margin-bottom:8px; align-items:flex-start;">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span style="font-weight:600; font-size:0.9rem; color:#1e293b; background:#f1f5f9; padding:2px 6px; border-radius:4px;">${item.author}</span>
                            ${item.participants ? `<span style="font-size:0.8rem; color:#0284c7; background:#e0f2fe; padding:2px 6px; border-radius:4px;">@${item.participants}</span>` : ''}
                        </div>
                        <div style="display:flex; gap:8px;">
                             <button onclick="GMManager.toggleTodo(${item.id}, ${!item.is_completed})" style="border:none; background:none; cursor:pointer; color:${item.is_completed ? '#10b981' : '#cbd5e1'};" title="${item.is_completed ? '?꾨즺 痍⑥냼' : '?꾨즺 泥섎━'}">
                                <i class="fas fa-check-circle fa-lg"></i>
                             </button>
                             <button onclick="GMManager.deleteTodo(${item.id})" style="border:none; background:none; cursor:pointer; color:#ef4444; opacity:0.6;" title="??젣" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.6">
                                <i class="fas fa-trash"></i>
                             </button>
                        </div>
                    </div>
                    <div style="font-size:0.95rem; color:#334155; line-height:1.5; ${item.is_completed ? 'text-decoration:line-through; color:#94a3b8;' : ''}">${formattedContent}</div>
                `;
            }
            container.appendChild(el);
        });
    },

    submitInlineTodo() {
        const author = document.getElementById('inline-todo-author').value || 'GM';
        const participants = document.getElementById('inline-todo-participants').value;
        const content = document.getElementById('inline-todo-content').value;
        
        if (!content.trim()) return ModalUtils.showModalUtils.showAlert("일정 등록 실패");

        fetch('/api/gm/todos/add', {
            method: 'POST',
            body: JSON.stringify({ author, participants, content, target_date: this.selectedDate })
        })
        .then(() => {
            document.getElementById('inline-todo-content').value = ''; // clear input
            this.loadMonthData(); // reload to refresh calendar + list
        });
    },

    submitInlineEvent() {
        const title = document.getElementById('inline-event-title').value;
        const startTime = document.getElementById('inline-event-start').value;
        const endTime = document.getElementById('inline-event-end').value;
        const content = document.getElementById('inline-event-content').value;

        if (!title.trim()) return ModalUtils.showModalUtils.showAlert("일정 등록 실패");

        const payload = {
            title: title,
            content: content,
            target_date: this.selectedDate,
            start_time: startTime ? startTime + ":00" : "00:00:00",
            end_time: endTime ? endTime + ":00" : "00:00:00"
        };

        fetch('/api/gm/events/add', {
            method: 'POST',
            body: JSON.stringify(payload)
        })
        .then(res => {
            if(!res.ok) throw new Error("Failed");
            return res.json();
        })
        .then(() => {
            // Clear inputs
            document.getElementById('inline-event-title').value = '';
            document.getElementById('inline-event-content').value = '';
            document.getElementById('inline-event-start').value = '';
            document.getElementById('inline-event-end').value = '';
            this.loadMonthData();
        })
        .catch(err => {
            console.error(err);
            ModalUtils.showAlert("일정 등록 실패");
        });
    },

    deleteEvent(id) {
        ModalUtils.showConfirm("?뺣쭚 ???쇱젙????젣?섏떆寃좎뒿?덇퉴?", () => {
             fetch('/api/gm/events/delete', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ id: id })
            })
            .then(() => this.loadMonthData())
            .catch(err => console.error(err));
        });
    },

    toggleTodo(id, status) {
        fetch('/api/gm/todos/update', {
            method: 'POST',
            body: JSON.stringify({ id: id, status: status })
        }).then(() => this.loadMonthData());
    },

    deleteTodo(id) {
        ModalUtils.showConfirm("??젣?섏떆寃좎뒿?덇퉴?", () => {
             fetch('/api/gm/todos/delete', {
                method: 'POST',
                body: JSON.stringify({ id: id })
            }).then(() => this.loadMonthData());
        });
    },

    openAddTodoModal() {
        const dateInput = document.getElementById('gm-todo-date');
        const date = dateInput ? dateInput.value : new Date().toISOString().split('T')[0];
        
        // Remove existing modal if any
        const existing = document.getElementById('gm-todo-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'gm-todo-modal';
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content" style="max-width:500px; padding:24px;">
                <h3 style="margin-bottom:20px; font-size:1.25rem; color:#1e293b;"><i class="fas fa-calendar-plus"></i> ?낅Т 異붽? (${date})</h3>
                
                <div style="display:flex; gap:15px; margin-bottom:15px;">
                    <div style="flex:1;">
                        <label style="display:block; font-size:0.9rem; color:#64748b; margin-bottom:5px;">?묒꽦??/label>
                        <input type="text" id="todo-author" class="input-premium" style="width:100%;" placeholder="?? GM ?띻만?? value="GM">
                    </div>
                    <div style="flex:1;">
                        <label style="display:block; font-size:0.9rem; color:#64748b; margin-bottom:5px;">李몄뿬??/label>
                        <input type="text" id="todo-participants" class="input-premium" style="width:100%;" placeholder="?? 媛쒕컻?, 湲고쉷?">
                    </div>
                </div>
                
                <div style="margin-bottom:24px;">
                    <label style="display:block; font-size:0.9rem; color:#64748b; margin-bottom:5px;">?낅Т ?댁슜</label>
                    <textarea id="todo-content" class="input-premium" style="width:100%; min-height:120px; resize:vertical;" placeholder="?낅Т ?댁슜???곸꽭???낅젰?섏꽭??"></textarea>
                </div>
                
                <div style="display:flex; justify-content:flex-end; gap:10px;">
                    <button class="btn-cancel" onclick="document.getElementById('gm-todo-modal').remove()">痍⑥냼</button>
                    <button class="btn-primary" onclick="GMManager.submitTodo('${date}')">?깅줉?섍린</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        setTimeout(() => document.getElementById('todo-content').focus(), 100);
    },

    submitTodo(date) {
        const author = document.getElementById('todo-author').value;
        const participants = document.getElementById('todo-participants').value;
        const content = document.getElementById('todo-content').value;

        if (!content.trim()) return ModalUtils.showModalUtils.showAlert("일정 등록 실패");

        fetch('/api/gm/todos/add', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ author, participants, content, target_date: date })
        })
        .then(res => {
            if (!res.ok) throw new Error('Failed to add todo');
            return res.json();
        })
        .then(() => {
            document.getElementById('gm-todo-modal').remove();
            this.loadTodos();
        })
        .catch(err => {
            console.error(err);
            ModalUtils.showModalUtils.showAlert("일정 등록 실패");
        });
    },

    toggleTodo(id, status) {
        fetch('/api/gm/todos/update', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ id: id, status: status })
        })
        .then(() => this.loadTodos())
        .catch(err => console.error(err));
    },

    deleteTodo(id) {
        ModalUtils.showConfirm("?뺣쭚 ???낅Т瑜???젣?섏떆寃좎뒿?덇퉴?", () => {
            fetch('/api/gm/todos/delete', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ id: id })
            })
            .then(() => this.loadTodos())
            .catch(err => console.error(err));
        });
    },

    renderDashboard() {
        this.currentModule = null;
        document.getElementById('gm-main-view').innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; color:var(--text-secondary);">
                 <div style="background:var(--bg-deep); padding:2rem; border-radius:50%; margin-bottom:1.5rem;">
                     <i class="fas fa-cubes" style="font-size: 3rem; color:var(--primary-color);"></i>
                 </div>
                 <h3 style="font-size:1.5rem; color:var(--text-primary); margin-bottom:0.5rem;">AzerothCore 紐⑤뱢 遺꾩꽍</h3>
                 <p style="max-width:400px; text-align:center; line-height:1.6;">醫뚯륫 紐⑸줉?먯꽌 紐⑤뱢???좏깮?섏뿬 ?뚯씪 援ъ“, ?곗씠?곕쿋?댁뒪 ?ㅽ궎留? 洹몃━怨?愿??湲곕뒫??遺꾩꽍?????덉뒿?덈떎.</p>
            </div>
        `;
        this.renderModuleList();
    },

    renderModuleList() {
        const list = document.getElementById('gm-module-list');
        list.innerHTML = '';

        // Search Filter
        const searchInput = document.getElementById('gm-module-search');
        const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
        const filtered = this.modules.filter(m => m.name.toLowerCase().includes(searchTerm));

        if (filtered.length === 0) {
            list.innerHTML = `<div style="padding:20px; text-align:center; color:var(--text-secondary); font-size:0.9rem;">寃??寃곌낵 ?놁쓬</div>`;
            return;
        }

        filtered.forEach(mod => {
            // Note: modules list from /api/gm/modules might not have memos count unless we joined it.
            // Go struct ModuleInfo doesn't have Memos field, only ModuleDetail does.
            // But let's check if we return it. 
            // Scanner returns ModuleInfo which has NO Memos field.
            // So we can't show memo count in the list unless we fetch it.
            // We'll skip memo count in list or fetch it separately?
            // For now, let's remove the badge to avoid undefined.
            
            const item = document.createElement('div');
            // Use Premium Nav Item Style
            item.className = `nav-item-sub ${this.currentModule === mod.name ? 'active' : ''}`;
            item.style.marginBottom = '4px';
            item.style.borderRadius = '8px';
            
            item.innerHTML = `
                <i class="fas fa-cube" style="color: ${this.currentModule === mod.name ? 'var(--primary-color)' : '#94a3b8'}"></i>
                <div style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                    ${mod.name}
                </div>
            `;
            item.onclick = () => this.loadModuleDetail(mod.name);
            list.appendChild(item);
        });
    },

    renderModuleReferenceTable(headers, rows, keyMap, codeKeys = []) {
        if (!Array.isArray(rows) || rows.length === 0) {
            return '<div style="padding:20px; text-align:center; color:var(--text-secondary);">분석된 항목이 없습니다.</div>';
        }
        return `
            <div class="scroll-table premium-table" style="max-height:none; overflow:auto; border:1px solid var(--border-color); border-radius:12px;">
                <table>
                    <thead>
                        <tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>
                    </thead>
                    <tbody>
                        ${rows.map(row => `
                            <tr>
                                ${keyMap.map(key => {
                                    const value = String(row[key] || '-');
                                    const safe = window.escapeHtml ? window.escapeHtml(value) : value;
                                    const html = codeKeys.includes(key) ? `<code>${safe}</code>` : safe;
                                    return `<td style="vertical-align:top; line-height:1.6;">${html}</td>`;
                                }).join('')}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    },

    renderModuleDetail(data) {
        const view = document.getElementById('gm-main-view');
        if (!view) return;

        const info = data.info || {};
        const memos = Array.isArray(data.memos) ? data.memos : [];
        const moduleName = String(info.name || '');
        const modulePath = String(info.path || '');
        const moduleDesc = String(data.manual_description || info.description || '설명 정보가 없습니다.');
        const sqlFiles = Array.isArray(info.sql_files) ? info.sql_files : [];
        const sourceFiles = Array.isArray(info.source_files) ? info.source_files : [];
        const tableRows = Array.isArray(info.table_infos) ? info.table_infos : [];
        const commandRows = Array.isArray(info.command_infos) ? info.command_infos : [];
        const databases = Array.isArray(info.databases) ? info.databases : [];
        const meta = info.meta || {};
        const safeModuleName = window.escapeHtml ? window.escapeHtml(moduleName) : moduleName;
        const safeModulePath = window.escapeHtml ? window.escapeHtml(modulePath) : modulePath;
        const safeManual = String(data.manual_description || '').replace(/'/g, "\\'");
        const safeRelated = String(data.related_url || '').replace(/'/g, "\\'");
        const sourcePreview = sourceFiles.slice(0, 10).map(file => {
            const safe = window.escapeHtml ? window.escapeHtml(file) : file;
            return `<div style="padding:8px 10px; border:1px solid #e2e8f0; border-radius:8px; background:#fff; font-family:'JetBrains Mono', monospace; font-size:0.8rem; color:var(--text-secondary);">${safe}</div>`;
        }).join('');
        const sqlPreview = sqlFiles.slice(0, 10).map(file => {
            const safe = window.escapeHtml ? window.escapeHtml(file) : file;
            return `<div style="padding:8px 10px; border:1px solid #e2e8f0; border-radius:8px; background:#fff; font-family:'JetBrains Mono', monospace; font-size:0.8rem; color:var(--text-secondary);">${safe}</div>`;
        }).join('');

        view.innerHTML = `
            <div style="margin-bottom:24px; padding-bottom:20px; border-bottom:1px solid var(--border-color);">
                <div style="display:flex; justify-content:space-between; align-items:start; gap:16px; flex-wrap:wrap;">
                    <div>
                        <h2 style="font-size:1.5rem; font-weight:700; color:var(--text-primary); margin-bottom:8px; display:flex; align-items:center; gap:10px;">
                            ${safeModuleName}
                            <span style="font-size:0.8rem; background:#e0f2fe; color:#0369a1; padding:4px 8px; border-radius:6px; font-weight:600;">MODULE</span>
                        </h2>
                        <div style="font-family:'JetBrains Mono', monospace; font-size:0.85rem; color:var(--text-secondary); background:#f1f5f9; padding:6px 10px; border-radius:6px; display:inline-block;">
                            ${safeModulePath}
                        </div>
                    </div>
                    <div style="display:flex; gap:8px;">
                        <button onclick="GMManager.openLinkModal('${moduleName.replace(/'/g, "\\'")}', '${safeRelated}', '${safeManual}')" class="btn-action btn-edit" style="padding:8px 16px;">
                            <i class="fas fa-link"></i> 링크 연결
                        </button>
                        ${data.related_url ? `<button onclick="window.location.href='${safeRelated}'" class="btn-action" style="background:#f0fdfa; color:#0d9488; border:1px solid #ccfbf1;"><i class="fas fa-external-link-alt"></i> 이동</button>` : ''}
                    </div>
                </div>
                ${data.manual_description ? `<div style="margin-top:16px; background:#fffbeb; padding:12px; border-radius:8px; border:1px solid #fcd34d; color:#92400e; font-size:0.9rem;"><i class="fas fa-sticky-note" style="margin-right:6px;"></i> ${window.escapeHtml ? window.escapeHtml(data.manual_description) : data.manual_description}</div>` : ''}
            </div>

            <div class="log-sub-tabs" style="margin-bottom:20px;">
                <button class="log-sub-tab-btn active" onclick="GMManager.switchDetailTab('info', this)">기본 정보</button>
                <button class="log-sub-tab-btn" onclick="GMManager.switchDetailTab('tables', this)">사용 테이블 (${tableRows.length})</button>
                <button class="log-sub-tab-btn" onclick="GMManager.switchDetailTab('commands', this)">명령어 (${commandRows.length})</button>
                <button class="log-sub-tab-btn" onclick="GMManager.switchDetailTab('files', this)">파일 위치</button>
                <button class="log-sub-tab-btn" onclick="GMManager.switchDetailTab('memos', this)">메모 (${memos.length})</button>
            </div>

            <div id="mod-tab-info" class="mod-tab-content active">
                <div class="card-body" style="background:white; border-radius:12px; border:1px solid var(--border-color); padding:24px;">
                    <div style="padding:18px; border:1px solid #e2e8f0; border-radius:12px; background:linear-gradient(180deg,#ffffff 0%,#f8fafc 100%); margin-bottom:18px;">
                        <h3 style="margin:0 0 10px; font-size:1.3rem; color:var(--text-primary);">${safeModuleName} 분석</h3>
                        <p style="margin:0; color:var(--text-secondary); line-height:1.7;">모듈 설명, 사용 데이터베이스, 테이블, 명령어, 핵심 파일 위치를 한 화면에서 확인할 수 있도록 정리한 분석 화면입니다.</p>
                    </div>
                    <div style="display:grid; grid-template-columns:repeat(2, minmax(260px, 1fr)); gap:16px;">
                        <div style="padding:16px; border:1px solid var(--border-color); border-radius:12px; background:#fff;">
                            <div style="font-size:0.78rem; font-weight:800; color:#b7791f; margin-bottom:8px; letter-spacing:0.04em;">모듈명</div>
                            <div style="font-size:1rem; color:var(--text-primary); line-height:1.6;"><code>${safeModuleName}</code></div>
                        </div>
                        <div style="padding:16px; border:1px solid var(--border-color); border-radius:12px; background:#fff;">
                            <div style="font-size:0.78rem; font-weight:800; color:#b7791f; margin-bottom:8px; letter-spacing:0.04em;">설명</div>
                            <div style="font-size:1rem; color:var(--text-primary); line-height:1.6;">${window.escapeHtml ? window.escapeHtml(moduleDesc) : moduleDesc}</div>
                        </div>
                        <div style="padding:16px; border:1px solid var(--border-color); border-radius:12px; background:#fff;">
                            <div style="font-size:0.78rem; font-weight:800; color:#b7791f; margin-bottom:8px; letter-spacing:0.04em;">사용 데이터베이스</div>
                            <div style="font-size:1rem; color:var(--text-primary); line-height:1.6;">${databases.length ? databases.map(db => `<code style="margin-right:8px;">${window.escapeHtml ? window.escapeHtml(db) : db}</code>`).join('') : '분석된 데이터베이스가 없습니다.'}</div>
                        </div>
                        <div style="padding:16px; border:1px solid var(--border-color); border-radius:12px; background:#fff;">
                            <div style="font-size:0.78rem; font-weight:800; color:#b7791f; margin-bottom:8px; letter-spacing:0.04em;">요약 수치</div>
                            <div style="font-size:1rem; color:var(--text-primary); line-height:1.8;">테이블 ${Number(meta.tableCount || tableRows.length)}개 / 명령어 ${Number(meta.commandCount || commandRows.length)}개 / 소스 ${Number(meta.sourceCount || sourceFiles.length)}개 / SQL ${Number(meta.sqlCount || sqlFiles.length)}개</div>
                        </div>
                    </div>
                </div>
            </div>

            <div id="mod-tab-tables" class="mod-tab-content" style="display:none;">
                <div class="card-body" style="background:white; border-radius:12px; border:1px solid var(--border-color); padding:24px;">
                    <h4 style="font-size:1.1rem; margin-bottom:10px;">사용 테이블</h4>
                    <p style="margin:0 0 18px; color:var(--text-secondary);">모듈이 SQL 파일 또는 소스 코드 쿼리에서 참조하는 테이블 목록입니다.</p>
                    ${this.renderModuleReferenceTable(['데이터베이스', '테이블명', '유형', '설명', '세부 내용', '파일 위치'], tableRows.map(row => ({
                        database: row.database || '-',
                        name: row.name || '-',
                        type: row.type || '-',
                        desc: row.desc || '-',
                        detail: row.detail || '-',
                        source: row.source || '-'
                    })), ['database', 'name', 'type', 'desc', 'detail', 'source'], ['name'])}
                </div>
            </div>

            <div id="mod-tab-commands" class="mod-tab-content" style="display:none;">
                <div class="card-body" style="background:white; border-radius:12px; border:1px solid var(--border-color); padding:24px;">
                    <h4 style="font-size:1.1rem; margin-bottom:10px;">명령어</h4>
                    <p style="margin:0 0 18px; color:var(--text-secondary);">ChatCommandTable 또는 소스 코드에서 확인된 명령어 목록입니다.</p>
                    ${this.renderModuleReferenceTable(['실행 환경', '명령어', '유형', '설명', '권한/세부', '파일 위치'], commandRows.map(row => ({
                        environment: row.environment || '-',
                        command: row.command || '-',
                        type: row.type || '-',
                        desc: row.desc || '-',
                        detail: row.detail || '-',
                        source: row.source || '-'
                    })), ['environment', 'command', 'type', 'desc', 'detail', 'source'], ['command'])}
                </div>
            </div>

            <div id="mod-tab-files" class="mod-tab-content" style="display:none;">
                <div class="card-body" style="background:white; border-radius:12px; border:1px solid var(--border-color); padding:24px;">
                    <h4 style="font-size:1.1rem; margin-bottom:10px;">파일 위치</h4>
                    <p style="margin:0 0 18px; color:var(--text-secondary);">핵심 소스 파일과 SQL 파일을 우선 노출합니다.</p>
                    <div style="display:grid; grid-template-columns:repeat(2, minmax(280px, 1fr)); gap:18px;">
                        <div>
                            <div style="font-size:0.9rem; font-weight:700; margin-bottom:10px; color:var(--text-primary);">소스 파일</div>
                            <div style="display:grid; gap:8px;">${sourcePreview || '<div style="color:var(--text-secondary);">등록된 소스 파일이 없습니다.</div>'}</div>
                        </div>
                        <div>
                            <div style="font-size:0.9rem; font-weight:700; margin-bottom:10px; color:var(--text-primary);">SQL 파일</div>
                            <div style="display:grid; gap:8px;">${sqlPreview || '<div style="color:var(--text-secondary);">등록된 SQL 파일이 없습니다.</div>'}</div>
                        </div>
                    </div>
                </div>
            </div>

            <div id="mod-tab-memos" class="mod-tab-content" style="display:none;">
                <div style="margin-bottom:16px; display:flex; justify-content:space-between; align-items:center;">
                    <h4 style="margin:0;">모듈 메모</h4>
                    <button onclick="GMManager.openAddMemoModal('${moduleName.replace(/'/g, "\\'")}')" class="btn-action btn-edit"><i class="fas fa-plus"></i> 메모 추가</button>
                </div>
                <div class="memo-grid">
                    ${this.renderMemos(memos)}
                </div>
            </div>
        `;
    },

    loadModuleDetail(moduleName) {
        this.currentModule = moduleName;
        this.renderModuleList(); // Update active state

        fetch(`/api/gm/modules/detail?name=${encodeURIComponent(moduleName)}`)
            .then(res => res.json())
            .then(data => {
                this.renderModuleDetail(data);
            });
    },

    switchDetailTab(tabName, btn) {
        // Handle inner module tabs
        const parent = btn.parentElement;
        parent.querySelectorAll('.log-sub-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Hide all sibling content divs
        const container = parent.parentElement; 
        const contents = container.querySelectorAll('.mod-tab-content');
        contents.forEach(c => c.style.display = 'none');
        
        // Show target
        const target = document.getElementById(`mod-tab-${tabName}`);
        if(target) target.style.display = 'block';
    },

    renderFileTree(tree) {
        if (!tree) return '';
        // tree is FileNode { name, type, children }
        let html = '';
        
        if (tree.type === 'file') {
             html += `<div class="tree-item"><i class="far fa-file-code"></i> ${tree.name}</div>`;
        } else {
             // It's a directory
             /* 
                Structure from Scanner: 
                Root is dir. Children are mixed.
             */
             // If we are passed the root node directly
             if (tree.children) {
                 tree.children.forEach(child => {
                     if (child.type === 'dir') {
                         html += `
                            <div class="tree-item"><i class="far fa-folder" style="color:#f59e0b;"></i> ${child.name}</div>
                            <div class="tree-children" style="padding-left:20px;">
                                ${this.renderFileTree(child)}
                            </div>`;
                     } else {
                         html += `<div class="tree-item"><i class="far fa-file-code"></i> ${child.name}</div>`;
                     }
                 });
             }
        }
        return html;
    },

    renderMemos(memos) {
        if (!memos || memos.length === 0) return '<div style="color:var(--text-secondary); padding:20px;">등록된 메모가 없습니다.</div>';
        return memos.map(memo => `
            <div class="memo-card ${memo.is_pinned ? 'pinned' : ''} ${memo.is_completed ? 'completed' : ''}">
                <div class="memo-header">
                    <div class="memo-user">
                        <i class="fas fa-user-circle"></i> ${memo.user_name}
                    </div>
                    <div class="memo-actions">
                        <button onclick="GMManager.togglePin(${memo.id}, ${!memo.is_pinned})" title="고정"><i class="fas fa-thumbtack" style="${memo.is_pinned ? 'color:#d97706;' : ''}"></i></button>
                        <button onclick="GMManager.toggleComplete(${memo.id}, ${!memo.is_completed})" title="완료"><i class="fas fa-check" style="${memo.is_completed ? 'color:#059669;' : ''}"></i></button>
                        <button onclick="GMManager.deleteMemo(${memo.id})" title="삭제"><i class="fas fa-trash-alt" style="color:#ef4444;"></i></button>
                    </div>
                </div>
                <div class="memo-content">${memo.content}</div>
                <div class="memo-footer">
                    <span>${new Date(memo.created_at).toLocaleString()}</span>
                    ${memo.module_name ? `<span class="badge-info">${memo.module_name}</span>` : ''}
                </div>
            </div>
        `).join('');
    },

    loadGlobalMemos() {
        const grid = document.getElementById('gm-global-memos');
        grid.innerHTML = '<div class="loading-spinner"></div>';
        fetch('/api/gm/memos')
            .then(res => res.json())
            .then(data => {
               grid.innerHTML = this.renderMemos(data);
            });
    },

    async loadInquiries(page = 1) {
        this.inquiryPage = Math.max(1, Number(page || 1));
        const tbody = document.getElementById('gm-inquiry-list');
        const pager = document.getElementById('gm-inquiry-pagination');
        const pointTh = document.getElementById('gm-inquiry-th-point');
        const canGrantPoints = this.isSuperAdmin();
        if (!tbody) return;
        if (pointTh) pointTh.style.display = canGrantPoints ? 'table-cell' : 'none';

        const category = (document.getElementById('gm-inquiry-category')?.value || '').trim();
        const author = (document.getElementById('gm-inquiry-author')?.value || '').trim();
        const title = (document.getElementById('gm-inquiry-search')?.value || '').trim();
        const search = [author, title].filter(Boolean).join(' ').trim();
        const colSpan = canGrantPoints ? 10 : 9;

        tbody.innerHTML = `<tr><td colspan="${colSpan}" style="text-align:center; padding:20px; color:#64748b;">불러오는 중...</td></tr>`;
        try {
            const params = new URLSearchParams({
                board_id: 'inquiry',
                page: String(this.inquiryPage),
                limit: '10'
            });
            if (search) params.set('search', search);
            if (category) params.set('category', category);
            const res = await fetch(`/api/board/posts?${params.toString()}`);
            if (!res.ok) {
                tbody.innerHTML = `<tr><td colspan="${colSpan}" style="text-align:center; padding:20px; color:#ef4444;">문의 목록을 불러오지 못했습니다. (${res.status})</td></tr>`;
                if (pager) pager.innerHTML = '';
                return;
            }
            const data = await res.json();
            const posts = Array.isArray(data.posts) ? data.posts : [];
            if (!posts.length) {
                tbody.innerHTML = `<tr><td colspan="${colSpan}" style="text-align:center; padding:20px; color:#64748b;">문의 내역이 없습니다.</td></tr>`;
            } else {
                tbody.innerHTML = posts.map((p, idx) => {
                    const number = (data.total || 0) - ((this.inquiryPage - 1) * 10) - idx;
                    const status = String(p.inquiry_status || 'received');
                    const accountId = Number(p.account_id || 0);
                    const rawAuthorName = String(p.author_name || '');
                    const authorName = window.escapeHtml ? window.escapeHtml(rawAuthorName) : rawAuthorName;
                    const isPointPaid = status === 'point_paid';
                    return `
                        <tr>
                            <td style="text-align:center;">${number > 0 ? number : '-'}</td>
                            <td style="text-align:center;">${this.renderInquiryCategoryBadge(p.category)}</td>
                            <td>${window.escapeHtml ? window.escapeHtml(p.title || '') : (p.title || '')}</td>
                            <td style="text-align:center;">${authorName}</td>
                            <td style="text-align:center;">${window.escapeHtml ? window.escapeHtml(p.created_at || '') : (p.created_at || '')}</td>
                            <td style="text-align:center;">${this.renderInquiryStatusBadge(status)}</td>
                            <td style="text-align:center;">
                                <select id="inq-status-${Number(p.id || 0)}" class="input-premium" style="min-width:92px; padding:4px 6px; font-size:0.75rem;" onchange="GMManager.updateInquiryStatus(${Number(p.id || 0)})">
                                    <option value="received" ${status === 'received' ? 'selected' : ''}>접수</option>
                                    <option value="in_progress" ${status === 'in_progress' ? 'selected' : ''}>진행중</option>
                                    <option value="done" ${status === 'done' ? 'selected' : ''}>완료</option>
                                    <option value="point_paid" ${status === 'point_paid' ? 'selected' : ''}>지급완료</option>
                                </select>
                            </td>
                            <td style="text-align:center;">
                                <button class="btn btn-primary" style="padding:4px 10px; font-size:0.8rem;" onclick="GMManager.replyInquiry(${Number(p.id || 0)})">답변</button>
                            </td>
                            <td style="text-align:center; ${canGrantPoints ? '' : 'display:none;'}">
                                <button class="btn" style="padding:4px 10px; font-size:0.8rem; background:${isPointPaid ? '#cbd5e1' : '#f59e0b'}; color:${isPointPaid ? '#64748b' : 'white'}; cursor:${isPointPaid ? 'not-allowed' : 'pointer'}; opacity:${isPointPaid ? '0.75' : '1'};" ${isPointPaid ? 'disabled' : ''} onclick="${isPointPaid ? '' : `GMManager.grantInquiryPoints(${accountId}, '${rawAuthorName.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}', ${Number(p.id || 0)}, '${String(p.category || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")}')`}">${isPointPaid ? '지급완료' : '지급'}</button>
                            </td>
                            <td style="text-align:center;">
                                <div style="display:flex; align-items:center; gap:6px; justify-content:center;">
                                    <input id="inq-memo-${Number(p.id || 0)}" type="text" class="input-premium" value="${window.escapeHtml ? window.escapeHtml(p.inquiry_memo || '') : (p.inquiry_memo || '')}" placeholder="메모 입력" style="min-width:170px; max-width:220px; padding:4px 8px; font-size:0.78rem;">
                                    <button class="btn" style="padding:4px 8px; font-size:0.75rem; background:#e2e8f0; color:#334155;" onclick="GMManager.saveInquiryMemo(${Number(p.id || 0)})">저장</button>
                                </div>
                            </td>
                        </tr>
                    `;
                }).join('');
            }

            if (pager) {
                const totalPages = Math.max(1, Number(data.totalPages || data.total_pages || 1));
                if (typeof renderPagination === 'function') {
                    renderPagination(pager, { page: this.inquiryPage, totalPages }, (nextPage) => this.loadInquiries(nextPage));
                } else {
                    pager.innerHTML = '';
                }
            }
        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="${colSpan}" style="text-align:center; padding:20px; color:#ef4444;">문의 목록 조회 중 오류가 발생했습니다.</td></tr>`;
            if (pager) pager.innerHTML = '';
        }
    },

    async grantInquiryPoints(accountId, authorName, postId, category) {
        if (!this.isSuperAdmin()) {
            ModalUtils.showAlert('최고관리자만 포인트를 지급할 수 있습니다.');
            return;
        }
        const targetId = Number(accountId || 0);
        if (!targetId) {
            ModalUtils.showAlert('지급 대상 계정을 찾을 수 없습니다.');
            return;
        }
        const modal = document.getElementById('gm-inquiry-point-modal');
        const targetEl = document.getElementById('gm-inquiry-point-target');
        const amountEl = document.getElementById('gm-inquiry-point-amount');
        const reasonEl = document.getElementById('gm-inquiry-point-reason');
        if (!modal || !targetEl || !amountEl || !reasonEl) {
            ModalUtils.showAlert('포인트 지급 모달을 불러오지 못했습니다.');
            return;
        }
        this.inquiryPointTarget = {
            accountId: targetId,
            authorName: String(authorName || ''),
            postId: Number(postId || 0),
            category: String(category || '')
        };
        targetEl.textContent = `${authorName} (ID: ${targetId})`;
        amountEl.value = '100';
        reasonEl.value = `문의답변 보상 (#${postId})`;
        modal.style.display = 'flex';
        amountEl.focus();
        amountEl.select();
    },

    closeInquiryPointModal() {
        const modal = document.getElementById('gm-inquiry-point-modal');
        if (modal) modal.style.display = 'none';
        this.inquiryPointTarget = null;
    },

    async submitInquiryPointModal() {
        if (!this.isSuperAdmin()) {
            ModalUtils.showAlert('최고관리자만 포인트를 지급할 수 있습니다.');
            return;
        }
        const target = this.inquiryPointTarget;
        if (!target || !target.accountId) {
            ModalUtils.showAlert('지급 대상 정보를 찾을 수 없습니다.');
            return;
        }
        const amountEl = document.getElementById('gm-inquiry-point-amount');
        const reasonEl = document.getElementById('gm-inquiry-point-reason');
        const amount = Number(String(amountEl?.value || '').replace(/,/g, '').trim());
        const reason = String(reasonEl?.value || '').trim();
        if (!Number.isFinite(amount) || amount === 0) {
            ModalUtils.showAlert('0이 아닌 숫자를 입력하세요.');
            return;
        }
        if (!reason) {
            ModalUtils.showAlert('지급 사유를 입력하세요.');
            return;
        }

        ModalUtils.showConfirm(`${target.authorName} 님에게 ${amount > 0 ? '+' : ''}${amount.toLocaleString()} 포인트를 지급하시겠습니까?`, async () => {
            try {
                const formData = new URLSearchParams();
                formData.append('id', String(target.accountId));
                formData.append('amount', String(amount));
                formData.append('reason', `[문의관리] ${reason}`);

                const res = await fetch('/api/admin/users/points/update', {
                    method: 'POST',
                    body: formData
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok || (data.status && data.status !== 'success') || data.success === false) {
                    ModalUtils.showAlert(`포인트 지급 실패: ${data.message || res.statusText || '오류'}`);
                    return;
                }

                // 후원 문의는 지급만으로 처리되는 경우가 많아, 스태프 답변이 없다면 자동 안내 답변을 남긴다.
                if (String(target.category || '').trim() === '후원') {
                    try {
                        let hasStaffReply = false;
                        const detailRes = await fetch(`/api/board/post?id=${Number(target.postId || 0)}`);
                        if (detailRes.ok) {
                            const detail = await detailRes.json().catch(() => ({}));
                            const msgs = Array.isArray(detail.inquiry_messages) ? detail.inquiry_messages : [];
                            hasStaffReply = msgs.some(m => String(m.role || '').toLowerCase() === 'staff');
                        }
                        if (!hasStaffReply) {
                            await fetch('/api/board/inquiry/message/create', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    post_id: Number(target.postId || 0),
                                    content: `${amount.toLocaleString()}포인트가 지급 되었습니다.`
                                })
                            });
                        }
                    } catch (_) {
                        // 자동 답변 실패는 포인트 지급 자체를 실패로 보지 않는다.
                    }
                }

                await fetch('/api/board/inquiry/status', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ post_id: Number(target.postId || 0), status: 'point_paid' })
                }).catch(() => null);
                this.closeInquiryPointModal();
                ModalUtils.showAlert('포인트가 지급되었습니다.');
                if (typeof updatePointsHeader === 'function') updatePointsHeader();
                this.loadInquiries(this.inquiryPage || 1);
            } catch (e) {
                ModalUtils.showAlert('포인트 지급 중 오류가 발생했습니다.');
            }
        });
    },

    async saveInquiryMemo(postID) {
        const inputEl = document.getElementById(`inq-memo-${postID}`);
        if (!inputEl) return;
        const memo = String(inputEl.value || '').trim();
        try {
            const res = await fetch('/api/board/inquiry/memo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ post_id: Number(postID || 0), memo })
            });
            if (!res.ok) {
                const msg = await res.text();
                ModalUtils.handleError(msg || '메모 저장 실패', '메모 저장 실패');
                return;
            }
            ModalUtils.showAlert('메모가 저장되었습니다.');
        } catch (e) {
            ModalUtils.showAlert('메모 저장 중 오류가 발생했습니다.');
        }
    },

    async loadPromotionRewardConfig() {
        try {
            const res = await fetch('/api/board/promotion/reward/config');
            if (!res.ok) return;
            const data = await res.json();
            const entryEl = document.getElementById('gm-promotion-reward-entry');
            const countEl = document.getElementById('gm-promotion-reward-count');
            const subjectEl = document.getElementById('gm-promotion-reward-subject');
            const bodyEl = document.getElementById('gm-promotion-reward-body');
            if (entryEl) entryEl.value = Number(data.item_entry || 0) || '';
            if (countEl) countEl.value = Number(data.item_count || 1) || 1;
            if (subjectEl) subjectEl.value = String(data.mail_subject || '');
            if (bodyEl) bodyEl.value = String(data.mail_body || '');
        } catch (e) {
            // ignore
        }
    },

    async savePromotionRewardConfig() {
        const itemEntry = Number(document.getElementById('gm-promotion-reward-entry')?.value || 0);
        const itemCount = Number(document.getElementById('gm-promotion-reward-count')?.value || 0);
        const mailSubject = String(document.getElementById('gm-promotion-reward-subject')?.value || '').trim();
        const mailBody = String(document.getElementById('gm-promotion-reward-body')?.value || '').trim();
        if (!itemEntry || itemEntry <= 0 || !itemCount || itemCount <= 0) {
            ModalUtils.showAlert('보상 아이템 Entry와 수량을 입력하세요.');
            return;
        }
        try {
            const res = await fetch('/api/board/promotion/reward/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    item_entry: itemEntry,
                    item_count: itemCount,
                    mail_subject: mailSubject,
                    mail_body: mailBody
                })
            });
            if (!res.ok) {
                const msg = await res.text();
                ModalUtils.handleError(msg || '보상 저장 실패', '홍보 보상 설정');
                return;
            }
            ModalUtils.showAlert('홍보 보상 설정이 저장되었습니다.');
        } catch (e) {
            ModalUtils.showAlert('보상 설정 저장 중 오류가 발생했습니다.');
        }
    },

    async loadPromotionVerifyConfig() {
        try {
            const res = await fetch('/api/board/promotion/verify/config');
            if (!res.ok) return;
            const data = await res.json();
            const textEl = document.getElementById('gm-promotion-verify-text');
            const imageEl = document.getElementById('gm-promotion-verify-image');
            if (textEl) textEl.value = String(data.required_text || '');
            if (imageEl) imageEl.value = String(data.required_image || '');
        } catch (e) {
            // ignore
        }
    },

    async savePromotionVerifyConfig() {
        const requiredText = String(document.getElementById('gm-promotion-verify-text')?.value || '').trim();
        const requiredImage = String(document.getElementById('gm-promotion-verify-image')?.value || '').trim();
        try {
            const res = await fetch('/api/board/promotion/verify/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    required_text: requiredText,
                    required_image: requiredImage
                })
            });
            if (!res.ok) {
                const msg = await res.text();
                ModalUtils.handleError(msg || '기준 저장 실패', '홍보 검사 기준');
                return;
            }
            ModalUtils.showAlert('검사 기준이 저장되었습니다.');
        } catch (e) {
            ModalUtils.showAlert('검사 기준 저장 중 오류가 발생했습니다.');
        }
    },

    resetPromotionVerifyConfig() {
        ModalUtils.showConfirm('홍보 검사 기준을 초기화하시겠습니까?', async () => {
            const textEl = document.getElementById('gm-promotion-verify-text');
            const imageEl = document.getElementById('gm-promotion-verify-image');
            const fileEl = document.getElementById('gm-promotion-verify-image-file');
            if (textEl) textEl.value = '';
            if (imageEl) imageEl.value = '';
            if (fileEl) fileEl.value = '';
            await this.savePromotionVerifyConfig();
        });
    },

    async uploadPromotionVerifyImage() {
        const fileInput = document.getElementById('gm-promotion-verify-image-file');
        const textInput = document.getElementById('gm-promotion-verify-image');
        const file = fileInput?.files?.[0];
        if (!file) {
            ModalUtils.showAlert('업로드할 이미지를 선택하세요.');
            return;
        }
        const formData = new FormData();
        formData.append('file', file);
        try {
            const res = await fetch('/api/board/promotion/verify/upload', {
                method: 'POST',
                body: formData
            });
            if (!res.ok) {
                const msg = await res.text();
                ModalUtils.handleError(msg || '이미지 업로드 실패', '홍보 검사 기준');
                return;
            }
            const data = await res.json();
            if (textInput) textInput.value = String(data.required_image || '');
            if (fileInput) fileInput.value = '';
            ModalUtils.showAlert('검사 기준 이미지가 업로드되었습니다.');
        } catch (e) {
            ModalUtils.showAlert('이미지 업로드 중 오류가 발생했습니다.');
        }
    },

    resetPromotionFilters() {
        const searchEl = document.getElementById('gm-promotion-search');
        if (searchEl) searchEl.value = '';
        this.promotionSelectedIds = new Set();
        this.loadPromotions(1);
    },

    togglePromotionAll(checked) {
        const rows = Array.isArray(this.promotionRows) ? this.promotionRows : [];
        if (checked) {
            rows.forEach((r) => {
                const id = Number(r?.id || 0);
                if (id > 0) this.promotionSelectedIds.add(id);
            });
        } else {
            rows.forEach((r) => {
                const id = Number(r?.id || 0);
                if (id > 0) this.promotionSelectedIds.delete(id);
            });
        }
        this.loadPromotions(this.promotionPage || 1);
    },

    togglePromotionRow(postID, checked) {
        const id = Number(postID || 0);
        if (!id) return;
        if (checked) this.promotionSelectedIds.add(id);
        else this.promotionSelectedIds.delete(id);
    },

    async bulkVerifySelectedPromotions() {
        const ids = Array.from(this.promotionSelectedIds || []).map(Number).filter((v) => v > 0);
        if (!ids.length) {
            ModalUtils.showAlert('선택된 홍보글이 없습니다.');
            return;
        }
        ModalUtils.showConfirm(`선택한 ${ids.length}개 홍보글을 일괄 검사하시겠습니까?`, async () => {
            const total = ids.length;
            let done = 0;
            let okCount = 0;
            const queue = ids.slice();
            const concurrency = Math.min(3, Math.max(1, queue.length));
            this.setPromotionBulkLoading(true, `일괄 검사 중... (0/${total})`, 0);
            try {
                const runWorker = async () => {
                    while (queue.length > 0) {
                        const postID = Number(queue.shift() || 0);
                        if (!postID) continue;
                        try {
                            const res = await fetch('/api/board/promotion/verify', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ post_id: postID })
                            });
                            if (res.ok) okCount++;
                        } catch (e) {
                            // continue
                        } finally {
                            done++;
                            const percent = Math.round((done / total) * 100);
                            this.setPromotionBulkLoading(true, `일괄 검사 중... (${done}/${total})`, percent);
                        }
                    }
                };

                await Promise.all(Array.from({ length: concurrency }, () => runWorker()));
                this.setPromotionBulkLoading(true, `일괄 검사 완료 (${total}/${total})`, 100);
                await new Promise((resolve) => setTimeout(resolve, 320));
                this.promotionSelectedIds = new Set();
                await this.loadPromotions(this.promotionPage || 1);
                ModalUtils.showAlert(`일괄 검사가 완료되었습니다. (${done}/${total}, 성공 ${okCount})`);
            } finally {
                this.setPromotionBulkLoading(false);
            }
        });
    },

    async loadPromotions(page = 1) {
        this.promotionPage = Math.max(1, Number(page || 1));
        const tbody = document.getElementById('gm-promotion-list');
        const pager = document.getElementById('gm-promotion-pagination');
        if (!tbody) return;
        const search = String(document.getElementById('gm-promotion-search')?.value || '').trim();
        tbody.innerHTML = '<tr><td colspan="11" style="text-align:center; padding:20px; color:#64748b;">불러오는 중...</td></tr>';
        try {
            const params = new URLSearchParams({
                page: String(this.promotionPage),
                limit: '10'
            });
            if (search) params.set('search', search);
            const res = await fetch(`/api/board/promotion/admin/list?${params.toString()}`);
            if (!res.ok) {
                tbody.innerHTML = `<tr><td colspan="11" style="text-align:center; padding:20px; color:#ef4444;">홍보 목록을 불러오지 못했습니다. (${res.status})</td></tr>`;
                if (pager) pager.innerHTML = '';
                return;
            }
            const data = await res.json();
            const posts = Array.isArray(data.posts) ? data.posts : [];
            this.promotionRows = posts;
            const allChecked = posts.length > 0 && posts.every((p) => this.promotionSelectedIds.has(Number(p.id || 0)));
            const allCheck = document.getElementById('gm-promotion-check-all');
            if (allCheck) allCheck.checked = allChecked;
            if (!posts.length) {
                tbody.innerHTML = '<tr><td colspan="11" style="text-align:center; padding:20px; color:#64748b;">홍보 글이 없습니다.</td></tr>';
            } else {
                tbody.innerHTML = posts.map((p, idx) => {
                    const number = (data.total || 0) - ((this.promotionPage - 1) * 10) - idx;
                    const paid = p.reward_paid === true;
                    const verifyOk = p.verify_ok === true;
                    const verifyTitle = String(p.verify_message || '');
                    const passCount = Number(p.verify_pass_count || 0);
                    const totalCount = Number(p.verify_total_count || 0);
                    const reviewStatus = String(p.review_status || 'pending').toLowerCase();
                    const title = window.escapeHtml ? window.escapeHtml(String(p.title || '')) : String(p.title || '');
                    const author = window.escapeHtml ? window.escapeHtml(String(p.author_name || '')) : String(p.author_name || '');
                    const firstUrl = String(p.first_url || '').trim();
                    const firstUrlSafe = window.escapeHtml ? window.escapeHtml(firstUrl) : firstUrl;
                    const postID = Number(p.id || 0);
                    const checked = this.promotionSelectedIds.has(postID) ? 'checked' : '';
                    const reviewBadge = reviewStatus === 'approved'
                        ? '<span class="badge active">승인</span>'
                        : (reviewStatus === 'rejected' ? '<span class="badge" style="background:#fee2e2; color:#991b1b;">반려</span>' : '<span class="badge">대기</span>');
                    return `
                        <tr>
                            <td style="text-align:center;"><input type="checkbox" ${checked} onchange="GMManager.togglePromotionRow(${postID}, this.checked)"></td>
                            <td style="text-align:center;">${number > 0 ? number : '-'}</td>
                            <td style="text-align:center;">${author}</td>
                            <td>${title}</td>
                            <td style="max-width:280px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${firstUrl ? `<a href="${firstUrlSafe}" target="_blank" rel="noopener noreferrer">${firstUrlSafe}</a>` : '-'}</td>
                            <td style="text-align:center;" title="${window.escapeHtml ? window.escapeHtml(verifyTitle) : verifyTitle}">
                                ${verifyTitle ? (verifyOk ? '<i class="fas fa-circle-check" style="color:#16a34a;"></i>' : '<i class="fas fa-circle-xmark" style="color:#ef4444;"></i>') : '<i class="fas fa-circle-minus" style="color:#94a3b8;"></i>'}
                            </td>
                            <td style="text-align:center; font-weight:700; color:#334155;">${passCount}/${totalCount}</td>
                            <td style="text-align:center;">${reviewBadge}</td>
                            <td style="text-align:center;">${window.escapeHtml ? window.escapeHtml(String(p.created_at || '')) : String(p.created_at || '')}</td>
                            <td style="text-align:center;">${paid ? '<span class="badge active">지급완료</span>' : '<span class="badge">미지급</span>'}</td>
                            <td style="text-align:center;">
                                <div style="display:flex; gap:6px; justify-content:center; flex-wrap:wrap;">
                                    <button class="btn" style="padding:4px 10px; font-size:0.8rem; background:#f1f5f9; color:#0f172a;" onclick="GMManager.openPromotionDetail(${idx})">상세</button>
                                    <button class="btn" style="padding:4px 10px; font-size:0.8rem; background:#e2e8f0; color:#334155;" onclick="GMManager.verifyPromotion(${postID})">검사</button>
                                    <button class="btn" style="padding:4px 10px; font-size:0.8rem; background:#dbeafe; color:#1e40af;" onclick="GMManager.reviewPromotion(${postID}, 'approved')">승인</button>
                                    <button class="btn" style="padding:4px 10px; font-size:0.8rem; background:#fee2e2; color:#991b1b;" onclick="GMManager.reviewPromotion(${postID}, 'rejected')">반려</button>
                                    <button class="btn btn-primary" style="padding:4px 10px; font-size:0.8rem; ${(paid || reviewStatus !== 'approved') ? 'opacity:0.6; cursor:not-allowed;' : ''}" ${(paid || reviewStatus !== 'approved') ? 'disabled' : ''} onclick="GMManager.payPromotionReward(${postID})">${paid ? '지급완료' : '지급'}</button>
                                </div>
                            </td>
                        </tr>
                    `;
                }).join('');
            }
            if (pager && typeof renderPagination === 'function') {
                renderPagination(pager, {
                    page: this.promotionPage,
                    totalPages: Math.max(1, Number(data.totalPages || 1))
                }, (nextPage) => this.loadPromotions(nextPage));
            }
        } catch (e) {
            tbody.innerHTML = '<tr><td colspan="11" style="text-align:center; padding:20px; color:#ef4444;">홍보 목록 조회 중 오류가 발생했습니다.</td></tr>';
            if (pager) pager.innerHTML = '';
        }
    },

    async openPromotionDetail(index) {
        const row = this.promotionRows?.[Number(index)];
        const postID = Number(row?.id || 0);
        if (!postID) {
            ModalUtils.showAlert('홍보 상세 정보를 찾을 수 없습니다.');
            return;
        }
        this.promotionDetailPostId = postID;
        this.promotionDetailLinks = [];
        this.openPromotionDetailModal();
        await this.loadPromotionDetail(postID, false);
    },

    backToPromotionList() {
        this.promotionDetailPostId = 0;
        this.closePromotionDetailModal();
        this.loadPromotions(this.promotionPage || 1);
    },

    openPromotionDetailModal() {
        const existing = document.getElementById('gm-promotion-detail-modal');
        if (existing) existing.remove();
        const modal = document.createElement('div');
        modal.id = 'gm-promotion-detail-modal';
        modal.className = 'modal active';
        modal.style.position = 'fixed';
        modal.style.inset = '0';
        modal.style.width = '100vw';
        modal.style.height = '100vh';
        modal.style.display = 'flex';
        modal.style.alignItems = 'center';
        modal.style.justifyContent = 'center';
        modal.style.background = 'rgba(15, 23, 42, 0.62)';
        modal.style.backdropFilter = 'blur(4px)';
        modal.style.webkitBackdropFilter = 'blur(4px)';
        modal.style.zIndex = '30000';
        modal.style.padding = '16px';
        modal.innerHTML = `
            <div class="modal-content" style="position:relative; max-width:1200px; width:96vw; max-height:90vh; overflow:auto; padding:20px; background:#fff; border-radius:16px; box-shadow:0 28px 60px rgba(2,6,23,0.35);">
                <div id="gm-promotion-detail-loading" style="display:none; position:fixed; inset:0; background:rgba(255,255,255,0.72); z-index:39999; align-items:center; justify-content:center;">
                    <div style="display:flex; flex-direction:column; align-items:center; gap:8px; color:#0f172a;">
                        <i class="fas fa-spinner fa-spin" style="font-size:1.4rem;"></i>
                        <div id="gm-promotion-detail-loading-text" style="font-size:0.92rem; font-weight:600;">검사 중...</div>
                        <div style="width:280px; height:10px; border-radius:999px; background:#e2e8f0; overflow:hidden; border:1px solid #cbd5e1;">
                            <div id="gm-promotion-detail-loading-bar" style="width:0%; height:100%; background:linear-gradient(90deg, #3b82f6, #60a5fa); transition:width .2s ease;"></div>
                        </div>
                        <div id="gm-promotion-detail-loading-percent" style="font-size:0.82rem; color:#334155; font-weight:700;">0%</div>
                    </div>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <h3 style="margin:0; font-size:1.1rem; color:#0f172a;">홍보 게시물 상세</h3>
                    <button class="btn" type="button" onclick="GMManager.backToPromotionList()">닫기</button>
                </div>
                <div id="gm-promotion-detail-summary" style="font-size:0.9rem; color:var(--text-secondary); margin-bottom:10px;">불러오는 중...</div>
                <div style="display:flex; gap:8px; margin-bottom:10px; flex-wrap:wrap;">
                    <button class="btn" id="gm-promotion-detail-verify-btn" type="button">검사</button>
                    <button class="btn" id="gm-promotion-detail-approve-btn" type="button">승인</button>
                    <button class="btn" id="gm-promotion-detail-reject-btn" type="button">반려</button>
                    <button class="btn btn-primary" id="gm-promotion-detail-pay-btn" type="button">지급</button>
                </div>
                <div class="scroll-table premium-table">
                    <table>
                        <thead>
                            <tr>
                                <th style="width:70px;">번호</th>
                                <th>URL</th>
                                <th style="width:90px;">자동검사</th>
                                <th style="width:110px;">URL상태</th>
                                <th style="width:220px;">검사메시지</th>
                                <th style="width:180px;">관리</th>
                            </tr>
                        </thead>
                        <tbody id="gm-promotion-detail-links">
                            <tr><td colspan="6" style="text-align:center; padding:18px; color:#64748b;">불러오는 중...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        modal.addEventListener('click', (e) => {
            if (e.target === modal) this.backToPromotionList();
        });
        document.body.appendChild(modal);
    },

    closePromotionDetailModal() {
        const modal = document.getElementById('gm-promotion-detail-modal');
        if (modal) modal.remove();
    },

    setPromotionDetailLoading(active, text, percent) {
        const box = document.getElementById('gm-promotion-detail-loading');
        const txt = document.getElementById('gm-promotion-detail-loading-text');
        const bar = document.getElementById('gm-promotion-detail-loading-bar');
        const pctEl = document.getElementById('gm-promotion-detail-loading-percent');
        if (!box) return;
        box.style.display = active ? 'flex' : 'none';
        if (txt && text) txt.textContent = String(text);
        if (bar) {
            const p = Math.max(0, Math.min(100, Number(percent || 0)));
            bar.style.width = `${p}%`;
        }
        if (pctEl) {
            const p = Math.max(0, Math.min(100, Number(percent || 0)));
            pctEl.textContent = `${Math.round(p)}%`;
        }
    },

    ensurePromotionBulkLoadingUI() {
        let wrap = document.getElementById('gm-promotion-bulk-loading');
        if (wrap) return wrap;
        wrap = document.createElement('div');
        wrap.id = 'gm-promotion-bulk-loading';
        wrap.style.position = 'fixed';
        wrap.style.inset = '0';
        wrap.style.display = 'none';
        wrap.style.alignItems = 'center';
        wrap.style.justifyContent = 'center';
        wrap.style.background = 'rgba(255,255,255,0.72)';
        wrap.style.zIndex = '40000';
        wrap.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center; gap:8px; color:#0f172a; background:#ffffff; border:1px solid #cbd5e1; border-radius:14px; padding:16px 18px; box-shadow:0 18px 44px rgba(15,23,42,.24); min-width:320px;">
                <i class="fas fa-spinner fa-spin" style="font-size:1.35rem;"></i>
                <div id="gm-promotion-bulk-loading-text" style="font-size:0.92rem; font-weight:700;">일괄 검사 중...</div>
                <div style="width:100%; height:10px; border-radius:999px; background:#e2e8f0; overflow:hidden; border:1px solid #cbd5e1;">
                    <div id="gm-promotion-bulk-loading-bar" style="width:0%; height:100%; background:linear-gradient(90deg, #3b82f6, #60a5fa); transition:width .2s ease;"></div>
                </div>
                <div id="gm-promotion-bulk-loading-percent" style="font-size:0.82rem; color:#334155; font-weight:700;">0%</div>
            </div>
        `;
        document.body.appendChild(wrap);
        return wrap;
    },

    setPromotionBulkLoading(active, text, percent) {
        const wrap = this.ensurePromotionBulkLoadingUI();
        if (!wrap) return;
        wrap.style.display = active ? 'flex' : 'none';
        const txt = document.getElementById('gm-promotion-bulk-loading-text');
        const bar = document.getElementById('gm-promotion-bulk-loading-bar');
        const pctEl = document.getElementById('gm-promotion-bulk-loading-percent');
        const p = Math.max(0, Math.min(100, Number(percent || 0)));
        if (txt && text) txt.textContent = String(text);
        if (bar) bar.style.width = `${p}%`;
        if (pctEl) pctEl.textContent = `${Math.round(p)}%`;
    },

    async loadPromotionDetail(postID, autoVerify = false) {
        const pid = Number(postID || this.promotionDetailPostId || 0);
        if (!pid) return;
        const summaryEl = document.getElementById('gm-promotion-detail-summary');
        const linksEl = document.getElementById('gm-promotion-detail-links');
        if (summaryEl) summaryEl.textContent = '상세 정보를 불러오는 중...';
        if (linksEl) linksEl.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:18px; color:#64748b;">불러오는 중...</td></tr>';
        try {
            const res = await fetch(`/api/board/promotion/admin/detail?id=${pid}`);
            if (!res.ok) {
                const msg = await res.text();
                if (summaryEl) summaryEl.textContent = msg || '상세 정보를 불러오지 못했습니다.';
                if (linksEl) linksEl.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:18px; color:#ef4444;">상세 정보를 불러오지 못했습니다. (${res.status})</td></tr>`;
                return;
            }
            const data = await res.json();
            this.renderPromotionDetail(data);
        } catch (e) {
            if (summaryEl) summaryEl.textContent = '상세 정보를 불러오지 못했습니다.';
            if (linksEl) linksEl.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:18px; color:#ef4444;">상세 조회 중 오류가 발생했습니다.</td></tr>';
        }
    },

    renderPromotionDetail(data) {
        const post = data?.post || {};
        const links = Array.isArray(data?.links) ? data.links : [];
        this.promotionDetailLinks = links;
        const summaryEl = document.getElementById('gm-promotion-detail-summary');
        const linksEl = document.getElementById('gm-promotion-detail-links');
        const pid = Number(post.id || this.promotionDetailPostId || 0);
        this.promotionDetailPostId = pid;

        const title = window.escapeHtml ? window.escapeHtml(String(post.title || '')) : String(post.title || '');
        const author = window.escapeHtml ? window.escapeHtml(String(post.author_name || '')) : String(post.author_name || '');
        const createdAt = window.escapeHtml ? window.escapeHtml(String(post.created_at || '')) : String(post.created_at || '');
        const reviewStatus = String(post.review_status || 'pending').toLowerCase();
        const reviewText = reviewStatus === 'approved' ? '승인' : (reviewStatus === 'rejected' ? '반려' : '대기');
        const paid = post.reward_paid === true;
        const paidText = paid ? `지급완료 (${window.escapeHtml ? window.escapeHtml(String(post.reward_paid_at || '')) : String(post.reward_paid_at || '')})` : '미지급';

        if (summaryEl) {
            summaryEl.innerHTML = `제목: <strong>${title}</strong> | 작성자: <strong>${author}</strong> | 작성일: ${createdAt} | URL ${links.length}개 | 게시물 상태: <strong>${reviewText}</strong> | 보상: <strong>${paidText}</strong>`;
        }
        const verifyBtn = document.getElementById('gm-promotion-detail-verify-btn');
        const approveBtn = document.getElementById('gm-promotion-detail-approve-btn');
        const rejectBtn = document.getElementById('gm-promotion-detail-reject-btn');
        const payBtn = document.getElementById('gm-promotion-detail-pay-btn');
        if (verifyBtn) verifyBtn.onclick = () => this.verifyPromotion(pid);
        if (approveBtn) approveBtn.onclick = () => this.reviewPromotion(pid, 'approved');
        if (rejectBtn) rejectBtn.onclick = () => this.reviewPromotion(pid, 'rejected');
        if (payBtn) {
            payBtn.onclick = () => this.payPromotionReward(pid);
            payBtn.disabled = paid || reviewStatus !== 'approved';
            payBtn.style.opacity = payBtn.disabled ? '0.6' : '1';
            payBtn.style.cursor = payBtn.disabled ? 'not-allowed' : 'pointer';
            payBtn.textContent = paid ? '지급완료' : '지급';
        }

        if (!linksEl) return;
        if (!links.length) {
            linksEl.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:18px; color:#64748b;">등록된 URL이 없습니다.</td></tr>';
            return;
        }
        linksEl.innerHTML = links.map((link, idx) => {
            const lid = Number(link.id || 0);
            const url = window.escapeHtml ? window.escapeHtml(String(link.url || '')) : String(link.url || '');
            const verifyMessage = window.escapeHtml ? window.escapeHtml(String(link.verify_message || '')) : String(link.verify_message || '');
            const verifyOk = link.verify_ok === true;
            const linkStatus = String(link.review_status || 'pending').toLowerCase();
            const statusBadge = linkStatus === 'approved'
                ? '<span class="badge active">승인</span>'
                : (linkStatus === 'rejected' ? '<span class="badge" style="background:#fee2e2; color:#991b1b;">거절</span>' : '<span class="badge">대기</span>');
            const verifyIcon = verifyMessage
                ? (verifyOk ? '<i class="fas fa-circle-check" style="color:#16a34a;"></i>' : '<i class="fas fa-circle-xmark" style="color:#ef4444;"></i>')
                : '<i class="fas fa-circle-minus" style="color:#94a3b8;"></i>';
            return `
                <tr>
                    <td style="text-align:center;">${idx + 1}</td>
                    <td style="word-break:break-all;"><a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a></td>
                    <td style="text-align:center;">${verifyIcon}</td>
                    <td style="text-align:center;">${statusBadge}</td>
                    <td style="font-size:0.85rem; color:#334155;">${verifyMessage || '-'}</td>
                    <td style="text-align:center;">
                        <div style="display:flex; gap:6px; justify-content:center;">
                            <button class="btn" style="padding:4px 8px; font-size:0.78rem; background:#dbeafe; color:#1e40af;" onclick="GMManager.reviewPromotionLink(${lid}, 'approved')">승인</button>
                            <button class="btn" style="padding:4px 8px; font-size:0.78rem; background:#fee2e2; color:#991b1b;" onclick="GMManager.reviewPromotionLink(${lid}, 'rejected')">거절</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    },

    async autoVerifyPromotionLinks(postID) {
        const pid = Number(postID || this.promotionDetailPostId || 0);
        if (!pid) return;
        try {
            this.setPromotionDetailLoading(true, 'URL 자동 검사 중...');
            const res = await fetch('/api/board/promotion/link/auto-verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ post_id: pid })
            });
            if (res.ok) {
                const detailRes = await fetch(`/api/board/promotion/admin/detail?id=${pid}`);
                if (detailRes.ok) {
                    const detail = await detailRes.json();
                    this.renderPromotionDetail(detail);
                }
            }
        } catch (e) {
            // ignore auto-verify errors in UI flow
        } finally {
            this.setPromotionDetailLoading(false);
        }
    },

    reviewPromotionLink(linkID, action) {
        const lid = Number(linkID || 0);
        const act = String(action || '').trim();
        if (!lid || !act) return;
        const label = act === 'approved' ? '승인' : '거절';
        ModalUtils.showConfirm(`해당 URL을 ${label} 처리하시겠습니까?`, async () => {
            try {
                const res = await fetch('/api/board/promotion/link/review', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ link_id: lid, action: act })
                });
                if (!res.ok) {
                    const msg = await res.text();
                    ModalUtils.handleError(msg || 'URL 상태 변경 실패', '홍보 URL 상태 변경');
                    return;
                }
                await this.loadPromotionDetail(this.promotionDetailPostId, false);
                this.loadPromotions(this.promotionPage || 1);
            } catch (e) {
                ModalUtils.showAlert('URL 상태 변경 중 오류가 발생했습니다.');
            }
        });
    },

    async verifyPromotion(postID) {
        const pid = Number(postID || 0);
        if (!pid) return;
        const isDetailTarget = Number(this.promotionDetailPostId || 0) === pid;
        const links = isDetailTarget && Array.isArray(this.promotionDetailLinks) ? this.promotionDetailLinks : [];
        try {
            if (!links.length) {
                const res = await fetch('/api/board/promotion/verify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ post_id: pid })
                });
                if (!res.ok) {
                    const msg = await res.text();
                    ModalUtils.handleError(msg || '검사 실패', '홍보 URL 검사');
                    return;
                }
                const data = await res.json().catch(() => ({}));
                if (data && data.verify_message) {
                    ModalUtils.showAlert(String(data.verify_message));
                }
                if (this.promotionDetailPostId === pid) {
                    await this.loadPromotionDetail(pid, false);
                }
                this.loadPromotions(this.promotionPage || 1);
                return;
            }

            this.setPromotionDetailLoading(true, '검사 준비 중...', 0);
            const queue = links.map((l) => ({ id: Number(l?.id || 0) })).filter((l) => l.id > 0);
            const total = queue.length;
            let done = 0;
            let pass = 0;
            if (!total) {
                ModalUtils.showAlert('검사할 URL이 없습니다.');
                return;
            }
            const concurrency = Math.min(3, Math.max(1, queue.length));

            const runWorker = async () => {
                while (queue.length > 0) {
                    const target = queue.shift();
                    if (!target) break;
                    this.setPromotionDetailLoading(true, `검사 중... (${done}/${total})`, Math.round((done / total) * 100));
                    try {
                        const res = await fetch('/api/board/promotion/verify/link', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ post_id: pid, link_id: target.id })
                        });
                        if (res.ok) {
                            const data = await res.json().catch(() => ({}));
                            if (data && data.verify_ok === true) pass++;
                        }
                    } catch (e) {
                        // keep going
                    } finally {
                        done++;
                        this.setPromotionDetailLoading(true, `검사 중... (${done}/${total})`, Math.round((done / total) * 100));
                    }
                }
            };

            await Promise.all(Array.from({ length: concurrency }, () => runWorker()));
            this.setPromotionDetailLoading(true, `검사 완료 (${total}/${total})`, 100);
            await new Promise((resolve) => setTimeout(resolve, 350));
            if (this.promotionDetailPostId === pid) {
                await this.loadPromotionDetail(pid, false);
            }
            this.loadPromotions(this.promotionPage || 1);
            ModalUtils.showAlert(`검사가 완료되었습니다. (통과 ${pass}/${total})`);
        } catch (e) {
            ModalUtils.showAlert('홍보 URL 검사 중 오류가 발생했습니다.');
        } finally {
            this.setPromotionDetailLoading(false);
        }
    },

    reviewPromotion(postID, action) {
        const pid = Number(postID || 0);
        const act = String(action || '').trim();
        if (!pid || !act) return;
        const label = act === 'approved' ? '승인' : '반려';
        ModalUtils.showConfirm(`해당 홍보글을 ${label} 처리하시겠습니까?`, async () => {
            try {
                const res = await fetch('/api/board/promotion/review', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ post_id: pid, action: act })
                });
                if (!res.ok) {
                    const msg = await res.text();
                    ModalUtils.handleError(msg || '상태 변경 실패', '홍보 상태 변경');
                    return;
                }
                if (this.promotionDetailPostId === pid) {
                    await this.loadPromotionDetail(pid, false);
                }
                this.loadPromotions(this.promotionPage || 1);
            } catch (e) {
                ModalUtils.showAlert('홍보 상태 변경 중 오류가 발생했습니다.');
            }
        });
    },

    payPromotionReward(postID) {
        const pid = Number(postID || 0);
        if (!pid) return;
        ModalUtils.showConfirm('해당 홍보글 작성자에게 보상을 우편 지급하시겠습니까?', async () => {
            try {
                const res = await fetch('/api/board/promotion/reward/pay', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ post_id: pid })
                });
                if (!res.ok) {
                    const msg = await res.text();
                    ModalUtils.handleError(msg || '보상 지급 실패', '홍보 보상 지급');
                    return;
                }
                ModalUtils.showAlert('우편 보상이 지급되었습니다.');
                if (this.promotionDetailPostId === pid) {
                    await this.loadPromotionDetail(pid, false);
                }
                this.loadPromotions(this.promotionPage || 1);
            } catch (e) {
                ModalUtils.showAlert('보상 지급 중 오류가 발생했습니다.');
            }
        });
    },

    resetInquiryFilters() {
        const categoryEl = document.getElementById('gm-inquiry-category');
        const authorEl = document.getElementById('gm-inquiry-author');
        const titleEl = document.getElementById('gm-inquiry-search');
        if (categoryEl) categoryEl.value = '';
        if (authorEl) authorEl.value = '';
        if (titleEl) titleEl.value = '';
        this.loadInquiries(1);
    },

    async updateInquiryStatus(postID) {
        const selectEl = document.getElementById(`inq-status-${postID}`);
        if (!selectEl) return;
        const status = String(selectEl.value || '').trim();
        try {
            const res = await fetch('/api/board/inquiry/status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ post_id: postID, status })
            });
            if (!res.ok) {
                const msg = await res.text();
                ModalUtils.handleError(msg || '상태 변경 실패', '문의 상태 변경 실패');
                return;
            }
            ModalUtils.showAlert('문의 상태가 변경되었습니다.');
            this.loadInquiries(this.inquiryPage || 1);
        } catch (e) {
            ModalUtils.showAlert('문의 상태 변경 중 오류가 발생했습니다.');
        }
    },

    async replyInquiry(postID) {
        if (!postID) return;
        try {
            const res = await fetch(`/api/board/post?id=${postID}`);
            if (!res.ok) {
                ModalUtils.showAlert('문의 내용을 불러오지 못했습니다.');
                return;
            }
            const data = await res.json();
            const post = data.post || {};
            const comments = Array.isArray(data.inquiry_messages) ? data.inquiry_messages : [];
            const plainContent = String(post.content || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
            const modal = document.getElementById('gm-inquiry-reply-modal');
            const meta = document.getElementById('gm-inquiry-reply-meta');
            const input = document.getElementById('gm-inquiry-reply-content');
            if (!modal || !meta || !input) {
                ModalUtils.showAlert('답변 모달을 불러오지 못했습니다.');
                return;
            }

            this.inquiryReplyPostId = Number(postID) || 0;
            meta.innerHTML = `
                <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px;">
                    ${this.renderInquiryCategoryBadge(post.category)}
                    ${this.renderInquiryStatusBadge(post.inquiry_status)}
                </div>
                <div style="margin-bottom:8px;"><b>제목:</b> ${window.escapeHtml ? window.escapeHtml(post.title || '') : (post.title || '')}</div>
                <div style="margin-bottom:8px;"><b>기존 답변:</b> ${comments.length}개</div>
                <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px; color:#334155; max-height:140px; overflow:auto;">
                    <b>문의 내용</b><br>${window.escapeHtml ? window.escapeHtml(plainContent || '') : (plainContent || '')}
                </div>
            `;
            input.value = '';
            modal.style.display = 'flex';
            input.focus();
        } catch (e) {
            ModalUtils.showAlert('문의 답변 처리 중 오류가 발생했습니다.');
        }
    },

    closeInquiryReplyModal() {
        const modal = document.getElementById('gm-inquiry-reply-modal');
        const input = document.getElementById('gm-inquiry-reply-content');
        if (input) input.value = '';
        if (modal) modal.style.display = 'none';
        this.inquiryReplyPostId = 0;
    },

    async submitInquiryReplyModal() {
        const postID = Number(this.inquiryReplyPostId || 0);
        const input = document.getElementById('gm-inquiry-reply-content');
        const answer = input ? String(input.value || '').trim() : '';
        if (!postID) {
            ModalUtils.showAlert('대상 문의를 찾을 수 없습니다.');
            return;
        }
        if (!answer) {
            ModalUtils.showAlert('답변 내용을 입력하세요.');
            return;
        }

        try {
            const writeRes = await fetch('/api/board/inquiry/message/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    post_id: postID,
                    content: answer.trim()
                })
            });
            if (!writeRes.ok) {
                const msg = await writeRes.text();
                ModalUtils.handleError(msg || '답변 등록에 실패했습니다.', '문의 답변 실패');
                return;
            }
            this.closeInquiryReplyModal();
            ModalUtils.showAlert('답변이 등록되었습니다.');
            this.loadInquiries(this.inquiryPage || 1);
        } catch (e) {
            ModalUtils.showAlert('문의 답변 처리 중 오류가 발생했습니다.');
        }
    },

    // ... Modal and Action methods (Add, Delete, etc.) ...
    openAddMemoModal(moduleName = null) {
        const modal = document.getElementById('gm-action-modal');
        document.getElementById('gm-modal-title').textContent = moduleName ? '紐⑤뱢 硫붾え ?묒꽦' : '??硫붾え ?묒꽦';
        document.getElementById('gm-modal-type').value = 'add_memo';
        document.getElementById('gm-modal-target-id').value = moduleName || '';

        const fields = document.getElementById('gm-modal-fields');
        fields.innerHTML = `
            <div class="form-group-premium">
                <label class="label-premium">?댁슜</label>
                <textarea id="gm-memo-content" class="input-premium" style="min-height:150px; resize:vertical; background:white;" placeholder="硫붾え ?댁슜???낅젰?섏꽭??.."></textarea>
            </div>
        `;

        modal.style.display = 'flex';
        document.getElementById('gm-memo-content').focus();
    },

    openLinkModal(moduleName, currentUrl, currentDesc) {
        const modal = document.getElementById('gm-action-modal');
        document.getElementById('gm-modal-title').textContent = '紐⑤뱢 ?ㅼ젙';
        document.getElementById('gm-modal-type').value = 'edit_link';
        document.getElementById('gm-modal-target-id').value = moduleName;

        const fields = document.getElementById('gm-modal-fields');
        fields.innerHTML = `
            <div class="form-group-premium">
                <label class="label-premium">湲곕뒫 諛붾줈媛湲?URL</label>
                <input type="text" id="gm-link-url" class="input-premium" value="${currentUrl}" placeholder="/content/blackmarket" style="background:white;">
                <p style="font-size:0.75rem; color:#94a3b8; margin-top:4px;">?대떦 紐⑤뱢怨?愿?⑤맂 ????쓽 寃쎈줈瑜??낅젰?섏꽭??</p>
            </div>
            <div class="form-group-premium">
                <label class="label-premium">GM ?명듃 (異붽? ?ㅻ챸)</label>
                <textarea id="gm-link-desc" class="input-premium" style="min-height:100px; background:white;">${currentDesc}</textarea>
            </div>
        `;

        modal.style.display = 'flex';
    },

    closeModal() {
        document.getElementById('gm-action-modal').style.display = 'none';
    },

    submitModal() {
        const type = document.getElementById('gm-modal-type').value;
        const targetId = document.getElementById('gm-modal-target-id').value;

        if (type === 'add_memo') {
            const content = document.getElementById('gm-memo-content').value;
            if (!content.trim()) return;

            fetch('/api/gm/memos/add', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    module_name: targetId || null,
                    content: content,
                    is_pinned: false
                })
            }).then(() => {
                this.closeModal();
                if (targetId) this.loadModuleDetail(targetId);
                else this.loadGlobalMemos();
            });
        } else if (type === 'edit_link') {
            const url = document.getElementById('gm-link-url').value;
            const desc = document.getElementById('gm-link-desc').value;

            fetch('/api/gm/modules/link', {
                method: 'POST',
                body: JSON.stringify({
                    module_name: targetId,
                    related_url: url,
                    manual_description: desc
                })
            }).then(() => {
                this.closeModal();
                this.loadModuleDetail(targetId);
            });
        }
    },

    togglePin(id, state) {
        fetch('/api/gm/memos/update', {
            method: 'POST',
            body: JSON.stringify({id: id, action: 'pin', value: state}) 
        }).then(() => {
             // Handle update logic
             // We need to know if we are in detail view or dashboard
             // Simple hack: if currentModule is set, reload module detail, else reload global
            if (this.currentModule) this.loadModuleDetail(this.currentModule);
            else this.loadGlobalMemos();
        });
    },

    toggleComplete(id, state) {
        fetch('/api/gm/memos/update', {
            method: 'POST',
            body: JSON.stringify({id: id, action: 'complete', value: state})
        }).then(() => {
            if (this.currentModule) this.loadModuleDetail(this.currentModule);
            else this.loadGlobalMemos();
        });
    },

    resetHomeSliderForm() {
        this.homeSliderEditId = 0;
        const title = document.getElementById('gm-home-slider-title');
        const image = document.getElementById('gm-home-slider-image');
        const file = document.getElementById('gm-home-slider-file');
        const link = document.getElementById('gm-home-slider-link');
        const order = document.getElementById('gm-home-slider-order');
        const active = document.getElementById('gm-home-slider-active');
        const saveBtn = document.getElementById('gm-home-slider-save-btn');
        if (title) title.value = '';
        if (image) image.value = '';
        if (file) file.value = '';
        if (link) link.value = '';
        if (order) order.value = '0';
        if (active) active.value = '1';
        if (saveBtn) saveBtn.textContent = '등록';
    },

    async uploadHomeSliderImage() {
        const fileInput = document.getElementById('gm-home-slider-file');
        const imageInput = document.getElementById('gm-home-slider-image');
        if (!fileInput || !fileInput.files || !fileInput.files.length) {
            ModalUtils.showAlert('업로드할 이미지 파일을 선택하세요.');
            return;
        }
        const fd = new FormData();
        fd.append('file', fileInput.files[0]);
        try {
            const res = await fetch('/api/gm/home-slider/upload', {
                method: 'POST',
                body: fd
            });
            if (!res.ok) {
                const msg = await res.text();
                throw new Error(msg || `HTTP ${res.status}`);
            }
            const data = await res.json();
            const uploaded = String(data.image_url || '').trim();
            if (!uploaded) throw new Error('업로드 경로를 받지 못했습니다.');
            if (imageInput) imageInput.value = uploaded;
            ModalUtils.showAlert('이미지 업로드가 완료되었습니다.');
        } catch (e) {
            ModalUtils.handleError(e, '이미지 업로드');
        }
    },

    renderHomeSliderAdminList() {
        const tbody = document.getElementById('gm-home-slider-list');
        if (!tbody) return;
        const rows = Array.isArray(this.homeSliderItems) ? this.homeSliderItems : [];
        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:18px; color:#64748b;">등록된 슬라이더가 없습니다.</td></tr>';
            return;
        }
        tbody.innerHTML = rows.map((item, idx) => {
            const image = window.escapeHtml ? window.escapeHtml(String(item.image_url || '')) : String(item.image_url || '');
            const title = window.escapeHtml ? window.escapeHtml(String(item.title || '')) : String(item.title || '');
            const link = window.escapeHtml ? window.escapeHtml(String(item.link_url || '')) : String(item.link_url || '');
            const active = Number(item.is_active || 0) === 1;
            return `
                <tr>
                    <td style="text-align:center;">${idx + 1}</td>
                    <td style="text-align:center;">
                        <img src="${image}" alt="slider" style="width:88px; height:42px; object-fit:cover; border-radius:6px; border:1px solid #e2e8f0;" onerror="this.style.opacity='0.35'">
                    </td>
                    <td>${title || '-'}</td>
                    <td style="max-width:260px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${image}">${image}</td>
                    <td style="max-width:240px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${link}">${link || '-'}</td>
                    <td style="text-align:center;">${Number(item.order_index || 0)}</td>
                    <td style="text-align:center;">${active ? '<span class="badge active">활성</span>' : '<span class="badge">비활성</span>'}</td>
                    <td style="text-align:center;">
                        <button class="btn btn-sm btn-primary" onclick="GMManager.editHomeSlider(${Number(item.id || 0)})">수정</button>
                        <button class="btn btn-sm btn-danger" onclick="GMManager.deleteHomeSlider(${Number(item.id || 0)})">삭제</button>
                    </td>
                </tr>
            `;
        }).join('');
    },

    async loadHomeSliderAdmin() {
        const tbody = document.getElementById('gm-home-slider-list');
        if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:18px;">불러오는 중...</td></tr>';
        try {
            const res = await fetch('/api/gm/home-slider/list');
            if (!res.ok) {
                const msg = await res.text();
                throw new Error(msg || `HTTP ${res.status}`);
            }
            const data = await res.json();
            this.homeSliderItems = Array.isArray(data) ? data : [];
            this.renderHomeSliderAdminList();
        } catch (e) {
            if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:18px; color:#ef4444;">목록을 불러오지 못했습니다.</td></tr>';
            ModalUtils.handleError(e, '홈슬라이더');
        }
    },

    editHomeSlider(id) {
        const target = (Array.isArray(this.homeSliderItems) ? this.homeSliderItems : []).find(v => Number(v.id || 0) === Number(id));
        if (!target) return;
        this.homeSliderEditId = Number(target.id || 0);
        const title = document.getElementById('gm-home-slider-title');
        const image = document.getElementById('gm-home-slider-image');
        const link = document.getElementById('gm-home-slider-link');
        const order = document.getElementById('gm-home-slider-order');
        const active = document.getElementById('gm-home-slider-active');
        const saveBtn = document.getElementById('gm-home-slider-save-btn');
        if (title) title.value = String(target.title || '');
        if (image) image.value = String(target.image_url || '');
        if (link) link.value = String(target.link_url || '');
        if (order) order.value = String(Number(target.order_index || 0));
        if (active) active.value = Number(target.is_active || 0) === 1 ? '1' : '0';
        if (saveBtn) saveBtn.textContent = '수정 저장';
    },

    async saveHomeSlider() {
        const title = String(document.getElementById('gm-home-slider-title')?.value || '').trim();
        const imageURL = String(document.getElementById('gm-home-slider-image')?.value || '').trim();
        const linkURL = String(document.getElementById('gm-home-slider-link')?.value || '').trim();
        const orderIndex = Number(document.getElementById('gm-home-slider-order')?.value || 0);
        const isActive = String(document.getElementById('gm-home-slider-active')?.value || '1') === '1';

        if (!imageURL) {
            ModalUtils.showAlert('이미지 경로를 입력하세요.');
            return;
        }
        try {
            const res = await fetch('/api/gm/home-slider/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: Number(this.homeSliderEditId || 0),
                    title: title,
                    image_url: imageURL,
                    link_url: linkURL,
                    order_index: Number.isFinite(orderIndex) ? orderIndex : 0,
                    is_active: isActive
                })
            });
            if (!res.ok) {
                const msg = await res.text();
                throw new Error(msg || `HTTP ${res.status}`);
            }
            this.resetHomeSliderForm();
            await this.loadHomeSliderAdmin();
            if (typeof window.loadHomeSlider === 'function') window.loadHomeSlider();
            ModalUtils.showAlert('저장되었습니다.');
        } catch (e) {
            ModalUtils.handleError(e, '홈슬라이더 저장');
        }
    },

    deleteHomeSlider(id) {
        const targetID = Number(id || 0);
        if (!targetID) return;
        ModalUtils.showConfirm('선택한 슬라이더를 삭제하시겠습니까?', async () => {
            try {
                const res = await fetch('/api/gm/home-slider/delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: targetID })
                });
                if (!res.ok) {
                    const msg = await res.text();
                    throw new Error(msg || `HTTP ${res.status}`);
                }
                if (Number(this.homeSliderEditId || 0) === targetID) this.resetHomeSliderForm();
                await this.loadHomeSliderAdmin();
                if (typeof window.loadHomeSlider === 'function') window.loadHomeSlider();
            } catch (e) {
                ModalUtils.handleError(e, '홈슬라이더 삭제');
            }
        });
    },

    deleteMemo(id) {
        ModalUtils.showConfirm('?뺣쭚 ??젣?섏떆寃좎뒿?덇퉴?', () => {
            fetch('/api/gm/memos/delete', {
                method: 'POST',
                body: JSON.stringify({id: id})
            }).then(() => {
                if (this.currentModule) this.loadModuleDetail(this.currentModule);
                else this.loadGlobalMemos();
            });
        });
    }
};

function loadGMModules() {
    fetch('/api/gm/modules')
        .then(res => {
            if (!res.ok) {
                console.error("Failed to fetch modules:", res.status, res.statusText);
                return res.text().then(errText => { throw new Error(errText); });
            }
            return res.json();
        })
        .then(data => {
            if (!Array.isArray(data)) {
                console.error("Expected array but got:", data);
                ModalUtils.showModalUtils.showAlert("일정 등록 실패");
                return;
            }
            GMManager.modules = data;
            GMManager.renderModuleList();
            
            const searchInput = document.getElementById('gm-module-search');
            if(searchInput) {
                 searchInput.addEventListener('input', () => {
                    GMManager.renderModuleList();
                });
            }
        })
        .catch(err => {
            console.error("Error loading modules:", err);
            const list = document.getElementById('gm-module-list');
            if (list) list.innerHTML = `<div style="padding:20px; text-align:center; color:red;">모듈 목록을 불러오지 못했습니다.</div>`;
            ModalUtils.handleError(err);
        });
}

// Hook into openTab to load data when GM tab is opened
const originalOpenTab = window.openTab;
window.openTab = function(tabName) {
    if (originalOpenTab) originalOpenTab(tabName);
    if (tabName === 'gm') {
        loadGMModules();
    }
};
