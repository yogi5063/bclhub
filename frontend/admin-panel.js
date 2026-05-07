/**
 * admin-panel.js — Super Admin Panel
 * Manages all 48 clients: create, view, add users, reset passwords
 */

// ── State ─────────────────────────────────────────────────────────────────────
let clients = [];
let selectedClient = null;

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Verify super_admin session
  const session = await fetch('/api/verify').then(r => r.json()).catch(() => null);
  if (!session?.ok || session.role !== 'super_admin') {
    window.location.href = '/login';
    return;
  }

  document.getElementById('admin-name').textContent = session.name || session.email;
  await loadStats();
  await loadClients();
  setupListeners();
});

// ── API helpers ───────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const r = await fetch(`/api/admin${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.error || `HTTP ${r.status}`);
  }
  return r.json();
}

// ── Stats ─────────────────────────────────────────────────────────────────────
async function loadStats() {
  try {
    const stats = await api('GET', '/stats');
    document.getElementById('stat-clients').textContent = stats.clients;
    document.getElementById('stat-users').textContent   = stats.users;
    document.getElementById('stat-rows').textContent    = stats.data_rows;
  } catch (e) { console.warn('Stats error:', e.message); }
}

// ── Clients list ──────────────────────────────────────────────────────────────
async function loadClients() {
  try {
    clients = await api('GET', '/clients');
    renderClientList();
  } catch (e) { showToast('Failed to load clients: ' + e.message, 'error'); }
}

function renderClientList() {
  const list = document.getElementById('client-list');
  if (!clients.length) {
    list.innerHTML = '<p class="empty-msg">No clients yet. Create your first client →</p>';
    return;
  }

  list.innerHTML = clients.map(c => `
    <div class="client-card ${selectedClient?.id === c.id ? 'selected' : ''}"
         onclick="selectClient('${c.id}')">
      <div class="client-card-header">
        <span class="client-name">${c.name}</span>
        <span class="badge badge-${c.status}">${c.status}</span>
      </div>
      <div class="client-meta">
        <span>/${c.slug}</span>
        <span class="plan-badge">${c.plan}</span>
      </div>
      <div class="client-meta">
        <span>${c.industry || '—'}</span>
        <span>${c.country || '—'}</span>
      </div>
    </div>
  `).join('');
}

// ── Select client ─────────────────────────────────────────────────────────────
window.selectClient = async (id) => {
  selectedClient = clients.find(c => c.id === id);
  renderClientList();

  document.getElementById('client-detail').style.display = 'block';
  document.getElementById('client-detail-name').textContent = selectedClient.name;
  document.getElementById('client-slug-display').textContent = `/${selectedClient.slug}`;
  document.getElementById('client-plan').textContent = selectedClient.plan;
  document.getElementById('client-status').textContent = selectedClient.status;
  document.getElementById('client-industry').textContent = selectedClient.industry || '—';
  document.getElementById('client-country').textContent = selectedClient.country || '—';
  document.getElementById('preview-link').href = `/dashboard?client=${selectedClient.id}`;

  await loadUsers(id);
};

// ── Users ─────────────────────────────────────────────────────────────────────
async function loadUsers(clientId) {
  try {
    const users = await api('GET', `/clients/${clientId}/users`);
    renderUsers(users);
  } catch (e) { showToast('Failed to load users: ' + e.message, 'error'); }
}

function renderUsers(users) {
  const tbody = document.getElementById('users-table-body');
  if (!users.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-msg">No users yet</td></tr>';
    return;
  }
  tbody.innerHTML = users.map(u => `
    <tr>
      <td>${u.name || '—'}</td>
      <td>${u.email}</td>
      <td><span class="badge badge-${u.role}">${u.role}</span></td>
      <td>${u.last_login ? new Date(u.last_login).toLocaleDateString() : 'Never'}</td>
      <td>
        <button class="btn-sm btn-warning" onclick="resetPassword('${u.id}')">Reset PW</button>
        <button class="btn-sm btn-danger" onclick="deleteUser('${u.id}', '${u.email}')">Delete</button>
      </td>
    </tr>
  `).join('');
}

// ── Create client ─────────────────────────────────────────────────────────────
function setupListeners() {
  // Create client form
  document.getElementById('create-client-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd.entries());
    try {
      await api('POST', '/clients', body);
      showToast('Client created!', 'success');
      e.target.reset();
      document.getElementById('create-client-modal').style.display = 'none';
      await loadClients();
      await loadStats();
    } catch (err) { showToast(err.message, 'error'); }
  });

  // Add user form
  document.getElementById('add-user-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!selectedClient) return;
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd.entries());
    try {
      await api('POST', `/clients/${selectedClient.id}/users`, body);
      showToast('User added!', 'success');
      e.target.reset();
      document.getElementById('add-user-modal').style.display = 'none';
      await loadUsers(selectedClient.id);
      await loadStats();
    } catch (err) { showToast(err.message, 'error'); }
  });

  // Logout
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/login';
  });
}

// ── Modal helpers ─────────────────────────────────────────────────────────────
window.openCreateClientModal = () => {
  document.getElementById('create-client-modal').style.display = 'flex';
};
window.closeModal = (id) => {
  document.getElementById(id).style.display = 'none';
};
window.openAddUserModal = () => {
  if (!selectedClient) { showToast('Select a client first', 'warning'); return; }
  document.getElementById('add-user-modal').style.display = 'flex';
};

// ── User actions ──────────────────────────────────────────────────────────────
window.resetPassword = async (uid) => {
  const pw = prompt('Enter new password (min 6 chars):');
  if (!pw || pw.length < 6) return showToast('Password too short', 'error');
  try {
    await api('PATCH', `/users/${uid}/password`, { password: pw });
    showToast('Password reset!', 'success');
  } catch (e) { showToast(e.message, 'error'); }
};

window.deleteUser = async (uid, email) => {
  if (!confirm(`Delete user ${email}? This cannot be undone.`)) return;
  try {
    await api('DELETE', `/users/${uid}`);
    showToast('User deleted', 'success');
    await loadUsers(selectedClient.id);
  } catch (e) { showToast(e.message, 'error'); }
};

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(msg, type = 'info') {
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3000);
}
