// parsers/malaysia.js
function parseMalaysia(wb) {
  const r = emptyResult('Malaysia', 'Basmi', 'MYR', 829323.014, 1011002.59);
  r.fx_rate_to_myr = 1;

  // ── SUMMARY SHEET (ground truth for financials) ──
  const sumName = getSheet(wb, 'summary');
  if (sumName) {
    const rows = sheetToArray(wb, sumName);
    if (rows && rows.length >= 6) {
      // Row index 5 = Total row: Platform | Sales | Refunds | Gross Rev | Discounts | Shipping | Fees | Net
      const total = rows[5];
      if (total) {
        r.gross    = n(total[3]); // Gross Rev
        r.discount = n(total[4]);
        r.shipping = n(total[5]);
        r.fee_total = n(total[6]);
        r.net = n(total[7]);
        // Reconstruct refunds from Sales - Gross
        const sales = n(total[1]);
        r.refund_auto = n(total[2]);
      }
    }
  }

  // ── TIKTOK ──
  const ttName = getSheet(wb, 'tiktok');
  let tt = { gross: 0, net: 0, orders: 0, sales: 0, fees: 0, daily: {}, products: [] };
  if (ttName) {
    const rows = sheetToArray(wb, ttName);
    if (rows && rows.length > 2) {
      const hdr = rows[1]; // header at row index 1
      const settlI  = findCol(hdr, ['total settlement amount', 'settlement amount']);
      const revI    = findCol(hdr, ['total revenue', 'revenue']);
      const salesI  = findCol(hdr, ['subtotal after seller discount', 'subtotal after']);
      const dateI   = findCol(hdr, ['order creation time', 'created time', 'date']);
      const prodI   = findCol(hdr, ['product name', 'sku name', 'item name']);

      const productMap = {};
      for (const row of rows.slice(2)) {
        if (!row[0]) continue;
        tt.sales  += n(row[salesI]);
        tt.gross  += n(row[revI]);
        tt.net    += n(row[settlI]);
        tt.orders++;

        const dk = dateKey(row[dateI]);
        if (dk) {
          if (!tt.daily[dk]) tt.daily[dk] = { orders: 0, revenue: 0 };
          tt.daily[dk].orders++;
          tt.daily[dk].revenue += n(row[revI]);
        }

        const prod = String(row[prodI] || '').trim();
        if (prod) {
          if (!productMap[prod]) productMap[prod] = { orders: 0, revenue: 0 };
          productMap[prod].orders++;
          productMap[prod].revenue += n(row[salesI]);
        }
      }
      tt.fees = tt.sales - tt.net;
      tt.products = Object.entries(productMap).map(([name, d]) => ({ name, ...d, aov: d.orders > 0 ? d.revenue / d.orders : 0 }));
    }
  }

  // ── SHOPEE ──
  const shopName = getSheet(wb, 'shopee');
  let shopee = { gross: 0, net: 0, orders: 0, sales: 0, refund: 0, fees: 0, shipping: 0, daily: {}, products: [] };
  if (shopName) {
    const rows = sheetToArray(wb, shopName);
    if (rows && rows.length > 3) {
      const hdr = rows[2]; // header at row index 2
      const priceI   = findCol(hdr, ['product price', 'original product price']);
      const refundI  = findCol(hdr, ['refund amount']);
      const orderI   = findCol(hdr, ['order id', 'order/return id']);
      const dateI    = findCol(hdr, ['order paid time', 'order creation time', 'paid time']);
      const prodI    = findCol(hdr, ['product name', 'sku name', 'item name']);
      const commI    = findCol(hdr, ['commission fee', 'commission']);
      const svcI     = findCol(hdr, ['service fee']);
      const txnI     = findCol(hdr, ['transaction fee']);
      const amsI     = findCol(hdr, ['ams commission', 'ams fee']);

      const productMap = {};
      for (const row of rows.slice(3)) {
        if (!row[0]) continue;
        const oid = String(row[orderI] || '').trim();
        if (oid.length < 5) continue;

        const price  = n(row[priceI]);
        const refund = Math.abs(n(row[refundI]));
        shopee.sales  += price;
        shopee.refund += refund;
        shopee.orders++;

        const comm = Math.abs(n(row[commI]));
        const svc  = Math.abs(n(row[svcI]));
        const txn  = Math.abs(n(row[txnI]));
        const ams  = Math.abs(n(row[amsI]));
        shopee.fees += comm + svc + txn + ams;

        const dk = dateKey(row[dateI]);
        if (dk) {
          if (!shopee.daily[dk]) shopee.daily[dk] = { orders: 0, revenue: 0 };
          shopee.daily[dk].orders++;
          shopee.daily[dk].revenue += price;
        }

        const prod = String(row[prodI] || '').trim();
        if (prod) {
          if (!productMap[prod]) productMap[prod] = { orders: 0, revenue: 0 };
          productMap[prod].orders++;
          productMap[prod].revenue += price;
        }
      }
      shopee.gross = shopee.sales - shopee.refund;

      // Add Shopee Ads Expense
      const adsName = getSheet(wb, 'shopee ads', 'ads expense');
      if (adsName) {
        const adsRows = sheetToArray(wb, adsName);
        if (adsRows && adsRows.length > 1) {
          const expI = findCol(adsRows[0], ['expense', 'amount']);
          for (const row of adsRows.slice(1)) {
            if (row[0]) shopee.fees += Math.abs(n(row[expI]));
          }
        }
      }

      // Shopee Summary for shipping
      const shopSumName = getSheet(wb, 'shopee summary');
      if (shopSumName) {
        const ssRows = sheetToArray(wb, shopSumName);
        if (ssRows) {
          for (const row of ssRows) {
            const label = String(row[0] || row[1] || '').toLowerCase();
            if (label.includes('shipping subtotal')) {
              shopee.shipping = Math.abs(n(row[1] || row[2]));
              break;
            }
          }
        }
      }

      shopee.net = shopee.gross - shopee.shipping - shopee.fees;
      shopee.products = Object.entries(productMap).map(([name, d]) => ({ name, ...d, aov: d.orders > 0 ? d.revenue / d.orders : 0 }));
    }
  }

  // ── LAZADA (Lazada Pivot) ──
  let lazada = { gross: 0, net: 0, orders: 0, fees: 0 };
  const lazPivotName = getSheet(wb, 'lazada pivot');
  if (lazPivotName) {
    const rows = sheetToArray(wb, lazPivotName);
    if (rows) {
      for (const row of rows) {
        const label = String(row[0] || row[1] || '').toLowerCase();
        if (label.includes('gross revenue') || label.includes('gross rev')) lazada.gross = n(row[1] || row[2]);
        if (label.includes('net revenue') || label.includes('net rev')) lazada.net = n(row[1] || row[2]);
        if (label.includes('fee') || label.includes('commission')) lazada.fees += n(row[1] || row[2]);
      }
    }
  } else {
    const lazName = getSheet(wb, 'lazada');
    if (lazName) {
      const rows = sheetToArray(wb, lazName);
      if (rows && rows.length > 1) {
        const hdr = rows[0];
        const priceI = findCol(hdr, ['item price credit', 'item price', 'unit price']);
        for (const row of rows.slice(1)) {
          if (row[0]) lazada.gross += n(row[priceI]);
        }
      }
    }
  }

  // ── EASYSTORE ──
  function parseEasystore(sheetName) {
    const sn = getSheet(wb, sheetName);
    if (!sn) return { subtotal: 0, discount: 0, shipping: 0, refund: 0, orders: 0, daily: {}, products: [] };
    const rows = sheetToArray(wb, sn);
    if (!rows) return { subtotal: 0, discount: 0, shipping: 0, refund: 0, orders: 0, daily: {}, products: [] };

    const hdr = rows[0];
    const oidI      = findCol(hdr, ['order number', 'order id', 'order no']);
    const subI      = findCol(hdr, ['subtotal']);
    const discI     = findCol(hdr, ['order discount', 'discount']);
    const shipI     = findCol(hdr, ['shipping fee', 'shipping']);
    const refundI   = findCol(hdr, ['refunded amount', 'refund amount', 'refund']);
    const dateI     = findCol(hdr, ['created at', 'order date', 'date']);
    const prodI     = findCol(hdr, ['product title', 'product name', 'name']);

    const seen = new Set();
    let subtotal = 0, discount = 0, shipping = 0, refund = 0, orders = 0;
    const daily = {};
    const productMap = {};

    for (const row of rows.slice(1)) {
      const oid = String(row[oidI] || '').trim();
      if (!oid || seen.has(oid)) continue;
      if (row[subI] === null && row[refundI] === null) continue;
      seen.add(oid);

      subtotal += n(row[subI]);
      discount += Math.abs(n(row[discI]));
      shipping += n(row[shipI]);
      refund   += n(row[refundI]);
      orders++;

      const dk = dateKey(row[dateI]);
      if (dk) {
        if (!daily[dk]) daily[dk] = { orders: 0, revenue: 0 };
        daily[dk].orders++;
        daily[dk].revenue += n(row[subI]);
      }

      const prod = String(row[prodI] || '').trim();
      if (prod) {
        if (!productMap[prod]) productMap[prod] = { orders: 0, revenue: 0 };
        productMap[prod].orders++;
        productMap[prod].revenue += n(row[subI]);
      }
    }
    return {
      subtotal, discount, shipping, refund, orders, daily,
      products: Object.entries(productMap).map(([name, d]) => ({ name, ...d, aov: d.orders > 0 ? d.revenue / d.orders : 0 })),
    };
  }

  const esMYR = parseEasystore('easystore myr');
  const esSGD = parseEasystore('easystore sgd');
  const esBND = parseEasystore('easystore bnd');

  // FX conversion for SGD/BND (use STATE.fx if available, else defaults)
  const fxSGD = (typeof STATE !== 'undefined' ? STATE.fx.SGD : 0) || 3.3;
  const fxBND = (typeof STATE !== 'undefined' ? STATE.fx.BND : 0) || 2.8;

  const easyGross = esMYR.subtotal + (esSGD.subtotal / fxSGD) + (esBND.subtotal / fxBND);
  const easyShip  = esMYR.shipping + (esSGD.shipping / fxSGD) + (esBND.shipping / fxBND);
  const easyRefund = esMYR.refund + (esSGD.refund / fxSGD) + (esBND.refund / fxBND);
  const easyDisc  = esMYR.discount;
  const easyOrders = esMYR.orders + esSGD.orders + esBND.orders;

  // Merge daily data from all platforms
  function mergeDailyData(...dailyObjs) {
    const merged = {};
    for (const d of dailyObjs) {
      for (const [k, v] of Object.entries(d)) {
        if (!merged[k]) merged[k] = { orders: 0, revenue: 0 };
        merged[k].orders  += v.orders;
        merged[k].revenue += v.revenue;
      }
    }
    return merged;
  }

  r.daily = mergeDailyData(tt.daily, shopee.daily, esMYR.daily);
  r.orders = tt.orders + shopee.orders + lazada.orders + easyOrders;

  // Merge products from all platforms
  function mergeProducts(...arrs) {
    const map = {};
    for (const arr of arrs) {
      for (const p of arr) {
        if (!map[p.name]) map[p.name] = { name: p.name, orders: 0, revenue: 0 };
        map[p.name].orders  += p.orders;
        map[p.name].revenue += p.revenue;
      }
    }
    return Object.values(map).map(p => ({ ...p, aov: p.orders > 0 ? p.revenue / p.orders : 0 })).sort((a, b) => b.revenue - a.revenue);
  }
  r.products = mergeProducts(tt.products, shopee.products, esMYR.products);

  // If no summary sheet provided, compute from raw
  if (!sumName || r.gross === 0) {
    r.gross    = tt.gross + shopee.gross + lazada.gross + easyGross;
    r.discount = easyDisc + shopee.refund;
    r.shipping = shopee.shipping + easyShip;
    r.refund_auto = shopee.refund + easyRefund;
    r.fee_shopee  = shopee.fees;
    r.fee_tiktok  = tt.fees;
    r.fee_lazada  = lazada.fees;
    finalise(r);
  } else {
    // Use summary numbers; compute net properly
    r.fee_shopee = shopee.fees;
    r.fee_tiktok = tt.fees;
    r.fee_lazada = lazada.fees;
    // net already set from summary
  }

  r.platforms = [
    { name: 'TikTok',    gross: tt.gross,     net: tt.net,     orders: tt.orders },
    { name: 'Shopee',    gross: shopee.gross,  net: shopee.net, orders: shopee.orders },
    { name: 'Lazada',    gross: lazada.gross,  net: lazada.net, orders: lazada.orders },
    { name: 'Easystore', gross: easyGross,     net: easyGross - easyShip - easyRefund, orders: easyOrders },
  ];

  // payment methods
  r.payment_methods = [
    { method: 'TikTok',    orders: tt.orders,     revenue: tt.gross },
    { method: 'Shopee',    orders: shopee.orders, revenue: shopee.gross },
    { method: 'Lazada',    orders: lazada.orders, revenue: lazada.gross },
    { method: 'Easystore', orders: easyOrders,    revenue: easyGross },
  ].filter(m => m.revenue > 0);

  r.ar = parseAR(wb);

  if (!r.net || r.net === 0) finalise(r);
  return r;
}
