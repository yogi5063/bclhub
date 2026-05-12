// app.js — Entry point: orchestration, state, event wiring
// AI Insights are in ai-insights.js (loaded first in bundle, exposed globally)

const STATE = {
  // Multi-period data: { 'India||2026-01': TerritoryResult, ... }
  allParsed: {},
  // files: { filename: { wb, meta } }
  files: {},

  // Wix CSV raw rows (for Reconciliation view)
  wixPaymentRows: {},  // { territory: [{ orderId, date, amount, ... }] }
  wixOrderRows:   {},  // { territory: [{ orderId, date, total, ... }] }

  // Gateway data (bank transfers, etc.)
  gatewayData: {},

  // Active period filter: 'all' or 'YYYY-MM'
  activePeriod: 'all',

  // Pivot filters
  dateFrom:       '',   // 'YYYY-MM-DD' or ''
  dateTo:         '',   // 'YYYY-MM-DD' or ''
  paymentMethods: [],   // [] = all, else array of selected method strings
  orderStatus:    'all', // 'all' | 'paid' | 'unpaid' | 'refunded'

  // Legacy compat: returns filtered results for current period
  get parsed() {
    const results = {};
    for (const [key, r] of Object.entries(STATE.allParsed)) {
      const [territory, period] = key.split('||');
      if (STATE.activePeriod === 'all' || period === STATE.activePeriod) {
        if (!results[territory] || period > (results[territory]._period || '')) {
          results[territory] = { ...r, _period: period };
        }
      }
    }
    return results;
  },

  view: 'overview',
  brand: 'all',
  territories: [],
  platform: 'all',
  display_currency: 'local',
  calTerritory: 'all',
  fx: {
    INR: 23.07, IDR: 3500, PHP: 10.5, THB: 7.8, VND: 5500,
    BRL: 1.33, EUR: 0.214, AED: 0.932, JPY: 39.26, KRW: 368.0,
    USD: 0.2537, AUD: 0.587, GBP: 0.175, SGD: 0.303, BND: 0.303, MXN: 4.8,
  },
  charts: {},
  explorer: { file: null, sheet: null, page: 0 },
};

// ── Month/Period parsing ──────────────────────────────────────────────────────
const MONTH_MAP = {
  jan: '01', feb: '02', mar: '03', march: '03', apr: '04', april: '04',
  may: '05', jun: '06', june: '06', jul: '07', july: '07', aug: '08', august: '08',
  sep: '09', sept: '09', oct: '10', nov: '11', dec: '12',
};

function extractPeriod(filename) {
  const f = filename.toLowerCase().replace(/[_\-\(\)]/g, ' ');
  const m1 = f.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s*(\d{4})\b/i);
  if (m1) {
    const mon = MONTH_MAP[m1[1].toLowerCase().slice(0, 3)] || MONTH_MAP[m1[1].toLowerCase()];
    if (mon) return `${m1[2]}-${mon}`;
  }
  const m2 = f.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s*(\d{2})\b/i);
  if (m2) {
    const mon = MONTH_MAP[m2[1].toLowerCase()];
    if (mon) return `20${m2[2]}-${mon}`;
  }
  return null;
}

