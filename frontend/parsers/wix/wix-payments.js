// wix-payments.js — Parse Wix Payments CSV export
// File structure:
//   Row 0: section group headers (ignore)
//   Row 1: real column headers
//   Row 2+: data rows

/* global Papa, n, findCol */

function _dateKey(dateStr) {
  if (!dateStr) return null;
  // Wix format: "31/12/2025, 09:23:00 pm"
  const m = String(dateStr).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  // ISO format
  const m2 = String(dateStr).match(/^(\d{4}-\d{2}-\d{2})/);
  if (m2) return m2[1];
  return null;
}

/**
 * Parse a single Wix Payments CSV text.
 *
 * @param {string} csvText
 * @returns {object} Parsed payment data
 */
function parseWixPayments(csvText) {
  const parsed = Papa.parse(csvText, {
    header: false,
    skipEmptyLines: true,
    dynamicTyping: false,
  });

  const rows = parsed.data;
  if (rows.length < 3) return _emptyPaymentResult();

  // Row index 1 = real column headers
  const hdr = rows[1];
  const dateI    = findCol(hdr, ['payment date']);
  const curI     = findCol(hdr, ['currency']);
  const amtI     = findCol(hdr, ['amount']);
  const procFeeI = findCol(hdr, ['processing fee']);
  const svcFeeI  = findCol(hdr, ['service fee']);
  const netI     = findCol(hdr, ['net']);
  const statusI  = findCol(hdr, ['transaction status']);
  const typeI    = findCol(hdr, ['payment type']);
  const refundI  = findCol(hdr, ['refund amount']);
  const providerI= findCol(hdr, ['payment provider', 'provider']);
  const methodI  = findCol(hdr, ['payment method', 'installments']);
  const orderIdI = findCol(hdr, ['order id']);
  const nameI    = findCol(hdr, ['name']);
  const qtyI     = findCol(hdr, ['quantity']);
  const discI    = findCol(hdr, ['discount']);
  const shipI    = findCol(hdr, ['shipping']);

  const result = _emptyPaymentResult();

  for (const row of rows.slice(2)) {
    const dateVal = row[dateI];
    if (!dateVal) continue;

    // Skip void / pending / refunded rows that don't represent actual charges
    const status = (row[statusI] || '').toLowerCase();
    if (status === 'failed' || status === 'voided' || status === 'pending') continue;

    const amt    = n(row[amtI]);
    const refund = n(row[refundI]);
    const disc   = n(row[discI]);
    const ship   = n(row[shipI]);
    const pFee   = n(row[procFeeI]);
    const sFee   = n(row[svcFeeI]);

    result.gross          += amt;
    result.refund_auto    += refund;
    result.discount       += disc;
    result.shipping       += ship;
    result.fee_processing += Math.abs(pFee);
    result.fee_service    += Math.abs(sFee);
    result.orders         += 1;

    if (!result.currency && row[curI]) result.currency = String(row[curI]).trim();

    // Daily breakdown
    const dk = _dateKey(dateVal);
    if (dk) {
      if (!result.daily[dk]) result.daily[dk] = { orders: 0, revenue: 0 };
      result.daily[dk].orders  += 1;
      result.daily[dk].revenue += amt;
    }

    // Payment method breakdown
    const method = (row[methodI] || row[providerI] || 'Other').trim() || 'Other';
    if (!result.payment_methods[method]) result.payment_methods[method] = { orders: 0, revenue: 0 };
    result.payment_methods[method].orders  += 1;
    result.payment_methods[method].revenue += amt;

    // Product breakdown
    const prod = (row[nameI] || '').trim();
    if (prod) {
      if (!result.products[prod]) result.products[prod] = { orders: 0, revenue: 0 };
      result.products[prod].orders  += Math.max(1, n(row[qtyI]));
      result.products[prod].revenue += amt;
    }

    // Keep raw row for reconciliation (keyed by Order ID)
    const orderId = String(row[orderIdI] || '').trim();
    result._rows.push({
      orderId,
      date:   dk,
      amount: amt,
      refund,
      method,
      status: row[statusI] || '',
      type:   row[typeI]   || '',
    });
  }

  return result;
}

function _emptyPaymentResult() {
  return {
    gross: 0, discount: 0, shipping: 0, refund_auto: 0,
    fee_processing: 0, fee_service: 0,
    orders: 0,
    currency: null,
    daily: {},
    payment_methods: {},
    products: {},
    _rows: [],
  };
}
