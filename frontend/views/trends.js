// views/trends.js — Daily revenue trend (line chart) + per-territory growth
function renderTrends(state) {
  const main = document.getElementById('main');
  const results = getFilteredResults(state);
  if (results.length === 0) { main.innerHTML = `<div class="empty-state"><div class="empty-icon">📈</div><p>No data loaded.</p></div>`; return; }
  const dCcy = state.displayCcy || 'MYR';
  const fxRate = dCcy === 'MYR' ? 1 : (state.fx[dCcy] || 1);
  const sym = (typeof CURRENCY_SYMBOLS !== 'undefined' && CURRENCY_SYMBOLS[dCcy]) || dCcy;
  const conv = (myr) => myr * fxRate;
  const fmtCcy = (v) => `${sym} ${fmt(v, 0)}`;

  // Aggregate daily across all (or filtered) territories
  const dailyMap = {};
  for (const r of results) {
    for (const [date, v] of Object.entries(r.daily || {})) {
      if (!dailyMap[date]) dailyMap[date] = { date, gross_myr:0, net_myr:0, orders:0 };
      dailyMap[date].gross_myr += v.gross_myr || 0;
      dailyMap[date].net_myr   += v.net_myr   || 0;
      dailyMap[date].orders    += v.orders    || 0;
    }
  }
  const days = Object.values(dailyMap).sort((a,b)=>a.date.localeCompare(b.date));
  if (days.length === 0) { main.innerHTML = `<div class="empty-state"><div class="empty-icon">📈</div><p>No daily data.</p></div>`; return; }

  const T_orders = days.reduce((s,d)=>s+d.orders,0);
  const T_net = days.reduce((s,d)=>s+d.net_myr,0);
  const avg_daily = T_net / days.length;
  const best = [...days].sort((a,b)=>b.net_myr-a.net_myr)[0];
  const worst = [...days].sort((a,b)=>a.net_myr-b.net_myr)[0];

  // Mini SVG sparkline
  const max = Math.max(...days.map(d=>d.net_myr));
  const W = 800, H = 220, P = 30;
  const xStep = (W - P*2) / Math.max(days.length-1, 1);
  const points = days.map((d,i)=>`${P + i*xStep},${H - P - (d.net_myr/max)*(H-P*2)}`);
  const linePath = points.join(' ');
  const areaPath = `M ${P},${H-P} L ${linePath.replace(/ /g,' L ')} L ${P + (days.length-1)*xStep},${H-P} Z`;

  main.innerHTML = `
    <div class="section-header"><h2>Trends · Daily Revenue</h2>
      <p class="section-desc grey" style="margin:4px 0 0 0">Net revenue + orders per day across ${results.length} territories.</p></div>
    <div class="kpi-strip">
      <div class="kpi-card"><div class="kpi-label">Days Active</div><div class="kpi-value">${days.length}</div></div>
      <div class="kpi-card"><div class="kpi-label">Total Net</div><div class="kpi-value green">${fmtCcy(conv(T_net))}</div></div>
      <div class="kpi-card"><div class="kpi-label">Total Orders</div><div class="kpi-value">${T_orders.toLocaleString()}</div></div>
      <div class="kpi-card"><div class="kpi-label">Avg/Day</div><div class="kpi-value">${fmtCcy(conv(avg_daily))}</div></div>
      <div class="kpi-card"><div class="kpi-label">Best Day</div><div class="kpi-value green">${best.date.slice(5)}</div><div class="kpi-sub">${fmtCcy(conv(best.net_myr))}</div></div>
      <div class="kpi-card"><div class="kpi-label">Slowest</div><div class="kpi-value">${worst.date.slice(5)}</div><div class="kpi-sub">${fmtCcy(conv(worst.net_myr))}</div></div>
    </div>
    <div class="chart-card" style="margin-top:24px;padding:24px"><div class="chart-title">Daily Net Revenue</div>
      <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block">
        <path d="${areaPath}" fill="rgba(34,197,94,.15)" />
        <polyline points="${linePath}" fill="none" stroke="rgb(34,197,94)" stroke-width="2"/>
        ${days.filter((d,i)=>i%5===0||i===days.length-1).map((d,i)=>{
          const idx = days.indexOf(d);
          const x = P + idx*xStep; const y = H - P - (d.net_myr/max)*(H-P*2);
          return `<g><circle cx="${x}" cy="${y}" r="3" fill="rgb(34,197,94)"/><text x="${x}" y="${H-10}" font-size="10" fill="var(--t-muted)" text-anchor="middle">${d.date.slice(5)}</text></g>`;
        }).join('')}
      </svg>
    </div>
    <div class="section-header" style="margin-top:24px"><h3>Daily Detail</h3></div>
    <div class="table-wrap" style="max-height:500px;overflow-y:auto"><table class="data-table" style="font-size:12px">
      <thead style="position:sticky;top:0;background:var(--bg-elev)"><tr><th>Date</th><th class="num">Orders</th><th class="num">Gross</th><th class="num">Net</th><th class="num">vs Avg</th></tr></thead>
      <tbody>${days.map(d=>{const vs=d.net_myr - avg_daily; return `<tr>
        <td>${d.date}</td>
        <td class="num">${d.orders}</td>
        <td class="num">${fmtCcy(conv(d.gross_myr))}</td>
        <td class="num green">${fmtCcy(conv(d.net_myr))}</td>
        <td class="num ${vs>=0?'green':'red'}">${vs>=0?'+':''}${fmtCcy(conv(vs))}</td>
      </tr>`}).join('')}</tbody>
    </table></div>
  `;
}