function periodLabel(period) {
  if (!period || period === 'wix') return period === 'wix' ? 'Wix (All)' : '';
  const [yr, mo] = period.split('-');
  const names = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${names[parseInt(mo, 10)]} ${yr}`;
}

// ── Territory detection (XLSX filenames) ──────────────────────────────────────
const TERRITORY_MAP = [
  { pattern: /basmi.*(india|ind\b)/,                                    territory: 'India',       brand: 'Basmi', currency: 'INR' },
  { pattern: /basmi.*(malaysia|mys\b|my\b)/,                            territory: 'Malaysia',    brand: 'Basmi', currency: 'MYR' },
  { pattern: /basmi.*(philippines|philippine|ph\b|phil\b)/,             territory: 'Philippines', brand: 'Basmi', currency: 'PHP' },
  { pattern: /basmi.*(thailand|thai\b|th\b)/,                           territory: 'Thailand',    brand: 'Basmi', currency: 'THB' },
  { pattern: /basmi.*(indonesia|indo\b|id\b)/,                          territory: 'Indonesia',   brand: 'Basmi', currency: 'IDR' },
  { pattern: /basmi.*(vietnam|viet|vn\b)/,                              territory: 'Vietnam',     brand: 'Basmi', currency: 'VND' },
  { pattern: /(cure|curefip).*(brazil|brasil|bra\b)/,                   territory: 'Brazil',      brand: 'Cure',  currency: 'BRL' },
  { pattern: /(cure|curefip).*(europe|eu\b|eur\b)/,                     territory: 'Europe',      brand: 'Cure',  currency: 'EUR' },
  { pattern: /(cure|curefip).*(gcc|gulf)/,                              territory: 'GCC',         brand: 'Cure',  currency: 'AED' },
  { pattern: /(cure|curefip).*(japan|jpn\b|jp\b)/,                      territory: 'Japan',       brand: 'Cure',  currency: 'JPY' },
  { pattern: /(cure|curefip).*(korea|kor\b|kr\b)/,                      territory: 'Korea',       brand: 'Cure',  currency: 'KRW' },
  { pattern: /(cure|curefip).*(latam|latin)/,                           territory: 'Latam',       brand: 'Cure',  currency: 'USD' },
  { pattern: /(cure|curefip).*(oceania|aus\b)/,                         territory: 'Oceania',     brand: 'Cure',  currency: 'AUD' },
  { pattern: /(cure|curefip).*(usa\b|us\b|united states)/,              territory: 'USA',         brand: 'Cure',  currency: 'USD' },
  { pattern: /molnu/,                                                   territory: 'Molnu',       brand: 'Molnu', currency: 'USD' },
];

function detectTerritory(filename) {
  const f = filename.toLowerCase().replace(/[_\-]/g, ' ');
  for (const { pattern, territory, brand, currency } of TERRITORY_MAP) {
    if (pattern.test(f)) {
      const period = extractPeriod(filename);
      return { territory, brand, currency, period };
    }
  }
  const fLow = filename.toLowerCase();
  if (fLow.includes('sales performance')) return { special: 'sales_performance', period: null };
  if (fLow.includes('production'))        return { special: 'production', period: null };
  return null;
}

// ── Wix CSV path detection ────────────────────────────────────────────────────
function detectWixPath(relativePath) {
  if (!relativePath) return null;
  return typeof detectWixPath_wixagg === 'function'
    ? detectWixPath_wixagg(relativePath)
    : _detectWixPathInternal(relativePath);
}

// Internal fallback — handles both full path (Upload/Wix.com/Payment/India/...)
// and root-relative path (Payment/India/...) when user selects Wix.com as root folder
function _detectWixPathInternal(relativePath) {
  const parts = relativePath.replace(/\\/g, '/').split('/');
  const knownTerritories = ['India','Malaysia','Philippines','Thailand','Indonesia','Vietnam',
                            'Brazil','Europe','GCC','Japan','Korea','Latam','Oceania','USA','Molnu'];

  let typeFolder, territory, filename;

  const wixIdx = parts.findIndex(p => p.toLowerCase() === 'wix.com');
  if (wixIdx !== -1) {
    // Full path: .../Wix.com/Payment/India/file.csv
    typeFolder = (parts[wixIdx + 1] || '').toLowerCase();
    territory  =  parts[wixIdx + 2] || '';
    filename   = (parts[wixIdx + 3] || '').toLowerCase();
  } else if (['payment','order'].includes(parts[0].toLowerCase()) && knownTerritories.includes(parts[1])) {
    // Root-relative: Payment/India/file.csv  (user selected Wix.com as root)
    typeFolder = parts[0].toLowerCase();
    territory  = parts[1];
    filename   = (parts[2] || '').toLowerCase();
  } else {
    return null;
  }

  if (!knownTerritories.includes(territory)) return null;
  let wixType;
  if (typeFolder === 'payment') wixType = 'payment';
  else if (typeFolder === 'order') wixType = filename.includes('item') ? 'item' : 'order';
  else return null;
  return { wixType, territory };
}

// ── Parser dispatch (XLSX) ────────────────────────────────────────────────────
// Browser-side per-territory parsers were retired — Python backend now does
// all parsing from the Consolidated workbook. Keep an empty registry so any
// legacy lookup just returns undefined (no ReferenceError).
const PARSERS = {};

function parseTerritory(wb, meta) {
  const parser = PARSERS[meta.territory];
  if (!parser) return null;
  try {
    const result = parser(wb);
    result._period = meta.period;
    return result;
  } catch (err) {
    console.error(`Parse error for ${meta.territory}:`, err);
    const r = emptyResult(meta.territory, meta.brand, meta.currency, 0, 0);
    r.errors.push('Parser error: ' + err.message);
    r._period = meta.period;
    return r;
  }
}

// ── File handling ─────────────────────────────────────────────────────────────
async function handleFiles(fileList) {
  const files = Array.from(fileList);

  // ── Separate Wix CSVs from XLSX territory files ───────────────────────────
  const wixGroups = {};  // { 'India': { payments:[], orders:[], items:[] } }
  const xlsxFiles = [];
  const gatewayFiles = [];

  for (const file of files) {
    const relPath = file.relativePath || '';
    const wixInfo = _detectWixPathInternal(relPath);

    if (wixInfo) {
      const { wixType, territory } = wixInfo;
      if (!wixGroups[territory]) wixGroups[territory] = { payments: [], orders: [], items: [] };
      if      (wixType === 'payment') wixGroups[territory].payments.push(file);
      else if (wixType === 'item')    wixGroups[territory].items.push(file);
      else                            wixGroups[territory].orders.push(file);
    } else if (file.name.toLowerCase().endsWith('.xlsx')) {
      xlsxFiles.push(file);
    } else if (file.name.toLowerCase().endsWith('.csv') && relPath) {
      // Non-Wix CSV — check gateway registry
      gatewayFiles.push(file);
    }
  }

  // ── Process Wix CSV groups ────────────────────────────────────────────────
  for (const [territory, group] of Object.entries(wixGroups)) {
    const hasFiles = group.payments.length + group.orders.length + group.items.length > 0;
    if (!hasFiles) continue;

    const label = `${territory} (Wix CSV)`;
    showFileStatus(label, 'parsing', `Parsing ${group.payments.length} payment + ${group.orders.length} order + ${group.items.length} item files…`);

    try {
      const payResults = await Promise.all(group.payments.map(f => f.text().then(t => parseWixPayments(t))));
      const ordResults = await Promise.all(group.orders.map(f =>   f.text().then(t => parseWixOrders(t))));
      const itmResults = await Promise.all(group.items.map(f =>    f.text().then(t => parseWixItems(t))));

      const result = buildWixTerritoryResult(territory, payResults, ordResults, itmResults);
      if (result) {
        // Full-year aggregate (shown when "All Periods" selected)
        STATE.allParsed[`${territory}||wix`] = result;
        // Monthly splits (shown in period selector and Trends view)
        if (result._monthly) {
          for (const [month, mr] of Object.entries(result._monthly)) {
            STATE.allParsed[`${territory}||${month}`] = mr;
          }
        }
        const months = result._monthly ? Object.keys(result._monthly).length : 0;
        showFileStatus(label, 'done',
          `${territory} · ${months} months · ${result.orders} orders · Net: ${result.net.toLocaleString('en-US', {maximumFractionDigits:0})} ${result.currency}`);
      } else {
        showFileStatus(label, 'error', `Could not build result for ${territory}`);
      }
    } catch (err) {
      showFileStatus(label, 'error', `CSV parse failed: ${err.message}`);
      console.error(err);
    }
  }

  // ── Process XLSX territory files ──────────────────────────────────────────
  const seen = new Map();
  const toProcess = [];

  for (const file of xlsxFiles) {
    const meta = detectTerritory(file.name);
    if (!meta || meta.special) { toProcess.push(file); continue; }
    const key = `${meta.territory}||${meta.period}`;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, file.name);
      toProcess.push(file);
    } else {
      const existingHasDup = existing.includes('(1)') || existing.includes('(2)');
      const newHasDup = file.name.includes('(1)') || file.name.includes('(2)');
      if (existingHasDup && !newHasDup) {
        seen.set(key, file.name);
        const idx = toProcess.findIndex(f => f.name === existing);
        if (idx !== -1) toProcess[idx] = file;
        showFileStatus(existing, 'error', `Replaced by ${file.name}`);
      } else {
        showFileStatus(file.name, 'error', `Skipped — duplicate of ${existing}`);
      }
    }
  }

  for (const file of toProcess) {
    const meta = detectTerritory(file.name);
    if (!meta) {
      showFileStatus(file.name, 'error', 'Cannot detect territory');
      continue;
    }
    if (meta.special) {
      await handleSpecialFile(file, meta.special);
      continue;
    }
    const periodStr = meta.period ? ` (${periodLabel(meta.period)})` : '';
    showFileStatus(file.name, 'parsing', `Detected: ${meta.territory}${periodStr} · ${meta.currency}`);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
      STATE.files[file.name] = { wb, meta };
      const result = parseTerritory(wb, meta);
      if (result) {
        const key = `${meta.territory}||${meta.period || 'unknown'}`;
        STATE.allParsed[key] = result;
        const warns = result.errors.length + result.warnings.length;
        const periodDisp = meta.period ? ` [${periodLabel(meta.period)}]` : '';
        showFileStatus(file.name, 'done',
          `${meta.territory}${periodDisp} · ${result.orders} orders · Net: ${result.net.toLocaleString('en-US', {maximumFractionDigits:0})} ${result.currency}` +
          (warns > 0 ? ` ⚠ ${warns}` : ''));
      } else {
        showFileStatus(file.name, 'error', 'No parser for ' + meta.territory);
      }
    } catch (err) {
      showFileStatus(file.name, 'error', 'Parse failed: ' + err.message);
      console.error(err);
    }
  }

  // ── Process standalone gateway files ──────────────────────────────────────
  for (const file of gatewayFiles) {
    const plugin = typeof detectGateway === 'function'
      ? detectGateway(file.name.toLowerCase(), [])
      : null;
    if (!plugin) continue;

    showFileStatus(file.name, 'parsing', `Gateway: ${plugin.name}`);
    try {
      const gResult = await plugin.parse(file);
      if (gResult) {
        if (!STATE.gatewayData['__global__']) STATE.gatewayData['__global__'] = {};
        STATE.gatewayData['__global__'][plugin.name] = gResult;
        showFileStatus(file.name, 'done', `${plugin.name} · ${gResult.transactions?.length || 0} transactions`);
      }
    } catch (err) {
      showFileStatus(file.name, 'error', `Gateway parse failed: ${err.message}`);
    }
  }

  updatePeriodSelector();
  updateTerritoryChips();
  refreshAll();
  _showDataDiagnostics();
}

function _showDataDiagnostics() {
  const main = document.getElementById('main');
  if (!main) return;

  const keys = Object.keys(STATE.allParsed);
  const periods = getAvailablePeriods();
  const territories = [...new Set(keys.map(k => k.split('||')[0]))];

  // Remove any prior diagnostics panel
  document.getElementById('diag-panel')?.remove();

  const panel = document.createElement('div');
  panel.id = 'diag-panel';
  panel.style.cssText = 'background:rgba(105,88,194,0.12);border:1px solid rgba(105,88,194,0.4);border-radius:8px;padding:12px 16px;margin:12px;font-size:12px;font-family:monospace;color:var(--t-muted);';

  const periodList = periods.length > 0
    ? periods.map(p => periodLabel(p)).join(', ')
    : '(none detected)';

  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <strong style="color:var(--c-accent);font-size:13px;">Data Status</strong>
      <button onclick="document.getElementById('diag-panel').remove()" style="background:none;border:none;color:var(--t-muted);cursor:pointer;font-size:16px;padding:0 4px;">×</button>
    </div>
    <div>✓ JS bundle loaded &amp; running</div>
    <div>Parsed entries: <strong style="color:var(--t-base);">${keys.length}</strong> (${territories.join(', ') || 'none'})</div>
    <div>Periods found: <strong style="color:var(--t-base);">${periods.length}</strong> → ${periodList}</div>
    <div>Active period: <strong style="color:var(--t-base);">${STATE.activePeriod}</strong></div>
    ${keys.length === 0 ? '<div style="color:#f39c12;margin-top:6px;">⚠ No data loaded — check folder path and file formats</div>' : ''}
  `;

  // Insert at top of main content
  main.insertBefore(panel, main.firstChild);
}

