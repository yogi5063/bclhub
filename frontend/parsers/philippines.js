// parsers/philippines.js
function parsePhilippines(wb) {
  const r = emptyResult('Philippines', 'Basmi', 'PHP', 2578734.973, 2755041.52);

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

  const { fee_local, fee_myr, fx_rate } = getPayexFee(wb);
  r.fee_payex      = fee_local;
  r.fx_rate_to_myr = fx_rate;

  const xendit = parseXendit(wb);
  r.fee_xendit = xendit.fee;

  const paypal = parsePayPal(wb);
  r.fee_paypal = paypal.fee;

  // Shopee Philippines — header at row index 5
  const shopName = getSheet(wb, 'shopee');
  if (shopName) {
    const rows = sheetToArray(wb, shopName);
    if (rows && rows.length > 6) {
      const hdr = rows[5]; // header at row index 5
      const priceI  = findCol(hdr, ['original product price', 'product price']);
      const refundI = findCol(hdr, ['refund amount']);
      let shopSales = 0, shopRefund = 0;
      for (const row of rows.slice(6)) {
        if (!row[0]) continue;
        shopSales  += n(row[priceI]);
        shopRefund += Math.abs(n(row[refundI]));
      }
      // Shopee sales are typically a subset of overall gross via Wix
      // Only log as info, don't double-count
      r.warnings.push(`Shopee PH: Sales ${shopSales.toFixed(2)} PHP, Refunds ${shopRefund.toFixed(2)} PHP`);
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
