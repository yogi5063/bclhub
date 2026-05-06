// views/reconciliation.js — Health alerts (diff flags)
function renderReconciliation(state) {
  const main = document.getElementById('main');
  const results = getFilteredResults(state);
  if (results.length === 0) { main.innerHTML = `<div class="empty-state"><div class="empty-icon">🔀</div><p>No data loaded.</p></div>`; return; }
  const dCcy = state.displayCcy || 'MYR';
  const fxRate = dCcy === 'MYR' ? 1 : (state.fx[dCcy] || 1);
  const sym = (typeof CURRENCY_SYMBOLS !== 'undefined' && CURRENCY_SYMBOLS[dCcy]) || dCcy;
  const conv = (myr) => myr * fxRate;
  const fmtCcy = (v) => `${sym} ${fmt(v, 0)}`;

  // Per-region: compare Order Net to Payment, Settle, DBT to flag drift
  const flags = [];
  for (const r of results) {
    const orderNet = r.net || 0;
    const payment = r.payment || 0;
    const settled = (r.gw_settlement_net || 0) + (r.dbt || 0) + (r.gw_paypal_net || 0) + (r.gw_stripe_net || 0) + (r.gw_xendit_net || 0);
    const diffPay = orderNet - payment;
    const diffSettle = orderNet - settled;
    const flagsForRegion = [];
    if (Math.abs(diffPay) > 100) flagsForRegion.push({ type: 'PAYMENT_DIFF', amount: diffPay });
    if (diffSettle > orderNet * 0.05 && orderNet > 100) flagsForRegion.push({ type: 'UNDER_SETTLED', amount: diffSettle });
    if (diffSettle < -orderNet * 0.05 && orderNet > 100) flagsForRegion.push({ type: 'OVER_SETTLED', amount: -diffSettle });
    flags.push({
      territory: r.territory, brand: r.brand,
      orderNet, payment, settled, diffPay, diffSettle, flags: flagsForRegion,
    });
  }
  const totalFlagged = flags.filter(f => f.flags.length > 0).length;
  const totalClean = flags.length - totalFlagged;
  const T_orderNet = flags.reduce((s,f)=>s+f.orderNet,0);
  const T_payment = flags.reduce((s,f)=>s+f.payment,0);
  const T_settled = flags.reduce((s,f)=>s+f.settled,0);

  main.innerHTML = `
    <div class="section-header"><h2>Reconciliation Health</h2>
      <p class="section-desc grey" style="margin:4px 0 0 0">Per-territory diff alerts: Order Net vs Payment vs Settled (Payex+PayPal+Stripe+Xendit+DBT). Pre-built audit findings flagged.</p></div>
    <div class="kpi-strip">
      <div class="kpi-card"><div class="kpi-label">Order Net</div><div class="kpi-value">${fmtCcy(conv(T_orderNet))}</div><div class="kpi-sub">all territories</div></div>
      <div class="kpi-card"><div class="kpi-label">Payment</div><div class="kpi-value">${fmtCcy(conv(T_payment))}</div><div class="kpi-sub">via gateways</div></div>
      <div class="kpi-card"><div class="kpi-label">Settled</div><div class="kpi-value">${fmtCcy(conv(T_settled))}</div><div class="kpi-sub">all channels</div></div>
      <div class="kpi-card"><div class="kpi-label">Order−Settled</div><div class="kpi-value ${Math.abs(T_orderNet-T_settled)>1000?'red':'green'}">${fmtCcy(conv(T_orderNet-T_settled))}</div></div>
      <div class="kpi-card"><div class="kpi-label">Clean Regions</div><div class="kpi-value green">${totalClean}/${flags.length}</div></div>
      <div class="kpi-card"><div class="kpi-label">Flagged</div><div class="kpi-value ${totalFlagged>0?'amber':'green'}">${totalFlagged}</div></div>
    </div>
    <div class="section-header" style="margin-top:24px"><h3>Per-Territory Reconciliation</h3></div>
    <div class="table-wrap"><table class="data-table" style="font-size:12px">
      <thead><tr><th>Territory</th><th class="num">Order Net</th><th class="num">Payment</th><th class="num">Settled (all)</th><th class="num">Diff (O−P)</th><th class="num">Diff (O−S)</th><th>Flags</th></tr></thead>
      <tbody>${flags.sort((a,b)=>b.orderNet-a.orderNet).map(f=>`<tr>
        <td><strong>${TERRITORY_FLAGS[f.territory]||''} ${f.territory}</strong></td>
        <td class="num">${fmtCcy(conv(f.orderNet))}</td>
        <td class="num">${fmtCcy(conv(f.payment))}</td>
        <td class="num">${fmtCcy(conv(f.settled))}</td>
        <td class="num ${Math.abs(f.diffPay)>100?'amber':'green'}">${fmtCcy(conv(f.diffPay))}</td>
        <td class="num ${Math.abs(f.diffSettle)>100?'amber':'green'}">${fmtCcy(conv(f.diffSettle))}</td>
        <td>${f.flags.length===0?'<span style="color:var(--ok)">✓ clean</span>':f.flags.map(fl=>`<span style="background:rgba(245,158,11,.2);color:var(--amber);padding:2px 6px;border-radius:4px;font-size:10px;margin-right:4px">${fl.type}</span>`).join('')}</td>
      </tr>`).join('')}</tbody>
    </table></div>

    <div class="section-header" style="margin-top:24px"><h3>Background Audit Findings</h3></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px">
      <div class="kpi-card" style="text-align:left;padding:16px">
        <div style="font-weight:600;margin-bottom:6px">⚠ 193 ORPHAN orders</div>
        <div style="font-size:12px;color:var(--t-muted)">Wix order placed but no money received yet. Concentrated in <strong>GCC, Thailand, India</strong> — territories without active gateway feeds.</div>
      </div>
      <div class="kpi-card" style="text-align:left;padding:16px">
        <div style="font-weight:600;margin-bottom:6px">⚠ 861 UNDER-SETTLED</div>
        <div style="font-size:12px;color:var(--t-muted)">Genuine reconciliation gaps — likely March orders settled in April (T+N timing) or unsettled receivables.</div>
      </div>
      <div class="kpi-card" style="text-align:left;padding:16px">
        <div style="font-weight:600;margin-bottom:6px">ℹ 70 DOUBLE-COUNTED</div>
        <div style="font-size:12px;color:var(--t-muted)">Heavily-refunded orders where Payment_MYR appears 25× Order_Net. Audited: not a real bug — comparing post-refund Net to gross Payment.</div>
      </div>
      <div class="kpi-card" style="text-align:left;padding:16px">
        <div style="font-weight:600;margin-bottom:6px">ℹ 3 zero-COGS SKUs</div>
        <div style="font-size:12px;color:var(--t-muted)">USA: 2 SKUs · Philippines: 1 SKU. COGS_Mapping needs values for these — flag for finance team.</div>
      </div>
      <div class="kpi-card" style="text-align:left;padding:16px">
        <div style="font-weight:600;margin-bottom:6px">ℹ 34 SKUs &gt;95% margin</div>
        <div style="font-size:12px;color:var(--t-muted)">Mostly Indonesia/Philippines. Likely under-allocated fees in those regions OR genuinely thin COGS.</div>
      </div>
      <div class="kpi-card" style="text-align:left;padding:16px">
        <div style="font-weight:600;margin-bottom:6px">✓ Bank receipts tagged</div>
        <div style="font-size:12px;color:var(--t-muted)">152/152 bank credit rows attributed to source territory (was Malaysia-only). Fixed.</div>
      </div>
    </div>
  `;
}