async function handleSpecialFile(file, type) {
  showFileStatus(file.name, 'parsing', `Loading ${type === 'production' ? 'Production' : 'Sales Performance'} file…`);
  try {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
    if (type === 'production') {
      STATE.productionWB = wb;
      STATE.files[file.name] = { wb, meta: { special: 'production' } };
      showFileStatus(file.name, 'done', `Production file loaded — ${wb.SheetNames.length} sheets`);
    } else {
      STATE.salesPerformanceWB = wb;
      STATE.files[file.name] = { wb, meta: { special: 'sales_performance' } };
      showFileStatus(file.name, 'done', `Sales Performance file loaded — ${wb.SheetNames.length} sheets`);
    }
  } catch (err) {
    showFileStatus(file.name, 'error', 'Parse failed: ' + err.message);
  }
}

function showFileStatus(filename, status, message) {
  const list = document.getElementById('upload-list');
  if (!list) return;
  const safeId = 'f_' + btoa(encodeURIComponent(filename)).replace(/[^a-z0-9]/gi, '');
  let item = document.getElementById(safeId);
  if (!item) {
    item = document.createElement('div');
    item.className = 'upload-item';
    item.id = safeId;
    list.appendChild(item);
  }
  const icons = { parsing: '⏳', done: '✓', error: '✗' };
  const cls   = { parsing: '', done: 'done', error: 'error' };
  item.className = `upload-item ${cls[status] || ''}`;
  item.innerHTML = `
    <span class="upload-icon">${icons[status] || ''}</span>
    <span class="upload-name" title="${filename}">${filename.length > 35 ? filename.slice(0,33)+'…' : filename}</span>
    <span class="upload-msg">${message}</span>`;
}

