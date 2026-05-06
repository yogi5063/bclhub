#!/usr/bin/env python3
"""
parse_data.py — FIP MIS Data Parser
Reads raw Wix.com CSV files from UPLOAD_DIR/Wix.com/, computes TerritoryResult objects,
and writes server/data_cache.json for the dashboard to consume.

Usage: python parse_data.py
"""

import os
import re
import json
import pandas as pd
from pathlib import Path
from datetime import datetime

# ── Config ────────────────────────────────────────────────────────────────────
SCRIPT_DIR  = Path(__file__).parent
UPLOAD_DIR  = Path(os.environ.get('UPLOAD_DIR', 'D:/Perklabs-mis/Upload'))

# settings.json overrides .env (written by the dashboard Settings UI)
_SETTINGS_FILE = SCRIPT_DIR / 'server' / 'settings.json'
if _SETTINGS_FILE.exists():
    try:
        _s = json.loads(_SETTINGS_FILE.read_text(encoding='utf-8'))
        if 'uploadDir' in _s:
            UPLOAD_DIR = Path(_s['uploadDir'])
    except Exception:
        pass

WIX_DIR     = UPLOAD_DIR / 'Wix.com'
OUTPUT_FILE = SCRIPT_DIR / 'server' / 'data_cache.json'

# ── Territory map ─────────────────────────────────────────────────────────────
WIX_TERRITORY_MAP = {
    'India':       {'brand': 'Basmi', 'currency': 'INR'},
    'Malaysia':    {'brand': 'Basmi', 'currency': 'MYR'},
    'Philippines': {'brand': 'Basmi', 'currency': 'PHP'},
    'Thailand':    {'brand': 'Basmi', 'currency': 'THB'},
    'Indonesia':   {'brand': 'Basmi', 'currency': 'IDR'},
    'Vietnam':     {'brand': 'Basmi', 'currency': 'VND'},
    'Brazil':      {'brand': 'Cure',  'currency': 'BRL'},
    'Europe':      {'brand': 'Cure',  'currency': 'EUR'},
    'GCC':         {'brand': 'Cure',  'currency': 'AED'},
    'Japan':       {'brand': 'Cure',  'currency': 'JPY'},
    'Korea':       {'brand': 'Cure',  'currency': 'KRW'},
    'Latam':       {'brand': 'Cure',  'currency': 'USD'},
    'Oceania':     {'brand': 'Cure',  'currency': 'AUD'},
    'USA':         {'brand': 'Cure',  'currency': 'USD'},
    'Molnu':       {'brand': 'Molnu', 'currency': 'USD'},
}

# ── Helpers ───────────────────────────────────────────────────────────────────
def empty_result(territory, brand, currency):
    return {
        'territory': territory, 'brand': brand, 'currency': currency,
        'gross': 0.0, 'discount': 0.0, 'shipping': 0.0,
        'refund_auto': 0.0, 'refund_manual': 0.0, 'refund_total': 0.0, 'chargeback': 0.0,
        'fee_payex': 0.0, 'fee_paypal': 0.0, 'fee_xendit': 0.0,
        'fee_tiktok': 0.0, 'fee_shopee': 0.0, 'fee_lazada': 0.0, 'fee_total': 0.0,
        'net': 0.0, 'margin_pct': 0.0, 'aov': 0.0, 'orders': 0,
        'products': [], 'states': [], 'payment_methods': [], 'platforms': [],
        'daily': {},
        'ar': {'payex_gross_myr': 0.0, 'payex_fee_myr': 0.0, 'payex_net_myr': 0.0,
               'bank_receipts_myr': 0.0, 'ar_balance_myr': 0.0},
        'fx_rate_to_myr': 0.0,
        'warnings': [], 'errors': [],
    }

def finalise(r):
    r['refund_total'] = r['refund_auto'] + r['refund_manual'] + r['chargeback']
    r['fee_total']    = (r['fee_payex'] + r['fee_paypal'] + r['fee_xendit'] +
                         r['fee_tiktok'] + r['fee_shopee'] + r['fee_lazada'])
    r['net']          = r['gross'] - r['shipping'] - r['refund_total'] - r['fee_total']
    r['margin_pct']   = (r['net'] / r['gross'] * 100) if r['gross'] > 0 else 0.0
    r['aov']          = (r['gross'] / r['orders']) if r['orders'] > 0 else 0.0

