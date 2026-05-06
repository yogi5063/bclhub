// views/geography.js — Per-territory bubble/treemap visualization
function renderGeography(state) {
  const main = document.getElementById('main');
  const results = getFilteredResults(state);
  if (results.length === 0) { main.innerHTML = `<div class="empty-state"><div class="empty-icon">🌍</div><p>No data loaded.</p></div>`; return; }
  const dCcy = state.displayCcy || 'MYR';
  const fxRate = dCcy === 'MYR' ? 1 : (state.fx[dCcy] || 1);
  const sym = (typeof CURRENCY_SYMBOLS !== 'undefined' && CURRENCY_SYMBOLS[dCcy]) || dCcy;
  const conv = (myr) => myr * fxRate;
  const fmtCcy = (v) => `${sym} ${fmt(v, 0)}`;

  // Group by region (continent)
  const groups = {
    'Americas':   ['Brasil','Latam','USA'],
    'Asia-Pacific': ['India','Indonesia','Japan','Korea','Malaysia','Philippines','Thailand','Oceania','Molnu'],
    'Europe & ME':  ['Europe','GCC'],
  };
  const grouped = {};
  for (const [region, terrs] of Object.entries(groups)) {
    grouped[region] = results.filter(r => terrs.includes(r.territory));
  }

  const sortedTerr = [...results].sort((a,b)=>b.net-a.net);
  const T_net = results.reduce((s,r)=>s+r.net,0);
  const T_orders = results.reduce((s,r)=>s+r.orders,0);
  const T_gp = results.reduce((s,r)=>s+(r.net||0)-(r.fee_total||0),0);

  // Treemap-style bubbles sized by net rev
  const maxNet = Math.max(...results.map(r=>r.net));

  main.innerHTML = `
    <div class="section-header"><h2>Geography</h2>
      <p class="section-desc grey" style="margin:4px 0 0 0">Territory map by Net Revenue. Bubbles sized by contribution.</p></div>
    <div class="kpi-strip">
      <div class="kpi-card"><div class="kpi-label">Territories</div><div class="kpi-value">${results.length}</div></div>
      <div class="kpi-card"><div class="kpi-label">Total Net</div><div class="kpi-value green">${fmtCcy(conv(T_net))}</div></div>
      <div class="kpi-card"><div class="kpi-label">Total Orders</div><div class="kpi-value">${T_orders.toLocaleString()}</div></div>
      <div class="kpi-card"><div class="kpi-label">Top Territory</div><div class="kpi-value">${TERRITORY_FLAGS[sortedTerr[0].territory]||''} ${sortedTerr[0].territory}</div><div class="kpi-sub">${fmtCcy(conv(sortedTerr[0].net))}</div></div>
      <div class="kpi-card"><div class="kpi-label">Top Territory %</div><div class="kpi-value">${(sortedTerr[0].net/T_net*100).toFixed(1)}%</div><div class="kpi-sub">of total</div></div>
    </div>

    <div class="section-header" style="margin-top:24px"><h3>By Region Cluster</h3></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:16px">
      ${Object.entries(grouped).map(([cluster, terrs]) => {
        const cluster_net = terrs.reduce((s,r)=>s+r.net,0);
        const cluster_orders = terrs.reduce((s,r)=>s+r.orders,0);
        return `<div class="chart-card" style="padding:18px">
          <div style="font-weight:600;font-size:14px;margin-bottom:8px">${cluster}</div>
          <div style="font-size:22px;font-weight:600;color:var(--ok)">${fmtCcy(conv(cluster_net))}</div>
          <div style="font-size:11px;color:var(--t-muted);margin-bottom:12px">${cluster_orders.toLocaleString()} orders · ${(cluster_net/T_net*100).toFixed(1)}% of total</div>
          ${terrs.sort((a,b)=>b.net-a.net).map(r=>{
            const pct = r.net/cluster_net*100;
            return `<div style="margin-bottom:6px;font-size:12px">
              <div style="display:flex;justify-content:space-between">
                <span>${TERRITORY_FLAGS[r.territory]||''} <strong>${r.territory}</strong></span>
                <span class="green">${fmtCcy(conv(r.net))}</span>
              </div>
              <div style="background:var(--border);height:4px;border-radius:2px;margin-top:2px;overflow:hidden">
                <div style="background:var(--ok);height:100%;width:${pct}%"></div>
              </div>
            </div>`;
          }).join('')}
        </div>`;
      }).join('')}
    </div>

    <div class="section-header" style="margin-top:24px"><h3>Treemap (sized by Net Revenue)</h3></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px">
      ${sortedTerr.map(r=>{
        const pct = r.net/T_net*100;
        const gp = (r.net||0) - (r.fee_total||0);
        const intensity = Math.min(1, r.net/maxNet);
        const bg = `hsl(160 ${50+intensity*30}% ${30 - intensity*8}%)`;
        return `<div style="background:${bg};padding:14px;border-radius:8px;color:#fff;min-height:110px;display:flex;flex-direction:column;justify-content:space-between">
          <div>
            <div style="font-size:18px;margin-bottom:2px">${TERRITORY_FLAGS[r.territory]||''}</div>
            <div style="font-weight:600;font-size:13px">${r.territory}</div>
            <div style="font-size:10px;opacity:.8">${r.brand} · ${r.local_currency||r.currency}</div>
          </div>
          <div>
            <div style="font-size:14px;font-weight:600">${fmtCcy(conv(r.net))}</div>
            <div style="font-size:10px;opacity:.85">${r.orders} orders · ${pct.toFixed(1)}%</div>
          </div>
        </div>`;
      }).join('')}
    </div>

    <div class="section-header" style="margin-top:24px"><h3>Detailed Table</h3></div>
    <div class="table-wrap"><table class="data-table" style="font-size:12px">
      <thead><tr><th>Rank</th><th>Territory</th><th>Brand</th><th>Native</th><th class="num">Orders</th><th class="num">Net Rev</th><th class="num">Fees</th><th class="num">Gross Profit</th><th class="num">% of Total</th></tr></thead>
      <tbody>${sortedTerr.map((r,i)=>{const gp=(r.net||0)-(r.fee_total||0); return `<tr>
        <td>${i+1}</td>
        <td><strong>${TERRITORY_FLAGS[r.territory]||''} ${r.territory}</strong></td>
        <td><span class="brand-pill brand-${(r.brand||'').toLowerCase()}">${r.brand||''}</span></td>
        <td><span class="grey">${r.local_currency||r.currency||''}</span></td>
        <td class="num">${(r.orders||0).toLocaleString()}</td>
        <td class="num green">${fmtCcy(conv(r.net||0))}</td>
        <td class="num red">${fmtCcy(conv(r.fee_total||0))}</td>
        <td class="num ${gp>=0?'green':'red'}">${fmtCcy(conv(gp))}</td>
        <td class="num">${(r.net/T_net*100).toFixed(1)}%</td>
      </tr>`}).join('')}</tbody>
    </table></div>
  `;
}
