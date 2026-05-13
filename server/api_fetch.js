/**
 * api_fetch.js — Wix + Payex API fetchers
 * Saves fetched data to /tmp/uploads/{session}/ as Excel files
 * so process_uploads.py can process them the same way as manual uploads.
 */
import express from 'express';
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { requireAuth } from './middleware.js';

export const fetchRouter = express.Router();
fetchRouter.use(requireAuth);

const WIX_API_KEY    = process.env.WIX_API_KEY;
const WIX_ACCOUNT_ID = process.env.WIX_ACCOUNT_ID;
const PAYEX_KEY      = process.env.PAYEX_KEY;
const PAYEX_SECRET   = process.env.PAYEX_SECRET;
const UPLOAD_DIR     = process.env.UPLOAD_DIR || '/tmp/uploads';

// All 18 Wix site IDs mapped to territory names
const WIX_SITES = {
  'Korea':       '17043d52-7f40-4b38-8a3d-f794e3925bfc',
  'Japan':       '6c7bdef5-3ec0-4477-bb76-1cb814287625',
  'GCC':         '20e8cd54-1c95-4183-87a4-f9a4ae383b11',
  'USA':         'b510eda0-79a6-4eff-ae8b-7fdf3a3e85f3',
  'Oceania':     '91abf981-b3ba-48e7-8f4c-fefce269bedc',
  'Brasil':      '03b3dacc-bda1-48de-bada-e6a1c4256464',
  'Europe':      'fd926fda-20c9-49bd-8e13-acf63d76c2f1',
  'Latam':       '34bacec8-3b2b-4666-ab63-b4b5b7a7380d',
  'Molnu':       'e7fa3f4d-73b5-4877-80f7-3ee4e02c475d',
  'India':       'b84c2ff5-0db5-4e0a-a464-6e4700d15c52',
  'Philippines': '26351b4b-056f-4c5a-85a2-d1d7f78baaa9',
  'Indonesia':   'b4e5bcba-dc66-4970-82ef-420adede603f',
  'Thailand':    '052bf229-39ca-4320-98fe-892627e83d29',
};

