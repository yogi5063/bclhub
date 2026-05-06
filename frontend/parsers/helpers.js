// parsers/helpers.js — Shared utility functions

/**
 * Safe number parser — handles currency symbols, commas, undefined
 */
function n(v) {
  if (v === null || v === undefined) return 0;
  return parseFloat(String(v).replace(/[,₩¥฿₹₱$€£\s]/g, '').trim()) || 0;
}

/**
 * Find column index by header name (case-insensitive, partial match)
 */
function findCol(headerRow, candidates) {
  if (!headerRow) return -1;
  for (let i = 0; i < headerRow.length; i++) {
    const h = String(headerRow[i] || '').toLowerCase().trim();
    if (candidates.some(c => h.includes(c.toLowerCase()))) return i;
  }
  return -1;
}

/**
 * Get sheet as array of arrays (rows × cols)
 */
function sheetToArray(wb, sheetName) {
  if (!sheetName) return null;
  const ws = wb.Sheets[sheetName];
  if (!ws) return null;
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
}

/**
 * Find sheet by name (case-insensitive, partial match)
 */
function getSheet(wb, ...candidates) {
  for (const name of wb.SheetNames) {
    const lower = name.toLowerCase();
    if (candidates.some(c => lower.includes(c.toLowerCase()))) return name;
  }
  return null;
}

/**
 * Convert Excel serial date or date string to Date object
 */
function parseDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'number' && v > 20000) {
    return new Date(Math.round((v - 25569) * 86400 * 1000));
  }
  if (typeof v === 'string') {
    const m1 = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m1) return new Date(+m1[3], +m1[2] - 1, +m1[1]);
    const m2 = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m2) return new Date(+m2[1], +m2[2] - 1, +m2[3]);
    const m3 = v.match(/^(\d{1,2})-(\w+)-(\d{4})/);
    if (m3) return new Date(v);
  }
  return null;
}

/**
 * Format date as YYYY-MM-DD string
 */
