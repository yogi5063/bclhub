/**
 * supabase.js — Supabase client + data fetch helpers
 * Provides real-time data from Supabase DB.
 * Falls back gracefully if SUPABASE_URL / SUPABASE_KEY not set.
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

let _client = null;

export function getSupabase() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  if (!_client) {
    _client = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false }
    });
  }
  return _client;
}

/**
 * Fetch all territory data from Supabase and return in the same shape
 * as data_cache.json so the rest of the server code is unchanged.
 */
export async function fetchCacheFromSupabase(period = null) {
  const sb = getSupabase();
  if (!sb) return null;

  try {
    let query = sb.from('territory_data').select('*').order('territory');
    if (period) query = query.eq('period', period);

    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) return null;

    const parsed = {};
    for (const row of data) {
      const key = `${row.territory}||${row.period}`;
      parsed[key] = {
        territory:        row.territory,
        brand:            row.brand,
        currency:         row.currency         || 'MYR',
        local_currency:   row.local_currency,
        fx_rate_to_myr:   row.fx_rate_to_myr   || 1,
        period:           row.period,

        // Revenue
        gross:            row.gross            || 0,
        net:              row.net              || 0,
        shipping:         row.shipping         || 0,

        // Deductions
        refund_total:     row.refund_total     || 0,
        discount:         row.discount         || 0,
        tax:              row.tax              || 0,

        // Platform fees
        fee_payex:        row.fee_payex        || 0,
        fee_stripe:       row.fee_stripe       || 0,
        fee_paypal:       row.fee_paypal       || 0,
        fee_xendit:       row.fee_xendit       || 0,
        fee_tiktok:       row.fee_tiktok       || 0,
        fee_shopee:       row.fee_shopee       || 0,
        fee_lazada:       row.fee_lazada       || 0,
        fee_total:        row.fee_total        || 0,

        // Gateway gross
        gw_payex:         row.gw_payex         || 0,
        gw_stripe_gross:  row.gw_stripe_gross  || 0,
        gw_paypal_gross:  row.gw_paypal_gross  || 0,
        gw_xendit_gross:  row.gw_xendit_gross  || 0,
        gw_stripe_net:    row.gw_stripe_net    || 0,
        gw_paypal_net:    row.gw_paypal_net    || 0,
        gw_xendit_net:    row.gw_xendit_net    || 0,
        gw_settlement_net:row.gw_settlement_net|| 0,

        // Orders & fulfillment
        orders:           row.orders           || 0,
        orders_paid:      row.orders_paid      || 0,
        orders_unpaid:    row.orders_unpaid    || 0,
        orders_refunded:  row.orders_refunded  || 0,
        fulfilled:        row.fulfilled        || 0,
        unfulfilled:      row.unfulfilled      || 0,

        // P&L
        cogs:             row.cogs             || 0,
        gross_profit:     row.gross_profit     || 0,
        aov:              row.aov              || 0,
        margin_pct:       row.margin_pct       || 0,

        // Payments & bank
        payment:          row.payment          || 0,
        dbt:              row.dbt              || 0,
        bank_match:       row.bank_match       || 0,
        refund_auto:      row.refund_auto      || 0,
        refund_manual:    row.refund_manual    || 0,
        chargeback:       row.chargeback       || 0,

        // JSON blobs
        products:         row.products         || [],
        daily:            row.daily            || {},
        payment_methods:  row.payment_methods  || {},

        _source: 'supabase',
      };
    }

    return {
      generated_at: new Date().toISOString(),
      source:       'supabase',
      period:       period || data[0]?.period,
      parsed,
    };
  } catch (err) {
    console.error('[Supabase] fetchCacheFromSupabase error:', err.message);
    return null;
  }
}