// ── Period management ─────────────────────────────────────────────────────────
function getAvailablePeriods() {
  const periods = new Set();
  for (const key of Object.keys(STATE.allParsed)) {
    const period = key.split('||')[1];
    if (period && period !== 'unknown' && period !== 'wix') periods.add(period);
  }
  return Array.from(periods).sort();
}

function updatePeriodSelector() {
  const sel = document.getElementById('period-select');
  if (!sel) return;
  const periods = getAvailablePeriods();
  const current = STATE.activePeriod;
  sel.innerHTML = `<option value="all">All Periods (${periods.length})</option>` +
    periods.map(p => `<option value="${p}" ${p === current ? 'selected' : ''}>${periodLabel(p)}</option>`).join('');
  sel.value = current;
  document.getElementById('period-count').textContent =
    periods.length > 0 ? `${periods.length} month${periods.length > 1 ? 's' : ''} loaded` : '';
}

// ── Filters ───────────────────────────────────────────────────────────────────
function getFilteredResults(state) {
  const parsed = state.parsed;
  let results = Object.values(parsed);
  if (state.brand !== 'all') results = results.filter(r => r.brand === state.brand);
  if (state.territories && state.territories.length > 0)
    results = results.filter(r => state.territories.includes(r.territory));

  // Date range filter — narrow daily breakdowns
  if (state.dateFrom || state.dateTo) {
    results = results.map(r => {
      if (!r.daily || Object.keys(r.daily).length === 0) return r;
      const filteredDaily = {};
      for (const [dk, v] of Object.entries(r.daily)) {
        if (state.dateFrom && dk < state.dateFrom) continue;
        if (state.dateTo   && dk > state.dateTo)   continue;
        filteredDaily[dk] = v;
      }
      const filteredOrders  = Object.values(filteredDaily).reduce((s, v) => s + v.orders, 0);
      const filteredRevenue = Object.values(filteredDaily).reduce((s, v) => s + v.revenue, 0);
      return { ...r, daily: filteredDaily, orders: filteredOrders, net: filteredRevenue };
    }).filter(r => Object.keys(r.daily).length > 0 || (!r.daily));
  }

  // Payment method filter (Wix data)
  if (state.paymentMethods && state.paymentMethods.length > 0) {
    results = results.map(r => {
      if (!r.payment_methods) return r;
      const filtered = Array.isArray(r.payment_methods)
        ? r.payment_methods.filter(m => state.paymentMethods.includes(m.method))
        : r.payment_methods;
      return { ...r, payment_methods: filtered };
    });
  }

  return results;
}