function sessionDir(req) {
  const session = (req.user.sub || 'default').replace(/[^a-z0-9]/gi, '');
  const dir = path.join(UPLOAD_DIR, session);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function periodDates(period) {
  const [y, m] = period.split('-').map(Number);
  const start = new Date(y, m - 1, 1).toISOString().split('T')[0];
  const end   = new Date(y, m, 0).toISOString().split('T')[0];
  return { start, end };
}

// ── POST /api/fetch-wix ───────────────────────────────────────────────────────
fetchRouter.post('/fetch-wix', async (req, res) => {
  const { type, period = '2026-04' } = req.body || {};

  if (!WIX_API_KEY || !WIX_ACCOUNT_ID) {
    return res.status(503).json({ error: 'Wix API key not configured on server' });
  }

  const { start, end } = periodDates(period);
  const dir = sessionDir(req);

  try {
    let endpoint, label, count = 0, rows = [];

    if (type === 'wix_orders') {
      // Fetch orders from ALL Wix sites
      const allOrders = [];
      const siteResults = {};

      for (const [territory, siteId] of Object.entries(WIX_SITES)) {
        let cursor = null, siteCount = 0;
        do {
          const body = {
            search: {
              cursorPaging: { limit: 100, ...(cursor ? { cursor } : {}) },
              sort: [{ fieldName: '_createdDate', order: 'DESC' }]
            }
          };
          const r = await fetch('https://www.wixapis.com/ecom/v1/orders/search', {
            method: 'POST',
            headers: {
              'Authorization': WIX_API_KEY,
              'wix-account-id': WIX_ACCOUNT_ID,
              'wix-site-id': siteId,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
          });
          const data = await r.json();
          if (!r.ok || data.message) { break; }
          // Filter to requested period
          const periodOrders = (data.orders || []).filter(o => {
            const d = o._createdDate || o.dateCreated || '';
            return d.startsWith(period);
          });
          allOrders.push(...periodOrders.map(o => ({ ...o, _territory: territory })));
          siteCount += periodOrders.length;
          cursor = data.metadata?.cursors?.next;
          // Stop if no orders in this page match the period (sorted DESC)
          if ((data.orders || []).length > 0) {
            const oldestDate = data.orders[data.orders.length - 1]?._createdDate || '';
            if (oldestDate && oldestDate < period + '-01') break;
          }
          if (!cursor || allOrders.length > 10000) break;
        } while (cursor);
        siteResults[territory] = siteCount;
        count += siteCount;
      }

      const outPath = path.join(dir, `wix_orders_${Date.now()}.json`);
      writeFileSync(outPath, JSON.stringify({ period, rows: allOrders, site_counts: siteResults, fetched_at: new Date().toISOString() }));
      return res.json({ ok: true, count, site_counts: siteResults, path: outPath, source: 'wix_api' });

    } else if (type === 'wix_payments') {
      // Fetch transactions
      const r = await fetch(`https://www.wixapis.com/cashier/v1/transactions?startDate=${start}&endDate=${end}&limit=1000`, {
        headers: {
          'Authorization': WIX_API_KEY,
          'wix-account-id': WIX_ACCOUNT_ID,
        }
      });
      const data = await r.json();
      if (!r.ok || data.message) {
        return res.status(400).json({ error: data.message || 'Wix Payments API error' });
      }
      count = (data.transactions || []).length;
      const outPath = path.join(dir, `wix_payments_${Date.now()}.json`);
      writeFileSync(outPath, JSON.stringify({ period, rows: data.transactions || [], fetched_at: new Date().toISOString() }));
      return res.json({ ok: true, count, path: outPath, source: 'wix_api' });

    } else {
      return res.status(400).json({ error: 'Unknown type: ' + type });
    }

  } catch (e) {
    console.error('[fetch-wix]', e);
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/fetch-payex ─────────────────────────────────────────────────────
fetchRouter.post('/fetch-payex', async (req, res) => {
  const { email, period = '2026-04' } = req.body || {};

  if (!PAYEX_SECRET) {
    return res.status(503).json({ error: 'Payex secret not configured on server' });
  }
  if (!email) {
    return res.status(400).json({ error: 'Payex email required' });
  }

  const { start, end } = periodDates(period);
  const dir = sessionDir(req);

  try {
    // Step 1: Get auth token
    const authResp = await fetch('https://api.payex.io/api/Auth/Token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + Buffer.from(email + ':' + PAYEX_SECRET).toString('base64')
      },
      body: JSON.stringify({ username: email, password: PAYEX_SECRET })
    });
    const authData = await authResp.json();

    if (authData.status === '99' || !authData.result) {
      return res.status(401).json({ error: `Payex auth failed: ${authData.message || 'Invalid credentials'}` });
    }

    const token = authData.result?.token || authData.result;
    console.log('[fetch-payex] Token obtained, fetching settlements...');

    // Step 2: Get settlements
    const settlResp = await fetch(
      `https://api.payex.io/api/v1/Transactions/Settlements?startDate=${start}&endDate=${end}&pageSize=1000`,
      { headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/json' } }
    );
    const settlData = await settlResp.json();

    if (!settlResp.ok) {
      return res.status(400).json({ error: `Payex settlements error: ${JSON.stringify(settlData).substring(0,200)}` });
    }

    const settlements = settlData.result || settlData.data || settlData || [];
    const count = Array.isArray(settlements) ? settlements.length : 0;

    // Step 3: Get transactions for MDR
    const txnResp = await fetch(
      `https://api.payex.io/api/v1/Transactions?startDate=${start}&endDate=${end}&pageSize=1000`,
      { headers: { 'Authorization': 'Bearer ' + token } }
    );
    const txnData = await txnResp.json();
    const transactions = txnData.result || txnData.data || [];

    // Save to file
    const outPath = path.join(dir, `payex_${Date.now()}.json`);
    writeFileSync(outPath, JSON.stringify({
      period, start, end,
      settlements: Array.isArray(settlements) ? settlements : [],
      transactions: Array.isArray(transactions) ? transactions : [],
      fetched_at: new Date().toISOString()
    }));

    res.json({ ok: true, count, path: outPath, source: 'payex_api' });

  } catch (e) {
    console.error('[fetch-payex]', e);
    res.status(500).json({ error: e.message });
  }
});
