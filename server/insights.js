/**
 * insights.js — AI Intelligence Engine for BCL Hub
 *
 * Generates section-level financial insights using Claude API.
 * Each dashboard section gets specific, actionable intelligence:
 *   • Trend analysis (MoM comparison)
 *   • Anomaly detection (thresholds, outliers)
 *   • Recommendations (actionable next steps)
 *   • Alerts (things requiring attention)
 *
 * Architecture: RAG-style — retrieve relevant financial context
 * → pass to Claude → return structured insights with traffic lights
 */
import Anthropic from '@anthropic-ai/sdk';
import express from 'express';
import { requireAuth } from './middleware.js';
import { getSupabase } from './supabase.js';

export const insightsRouter = express.Router();
insightsRouter.use(requireAuth);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Section definitions ────────────────────────────────────────────────────────
const SECTION_PROMPTS = {
  overview: `You are a CFO-level financial analyst for a pharmaceutical distribution company (Citia Group)
operating across 14 territories. Analyze the overview financial data and generate 5 specific insights.
Focus on: revenue trends, margin health, territory performance gaps, order volume patterns.`,

  revenue: `You are analyzing revenue data for a pharmaceutical MIS. Generate 5 specific insights about:
revenue composition, territory mix, brand performance, gross vs net gap, shipping revenue trends.`,

  payments: `You are a treasury analyst. Analyze gateway payment data and generate 5 insights about:
payment method mix, gateway fee rates (flag if >2%), settlement delays, currency exposure, collection efficiency.`,

  products: `You are a product/SKU analyst. Generate 5 insights about:
top performing SKUs, loss-making products, quantity trends, revenue concentration risk, SKU margin analysis.`,

  reconciliation: `You are a reconciliation specialist. Analyze gateway vs Wix vs bank data and generate 5 insights about:
matched vs unmatched orders, pending settlements, fee discrepancies, unsettled amounts, gateway performance.`,

  geography: `You are analyzing territory-level financial performance. Generate 5 insights about:
territory growth rates, underperforming regions, market concentration, currency impact, territory-specific anomalies.`,

  leakage: `You are analyzing revenue leakage. Generate 5 insights about:
refund rates by territory, discount effectiveness, tax collection gaps, chargeback trends, fee optimization opportunities.`,

  pl: `You are a P&L analyst. Generate 5 insights about:
gross margin trends, COGS efficiency, operating leverage, fee burden, net profit drivers.`,
};

// ── Format thresholds for context ──────────────────────────────────────────────
const THRESHOLDS = {
  mdr_rate_max: 2.0,       // % — flag if gateway fees > 2% of gross
  refund_rate_max: 3.0,    // % — flag if refunds > 3% of gross
  net_margin_min: 85.0,    // % — warn if net margin < 85%
  fulfillment_min: 95.0,   // % — warn if fulfillment rate < 95%
  aov_drop_pct: 10.0,      // % — alert if AoV drops > 10% MoM
};

// ── Generate insights for a section ───────────────────────────────────────────
async function generateInsights(section, data, prevData = null) {
  const systemPrompt = SECTION_PROMPTS[section] || SECTION_PROMPTS.overview;

  // Build structured context
  const context = buildContext(section, data, prevData);

  const message = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 1024,
    system: systemPrompt + `\n\nReturn ONLY a JSON array of exactly 5 insight objects with this structure:
[
  {
    "type": "trend|anomaly|alert|recommendation|positive",
    "icon": "📈|⚠️|🔴|💡|✅",
    "title": "Short title (max 8 words)",
    "detail": "Specific detail with numbers (max 25 words)",
    "action": "What to do about it (max 15 words, or null if no action needed)"
  }
]
Use real numbers from the data. Be specific. No generic statements.`,
    messages: [{
      role: 'user',
      content: `Financial data for period ${data.period || 'current'}:\n\n${JSON.stringify(context, null, 2)}\n\nGenerate 5 specific insights as JSON array.`
    }]
  });

  const text = message.content[0].text.trim();
  // Extract JSON from response
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('Invalid insights response format');
  return JSON.parse(match[0]);
}

