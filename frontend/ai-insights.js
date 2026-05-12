/**
 * ai-insights.js — Section-level AI Intelligence Panels
 *
 * Architecture based on research findings:
 * - Orchestrator-Workers pattern (each section = a specialized worker)
 * - RAG-style context: retrieve section data → pass to Claude → structured insights
 * - Parallel generation across sections + caching (6hr TTL in Supabase)
 *
 * Usage: import and call renderInsightsPanel(section, containerId)
 */

const INSIGHT_ICONS = {
  trend:          '📈',
  anomaly:        '⚠️',
  alert:          '🔴',
  recommendation: '💡',
  positive:       '✅',
};

const INSIGHT_COLORS = {
  trend:          '#1e3a5f',
  anomaly:        '#3d2a00',
  alert:          '#3d0f0f',
  recommendation: '#1a2d1a',
  positive:       '#0f2d1e',
};

const INSIGHT_BORDER = {
  trend:          '#6366f1',
  anomaly:        '#f59e0b',
  alert:          '#ef4444',
  recommendation: '#22d3ee',
  positive:       '#22c55e',
};

// ── Main function: generate + render insights for a section ────────────────────
export async function renderInsightsPanel(section, containerId, data, prevData = null, options = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;

  // Show loading state
  container.innerHTML = insightsPanelHTML(section, null, true);

  try {
    const resp = await fetch(`/api/insights/${section}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data, prevData, refresh: options.refresh || false })
    });

    if (!resp.ok) throw new Error('Insights API error');
    const { insights, cached } = await resp.json();
    container.innerHTML = insightsPanelHTML(section, insights, false, cached);

  } catch (e) {
    container.innerHTML = insightsPanelHTML(section, null, false, false, e.message);
  }
}

// ── Render the insights panel HTML ────────────────────────────────────────────
function insightsPanelHTML(section, insights, loading, cached = false, error = null) {
  const title = {
    overview:       '🧠 AI Overview Intelligence',
    revenue:        '🧠 Revenue Intelligence',
    payments:       '🧠 Payments Intelligence',
    products:       '🧠 Product Intelligence',
    reconciliation: '🧠 Reconciliation Intelligence',
    geography:      '🧠 Territory Intelligence',
    leakage:        '🧠 Leakage Intelligence',
    pl:             '🧠 P&L Intelligence',
  }[section] || '🧠 AI Intelligence';

  const panelStyle = `
    background: linear-gradient(135deg, #0f172a, #1e1b4b);
    border: 1px solid #334155;
    border-radius: 12px;
    padding: 18px 20px;
    margin: 16px 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  `;

  const headerStyle = `
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 14px;
  `;

  const titleStyle = `font-size: 13px; font-weight: 700; color: #c4b5fd; letter-spacing: 0.5px;`;
  const badgeStyle = `font-size: 10px; color: #64748b; background: #1e293b; padding: 2px 8px; border-radius: 20px;`;

  if (loading) {
    return `<div style="${panelStyle}">
      <div style="${headerStyle}">
        <span style="${titleStyle}">${title}</span>
        <span style="${badgeStyle}">Generating...</span>
      </div>
      ${[1,2,3].map(() => `
        <div style="background:#1e293b;border-radius:8px;padding:10px;margin-bottom:8px;animation:pulse 1.5s infinite">
          <div style="height:12px;background:#334155;border-radius:4px;width:60%;margin-bottom:6px"></div>
          <div style="height:10px;background:#334155;border-radius:4px;width:90%"></div>
        </div>
      `).join('')}
      <style>@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}</style>
    </div>`;
  }

  if (error || !insights?.length) {
    return `<div style="${panelStyle}">
      <div style="${headerStyle}">
        <span style="${titleStyle}">${title}</span>
        <span style="${badgeStyle}">Unavailable</span>
      </div>
      <div style="font-size:12px;color:#64748b;text-align:center;padding:12px">
        ${error ? `⚠️ ${error}` : 'No insights available for this period.'}
      </div>
    </div>`;
  }

  const insightCards = insights.map(ins => {
    const bg     = INSIGHT_COLORS[ins.type] || '#1e293b';
    const border = INSIGHT_BORDER[ins.type] || '#334155';
    const icon   = ins.icon || INSIGHT_ICONS[ins.type] || '📊';

    return `<div style="
      background: ${bg};
      border: 1px solid ${border};
      border-radius: 8px;
      padding: 10px 12px;
      margin-bottom: 8px;
      display: flex;
      gap: 10px;
      align-items: flex-start;
    ">
      <span style="font-size:18px;flex-shrink:0;margin-top:1px">${icon}</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:700;color:#f1f5f9;margin-bottom:3px">${ins.title}</div>
        <div style="font-size:11px;color:#94a3b8;line-height:1.5">${ins.detail}</div>
        ${ins.action ? `<div style="font-size:10px;color:#22d3ee;margin-top:4px;font-weight:600">→ ${ins.action}</div>` : ''}
      </div>
    </div>`;
  }).join('');

  const refreshBtn = `
    <button onclick="window._refreshInsights && window._refreshInsights('${section}')"
      style="background:transparent;border:none;color:#6366f1;font-size:10px;cursor:pointer;padding:0">
      ↻ Refresh
    </button>`;

  return `<div style="${panelStyle}">
    <div style="${headerStyle}">
      <span style="${titleStyle}">${title}</span>
      <div style="display:flex;align-items:center;gap:8px">
        ${cached ? `<span style="${badgeStyle}">Cached</span>` : `<span style="${badgeStyle}">Live</span>`}
        ${refreshBtn}
      </div>
    </div>
    ${insightCards}
  </div>`;
}

// ── Source toggle component ────────────────────────────────────────────────────
export function renderSourceToggle(containerId, currentSource, onSwitch) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const sources = [
    { key: 'system_workbook', label: '📊 System Workbooks', desc: 'Auto-generated from scripts' },
    { key: 'manual_upload',   label: '📤 Manual Upload',    desc: 'Manually uploaded data' },
    { key: 'all',             label: '🔀 Combined',         desc: 'All data sources' },
  ];

  container.innerHTML = `
    <div style="
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 10px;
      padding: 10px 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    ">
      <span style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;white-space:nowrap">Data Source:</span>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${sources.map(s => `
          <button onclick="window._switchSource && window._switchSource('${s.key}')"
            style="
              padding: 5px 12px;
              border-radius: 20px;
              border: 1px solid ${s.key === currentSource ? '#6366f1' : '#334155'};
              background: ${s.key === currentSource ? '#312e81' : 'transparent'};
              color: ${s.key === currentSource ? '#c4b5fd' : '#64748b'};
              font-size: 11px;
              font-weight: ${s.key === currentSource ? '700' : '400'};
              cursor: pointer;
              transition: all 0.15s;
            "
            title="${s.desc}"
          >${s.label}</button>
        `).join('')}
      </div>
      <span style="font-size:11px;color:#64748b;margin-left:auto">
        ${sources.find(s => s.key === currentSource)?.desc || ''}
      </span>
    </div>`;

  // Register switch handler
  window._switchSource = onSwitch;
}

// ── Batch generate all section insights ───────────────────────────────────────
export async function generateAllInsights(data, prevData = null) {
  const sections = ['overview', 'revenue', 'payments', 'products', 'pl', 'leakage'];

  // Fire all in parallel (Orchestrator-Workers pattern)
  const results = await Promise.allSettled(
    sections.map(section =>
      fetch(`/api/insights/${section}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, prevData })
      }).then(r => r.json()).then(d => ({ section, ...d }))
    )
  );

  const insightsMap = {};
  results.forEach(r => {
    if (r.status === 'fulfilled') {
      insightsMap[r.value.section] = r.value.insights;
    }
  });
  return insightsMap;
}
