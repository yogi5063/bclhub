// login.js — Handles login form submission

(function () {
  const form      = document.getElementById('login-form');
  const usernameEl = document.getElementById('username');
  const passwordEl = document.getElementById('password');
  const errorEl   = document.getElementById('error-msg');
  const btnText   = document.getElementById('btn-text');
  const btnSpinner = document.getElementById('btn-spinner');
  const loginBtn  = document.getElementById('login-btn');
  const togglePw  = document.getElementById('toggle-pw');
  const eyeOpen   = document.getElementById('eye-open');
  const eyeClosed = document.getElementById('eye-closed');

  // If already logged in, skip to dashboard
  (async function checkExisting() {
    try {
      const r = await fetch('/api/verify', { credentials: 'include' });
      if (r.ok) window.location.href = '/';
    } catch {
      // not logged in — stay on login page
    }
  })();

  // Show/hide password toggle
  togglePw?.addEventListener('click', () => {
    const isPassword = passwordEl.type === 'password';
    passwordEl.type = isPassword ? 'text' : 'password';
    eyeOpen.style.display  = isPassword ? 'none' : '';
    eyeClosed.style.display = isPassword ? '' : 'none';
  });

  // Form submit
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = usernameEl.value.trim();
    const password = passwordEl.value;

    if (!username || !password) {
      showError('Please enter your username and password.');
      return;
    }

    setLoading(true);
    hideError();

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (res.ok && data.ok) {
        // Store display name for header (not the token — that's in HttpOnly cookie)
        sessionStorage.setItem('mis_user', data.username);
        window.location.href = '/';
      } else {
        showError(data.error || 'Invalid username or password.');
        passwordEl.value = '';
        passwordEl.focus();
      }
    } catch {
      showError('Connection error. Please check your network and try again.');
    } finally {
      setLoading(false);
    }
  });

  function setLoading(loading) {
    loginBtn.disabled = loading;
    btnText.textContent = loading ? 'Signing in…' : 'Sign In';
    btnSpinner.classList.toggle('hidden', !loading);
  }

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.classList.remove('hidden');
  }

  function hideError() {
    errorEl.classList.add('hidden');
    errorEl.textContent = '';
  }
})();
