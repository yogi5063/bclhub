// parsers/thailand.js
function parseThailand(wb) {
  const r = emptyResult('Thailand', 'Basmi', 'THB', 637755.35, 656902.15);

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

  // Manual refunds: verify monthly — in Jan 2026 NOT deducted
  const rawManual = parseRefunds(wb, 'refund amount (bhat)');
  // r.refund_manual = rawManual; // Uncomment if refunds are settled
  r.refund_manual = 0; // Jan 2026: not deducted
  if (rawManual > 0) {
    r.warnings.push(`Manual refunds of ${rawManual.toFixed(2)} THB found but NOT deducted. Verify each month.`);
  }

  const xendit = parseXendit(wb);
  r.fee_xendit = xendit.fee;

  const paypal = parsePayPal(wb);
  r.fee_paypal = paypal.fee;

  // No Payex fee for Thailand in standard flow
  const { fee_local, fx_rate } = getPayexFee(wb);
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
