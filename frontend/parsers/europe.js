// parsers/europe.js
function parseEurope(wb) {
  const r = emptyResult('Europe', 'Cure', 'EUR', 322956.7452, 397474.65);

  const currencies = ['EUR', 'USD', 'GBP', 'AUD'];
  let combined = { gross: 0, shipping: 0, refund: 0, discount: 0 };
  const fxRates = {};
  const allDaily = {};
  const allProducts = {};

  for (const cur of currencies) {
    const sname = getSheet(wb, cur);
    if (!sname) continue;
    const rows = sheetToArray(wb, sname);
    if (!rows || rows.length < 2) continue;

    // Find FX rate from last rows — pattern: row with "{CUR} to EUR" label
    let fxRate = 1.0;
    if (cur !== 'EUR') {
      for (let i = rows.length - 1; i >= Math.max(0, rows.length - 5); i--) {
        const row = rows[i];
        if (!row) continue;
        const label = String(row[3] || row[5] || row[0] || '').toLowerCase();
        if (label.includes('to eur') || (label === 'eur' && i === rows.length - 1)) {
          const possibleRate = n(row[6] || row[5] || row[4]);
          if (possibleRate > 0 && possibleRate < 10) { fxRate = possibleRate; break; }
        }
      }
      // Default fallback rates
      if (fxRate === 1.0) {
        fxRate = { USD: 0.8439, GBP: 1.155, AUD: 0.5875 }[cur] || 1.0;
      }
    }
    fxRates[cur] = fxRate;

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

      const amt  = n(row[amtI]);
      const ship = n(row[shipI]);
      const ref  = n(row[refI]);
      const disc = n(row[discI]);

      combined.gross    += amt * fxRate;
      combined.shipping += ship * fxRate;
      combined.refund   += ref * fxRate;
      combined.discount += disc * fxRate;

      const dk = dateKey(d);
      if (dk) {
        if (!allDaily[dk]) allDaily[dk] = { orders: 0, revenue: 0 };
        allDaily[dk].orders++;
        allDaily[dk].revenue += amt * fxRate;
      }

      const prod = String(row[nameI] || '').trim();
      if (prod) {
        if (!allProducts[prod]) allProducts[prod] = { orders: 0, revenue: 0 };
        allProducts[prod].orders++;
        allProducts[prod].revenue += amt * fxRate;
      }
    }
  }

  r.gross    = combined.gross;
  r.shipping = combined.shipping;
  r.refund_auto = combined.refund;
  r.discount = combined.discount;
  r.daily    = allDaily;
  r.products = Object.entries(allProducts).map(([name, d]) => ({ name, ...d, aov: d.orders > 0 ? d.revenue / d.orders : 0 })).sort((a, b) => b.revenue - a.revenue);

  // Count orders from EUR sheet (primary)
  const eurName = getSheet(wb, 'EUR');
  if (eurName) {
    const rows = sheetToArray(wb, eurName);
    if (rows) {
      const dateI = findCol(rows[0], ['payment date', 'date']);
      r.orders = rows.slice(1).filter(row => {
        const d = parseDate(row[dateI !== -1 ? dateI : 0]);
        return d && !isNaN(d.getTime()) && d.getFullYear() >= 2020 && d.getFullYear() <= 2030;
      }).length;
    }
  }

  r.refund_manual = parseRefunds(wb);

  const paypal = parsePayPal(wb);
  r.fee_paypal = paypal.fee;

  const { fee_local, fee_myr, fx_rate } = getPayexFee(wb);
  r.fee_payex      = fee_local;
  r.fx_rate_to_myr = fx_rate || (1 / 0.214);

  r.ar = parseAR(wb);

  r.platforms = [{ name: 'Wix', gross: r.gross, net: 0, orders: r.orders }];
  finalise(r);
  r.platforms[0].net = r.net;
  return r;
}
