// views/overview.js — KPIs + per-territory bar chart + waterfall + territory table
function renderOverview(state) {
  const main = document.getElementById('main');
  const results = getFilteredResults(state);
  if (results.length === 0) { main.innerHTML = `<div class="empty-state"><div class="empty-icon">📊</div><p>No data loaded.</p></div>`; return; }
  const dCcy = state.displayCcy || 'MYR';
  const fxRate = dCcy === 'MYR' ? 1 : (state.fx[dCcy] || 1);
  const sym = (typeof CURRENCY_SYMBOLS !== 'undefined' && CURRENCY_SYMBOLS[dCcy]) || dCcy;
  const conv = (myr) => myr * fxRate;
  const fmtCcy = (v, d=0) => `${sym} ${fmt(v, d)}`;

  const T = results.reduce((acc, r) => {
    acc.gross += r.gross || 0; acc.net += r.net || 0;
    acc.shipping += r.shipping || 0; acc.refunds += r.refund_total || 0;
    acc.tax += r.tax || 0; acc.fees += r.fee_total || 0;
    acc.orders += r.orders || 0;
    acc.gp += (r.net || 0) - (r.fee_total || 0);
    return acc;
  }, { gross:0, net:0, shipping:0, refunds:0, tax:0, fees:0, orders:0, gp:0 });
  const aov = T.orders > 0 ? T.gross / T.orders : 0;
  const margin = T.gross > 0 ? (T.net / T.gross * 100) : 0;
  const refund_pct  = T.gross > 0 ? (T.refunds / T.gross * 100) : 0;
  const fee_pct     = T.gross > 0 ? (T.fees / T.gross * 100) : 0;
  const gp_pct      = T.gross > 0 ? (T.gp / T.gross * 100) : 0;
  const cogs_total  = results.reduce((s,r) => s + (r.cogs||0), 0);
  const cogs_pct    = T.gross > 0 ? (cogs_total / T.gross * 100) : 0;
  const discount_total = results.reduce((s,r) => s + (r.discount||0), 0);
  const disc_pct    = T.gross > 0 ? (discount_total / T.gross * 100) : 0;
  const shipping_total = results.reduce((s,r) => s + (r.shipping||0), 0);
  const ship_pct    = T.gross > 0 ? (shipping_total / T.gross * 100) : 0;

  const sorted = [...results].sort((a,b) => b.net - a.net);
  const colors = ['#2E75B6','#375623','#C00000','#833C00','#375623','#1F4E79',
                  '#7030A0','#70AD47','#ED7D31','#4472C4','#FFC000','#FF0000','#00B0F0','#00B050'];

  main.innerHTML = `
    <div class="section-header"><h2>Overview · ${state.period || 'March 2026'}</h2>
      <p class="section-desc grey">All figures in ${dCcy}. ${results.length} territories.</p></div>

    <!-- Data Source Toggle -->
    <div id="source-toggle-container"></div>

    <!-- AI Overview Intelligence Panel -->
    <div id="insights-overview"></div>

    <!-- Row 1: Revenue KPIs -->
    <div class="kpi-strip">
      <div class="kpi-card"><div class="kpi-label">Gross Revenue</div><div class="kpi-value">${fmtCcy(conv(T.gross))}</div><div class="kpi-sub">100% baseline</div></div>
      <div class="kpi-card"><div class="kpi-label">Shipping Revenue</div><div class="kpi-value">${fmtCcy(conv(shipping_total))}</div><div class="kpi-sub">${ship_pct.toFixed(1)}% of gross</div></div>
      <div class="kpi-card"><div class="kpi-label">Refunds</div><div class="kpi-value red">${fmtCcy(conv(T.refunds))}</div><div class="kpi-sub">${refund_pct.toFixed(2)}% of gross</div></div>
      <div class="kpi-card"><div class="kpi-label">Discounts</div><div class="kpi-value red">${fmtCcy(conv(discount_total))}</div><div class="kpi-sub">${disc_pct.toFixed(2)}% of gross</div></div>
      <div class="kpi-card"><div class="kpi-label">Net Revenue</div><div class="kpi-value green"><strong>${fmtCcy(conv(T.net))}</strong></div><div class="kpi-sub">${margin.toFixed(1)}% of gross</div></div>
      <div class="kpi-card"><div class="kpi-label">Gateway Fees</div><div class="kpi-value red">${fmtCcy(conv(T.fees))}</div><div class="kpi-sub">${fee_pct.toFixed(2)}% of gross</div></div>
      <div class="kpi-card"><div class="kpi-label">COGS</div><div class="kpi-value red">${fmtCcy(conv(cogs_total))}</div><div class="kpi-sub">${cogs_pct.toFixed(2)}% of gross</div></div>
      <div class="kpi-card"><div class="kpi-label">Gross Profit</div><div class="kpi-value ${T.gp>=0?'green':'red'}"><strong>${fmtCcy(conv(T.gp))}</strong></div><div class="kpi-sub">${gp_pct.toFixed(1)}% of gross</div></div>
    </div>
    <!-- Row 2: Operational KPIs -->
    <div class="kpi-strip" style="margin-top:10px">
      <div class="kpi-card"><div class="kpi-label">Total Orders</div><div class="kpi-value">${T.orders.toLocaleString()}</div><div class="kpi-sub">14 territories</div></div>
      <div class="kpi-card"><div class="kpi-label">Avg Order Value</div><div class="kpi-value">${fmtCcy(conv(aov))}</div><div class="kpi-sub">gross / orders</div></div>
      <div class="kpi-card"><div class="kpi-label">Net Margin</div><div class="kpi-value ${margin>=90?'green':margin>=70?'amber':'red'}">${margin.toFixed(1)}%</div><div class="kpi-sub">net / gross</div></div>
      <div class="kpi-card"><div class="kpi-label">Refund Rate</div><div class="kpi-value ${refund_pct<2?'green':refund_pct<5?'amber':'red'}">${refund_pct.toFixed(2)}%</div><div class="kpi-sub">target &lt; 2%</div></div>
      <div class="kpi-card"><div class="kpi-label">MDR Rate</div><div class="kpi-value ${fee_pct<8?'green':fee_pct<15?'amber':'red'}">${fee_pct.toFixed(2)}%</div><div class="kpi-sub">fees / gross</div></div>
      <div class="kpi-card"><div class="kpi-label">GP Margin</div><div class="kpi-value ${gp_pct>=80?'green':gp_pct>=60?'amber':'red'}">${gp_pct.toFixed(1)}%</div><div class="kpi-sub">GP / gross</div></div>
      <div class="kpi-card"><div class="kpi-label">Territories</div><div class="kpi-value">${results.length}</div><div class="kpi-sub">${results.filter(r=>r.net>0).length} active</div></div>
      <div class="kpi-card"><div class="kpi-label">Entities</div><div class="kpi-value">8</div><div class="kpi-sub">9 bank accounts</div></div>
    </div>

    <!-- Charts row -->
    <div style="display:grid;grid-template-columns:2fr 1fr;gap:20px;margin-top:24px">
      <!-- Bar chart: Net Revenue by Territory -->
      <div class="card" style="padding:16px">
        <h3 style="margin:0 0 12px;font-size:14px;color:var(--t-muted)">NET REVENUE BY TERRITORY (${dCcy})</h3>
        <canvas id="chart-by-terr" height="200"></canvas>
      </div>
      <!-- Waterfall: Revenue Breakdown -->
      <div class="card" style="padding:16px">
        <h3 style="margin:0 0 12px;font-size:14px;color:var(--t-muted)">REVENUE WATERFALL</h3>
        <canvas id="chart-waterfall" height="200"></canvas>
      </div>
    </div>

    <!-- Pie + Margin row -->
    <div style="display:grid;grid-template-columns:1fr 2fr;gap:20px;margin-top:16px">
      <!-- Gateway split pie -->
      <div class="card" style="padding:16px">
        <h3 style="margin:0 0 12px;font-size:14px;color:var(--t-muted)">GATEWAY MIX</h3>
        <canvas id="chart-gateway" height="200"></canvas>
      </div>
      <!-- Margin % horizontal bars -->
      <div class="card" style="padding:16px">
        <h3 style="margin:0 0 12px;font-size:14px;color:var(--t-muted)">NET MARGIN % BY TERRITORY</h3>
        <canvas id="chart-margin" height="200"></canvas>
      </div>
    </div>

    <div class="section-header" style="margin-top:24px"><h3>Territory Summary</h3></div>
    <div class="table-wrap"><table class="data-table" style="font-size:12px">
      <thead><tr><th>Territory</th><th>Brand</th><th>Native</th><th class="num">Gross</th><th class="num">Refunds</th><th class="num">Net</th><th class="num">Fees</th><th class="num">Gross Profit</th><th class="num">Orders</th><th class="num">AOV</th><th class="num">Margin %</th></tr></thead>
      <tbody>${sorted.map(r=>{const gp=(r.net||0)-(r.fee_total||0); const margin=r.gross>0?r.net/r.gross*100:0;return `<tr>
        <td><strong>${TERRITORY_FLAGS[r.territory]||''} ${r.territory}</strong></td>
        <td><span class="brand-pill brand-${(r.brand||'').toLowerCase()}">${r.brand||''}</span></td>
        <td><span class="grey">${r.local_currency||r.currency||''}</span></td>
        <td class="num">${fmtCcy(conv(r.gross||0))}</td>
        <td class="num red">${fmtCcy(conv(r.refund_total||0))}</td>
        <td class="num green"><strong>${fmtCcy(conv(r.net||0))}</strong></td>
        <td class="num red">${fmtCcy(conv(r.fee_total||0))}</td>
        <td class="num ${gp>=0?'green':'red'}">${fmtCcy(conv(gp))}</td>
        <td class="num">${(r.orders||0).toLocaleString()}</td>
        <td class="num">${fmtCcy(conv(r.aov||0))}</td>
        <td class="num">${margin.toFixed(1)}%</td>
      </tr>`}).join('')}
      <tr style="background:rgba(31,78,121,.08);font-weight:600;border-top:2px solid var(--accent)">
        <td>TOTAL</td><td></td><td></td>
        <td class="num">${fmtCcy(conv(T.gross))}</td>
        <td class="num red">${fmtCcy(conv(T.refunds))}</td>
        <td class="num green">${fmtCcy(conv(T.net))}</td>
        <td class="num red">${fmtCcy(conv(T.fees))}</td>
        <td class="num ${T.gp>=0?'green':'red'}">${fmtCcy(conv(T.gp))}</td>
        <td class="num">${T.orders.toLocaleString()}</td>
        <td class="num">${fmtCcy(conv(aov))}</td>
        <td class="num">${margin.toFixed(1)}%</td>
      </tr></tbody>
    </table></div>
  `;

  // ── Chart 1: Net Revenue bar by territory ────────────────────────────────
  setTimeout(() => {
    const ctx1 = document.getElementById('chart-by-terr');
    if (!ctx1 || typeof Chart === 'undefined') return;
    new Chart(ctx1, {
      type: 'bar',
      data: {
        labels: sorted.map(r => r.territory),
        datasets: [{
          label: `Net Revenue (${dCcy})`,
          data: sorted.map(r => Math.round(conv(r.net || 0))),
          backgroundColor: sorted.map((_, i) => colors[i % colors.length] + 'CC'),
          borderColor: sorted.map((_, i) => colors[i % colors.length]),
          borderWidth: 1, borderRadius: 4,
        }]
      },
      options: {
        responsive: true, plugins: { legend: { display: false },
          tooltip: { callbacks: { label: ctx => `${sym} ${fmt(ctx.raw, 0)}` } } },
        scales: { y: { ticks: { callback: v => sym + ' ' + fmt(v, 0) }, grid: { color: '#eee' } },
                  x: { ticks: { font: { size: 10 } } } }
      }
    });

    // ── Chart 2: Revenue waterfall ─────────────────────────────────────────
    const ctx2 = document.getElementById('chart-waterfall');
    if (ctx2) {
      const wf_labels = ['Gross', '− Refunds', '− Fees', '= Net Rev'];
      const wf_vals   = [conv(T.gross), -conv(T.refunds), -conv(T.fees), conv(T.net)];
      const wf_colors = ['#2E75B6', '#C00000', '#ED7D31', '#375623'];
      new Chart(ctx2, {
        type: 'bar',
        data: {
          labels: wf_labels,
          datasets: [{ data: wf_vals.map(Math.round), backgroundColor: wf_colors, borderRadius: 6 }]
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false },
            tooltip: { callbacks: { label: ctx => `${sym} ${fmt(Math.abs(ctx.raw), 0)}` } } },
          scales: { y: { ticks: { callback: v => sym + ' ' + fmt(Math.abs(v), 0) } } }
        }
      });
    }

    // ── Chart 3: Gateway mix pie ───────────────────────────────────────────
    const ctx3 = document.getElementById('chart-gateway');
    if (ctx3) {
      const gw = {
        Payex:  results.reduce((s, r) => s + (r.gw_payex || 0), 0),
        Stripe: results.reduce((s, r) => s + (r.gw_stripe_gross || 0), 0),
        PayPal: results.reduce((s, r) => s + (r.gw_paypal_gross || 0), 0),
        Xendit: results.reduce((s, r) => s + (r.gw_xendit_gross || 0), 0),
      };
      const gwEntries = Object.entries(gw).filter(([, v]) => v > 0);
      new Chart(ctx3, {
        type: 'doughnut',
        data: {
          labels: gwEntries.map(([k]) => k),
          datasets: [{ data: gwEntries.map(([, v]) => Math.round(conv(v))),
            backgroundColor: ['#2E75B6', '#ED7D31', '#70AD47', '#FFC000'],
            borderWidth: 2 }]
        },
        options: {
          responsive: true, cutout: '65%',
          plugins: { legend: { position: 'right', labels: { font: { size: 11 } } },
            tooltip: { callbacks: { label: ctx => `${ctx.label}: ${sym} ${fmt(ctx.raw, 0)}` } } }
        }
      });
    }

    // ── Chart 4: Net Margin % horizontal bar ──────────────────────────────
    const ctx4 = document.getElementById('chart-margin');
    if (ctx4) {
      const marginSorted = [...results].sort((a, b) => {
        const ma = a.gross > 0 ? a.net/a.gross*100 : 0;
        const mb = b.gross > 0 ? b.net/b.gross*100 : 0;
        return mb - ma;
      });
      new Chart(ctx4, {
        type: 'bar',
        data: {
          labels: marginSorted.map(r => r.territory),
          datasets: [{
            label: 'Net Margin %',
            data: marginSorted.map(r => r.gross > 0 ? +(r.net/r.gross*100).toFixed(1) : 0),
            backgroundColor: marginSorted.map(r => {
              const m = r.gross > 0 ? r.net/r.gross*100 : 0;
              return m >= 90 ? '#375623CC' : m >= 70 ? '#70AD47CC' : m >= 50 ? '#FFC000CC' : '#C00000CC';
            }),
            borderRadius: 4,
          }]
        },
        options: {
          indexAxis: 'y', responsive: true,
          plugins: { legend: { display: false },
            tooltip: { callbacks: { label: ctx => ctx.raw.toFixed(1) + '%' } } },
          scales: { x: { max: 105, ticks: { callback: v => v + '%' } } }
        }
      });
    }
  }, 100);

  // ── Source Toggle ────────────────────────────────────────────────────────────
  if (window.renderSourceToggle) {
    const currentSource = state.dataSource || 'system_workbook';
    window.renderSourceToggle('source-toggle-container', currentSource, async (newSource) => {
      // Reload data from new source
      if (window.switchDataSource) window.switchDataSource(newSource);
    });
  }

  // ── AI Insights Panel ────────────────────────────────────────────────────────
  if (window.renderInsightsPanel && state._rawCache) {
    window.renderInsightsPanel('overview', 'insights-overview', state._rawCache, state._prevCache);
  }
}
