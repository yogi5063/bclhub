// parsers/latam.js
function parseLatam(wb) {
  const r = emptyResult('Latam', 'Cure', 'USD', 38901.48144, 46897.18);

  let combined = { gross: 0, shipping: 0, refund: 0 };
  const allDaily = {};
  const allProducts = {};
  let totalOrders = 0;

  // ── USD SHEET ──
  const usdName = getSheet(wb, 'usd');
  if (usdName) {
    const rows = sheetToArray(wb, usdName);
    if (rows && rows.length > 1) {
      const hdr = rows[0];
      const amtI  = findCol(hdr, ['amount']);
      const shipI = findCol(hdr, ['shipping']);
      const refI  = findCol(hdr, ['refund amount']);
      const dateI = findCol(hdr, ['payment date', 'date']);
      const nameI = findCol(hdr, ['name']);

      for (const row of rows.slice(1)) {
        const d = parseDate(row[dateI !== -1 ? dateI : 0]);
        if (!d || isNaN(d.getTime())) continue;
        const yr = d.getFullYear();
        if (yr < 2020 || yr > 2030) continue;

        combined.gross    += n(row[amtI]);
        combined.shipping += n(row[shipI]);
        combined.refund   += n(row[refI]);
        totalOrders++;

        const dk = dateKey(d);
        if (dk) {
          if (!allDaily[dk]) allDaily[dk] = { orders: 0, revenue: 0 };
          allDaily[dk].orders++;
          allDaily[dk].revenue += n(row[amtI]);
        }

        const prod = String(row[nameI] || '').trim();
        if (prod) {
          if (!allProducts[prod]) allProducts[prod] = { orders: 0, revenue: 0 };
          allProducts[prod].orders++;
          allProducts[prod].revenue += n(row[amtI]);
        }
      }
    }
  }

  // ── MXN SHEET → Read USD-converted values from last conversion rows ──
  const mxnName = getSheet(wb, 'mxn');
  if (mxnName) {
    const rows = sheetToArray(wb, mxnName);
    if (rows && rows.length > 1) {
      // Look for USD conversion row at bottom
      let mxnFxRate = 0;
      for (let i = rows.length - 1; i >= Math.max(0, rows.length - 5); i--) {
        const row = rows[i];
        if (!row) continue;
        const label = String(row[3] || row[0] || '').toLowerCase();
        if (label === 'usd' || label.includes('usd')) {
          // This row has amounts already converted to USD
          const amtI  = findCol(rows[0], ['amount']);
          const shipI = findCol(rows[0], ['shipping']);
          const refI  = findCol(rows[0], ['refund amount']);
          combined.gross    += n(row[amtI] || row[6]);
          combined.shipping += n(row[shipI] || row[8]);
          combined.refund   += n(row[refI] || row[9]);
          break;
        }
      }

      // Also count MXN orders from dated rows
      const hdr = rows[0];
      const dateI = findCol(hdr, ['payment date', 'date']);
      for (const row of rows.slice(1)) {
        const d = parseDate(row[dateI !== -1 ? dateI : 0]);
        if (!d || isNaN(d.getTime())) continue;
        const yr = d.getFullYear();
        if (yr < 2020 || yr > 2030) continue;
        totalOrders++;
      }
    }
  }

  r.gross    = combined.gross;
  r.shipping = combined.shipping;
  r.refund_auto = combined.refund;
  r.orders   = totalOrders;
  r.daily    = allDaily;
  r.products = Object.entries(allProducts).map(([name, d]) => ({ name, ...d, aov: d.orders > 0 ? d.revenue / d.orders : 0 })).sort((a, b) => b.revenue - a.revenue);

  // Chargebacks
  const cbName = getSheet(wb, 'chargeback');
  if (cbName) {
    const rows = sheetToArray(wb, cbName);
    if (rows && rows.length > 1) {
      const hdr = rows[0];
      const amtI    = findCol(hdr, ['amount']);
      const statusI = findCol(hdr, ['status']);
      for (const row of rows.slice(1)) {
        if (!row[0]) continue;
        const status = String(row[statusI] || '').toLowerCase();
        if (status.includes('settled') || status.includes('chargeback')) {
          r.chargeback += Math.abs(n(row[amtI]));
        }
      }
    }
  }

  const paypal = parsePayPal(wb);
  r.fee_paypal = paypal.fee;

  const { fee_local, fee_myr, fx_rate, fx_loss } = getPayexFee(wb);
  r.fee_payex      = fee_local + (fx_loss || 0);
  r.fx_rate_to_myr = fx_rate || 0.2537;

  r.ar = parseAR(wb);
  r.platforms = [{ name: 'Wix', gross: r.gross, net: 0, orders: r.orders }];
  finalise(r);
  r.platforms[0].net = r.net;
  return r;
}
