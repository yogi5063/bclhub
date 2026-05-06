// views/payments.js — Per-territory gateway fee detail
function renderPayments(state) {
  const main = document.getElementById('main');
  const results = getFilteredResults(state);
  if (results.length === 0) { main.innerHTML = `<div class="empty-state"><div class="empty-icon">💳</div><p>No data loaded.</p></div>`; return; }
  const dCcy = state.displayCcy || 'MYR';
  const fxRate = dCcy === 'MYR' ? 1 : (state.fx[dCcy] || 1);
  const sym = (typeof CURRENCY_SYMBOLS !== 'undefined' && CURRENCY_SYMBOLS[dCcy]) || dCcy;
  const conv = (myr) => myr * fxRate;
  const fmtCcy = (v) => `${sym} ${fmt(v, 0)}`;

  const T = { px_g:0, px_n:0, px_f:0, pp_g:0, pp_n:0, pp_f:0, st_g:0, st_n:0, st_f:0, xd_g:0, xd_n:0, xd_f:0, ss_n:0, payment:0, dbt:0 };
  const rows = results.map(r => {
    T.px_g += r.gw_payex || 0; T.px_f += r.fee_payex || 0;
    T.pp_g += r.gw_paypal_gross || 0; T.pp_n += r.gw_paypal_net || 0; T.pp_f += r.fee_paypal || 0;
    T.st_g += r.gw_stripe_gross || 0; T.st_n += r.gw_stripe_net || 0; T.st_f += r.fee_stripe || 0;
    T.xd_g += r.gw_xendit_gross || 0; T.xd_n += r.gw_xendit_net || 0; T.xd_f += r.fee_xendit || 0;
    T.ss_n += r.gw_settlement_net || 0; T.payment += r.payment || 0; T.dbt += r.dbt || 0;
    return r;
  });

  main.innerHTML = `
    <div class="section-header"><h2>Payments &amp; Gateway Fees</h2>
      <p class="section-desc grey" style="margin:4px 0 0 0">Per-territory fee breakdown across Payex / PayPal / Stripe / Xendit. All values match accountant Reco (2).</p></div>
    <div class="kpi-strip">
      <div class="kpi-card"><div class="kpi-label">Total Payment</div><div class="kpi-value green">${fmtCcy(conv(T.payment))}</div><div class="kpi-sub">all gateways</div></div>
      <div class="kpi-card"><div class="kpi-label">Total DBT</div><div class="kpi-value">${fmtCcy(conv(T.dbt))}</div><div class="kpi-sub">direct bank transfer</div></div>
      <div class="kpi-card"><div class="kpi-label">Settled Net</div><div class="kpi-value green">${fmtCcy(conv(T.ss_n))}</div><div class="kpi-sub">Payex settlement</div></div>
      <div class="kpi-card"><div class="kpi-label">Total Fees</div><div class="kpi-value red">${fmtCcy(conv(T.px_f+T.pp_f+T.st_f+T.xd_f))}</div></div>
    </div>
    <!-- Charts row -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:20px">
      <div class="card" style="padding:16px">
        <h3 style="margin:0 0 12px;font-size:13px;color:var(--t-muted)">GATEWAY GROSS COLLECTION BY TERRITORY (${dCcy})</h3>
        <canvas id="chart-gw-terr" height="220"></canvas>
      </div>
      <div class="card" style="padding:16px">
        <h3 style="margin:0 0 12px;font-size:13px;color:var(--t-muted)">FEE BREAKDOWN BY GATEWAY</h3>
        <canvas id="chart-fee-split" height="220"></canvas>
      </div>
    </div>
    <div class="section-header" style="margin-top:24px"><h3>Gateway Fees by Territory</h3></div>
    <div class="table-wrap"><table class="data-table" style="font-size:11px">
      <thead><tr><th>Territory</th>
        <th colspan="2" style="text-align:center">Payex</th>
        <th colspan="3" style="text-align:center">PayPal</th>
        <th colspan="3" style="text-align:center">Stripe</th>
        <th colspan="3" style="text-align:center">Xendit</th>
        <th class="num">Total Fees</th></tr>
        <tr><th></th>
          <th class="num">Net</th><th class="num">MDR</th>
          <th class="num">Gross</th><th class="num">Net</th><th class="num">Fee</th>
          <th class="num">Gross</th><th class="num">Net</th><th class="num">Fee</th>
          <th class="num">Gross</th><th class="num">Net</th><th class="num">Fee</th>
          <th></th></tr></thead>
      <tbody>${rows.sort((a,b)=>b.net-a.net).map(r=>{const total_fee=(r.fee_payex||0)+(r.fee_paypal||0)+(r.fee_stripe||0)+(r.fee_xendit||0); return `<tr>
        <td><strong>${TERRITORY_FLAGS[r.territory]||''} ${r.territory}</strong></td>
        <td class="num">${fmtCcy(conv(r.gw_payex||0))}</td>
        <td class="num red">${fmtCcy(conv(r.fee_payex||0))}</td>
        <td class="num">${fmtCcy(conv(r.gw_paypal_gross||0))}</td>
        <td class="num">${fmtCcy(conv(r.gw_paypal_net||0))}</td>
        <td class="num red">${fmtCcy(conv(r.fee_paypal||0))}</td>
        <td class="num">${fmtCcy(conv(r.gw_stripe_gross||0))}</td>
        <td class="num">${fmtCcy(conv(r.gw_stripe_net||0))}</td>
        <td class="num red">${fmtCcy(conv(r.fee_stripe||0))}</td>
        <td class="num">${fmtCcy(conv(r.gw_xendit_gross||0))}</td>
        <td class="num">${fmtCcy(conv(r.gw_xendit_net||0))}</td>
        <td class="num red">${fmtCcy(conv(r.fee_xendit||0))}</td>
        <td class="num red"><strong>${fmtCcy(conv(total_fee))}</strong></td>
      </tr>`}).join('')}
      <tr style="background:rgba(31,78,121,.08);font-weight:600;border-top:2px solid var(--accent)">
        <td>TOTAL</td>
        <td class="num">${fmtCcy(conv(T.px_g))}</td><td class="num red">${fmtCcy(conv(T.px_f))}</td>
        <td class="num">${fmtCcy(conv(T.pp_g))}</td><td class="num">${fmtCcy(conv(T.pp_n))}</td><td class="num red">${fmtCcy(conv(T.pp_f))}</td>
        <td class="num">${fmtCcy(conv(T.st_g))}</td><td class="num">${fmtCcy(conv(T.st_n))}</td><td class="num red">${fmtCcy(conv(T.st_f))}</td>
        <td class="num">${fmtCcy(conv(T.xd_g))}</td><td class="num">${fmtCcy(conv(T.xd_n))}</td><td class="num red">${fmtCcy(conv(T.xd_f))}</td>
        <td class="num red">${fmtCcy(conv(T.px_f+T.pp_f+T.st_f+T.xd_f))}</td>
      </tr></tbody>
    </table></div>
  `;

  setTimeout(() => {
    if (typeof Chart === 'undefined') return;
    const sorted2 = [...results].sort((a,b) => (b.payment||0)-(a.payment||0));

    // Chart 1: Stacked bar — gateway gross by territory
    const ctx1 = document.getElementById('chart-gw-terr');
    if (ctx1) {
      new Chart(ctx1, {
        type: 'bar',
        data: {
          labels: sorted2.map(r => r.territory),
          datasets: [
            { label: 'Payex',  data: sorted2.map(r => Math.round(conv(r.gw_payex||0))),        backgroundColor: '#2E75B6CC', borderRadius: 2 },
            { label: 'PayPal', data: sorted2.map(r => Math.round(conv(r.gw_paypal_gross||0))), backgroundColor: '#70AD47CC', borderRadius: 2 },
            { label: 'Stripe', data: sorted2.map(r => Math.round(conv(r.gw_stripe_gross||0))), backgroundColor: '#ED7D31CC', borderRadius: 2 },
            { label: 'Xendit', data: sorted2.map(r => Math.round(conv(r.gw_xendit_gross||0))), backgroundColor: '#FFC000CC', borderRadius: 2 },
          ]
        },
        options: {
          responsive: true, plugins: { legend: { position: 'top', labels: { font: { size:10 } } },
            tooltip: { callbacks: { label: c => `${c.dataset.label}: ${sym} ${fmt(c.raw,0)}` } } },
          scales: { x: { stacked: true, ticks: { font: { size:9 } } }, y: { stacked: true, ticks: { callback: v => sym+' '+fmt(v,0) } } }
        }
      });
    }

    // Chart 2: Donut — total fees by gateway
    const ctx2 = document.getElementById('chart-fee-split');
    if (ctx2) {
      const fees = [
        { label: 'Payex MDR',  val: T.px_f },
        { label: 'PayPal Fee', val: T.pp_f },
        { label: 'Stripe Fee', val: T.st_f },
        { label: 'Xendit Fee', val: T.xd_f },
      ].filter(e => e.val > 0);
      new Chart(ctx2, {
        type: 'doughnut',
        data: {
          labels: fees.map(e => e.label),
          datasets: [{ data: fees.map(e => Math.round(conv(e.val))),
            backgroundColor: ['#2E75B6','#70AD47','#ED7D31','#FFC000'], borderWidth: 2 }]
        },
        options: { responsive: true, cutout: '65%',
          plugins: { legend: { position: 'right', labels: { font: { size:11 } } },
            tooltip: { callbacks: { label: c => `${c.label}: ${sym} ${fmt(c.raw,0)}` } } } }
      });
    }
  }, 100);
}
