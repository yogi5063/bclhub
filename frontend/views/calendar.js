// views/calendar.js — daily breakdown across territories
function renderCalendar(state) {
  const main = document.getElementById('main');
  const results = getFilteredResults(state);
  if (results.length === 0) { main.innerHTML = `<div class="empty-state"><div class="empty-icon">📅</div><p>No data loaded.</p></div>`; return; }
  const dCcy = state.displayCcy || 'MYR';
  const fxRate = dCcy === 'MYR' ? 1 : (state.fx[dCcy] || 1);
  const sym = (typeof CURRENCY_SYMBOLS !== 'undefined' && CURRENCY_SYMBOLS[dCcy]) || dCcy;
  const conv = (myr) => myr * fxRate;
  const fmtCcy = (v) => `${sym} ${fmt(v, 0)}`;

  // Aggregate daily across territories
  const dailyMap = {};
  for (const r of results) {
    const filterTerr = state.calTerritory && state.calTerritory !== 'all' ? state.calTerritory : null;
    if (filterTerr && r.territory !== filterTerr) continue;
    for (const [date, v] of Object.entries(r.daily || {})) {
      if (!dailyMap[date]) dailyMap[date] = { date, gross_myr: 0, net_myr: 0, orders: 0, perTerritory: {} };
      dailyMap[date].gross_myr += v.gross_myr || 0;
      dailyMap[date].net_myr   += v.net_myr   || 0;
      dailyMap[date].orders    += v.orders    || 0;
      dailyMap[date].perTerritory[r.territory] = (dailyMap[date].perTerritory[r.territory] || 0) + (v.net_myr || 0);
    }
  }
  const sortedDays = Object.values(dailyMap).sort((a,b)=>a.date.localeCompare(b.date));
  const T_orders = sortedDays.reduce((s,d)=>s+d.orders,0);
  const T_net = sortedDays.reduce((s,d)=>s+d.net_myr,0);
  const T_gross = sortedDays.reduce((s,d)=>s+d.gross_myr,0);

  const territories = ['all', ...new Set(results.map(r=>r.territory))].sort();

  // Build a March calendar grid (5x7)
  const calendarHTML = (() => {
    if (sortedDays.length === 0) return '<p class="grey">No daily data available</p>';
    const firstDate = new Date(sortedDays[0].date);
    const year = firstDate.getFullYear(); const month = firstDate.getMonth();
    const firstDayOfMonth = new Date(year, month, 1).getDay(); // 0 = Sun
    const lastDay = new Date(year, month+1, 0).getDate();
    const dayMap = {};
    for (const d of sortedDays) { dayMap[parseInt(d.date.slice(8,10))] = d; }
    const cells = [];
    for (let i = 0; i < firstDayOfMonth; i++) cells.push('<td></td>');
    for (let day = 1; day <= lastDay; day++) {
      const d = dayMap[day];
      if (d) {
        const intensity = Math.min(1, d.net_myr / (T_net / lastDay * 2));
        const bg = `rgba(34, 197, 94, ${0.15 + intensity * 0.5})`;
        cells.push(`<td style="background:${bg};padding:8px;vertical-align:top;border:1px solid var(--border);min-height:60px">
          <div style="font-weight:600;font-size:13px">${day}</div>
          <div style="font-size:10px;color:var(--t-muted)">${d.orders} orders</div>
          <div style="font-size:11px;color:var(--ok)">${fmtCcy(conv(d.net_myr))}</div>
        </td>`);
      } else {
        cells.push(`<td style="padding:8px;border:1px solid var(--border);color:var(--t-muted);font-size:13px">${day}</td>`);
      }
    }
    while (cells.length % 7 !== 0) cells.push('<td></td>');
    let rows = '';
    for (let i = 0; i < cells.length; i += 7) rows += `<tr>${cells.slice(i, i+7).join('')}</tr>`;
    return `<table style="width:100%;border-collapse:collapse">
      <thead><tr>${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=>`<th style="padding:8px;text-align:left;font-size:11px;color:var(--t-muted)">${d}</th>`).join('')}</tr></thead>
      <tbody>${rows}</tbody></table>`;
  })();

  main.innerHTML = `
    <div class="section-header" style="display:flex;justify-content:space-between;align-items:center">
      <div><h2>Calendar — Daily Activity</h2>
      <p class="section-desc grey" style="margin:4px 0 0 0">Daily orders &amp; net revenue heat-map.</p></div>
      <select id="cal-terr-sel" class="select-sm" style="font-weight:600">
        ${territories.map(t=>`<option value="${t}" ${(state.calTerritory||'all')===t?'selected':''}>${t==='all'?'All Territories':t}</option>`).join('')}
      </select>
    </div>
    <div class="kpi-strip">
      <div class="kpi-card"><div class="kpi-label">Days with Activity</div><div class="kpi-value">${sortedDays.length}</div><div class="kpi-sub">in period</div></div>
      <div class="kpi-card"><div class="kpi-label">Total Orders</div><div class="kpi-value">${T_orders.toLocaleString()}</div></div>
      <div class="kpi-card"><div class="kpi-label">Total Net</div><div class="kpi-value green">${fmtCcy(conv(T_net))}</div></div>
      <div class="kpi-card"><div class="kpi-label">Avg Daily Net</div><div class="kpi-value">${fmtCcy(conv(T_net / Math.max(sortedDays.length,1)))}</div></div>
      <div class="kpi-card"><div class="kpi-label">Best Day</div><div class="kpi-value">${sortedDays.length>0?[...sortedDays].sort((a,b)=>b.net_myr-a.net_myr)[0].date.slice(5):'-'}</div><div class="kpi-sub">${sortedDays.length>0?fmtCcy(conv([...sortedDays].sort((a,b)=>b.net_myr-a.net_myr)[0].net_myr)):''}</div></div>
    </div>
    <div class="chart-card" style="margin-top:24px;padding:16px"><div class="chart-title">Calendar Heat Map</div>${calendarHTML}</div>
    <div class="section-header" style="margin-top:24px"><h3>Daily Detail</h3></div>
    <div class="table-wrap" style="max-height:500px;overflow-y:auto"><table class="data-table" style="font-size:12px">
      <thead style="position:sticky;top:0;background:var(--bg-elev)"><tr><th>Date</th><th class="num">Orders</th><th class="num">Gross</th><th class="num">Net</th></tr></thead>
      <tbody>${sortedDays.map(d=>`<tr><td>${d.date}</td><td class="num">${d.orders}</td><td class="num">${fmtCcy(conv(d.gross_myr))}</td><td class="num green">${fmtCcy(conv(d.net_myr))}</td></tr>`).join('')}</tbody>
    </table></div>
  `;
  document.getElementById('cal-terr-sel')?.addEventListener('change', e => {
    state.calTerritory = e.target.value; renderCalendar(state);
  });
}
