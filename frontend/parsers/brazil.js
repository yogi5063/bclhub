// parsers/brazil.js
function parseBrazil(wb) {
  const r = emptyResult('Brazil', 'Cure', 'BRL', 195012.7899, 235431.85);

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

  r.refund_manual = parseRefunds(wb);

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

  const { fee_local, fee_myr, fx_rate } = getPayexFee(wb);
  r.fee_payex      = fee_local;
  r.fx_rate_to_myr = fx_rate;

  r.ar = parseAR(wb);
  const { states } = parseOrders(wb);
  r.states = Object.entries(states).map(([s, d]) => ({ state: s, ...d })).sort((a, b) => b.revenue - a.revenue);

  r.platforms = [{ name: 'Wix', gross: r.gross, net: 0, orders: r.orders }];
  finalise(r);
  r.platforms[0].net = r.net;
  return r;
}
