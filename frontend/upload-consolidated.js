// upload-consolidated.js — Modal-based Consolidated workbook upload
//
// Wires:
//   #upload-toggle   — header button to open modal
//   #upload-modal    — modal container
//   #upload-close    — close [✕]
//   #upload-backdrop — backdrop click to close
//   #upload-period   — text input YYYY-MM
//   #drop-zone       — clickable + drag-drop zone
//   #cons-file-input — hidden file picker
//   #upload-status   — status messages
//   #periods-list    — uploaded-periods listing
//   #status-line     — sidebar compact status

(function () {
  function defaultPeriod() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  const $ = (id) => document.getElementById(id);

  function showModal() { $('upload-modal')?.classList.remove('hidden'); refreshPeriods(); }
  function hideModal() { $('upload-modal')?.classList.add('hidden'); }

  function setStatus(msg, kind = 'info') {
    const el = $('upload-status');
    if (!el) return;
    if (!msg) { el.style.display = 'none'; el.textContent = ''; return; }
    el.style.display = 'block';
    const styles = {
      info:    { bg: 'rgba(59,130,246,.1)',  fg: '#3b82f6', border: 'rgba(59,130,246,.3)' },
      success: { bg: 'rgba(34,197,94,.1)',   fg: '#16a34a', border: 'rgba(34,197,94,.3)'  },
      error:   { bg: 'rgba(239,68,68,.1)',   fg: '#dc2626', border: 'rgba(239,68,68,.3)'  },
    };
    const s = styles[kind] || styles.info;
    el.style.background = s.bg; el.style.color = s.fg; el.style.border = `1px solid ${s.border}`;
    el.textContent = msg;
  }

  function setSidebarStatus(text, kind = 'info') {
    const el = $('status-line');
    if (!el) return;
    const colors = { info: 'var(--t-muted)', success: 'var(--ok, #16a34a)', error: 'var(--err, #dc2626)' };
    el.style.color = colors[kind] || colors.info;
    el.innerHTML = text;
  }

  async function refreshPeriods() {
    try {
      const r = await fetch('/api/periods', { credentials: 'include' });
      if (!r.ok) return;
      const { periods = [] } = await r.json();
      const list = $('periods-list');
      if (list) {
        if (periods.length === 0) {
          list.innerHTML = '<div style="font-size:12px;color:var(--t-muted)"><em>No periods uploaded yet</em></div>';
        } else {
          list.innerHTML = `
            <div style="font-size:11px;font-weight:600;color:var(--t-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Uploaded Periods</div>
            ${periods.map(p => {
              const sizeMB = (p.size / 1024 / 1024).toFixed(1);
              const mtime = new Date(p.mtime).toLocaleDateString();
              return `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:12px">
                <span style="color:var(--accent);font-weight:600">${p.period}</span>
                <span style="color:var(--t-muted)">${sizeMB} MB · ${mtime}</span>
              </div>`;
            }).join('')}
          `;
        }
      }
      // Update sidebar compact status
      if (periods.length > 0) {
        const latest = periods[0];
        const dateStr = new Date(latest.mtime).toLocaleDateString();
        setSidebarStatus(`<span style="color:var(--ok)">●</span> Connected · <strong style="color:var(--accent)">${latest.period}</strong> · ${(latest.size/1024/1024).toFixed(1)} MB<br><span style="color:var(--t-muted);font-size:10px">Updated ${dateStr}</span>`, 'success');
      } else {
        setSidebarStatus('<span style="color:var(--amber)">●</span> No data uploaded yet — click <strong>📁 Upload Data</strong>', 'info');
      }
    } catch (e) {
      console.warn('refreshPeriods failed', e);
    }
  }

  async function uploadFile(file) {
    const period = $('upload-period').value.trim();
    if (!/^\d{4}-\d{2}$/.test(period)) {
      setStatus('⚠ Period must be in YYYY-MM format (e.g. 2026-03)', 'error');
      return;
    }
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      setStatus('⚠ Please upload an .xlsx file', 'error');
      return;
    }
    setStatus(`⏳ Uploading ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB) → ${period}…`, 'info');

    const fd = new FormData();
    fd.append('file', file);
    fd.append('period', period);
    try {
      const r = await fetch('/api/upload', { method: 'POST', body: fd, credentials: 'include' });
      const data = await r.json();
      if (!r.ok) {
        setStatus(`❌ Upload failed: ${data.error || 'HTTP ' + r.status}`, 'error');
        return;
      }
      setStatus(`✓ Uploaded successfully · parsing complete · refreshing dashboard…`, 'success');
      // Trigger dashboard refresh
      setTimeout(() => location.reload(), 800);
    } catch (e) {
      setStatus(`❌ Upload error: ${e.message}`, 'error');
    }
  }

  function init() {
    const periodInput = $('upload-period');
    if (periodInput && !periodInput.value) periodInput.value = defaultPeriod();

    // Header button opens modal
    $('upload-toggle')?.addEventListener('click', showModal);
    $('upload-close')?.addEventListener('click', hideModal);
    $('upload-backdrop')?.addEventListener('click', hideModal);

    // Drop zone
    const dz = $('drop-zone');
    const fi = $('cons-file-input');
    if (dz && fi) {
      dz.addEventListener('click', () => fi.click());
      fi.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) uploadFile(file);
        e.target.value = '';
      });
      // Drag-drop
      ['dragenter', 'dragover'].forEach(evt => {
        dz.addEventListener(evt, (e) => {
          e.preventDefault(); e.stopPropagation();
          dz.style.borderColor = 'var(--accent)';
          dz.style.background = 'rgba(31,78,121,.05)';
        });
      });
      ['dragleave', 'drop'].forEach(evt => {
        dz.addEventListener(evt, (e) => {
          e.preventDefault(); e.stopPropagation();
          dz.style.borderColor = 'var(--border)';
          dz.style.background = 'var(--bg-elev)';
        });
      });
      dz.addEventListener('drop', (e) => {
        const file = e.dataTransfer?.files?.[0];
        if (file) uploadFile(file);
      });
    }

    // Modal Refresh + Export buttons
    $('modal-refresh-btn')?.addEventListener('click', () => {
      const hiddenBtn = $('refresh-data-btn');
      if (hiddenBtn) {
        setStatus('⏳ Re-parsing current data…', 'info');
        hiddenBtn.click();
        setTimeout(() => location.reload(), 1500);
      }
    });
    $('modal-export-btn')?.addEventListener('click', () => {
      const hiddenBtn = $('export-excel-btn');
      if (hiddenBtn) hiddenBtn.click();
    });

    // ESC key closes modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') hideModal();
    });

    // Initial sidebar refresh
    refreshPeriods();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
