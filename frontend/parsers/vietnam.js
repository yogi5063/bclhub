// parsers/vietnam.js
function parseVietnam(wb) {
  const r = emptyResult('Vietnam', 'Basmi', 'VND', 0, 0);

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

  const xendit = parseXendit(wb);
  r.fee_xendit = xendit.fee;

  const paypal = parsePayPal(wb);
  r.fee_paypal = paypal.fee;

  const { fee_local, fee_myr, fx_rate } = getPayexFee(wb);
  r.fee_payex      = fee_local;
  r.fx_rate_to_myr = fx_rate || 5500; // approx 1 MYR = 5500 VND

  // Shopee Vietnam (if present)
  const shopName = getSheet(wb, 'shopee');
  if (shopName) {
    const rows = sheetToArray(wb, shopName);
    if (rows && rows.length > 5) {
      // Try to detect header row
      let hdrIdx = 0;
      for (let i = 0; i < Math.min(10, rows.length); i++) {
        const rowText = rows[i].map(v => String(v || '').toLowerCase()).join(' ');
        if (rowText.includes('product price') || rowText.includes('original') || rowText.includes('order id')) {
          hdrIdx = i; break;
        }
      }
      const hdr = rows[hdrIdx];
      const priceI  = findCol(hdr, ['original product price', 'product price']);
      const refundI = findCol(hdr, ['refund amount']);
      let shopSales = 0, shopRefund = 0;
      for (const row of rows.slice(hdrIdx + 1)) {
        if (!row[0]) continue;
        shopSales  += n(row[priceI]);
        shopRefund += Math.abs(n(row[refundI]));
      }
      if (shopSales > 0) r.warnings.push(`Shopee VN: Sales ${shopSales.toFixed(0)} VND, Refunds ${shopRefund.toFixed(0)} VND`);
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
