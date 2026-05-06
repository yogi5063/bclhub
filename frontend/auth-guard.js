// auth-guard.js — Verify JWT on every dashboard page load.
// Loaded as first script in index.html (before any app logic).

(async function authGuard() {
  try {
    const res = await fetch('/api/verify', { credentials: 'include' });
    if (!res.ok) {
      window.location.href = '/login';
      return;
    }
    const data = await res.json();
    // Populate header username display (with role badge)
    const userDisplay = document.getElementById('user-display');
    if (userDisplay) userDisplay.textContent = `${data.username}${data.role === 'admin' ? ' · admin' : ''}`;
    sessionStorage.setItem('mis_user', data.username);
    sessionStorage.setItem('mis_role', data.role || 'viewer');
    // Expose globally so views can check
    window.userRole = data.role || 'viewer';
    if (typeof STATE !== 'undefined') STATE.userRole = window.userRole;
    // Hide admin-only UI elements for non-admin users
    if (data.role !== 'admin') {
      document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
      const ub = document.getElementById('upload-toggle');
      if (ub) ub.style.display = 'none';
    }
  } catch {
    window.location.href = '/login';
  }
})();

// Logout handler — defined here so it's available globally
function logout() {
  fetch('/api/logout', { method: 'POST', credentials: 'include' })
    .finally(() => {
      sessionStorage.removeItem('mis_user');
      window.location.href = '/login';
    });
}
