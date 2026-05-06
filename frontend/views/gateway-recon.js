// views/gateway-recon.js — Per-gateway breakdown (Stripe / PayPal / Payex / Xendit)
function renderGatewayRecon(state) {
  const main = document.getElementById('main');
  const results = getFilteredResults(state);
  if (results.length === 0) { main.innerHTML = `<div class="empty-state"><div class="empty-icon">🔁</div><p>No data loaded.</p></div>`; return; }
  const dCcy = state.displayCcy || 'MYR';
  const fxRate = dCcy === 'MYR' ? 1 : (state.fx[dCcy] || 1);
  const sym = (typeof CURRENCY_SYMBOLS !== 'undefined' && CURRENCY_SYMBOLS[dCcy]) || dCcy;
  const conv = (myr) => myr * fxRate;
  const fmtCcy = (v) => `${sym} ${fmt(v, 0)}`;

  // Per-gateway global
  const G = { px: { gross:0, net:0, fee:0 }, pp: { gross:0, net:0, fee:0 },
              st: { gross:0, net:0, fee:0 }, xd: { gross:0, net:0, fee:0 },
              ss: { net:0, mdr:0 } };
  results.forEach(r=>{
    G.px.gross += r.gw_payex || 0; G.px.net += r.gw_payex || 0; G.px.fee += r.fee_payex || 0;
    G.pp.gross += r.gw_paypal_gross || 0; G.pp.net += r.gw_paypal_net || 0; G.pp.fee += r.fee_paypal || 0;
    G.st.gross += r.gw_stripe_gross || 0; G.st.net += r.gw_stripe_net || 0; G.st.fee += r.fee_stripe || 0;
    G.xd.gross += r.gw_xendit_gross || 0; G.xd.net += r.gw_xendit_net || 0; G.xd.fee += r.fee_xendit || 0;
    G.ss.net += r.gw_settlement_net || 0;
  });
  const totalGross = G.px.gross + G.pp.gross + G.st.gross + G.xd.gross;
  const totalFee = G.px.fee + G.pp.fee + G.st.fee + G.xd.fee;
  const totalNet = G.px.net + G.pp.net + G.st.net + G.xd.net - G.px.fee - G.pp.fee - G.st.fee - G.xd.fee;

  function gwCard(label, icon, data) {
    const fee_pct = data.gross > 0 ? data.fee / data.gross * 100 : 0;
    return `<div class="kpi-card" style="text-align:left;padding:16px">
      <div style="font-size:24px;margin-bottom:6px">${icon}</div>
      <div style="font-weight:600;font-size:14px;margin-bottom:8px">${label}</div>
      <div style="font-size:11px;color:var(--t-muted)">Gross</div>
      <div style="font-size:16px;font-weight:600">${fmtCcy(conv(data.gross))}</div>
      <div style="font-size:11px;color:var(--t-muted);margin-top:6px">Fee</div>
      <div style="font-size:13px;color:var(--err)">${fmtCcy(conv(data.fee))} (${fee_pct.toFixed(1)}%)</div>
      <div style="font-size:11px;color:var(--t-muted);margin-top:6px">Net</div>
      <div style="font-size:14px;color:var(--ok);font-weight:500">${fmtCcy(conv(data.net))}</div>
    </div>`;
  }

  main.innerHTML = `
    <div class="section-header"><h2>Gateway Reconciliation</h2>
      <p class="section-desc grey" style="margin:4px 0 0 0">Per-gateway breakdown · gross collected, fees, net to merchant. All values match accountant Reco (2).</p></div>
    <div class="kpi-strip">
      ${gwCard('Payex (transactions)', '💳', G.px)}
      ${gwCard('PayPal', '🌐', G.pp)}
      ${gwCard('Stripe', '💸', G.st)}
      ${gwCard('Xendit', '🇮🇩', G.xd)}
      <div class="kpi-card"><div class="kpi-label">All Gateways Gross</div><div class="kpi-value">${fmtCcy(conv(totalGross))}</div></div>
      <div class="kpi-card"><div class="kpi-label">Total Fees</div><div class="kpi-value red">${fmtCcy(conv(totalFee))}</div><div class="kpi-sub">${(totalFee/totalGross*100).toFixed(2)}% blended</div></div>
    </div>

    <div class="section-header" style="margin-top:24px"><h3>Per-Territory · Per-Gateway</h3></div>
    <div class="table-wrap"><table class="data-table" style="font-size:11px">
      <thead><tr><th>Territory</th>
        <th class="num">Payex Gross</th><th class="num">Payex Net</th>
        <th class="num">PayPal Gross</th><th class="num">PayPal Net</th>
        <th class="num">Stripe Gross</th><th class="num">Stripe Net</th>
        <th class="num">Xendit Gross</th><th class="num">Xendit Net</th>
        <th class="num">Settle Net</th>
      </tr></thead>
      <tbody>${results.sort((a,b)=>b.net-a.net).map(r=>`<tr>
        <td><strong>${TERRITORY_FLAGS[r.territory]||''} ${r.territory}</strong></td>
        <td class="num">${fmtCcy(conv(r.gw_payex||0))}</td>
        <td class="num">${fmtCcy(conv((r.gw_payex||0) - (r.fee_payex||0)))}</td>
        <td class="num">${fmtCcy(conv(r.gw_paypal_gross||0))}</td>
        <td class="num">${fmtCcy(conv(r.gw_paypal_net||0))}</td>
        <td class="num">${fmtCcy(conv(r.gw_stripe_gross||0))}</td>
        <td class="num">${fmtCcy(conv(r.gw_stripe_net||0))}</td>
        <td class="num">${fmtCcy(conv(r.gw_xendit_gross||0))}</td>
        <td class="num">${fmtCcy(conv(r.gw_xendit_net||0))}</td>
        <td class="num green">${fmtCcy(conv(r.gw_settlement_net||0))}</td>
      </tr>`).join('')}
      <tr style="background:rgba(31,78,121,.08);font-weight:600;border-top:2px solid var(--accent)">
        <td>TOTAL</td>
        <td class="num">${fmtCcy(conv(G.px.gross))}</td>
        <td class="num">${fmtCcy(conv(G.px.gross - G.px.fee))}</td>
        <td class="num">${fmtCcy(conv(G.pp.gross))}</td>
        <td class="num">${fmtCcy(conv(G.pp.net))}</td>
        <td class="num">${fmtCcy(conv(G.st.gross))}</td>
        <td class="num">${fmtCcy(conv(G.st.net))}</td>
        <td class="num">${fmtCcy(conv(G.xd.gross))}</td>
        <td class="num">${fmtCcy(conv(G.xd.net))}</td>
        <td class="num green">${fmtCcy(conv(G.ss.net))}</td>
      </tr></tbody>
    </table></div>
  `;

  setTimeout(() => {
    if (typeof Chart === 'undefined') return;
    const sorted4 = [...results].sort((a,b) => ((b.gw_payex||0)+(b.gw_paypal_gross||0)+(b.gw_stripe_gross||0)+(b.gw_xendit_gross||0)) - ((a.gw_payex||0)+(a.gw_paypal_gross||0)+(a.gw_stripe_gross||0)+(a.gw_xendit_gross||0)));

    // Insert chart before table (dynamically add canvas)
    const chartDiv = document.createElement('div');
    chartDiv.style.cssText = 'display:grid;grid-template-columns:3fr 2fr;gap:20px;margin-bottom:20px';
    chartDiv.innerHTML = `
      <div class="card" style="padding:16px">
        <h3 style="margin:0 0 12px;font-size:13px;color:var(--t-muted)">GATEWAY GROSS BY TERRITORY (${dCcy})</h3>
        <canvas id="chart-gwr-terr" height="220"></canvas>
      </div>
      <div class="card" style="padding:16px">
        <h3 style="margin:0 0 12px;font-size:13px;color:var(--t-muted)">FEE RATE BY GATEWAY</h3>
        <canvas id="chart-gwr-rate" height="220"></canvas>
      </div>`;
    const tableWrap = document.querySelector('.table-wrap');
    if (tableWrap) tableWrap.parentNode.insertBefore(chartDiv, tableWrap);

    const ctx1 = document.getElementById('chart-gwr-terr');
    if (ctx1) {
      new Chart(ctx1, {
        type: 'bar',
        data: {
          labels: sorted4.map(r => r.territory),
          datasets: [
            { label: 'Payex',  data: sorted4.map(r => Math.round(conv(r.gw_payex||0))),         backgroundColor: '#2E75B6CC', borderRadius: 2 },
            { label: 'PayPal', data: sorted4.map(r => Math.round(conv(r.gw_paypal_gross||0))),  backgroundColor: '#70AD47CC', borderRadius: 2 },
            { label: 'Stripe', data: sorted4.map(r => Math.round(conv(r.gw_stripe_gross||0))),  backgroundColor: '#ED7D31CC', borderRadius: 2 },
            { label: 'Xendit', data: sorted4.map(r => Math.round(conv(r.gw_xendit_gross||0))),  backgroundColor: '#FFC000CC', borderRadius: 2 },
          ]
        },
        options: {
          responsive: true, plugins: { legend:{position:'top',labels:{font:{size:10}}},
            tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${sym} ${fmt(c.raw,0)}`}} },
          scales: { x:{stacked:true,ticks:{font:{size:9}}}, y:{stacked:true,ticks:{callback:v=>sym+' '+fmt(v,0)}} }
        }
      });
    }

    const ctx2 = document.getElementById('chart-gwr-rate');
    if (ctx2) {
      const gws = [
        { label: 'Payex', gross: G.px.gross, fee: G.px.fee },
        { label: 'PayPal', gross: G.pp.gross, fee: G.pp.fee },
        { label: 'Stripe', gross: G.st.gross, fee: G.st.fee },
        { label: 'Xendit', gross: G.xd.gross, fee: G.xd.fee },
      ].filter(g => g.gross > 0);
      new Chart(ctx2, {
        type: 'bar',
        data: {
          labels: gws.map(g => g.label),
          datasets: [
            { label: 'Net (after fees)', data: gws.map(g => Math.round(conv(g.gross - g.fee))), backgroundColor: '#2E75B6CC', borderRadius: 4 },
            { label: 'Fee',             data: gws.map(g => Math.round(conv(g.fee))),            backgroundColor: '#C00000CC', borderRadius: 4 },
          ]
        },
        options: {
          responsive: true, plugins: { legend:{position:'top',labels:{font:{size:10}}},
            tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${sym} ${fmt(c.raw,0)}`}} },
          scales: { x:{stacked:true}, y:{stacked:true,ticks:{callback:v=>sym+' '+fmt(v,0)}} }
        }
      });
    }
  }, 100);
}
