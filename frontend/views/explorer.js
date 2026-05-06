// views/explorer.js — Drill into raw data per territory
function renderExplorer(state) {
  const main = document.getElementById('main');
  const results = getFilteredResults(state);
  if (results.length === 0) { main.innerHTML = `<div class="empty-state"><div class="empty-icon">🔍</div><p>No data loaded.</p></div>`; return; }
  const dCcy = state.displayCcy || 'MYR';
  const fxRate = dCcy === 'MYR' ? 1 : (state.fx[dCcy] || 1);
  const sym = (typeof CURRENCY_SYMBOLS !== 'undefined' && CURRENCY_SYMBOLS[dCcy]) || dCcy;
  const conv = (myr) => myr * fxRate;
  const fmtCcy = (v) => `${sym} ${fmt(v, 0)}`;

  if (!state.explorerTerr) state.explorerTerr = results[0].territory;
  const r = results.find(x => x.territory === state.explorerTerr) || results[0];

  const fields = [
    { label: 'Gross Revenue',         val: r.gross,             kind: 'money' },
    { label: '  Shipping',            val: r.shipping,          kind: 'money', indent: true },
    { label: '  Tax',                 val: r.tax,               kind: 'money', indent: true },
    { label: 'Refunds',               val: r.refund_total,      kind: 'money' },
    { label: 'Net Revenue',           val: r.net,               kind: 'money', bold: true, color: 'green' },
    { label: 'Discount',              val: r.discount,          kind: 'money' },
    { label: 'Orders',                val: r.orders,            kind: 'count' },
    { label: '  Paid',                val: r.orders_paid,       kind: 'count', indent: true },
    { label: '  Unpaid',              val: r.orders_unpaid,     kind: 'count', indent: true },
    { label: '  Refunded',            val: r.orders_refunded,   kind: 'count', indent: true },
    { label: 'AOV',                   val: r.aov,               kind: 'money' },
    { label: 'Margin %',              val: r.margin_pct,        kind: 'pct' },
  ];
  const gateways = [
    { label: 'Payex Gross',           val: r.gw_payex,          kind: 'money' },
    { label: 'Payex Net (Settled)',   val: r.gw_settlement_net, kind: 'money' },
    { label: 'Payex MDR (Fee)',       val: r.fee_payex,         kind: 'money', color: 'red' },
    { label: 'PayPal Gross',          val: r.gw_paypal_gross,   kind: 'money' },
    { label: 'PayPal Net',            val: r.gw_paypal_net,     kind: 'money' },
    { label: 'PayPal Fee',            val: r.fee_paypal,        kind: 'money', color: 'red' },
    { label: 'Stripe Gross',          val: r.gw_stripe_gross,   kind: 'money' },
    { label: 'Stripe Net',            val: r.gw_stripe_net,     kind: 'money' },
    { label: 'Stripe Fee',            val: r.fee_stripe,        kind: 'money', color: 'red' },
    { label: 'Xendit Gross',          val: r.gw_xendit_gross,   kind: 'money' },
    { label: 'Xendit Net',            val: r.gw_xendit_net,     kind: 'money' },
    { label: 'Xendit Fee',            val: r.fee_xendit,        kind: 'money', color: 'red' },
    { label: 'TOTAL Fees',            val: r.fee_total,         kind: 'money', color: 'red', bold: true },
    { label: 'Payment received',      val: r.payment,           kind: 'money' },
    { label: 'DBT (Direct Bank)',     val: r.dbt,               kind: 'money' },
    { label: 'Bank Receipts',         val: r.bank_receipts_myr, kind: 'money' },
  ];

  function renderTable(rows) {
    return rows.map(f => {
      let displayVal;
      if (f.val === null || f.val === undefined) displayVal = '—';
      else if (f.kind === 'money') displayVal = fmtCcy(conv(f.val));
      else if (f.kind === 'pct')   displayVal = `${f.val.toFixed(1)}%`;
      else displayVal = (f.val||0).toLocaleString();
      const ind = f.indent ? 'padding-left:24px;' : '';
      const cls = f.color || '';
      const wt = f.bold ? 'font-weight:700;' : '';
      return `<tr style="${wt}"><td style="${ind}">${f.label}</td><td class="num ${cls}">${displayVal}</td></tr>`;
    }).join('');
  }

  main.innerHTML = `
    <div class="section-header" style="display:flex;justify-content:space-between;align-items:center">
      <div><h2>Sheet Explorer</h2>
      <p class="section-desc grey" style="margin:4px 0 0 0">Drill into raw per-territory metrics. Pick any territory to inspect.</p></div>
      <select id="explorer-sel" class="select-sm" style="font-weight:600">
        ${results.sort((a,b)=>b.net-a.net).map(t=>`<option value="${t.territory}" ${t.territory===state.explorerTerr?'selected':''}>${TERRITORY_FLAGS[t.territory]||''} ${t.territory}</option>`).join('')}
      </select>
    </div>
    <div class="kpi-strip">
      <div class="kpi-card"><div class="kpi-label">Territory</div><div class="kpi-value">${TERRITORY_FLAGS[r.territory]||''} ${r.territory}</div><div class="kpi-sub">${r.brand} · ${r.local_currency||r.currency}</div></div>
      <div class="kpi-card"><div class="kpi-label">Net Revenue</div><div class="kpi-value green">${fmtCcy(conv(r.net||0))}</div></div>
      <div class="kpi-card"><div class="kpi-label">Orders</div><div class="kpi-value">${(r.orders||0).toLocaleString()}</div></div>
      <div class="kpi-card"><div class="kpi-label">SKUs</div><div class="kpi-value">${(r.products||[]).length}</div></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:24px">
      <div class="chart-card" style="padding:18px">
        <div class="chart-title">P&amp;L</div>
        <table class="data-table" style="font-size:12px;width:100%"><tbody>${renderTable(fields)}</tbody></table>
      </div>
      <div class="chart-card" style="padding:18px">
        <div class="chart-title">Gateway Breakdown</div>
        <table class="data-table" style="font-size:12px;width:100%"><tbody>${renderTable(gateways)}</tbody></table>
      </div>
    </div>
    ${(r.products||[]).length > 0 ? `
    <div class="section-header" style="margin-top:24px"><h3>SKU Detail (${r.products.length})</h3></div>
    <div class="table-wrap"><table class="data-table" style="font-size:11px">
      <thead><tr><th>SKU</th><th>Description</th><th class="num">Qty</th><th class="num">Net Rev</th><th class="num">COGS</th><th class="num">GP</th></tr></thead>
      <tbody>${[...r.products].sort((a,b)=>(b.gp_myr||0)-(a.gp_myr||0)).map(p=>`<tr>
        <td><strong>${p.sku}</strong></td>
        <td style="font-size:10px;color:var(--t-muted)">${(p.description||'').slice(0,50)}</td>
        <td class="num">${p.qty}</td>
        <td class="num">${fmtCcy(conv(p.net_myr||0))}</td>
        <td class="num red">${fmtCcy(conv(p.cogs_myr||0))}</td>
        <td class="num green">${fmtCcy(conv(p.gp_myr||0))}</td>
      </tr>`).join('')}</tbody>
    </table></div>` : ''}
    ${(r.payment_methods||[]).length > 0 ? `
    <div class="section-header" style="margin-top:24px"><h3>Payment Methods</h3></div>
    <div class="table-wrap"><table class="data-table" style="font-size:12px;max-width:400px">
      <thead><tr><th>Method</th><th class="num">Count</th></tr></thead>
      <tbody>${[...r.payment_methods].sort((a,b)=>b.count-a.count).map(m=>`<tr>
        <td>${m.name}</td><td class="num">${m.count}</td>
      </tr>`).join('')}</tbody>
    </table></div>` : ''}
  `;

  document.getElementById('explorer-sel')?.addEventListener('change', e => {
    state.explorerTerr = e.target.value; renderExplorer(state);
  });
}
