(() => {
    function hasSwal() {
        return typeof window !== 'undefined' && window.Swal && typeof window.Swal.fire === 'function';
    }

    async function redirectIfLoggedIn() {
        try {
            const response = await fetch('/api/user/status', {
                credentials: 'same-origin',
                cache: 'no-store'
            });
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
        if (!document.body) return;
        if (document.getElementById('login-dialog-style')) return;
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
            .login-dialog-spinner{width:42px;height:42px;border-radius:50%;border:3px solid rgba(218,183,109,.18);border-top-color:#dab76d;animation:login-dialog-spin .85s linear infinite}
            @keyframes login-dialog-spin{to{transform:rotate(360deg)}}
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
                        <button type="button" class="login-dialog-btn">\uD655\uC778</button>
                    </div>
                </div>`;
            overlay.querySelector('h3').textContent = String(title || '\uC548\uB0B4');
            overlay.querySelector('p').textContent = String(message || '');
            const close = () => {
                overlay.remove();
                resolve();
            };
            overlay.querySelector('button').addEventListener('click', close, { once: true });
            document.body.appendChild(overlay);
        });
    }

    function showProgress(message) {
        if (hasSwal()) {
            window.Swal.fire({
                title: '\uB85C\uADF8\uC778 \uD655\uC778 \uC911',
                text: message,
                allowOutsideClick: false,
                allowEscapeKey: false,
                showConfirmButton: false,
                didOpen: () => window.Swal.showLoading()
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
                <h3>\uB85C\uADF8\uC778 \uD655\uC778 \uC911</h3>
                <p>${String(message || '\uACC4\uC815 \uC815\uBCF4\uB97C \uD655\uC778\uD558\uACE0 \uC788\uC2B5\uB2C8\uB2E4.')}</p>
            </div>`;
        document.body.appendChild(overlay);
    }

    function hideProgress() {
        document.getElementById('login-progress-overlay')?.remove();
        if (hasSwal()) {
            window.Swal.close();
        }
    }

    function showError(message) {
        const text = String(message || '\uB85C\uADF8\uC778\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.');
        if (hasSwal()) {
            return window.Swal.fire({
                title: '\uB85C\uADF8\uC778 \uC624\uB958',
                text,
                icon: 'error',
                confirmButtonText: '\uD655\uC778',
                confirmButtonColor: '#8d6a2f'
            });
        }
        return showFallbackDialog('\uB85C\uADF8\uC778 \uC624\uB958', text);
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
        } else {
            localStorage.removeItem('remembered_username');
        }
    }

    async function onSubmit(event) {
        event.preventDefault();
        const form = event.currentTarget;
        const params = new URLSearchParams(new FormData(form));
        const submitButton = form.querySelector('button[type="submit"], input[type="submit"]');
        persistRememberedId();

        try {
            if (submitButton) submitButton.disabled = true;
            showProgress('\uACC4\uC815 \uC815\uBCF4\uC640 \uC138\uC158 \uC0C1\uD0DC\uB97C \uD655\uC778\uD558\uACE0 \uC788\uC2B5\uB2C8\uB2E4.');
            const response = await fetch('/api/login', {
                method: 'POST',
                body: params
            });

            if (response.ok) {
                location.replace('/');
                return;
            }

            const text = (await response.text()).trim();
            const message = text || '\uC544\uC774\uB514 \uB610\uB294 \uBE44\uBC00\uBC88\uD638\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694.';
            await showError(`\uB85C\uADF8\uC778 \uC2E4\uD328: ${message}`);
        } catch (err) {
            console.error('Login request failed', err);
            await showError('\uB85C\uADF8\uC778 \uC911 \uBB38\uC81C\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.');
        } finally {
            hideProgress();
            if (submitButton) submitButton.disabled = false;
        }
    }

    document.addEventListener('DOMContentLoaded', async () => {
        const redirected = await redirectIfLoggedIn();
        if (redirected) return;
        loadRememberedId();
        const form = document.getElementById('loginForm');
        if (form) form.addEventListener('submit', onSubmit);
    });
})();
