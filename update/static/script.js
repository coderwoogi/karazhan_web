document.addEventListener('DOMContentLoaded', () => {
    const uploadForm = document.getElementById('uploadForm');
    const fileInput = document.getElementById('fileInput');
    const fileNameSpan = document.getElementById('fileName');
    const fileListBody = document.getElementById('fileList');
    const submitBtn = document.getElementById('submitBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    const editNoInput = document.getElementById('edit-no');
    const uploadProgressWrap = document.getElementById('uploadProgressWrap');
    const uploadProgressText = document.getElementById('uploadProgressText');
    const uploadProgressBar = document.getElementById('uploadProgressBar');
    const uploadCardTitle = document.getElementById('upload-card-title');
    const listCardTitle = document.getElementById('list-card-title');
    const compareCardTitle = document.getElementById('compare-card-title');
    const uploadFileLabel = document.getElementById('upload-file-label');
    const compareUrlLabel = document.getElementById('compare-url-label');
    const tabButtons = document.querySelectorAll('.update-tab-btn');
    const compareSourceUrlInput = document.getElementById('compareSourceUrl');
    const saveCompareUrlBtn = document.getElementById('saveCompareUrlBtn');
    const runCompareBtn = document.getElementById('runCompareBtn');
    const compareLocalFile = document.getElementById('compareLocalFile');
    const compareLocalMd5 = document.getElementById('compareLocalMd5');
    const compareRemoteFile = document.getElementById('compareRemoteFile');
    const compareRemoteMd5 = document.getElementById('compareRemoteMd5');
    const compareStatusBadge = document.getElementById('compareStatusBadge');
    const compareCheckedAt = document.getElementById('compareCheckedAt');
    const compareMessage = document.getElementById('compareMessage');

    let isUploading = false;
    let currentType = 'update'; // update | launcher

    function getSwalHost() {
        try {
            if (window.parent && window.parent !== window && window.parent.Swal && typeof window.parent.Swal.fire === 'function') {
                return window.parent;
            }
        } catch (e) {
            // ignore cross-frame access errors
        }
        if (typeof window !== 'undefined' && window.Swal && typeof window.Swal.fire === 'function') {
            return window;
        }
        return null;
    }

    function showAlert(message, icon = 'info', title = '') {
        const host = getSwalHost();
        if (host) {
            return host.Swal.fire({
                title: title || (icon === 'error' ? '오류' : icon === 'warning' ? '경고' : '알림'),
                text: message,
                icon,
                confirmButtonText: '확인',
                confirmButtonColor: '#3b5bdb'
            });
        }
        alert(message);
        return Promise.resolve();
    }

    async function showConfirm(message) {
        const host = getSwalHost();
        if (host) {
            const result = await host.Swal.fire({
                title: '확인',
                text: message,
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: '확인',
                cancelButtonText: '취소',
                confirmButtonColor: '#3b5bdb',
                cancelButtonColor: '#94a3b8'
            });
            return !!result.isConfirmed;
        }
        return confirm(message);
    }

    function getTypeLabel() {
        return currentType === 'launcher' ? '접속기 파일' : '업데이트 파일';
    }

    function applyTabUI() {
        tabButtons.forEach(btn => {
            const active = btn.dataset.type === currentType;
            btn.classList.toggle('active', active);
        });

        const typeLabel = getTypeLabel();
        if (uploadCardTitle) uploadCardTitle.innerHTML = `<i class="fas fa-cloud-upload-alt"></i> ${typeLabel} 등록 / 수정`;
        if (listCardTitle) listCardTitle.innerHTML = `<i class="fas fa-list"></i> ${typeLabel} 목록`;
        if (compareCardTitle) compareCardTitle.innerHTML = `<i class="fas fa-fingerprint"></i> ${typeLabel} MD5 비교`;
        if (uploadFileLabel) uploadFileLabel.innerHTML = `<i class="fas fa-file-upload"></i> ${typeLabel}`;
        if (compareUrlLabel) compareUrlLabel.innerHTML = `<i class="fas fa-link"></i> ${typeLabel} 비교 URL`;

        resetForm();
        resetCompareResult();
        loadSourceUrl();
        loadList();
    }

    function setProgress(visible, percent) {
        if (uploadProgressWrap) uploadProgressWrap.style.display = visible ? 'block' : 'none';
        const safePercent = Math.max(0, Math.min(100, Number(percent) || 0));
        if (uploadProgressText) uploadProgressText.textContent = `${safePercent}%`;
        if (uploadProgressBar) uploadProgressBar.style.width = `${safePercent}%`;
    }

    function setSubmittingState(submitting) {
        isUploading = submitting;
        if (submitBtn) submitBtn.disabled = submitting;
        if (cancelBtn) cancelBtn.disabled = submitting;
        if (fileInput) fileInput.disabled = submitting;
    }

    function uploadWithProgress(formData) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', '/update/api/upload', true);

            xhr.upload.addEventListener('progress', (evt) => {
                if (!evt.lengthComputable) return;
                const percent = Math.round((evt.loaded / evt.total) * 100);
                setProgress(true, percent);
            });

            xhr.onload = () => {
                resolve({
                    ok: xhr.status >= 200 && xhr.status < 300,
                    status: xhr.status,
                    text: xhr.responseText || ''
                });
            };

            xhr.onerror = () => reject(new Error('network_error'));
            xhr.send(formData);
        });
    }

    fileInput.addEventListener('change', () => {
        if (fileInput.files && fileInput.files.length > 0) {
            fileNameSpan.textContent = fileInput.files[0].name;
        } else {
            fileNameSpan.textContent = '선택된 파일 없음';
        }
    });

    uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (isUploading) return;

        if (!fileInput.files || fileInput.files.length === 0) {
            await showAlert('업로드할 파일을 먼저 선택해주세요.', 'warning', '파일 미선택');
            return;
        }

        const formData = new FormData(uploadForm);
        formData.set('type', currentType);

        setSubmittingState(true);
        setProgress(true, 0);

        try {
            const response = await uploadWithProgress(formData);

            if (response.ok) {
                setProgress(true, 100);
                await showAlert('저장되었습니다.', 'success', '완료');
                resetForm();
                await loadList();
            } else {
                const text = (response.text || '').trim();
                await showAlert(text ? `오류 발생: ${text}` : '업로드 처리 중 오류가 발생했습니다.', 'error', '업로드 실패');
            }
        } catch (error) {
            console.error('Upload error:', error);
            await showAlert('업로드 중 오류가 발생했습니다.', 'error', '업로드 실패');
        } finally {
            setSubmittingState(false);
            setTimeout(() => setProgress(false, 0), 350);
        }
    });

    cancelBtn.addEventListener('click', resetForm);

    fileListBody.addEventListener('click', async (e) => {
        const editBtn = e.target.closest('.edit-btn');
        const deleteBtn = e.target.closest('.delete-btn');

        if (editBtn) {
            const no = editBtn.dataset.no;
            const filename = editBtn.dataset.file;
            startEdit(no, filename);
            return;
        }

        if (deleteBtn) {
            const no = deleteBtn.dataset.no;
            const ok = await showConfirm('정말 삭제하시겠습니까?');
            if (!ok) return;

            try {
                const formData = new FormData();
                formData.append('no', no);

                const response = await fetch('/update/api/delete', {
                    method: 'POST',
                    body: formData
                });

                if (response.ok) {
                    await loadList();
                } else {
                    await showAlert('삭제에 실패했습니다.', 'error', '삭제 실패');
                }
            } catch (error) {
                console.error('Delete error:', error);
                await showAlert('삭제 중 오류가 발생했습니다.', 'error', '삭제 실패');
            }
        }
    });

    function resetForm() {
        uploadForm.reset();
        editNoInput.value = '';
        fileNameSpan.textContent = '선택된 파일 없음';
        submitBtn.innerHTML = '<i class="fas fa-save"></i> 등록하기';
        cancelBtn.style.display = 'none';
        setProgress(false, 0);
    }

    function startEdit(no, filename) {
        editNoInput.value = no;
        fileNameSpan.textContent = filename + ' (새 파일 선택 시 교체)';
        submitBtn.innerHTML = '<i class="fas fa-pen"></i> 수정하기';
        cancelBtn.style.display = 'inline-flex';
    }

    function resetCompareResult() {
        if (compareLocalFile) compareLocalFile.textContent = '없음';
        if (compareLocalMd5) compareLocalMd5.textContent = '-';
        if (compareRemoteFile) compareRemoteFile.textContent = 'URL에서 계산';
        if (compareRemoteMd5) compareRemoteMd5.textContent = '-';
        if (compareCheckedAt) compareCheckedAt.textContent = '아직 비교하지 않았습니다.';
        if (compareMessage) compareMessage.textContent = '비교 URL을 저장한 뒤 비교 실행을 누르면 최신 등록 파일과 URL 파일의 MD5를 나란히 확인할 수 있습니다.';
        if (compareStatusBadge) {
            compareStatusBadge.textContent = '대기 중';
            compareStatusBadge.className = 'compare-status-badge neutral';
        }
    }

    async function loadSourceUrl() {
        if (!compareSourceUrlInput) return;
        try {
            const response = await fetch('/update/api/source_url?type=' + encodeURIComponent(currentType));
            const data = await response.json();
            compareSourceUrlInput.value = data && data.sourceUrl ? data.sourceUrl : '';
        } catch (error) {
            console.error('Source URL load error:', error);
            compareSourceUrlInput.value = '';
        }
    }

    async function saveSourceUrl() {
        const sourceUrl = compareSourceUrlInput ? compareSourceUrlInput.value.trim() : '';
        if (!sourceUrl) {
            await showAlert('비교할 URL을 먼저 입력해주세요.', 'warning', 'URL 미입력');
            return;
        }

        const formData = new FormData();
        formData.append('source_url', sourceUrl);

        try {
            const response = await fetch('/update/api/source_url?type=' + encodeURIComponent(currentType), {
                method: 'POST',
                body: formData
            });
            if (!response.ok) {
                const text = (await response.text()).trim();
                throw new Error(text || '저장에 실패했습니다.');
            }
            await showAlert('비교 URL이 저장되었습니다.', 'success', '완료');
        } catch (error) {
            console.error('Source URL save error:', error);
            await showAlert(error.message || 'URL 저장에 실패했습니다.', 'error', '저장 실패');
        }
    }

    async function runMd5Compare() {
        resetCompareResult();
        if (compareMessage) compareMessage.textContent = 'URL 파일을 내려받아 MD5를 계산하는 중입니다...';

        try {
            const response = await fetch('/update/api/compare_md5?type=' + encodeURIComponent(currentType), { cache: 'no-store' });
            const data = await response.json();

            if (compareLocalFile) compareLocalFile.textContent = data && data.localFile ? data.localFile : '없음';
            if (compareLocalMd5) compareLocalMd5.textContent = data && data.localMd5 ? data.localMd5 : '-';
            if (compareRemoteMd5) compareRemoteMd5.textContent = data && data.remoteMd5 ? data.remoteMd5 : '-';
            if (compareRemoteFile) compareRemoteFile.textContent = data && data.sourceUrl ? data.sourceUrl : 'URL이 등록되지 않음';
            if (compareCheckedAt) compareCheckedAt.textContent = data && data.checkedAt ? `${data.checkedAt} 비교` : '비교 시각 없음';

            const message = data && data.message ? data.message : '';
            if (compareMessage) {
                compareMessage.textContent = message || (data && data.match
                    ? '최근 등록 파일과 URL 파일의 MD5가 일치합니다.'
                    : '최근 등록 파일과 URL 파일의 MD5가 다릅니다.');
            }

            if (compareStatusBadge) {
                if (message && !data.remoteMd5) {
                    compareStatusBadge.textContent = '확인 필요';
                    compareStatusBadge.className = 'compare-status-badge error';
                } else if (data && data.match) {
                    compareStatusBadge.textContent = '일치';
                    compareStatusBadge.className = 'compare-status-badge match';
                } else {
                    compareStatusBadge.textContent = '불일치';
                    compareStatusBadge.className = 'compare-status-badge mismatch';
                }
            }
        } catch (error) {
            console.error('MD5 compare error:', error);
            if (compareStatusBadge) {
                compareStatusBadge.textContent = '오류';
                compareStatusBadge.className = 'compare-status-badge error';
            }
            if (compareMessage) compareMessage.textContent = 'MD5 비교 중 오류가 발생했습니다.';
            if (compareCheckedAt) compareCheckedAt.textContent = '비교 실패';
        }
    }

    async function loadList() {
        try {
            const response = await fetch('/update/api/list?type=' + encodeURIComponent(currentType));
            const data = await response.json();

            fileListBody.innerHTML = '';

            if (!Array.isArray(data) || data.length === 0) {
                fileListBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:#64748b;">등록된 파일이 없습니다.</td></tr>';
                return;
            }

            const total = data.length;
            data.forEach((item, idx) => {
                const tr = document.createElement('tr');
                const countedNo = total - idx;
                tr.innerHTML = `
                    <td>${countedNo}</td>
                    <td>${item.file}</td>
                    <td style="font-family:monospace; font-size:0.82rem;">${item.md5}</td>
                    <td>${item.date}</td>
                    <td class="action-cell">
                        <button type="button" class="action-btn edit-btn" data-no="${item.no}" data-file="${escapeHtml(item.file)}">수정</button>
                        <button type="button" class="action-btn delete-btn" data-no="${item.no}">삭제</button>
                    </td>
                `;
                fileListBody.appendChild(tr);
            });
        } catch (error) {
            console.error('List load error:', error);
            fileListBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:#dc2626;">파일 목록을 불러오지 못했습니다.</td></tr>';
        }
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.dataset.type;
            if (!type || type === currentType || isUploading) return;
            currentType = type;
            applyTabUI();
        });
    });

    if (saveCompareUrlBtn) {
        saveCompareUrlBtn.addEventListener('click', () => {
            void saveSourceUrl();
        });
    }

    if (runCompareBtn) {
        runCompareBtn.addEventListener('click', () => {
            void runMd5Compare();
        });
    }

    applyTabUI();
});
