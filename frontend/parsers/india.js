// parsers/india.js
function parseIndia(wb) {
  const r = emptyResult('India', 'Basmi', 'INR', 2944205.013, 3424489.62);

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

  r.refund_manual = parseRefunds(wb, 'refund amount (inr)');

  const { fee_local, fee_myr, fx_rate } = getPayexFee(wb);
  r.fee_payex       = fee_local;
  r.fx_rate_to_myr  = fx_rate;

  r.ar = parseAR(wb);

  const { states } = parseOrders(wb);
  r.states = Object.entries(states).map(([s, d]) => ({ state: s, ...d })).sort((a, b) => b.revenue - a.revenue);

  r.platforms = [{ name: 'Wix', gross: r.gross, net: 0, orders: r.orders }];

  finalise(r);
  r.platforms[0].net = r.net;
  return r;
}
