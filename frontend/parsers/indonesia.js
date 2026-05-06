// parsers/indonesia.js
function parseIndonesia(wb) {
  const r = emptyResult('Indonesia', 'Basmi', 'IDR', 0, 0);

  const pay = parsePayments(wb, 'Payments');
  if (pay) {
    r.gross       = pay.gross;
    r.discount    = pay.discount;
    r.shipping    = pay.shipping;
    r.refund_auto = pay.refund_auto;
    r.orders      = pay.orders;
    r.daily       = pay.daily;
    r.payment_methods = pay.payment_methods;
    r.products    = pay.products;
  }

  // Shopee Indonesia (Indonesian headers)
  const shopName = getSheet(wb, 'shopee');
  if (shopName) {
    const rows = sheetToArray(wb, shopName);
    if (rows) {
      // Detect header row by looking for Indonesian indicators
      const indicators = ['no. pesanan', 'harga asli produk', 'status pesanan', 'no pesanan'];
      let headerIdx = 6; // fallback
      for (let i = 0; i < Math.min(10, rows.length); i++) {
        const rowText = rows[i].map(v => String(v || '').toLowerCase()).join(' ');
        if (indicators.some(ind => rowText.includes(ind))) { headerIdx = i; break; }
      }

      const hdr = rows[headerIdx];
      const priceI  = findCol(hdr, ['harga asli produk', 'original product price', 'harga produk']);
      const refundI = findCol(hdr, ['jumlah pengembalian dana', 'refund amount', 'pengembalian']);
      const orderI  = findCol(hdr, ['no. pesanan', 'no pesanan', 'order id', 'order number']);
      const statusI = findCol(hdr, ['status pesanan', 'status']);

      let shopSales = 0, shopRefund = 0, shopOrders = 0;
      for (const row of rows.slice(headerIdx + 1)) {
        if (!row[0]) continue;
        const status = String(row[statusI] || '').toLowerCase();
        if (status.includes('cancel') || status.includes('batal')) continue;
        shopSales  += n(row[priceI]);
        shopRefund += n(row[refundI]);
        shopOrders++;
      }

      if (shopSales > 0 && r.gross === 0) {
        r.gross  = shopSales;
        r.orders = shopOrders;
        r.refund_auto = shopRefund;
      }
    }
  }

  // TikTok Indonesia
  const ttName = getSheet(wb, 'tiktok');
  if (ttName) {
    const rows = sheetToArray(wb, ttName);
    if (rows && rows.length > 2) {
      const hdr = rows[1];
      const revI   = findCol(hdr, ['total revenue', 'revenue']);
      const settlI = findCol(hdr, ['total settlement amount', 'settlement amount']);
      for (const row of rows.slice(2)) {
        if (!row[0]) continue;
        r.gross  += n(row[revI]);
        r.orders++;
      }
    }
  }

  const { fee_local, fx_rate } = getPayexFee(wb);
  r.fee_payex      = fee_local;
  r.fx_rate_to_myr = fx_rate;

  r.ar = parseAR(wb);
  r.platforms = [{ name: 'Wix/Shopee', gross: r.gross, net: 0, orders: r.orders }];
  finalise(r);
  r.platforms[0].net = r.net;
  return r;
}
