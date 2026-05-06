/**
 * ai_cfo.js — AI CFO Intelligence Engine (Layer 2)
 *
 * Uses Claude claude-sonnet-4-5 to analyze Citia Group's financial data and
 * respond to natural-language questions from the CEO and managers.
 *
 * Endpoints:
 *   POST /api/ai/chat        — conversational query
 *   POST /api/ai/insights    — auto-generate insights for a view
 *   POST /api/ai/report      — generate management report (PDF-ready)
 */

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── System Prompt — encodes full Citia Group business context ────────────────
const SYSTEM_PROMPT = `You are BCL Analytics — the intelligent financial reporting engine for Citia Group Ltd, a multi-entity veterinary pharmaceutical business.
You are built and operated by BCL, Citia Group's accounting and financial intelligence partner.
You have access to real-time financial data across all entities and territories for March 2026.

## ENTITY STRUCTURE
- **Citia Group Ltd** (RAK ICC, UAE) — Holding company. All intercompany flows consolidate here.
- **Perk Labs FZCO** (UAE) — Primary distribution and gateway collection hub.
- **Paw Management Sdn Bhd** (Malaysia) — Gateway operator (PayEx), local service provider. Operates BasmiFIP Malaysia marketplace (Shopee/Lazada/EasyStore/TikTok).
- **RxSciences Sdn Bhd** (Malaysia) — Manufacturer for Basmi/Cure FIP products.
- **Truvet Private Limited** (Singapore) — Manufacturer, HerpX/HeartRx pipeline.
- **Sapelo Pharma Pvt Ltd** (India) — Local distributor/service provider.
- **PT PMA Sapelo Pharma** (Indonesia) — Local service provider.
- **Tulayhub OPC** (Philippines) — Local service provider (quarterly remittance).
- **2020 Consulting Pvt Ltd** (Thailand) — Local service provider.

## BRANDS & PRODUCTS
- **CureFIP (GS-441524)**: Korea, Japan, Europe, GCC, USA, Latam, Brasil, Molnu, Oceania
- **BasmiFIP (GS-441524)**: Indonesia, India, Philippines, Thailand, Malaysia
- **MolnuFIP/CaliciX (EIDD-1931)**: Molnu territory
- **HerpX/HeartRx (Truvet pipeline)**: Pre-revenue stage

## PAYMENT GATEWAYS
- PayEx: Malaysia, Indonesia, India, Philippines, Thailand, Brasil, Latam, Korea, Europe, GCC, USA, Molnu
- PayPal: USA, Korea, Japan, Brasil, Latam, Europe, GCC, Oceania, Molnu
- Stripe: Korea, Japan, Europe
- Xendit: Philippines, Indonesia
- DBT (Direct Bank Transfer): Indonesia, India, Philippines, Thailand

## REPORTING CURRENCY
All monetary amounts are in **MYR (Malaysian Ringgit)** unless otherwise stated.

## KEY KPIs
- Net Revenue = Gross Revenue - Refunds - Discounts - Tax
- Gross Profit = Net Revenue - Platform/Gateway Fees
- Net Margin % = Net Revenue / Gross Revenue × 100
- MDR Rate % = Gateway Fees / Gross Revenue × 100

## INTERCOMPANY FLOWS
1. Gateway collections (PayEx/PayPal/Stripe/Xendit) → Paw Management (MY) → Citia Group (UAE)
2. DBT transfers → Citia Group Bank directly
3. Marketplace revenue (MY) → Paw Management → Citia Group

## BOOKKEEPER CHECKLIST CONTEXT
The monthly bookkeeper checklist (Leon's) covers 76 tasks across 4 weeks:
- Week 1: Bank reconciliation (9 entities), local agent remittance verification
- Week 1-2: 3-way gateway reconciliation (e-commerce → gateway → bank)
- Week 2: Expense recording, payroll (15 staff across entities)
- Week 2-3: Intercompany reconciliation, inventory/COGS
- Week 3: Management accounts, tax compliance (TH/MY/PH/SG/UAE)
- Week 4: Month-end close, data security

## YOUR ROLE
- Analyze financial data and provide specific, numbered insights with MYR amounts
- Flag anomalies: unexpected fee rates, refund spikes, unreconciled items
- Generate management-ready summaries
- Answer CEO questions about any territory, entity, brand, or KPI
- Map checklist tasks to data already available in the system
- Always reference specific MYR amounts from the data provided
- If asked to generate journal entries or accounting treatments, reference the intercompany structure above
- Be direct, specific, and actionable — no vague commentary

## OUTPUT FORMAT
- Lead with the KEY NUMBER or ANSWER in bold
- Follow with supporting analysis in bullet points
- Flag anomalies with ⚠️
- Positive highlights with ✅
- Action items with 🔴 (urgent) or 🟡 (this month)
- Keep responses concise unless a full report is requested`;


