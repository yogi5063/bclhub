// views/build-territory.js — Admin: upload raw files + build a territory workbook
function renderBuildTerritory(state) {
  const main = document.getElementById('main');

  // Role-gate: viewers shouldn't reach this view but guard anyway
  if (state.userRole && state.userRole !== 'admin') {
    main.innerHTML = `<div class="empty-state"><div class="empty-icon">🔒</div><p>Admin access required.</p></div>`;
    return;
  }

  // Initialize per-territory build state
  if (!state.tbState) state.tbState = {
    territory: 'indonesia',
    period: '2026-03',
    files: {},   // category → File object (selected, not yet uploaded)
    uploaded: {},  // category → server response
    buildId: null,
    buildStatus: null,
  };
  const tb = state.tbState;

  const categories = [
    { id: 'orders',   label: 'Wix Orders',     hint: 'DATA_Orders.xlsx (global)',     accept: '.xlsx,.xlsm', required: true },
    { id: 'items',    label: 'Wix Items',      hint: 'DATA_Items.xlsx (global)',      accept: '.xlsx,.xlsm,.csv', required: true },
    { id: 'payments', label: 'Wix Payments',   hint: 'DATA_Payments.xlsx (global)',   accept: '.xlsx,.xlsm', required: true },
    { id: 'payex',    label: 'Payex Reports',  hint: 'Payex.xlsx (Reports 1+2)',      accept: '.xlsx,.xlsm', required: true },
    { id: 'paypal',   label: 'PayPal',         hint: 'PayPal.xlsx (optional)',        accept: '.xlsx,.xlsm,.csv', required: false },
    { id: 'stripe',   label: 'Stripe',         hint: 'Stripe.xlsx (optional)',        accept: '.xlsx,.xlsm,.csv', required: false },
    { id: 'xendit',   label: 'Xendit',         hint: 'Xendit.xlsx (Indonesia/Thailand/PHL)', accept: '.xlsx,.xlsm,.csv', required: false },
    { id: 'bank',     label: 'Bank Statement', hint: 'Territory bank csv',            accept: '.csv,.xlsx', required: false },
    { id: 'shopee',   label: 'Shopee',         hint: 'Marketplace report (csv/xlsx)', accept: '.csv,.xlsx', required: false },
    { id: 'tiktok',   label: 'TikTok',         hint: 'Marketplace report (csv/xlsx)', accept: '.csv,.xlsx', required: false },
    { id: 'fx',       label: 'Config FX',      hint: 'Config_FX.xlsx (currency rates)', accept: '.xlsx,.xlsm', required: false },
    { id: 'cogs',     label: 'COGS / BOM',     hint: 'BOM workbook (xlsx)',           accept: '.xlsx,.xlsm', required: false },
  ];

  const territories = [
    'indonesia', 'thailand', 'philippines', 'india', 'malaysia',
    'brasil', 'latam', 'gcc', 'usa', 'molnu',
    'europe', 'japan', 'korea', 'oceania',
  ];

  function fileCard(cat) {
    const f = tb.files[cat.id];
    const u = tb.uploaded[cat.id];
    let status = '';
    let bg = 'var(--bg-elev)';
    let border = 'var(--border)';
    if (u) { status = `<span style="color:var(--ok)">✓ uploaded · ${(u.size/1024/1024).toFixed(1)} MB</span>`; bg = 'rgba(34,197,94,.05)'; border = 'rgba(34,197,94,.3)'; }
    else if (f) { status = `<span style="color:var(--accent)">📎 ${f.name} (${(f.size/1024/1024).toFixed(1)} MB)</span>`; bg = 'rgba(31,78,121,.05)'; border = 'var(--accent)'; }
    return `<div style="padding:14px;border:1px dashed ${border};border-radius:8px;background:${bg}">
      <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:6px">
        <div>
          <div style="font-weight:600;font-size:13px">${cat.label} ${cat.required ? '<span style="color:var(--err);font-size:10px">*</span>' : '<span style="color:var(--t-muted);font-size:10px">(optional)</span>'}</div>
          <div style="font-size:11px;color:var(--t-muted);margin-top:2px">${cat.hint}</div>
        </div>
      </div>
      <div style="font-size:11px;margin-bottom:6px;min-height:16px">${status}</div>
      <input type="file" id="tb-file-${cat.id}" accept="${cat.accept}" style="display:none" />
      <button class="btn btn-ghost btn-sm" style="font-size:11px;width:100%" onclick="document.getElementById('tb-file-${cat.id}').click()">${u ? 'Replace' : (f ? 'Change' : '📁 Choose file')}</button>
    </div>`;
  }

  main.innerHTML = `
    <div class="section-header"><h2>🔨 Build Territory Workbook</h2>
      <p class="section-desc grey" style="margin:4px 0 0 0">Admin only. Upload raw source files for one territory + period. The server will build a fully formula-driven workbook (47 sheets) ready for download.</p>
    </div>

    <div style="display:flex;gap:24px;margin-bottom:24px">
      <div style="flex:1">
        <label style="font-size:11px;color:var(--t-muted);font-weight:600;text-transform:uppercase;letter-spacing:.5px">Territory</label>
        <select id="tb-territory" class="select-sm" style="width:100%;font-weight:600;margin-top:4px">
          ${territories.map(t => `<option value="${t}" ${t === tb.territory ? 'selected' : ''}>${t.charAt(0).toUpperCase()+t.slice(1)}</option>`).join('')}
        </select>
      </div>
      <div style="flex:1">
        <label style="font-size:11px;color:var(--t-muted);font-weight:600;text-transform:uppercase;letter-spacing:.5px">Period (YYYY-MM)</label>
        <input id="tb-period" type="text" class="select-sm" style="width:100%;font-weight:600;margin-top:4px;box-sizing:border-box" pattern="\\d{4}-\\d{2}" value="${tb.period}" />
      </div>
    </div>

    <div class="section-header"><h3>1️⃣ Upload Source Files</h3></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;margin-bottom:24px">
      ${categories.map(fileCard).join('')}
    </div>

    <div class="section-header"><h3>2️⃣ Upload + Build</h3></div>
    <div style="display:flex;gap:12px;margin-bottom:24px">
      <button class="btn btn-primary" id="tb-upload-btn" style="flex:1">📤 Upload All Files</button>
      <button class="btn btn-primary" id="tb-build-btn" style="flex:1;background:#16a34a">🔨 Build Workbook</button>
      <button class="btn btn-primary" id="tb-download-btn" style="flex:1;background:#1F4E79;display:none">⬇ Download Result</button>
    </div>

    <div id="tb-status" style="display:none;padding:16px;border-radius:8px;margin-bottom:16px;font-size:12px"></div>

    <div id="tb-log-section" style="display:none">
      <div class="section-header"><h3>3️⃣ Build Log</h3></div>
      <pre id="tb-log" style="background:#0f172a;color:#cbd5e1;padding:14px;border-radius:8px;font-size:11px;font-family:ui-monospace,monospace;max-height:400px;overflow-y:auto;white-space:pre-wrap"></pre>
    </div>
  `;

  // Wire file pickers
  categories.forEach(cat => {
    const input = document.getElementById(`tb-file-${cat.id}`);
    if (input) {
      input.addEventListener('change', e => {
        const file = e.target.files?.[0];
        if (file) {
          tb.files[cat.id] = file;
          delete tb.uploaded[cat.id];
          renderBuildTerritory(state);   // re-render to show selection
        }
      });
    }
  });
  document.getElementById('tb-territory')?.addEventListener('change', e => { tb.territory = e.target.value; });
  document.getElementById('tb-period')?.addEventListener('change', e => { tb.period = e.target.value; });

  function setStatus(msg, kind = 'info') {
    const el = document.getElementById('tb-status');
    if (!el) return;
    el.style.display = 'block';
    const styles = {
      info:    { bg: 'rgba(59,130,246,.1)',  fg: '#3b82f6', border: 'rgba(59,130,246,.3)' },
      success: { bg: 'rgba(34,197,94,.1)',   fg: '#16a34a', border: 'rgba(34,197,94,.3)'  },
      error:   { bg: 'rgba(239,68,68,.1)',   fg: '#dc2626', border: 'rgba(239,68,68,.3)'  },
    };
    const s = styles[kind] || styles.info;
    el.style.background = s.bg; el.style.color = s.fg; el.style.border = `1px solid ${s.border}`;
    el.innerHTML = msg;
  }

  function appendLog(line) {
    const el = document.getElementById('tb-log');
    document.getElementById('tb-log-section').style.display = 'block';
    if (el) {
      el.textContent = line;
      el.scrollTop = el.scrollHeight;
    }
  }

  // Upload all files
  document.getElementById('tb-upload-btn')?.addEventListener('click', async () => {
    const period = document.getElementById('tb-period').value.trim();
    const territory = document.getElementById('tb-territory').value;
    if (!/^\d{4}-\d{2}$/.test(period)) { setStatus('⚠ Period must be YYYY-MM', 'error'); return; }
    if (Object.keys(tb.files).length === 0) { setStatus('⚠ No files selected. Pick at least Wix Orders/Items/Payments + Payex.', 'error'); return; }
    setStatus(`⏳ Uploading ${Object.keys(tb.files).length} file(s)…`, 'info');
    const fd = new FormData();
    fd.append('territory', territory);
    fd.append('period', period);
    for (const [cat, file] of Object.entries(tb.files)) fd.append(cat, file);
    try {
      const r = await fetch('/api/territory/upload', { method: 'POST', body: fd, credentials: 'include' });
      const data = await r.json();
      if (!r.ok) { setStatus(`❌ Upload failed: ${data.error || 'HTTP ' + r.status}`, 'error'); return; }
      data.files.forEach(f => { tb.uploaded[f.field] = f; });
      setStatus(`✓ Uploaded ${data.files.length} file(s) successfully. Click <strong>🔨 Build Workbook</strong> to start the build.`, 'success');
      renderBuildTerritory(state);
    } catch (e) { setStatus(`❌ Upload error: ${e.message}`, 'error'); }
  });

  // Build
  document.getElementById('tb-build-btn')?.addEventListener('click', async () => {
    const period = document.getElementById('tb-period').value.trim();
    const territory = document.getElementById('tb-territory').value;
    setStatus(`⏳ Starting build for <strong>${territory}</strong> (${period})…`, 'info');
    try {
      const r = await fetch('/api/territory/build', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ territory, period }),
      });
      const data = await r.json();
      if (!r.ok) { setStatus(`❌ Build failed: ${data.error || 'HTTP ' + r.status}`, 'error'); return; }
      tb.buildId = data.buildId;
      setStatus(`⏳ Build running… (this can take 1-3 minutes). Polling status.`, 'info');
      pollStatus();
    } catch (e) { setStatus(`❌ ${e.message}`, 'error'); }
  });

  async function pollStatus() {
    if (!tb.buildId) return;
    try {
      const r = await fetch(`/api/territory/status/${tb.buildId}`, { credentials: 'include' });
      const data = await r.json();
      appendLog(data.log || '');
      if (data.status === 'running') {
        setStatus(`⏳ Building… (${data.elapsedSec}s elapsed)`, 'info');
        setTimeout(pollStatus, 2000);
      } else if (data.status === 'success') {
        setStatus(`✓ Build complete in ${data.elapsedSec}s — output: <strong>${data.output}</strong>`, 'success');
        document.getElementById('tb-download-btn').style.display = '';
      } else {
        setStatus(`❌ Build failed (exit ${data.exitCode}). See log below.`, 'error');
      }
    } catch (e) { setStatus(`Poll error: ${e.message}`, 'error'); }
  }

  // Download
  document.getElementById('tb-download-btn')?.addEventListener('click', () => {
    if (!tb.buildId) return;
    window.location.href = `/api/territory/download/${tb.buildId}`;
  });
}
