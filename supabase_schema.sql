-- ============================================================
--  BCL Hub — Supabase Schema
--  Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- Territory data table (one row per territory per period)
CREATE TABLE IF NOT EXISTS territory_data (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  territory         TEXT NOT NULL,
  period            TEXT NOT NULL,   -- e.g. '2026-03'
  brand             TEXT,
  currency          TEXT DEFAULT 'MYR',
  local_currency    TEXT,
  fx_rate_to_myr    DECIMAL(12,6)   DEFAULT 1,

  -- Revenue
  gross             DECIMAL(18,2)   DEFAULT 0,
  net               DECIMAL(18,2)   DEFAULT 0,
  shipping          DECIMAL(18,2)   DEFAULT 0,

  -- Deductions
  refund_total      DECIMAL(18,2)   DEFAULT 0,
  discount          DECIMAL(18,2)   DEFAULT 0,
  tax               DECIMAL(18,2)   DEFAULT 0,

  -- Platform / gateway fees
  fee_payex         DECIMAL(18,2)   DEFAULT 0,
  fee_stripe        DECIMAL(18,2)   DEFAULT 0,
  fee_paypal        DECIMAL(18,2)   DEFAULT 0,
  fee_xendit        DECIMAL(18,2)   DEFAULT 0,
  fee_tiktok        DECIMAL(18,2)   DEFAULT 0,
  fee_shopee        DECIMAL(18,2)   DEFAULT 0,
  fee_lazada        DECIMAL(18,2)   DEFAULT 0,
  fee_total         DECIMAL(18,2)   DEFAULT 0,

  -- Gateway gross amounts
  gw_payex          DECIMAL(18,2)   DEFAULT 0,
  gw_stripe_gross   DECIMAL(18,2)   DEFAULT 0,
  gw_paypal_gross   DECIMAL(18,2)   DEFAULT 0,
  gw_xendit_gross   DECIMAL(18,2)   DEFAULT 0,
  gw_stripe_net     DECIMAL(18,2)   DEFAULT 0,
  gw_paypal_net     DECIMAL(18,2)   DEFAULT 0,
  gw_xendit_net     DECIMAL(18,2)   DEFAULT 0,
  gw_settlement_net DECIMAL(18,2)   DEFAULT 0,

  -- Orders & fulfilment
  orders            INTEGER         DEFAULT 0,
  orders_paid       INTEGER         DEFAULT 0,
  orders_unpaid     INTEGER         DEFAULT 0,
  orders_refunded   INTEGER         DEFAULT 0,
  fulfilled         INTEGER         DEFAULT 0,
  unfulfilled       INTEGER         DEFAULT 0,

  -- P&L
  cogs              DECIMAL(18,2)   DEFAULT 0,
  gross_profit      DECIMAL(18,2)   DEFAULT 0,
  aov               DECIMAL(18,2)   DEFAULT 0,
  margin_pct        DECIMAL(8,4)    DEFAULT 0,

  -- Bank & payment
  payment           DECIMAL(18,2)   DEFAULT 0,
  dbt               DECIMAL(18,2)   DEFAULT 0,
  bank_match        DECIMAL(18,2)   DEFAULT 0,
  refund_auto       DECIMAL(18,2)   DEFAULT 0,
  refund_manual     DECIMAL(18,2)   DEFAULT 0,
  chargeback        DECIMAL(18,2)   DEFAULT 0,

  -- JSON blobs (arrays/objects)
  products          JSONB           DEFAULT '[]',
  daily             JSONB           DEFAULT '{}',
  payment_methods   JSONB           DEFAULT '{}',

  -- Metadata
  source            TEXT,
  updated_at        TIMESTAMPTZ     DEFAULT NOW(),

  UNIQUE (territory, period)
);

-- Auto-update updated_at on every upsert
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS territory_data_updated_at ON territory_data;
CREATE TRIGGER territory_data_updated_at
  BEFORE UPDATE ON territory_data
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Row Level Security: allow full access (internal tool, server uses service key)
ALTER TABLE territory_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON territory_data FOR ALL USING (true) WITH CHECK (true);

-- Useful index
CREATE INDEX IF NOT EXISTS idx_territory_period ON territory_data (territory, period);

-- ✅ Done! Table is ready.
SELECT 'territory_data table created ✓' AS status;
