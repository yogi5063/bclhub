// parsers/oceania.js
function parseOceania(wb) {
  const r = emptyResult('Oceania', 'Cure', 'AUD', 83.05, 122.00);

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

  const { fee_local, fx_rate } = getPayexFee(wb);
  r.fee_payex      = fee_local;
  r.fx_rate_to_myr = fx_rate || (1 / 0.587);

  r.ar = parseAR(wb);
  r.platforms = [{ name: 'Wix', gross: r.gross, net: 0, orders: r.orders }];
  finalise(r);
  r.platforms[0].net = r.net;
  return r;
}