def to_float(val):
    """Strip commas/currency symbols and parse to float."""
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return 0.0
    s = re.sub(r'[,₩¥฿₹₱$€£\s]', '', str(val).strip())
    try:
        return float(s)
    except ValueError:
        return 0.0

def parse_date_key(date_str, dayfirst=True):
    """Parse Wix date strings → 'YYYY-MM-DD'. Returns None if unparseable.
    dayfirst=True  → DD/MM/YYYY (most Wix locales)
    dayfirst=False → MM/DD/YYYY (Americas: Brazil, Latam, USA)
    """
    if not date_str or (isinstance(date_str, float) and pd.isna(date_str)):
        return None
    s = str(date_str).strip()
    # "DD/MM/YYYY, ..." or "MM/DD/YYYY, ..."
    m = re.match(r'(\d{1,2})/(\d{1,2})/(\d{4})', s)
    if m:
        g1, g2, yr = int(m.group(1)), int(m.group(2)), m.group(3)
        # Auto-detect if unambiguous: if g1 > 12, must be DD/MM; if g2 > 12, must be MM/DD
        if g1 > 12:
            return f"{yr}-{g2:02d}-{g1:02d}"   # DD/MM/YYYY
        if g2 > 12:
            return f"{yr}-{g1:02d}-{g2:02d}"   # MM/DD/YYYY
        # Ambiguous — use caller-supplied preference
        if dayfirst:
            return f"{yr}-{g2:02d}-{g1:02d}"   # DD/MM/YYYY
        else:
            return f"{yr}-{g1:02d}-{g2:02d}"   # MM/DD/YYYY
    # "Dec 31, 2025"
    m2 = re.match(r'([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})', s)
    if m2:
        mon_map = {'jan':'01','feb':'02','mar':'03','apr':'04','may':'05','jun':'06',
                   'jul':'07','aug':'08','sep':'09','oct':'10','nov':'11','dec':'12'}
        mon = mon_map.get(m2.group(1).lower()[:3])
        if mon:
            return f"{m2.group(3)}-{mon}-{m2.group(2).zfill(2)}"
    # ISO "YYYY-MM-DD"
    m3 = re.match(r'(\d{4}-\d{2}-\d{2})', s)
    if m3:
        return m3.group(1)
    return None


def detect_dayfirst(filepath, date_col_hints):
    """Sniff a CSV to determine if dates are DD/MM or MM/DD.
    Returns True (dayfirst) if evidence suggests DD/MM, False for MM/DD."""
    try:
        raw = pd.read_csv(filepath, header=None, dtype=str,
                          encoding='utf-8-sig', on_bad_lines='skip', nrows=50)
    except Exception:
        return True  # default DD/MM
    if len(raw) < 3:
        return True
    headers = list(raw.iloc[1])
    date_i = find_col(headers, date_col_hints)
    if date_i < 0:
        return True
    for _, row in raw.iloc[2:].iterrows():
        val = str(row.get(date_i, '') or '').strip()
        m = re.match(r'(\d{1,2})/(\d{1,2})/(\d{4})', val)
        if m:
            g1, g2 = int(m.group(1)), int(m.group(2))
            if g1 > 12:
                return True   # day is first → DD/MM
            if g2 > 12:
                return False  # month is first → MM/DD
    return True  # default DD/MM

def find_col(headers, candidates):
    """Return index of first header that contains any candidate string (case-insensitive)."""
    h_lower = [str(h).lower().strip() for h in headers]
    for cand in candidates:
        cl = cand.lower()
        for i, h in enumerate(h_lower):
            if cl in h:
                return i
    return -1

