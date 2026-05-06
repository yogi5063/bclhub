// views/leakage.js — Revenue leakage by territory
function renderLeakage(state) {
  const main = document.getElementById('main');
  const results = getFilteredResults(state);
  if (results.length === 0) { main.innerHTML = `<div class="empty-state"><div class="empty-icon">📉</div><p>No data loaded.</p></div>`; return; }
  const dCcy = state.displayCcy || 'MYR';
  const fxRate = dCcy === 'MYR' ? 1 : (state.fx[dCcy] || 1);
  const sym = (typeof CURRENCY_SYMBOLS !== 'undefined' && CURRENCY_SYMBOLS[dCcy]) || dCcy;
  const conv = (myr) => myr * fxRate;
  const fmtCcy = (v) => `${sym} ${fmt(v, 0)}`;

  const rows = results.map(r => {
    const refunds = r.refund_total || 0;
    const fees = r.fee_total || 0;
    const tax = r.tax || 0;
    const total_leak = refunds + fees + tax;
    const leak_pct = (r.gross || 0) > 0 ? total_leak / r.gross * 100 : 0;
    return {
      territory: r.territory, brand: r.brand,
      gross: r.gross || 0, refunds, tax, fees, net: r.net || 0,
      fee_payex: r.fee_payex || 0, fee_paypal: r.fee_paypal || 0,
      fee_stripe: r.fee_stripe || 0, fee_xendit: r.fee_xendit || 0,
      total_leak, leak_pct,
    };
  }).sort((a,b)=>b.leak_pct - a.leak_pct);

  const T = rows.reduce((acc, r) => {
    acc.gross += r.gross; acc.net += r.net; acc.refunds += r.refunds;
    acc.tax += r.tax; acc.fees += r.fees; acc.total_leak += r.total_leak;
    return acc;
  }, { gross:0, net:0, refunds:0, tax:0, fees:0, total_leak:0 });
  const T_pct = T.gross > 0 ? T.total_leak / T.gross * 100 : 0;

  main.innerHTML = `
    <div class="section-header"><h2>Revenue Leakage</h2>
      <p class="section-desc grey" style="margin:4px 0 0 0">Total deductions (refunds + fees + tax) as % of gross. Higher = more leakage. Leakage % is the cost of doing business in each territory.</p></div>
    <div class="kpi-strip">
      <div class="kpi-card"><div class="kpi-label">Total Gross</div><div class="kpi-value">${fmtCcy(conv(T.gross))}</div></div>
      <div class="kpi-card"><div class="kpi-label">Refunds</div><div class="kpi-value red">${fmtCcy(conv(T.refunds))}</div><div class="kpi-sub">${T.gross>0?(T.refunds/T.gross*100).toFixed(1):0}%</div></div>
      <div class="kpi-card"><div class="kpi-label">Gateway Fees</div><div class="kpi-value red">${fmtCcy(conv(T.fees))}</div><div class="kpi-sub">${T.gross>0?(T.fees/T.gross*100).toFixed(1):0}%</div></div>
      <div class="kpi-card"><div class="kpi-label">Tax</div><div class="kpi-value red">${fmtCcy(conv(T.tax))}</div></div>
      <div class="kpi-card"><div class="kpi-label">Total Leakage</div><div class="kpi-value ${T_pct>10?'red':'amber'}">${T_pct.toFixed(1)}%</div><div class="kpi-sub">${fmtCcy(conv(T.total_leak))}</div></div>
      <div class="kpi-card"><div class="kpi-label">Net Revenue</div><div class="kpi-value green">${fmtCcy(conv(T.net))}</div></div>
    </div>
    <!-- Leakage Charts -->
    <div style="display:grid;grid-template-columns:3fr 2fr;gap:20px;margin-top:20px">
      <div class="card" style="padding:16px">
        <h3 style="margin:0 0 12px;font-size:13px;color:var(--t-muted)">LEAKAGE BREAKDOWN BY TERRITORY (%)</h3>
        <canvas id="chart-leakage-pct" height="220"></canvas>
      </div>
      <div class="card" style="padding:16px">
        <h3 style="margin:0 0 12px;font-size:13px;color:var(--t-muted)">LEAKAGE COMPOSITION</h3>
        <canvas id="chart-leakage-pie" height="220"></canvas>
      </div>
    </div>
    <div class="section-header" style="margin-top:24px"><h3>By Territory · highest leakage first</h3></div>
    <div class="table-wrap"><table class="data-table" style="font-size:12px">
      <thead><tr><th>Territory</th><th class="num">Gross</th><th class="num">Refunds</th><th class="num">Tax</th><th class="num">Payex Fee</th><th class="num">PayPal Fee</th><th class="num">Stripe Fee</th><th class="num">Xendit Fee</th><th class="num">Total Fees</th><th class="num">Total Leak</th><th class="num">Leak %</th><th class="num">Net</th></tr></thead>
      <tbody>${rows.map(r=>`<tr>
        <td><strong>${TERRITORY_FLAGS[r.territory]||''} ${r.territory}</strong></td>
        <td class="num">${fmtCcy(conv(r.gross))}</td>
        <td class="num red">${fmtCcy(conv(r.refunds))}</td>
        <td class="num red">${fmtCcy(conv(r.tax))}</td>
        <td class="num red">${fmtCcy(conv(r.fee_payex))}</td>
        <td class="num red">${fmtCcy(conv(r.fee_paypal))}</td>
        <td class="num red">${fmtCcy(conv(r.fee_stripe))}</td>
        <td class="num red">${fmtCcy(conv(r.fee_xendit))}</td>
        <td class="num red">${fmtCcy(conv(r.fees))}</td>
        <td class="num red"><strong>${fmtCcy(conv(r.total_leak))}</strong></td>
        <td class="num ${r.leak_pct>10?'red':r.leak_pct>5?'amber':'green'}">${r.leak_pct.toFixed(1)}%</td>
        <td class="num green">${fmtCcy(conv(r.net))}</td>
      </tr>`).join('')}
      <tr style="background:rgba(31,78,121,.08);font-weight:600;border-top:2px solid var(--accent)">
        <td>TOTAL</td>
        <td class="num">${fmtCcy(conv(T.gross))}</td>
        <td class="num red">${fmtCcy(conv(T.refunds))}</td>
        <td class="num red">${fmtCcy(conv(T.tax))}</td>
        <td class="num red" colspan="4">${fmtCcy(conv(T.fees))}</td>
        <td></td>
        <td class="num red">${fmtCcy(conv(T.total_leak))}</td>
        <td class="num">${T_pct.toFixed(1)}%</td>
        <td class="num green">${fmtCcy(conv(T.net))}</td>
      </tr></tbody>
    </table></div>
  `;

  setTimeout(() => {
    if (typeof Chart === 'undefined') return;

    // Chart 1: Leakage % stacked bar by territory
    const ctx1 = document.getElementById('chart-leakage-pct');
    if (ctx1) {
      new Chart(ctx1, {
        type: 'bar',
        data: {
          labels: rows.map(r => r.territory),
          datasets: [
            { label: 'Refunds %', data: rows.map(r => r.gross > 0 ? +(r.refunds/r.gross*100).toFixed(1) : 0), backgroundColor: '#C00000CC', borderRadius: 2 },
            { label: 'Fees %',    data: rows.map(r => r.gross > 0 ? +(r.fees/r.gross*100).toFixed(1) : 0),    backgroundColor: '#ED7D31CC', borderRadius: 2 },
            { label: 'Tax %',     data: rows.map(r => r.gross > 0 ? +(r.tax/r.gross*100).toFixed(1) : 0),     backgroundColor: '#FFC000CC', borderRadius: 2 },
          ]
        },
        options: {
          responsive: true, plugins: {legend:{position:'top',labels:{font:{size:10}}},
            tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${c.raw}%`}}},
          scales:{x:{stacked:true,ticks:{font:{size:9}}},y:{stacked:true,ticks:{callback:v=>v+'%'},suggestedMax:30}}
        }
      });
    }

    // Chart 2: Pie — leakage by component (total)
    const ctx2 = document.getElementById('chart-leakage-pie');
    if (ctx2) {
      new Chart(ctx2, {
        type: 'doughnut',
        data: {
          labels: ['Refunds', 'Gateway Fees', 'Tax'],
          datasets: [{ data: [Math.round(conv(T.refunds)), Math.round(conv(T.fees)), Math.round(conv(T.tax))],
            backgroundColor: ['#C00000','#ED7D31','#FFC000'], borderWidth: 2 }]
        },
        options: {
          responsive: true, cutout: '60%',
          plugins: { legend: { position:'right', labels:{font:{size:11}} },
            tooltip: { callbacks: { label: c => `${c.label}: ${sym} ${fmt(c.raw,0)}` } } }
        }
      });
    }
  }, 100);
}
