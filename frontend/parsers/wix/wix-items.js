// wix-items.js — Parse Wix Orders-Item CSV export
// Row 0 = headers, data from row 1
// Same base columns as Orders CSV plus: Item, Variant, SKU, Qty, Quantity refunded, Price

/* global Papa, n */

/**
 * Parse a Wix Orders-Item CSV (line-item level).
 *
 * @param {string} csvText
 * @returns {{ products: object[] }} Aggregated by SKU/product name
 */
function parseWixItems(csvText) {
  const parsed = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });

  const productMap = {};

  for (const row of parsed.data) {
    const name    = (row['Item']    || '').trim();
    const variant = (row['Variant'] || '').trim();
    const sku     = (row['SKU']     || '').trim();
    const qty     = n(row['Qty']) || n(row['Quantity']) || 1;
    const qtyRef  = n(row['Quantity refunded']);
    const price   = n(row['Price']);

    const key = sku || name;
    if (!key) continue;

    const displayName = name + (variant ? ` — ${variant}` : '');

    if (!productMap[key]) {
      productMap[key] = {
        name:         displayName,
        sku,
        orders:       0,
        qty:          0,
        revenue:      0,
        refunded_qty: 0,
      };
    }
    productMap[key].orders       += 1;
    productMap[key].qty          += qty;
    productMap[key].revenue      += price * qty;
    productMap[key].refunded_qty += qtyRef;
  }

  // Convert to array, compute AOV, sort by revenue
  const products = Object.values(productMap)
    .map(p => ({
      ...p,
      aov: p.orders > 0 ? p.revenue / p.orders : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  return { products };
}