// Collect all payment methods across loaded Wix data
function getAllPaymentMethods() {
  const methods = new Set();
  for (const [key, r] of Object.entries(STATE.allParsed)) {
    if (!r.payment_methods) continue;
    if (Array.isArray(r.payment_methods)) {
      r.payment_methods.forEach(m => m.method && methods.add(m.method));
    }
  }
  return [...methods].sort();
}

function updateTerritoryChips() {
  const container = document.getElementById('territory-chips');
  if (!container) return;
  const parsed = STATE.parsed;
  const territories = Object.keys(parsed);
  container.innerHTML = territories.map(t => {
    const isActive = !STATE.territories.includes(t);
    return `<span class="chip ${isActive ? 'active' : ''}" data-territory="${t}" onclick="toggleTerritory('${t}')">${TERRITORY_FLAGS[t] || ''} ${t}</span>`;
  }).join('');
}

function toggleTerritory(territory) {
  if (STATE.territories.includes(territory)) {
    STATE.territories = STATE.territories.filter(t => t !== territory);
  } else {
    STATE.territories.push(territory);
  }
  document.querySelectorAll(`[data-territory="${territory}"]`).forEach(el =>
    el.classList.toggle('active', !STATE.territories.includes(territory))
  );
  refreshAll();
}

// ── Navigation ────────────────────────────────────────────────────────────────
function navigateTo(view) {
  STATE.view = view;
  document.querySelectorAll('.nav-item').forEach(el =>
    el.classList.toggle('active', el.dataset.view === view)
  );
  renderCurrentView();
}

function renderCurrentView() {
  const renders = {
    overview:        () => renderOverview(STATE),
    'build-territory': () => renderBuildTerritory(STATE),
    pl:              () => renderPLDetail(STATE),
    products:        () => renderProducts(STATE),
    geography:       () => renderGeography(STATE),
    calendar:        () => renderCalendar(STATE),
    payments:        () => renderPayments(STATE),
    leakage:         () => renderLeakage(STATE),
    validation:      () => renderValidation(STATE),
    ar:              () => renderAR(STATE),
    trends:          () => renderTrends(STATE),
    explorer:        () => renderExplorer(STATE),
    reconciliation:  () => renderReconciliation(STATE),
    'gateway-recon': () => renderGatewayRecon(STATE),
  };
  const fn = renders[STATE.view];
  if (fn) fn();
}

function refreshAll() {
  updateSidebar();
  updateTerritoryChips();
  updateMethodChips();
  renderCurrentView();
  updateKPIBar();
  updateTerritoryDropdown();
}

function updateKPIBar() {
  const results = getFilteredResults(STATE);
  const totalNet    = results.reduce((s, r) => s + toMYR(r.net, r.currency, STATE.fx), 0);
  const totalOrders = results.reduce((s, r) => s + r.orders, 0);
  const periods     = getAvailablePeriods();
  const periodDisp  = STATE.activePeriod === 'all'
    ? (periods.length > 0 ? `${periodLabel(periods[0])}–${periodLabel(periods[periods.length-1])}` : 'All')
    : periodLabel(STATE.activePeriod);

  const el = document.getElementById('top-kpi-bar');
  if (!el) return;
  if (results.length > 0) {
    el.innerHTML = `
      <span class="top-kpi">📊 ${results.length} territories · ${periodDisp}</span>
      <span class="top-kpi">Net: <strong class="green">RM ${fmt(totalNet)}</strong></span>
      <span class="top-kpi">Orders: <strong>${totalOrders.toLocaleString()}</strong></span>`;
  } else {
    el.innerHTML = '<span class="top-kpi grey">Connect your data folder to begin</span>';
  }
}