// ── Load financial data context ───────────────────────────────────────────────
function loadFinancialContext() {
  const cachePath = path.join(__dirname, 'data_cache.json');
  if (!existsSync(cachePath)) return null;
  try {
    const cache = JSON.parse(readFileSync(cachePath, 'utf-8'));
    return cache.parsed || {};
  } catch { return null; }
}


// ── Build data summary for context window ─────────────────────────────────────
function buildDataContext(parsed, territoryFilter = null) {
  if (!parsed) return 'No financial data loaded.';

  const entries = Object.values(parsed);
  const filtered = territoryFilter
    ? entries.filter(r => r.territory?.toLowerCase() === territoryFilter.toLowerCase())
    : entries;

  if (filtered.length === 0) return 'No matching data found.';

  // Build concise financial summary
  const lines = ['## MARCH 2026 FINANCIAL DATA\n'];

  // Grand totals
  const T = filtered.reduce((acc, r) => {
    acc.gross   += r.gross || 0;
    acc.net     += r.net   || 0;
    acc.refunds += r.refund_total || 0;
    acc.fees    += r.fee_total || 0;
    acc.orders  += r.orders || 0;
    acc.gp      += (r.net || 0) - (r.fee_total || 0);
    return acc;
  }, { gross:0, net:0, refunds:0, fees:0, orders:0, gp:0 });

  const fmt = v => `MYR ${Math.round(v).toLocaleString()}`;
  lines.push(`### CONSOLIDATED TOTALS (${filtered.length} territories)`);
  lines.push(`- Gross Revenue: ${fmt(T.gross)}`);
  lines.push(`- Net Revenue: ${fmt(T.net)}`);
  lines.push(`- Total Refunds: ${fmt(T.refunds)} (${T.gross>0?(T.refunds/T.gross*100).toFixed(1):'0'}%)`);
  lines.push(`- Gateway Fees: ${fmt(T.fees)} (${T.gross>0?(T.fees/T.gross*100).toFixed(2):'0'}%)`);
  lines.push(`- Gross Profit: ${fmt(T.gp)}`);
  lines.push(`- Total Orders: ${T.orders.toLocaleString()}`);
  lines.push(`- Net Margin: ${T.gross>0?(T.net/T.gross*100).toFixed(1):'0'}%\n`);

  // Per territory
  lines.push('### BY TERRITORY');
  const sorted = filtered.slice().sort((a,b) => (b.net||0)-(a.net||0));
  for (const r of sorted) {
    const gp = (r.net||0) - (r.fee_total||0);
    const margin = (r.gross||0) > 0 ? ((r.net||0)/(r.gross||0)*100).toFixed(1) : '0';
    const feeRate = (r.gross||0) > 0 ? ((r.fee_total||0)/(r.gross||0)*100).toFixed(2) : '0';
    lines.push(`\n**${r.territory}** (${r.brand})`);
    lines.push(`  Orders: ${r.orders||0} | Gross: ${fmt(r.gross||0)} | Net: ${fmt(r.net||0)}`);
    lines.push(`  Refunds: ${fmt(r.refund_total||0)} | Fees: ${fmt(r.fee_total||0)} (${feeRate}%) | GP: ${fmt(gp)} | Margin: ${margin}%`);
    lines.push(`  Gateways: PayEx=${fmt(r.gw_payex||0)} | PayPal=${fmt(r.gw_paypal_gross||0)} | Stripe=${fmt(r.gw_stripe_gross||0)} | Xendit=${fmt(r.gw_xendit_gross||0)}`);
    if ((r.products||[]).length > 0) {
      const topSku = r.products.slice().sort((a,b)=>b.gp_myr-a.gp_myr)[0];
      if (topSku) lines.push(`  Top SKU: ${topSku.sku} — GP ${fmt(topSku.gp_myr)}`);
    }
  }

  return lines.join('\n');
}


// ── Conversation history (in-memory, per session) ─────────────────────────────
const conversationHistory = new Map(); // sessionId → [{role, content}]

function getHistory(sessionId) {
  if (!conversationHistory.has(sessionId)) {
    conversationHistory.set(sessionId, []);
  }
  return conversationHistory.get(sessionId);
}

function addToHistory(sessionId, role, content) {
  const history = getHistory(sessionId);
  history.push({ role, content });
  // Keep last 20 messages to avoid context overflow
  if (history.length > 20) history.splice(0, history.length - 20);
}


