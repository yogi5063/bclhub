// views/ar.js — Bank Tie-Out: Gateway Settled vs Bank Received
function renderAR(state) {
  const main = document.getElementById('main');
  const results = getFilteredResults(state);
  if (results.length === 0) { main.innerHTML = `<div class="empty-state"><div class="empty-icon">🏦</div><p>No data loaded.</p></div>`; return; }
  const dCcy = state.displayCcy || 'MYR';
  const fxRate = dCcy === 'MYR' ? 1 : (state.fx[dCcy] || 1);
  const sym = (typeof CURRENCY_SYMBOLS !== 'undefined' && CURRENCY_SYMBOLS[dCcy]) || dCcy;
  const conv = (myr) => myr * fxRate;
  const fmtCcy = (v) => `${sym} ${fmt(v, 0)}`;

  const rows = results.map(r => {
    const ar = r.ar || {};
    const settled = (r.gw_settlement_net || 0);
    const dbt = r.dbt || 0;
    const bank = ar.bank_receipts_myr || r.bank_receipts_myr || 0;
    const expected = settled + dbt;
    const balance = expected - bank;
    return {
      territory: r.territory, brand: r.brand,
      payex_settle: settled, dbt, bank, expected, balance,
      payex_gross: r.gw_payex || 0, payex_fee: r.fee_payex || 0,
      coverage: expected > 0 ? bank / expected * 100 : 0,
    };
  }).sort((a,b)=>b.expected-a.expected);

  const T = rows.reduce((acc, r) => {
    acc.payex_settle += r.payex_settle; acc.dbt += r.dbt;
    acc.bank += r.bank; acc.expected += r.expected;
    return acc;
  }, { payex_settle:0, dbt:0, bank:0, expected:0 });
  const T_balance = T.expected - T.bank;
  const T_coverage = T.expected > 0 ? T.bank / T.expected * 100 : 0;

  main.innerHTML = `
    <div class="section-header"><h2>Bank Tie-Out</h2>
      <p class="section-desc grey" style="margin:4px 0 0 0">Gateway-settled (Payex Settlement Net) + DBT (Direct Bank Transfer) <strong>vs</strong> Bank Receipts received in our accounts. Coverage = received ÷ expected.</p></div>
    <div class="kpi-strip">
      <div class="kpi-card"><div class="kpi-label">Payex Settled</div><div class="kpi-value">${fmtCcy(conv(T.payex_settle))}</div></div>
      <div class="kpi-card"><div class="kpi-label">DBT (Direct)</div><div class="kpi-value">${fmtCcy(conv(T.dbt))}</div></div>
      <div class="kpi-card"><div class="kpi-label">Expected to Land</div><div class="kpi-value">${fmtCcy(conv(T.expected))}</div></div>
      <div class="kpi-card"><div class="kpi-label">Bank Received</div><div class="kpi-value green">${fmtCcy(conv(T.bank))}</div></div>
      <div class="kpi-card"><div class="kpi-label">Outstanding</div><div class="kpi-value ${Math.abs(T_balance)>1000?'amber':'green'}">${fmtCcy(conv(T_balance))}</div></div>
      <div class="kpi-card"><div class="kpi-label">Coverage</div><div class="kpi-value ${T_coverage>=98?'green':T_coverage>=90?'amber':'red'}">${T_coverage.toFixed(1)}%</div></div>
    </div>
    <div class="section-header" style="margin-top:24px"><h3>Per-Territory Bank Tie-Out</h3></div>
    <div class="table-wrap"><table class="data-table" style="font-size:12px">
      <thead><tr><th>Territory</th><th class="num">Payex Gross</th><th class="num">Payex Fee</th><th class="num">Payex Settled</th><th class="num">DBT</th><th class="num">Expected</th><th class="num">Bank Received</th><th class="num">Outstanding</th><th class="num">Coverage</th></tr></thead>
      <tbody>${rows.map(r=>`<tr>
        <td><strong>${TERRITORY_FLAGS[r.territory]||''} ${r.territory}</strong></td>
        <td class="num">${fmtCcy(conv(r.payex_gross))}</td>
        <td class="num red">${fmtCcy(conv(r.payex_fee))}</td>
        <td class="num">${fmtCcy(conv(r.payex_settle))}</td>
        <td class="num">${fmtCcy(conv(r.dbt))}</td>
        <td class="num">${fmtCcy(conv(r.expected))}</td>
        <td class="num green">${fmtCcy(conv(r.bank))}</td>
        <td class="num ${Math.abs(r.balance)>500?'amber':'green'}">${fmtCcy(conv(r.balance))}</td>
        <td class="num ${r.coverage>=98?'green':r.coverage>=90?'amber':'red'}">${r.coverage.toFixed(1)}%</td>
      </tr>`).join('')}
      <tr style="background:rgba(31,78,121,.08);font-weight:600;border-top:2px solid var(--accent)">
        <td>TOTAL</td><td></td><td></td>
        <td class="num">${fmtCcy(conv(T.payex_settle))}</td>
        <td class="num">${fmtCcy(conv(T.dbt))}</td>
        <td class="num">${fmtCcy(conv(T.expected))}</td>
        <td class="num green">${fmtCcy(conv(T.bank))}</td>
        <td class="num">${fmtCcy(conv(T_balance))}</td>
        <td class="num">${T_coverage.toFixed(1)}%</td>
      </tr></tbody>
    </table></div>
  `;
}
