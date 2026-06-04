(() => {
    const recoveryState = {
        activeTab: 'username',
        passwordStep: 'request',
        username: '',
        email: '',
        resetToken: '',
        triggerElement: null
    };
    let modalAlertCleanup = null;

    function hasSwal() {
        return typeof window !== 'undefined' && window.Swal && typeof window.Swal.fire === 'function';
    }

    async function redirectIfLoggedIn() {
        try {
            const response = await fetch('/api/user/status', {
                headers: { 'X-Background-Request': '1' },
                credentials: 'same-origin',
                cache: 'no-store'
            });
            if (response.status === 204) {
                return false;
            }
            if (response.ok) {
                location.replace('/');
                return true;
            }
        } catch (err) {
            console.warn('Session check failed', err);
        }
        return false;
    }

    function ensureLoginDialogUi() {
        if (!document.body || document.getElementById('login-dialog-style')) return;
        const style = document.createElement('style');
        style.id = 'login-dialog-style';
        style.textContent = `
            .login-dialog-overlay{position:fixed;inset:0;z-index:20000;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(7,7,13,.72);backdrop-filter:blur(6px)}
            .login-dialog-card{width:min(420px,calc(100vw - 32px));background:linear-gradient(180deg,rgba(22,16,35,.96),rgba(13,10,20,.98));border:1px solid rgba(218,183,109,.28);border-radius:18px;box-shadow:0 24px 90px rgba(0,0,0,.45);padding:24px;color:#f4ecdc}
            .login-dialog-card h3{margin:0 0 10px;font-size:22px;font-weight:800;color:#f3dfab}
            .login-dialog-card p{margin:0;white-space:pre-wrap;line-height:1.7;color:#ddd3bf}
            .login-dialog-actions{display:flex;justify-content:flex-end;margin-top:20px}
            .login-dialog-btn{border:1px solid rgba(218,183,109,.28);background:linear-gradient(180deg,rgba(119,72,29,.92),rgba(64,36,18,.96));color:#f7ecd4;border-radius:12px;padding:10px 18px;font-weight:700;cursor:pointer}
            .login-dialog-progress{display:flex;flex-direction:column;align-items:center;gap:14px;text-align:center}
            .login-dialog-spinner{position:relative;display:inline-flex;width:72px;height:72px}
            .login-dialog-spinner::before,.login-dialog-spinner::after{content:'';position:absolute;inset:0;border-radius:50%}
            .login-dialog-spinner::before{border:8px solid rgba(125,211,252,.18)}
            .login-dialog-spinner::after{border:8px solid transparent;border-top-color:#7dd3fc;border-right-color:#7dd3fc;animation:login-dialog-dashspin 1.2s ease-in-out infinite;filter:drop-shadow(0 0 12px rgba(125,211,252,.4))}
            @keyframes login-dialog-dashspin{
                0%{transform:rotate(0deg) scale(.96)}
                50%{transform:rotate(180deg) scale(1)}
                100%{transform:rotate(360deg) scale(.96)}
            }
        `;
        document.head.appendChild(style);
    }

    function showFallbackDialog(title, message) {
        ensureLoginDialogUi();
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'login-dialog-overlay';
            overlay.innerHTML = `
                <div class="login-dialog-card" role="dialog" aria-modal="true">
                    <h3></h3>
                    <p></p>
                    <div class="login-dialog-actions">
                        <button type="button" class="login-dialog-btn">확인</button>
                    </div>
                </div>`;

            overlay.querySelector('h3').textContent = String(title || '안내');
            overlay.querySelector('p').textContent = String(message || '');
            const close = () => {
                overlay.remove();
                resolve();
            };
            overlay.querySelector('button').addEventListener('click', close, { once: true });
            document.body.appendChild(overlay);
        });
    }

    function prepareRecoveryModalForAlert() {
        const modal = getRecoveryModal();
        if (!modal || !modal.classList.contains('active')) {
            return () => {};
        }

        const previousInert = modal.inert;
        const fallbackFocusTarget = document.querySelector('.login-container');

        if (modal.contains(document.activeElement) && typeof document.activeElement?.blur === 'function') {
            document.activeElement.blur();
        }

        modal.inert = true;

        if (fallbackFocusTarget && typeof fallbackFocusTarget.focus === 'function') {
            const hadTabIndex = fallbackFocusTarget.hasAttribute('tabindex');
            if (!hadTabIndex) {
                fallbackFocusTarget.setAttribute('tabindex', '-1');
            }
            fallbackFocusTarget.focus({ preventScroll: true });
            return () => {
                modal.inert = previousInert;
                if (!hadTabIndex) {
                    fallbackFocusTarget.removeAttribute('tabindex');
                }
            };
        }

        return () => {
            modal.inert = previousInert;
        };
    }

    function showProgress(message) {
        if (hasSwal()) {
            if (typeof modalAlertCleanup === 'function') {
                modalAlertCleanup();
                modalAlertCleanup = null;
            }
            modalAlertCleanup = prepareRecoveryModalForAlert();
            window.Swal.fire({
                title: '처리 중',
                text: message,
                allowOutsideClick: false,
                allowEscapeKey: false,
                showConfirmButton: false,
                didOpen: () => window.Swal.showLoading(),
                didClose: () => {
                    if (typeof modalAlertCleanup === 'function') {
                        modalAlertCleanup();
                        modalAlertCleanup = null;
                    }
                }
            });
            return;
        }

        ensureLoginDialogUi();
        hideProgress();

        const overlay = document.createElement('div');
        overlay.className = 'login-dialog-overlay';
        overlay.id = 'login-progress-overlay';
        overlay.innerHTML = `
            <div class="login-dialog-card login-dialog-progress" role="status" aria-live="polite">
                <div class="login-dialog-spinner" aria-hidden="true"></div>
                <h3>처리 중</h3>
                <p>${String(message || '요청을 처리하고 있습니다.')}</p>
            </div>`;
        document.body.appendChild(overlay);
    }

    function hideProgress() {
        document.getElementById('login-progress-overlay')?.remove();
        if (hasSwal()) window.Swal.close();
        if (typeof modalAlertCleanup === 'function') {
            modalAlertCleanup();
            modalAlertCleanup = null;
        }
    }

    function showError(message) {
        const text = String(message || '처리에 실패했습니다.');
        if (hasSwal()) {
            const cleanup = prepareRecoveryModalForAlert();
            return window.Swal.fire({
                title: '오류',
                text,
                icon: 'error',
                confirmButtonText: '확인',
                confirmButtonColor: '#8d6a2f',
                didClose: cleanup
            });
        }
        return showFallbackDialog('오류', text);
    }

    function showSuccess(title, text) {
        if (hasSwal()) {
            const cleanup = prepareRecoveryModalForAlert();
            return window.Swal.fire({
                title,
                text,
                icon: 'success',
                confirmButtonText: '확인',
                confirmButtonColor: '#8d6a2f',
                didClose: cleanup
            });
        }
        return showFallbackDialog(title, text);
    }

    function setRecoveryFeedback(id, message, type = '') {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = String(message || '');
        el.classList.remove('is-success', 'is-error');
        if (type === 'success') el.classList.add('is-success');
        if (type === 'error') el.classList.add('is-error');
    }

    function clearRecoveryFeedback() {
        ['find-username-feedback', 'password-request-feedback', 'password-reset-feedback']
            .forEach((id) => setRecoveryFeedback(id, '', ''));
    }

    function resetUsernameLookupView() {
        const content = document.getElementById('findUsernameContent');
        const result = document.getElementById('findUsernameResult');
        const resultValue = document.getElementById('findUsernameResultValue');

        if (content) content.hidden = false;
        if (result) result.hidden = true;
        if (resultValue) resultValue.textContent = '';
    }

    function showUsernameLookupResult(username) {
        const content = document.getElementById('findUsernameContent');
        const result = document.getElementById('findUsernameResult');
        const resultValue = document.getElementById('findUsernameResultValue');

        if (resultValue) resultValue.textContent = username;
        if (content) content.hidden = true;
        if (result) result.hidden = false;
    }

    function loadRememberedId() {
        const usernameEl = document.getElementById('username');
        const rememberEl = document.getElementById('rememberId');
        if (!usernameEl || !rememberEl) return;

        const remembered = localStorage.getItem('remembered_username') || '';
        if (remembered) {
            usernameEl.value = remembered;
            rememberEl.checked = true;
        }
    }

    function persistRememberedId() {
        const usernameEl = document.getElementById('username');
        const rememberEl = document.getElementById('rememberId');
        if (!usernameEl || !rememberEl) return;

        if (rememberEl.checked) {
            localStorage.setItem('remembered_username', usernameEl.value || '');
            return;
        }
        localStorage.removeItem('remembered_username');
    }

    function getRecoveryModal() {
        return document.getElementById('recoveryModal');
    }

    function switchRecoveryTab(tab) {
        recoveryState.activeTab = tab === 'password' ? 'password' : 'username';
        if (recoveryState.activeTab === 'username') {
            resetUsernameLookupView();
        }

        document.querySelectorAll('[data-recovery-tab]').forEach((button) => {
            button.classList.toggle('active', button.getAttribute('data-recovery-tab') === recoveryState.activeTab);
        });
        document.querySelectorAll('[data-recovery-panel]').forEach((panel) => {
            panel.classList.toggle('active', panel.getAttribute('data-recovery-panel') === recoveryState.activeTab);
        });

        const title = document.getElementById('recoveryModalTitle');
        const desc = document.getElementById('recoveryModalDesc');
        if (!title || !desc) return;

        if (recoveryState.activeTab === 'password') {
            title.textContent = '비밀번호 찾기';
            desc.textContent = '가입 정보가 일치하면 바로 새 비밀번호를 설정할 수 있습니다.';
            return;
        }

        title.textContent = '아이디 찾기';
        desc.textContent = '가입 시 사용한 이메일이 일치하면 화면에서 바로 아이디를 확인할 수 있습니다.';
    }

    function switchPasswordStep(step) {
        const nextStep = ['request', 'reset'].includes(step) ? step : 'request';
        recoveryState.passwordStep = nextStep;

        const order = ['request', 'reset'];
        const currentIndex = order.indexOf(nextStep);

        document.querySelectorAll('[data-step-indicator]').forEach((node) => {
            const nodeIndex = order.indexOf(node.getAttribute('data-step-indicator'));
            node.classList.toggle('active', nodeIndex <= currentIndex);
        });
        document.querySelectorAll('[data-step-panel]').forEach((panel) => {
            panel.classList.toggle('active', panel.getAttribute('data-step-panel') === nextStep);
        });
    }

    function openRecoveryModal(tab, triggerElement = null) {
        const modal = getRecoveryModal();
        if (!modal) return;

        recoveryState.triggerElement = triggerElement || document.activeElement;
        clearRecoveryFeedback();
        resetUsernameLookupView();
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
        switchRecoveryTab(tab);

        if (tab === 'password') {
            const usernameInput = document.getElementById('username');
            const recoveryUsername = document.getElementById('find-password-username');
            if (usernameInput && recoveryUsername && usernameInput.value && !recoveryUsername.value) {
                recoveryUsername.value = usernameInput.value;
            }
            recoveryState.resetToken = '';
        }
    }

    function closeRecoveryModal() {
        const modal = getRecoveryModal();
        if (!modal) return;

        if (modal.contains(document.activeElement) && typeof document.activeElement?.blur === 'function') {
            document.activeElement.blur();
        }
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
        const trigger = recoveryState.triggerElement;
        recoveryState.triggerElement = null;
        if (trigger && typeof trigger.focus === 'function') {
            window.setTimeout(() => trigger.focus(), 0);
        }
    }

    async function submitRecoveryForm(url, formData, progressText, fallbackError) {
        showProgress(progressText);
        try {
            const response = await fetch(url, {
                method: 'POST',
                body: formData
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || data.status === 'error') {
                throw new Error(data.message || fallbackError);
            }
            return data;
        } finally {
            hideProgress();
        }
    }

    async function onFindUsernameSubmit(event) {
        event.preventDefault();

        const form = event.currentTarget;
        resetUsernameLookupView();
        setRecoveryFeedback('find-username-feedback', '이메일 확인 요청을 보내는 중입니다.');

        try {
            const data = await submitRecoveryForm(
                '/api/account/recovery/username',
                new URLSearchParams(new FormData(form)),
                '가입 이메일과 계정 정보를 확인하고 있습니다.',
                '아이디 찾기에 실패했습니다.'
            );

            const foundUsername = String(data.username || '').trim();
            const message = foundUsername
                ? `확인된 아이디: ${foundUsername}`
                : (data.message || '아이디를 확인했습니다.');

            if (foundUsername) {
                clearRecoveryFeedback();
                showUsernameLookupResult(foundUsername);
                return;
            }

            setRecoveryFeedback('find-username-feedback', message, 'success');
        } catch (err) {
            const message = err.message || '아이디 찾기에 실패했습니다.';
            if (message === '입력한 이메일과 일치하는 계정을 찾을 수 없습니다.') {
                clearRecoveryFeedback();
            } else {
                setRecoveryFeedback('find-username-feedback', message, 'error');
            }
            await showError(message);
        }
    }

    async function onPasswordRecoveryRequestSubmit(event) {
        event.preventDefault();

        const form = event.currentTarget;
        const formData = new URLSearchParams(new FormData(form));
        recoveryState.username = String(formData.get('username') || '').trim();
        recoveryState.email = String(formData.get('email') || '').trim();
        setRecoveryFeedback('password-request-feedback', '가입 정보를 확인하고 있습니다.');

        try {
            const data = await submitRecoveryForm(
                '/api/account/recovery/password/request',
                formData,
                '가입 정보를 확인하고 있습니다.',
                '비밀번호 재설정 확인에 실패했습니다.'
            );

            recoveryState.resetToken = String(data.reset_token || '');
            const message = data.message || '확인되었습니다. 새 비밀번호를 설정해주세요.';
            setRecoveryFeedback('password-request-feedback', message, 'success');
            switchPasswordStep('reset');
            document.getElementById('find-password-new')?.focus();
        } catch (err) {
            const message = err.message || '비밀번호 재설정 확인에 실패했습니다.';
            setRecoveryFeedback('password-request-feedback', message, 'error');
            await showError(message);
        }
    }

    async function onPasswordRecoveryResetSubmit(event) {
        event.preventDefault();

        const form = event.currentTarget;
        const password = document.getElementById('find-password-new')?.value || '';
        const confirm = document.getElementById('find-password-confirm')?.value || '';

        if (password !== confirm) {
            const message = '새 비밀번호가 일치하지 않습니다.';
            setRecoveryFeedback('password-reset-feedback', message, 'error');
            await showError(message);
            return;
        }

        setRecoveryFeedback('password-reset-feedback', '새 비밀번호를 저장하고 있습니다.');

        const formData = new URLSearchParams();
        formData.set('reset_token', recoveryState.resetToken);
        formData.set('password', password);

        try {
            const data = await submitRecoveryForm(
                '/api/account/recovery/password/reset',
                formData,
                '새 비밀번호를 저장하고 있습니다.',
                '비밀번호 변경에 실패했습니다.'
            );

            const message = data.message || '비밀번호가 변경되었습니다.';
            setRecoveryFeedback('password-reset-feedback', message, 'success');
            await showSuccess('비밀번호 변경', message);
            form.reset();
            document.getElementById('passwordRecoveryRequestForm')?.reset();
            recoveryState.resetToken = '';
            recoveryState.username = '';
            recoveryState.email = '';
            switchPasswordStep('request');
            closeRecoveryModal();
        } catch (err) {
            const message = err.message || '비밀번호 변경에 실패했습니다.';
            setRecoveryFeedback('password-reset-feedback', message, 'error');
            await showError(message);
        }
    }

    function bindRecoveryUi() {
        document.querySelectorAll('[data-recovery-open]').forEach((button) => {
            button.addEventListener('click', () => openRecoveryModal(button.getAttribute('data-recovery-open'), button));
        });
        document.querySelectorAll('[data-recovery-close]').forEach((button) => {
            button.addEventListener('click', closeRecoveryModal);
        });
        document.querySelectorAll('[data-recovery-tab]').forEach((button) => {
            button.addEventListener('click', () => switchRecoveryTab(button.getAttribute('data-recovery-tab')));
        });
        document.querySelectorAll('[data-recovery-back]').forEach((button) => {
            button.addEventListener('click', () => switchPasswordStep(button.getAttribute('data-recovery-back')));
        });

        document.getElementById('findUsernameForm')?.addEventListener('submit', onFindUsernameSubmit);
        document.getElementById('findUsernameResetBtn')?.addEventListener('click', () => {
            resetUsernameLookupView();
            clearRecoveryFeedback();
            document.getElementById('findUsernameForm')?.reset();
            document.getElementById('find-username-email')?.focus();
        });
        document.getElementById('passwordRecoveryRequestForm')?.addEventListener('submit', onPasswordRecoveryRequestSubmit);
        document.getElementById('passwordRecoveryResetForm')?.addEventListener('submit', onPasswordRecoveryResetSubmit);

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') closeRecoveryModal();
        });
    }

    async function onSubmit(event) {
        event.preventDefault();

        const form = event.currentTarget;
        const params = new URLSearchParams(new FormData(form));
        const submitButton = form.querySelector('button[type="submit"], input[type="submit"]');
        persistRememberedId();

        try {
            if (submitButton) submitButton.disabled = true;

            showProgress('계정 정보와 세션 상태를 확인하고 있습니다.');
            const response = await fetch('/api/login', {
                method: 'POST',
                body: params
            });

            if (response.ok) {
                location.replace('/');
                return;
            }

            const text = (await response.text()).trim();
            const message = text || '아이디 또는 비밀번호를 확인해주세요.';
            await showError(`로그인 실패: ${message}`);
        } catch (err) {
            console.error('Login request failed', err);
            await showError('로그인 중 문제가 발생했습니다.');
        } finally {
            hideProgress();
            if (submitButton) submitButton.disabled = false;
        }
    }

    document.addEventListener('DOMContentLoaded', async () => {
        const redirected = await redirectIfLoggedIn();
        if (redirected) return;

        loadRememberedId();
        bindRecoveryUi();
        switchPasswordStep('request');
        switchRecoveryTab('username');

        const form = document.getElementById('loginForm');
        if (form) form.addEventListener('submit', onSubmit);
    });
})();
