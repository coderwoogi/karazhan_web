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
    const uploadFileLabel = document.getElementById('upload-file-label');
    const tabButtons = document.querySelectorAll('.update-tab-btn');

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
        if (uploadFileLabel) uploadFileLabel.innerHTML = `<i class="fas fa-file-upload"></i> ${typeLabel}`;

        resetForm();
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

    applyTabUI();
});
