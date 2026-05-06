// views/pl-detail.js — Detailed P&L: All-territory + per-territory drill-down
function renderPLDetail(state) {
  const main = document.getElementById('main');
  const results = getFilteredResults(state);
  if (results.length === 0) { main.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><p>No data loaded.</p></div>`; return; }
  const dCcy = state.displayCcy || 'MYR';
  const fxRate = dCcy === 'MYR' ? 1 : (state.fx[dCcy] || 1);
  const sym = (typeof CURRENCY_SYMBOLS !== 'undefined' && CURRENCY_SYMBOLS[dCcy]) || dCcy;
  const conv = (myr) => myr * fxRate;
  const fmtCcy = (v) => `${sym} ${fmt(v, 0)}`;

  if (!state.plDrillTo) state.plDrillTo = 'all';
  const drill = state.plDrillTo;
  const territories = ['all', ...results.map(r=>r.territory).sort()];
  const showResults = drill === 'all' ? results : results.filter(r => r.territory === drill);

  // Single-territory drill-down
  if (drill !== 'all' && showResults.length === 1) {
    const r = showResults[0];
    const productMYR = (r.gross || 0) - (r.shipping || 0);
    const gp = (r.net || 0) - (r.fee_total || 0);
    const npRows = (r.products || []).slice().sort((a,b)=>b.gp_myr-a.gp_myr);
    main.innerHTML = `
      <div class="section-header" style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <h2>${TERRITORY_FLAGS[r.territory]||''} ${r.territory} — Detailed P&amp;L</h2>
          <p class="section-desc grey" style="margin:4px 0 0 0">Native: ${r.local_currency||r.currency} · Brand: ${r.brand} · ${r.orders} orders</p>
        </div>
        <div style="display:flex;gap:8px">
          <select id="pl-drill" class="select-sm" style="font-weight:600">
            ${territories.map(t=>`<option value="${t}" ${t===drill?'selected':''}>${t==='all'?'All Territories':((TERRITORY_FLAGS[t]||'')+' '+t)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="kpi-strip">
        <div class="kpi-card"><div class="kpi-label">Product Revenue</div><div class="kpi-value">${fmtCcy(conv(productMYR))}</div></div>
        <div class="kpi-card"><div class="kpi-label">Shipping</div><div class="kpi-value">${fmtCcy(conv(r.shipping||0))}</div></div>
        <div class="kpi-card"><div class="kpi-label">Refunds</div><div class="kpi-value red">${fmtCcy(conv(r.refund_total||0))}</div></div>
        <div class="kpi-card"><div class="kpi-label">Net Revenue</div><div class="kpi-value green">${fmtCcy(conv(r.net||0))}</div></div>
        <div class="kpi-card"><div class="kpi-label">Gateway Fees</div><div class="kpi-value red">${fmtCcy(conv(r.fee_total||0))}</div></div>
        <div class="kpi-card"><div class="kpi-label">Gross Profit</div><div class="kpi-value ${gp>=0?'green':'red'}">${fmtCcy(conv(gp))}</div></div>
      </div>
      <div class="section-header" style="margin-top:24px"><h3>P&amp;L Walk · ${r.territory}</h3></div>
      <div class="table-wrap"><table class="data-table" style="font-size:13px;max-width:600px">
        <tbody>
          <tr><td>A. Product Revenue</td><td class="num">${fmtCcy(conv(productMYR))}</td></tr>
          <tr><td>B. Shipping Revenue</td><td class="num">${fmtCcy(conv(r.shipping||0))}</td></tr>
          <tr style="border-top:1px solid var(--border);font-weight:600"><td>C. Gross Revenue</td><td class="num">${fmtCcy(conv(r.gross||0))}</td></tr>
          <tr><td>D. Less: Refunds</td><td class="num red">−${fmtCcy(conv(r.refund_total||0))}</td></tr>
          <tr style="border-top:1px solid var(--border)"><td>F. Net After Refunds</td><td class="num">${fmtCcy(conv((r.gross||0)-(r.refund_total||0)))}</td></tr>
          <tr><td>H. Less: Tax</td><td class="num red">−${fmtCcy(conv(r.tax||0))}</td></tr>
          <tr style="border-top:2px solid var(--accent);font-weight:700;background:rgba(34,197,94,.08)"><td>I. NET REVENUE</td><td class="num green">${fmtCcy(conv(r.net||0))}</td></tr>
          <tr><td>Less: Payex MDR</td><td class="num red">−${fmtCcy(conv(r.fee_payex||0))}</td></tr>
          <tr><td>Less: PayPal Fee</td><td class="num red">−${fmtCcy(conv(r.fee_paypal||0))}</td></tr>
          <tr><td>Less: Stripe Fee</td><td class="num red">−${fmtCcy(conv(r.fee_stripe||0))}</td></tr>
          <tr><td>Less: Xendit Fee</td><td class="num red">−${fmtCcy(conv(r.fee_xendit||0))}</td></tr>
          <tr style="border-top:2px solid var(--accent);font-weight:700;background:rgba(34,197,94,.08)"><td>GROSS PROFIT</td><td class="num ${gp>=0?'green':'red'}">${fmtCcy(conv(gp))}</td></tr>
        </tbody>
      </table></div>
      <div class="section-header" style="margin-top:24px"><h3>Top SKUs · ${r.territory}</h3></div>
      <div class="table-wrap"><table class="data-table" style="font-size:12px">
        <thead><tr><th>SKU</th><th>Description</th><th class="num">Qty</th><th class="num">Net Rev</th><th class="num">COGS</th><th class="num">Gross Profit</th></tr></thead>
        <tbody>${npRows.map(p=>`<tr>
          <td><strong>${p.sku}</strong></td>
          <td style="font-size:11px;color:var(--t-muted)">${(p.description||'').slice(0,60)}</td>
          <td class="num">${p.qty}</td>
          <td class="num">${fmtCcy(conv(p.net_myr||0))}</td>
          <td class="num red">${fmtCcy(conv(p.cogs_myr||0))}</td>
          <td class="num green">${fmtCcy(conv(p.gp_myr||0))}</td>
        </tr>`).join('')}</tbody>
      </table></div>
    `;
    document.getElementById('pl-drill')?.addEventListener('change', e=>{state.plDrillTo=e.target.value;renderPLDetail(state);});
    return;
  }

  // All-territory view
  const T = results.reduce((acc, r) => {
    acc.gross += r.gross||0; acc.net += r.net||0; acc.shipping += r.shipping||0;
    acc.refunds += r.refund_total||0; acc.tax += r.tax||0;
    acc.fees += r.fee_total||0; acc.orders += r.orders||0;
    acc.gp += (r.net||0) - (r.fee_total||0);
    return acc;
  }, { gross:0, net:0, shipping:0, refunds:0, tax:0, fees:0, orders:0, gp:0 });

  main.innerHTML = `
    <div class="section-header" style="display:flex;justify-content:space-between;align-items:center">
      <div><h2>P&amp;L Detail</h2><p class="section-desc grey" style="margin:4px 0 0 0">Per-territory P&amp;L · matches accountant exactly · drill into any territory below.</p></div>
      <div style="display:flex;gap:8px;align-items:center">
        <span style="font-size:11px;color:var(--t-muted)">Drill:</span>
        <select id="pl-drill" class="select-sm" style="font-weight:600">
          ${territories.map(t=>`<option value="${t}" ${t===drill?'selected':''}>${t==='all'?'All Territories':((TERRITORY_FLAGS[t]||'')+' '+t)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="kpi-strip">
      <div class="kpi-card"><div class="kpi-label">Net Revenue</div><div class="kpi-value green">${fmtCcy(conv(T.net))}</div></div>
      <div class="kpi-card"><div class="kpi-label">Gross Revenue</div><div class="kpi-value">${fmtCcy(conv(T.gross))}</div></div>
      <div class="kpi-card"><div class="kpi-label">Refunds</div><div class="kpi-value red">${fmtCcy(conv(T.refunds))}</div></div>
      <div class="kpi-card"><div class="kpi-label">Total Fees</div><div class="kpi-value red">${fmtCcy(conv(T.fees))}</div></div>
      <div class="kpi-card"><div class="kpi-label">Gross Profit</div><div class="kpi-value ${T.gp>=0?'green':'red'}">${fmtCcy(conv(T.gp))}</div></div>
    </div>
    <!-- P&L Charts -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:20px">
      <div class="card" style="padding:16px">
        <h3 style="margin:0 0 12px;font-size:13px;color:var(--t-muted)">NET REVENUE COMPONENTS (${dCcy})</h3>
        <canvas id="chart-pl-stacked" height="220"></canvas>
      </div>
      <div class="card" style="padding:16px">
        <h3 style="margin:0 0 12px;font-size:13px;color:var(--t-muted)">GROSS PROFIT BY TERRITORY (${dCcy})</h3>
        <canvas id="chart-gp-terr" height="220"></canvas>
      </div>
    </div>
    <div class="table-wrap" style="margin-top:24px"><table class="data-table" style="font-size:12px">
      <thead><tr>
        <th>Territory</th><th>Native</th>
        <th class="num">A. Product</th><th class="num">B. Shipping</th><th class="num">C. Gross</th>
        <th class="num">D. Refunds</th><th class="num">F. After Ref</th><th class="num">H. Tax</th>
        <th class="num">I. Net Rev</th>
        <th class="num">Payex Fee</th><th class="num">PayPal Fee</th><th class="num">Stripe Fee</th><th class="num">Xendit Fee</th>
        <th class="num">Total Fees</th><th class="num">Gross Profit</th><th class="num">Orders</th>
      </tr></thead>
      <tbody>${results.sort((a,b)=>b.net-a.net).map(r=>{const product=(r.gross||0)-(r.shipping||0); const afterRef=(r.gross||0)-(r.refund_total||0); const gp=(r.net||0)-(r.fee_total||0); return `<tr style="cursor:pointer" onclick="document.getElementById('pl-drill').value='${r.territory}';document.getElementById('pl-drill').dispatchEvent(new Event('change'))">
        <td><strong>${TERRITORY_FLAGS[r.territory]||''} ${r.territory}</strong></td>
        <td><span class="grey">${r.local_currency||r.currency||''}</span></td>
        <td class="num">${fmtCcy(conv(product))}</td>
        <td class="num">${fmtCcy(conv(r.shipping||0))}</td>
        <td class="num">${fmtCcy(conv(r.gross||0))}</td>
        <td class="num red">−${fmtCcy(conv(r.refund_total||0))}</td>
        <td class="num">${fmtCcy(conv(afterRef))}</td>
        <td class="num red">−${fmtCcy(conv(r.tax||0))}</td>
        <td class="num green"><strong>${fmtCcy(conv(r.net||0))}</strong></td>
        <td class="num red">−${fmtCcy(conv(r.fee_payex||0))}</td>
        <td class="num red">−${fmtCcy(conv(r.fee_paypal||0))}</td>
        <td class="num red">−${fmtCcy(conv(r.fee_stripe||0))}</td>
        <td class="num red">−${fmtCcy(conv(r.fee_xendit||0))}</td>
        <td class="num red"><strong>−${fmtCcy(conv(r.fee_total||0))}</strong></td>
        <td class="num ${gp>=0?'green':'red'}"><strong>${fmtCcy(conv(gp))}</strong></td>
        <td class="num">${(r.orders||0).toLocaleString()}</td>
      </tr>`}).join('')}
      <tr style="background:rgba(31,78,121,.08);font-weight:700;border-top:2px solid var(--accent)">
        <td>TOTAL</td><td>—</td>
        <td class="num">${fmtCcy(conv(T.gross-T.shipping))}</td>
        <td class="num">${fmtCcy(conv(T.shipping))}</td>
        <td class="num">${fmtCcy(conv(T.gross))}</td>
        <td class="num red">−${fmtCcy(conv(T.refunds))}</td>
        <td class="num">${fmtCcy(conv(T.gross-T.refunds))}</td>
        <td class="num red">−${fmtCcy(conv(T.tax))}</td>
        <td class="num green">${fmtCcy(conv(T.net))}</td>
        <td colspan="4"></td>
        <td class="num red">−${fmtCcy(conv(T.fees))}</td>
        <td class="num ${T.gp>=0?'green':'red'}">${fmtCcy(conv(T.gp))}</td>
        <td class="num">${T.orders.toLocaleString()}</td>
      </tr></tbody>
    </table></div>
    <p class="grey" style="font-size:11px;margin-top:8px">💡 Click any row to drill into that territory's detailed P&amp;L</p>
  `;
  document.getElementById('pl-drill')?.addEventListener('change', e=>{state.plDrillTo=e.target.value;renderPLDetail(state);});

  setTimeout(() => {
    if (typeof Chart === 'undefined') return;
    const sorted3 = [...results].sort((a,b) => b.net - a.net);

    // Chart 1: Stacked bar — Net Rev + Refunds + Fees breakdown by territory
    const ctx1 = document.getElementById('chart-pl-stacked');
    if (ctx1) {
      new Chart(ctx1, {
        type: 'bar',
        data: {
          labels: sorted3.map(r => r.territory),
          datasets: [
            { label: 'Net Revenue', data: sorted3.map(r => Math.round(conv(r.net||0))),          backgroundColor: '#375623CC', borderRadius: 2 },
            { label: 'Refunds',     data: sorted3.map(r => Math.round(conv(r.refund_total||0))), backgroundColor: '#C00000CC', borderRadius: 2 },
            { label: 'Fees',        data: sorted3.map(r => Math.round(conv(r.fee_total||0))),    backgroundColor: '#ED7D31CC', borderRadius: 2 },
          ]
        },
        options: {
          responsive: true, plugins: { legend: { position:'top', labels:{font:{size:10}} },
            tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${sym} ${fmt(c.raw,0)}`}} },
          scales:{x:{stacked:true,ticks:{font:{size:9}}},y:{stacked:true,ticks:{callback:v=>sym+' '+fmt(v,0)}}}
        }
      });
    }

    // Chart 2: Gross Profit horizontal bar by territory
    const ctx2 = document.getElementById('chart-gp-terr');
    if (ctx2) {
      const gpSorted = [...results].sort((a,b) => ((b.net||0)-(b.fee_total||0)) - ((a.net||0)-(a.fee_total||0)));
      new Chart(ctx2, {
        type: 'bar',
        data: {
          labels: gpSorted.map(r => r.territory),
          datasets: [{
            label: 'Gross Profit',
            data: gpSorted.map(r => Math.round(conv((r.net||0)-(r.fee_total||0)))),
            backgroundColor: gpSorted.map(r => {
              const gp = (r.net||0)-(r.fee_total||0);
              return gp >= 0 ? '#375623CC' : '#C00000CC';
            }), borderRadius: 4
          }]
        },
        options: {
          indexAxis:'y', responsive:true,
          plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`GP: ${sym} ${fmt(c.raw,0)}`}}},
          scales:{x:{ticks:{callback:v=>sym+' '+fmt(v,0)}}}
        }
      });
    }
  }, 100);
}