function dateKey(d) {
  if (!d) return null;
  const dt = d instanceof Date ? d : parseDate(d);
  if (!dt || isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

/**
 * Convert local currency to MYR
 */
function toMYR(amount, currency, fxRates) {
  if (currency === 'MYR') return amount;
  const rate = fxRates[currency];
  return rate ? amount / rate : amount;
}

/**
 * Get the Payex fee in local currency from the Settlement sheet.
 * Row N-1: BaseCurrency='MYR', BaseMDR=feeMYR
 * Row N:   BaseCurrency=localCur, BaseAmount=fxRate, BaseMDR=feeLocal
 */
function getPayexFee(wb) {
  const sname = getSheet(wb, 'payex settlement', 'payex settlements');
  if (!sname) return { fee_local: 0, fee_myr: 0, fx_rate: 0, local_currency: null };

  const rows = sheetToArray(wb, sname);
  if (!rows || rows.length < 2) return { fee_local: 0, fee_myr: 0, fx_rate: 0, local_currency: null };

  let feeLocalRow = null;
  let feeMyrRow = null;

  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    if (!r) continue;
    // BaseCurrency is typically at col 16
    const cur = String(r[16] || '').trim().toUpperCase();
    if (!cur) continue;
    if (cur === 'MYR' && !feeMyrRow) { feeMyrRow = r; }
    else if (cur !== 'MYR' && !cur.includes('TO') && !feeLocalRow) { feeLocalRow = r; }
    if (feeMyrRow && feeLocalRow) break;
  }

  // Also check for FX difference loss
  let fx_loss = 0;
  for (const r of rows) {
    if (!r) continue;
    const label = String(r[3] || r[2] || '').toLowerCase();
    if (label.includes('fx difference') || label.includes('fx loss')) {
      fx_loss += Math.abs(n(r[6] || r[7] || r[8]));
    }
  }

  return {
    fee_local: feeLocalRow ? n(feeLocalRow[18]) : 0,
    fee_myr: feeMyrRow ? n(feeMyrRow[18]) : 0,
    fx_rate: feeLocalRow ? n(feeLocalRow[17]) : 0,
    local_currency: feeLocalRow ? String(feeLocalRow[16]).trim() : null,
    fx_loss,
  };
}

/**
 * Parse PayPal sheet: returns { gross, fee } for Completed rows
 */
function parsePayPal(wb) {
  const sname = getSheet(wb, 'paypal');
  if (!sname) return { gross: 0, fee: 0 };
  const rows = sheetToArray(wb, sname);
  if (!rows || rows.length < 2) return { gross: 0, fee: 0 };

  const hdr = rows[0];
  const statusI = findCol(hdr, ['status']);
  const grossI = findCol(hdr, ['gross']);
  const feeI = findCol(hdr, ['fee']);

  let gross = 0, fee = 0;
  for (const r of rows.slice(1)) {
    if (!r[0]) continue;
    if (statusI >= 0 && String(r[statusI] || '').toLowerCase() !== 'completed') continue;
    gross += n(r[grossI]);
    fee += Math.abs(n(r[feeI]));
  }
  return { gross, fee };
}

/**
 * Parse Xendit sheet: returns { fee }
 * FEE and VAT line types → fee
 */
function parseXendit(wb) {
  const sname = getSheet(wb, 'xendit');
  if (!sname) return { gross: 0, fee: 0 };
  const rows = sheetToArray(wb, sname);
  if (!rows || rows.length < 2) return { gross: 0, fee: 0 };

  const hdr = rows[0];
  const ltI = findCol(hdr, ['line type', 'type']);
  const amtI = findCol(hdr, ['amount']);

  let gross = 0, fee = 0;
  for (const r of rows.slice(1)) {
    if (!r[0]) continue;
    const lt = String(r[ltI] || '').toUpperCase();
    if (lt === 'TRANSACTION') gross += n(r[amtI]);
    else if (lt === 'FEE' || lt === 'VAT') fee += Math.abs(n(r[amtI]));
  }
  return { gross, fee };
}

/**
 * Parse Refunds sheet: returns total manual refund amount
 */
function parseRefunds(wb, amountColHint) {
  const sname = getSheet(wb, 'refund');
  if (!sname) return 0;
  const rows = sheetToArray(wb, sname);
  if (!rows || rows.length < 2) return 0;

  const hdr = rows[0];
  const candidates = amountColHint ? [amountColHint, 'refund amount', 'amount'] : ['refund amount', 'amount'];
  const amtI = findCol(hdr, candidates);
  if (amtI < 0) return 0;

  let total = 0;
  for (const r of rows.slice(1)) {
    if (!r[0] && !r[1]) continue;
    const v = n(r[amtI]);
    if (v > 0 && v < 100_000_000) total += v;
  }
  return total;
}

/**
 * Parse Payments sheet common logic
 * Returns: { gross, discount, shipping, refund_auto, orders, daily, payment_methods, products }
 */
function parsePayments(wb, sheetName) {
  sheetName = sheetName || 'Payments';
  const sname = getSheet(wb, sheetName.toLowerCase()) || sheetName;
  const rows = sheetToArray(wb, sname);
  if (!rows) return null;

  const hdr = rows[0];
  const amtI  = findCol(hdr, ['amount']);
  const discI = findCol(hdr, ['discount']);
  const shipI = findCol(hdr, ['shipping']);
  const refI  = findCol(hdr, ['refund amount']);
  const dateI = findCol(hdr, ['payment date', 'date']);
  const methI = findCol(hdr, ['payment method']);
  const provI = findCol(hdr, ['payment provider', 'provider']);
  const nameI = findCol(hdr, ['name']);

  let gross = 0, discount = 0, shipping = 0, refund_auto = 0, orders = 0;
  const daily = {};
  const methodMap = {};
  const productMap = {};

  for (const r of rows.slice(1)) {
    const dateVal = r[dateI];
    // Skip rows without a valid date (header rows, total rows, empty rows)
    const d = parseDate(dateVal);
    if (!d || isNaN(d.getTime())) continue;
    // Skip obvious total rows (year far in future/past)
    const yr = d.getFullYear();
    if (yr < 2020 || yr > 2030) continue;

    const amt  = n(r[amtI]);
    const disc = n(r[discI]);
    const ship = n(r[shipI]);
    const ref  = n(r[refI]);

    gross       += amt;
    discount    += disc;
    shipping    += ship;
    refund_auto += ref;
    orders++;

    const dk = dateKey(d);
    if (dk) {
      if (!daily[dk]) daily[dk] = { orders: 0, revenue: 0 };
      daily[dk].orders++;
      daily[dk].revenue += amt;
    }

    const meth = String(r[methI] || r[provI] || 'Unknown').trim();
    if (!methodMap[meth]) methodMap[meth] = { orders: 0, revenue: 0 };
    methodMap[meth].orders++;
    methodMap[meth].revenue += amt;

    const prod = String(r[nameI] || '').trim();
    if (prod && prod.length > 1) {
      if (!productMap[prod]) productMap[prod] = { orders: 0, revenue: 0 };
      productMap[prod].orders++;
      productMap[prod].revenue += amt;
    }
  }

  return {
    gross, discount, shipping, refund_auto, orders, daily,
    payment_methods: Object.entries(methodMap).map(([method, d]) => ({ method, ...d })).sort((a, b) => b.revenue - a.revenue),
    products: Object.entries(productMap).map(([name, d]) => ({ name, ...d, aov: d.orders > 0 ? d.revenue / d.orders : 0 })).sort((a, b) => b.revenue - a.revenue),
  };
}

/**
 * Parse Orders sheet for geography (state breakdown)
 */
function parseOrders(wb) {
  const sname = getSheet(wb, 'orders');
  if (!sname) return { states: {} };
  const rows = sheetToArray(wb, sname);
  if (!rows || rows.length < 2) return { states: {} };

  const hdr = rows[0];
  const stateI = findCol(hdr, ['delivery state', 'state', 'province']);
  const totalI = findCol(hdr, ['total', 'net amount', 'order total']);

  const states = {};
  for (const r of rows.slice(1)) {
    if (!r[0]) continue;
    const state = String(r[stateI] || '').trim();
    const total = n(r[totalI]);
    if (state && total > 0) {
      if (!states[state]) states[state] = { orders: 0, revenue: 0 };
      states[state].orders++;
      states[state].revenue += total;
    }
  }
  return { states };
}

/**
 * Parse AR data from Payex Settlement and Bank Receipts sheets
 */
function parseAR(wb) {
  const ar = { payex_gross_myr: 0, payex_fee_myr: 0, payex_net_myr: 0, bank_receipts_myr: 0, ar_balance_myr: 0 };

  const sname = getSheet(wb, 'payex settlement', 'payex settlements');
  if (sname) {
    const rows = sheetToArray(wb, sname);
    if (rows) {
      const dataRows = rows.slice(1).filter(r => r && (r[0] instanceof Date || parseDate(r[0])));
      ar.payex_gross_myr = dataRows.reduce((s, r) => s + n(r[17]), 0);
      ar.payex_fee_myr   = dataRows.reduce((s, r) => s + n(r[18]), 0);
      ar.payex_net_myr   = ar.payex_gross_myr - ar.payex_fee_myr;
    }
  }

  const bankSname = getSheet(wb, 'bank receipts');
  if (bankSname) {
    const bankRows = sheetToArray(wb, bankSname);
    if (bankRows && bankRows.length > 1) {
      const crI = findCol(bankRows[0], ['credit amount', 'amount']);
      ar.bank_receipts_myr = bankRows.slice(1).filter(r => r && r[0]).reduce((s, r) => s + n(r[crI]), 0);
      ar.ar_balance_myr = ar.payex_net_myr - ar.bank_receipts_myr;
    }
  }

  return ar;
}

/**
 * Create empty TerritoryResult template
 */
function emptyResult(territory, brand, currency, netTarget, grossTarget) {
  return {
    territory, brand, currency,
    gross: 0, discount: 0, shipping: 0,
    refund_auto: 0, refund_manual: 0, refund_total: 0, chargeback: 0,
    fee_payex: 0, fee_paypal: 0, fee_xendit: 0,
    fee_tiktok: 0, fee_shopee: 0, fee_lazada: 0, fee_total: 0,
    net: 0, margin_pct: 0,
    orders: 0, aov: 0,
    products: [], states: [], daily: {},
    payment_methods: [], platforms: [],
    ar: { payex_gross_myr: 0, payex_fee_myr: 0, payex_net_myr: 0, bank_receipts_myr: 0, ar_balance_myr: 0 },
    fx_rate_to_myr: 0,
    validation: { gross_target: grossTarget || 0, net_target: netTarget || 0 },
    warnings: [], errors: [],
  };
}

/**
 * Finalise result — compute derived fields
 */
function finalise(r) {
  r.refund_total = r.refund_auto + r.refund_manual + r.chargeback;
  r.fee_total    = r.fee_payex + r.fee_paypal + r.fee_xendit + r.fee_tiktok + r.fee_shopee + r.fee_lazada;
  r.net          = r.gross - r.shipping - r.refund_total - r.fee_total;
  r.margin_pct   = r.gross > 0 ? (r.net / r.gross * 100) : 0;
  r.aov          = r.orders > 0 ? (r.gross / r.orders) : 0;
  return r;
}