// ── Route handlers ─────────────────────────────────────────────────────────────
export async function handleChat(req, res) {
  const { message, sessionId = 'default', territory = null, clearHistory = false } = req.body;

  if (!message?.trim()) {
    return res.status(400).json({ error: 'Message required' });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  if (clearHistory) conversationHistory.delete(sessionId);

  const parsed = loadFinancialContext();
  const dataContext = buildDataContext(parsed, territory);
  const history = getHistory(sessionId);

  addToHistory(sessionId, 'user', message);

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 2048,
      system: SYSTEM_PROMPT + '\n\n' + dataContext,
      messages: history,
    });

    const reply = response.content[0].text;
    addToHistory(sessionId, 'assistant', reply);

    res.json({
      reply,
      sessionId,
      usage: response.usage,
    });
  } catch (err) {
    console.error('Claude API error:', err);
    res.status(500).json({ error: err.message || 'Claude API error' });
  }
}


export async function handleInsights(req, res) {
  const { view = 'overview', territory = null } = req.body;

  const parsed = loadFinancialContext();
  const dataContext = buildDataContext(parsed, territory);

  const viewPrompts = {
    overview:      'Generate 4 key insights for the CEO from this month\'s consolidated financial data. Focus on: 1) biggest revenue territory, 2) highest fee rate territory, 3) best/worst gross profit margin, 4) one anomaly or risk to flag.',
    payments:      'Analyze the gateway fee structure across all territories. Identify: which gateway has the highest effective MDR rate, any unusual fee patterns, and one optimization opportunity.',
    products:      'Analyze SKU performance. Identify the top 3 value-generating SKUs, any loss-making SKUs that need attention, and the product line with best gross margin.',
    'pl-detail':   'Generate a P&L commentary for the management pack. Summarize performance vs expectation, top 3 contributors to net revenue, and any line items requiring explanation.',
    leakage:       'Analyze revenue leakage. Which territory has the highest leakage rate? What is the biggest category (refunds/fees/tax)? What is the total MYR at risk?',
    'gateway-recon': 'Provide a gateway reconciliation health check. Are all gateways showing expected settlement rates? Any unreconciled amounts to flag?',
    trends:        'Identify the key revenue trend this month. Which territories are growing vs declining? What does the run rate suggest for next month?',
  };

  const prompt = viewPrompts[view] || viewPrompts.overview;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1024,
      system: SYSTEM_PROMPT + '\n\n' + dataContext,
      messages: [{ role: 'user', content: prompt }],
    });

    res.json({ insights: response.content[0].text, view });
  } catch (err) {
    console.error('Claude insights error:', err);
    res.status(500).json({ error: err.message });
  }
}


export async function handleReport(req, res) {
  const { reportType = 'monthly_management' } = req.body;

  const parsed = loadFinancialContext();
  const dataContext = buildDataContext(parsed, null);

  const reportPrompts = {
    monthly_management: `Generate a full Monthly Management Accounts Commentary for March 2026 in the following structure:

1. EXECUTIVE SUMMARY (3 sentences — total net revenue, key highlight, key risk)
2. REVENUE PERFORMANCE
   - Group total vs prior month (estimate based on trends)
   - Top 3 territories by net revenue
   - Territories with notable changes
3. GROSS PROFIT ANALYSIS
   - Group gross profit margin
   - Best and worst performing territories on GP%
   - Gateway fee rates by territory
4. ANOMALIES & RISKS (bullet list of items requiring management attention)
5. ACTION ITEMS (numbered list for bookkeeper/management)
6. NEXT MONTH OUTLOOK

Use specific MYR amounts from the data. Be concise and professional — this goes to the board.`,

    weekly_flash: `Generate a Weekly Flash Report for management:
1. Revenue MTD: [total + % of last month's total]
2. Top performer this week: [territory + amount]
3. Cash position: [note if data available]
4. Top 3 anomalies or items needing action this week
5. One sentence on next week's focus

Keep it under 200 words. WhatsApp-friendly format.`,

    checklist_status: `Based on the financial data available, generate a Bookkeeper Checklist Status Report:

For each major checklist category, indicate:
✅ AUTO-COMPLETED (data in system confirms this is done)
⚠️ NEEDS REVIEW (data exists but manual confirmation required)
🔴 ACTION REQUIRED (data missing or anomaly detected)

Categories: Bank Reconciliation | Gateway Reconciliation | Revenue Recognition | Intercompany | Tax Compliance | Month-end Close`,
  };

  const prompt = reportPrompts[reportType] || reportPrompts.monthly_management;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 4096,
      system: SYSTEM_PROMPT + '\n\n' + dataContext,
      messages: [{ role: 'user', content: prompt }],
    });

    res.json({ report: response.content[0].text, reportType });
  } catch (err) {
    console.error('Claude report error:', err);
    res.status(500).json({ error: err.message });
  }
}