# ── Payment CSV Parser ─────────────────────────────────────────────────────────
def parse_wix_payments(filepath):
    """
    Parse a Wix Payments CSV.
    Row 0: section group headers (skip)
    Row 1: real column headers
    Row 2+: data
    """
    dayfirst = detect_dayfirst(filepath, ['payment date'])
    try:
        raw = pd.read_csv(filepath, header=None, dtype=str,
                          encoding='utf-8-sig', on_bad_lines='skip')
    except Exception as e:
        print(f"    ERROR reading payments {filepath.name}: {e}")
        return None

    if len(raw) < 3:
        return None

    headers = list(raw.iloc[1])
    data    = raw.iloc[2:].reset_index(drop=True)
    data.columns = range(len(data.columns))

    date_i   = find_col(headers, ['payment date'])
    cur_i    = find_col(headers, ['currency'])
    amt_i    = find_col(headers, ['amount'])
    proc_i   = find_col(headers, ['processing fee'])
    svc_i    = find_col(headers, ['service fee'])
    status_i = find_col(headers, ['transaction status'])
    refund_i = find_col(headers, ['refund amount'])
    prov_i   = find_col(headers, ['payment provider', 'provider'])
    meth_i   = find_col(headers, ['payment method'])
    name_i   = find_col(headers, ['name'])
    qty_i    = find_col(headers, ['quantity'])
    disc_i   = find_col(headers, ['discount'])
    ship_i   = find_col(headers, ['shipping'])

    result = {
        'gross': 0.0, 'discount': 0.0, 'shipping': 0.0,
        'refund_auto': 0.0, 'fee_processing': 0.0, 'fee_service': 0.0,
        'orders': 0, 'currency': None,
        'daily': {}, 'payment_methods': {}, 'products': {},
    }

    for _, row in data.iterrows():
        date_val = row.get(date_i) if date_i >= 0 else None
        if date_val is None or pd.isna(date_val):
            continue
        status = str(row.get(status_i, '') or '').lower().strip()
        if status in ('failed', 'voided', 'pending'):
            continue

        amt    = to_float(row.get(amt_i))
        refund = to_float(row.get(refund_i))
        disc   = to_float(row.get(disc_i))
        ship   = to_float(row.get(ship_i))
        p_fee  = abs(to_float(row.get(proc_i)))
        s_fee  = abs(to_float(row.get(svc_i)))

        result['gross']          += amt
        result['refund_auto']    += refund
        result['discount']       += disc
        result['shipping']       += ship
        result['fee_processing'] += p_fee
        result['fee_service']    += s_fee
        result['orders']         += 1

        if not result['currency'] and cur_i >= 0:
            cur_val = row.get(cur_i)
            if cur_val and not pd.isna(cur_val):
                result['currency'] = str(cur_val).strip()

        dk = parse_date_key(date_val, dayfirst=dayfirst)
        if dk:
            if dk not in result['daily']:
                result['daily'][dk] = {'orders': 0, 'revenue': 0.0}
            result['daily'][dk]['orders']  += 1
            result['daily'][dk]['revenue'] += amt

        # Payment method — prefer 'Payment Method' col, fallback to 'Provider'
        method = ''
        if meth_i >= 0:
            method = str(row.get(meth_i) or '').strip()
        if not method and prov_i >= 0:
            method = str(row.get(prov_i) or '').strip()
        method = method or 'Other'

        if method not in result['payment_methods']:
            result['payment_methods'][method] = {'orders': 0, 'revenue': 0.0}
        result['payment_methods'][method]['orders']  += 1
        result['payment_methods'][method]['revenue'] += amt

        # Product (from Name column)
        prod = str(row.get(name_i) or '').strip() if name_i >= 0 else ''
        if prod:
            if prod not in result['products']:
                result['products'][prod] = {'orders': 0, 'revenue': 0.0}
            qty = max(1, int(to_float(row.get(qty_i)) or 1)) if qty_i >= 0 else 1
            result['products'][prod]['orders']  += qty
            result['products'][prod]['revenue'] += amt

    return result

# ── Order CSV Parser ───────────────────────────────────────────────────────────
def parse_wix_orders(filepath):
    """Parse Wix Orders CSV (row 0 = headers, row 1+ = data)."""
    try:
        df = pd.read_csv(filepath, dtype=str, encoding='utf-8-sig', on_bad_lines='skip')
    except Exception as e:
        print(f"    ERROR reading orders {filepath.name}: {e}")
        return None

    states = {}
    for _, row in df.iterrows():
        state = str(row.get('Delivery state', '') or '').strip()
        total = to_float(row.get('Total', 0))
        if state:
            if state not in states:
                states[state] = {'orders': 0, 'revenue': 0.0}
            states[state]['orders']  += 1
            states[state]['revenue'] += total

    return {'states': states}

