// wix-aggregator.js — Merge multiple Wix CSV range files into a single TerritoryResult.
// Handles cases where data is split across Jan-Jun and Jul-Dec files.

/* global emptyResult, finalise, STATE */

// Wix territory name → brand / currency mapping
const WIX_TERRITORY_MAP = {
  'India':       { brand: 'Basmi', currency: 'INR' },
  'Malaysia':    { brand: 'Basmi', currency: 'MYR' },
  'Philippines': { brand: 'Basmi', currency: 'PHP' },
  'Thailand':    { brand: 'Basmi', currency: 'THB' },
  'Indonesia':   { brand: 'Basmi', currency: 'IDR' },
  'Vietnam':     { brand: 'Basmi', currency: 'VND' },
  'Brazil':      { brand: 'Cure',  currency: 'BRL' },
  'Europe':      { brand: 'Cure',  currency: 'EUR' },
  'GCC':         { brand: 'Cure',  currency: 'AED' },
  'Japan':       { brand: 'Cure',  currency: 'JPY' },
  'Korea':       { brand: 'Cure',  currency: 'KRW' },
  'Latam':       { brand: 'Cure',  currency: 'USD' },
  'Oceania':     { brand: 'Cure',  currency: 'AUD' },
  'USA':         { brand: 'Cure',  currency: 'USD' },
  'Molnu':       { brand: 'Molnu', currency: 'USD' },
};

/**
 * Detect territory name and file type from a relative path.
 *
 * Path patterns:
 *   Wix.com/Payment/India/payments.csv      → { wixType:'payment', territory:'India' }
 *   Wix.com/Order/India/Orders-India…csv    → { wixType:'order', territory:'India' }
 *   Wix.com/Order/India/Orders-Item…csv     → { wixType:'item', territory:'India' }
 *
 * @param {string} relativePath
 * @returns {{ wixType: string, territory: string, meta: object } | null}
 */
function detectWixPath(relativePath) {
  if (!relativePath) return null;
  const parts = relativePath.replace(/\\/g, '/').split('/');
  const wixIdx = parts.findIndex(p => p.toLowerCase() === 'wix.com');
  if (wixIdx === -1) return null;

  const typeFolder  = (parts[wixIdx + 1] || '').toLowerCase(); // 'payment' or 'order'
  const territory   = parts[wixIdx + 2] || '';                  // 'India', 'Malaysia', etc.
  const filename    = (parts[wixIdx + 3] || '').toLowerCase();

  if (!WIX_TERRITORY_MAP[territory]) return null;

  let wixType;
  if (typeFolder === 'payment') {
    wixType = 'payment';
  } else if (typeFolder === 'order') {
    wixType = filename.includes('item') ? 'item' : 'order';
  } else {
    return null;
  }

  return { wixType, territory, meta: WIX_TERRITORY_MAP[territory] };
}

/**
 * Build a TerritoryResult from aggregated Wix CSV data.
 *
 * @param {string}   territory
 * @param {object[]} paymentResults  — array from parseWixPayments()
 * @param {object[]} orderResults    — array from parseWixOrders()
 * @param {object[]} itemResults     — array from parseWixItems()
 * @returns {object} TerritoryResult
 */
function _finaliseProducts(merged) {
  return Object.values(merged)
    .map(p => ({ ...p, aov: p.orders > 0 ? p.revenue / p.orders : 0 }))
    .sort((a, b) => b.revenue - a.revenue);
}