// ── Build context from data ────────────────────────────────────────────────────
function buildContext(section, data, prevData) {
  const territories = Object.values(data.parsed || {});
  if (!territories.length) return { error: 'No data available' };

  const current = aggregateTerritories(territories);
  const prev = prevData ? aggregateTerritories(Object.values(prevData.parsed || {})) : null;

  const base = {
    period: data.period,
    territories_count: territories.length,
    total_orders: current.orders,
    gross_revenue_myr: current.gross,
    net_revenue_myr: current.net,
    refunds_myr: current.refund_total,
    discounts_myr: current.discount,
    gateway_fees_myr: current.fee_total,
    gross_profit_myr: current.gross_profit,
    net_margin_pct: current.gross > 0 ? (current.net / current.gross * 100).toFixed(1) : 0,
    fee_rate_pct: current.gross > 0 ? (current.fee_total / current.gross * 100).toFixed(1) : 0,
    refund_rate_pct: current.gross > 0 ? (current.refund_total / current.gross * 100).toFixed(1) : 0,
    avg_order_value: current.orders > 0 ? (current.net / current.orders).toFixed(0) : 0,
    thresholds: THRESHOLDS,
  };

  // MoM comparison
  if (prev && prev.net > 0) {
    base.mom_net_change_pct = ((current.net - prev.net) / prev.net * 100).toFixed(1);
    base.mom_orders_change_pct = ((current.orders - prev.orders) / prev.orders * 100).toFixed(1);
    base.prev_period_net = prev.net;
  }

  // Territory breakdown
  base.top_territories = territories
    .sort((a, b) => (b.net || 0) - (a.net || 0))
    .slice(0, 5)
    .map(t => ({ territory: t.territory, net: t.net, orders: t.orders, margin: t.margin_pct }));

  // Section-specific data
  if (section === 'payments') {
    base.gateway_breakdown = {
      payex: { gross: current.gw_payex, fee: current.fee_payex },
      stripe: { gross: current.gw_stripe_gross, fee: current.fee_stripe },
      paypal: { gross: current.gw_paypal_gross, fee: current.fee_paypal },
    };
  }

  if (section === 'leakage') {
    base.refund_by_territory = territories
      .map(t => ({ territory: t.territory, refund_rate: t.gross > 0 ? (t.refund_total / t.gross * 100).toFixed(1) : 0 }))
      .sort((a, b) => b.refund_rate - a.refund_rate)
      .slice(0, 5);
  }

  if (section === 'products') {
    const allProducts = territories.flatMap(t => t.products || []);
    base.top_skus = allProducts
      .reduce((acc, p) => {
        const ex = acc.find(x => x.sku === p.sku);
        if (ex) { ex.qty += p.qty; ex.net_myr += p.net_myr; }
        else acc.push({ ...p });
        return acc;
      }, [])
      .sort((a, b) => b.net_myr - a.net_myr)
      .slice(0, 10);
  }

  return base;
}

function aggregateTerritories(territories) {
  const sum = (key) => territories.reduce((s, t) => s + (t[key] || 0), 0);
  return {
    orders: sum('orders'), gross: sum('gross'), net: sum('net'),
    refund_total: sum('refund_total'), discount: sum('discount'), tax: sum('tax'),
    fee_total: sum('fee_total'), fee_payex: sum('fee_payex'), fee_stripe: sum('fee_stripe'),
    fee_paypal: sum('fee_paypal'), gw_payex: sum('gw_payex'),
    gw_stripe_gross: sum('gw_stripe_gross'), gw_paypal_gross: sum('gw_paypal_gross'),
    gross_profit: sum('gross_profit'),
  };
}

// ── Cache insights in Supabase ─────────────────────────────────────────────────
async function cacheInsights(section, period, insights, clientId) {
  const sb = getSupabase();
  if (!sb) return;
  await sb.from('ai_insights').upsert({
    section, period, insights, client_id: clientId,
    generated_at: new Date().toISOString()
  }, { onConflict: 'section,period,client_id' }).catch(() => {});
}

async function getCachedInsights(section, period, clientId) {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.from('ai_insights')
    .select('insights, generated_at')
    .eq('section', section).eq('period', period)
    .eq('client_id', clientId || null)
    .single();
  if (!data) return null;
  // Cache valid for 6 hours
  const age = Date.now() - new Date(data.generated_at).getTime();
  if (age > 6 * 60 * 60 * 1000) return null;
  return data.insights;
}

// ── Routes ─────────────────────────────────────────────────────────────────────

// POST /api/insights/:section — generate insights for a section
insightsRouter.post('/:section', async (req, res) => {
  const { section } = req.params;
  const { data, prevData, refresh = false } = req.body;
  const clientId = req.user.client_id;
  const period = data?.period || 'unknown';

  if (!SECTION_PROMPTS[section] && section !== 'all') {
    return res.status(400).json({ error: `Unknown section: ${section}` });
  }

  // Check cache unless refresh requested
  if (!refresh) {
    const cached = await getCachedInsights(section, period, clientId);
    if (cached) return res.json({ insights: cached, cached: true });
  }

  try {
    const insights = await generateInsights(section, data, prevData);
    await cacheInsights(section, period, insights, clientId);
    res.json({ insights, cached: false });
  } catch (e) {
    console.error('[insights]', section, e.message);
    res.status(500).json({ error: e.message, insights: getDefaultInsights(section) });
  }
});

// GET /api/insights/summary — quick summary for dashboard header
insightsRouter.post('/summary/quick', async (req, res) => {
  const { data } = req.body;
  if (!data?.parsed) return res.json({ summary: null });
  try {
    const territories = Object.values(data.parsed);
    const total = aggregateTerritories(territories);
    const margin = total.gross > 0 ? (total.net / total.gross * 100).toFixed(1) : 0;
    const feeRate = total.gross > 0 ? (total.fee_total / total.gross * 100).toFixed(1) : 0;

    const r = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 150,
      messages: [{
        role: 'user',
        content: `Financial MIS for ${territories.length} territories. Net: MYR ${total.net.toLocaleString()}, Margin: ${margin}%, Fee rate: ${feeRate}%, Orders: ${total.orders}. Write ONE sentence executive summary (max 20 words). Be specific with numbers.`
      }]
    });
    res.json({ summary: r.content[0].text });
  } catch (e) {
    res.json({ summary: null });
  }
});

// ── Default insights when Claude unavailable ───────────────────────────────────
function getDefaultInsights(section) {
  return [
    { type: 'trend', icon: '📊', title: 'Data loaded', detail: 'Financial data available for analysis', action: null },
    { type: 'recommendation', icon: '💡', title: 'Enable AI insights', detail: 'Connect Anthropic API key to enable intelligent analysis', action: 'Check API key in settings' },
  ];
}