# ── Items CSV Parser ───────────────────────────────────────────────────────────
def parse_wix_items(filepath):
    """Parse Wix Order Items CSV (row 0 = headers, row 1+ = data)."""
    try:
        df = pd.read_csv(filepath, dtype=str, encoding='utf-8-sig', on_bad_lines='skip')
    except Exception as e:
        print(f"    ERROR reading items {filepath.name}: {e}")
        return None

    products = {}
    for _, row in df.iterrows():
        name = str(row.get('Item', '') or '').strip()
        sku  = str(row.get('SKU', '') or '').strip()
        key  = sku or name
        if not key:
            continue
        qty     = max(1, int(to_float(row.get('Qty', 1)) or 1))
        qty_ref = int(to_float(row.get('Quantity refunded', 0)) or 0)
        price   = to_float(row.get('Price', 0))

        if key not in products:
            products[key] = {'name': name, 'sku': sku,
                             'orders': 0, 'qty': 0, 'revenue': 0.0, 'refunded_qty': 0}
        products[key]['orders']       += 1
        products[key]['qty']          += qty
        products[key]['revenue']      += price * qty
        products[key]['refunded_qty'] += qty_ref

    return {'products': products}

# ── Monthly split builder ──────────────────────────────────────────────────────
def build_monthly_splits(r):
    """Split a full-year TerritoryResult into monthly sub-results keyed by YYYY-MM."""
    total_gross = r['gross'] or 1.0
    monthly = {}

    for dk, v in r['daily'].items():
        month = dk[:7]  # YYYY-MM
        if month not in monthly:
            mr = empty_result(r['territory'], r['brand'], r['currency'])
            mr['_source']         = 'wix'
            mr['payment_methods'] = r['payment_methods']
            mr['products']        = r['products']
            mr['states']          = r['states']
            monthly[month] = mr
        monthly[month]['gross']      += v['revenue']
        monthly[month]['orders']     += v['orders']
        monthly[month]['daily'][dk]   = v

    for month, mr in monthly.items():
        prop = mr['gross'] / total_gross
        mr['discount']    = r['discount']    * prop
        mr['shipping']    = r['shipping']    * prop
        mr['refund_auto'] = r['refund_auto'] * prop
        mr['fee_payex']   = r['fee_payex']   * prop
        finalise(mr)
        mr['_period']   = month
        mr['platforms'] = [{'name': 'Wix', 'gross': mr['gross'],
                            'net': mr['net'], 'orders': mr['orders']}]
    return monthly

