// parsers/gcc.js
function parseGCC(wb) {
  const r = emptyResult('GCC', 'Cure', 'AED', 241830.6836, 270522.80);

  const currencies = ['AED', 'USD'];
  let combined = { gross: 0, shipping: 0, refund: 0, discount: 0, orders: 0 };
  const allDaily = {};
  const allProducts = {};

  for (const cur of currencies) {
    const sname = getSheet(wb, cur);
    if (!sname) continue;
    const rows = sheetToArray(wb, sname);
    if (!rows || rows.length < 2) continue;

    // FX rate: USD→AED (Jan 2026: 3.67295)
    let fxRate = 1.0;
    if (cur === 'USD') {
      for (let i = rows.length - 1; i >= Math.max(0, rows.length - 5); i--) {
        const row = rows[i];
        if (!row) continue;
        const label = String(row[3] || row[0] || '').toLowerCase();
        if (label.includes('to aed') || label.includes('aed')) {
          const possibleRate = n(row[6] || row[5]);
          if (possibleRate > 1) { fxRate = possibleRate; break; }
        }
      }
      if (fxRate === 1.0) fxRate = 3.67295;
    }

    const hdr = rows[0];
    const amtI  = findCol(hdr, ['amount']);
    const shipI = findCol(hdr, ['shipping']);
    const refI  = findCol(hdr, ['refund amount']);
    const discI = findCol(hdr, ['discount']);
    const dateI = findCol(hdr, ['payment date', 'date']);
    const nameI = findCol(hdr, ['name']);

    for (const row of rows.slice(1)) {
      if (!row[0]) continue;
      const d = parseDate(row[dateI !== -1 ? dateI : 0]);
      if (!d || isNaN(d.getTime())) continue;
      const yr = d.getFullYear();
      if (yr < 2020 || yr > 2030) continue;

      combined.gross    += n(row[amtI]) * fxRate;
      combined.shipping += n(row[shipI]) * fxRate;
      combined.refund   += n(row[refI]) * fxRate;
      combined.discount += n(row[discI]) * fxRate;
      combined.orders++;

      const dk = dateKey(d);
      if (dk) {
        if (!allDaily[dk]) allDaily[dk] = { orders: 0, revenue: 0 };
        allDaily[dk].orders++;
        allDaily[dk].revenue += n(row[amtI]) * fxRate;
      }

      const prod = String(row[nameI] || '').trim();
      if (prod) {
        if (!allProducts[prod]) allProducts[prod] = { orders: 0, revenue: 0 };
        allProducts[prod].orders++;
        allProducts[prod].revenue += n(row[amtI]) * fxRate;
      }
    }
  }

  r.gross    = combined.gross;
  r.shipping = combined.shipping;
  r.refund_auto = combined.refund;
  r.discount = combined.discount;
  r.orders   = combined.orders;
  r.daily    = allDaily;
  r.products = Object.entries(allProducts).map(([name, d]) => ({ name, ...d, aov: d.orders > 0 ? d.revenue / d.orders : 0 })).sort((a, b) => b.revenue - a.revenue);

  const paypal = parsePayPal(wb);
  r.fee_paypal = paypal.fee;

  const { fee_local, fee_myr, fx_rate, fx_loss } = getPayexFee(wb);
  r.fee_payex      = fee_local + (fx_loss || 0);
  r.fx_rate_to_myr = fx_rate || (1 / 0.9317);

  r.ar = parseAR(wb);
  r.platforms = [{ name: 'Wix', gross: r.gross, net: 0, orders: r.orders }];
  finalise(r);
  r.platforms[0].net = r.net;
  return r;
}
