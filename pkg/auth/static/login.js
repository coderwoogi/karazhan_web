(() => {
    function hasSwal() {
        return typeof window !== 'undefined' && window.Swal && typeof window.Swal.fire === 'function';
    }

    function showError(message) {
        if (hasSwal()) {
            window.Swal.fire({
                title: '로그인 오류',
                text: message,
                icon: 'error',
                confirmButtonText: '확인',
                confirmButtonColor: '#3085d6'
            });
            return;
        }
        alert(message);
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

    async function onSubmit(e) {
        e.preventDefault();
        const form = e.currentTarget;
        const params = new URLSearchParams(new FormData(form));
        persistRememberedId();

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                body: params
            });

            if (response.ok) {
                location.replace('/home/');
                return;
            }

            const text = await response.text();
            showError(`로그인 실패: ${text}`);
        } catch (err) {
            console.error('Login request failed', err);
            showError('로그인 중 문제가 발생했습니다.');
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        loadRememberedId();
        const form = document.getElementById('loginForm');
        if (form) form.addEventListener('submit', onSubmit);
    });
})();
