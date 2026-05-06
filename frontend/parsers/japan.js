// parsers/japan.js
function parseJapan(wb) {
  const r = emptyResult('Japan', 'Cure', 'JPY', 10190810.52, 11352722);

  const pay = parsePayments(wb, 'Payments');
  if (!pay) { r.errors.push('Payments sheet missing'); return finalise(r); }

  r.gross       = pay.gross;
  r.discount    = pay.discount;
  r.shipping    = pay.shipping;
  r.refund_auto = pay.refund_auto;
  r.orders      = pay.orders;
  r.daily       = pay.daily;
  r.payment_methods = pay.payment_methods;
  r.products    = pay.products;

  const paypal = parsePayPal(wb);
  r.fee_paypal = paypal.fee;

  // Payex fee + FX difference loss
  const { fee_local, fee_myr, fx_rate, fx_loss } = getPayexFee(wb);
  r.fee_payex      = fee_local;
  r.fx_rate_to_myr = fx_rate || (1 / 39.26);

  // Also check for FX loss in Payments sheet (labeled separately)
  const sname = getSheet(wb, 'payex settlement', 'payex settlements');
  if (sname) {
    const rows = sheetToArray(wb, sname);
    if (rows) {
      for (const row of rows) {
        if (!row) continue;
        const label = String(row[3] || row[2] || '').toLowerCase();
        if (label.includes('fx difference') || label.includes('fx loss')) {
          r.fee_payex += Math.abs(n(row[6] || row[7] || row[8]));
        }
      }
    }
  }

  r.ar = parseAR(wb);
  const { states } = parseOrders(wb);
  r.states = Object.entries(states).map(([s, d]) => ({ state: s, ...d })).sort((a, b) => b.revenue - a.revenue);

  r.platforms = [{ name: 'Wix', gross: r.gross, net: 0, orders: r.orders }];
  finalise(r);
  r.platforms[0].net = r.net;
  return r;
}