function updateSidebar() {
  const results = getFilteredResults(STATE);
  const sidebar = document.getElementById('sidebar-list');
  if (!sidebar) return;
  if (results.length === 0) {
    sidebar.innerHTML = '<div class="sidebar-empty grey">No data for selected period</div>';
    return;
  }
  sidebar.innerHTML = results
    .sort((a, b) => toMYR(b.net, b.currency, STATE.fx) - toMYR(a.net, a.currency, STATE.fx))
    .map(r => {
      const myrNet = toMYR(r.net, r.currency, STATE.fx);
      const sym = CURRENCY_SYMBOLS[r.currency] || '';
      const periodDisp = r._period ? `<span class="grey" style="font-size:10px">${periodLabel(r._period)}</span>` : '';
      const sourceTag = r._source === 'wix' ? `<span style="font-size:9px;color:var(--c-accent);margin-left:4px">CSV</span>` : '';
      return `
        <div class="sidebar-item">
          <div class="si-header">
            <span>${TERRITORY_FLAGS[r.territory] || ''} ${r.territory}${sourceTag}</span>
            <span class="brand-pill brand-${r.brand.toLowerCase()}">${r.brand}</span>
          </div>
          ${periodDisp}
          <div class="si-net green">RM ${fmt(myrNet, 0)}</div>
          <div class="si-local grey">${sym} ${fmt(r.net, 0)}</div>
          <div class="si-meta grey">${r.orders} orders · ${r.margin_pct.toFixed(1)}%</div>
          ${r.errors.length > 0 ? `<div class="si-error">⚠ ${r.errors[0]}</div>` : ''}
        </div>`;
    }).join('');
}

// ── FX Panel ──────────────────────────────────────────────────────────────────
function renderFXPanel() {
  const container = document.getElementById('fx-panel-body');
  if (!container) return;
  container.innerHTML = Object.entries(STATE.fx).map(([cur, rate]) => `
    <div class="fx-row">
      <label>1 MYR =</label>
      <input type="number" class="fx-input" id="fx-${cur}" value="${rate}" step="0.001" data-cur="${cur}" />
      <span class="fx-cur">${cur}</span>
    </div>`).join('');
  container.querySelectorAll('.fx-input').forEach(input => {
    input.addEventListener('change', () => {
      const val = parseFloat(input.value);
      if (!isNaN(val) && val > 0) STATE.fx[input.dataset.cur] = val;
    });
  });
}

function applyFX() {
  document.querySelectorAll('.fx-input').forEach(input => {
    const val = parseFloat(input.value);
    if (!isNaN(val) && val > 0) STATE.fx[input.dataset.cur] = val;
  });
  refreshAll();
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Nav
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', () => { if (el.dataset.view) navigateTo(el.dataset.view); });
  });

  // Brand filter
  document.querySelectorAll('[data-brand]').forEach(el => {
    el.addEventListener('click', () => {
      STATE.brand = el.dataset.brand;
      document.querySelectorAll('[data-brand]').forEach(b => b.classList.toggle('active', b.dataset.brand === STATE.brand));
      refreshAll();
    });
  });

  // Period selector
  const periodSel = document.getElementById('period-select');
  if (periodSel) {
    periodSel.addEventListener('change', e => {
      STATE.activePeriod = e.target.value;
      STATE.territories  = [];
      const tsel = document.getElementById('territory-select');
      if (tsel) tsel.value = 'all';
      refreshAll();
    });
  }

  // Global currency selector — applies to ALL views
  const globalCcy = document.getElementById('global-ccy');
  if (globalCcy) {
    globalCcy.value = STATE.displayCcy || 'MYR';
    globalCcy.addEventListener('change', e => {
      STATE.displayCcy = e.target.value;
      refreshAll();
    });
  }

  // FX
  document.getElementById('fx-apply-btn')?.addEventListener('click', applyFX);
  document.getElementById('fx-toggle')?.addEventListener('click', () => {
    const panel = document.getElementById('fx-panel');
    if (panel) {
      panel.classList.toggle('hidden');
      if (!panel.classList.contains('hidden')) renderFXPanel();
    }
  });

  // Pivot filter toggle
  document.getElementById('pivot-toggle-btn')?.addEventListener('click', () => {
    const panel = document.getElementById('pivot-panel');
    if (!panel) return;
    const open = panel.style.display === 'none' || !panel.style.display;
    panel.style.display = open ? '' : 'none';
    if (open) updateMethodChips();
  });

  // Date range apply
  document.getElementById('date-apply-btn')?.addEventListener('click', () => {
    STATE.dateFrom = document.getElementById('date-from')?.value || '';
    STATE.dateTo   = document.getElementById('date-to')?.value   || '';
    updatePivotBadge();
    refreshAll();
  });

  // Order status filter
  document.querySelectorAll('[data-status]').forEach(el => {
    el.addEventListener('click', () => {
      STATE.orderStatus = el.dataset.status;
      document.querySelectorAll('[data-status]').forEach(b => b.classList.toggle('active', b.dataset.status === STATE.orderStatus));
      updatePivotBadge();
      refreshAll();
    });
  });

  // Clear all pivot filters
  document.getElementById('clear-filters-btn')?.addEventListener('click', () => {
    STATE.dateFrom = ''; STATE.dateTo = '';
    STATE.paymentMethods = []; STATE.orderStatus = 'all';
    const df = document.getElementById('date-from'); if (df) df.value = '';
    const dt = document.getElementById('date-to');   if (dt) dt.value = '';
    document.querySelectorAll('[data-status]').forEach(b => b.classList.toggle('active', b.dataset.status === 'all'));
    updateMethodChips();
    updatePivotBadge();
    refreshAll();
  });

  // Territory dropdown
  const terrSel = document.getElementById('territory-select');
  if (terrSel) {
    terrSel.addEventListener('change', e => {
      STATE.territories = e.target.value === 'all' ? [] : [e.target.value];
      refreshAll();
    });
  }

  // Settings modal (folder path config)
  initSettings();

  // Load pre-parsed data from server (Python generates this)
  await initDataFetch();

  renderCurrentView();
  updateKPIBar();
});

