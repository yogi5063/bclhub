// parse-bank.js — Bank transfer statement parser (CSV or XLSX)
// Supports common Malaysian / international bank statement formats.
// Detects by filename keywords: bank, statement, receipt, transfer

/* global registerGateway, XLSX, Papa, n */

registerGateway({
  name: 'Bank Transfer',

  detect(filename) {
    return (
      filename.includes('bank') ||
      filename.includes('statement') ||
      filename.includes('receipt') ||
      filename.includes('transfer') ||
      filename.includes('remittance')
    );
  },

  async parse(file) {
    const result = _emptyBankResult();

    try {
      if (file.name.toLowerCase().endsWith('.csv')) {
        const text = await file.text();
        _parseCSV(text, result);
      } else {
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
        _parseXLSX(wb, result);
      }
    } catch (err) {
      result.errors.push(err.message);
    }

    return result;
  },
});

// ── CSV Parser ──────────────────────────────────────────────────────────────
function _parseCSV(text, result) {
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
  const rows = parsed.data;
  if (!rows.length) return;

  // Auto-detect columns
  const firstRow = rows[0];
  const keys = Object.keys(firstRow);
  const creditKey = keys.find(k => /credit|deposit|in|received/i.test(k));
  const debitKey  = keys.find(k => /debit|withdrawal|out|paid/i.test(k));
  const dateKey   = keys.find(k => /date/i.test(k));
  const refKey    = keys.find(k => /ref|reference|trx|transaction/i.test(k));
  const descKey   = keys.find(k => /desc|narration|detail|payee/i.test(k));

  for (const row of rows) {
    const credit = n(creditKey ? row[creditKey] : 0);
    const debit  = n(debitKey  ? row[debitKey]  : 0);
    const ref    = (refKey  ? row[refKey]  : '').trim();
    const desc   = (descKey ? row[descKey] : '').trim();
    const date   = _isoDate(dateKey ? row[dateKey] : '');

    if (credit > 0) {
      result.gross_received += credit;
      result.transactions.push({ date, amount: credit,  reference: ref, description: desc, type: 'credit' });
    }
    if (debit > 0) {
      result.transactions.push({ date, amount: -debit, reference: ref, description: desc, type: 'debit' });
    }
  }
}

// ── XLSX Parser ─────────────────────────────────────────────────────────────
function _parseXLSX(wb, result) {
  // Try sheets in order: first one with data wins
  for (const sheetName of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: null });
    if (rows.length < 2) continue;

    // Find header row (first row with ≥4 non-null values)
    let hdrIdx = -1;
    for (let i = 0; i < Math.min(10, rows.length); i++) {
      if ((rows[i] || []).filter(v => v !== null && v !== '').length >= 4) { hdrIdx = i; break; }
    }
    if (hdrIdx === -1) continue;

    const hdr = (rows[hdrIdx] || []).map(v => String(v || '').toLowerCase());
    const dateI   = hdr.findIndex(h => h.includes('date'));
    const creditI = hdr.findIndex(h => /credit|deposit|in\b|received/.test(h));
    const debitI  = hdr.findIndex(h => /debit|withdrawal|out\b|paid/.test(h));
    const refI    = hdr.findIndex(h => /ref|transaction/.test(h));
    const descI   = hdr.findIndex(h => /desc|narration|detail/.test(h));

    for (const row of rows.slice(hdrIdx + 1)) {
      if (!row || row.every(v => !v)) continue;
      const credit = n(creditI >= 0 ? row[creditI] : 0);
      const debit  = n(debitI  >= 0 ? row[debitI]  : 0);
      const ref    = String(refI  >= 0 ? row[refI]  || '' : '').trim();
      const desc   = String(descI >= 0 ? row[descI] || '' : '').trim();
      const date   = _isoDate(dateI >= 0 ? row[dateI] : '');

      if (credit > 0) {
        result.gross_received += credit;
        result.transactions.push({ date, amount: credit,  reference: ref, description: desc, type: 'credit' });
      }
      if (debit > 0) {
        result.transactions.push({ date, amount: -debit, reference: ref, description: desc, type: 'debit' });
      }
    }
    break; // Use first sheet with data
  }
}

function _emptyBankResult() {
  return {
    gatewayName:   'Bank Transfer',
    territory:     null,
    currency:      null,
    gross_received: 0,
    transactions:  [],
    errors:        [],
  };
}

function _isoDate(v) {
  if (!v) return null;
  const s = String(v);
  const m1 = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m1) return m1[1];
  const m2 = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m2) {
    const yr = m2[3].length === 2 ? '20' + m2[3] : m2[3];
    return `${yr}-${m2[2].padStart(2,'0')}-${m2[1].padStart(2,'0')}`;
  }
  return null;
}
