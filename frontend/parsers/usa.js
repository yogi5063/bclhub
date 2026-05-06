// parsers/usa.js
function parseUSA(wb) {
  const r = emptyResult('USA', 'Cure', 'USD', 11977.38647, 15433.79);

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

  const { fee_local, fee_myr, fx_rate } = getPayexFee(wb);
  r.fee_payex      = fee_local;
  r.fx_rate_to_myr = fx_rate || 0.2537;

  r.ar = parseAR(wb);
  const { states } = parseOrders(wb);
  r.states = Object.entries(states).map(([s, d]) => ({ state: s, ...d })).sort((a, b) => b.revenue - a.revenue);

  r.platforms = [{ name: 'Wix', gross: r.gross, net: 0, orders: r.orders }];
  finalise(r);
  r.platforms[0].net = r.net;
  return r;
}