function buildWixTerritoryResult(territory, paymentResults, orderResults, itemResults) {
  const meta = WIX_TERRITORY_MAP[territory];
  if (!meta) return null;

  const r = emptyResult(territory, meta.brand, meta.currency, 0, 0);
  r._source = 'wix';

  // ── Aggregate payment data ──────────────────────────────────────────────
  const methodMap = new Map();
  for (const wp of paymentResults) {
    if (!wp) continue;
    r.gross          += wp.gross;
    r.discount       += wp.discount;
    r.shipping       += wp.shipping;
    r.refund_auto    += wp.refund_auto;
    r.fee_payex      += wp.fee_processing + wp.fee_service;
    r.orders         += wp.orders;

    if (!r.currency && wp.currency) r.currency = wp.currency;

    // Merge daily
    for (const [dk, v] of Object.entries(wp.daily)) {
      if (!r.daily[dk]) r.daily[dk] = { orders: 0, revenue: 0 };
      r.daily[dk].orders  += v.orders;
      r.daily[dk].revenue += v.revenue;
    }

    // Merge payment methods (Map avoids O(n²) array.find)
    for (const [meth, v] of Object.entries(wp.payment_methods)) {
      const cur = methodMap.get(meth) || { orders: 0, revenue: 0 };
      methodMap.set(meth, { orders: cur.orders + v.orders, revenue: cur.revenue + v.revenue });
    }
  }
  r.payment_methods = Array.from(methodMap.entries())
    .map(([method, d]) => ({ method, ...d }));

  // ── Aggregate order data (states for Geography view) ───────────────────
  const stateMap = new Map();
  for (const wo of orderResults) {
    if (!wo) continue;
    for (const [state, v] of Object.entries(wo.states)) {
      const cur = stateMap.get(state) || { orders: 0, revenue: 0 };
      stateMap.set(state, { orders: cur.orders + v.orders, revenue: cur.revenue + v.revenue });
    }
  }
  r.states = Array.from(stateMap.entries()).map(([state, d]) => ({ state, ...d }));

  // ── Product data — prefer item-level (more granular) ──────────────────
  if (itemResults.length > 0) {
    const merged = {};
    for (const wi of itemResults) {
      if (!wi) continue;
      for (const p of (wi.products || [])) {
        const key = p.sku || p.name;
        if (!merged[key]) {
          merged[key] = { ...p };
        } else {
          merged[key].orders       += p.orders;
          merged[key].qty          += p.qty;
          merged[key].revenue      += p.revenue;
          merged[key].refunded_qty += p.refunded_qty;
        }
      }
    }
    r.products = _finaliseProducts(merged);
  } else {
    // Fallback to payment-level product data
    const merged = {};
    for (const wp of paymentResults) {
      if (!wp) continue;
      for (const [name, v] of Object.entries(wp.products || {})) {
        if (!merged[name]) merged[name] = { name, orders: 0, revenue: 0 };
        merged[name].orders  += v.orders;
        merged[name].revenue += v.revenue;
      }
    }
    r.products = _finaliseProducts(merged);
  }

  // ── Platform entry ─────────────────────────────────────────────────────
  r.platforms = [{ name: 'Wix', gross: r.gross, net: 0, orders: r.orders }];

  // ── Store raw rows for reconciliation ─────────────────────────────────
  if (!STATE.wixPaymentRows) STATE.wixPaymentRows = {};
  if (!STATE.wixOrderRows)   STATE.wixOrderRows   = {};
  STATE.wixPaymentRows[territory] = [].concat(...paymentResults.map(wp => wp?._rows || []));
  STATE.wixOrderRows[territory]   = [].concat(...orderResults.map(wo => wo?.orders || []));

  // ── Compute derived fields ─────────────────────────────────────────────
  finalise(r);
  r.platforms[0].net = r.net;

  // ── Build monthly splits from daily data ────────────────────────────────
  // These let the period selector and Trends view work month-by-month.
  // The parent `r` (full-year, key 'wix') stays as the "All Periods" aggregate.
  const totalGross = r.gross || 1;
  const monthly = {};
  for (const [dk, v] of Object.entries(r.daily)) {
    const month = dk.slice(0, 7); // 'YYYY-MM'
    if (!monthly[month]) {
      const mr = emptyResult(territory, meta.brand, meta.currency, 0, 0);
      mr._source = 'wix';
      mr.payment_methods = r.payment_methods;
      mr.products        = r.products;
      mr.states          = r.states;
      monthly[month] = mr;
    }
    monthly[month].gross  += v.revenue;
    monthly[month].orders += v.orders;
    monthly[month].daily[dk] = v;
  }
  // Allocate fees/discounts proportionally per month
  for (const [month, mr] of Object.entries(monthly)) {
    const prop = totalGross > 0 ? mr.gross / totalGross : 0;
    mr.discount    = r.discount    * prop;
    mr.shipping    = r.shipping    * prop;
    mr.refund_auto = r.refund_auto * prop;
    mr.fee_payex   = r.fee_payex   * prop;
    finalise(mr);
    mr._period = month;
    mr.platforms = [{ name: 'Wix', gross: mr.gross, net: mr.net, orders: mr.orders }];
  }
  r._monthly = monthly; // attached for handleFiles to store

  return r;
}
