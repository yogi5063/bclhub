// views/products.js — SKU performance: Top by GP, slow movers, loss-makers
function renderProducts(state) {
  const main = document.getElementById('main');
  const results = getFilteredResults(state);
  if (results.length === 0) {
    main.innerHTML = `<div class="empty-state"><div class="empty-icon">📦</div><p>No data loaded.</p></div>`;
    return;
  }
  const dCcy = state.displayCcy || 'MYR';
  const fxRate = dCcy === 'MYR' ? 1 : (state.fx[dCcy] || 1);
  const sym = (typeof CURRENCY_SYMBOLS !== 'undefined' && CURRENCY_SYMBOLS[dCcy]) || dCcy;
  const conv = (myr) => myr * fxRate;
  const fmtCcy = (v) => `${sym} ${fmt(v, 0)}`;
  const rows = [];
  for (const r of results) {
    for (const p of (r.products || [])) {
      rows.push({
        territory: r.territory, sku: p.sku, description: p.description || '',
        qty: p.qty || 0, gross_myr: p.gross_myr || 0, net_myr: p.net_myr || 0,
        cogs_myr: p.cogs_myr || 0, gp_myr: p.gp_myr || 0,
        gp_pct: (p.net_myr || 0) > 0 ? (p.gp_myr || 0) / p.net_myr * 100 : 0,
      });
    }
  }
  rows.sort((a, b) => b.gp_myr - a.gp_myr);
  const total_gp = rows.reduce((s, r) => s + r.gp_myr, 0);
  const total_net = rows.reduce((s, r) => s + r.net_myr, 0);
  const total_cogs = rows.reduce((s, r) => s + r.cogs_myr, 0);
  const top10 = rows.slice(0, 10);
  const slow = [...rows].filter(r => r.qty > 0).sort((a, b) => a.qty - b.qty).slice(0, 10);
  const losers = rows.filter(r => r.gp_myr < 0).sort((a, b) => a.gp_myr - b.gp_myr).slice(0, 10);
  main.innerHTML = `
    <div class="section-header"><h2>SKU Performance</h2>
      <p class="section-desc grey" style="margin:4px 0 0 0">Top SKUs by Gross Profit, slow-movers, and loss-makers across ${results.length} territories.</p></div>
    <div class="kpi-strip">
      <div class="kpi-card"><div class="kpi-label">Net Revenue</div><div class="kpi-value green">${fmtCcy(conv(total_net))}</div><div class="kpi-sub">${rows.length} SKU rows</div></div>
      <div class="kpi-card"><div class="kpi-label">COGS</div><div class="kpi-value red">${fmtCcy(conv(total_cogs))}</div><div class="kpi-sub">cost of goods</div></div>
      <div class="kpi-card"><div class="kpi-label">Gross Profit</div><div class="kpi-value green">${fmtCcy(conv(total_gp))}</div><div class="kpi-sub">${total_net>0?(total_gp/total_net*100).toFixed(1):'0'}% margin</div></div>
      <div class="kpi-card"><div class="kpi-label">Loss-makers</div><div class="kpi-value ${losers.length>0?'red':'green'}">${losers.length}</div><div class="kpi-sub">SKUs with GP &lt; 0</div></div>
    </div>
    <!-- SKU Charts -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:20px">
      <div class="card" style="padding:16px">
        <h3 style="margin:0 0 12px;font-size:13px;color:var(--t-muted)">TOP 10 SKUs — GROSS PROFIT (${dCcy})</h3>
        <canvas id="chart-top-sku" height="250"></canvas>
      </div>
      <div class="card" style="padding:16px">
        <h3 style="margin:0 0 12px;font-size:13px;color:var(--t-muted)">NET REV vs COGS vs GP (Top 10)</h3>
        <canvas id="chart-sku-breakdown" height="250"></canvas>
      </div>
    </div>
    <div class="section-header" style="margin-top:24px"><h3>🏆 Top 10 SKUs by Gross Profit</h3></div>
    <div class="table-wrap"><table class="data-table" style="font-size:12px"><thead><tr><th>#</th><th>Territory</th><th>SKU</th><th>Description</th><th class="num">Qty</th><th class="num">Net Rev</th><th class="num">COGS</th><th class="num">GP</th><th class="num">GP %</th></tr></thead><tbody>
      ${top10.map((r,i)=>`<tr><td>${i+1}</td><td>${TERRITORY_FLAGS[r.territory]||''} ${r.territory}</td><td><strong>${r.sku}</strong></td><td style="font-size:11px;color:var(--t-muted)">${(r.description||'').slice(0,60)}</td><td class="num">${r.qty.toLocaleString()}</td><td class="num">${fmtCcy(conv(r.net_myr))}</td><td class="num red">${fmtCcy(conv(r.cogs_myr))}</td><td class="num green"><strong>${fmtCcy(conv(r.gp_myr))}</strong></td><td class="num">${r.gp_pct.toFixed(1)}%</td></tr>`).join('')}
    </tbody></table></div>
    <div class="section-header" style="margin-top:24px"><h3>🐢 Slow Movers (lowest qty sold)</h3></div>
    <div class="table-wrap"><table class="data-table" style="font-size:12px"><thead><tr><th>Territory</th><th>SKU</th><th class="num">Qty</th><th class="num">Net Rev</th><th class="num">GP</th></tr></thead><tbody>
      ${slow.map(r=>`<tr><td>${TERRITORY_FLAGS[r.territory]||''} ${r.territory}</td><td><strong>${r.sku}</strong></td><td class="num">${r.qty}</td><td class="num">${fmtCcy(conv(r.net_myr))}</td><td class="num">${fmtCcy(conv(r.gp_myr))}</td></tr>`).join('')}
    </tbody></table></div>
    ${losers.length>0?`<div class="section-header" style="margin-top:24px"><h3>⚠ Loss-Making SKUs</h3></div>
    <div class="table-wrap"><table class="data-table" style="font-size:12px"><thead><tr><th>Territory</th><th>SKU</th><th class="num">Net Rev</th><th class="num">COGS</th><th class="num">GP (loss)</th></tr></thead><tbody>
      ${losers.map(r=>`<tr><td>${TERRITORY_FLAGS[r.territory]||''} ${r.territory}</td><td><strong>${r.sku}</strong></td><td class="num">${fmtCcy(conv(r.net_myr))}</td><td class="num red">${fmtCcy(conv(r.cogs_myr))}</td><td class="num red">${fmtCcy(conv(r.gp_myr))}</td></tr>`).join('')}
    </tbody></table></div>`:''}
    <div class="section-header" style="margin-top:24px"><h3>All SKUs (${rows.length})</h3></div>
    <div class="table-wrap" style="max-height:600px;overflow-y:auto"><table class="data-table" style="font-size:11px"><thead style="position:sticky;top:0;background:var(--bg-elev)"><tr><th>Territory</th><th>SKU</th><th class="num">Qty</th><th class="num">Gross Rev</th><th class="num">Net Rev</th><th class="num">COGS</th><th class="num">GP</th><th class="num">GP %</th></tr></thead><tbody>
      ${rows.map(r=>`<tr><td>${r.territory}</td><td><strong>${r.sku}</strong></td><td class="num">${r.qty}</td><td class="num">${fmtCcy(conv(r.gross_myr))}</td><td class="num">${fmtCcy(conv(r.net_myr))}</td><td class="num red">${fmtCcy(conv(r.cogs_myr))}</td><td class="num ${r.gp_myr>=0?'green':'red'}">${fmtCcy(conv(r.gp_myr))}</td><td class="num">${r.gp_pct.toFixed(1)}%</td></tr>`).join('')}
    </tbody></table></div>
  `;

  setTimeout(() => {
    if (typeof Chart === 'undefined') return;
    const t10 = rows.slice(0, 10);
    const labels = t10.map(r => r.sku.length > 14 ? r.sku.slice(0,14)+'…' : r.sku);

    // Chart 1: Horizontal bar — GP by SKU
    const ctx1 = document.getElementById('chart-top-sku');
    if (ctx1) {
      new Chart(ctx1, {
        type: 'bar',
        data: {
          labels,
          datasets: [{ label: 'Gross Profit', data: t10.map(r => Math.round(conv(r.gp_myr))),
            backgroundColor: t10.map(r => r.gp_myr >= 0 ? '#375623CC' : '#C00000CC'),
            borderRadius: 4 }]
        },
        options: {
          indexAxis: 'y', responsive: true,
          plugins: { legend: { display: false },
            tooltip: { callbacks: { label: c => `GP: ${sym} ${fmt(c.raw, 0)}` } } },
          scales: { x: { ticks: { callback: v => sym+' '+fmt(v,0) } } }
        }
      });
    }

    // Chart 2: Grouped bar — Net Rev, COGS, GP per SKU
    const ctx2 = document.getElementById('chart-sku-breakdown');
    if (ctx2) {
      new Chart(ctx2, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            { label: 'Net Revenue', data: t10.map(r => Math.round(conv(r.net_myr))), backgroundColor: '#2E75B6CC', borderRadius: 2 },
            { label: 'COGS',        data: t10.map(r => Math.round(conv(r.cogs_myr))), backgroundColor: '#C00000CC', borderRadius: 2 },
            { label: 'Gross Profit',data: t10.map(r => Math.round(conv(r.gp_myr))),  backgroundColor: '#375623CC', borderRadius: 2 },
          ]
        },
        options: {
          responsive: true,
          plugins: { legend: { position: 'top', labels: { font: { size: 10 } } },
            tooltip: { callbacks: { label: c => `${c.dataset.label}: ${sym} ${fmt(c.raw,0)}` } } },
          scales: { y: { ticks: { callback: v => sym+' '+fmt(v,0) } }, x: { ticks: { font: { size: 9 } } } }
        }
      });
    }
  }, 100);
}