// ── Settings modal ────────────────────────────────────────────────────────────
function initSettings() {
  const modal     = document.getElementById('settings-modal');
  const input     = document.getElementById('settings-upload-dir');
  const msgEl     = document.getElementById('settings-msg');
  const saveBtn   = document.getElementById('settings-save');

  function open() {
    msgEl.textContent = '';
    modal.classList.remove('hidden');
    fetch('/api/settings', { credentials: 'include' })
      .then(r => r.json())
      .then(s => { if (s.uploadDir) input.value = s.uploadDir; })
      .catch(() => {});
  }
  function close() { modal.classList.add('hidden'); }

  document.getElementById('settings-toggle')?.addEventListener('click', open);
  document.getElementById('settings-close')?.addEventListener('click', close);
  document.getElementById('settings-cancel')?.addEventListener('click', close);
  document.getElementById('settings-backdrop')?.addEventListener('click', close);

  saveBtn?.addEventListener('click', async () => {
    const uploadDir = input.value.trim();
    if (!uploadDir) { msgEl.textContent = 'Path cannot be empty.'; msgEl.style.color = 'var(--c-red)'; return; }
    saveBtn.disabled = true;
    msgEl.textContent = 'Saving...'; msgEl.style.color = 'var(--t-muted)';
    try {
      const r = await fetch('/api/settings', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadDir }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
      msgEl.textContent = 'Saved. Re-parsing data...'; msgEl.style.color = 'var(--c-green)';
      const rf = await fetch('/api/refresh', { method: 'POST', credentials: 'include' });
      if (!rf.ok) throw new Error('Refresh failed');
      close();
      // Reload data into dashboard
      const resp = await fetch('/api/data', { credentials: 'include' });
      if (resp.ok) {
        const json = await resp.json();
        STATE.allParsed = json.parsed || {};
        updatePeriodSelector();
        updateTerritoryDropdown();
        refreshAll();
      }
    } catch (err) {
      msgEl.textContent = `Error: ${err.message}`; msgEl.style.color = 'var(--c-red)';
    } finally {
      saveBtn.disabled = false;
    }
  });
}

