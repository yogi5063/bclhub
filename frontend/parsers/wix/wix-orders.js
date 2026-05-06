// wix-orders.js — Parse Wix Orders CSV export
// Row 0 = headers, data from row 1

/* global Papa, n */

function _dateKey(dateStr) {
  if (!dateStr) return null;
  // Wix Orders date format: "Dec 31, 2025"
  const months = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };
  const m = String(dateStr).match(/^(\w{3})\w*\s+(\d{1,2}),?\s+(\d{4})/i);
  if (m) {
    const mo = months[m[1].toLowerCase()];
    if (mo) return `${m[3]}-${String(mo).padStart(2,'0')}-${m[2].padStart(2,'0')}`;
  }
  // ISO fallback
  const m2 = String(dateStr).match(/^(\d{4}-\d{2}-\d{2})/);
  if (m2) return m2[1];
  return null;
}

/**
 * Parse a Wix Orders CSV (order-level summary).
 *
 * @param {string} csvText
 * @returns {object} { orders[], states{}, daily{}, gross, refunded_amount, currency }
 */
function parseWixOrders(csvText) {
  const parsed = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });

  const result = {
    orders:           [],
    states:           {},
    daily:            {},
    gross:            0,
    refunded_amount:  0,
    currency:         null,
  };

  for (const row of parsed.data) {
    const orderId = String(row['Order number'] || '').trim();
    if (!orderId) continue;

    const total    = n(row['Total']);
    const refunded = n(row['Refunded amount']);
    const state    = (row['Delivery state'] || '').trim();
    const city     = (row['Delivery city']  || '').trim();
    const dk       = _dateKey(row['Date created']);

    result.gross           += total;
    result.refunded_amount += refunded;

    if (!result.currency && row['Currency']) result.currency = String(row['Currency']).trim();

    // State breakdown (for Geography view)
    if (state) {
      if (!result.states[state]) result.states[state] = { orders: 0, revenue: 0 };
      result.states[state].orders  += 1;
      result.states[state].revenue += total;
    }

    // Daily breakdown
    if (dk) {
      if (!result.daily[dk]) result.daily[dk] = { orders: 0, revenue: 0 };
      result.daily[dk].orders  += 1;
      result.daily[dk].revenue += total;
    }

    // Raw order for reconciliation
    result.orders.push({
      orderId,
      date:              dk,
      total,
      refunded,
      qty:               n(row['Total order quantity']),
      paymentStatus:     (row['Payment status']     || '').trim(),
      fulfillmentStatus: (row['Fulfillment status'] || '').trim(),
      paymentMethod:     (row['Payment method']     || '').trim(),
      coupon:            (row['Coupon code']        || '').trim(),
      state,
      city,
    });
  }

  return result;
}