# ── Main ───────────────────────────────────────────────────────────────────────
def main():
    print(f"\n[parse_data] Scanning {WIX_DIR}")
    print(f"[parse_data] Output  -> {OUTPUT_FILE}\n")

    if not WIX_DIR.exists():
        print(f"ERROR: Wix.com folder not found at {WIX_DIR}")
        print("Set UPLOAD_DIR environment variable to your Upload folder path.")
        return

    # ── Collect files by territory ──────────────────────────────────────────
    territory_files = {}
    for type_folder in ['Payment', 'Order']:
        type_path = WIX_DIR / type_folder
        if not type_path.exists():
            print(f"  WARNING: {type_path} not found — skipping {type_folder} files")
            continue
        for terr_dir in sorted(type_path.iterdir()):
            if not terr_dir.is_dir():
                continue
            territory = terr_dir.name
            if territory not in WIX_TERRITORY_MAP:
                print(f"  SKIP: unknown territory '{territory}'")
                continue
            if territory not in territory_files:
                territory_files[territory] = {'payments': [], 'orders': [], 'items': []}
            for csv_file in sorted(terr_dir.glob('*.csv')):
                fn = csv_file.name.lower()
                if type_folder == 'Payment':
                    territory_files[territory]['payments'].append(csv_file)
                elif 'item' in fn:
                    territory_files[territory]['items'].append(csv_file)
                else:
                    territory_files[territory]['orders'].append(csv_file)

    # ── Parse each territory ────────────────────────────────────────────────
    parsed = {}
    for territory in sorted(territory_files):
        files = territory_files[territory]
        meta  = WIX_TERRITORY_MAP[territory]
        print(f"  [{territory}]  {len(files['payments'])} payment  "
              f"{len(files['orders'])} order  {len(files['items'])} item files")

        r = empty_result(territory, meta['brand'], meta['currency'])
        r['_source'] = 'wix'

        # Aggregate payment data
        method_map = {}
        prod_map   = {}
        for fp in files['payments']:
            wp = parse_wix_payments(fp)
            if not wp:
                continue
            r['gross']       += wp['gross']
            r['discount']    += wp['discount']
            r['shipping']    += wp['shipping']
            r['refund_auto'] += wp['refund_auto']
            r['fee_payex']   += wp['fee_processing'] + wp['fee_service']
            r['orders']      += wp['orders']
            if not r['currency'] and wp['currency']:
                r['currency'] = wp['currency']
            for dk, v in wp['daily'].items():
                if dk not in r['daily']:
                    r['daily'][dk] = {'orders': 0, 'revenue': 0.0}
                r['daily'][dk]['orders']  += v['orders']
                r['daily'][dk]['revenue'] += v['revenue']
            for meth, v in wp['payment_methods'].items():
                if meth not in method_map:
                    method_map[meth] = {'orders': 0, 'revenue': 0.0}
                method_map[meth]['orders']  += v['orders']
                method_map[meth]['revenue'] += v['revenue']
            for name, v in wp['products'].items():
                if name not in prod_map:
                    prod_map[name] = {'orders': 0, 'revenue': 0.0}
                prod_map[name]['orders']  += v['orders']
                prod_map[name]['revenue'] += v['revenue']

        r['payment_methods'] = sorted(
            [{'method': m, 'orders': v['orders'], 'revenue': v['revenue']}
             for m, v in method_map.items()],
            key=lambda x: -x['revenue']
        )

        # Aggregate state data from orders
        state_map = {}
        for fp in files['orders']:
            wo = parse_wix_orders(fp)
            if not wo:
                continue
            for state, v in wo['states'].items():
                if state not in state_map:
                    state_map[state] = {'orders': 0, 'revenue': 0.0}
                state_map[state]['orders']  += v['orders']
                state_map[state]['revenue'] += v['revenue']

        r['states'] = sorted(
            [{'state': s, 'orders': v['orders'], 'revenue': v['revenue']}
             for s, v in state_map.items()],
            key=lambda x: -x['revenue']
        )

        # Product data — prefer items CSV (more granular), fallback to payment CSV
        if files['items']:
            item_prod_map = {}
            for fp in files['items']:
                wi = parse_wix_items(fp)
                if not wi:
                    continue
                for key, v in wi['products'].items():
                    if key not in item_prod_map:
                        item_prod_map[key] = dict(v)
                    else:
                        item_prod_map[key]['orders']       += v['orders']
                        item_prod_map[key]['qty']          += v['qty']
                        item_prod_map[key]['revenue']      += v['revenue']
                        item_prod_map[key]['refunded_qty'] += v['refunded_qty']
            r['products'] = sorted(
                [{'name': v['name'], 'orders': v['orders'], 'revenue': v['revenue'],
                  'aov': v['revenue'] / v['orders'] if v['orders'] > 0 else 0.0}
                 for v in item_prod_map.values() if v['name']],
                key=lambda x: -x['revenue']
            )
        else:
            r['products'] = sorted(
                [{'name': n, 'orders': v['orders'], 'revenue': v['revenue'],
                  'aov': v['revenue'] / v['orders'] if v['orders'] > 0 else 0.0}
                 for n, v in prod_map.items()],
                key=lambda x: -x['revenue']
            )

        # Finalise full-year result
        finalise(r)
        r['platforms'] = [{'name': 'Wix', 'gross': r['gross'],
                           'net': r['net'], 'orders': r['orders']}]

        # Store full-year + monthly splits
        parsed[f"{territory}||wix"] = r
        monthly = build_monthly_splits(r)
        for month, mr in monthly.items():
            parsed[f"{territory}||{month}"] = mr

        print(f"    gross={r['gross']:>12,.0f} {r['currency']}  "
              f"orders={r['orders']:>5}  months={len(monthly):>2}  "
              f"net={r['net']:>12,.0f}")

    # ── Write output ────────────────────────────────────────────────────────
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    output = {
        'generated_at': datetime.now().isoformat(),
        'parsed': parsed,
    }
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, default=str)

    n_countries = len(territory_files)
    n_months    = sum(1 for k in parsed if '||wix' not in k)
    print(f"\n[parse_data] Done — {n_countries} countries · {n_months} monthly entries")
    print(f"             Written to {OUTPUT_FILE}\n")

if __name__ == '__main__':
    main()