// ── Python-powered data loading ───────────────────────────────────────────────
async function initDataFetch() {
  // Create hidden status + buttons OUTSIDE the visible UI.
  // Visible status is now driven by upload-consolidated.js → #status-line.
  // Refresh + Export buttons live inside the Upload Data modal.
  if (!document.getElementById('folder-status')) {
    const hidden = document.createElement('div');
    hidden.style.display = 'none';
    hidden.innerHTML = `
      <div id="folder-status" class="folder-status grey">Loading data...</div>
      <button id="refresh-data-btn"></button>
      <button id="export-excel-btn"></button>
    `;
    document.body.appendChild(hidden);
  }

  const statusEl  = document.getElementById('folder-status');
  const refreshBtn = document.getElementById('refresh-data-btn');

  // ── Data source: 'system_workbook' | 'manual_upload' | 'all'
  STATE.dataSource = localStorage.getItem('bclhub_datasource') || 'system_workbook';

  // Expose globally for source toggle component
  window.switchDataSource = async (newSource) => {
    STATE.dataSource = newSource;
    localStorage.setItem('bclhub_datasource', newSource);
    await loadData();
  };

  async function loadData() {
    statusEl.textContent = 'Loading...';
    statusEl.className = 'folder-status grey';
    const sourceParam = STATE.dataSource !== 'all' ? `?source=${STATE.dataSource}` : '';
    try {
      const resp = await fetch(`/api/data${sourceParam}`, { credentials: 'include' });
      if (!resp.ok) {
        const e = await resp.json().catch(() => ({}));
        throw new Error(e.error || `HTTP ${resp.status}`);
      }
      const json = await resp.json();
      STATE._rawCache = json;   // store raw cache for AI insights
      STATE.allParsed = json.parsed || {};

      const periods     = getAvailablePeriods();
      const territories = new Set(Object.keys(STATE.allParsed).map(k => k.split('||')[0]));
      const genAt       = json.generated_at ? new Date(json.generated_at).toLocaleString() : '';

      statusEl.textContent = `Connected  ${territories.size} countries  ${periods.length} periods`;
      statusEl.className = 'folder-status green';
      if (genAt) {
        const sub = document.createElement('div');
        sub.className = 'folder-path grey';
        sub.textContent = `Updated: ${genAt}`;
        statusEl.after(sub);
      }
      refreshBtn.style.display = '';
      const exportBtn2 = document.getElementById('export-excel-btn');
      if (exportBtn2) exportBtn2.style.display = '';
      updatePeriodSelector();
      updateTerritoryDropdown();
      refreshAll();
    } catch (err) {
      statusEl.textContent = `Error: ${err.message}`;
      statusEl.className = 'folder-status grey';
      refreshBtn.style.display = '';
    }
  }

  async function refreshData() {
    refreshBtn.disabled = true;
    statusEl.textContent = 'Re-parsing files...';
    statusEl.className = 'folder-status grey';
    document.querySelector('.folder-path')?.remove();
    try {
      const r = await fetch('/api/refresh', { method: 'POST', credentials: 'include' });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error || `HTTP ${r.status}`);
      }
      await loadData();
    } catch (err) {
      statusEl.textContent = `Refresh failed: ${err.message}`;
      statusEl.className = 'folder-status grey';
    } finally {
      refreshBtn.disabled = false;
    }
  }

  refreshBtn?.addEventListener('click', refreshData);

  // Excel export
  const exportBtn = document.getElementById('export-excel-btn');
  exportBtn?.addEventListener('click', async () => {
    exportBtn.disabled = true;
    exportBtn.textContent = 'Generating...';
    try {
      const period = STATE.activePeriod === 'all' ? '' : STATE.activePeriod;
      const url = `/api/export-excel${period ? `?period=${period}` : ''}`;
      const resp = await fetch(url, { credentials: 'include' });
      if (!resp.ok) {
        const e = await resp.json().catch(() => ({}));
        throw new Error(e.error || `HTTP ${resp.status}`);
      }
      const blob = await resp.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `FIP_MIS_Report_${period || 'all'}.xlsx`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      alert('Export failed: ' + err.message);
    } finally {
      exportBtn.disabled = false;
      exportBtn.textContent = '\u2b07 Export Excel';
    }
  });

  await loadData();
}

function updateTerritoryDropdown() {
  const sel = document.getElementById('territory-select');
  if (!sel) return;
  const territories = [...new Set(Object.keys(STATE.allParsed).map(k => k.split('||')[0]))].sort();
  const current = STATE.territories[0] || 'all';
  sel.innerHTML = `<option value="all">All Countries</option>` +
    territories.map(t => `<option value="${t}" ${t === current ? 'selected' : ''}>${TERRITORY_FLAGS[t] || ''} ${t}</option>`).join('');
}

function updateMethodChips() {
  const container = document.getElementById('method-chips');
  if (!container) return;
  const methods = getAllPaymentMethods();
  if (methods.length === 0) {
    container.innerHTML = '<span class="grey" style="font-size:12px">Load Wix CSV data to see payment methods</span>';
    return;
  }
  container.innerHTML = methods.map(m => {
    const active = STATE.paymentMethods.length === 0 || STATE.paymentMethods.includes(m);
    return `<span class="chip ${active ? 'active' : ''}" onclick="togglePaymentMethod('${m.replace(/'/g,"\\'")}')">
      ${m}
    </span>`;
  }).join('');
}

function togglePaymentMethod(method) {
  if (STATE.paymentMethods.includes(method)) {
    STATE.paymentMethods = STATE.paymentMethods.filter(m => m !== method);
  } else {
    STATE.paymentMethods.push(method);
  }
  // If all methods are selected, treat as "no filter"
  const allMethods = getAllPaymentMethods();
  if (STATE.paymentMethods.length === allMethods.length) STATE.paymentMethods = [];
  updateMethodChips();
  updatePivotBadge();
  refreshAll();
}

function updatePivotBadge() {
  let count = 0;
  if (STATE.dateFrom || STATE.dateTo) count++;
  if (STATE.paymentMethods.length > 0) count++;
  if (STATE.orderStatus !== 'all') count++;
  const badge = document.getElementById('active-filter-count');
  const clearBtn = document.getElementById('clear-filters-btn');
  if (badge)    { badge.textContent = count; badge.style.display = count > 0 ? '' : 'none'; }
  if (clearBtn) { clearBtn.style.display = count > 0 ? '' : 'none'; }
}
