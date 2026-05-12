import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFile, spawn } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync, readdirSync } from 'fs';
import multer from 'multer';
import { authRouter } from './auth.js';
import { requireAuth, requireAdmin } from './middleware.js';
import { handleChat, handleInsights, handleReport } from './ai_cfo.js';
import { fetchCacheFromSupabase } from './supabase.js';
import { adminRouter } from './admin.js';
import { fetchRouter } from './api_fetch.js';
import { insightsRouter } from './insights.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.join(__dirname, '..');
const DIST      = path.join(ROOT, 'dist');
const PORT      = process.env.PORT || 3000;
const DATA_CACHE    = path.join(__dirname, 'data_cache.json');
const SETTINGS_FILE = path.join(__dirname, 'settings.json');

const PYTHON = process.platform === 'win32'
  ? (existsSync('C:/Users/LENOVO/anaconda3/python.exe')
      ? 'C:/Users/LENOVO/anaconda3/python.exe'
      : 'python')
  : 'python3';

const app = express();

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(express.json());
app.use(cookieParser());
app.use(cors({ origin: false }));

// ── Auth API ────────────────────────────────────────────────────────────────
app.use('/api', authRouter);

// ── Admin API (super_admin only) ─────────────────────────────────────────────
app.use('/api/admin', adminRouter);

// ── API Fetch (Wix + Payex auto-fetch) ───────────────────────────────────────
app.use('/api', fetchRouter);

// ── AI Insights engine ───────────────────────────────────────────────────────
app.use('/api/insights', insightsRouter);

// ── Data API ─────────────────────────────────────────────────────────────────
// GET /api/data — Supabase first, filtered by client_id, fallback to local JSON cache
app.get('/api/data', requireAuth, async (req, res) => {
  const { role, client_id } = req.user;
  // super_admin with ?client= param can preview any client
  const targetClientId = role === 'super_admin'
    ? (req.query.client || null)
    : client_id;

  // data_source filter: 'system_workbook' | 'manual_upload' | null (all)
  const dataSource = req.query.source || null;

  // 1. Try Supabase (real-time data, isolated by client + source)
  try {
    const sbData = await fetchCacheFromSupabase(null, targetClientId, dataSource);
    if (sbData && sbData.parsed && Object.keys(sbData.parsed).length > 0) {
      return res.json({ ...sbData, data_source: dataSource || 'all' });
    }
  } catch (e) {
    console.warn('[/api/data] Supabase unavailable, using local cache:', e.message);
  }
  // 2. Fallback to local data_cache.json
  if (!existsSync(DATA_CACHE))
    return res.status(503).json({ error: 'Data not ready. Click Refresh in the dashboard.' });
  res.sendFile(DATA_CACHE);
});

// GET /api/settings — return current runtime settings
app.get('/api/settings', requireAuth, (req, res) => {
  const defaults = { uploadDir: process.env.UPLOAD_DIR || 'D:/Perklabs-mis/Upload' };
  if (!existsSync(SETTINGS_FILE)) return res.json(defaults);
  try {
    res.json({ ...defaults, ...JSON.parse(readFileSync(SETTINGS_FILE, 'utf-8')) });
  } catch {
    res.json(defaults);
  }
});

// POST /api/settings — save runtime settings (persists across restarts)
app.post('/api/settings', requireAuth, (req, res) => {
  const { uploadDir } = req.body;
  if (!uploadDir) return res.status(400).json({ error: 'uploadDir required' });
  writeFileSync(SETTINGS_FILE, JSON.stringify({ uploadDir }, null, 2));
  res.json({ ok: true });
});

// POST /api/refresh — populate cache directly from territory workbooks (pin-to-pin)
app.post('/api/refresh', requireAuth, (req, res) => {
  // New: read from territory workbooks instead of Consolidated.xlsx
  // This guarantees dashboard numbers match the territory workbooks exactly
  execFile(PYTHON, ['populate_cache_from_workbooks.py'], { cwd: ROOT, timeout: 300000 },
    (err, stdout, stderr) => {
      if (err) {
        // Fallback to legacy consolidated parser if new script fails
        console.error('populate_cache_from_workbooks failed:', stderr);
        execFile(PYTHON, ['parse_consolidated.py'], { cwd: ROOT, timeout: 300000 },
          (err2, stdout2, stderr2) => {
            if (err2) return res.status(500).json({ error: stderr2 || err2.message, stdout: stdout2 });
            res.json({ ok: true, output: stdout2, source: 'consolidated_fallback' });
          });
        return;
      }
      res.json({ ok: true, output: stdout, source: 'territory_workbooks' });
    });
});

// POST /api/upload — accept Consolidated.xlsx for a given period (YYYY-MM)
// Body: multipart/form-data with `file` and `period` fields
const uploadStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const period = (req.body.period || '').replace(/[^\d-]/g, '');
    if (!/^\d{4}-\d{2}$/.test(period)) return cb(new Error('Invalid period (expected YYYY-MM)'));
    const settings = existsSync(SETTINGS_FILE)
      ? JSON.parse(readFileSync(SETTINGS_FILE, 'utf-8'))
      : {};
    const baseDir = settings.uploadDir || process.env.UPLOAD_DIR || 'D:/Perklabs-mis/Upload';
    const periodDir = path.join(baseDir, period);
    try { mkdirSync(periodDir, { recursive: true }); } catch {}
    cb(null, periodDir);
  },
  filename: (req, file, cb) => cb(null, 'Consolidated.xlsx'),
});
const uploader = multer({
  storage: uploadStorage,
  limits: { fileSize: 200 * 1024 * 1024 },   // 200 MB
});

app.post('/api/upload', requireAuth, uploader.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  // After successful upload, trigger parser
  execFile(PYTHON, ['parse_consolidated.py'], { cwd: ROOT, timeout: 300000 },
    (err, stdout, stderr) => {
      if (err) return res.status(500).json({
        error: stderr || err.message,
        uploaded: req.file.path,
      });
      res.json({
        ok: true,
        uploaded: req.file.path,
        size_kb: Math.round(req.file.size / 1024),
        parserOutput: stdout,
      });
    });
});

// ── TERRITORY BUILDER (admin only) ──────────────────────────────────────────
//
// Admin uploads raw source files for one territory + period → server places
// them at the paths territory_build.py expects → spawns the Python builder
// → output workbook is downloadable.

const TERR_BUILDS = {};   // buildId → { status, log, output, startedAt }

// Map upload field-name → target dir under D:/Perklabs-mis/Input/
// (mirrors the paths territory_build.py reads from)
const TERRITORY_INPUT_MAP = {
  orders:     { dir: 'DATA_Orders',           filename: 'DATA_Orders.xlsx' },
  items:      { dir: 'DATA_Items',            filename: 'DATA_Items.xlsx'  },
  payments:   { dir: 'DATA_Payments',         filename: 'DATA_Payments.xlsx' },
  payex:      { dir: 'Payex',                 filename: 'Payex.xlsx' },
  paypal:     { dir: 'PayPal',                filename: 'PayPal.xlsx' },
  stripe:     { dir: 'Stripe',                filename: 'Stripe.xlsx' },
  xendit:     { dir: 'Xendit',                filename: 'Xendit.xlsx' },
  bank:       { dir: 'Other reports Mar 26',  filename: null /* keep original */ },
  shopee:     { dir: 'Other reports Mar 26',  filename: null },
  tiktok:     { dir: 'Other reports Mar 26',  filename: null },
  fx:         { dir: 'Config_FX',             filename: 'Config_FX.xlsx' },
  cogs:       { dir: 'BOM',                   filename: 'Mis mAR 26.xlsx' },
};

const PERK_INPUT_BASE = 'C:/Users/LENOVO/Desktop/Perk Labs/Input';

// Multer storage for territory files: places each file at its mapped path
const terrUploadStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const cat = file.fieldname;   // 'orders', 'items', etc.
    const map = TERRITORY_INPUT_MAP[cat];
    if (!map) return cb(new Error(`Unknown file category: ${cat}`));
    const targetDir = path.join(PERK_INPUT_BASE, map.dir);
    try { mkdirSync(targetDir, { recursive: true }); } catch {}
    cb(null, targetDir);
  },
  filename: (req, file, cb) => {
    const cat = file.fieldname;
    const map = TERRITORY_INPUT_MAP[cat];
    cb(null, map.filename || file.originalname);
  },
});
const terrUploader = multer({
  storage: terrUploadStorage,
  limits: { fileSize: 500 * 1024 * 1024 },
});


// POST /api/territory/upload — admin uploads files for a territory build
app.post('/api/territory/upload', requireAuth, requireAdmin, terrUploader.any(), (req, res) => {
  const territory = (req.body.territory || '').trim().toLowerCase();
  const period = (req.body.period || '').trim();
  const validTerritories = ['korea','japan','malaysia','indonesia','philippines','india','brasil','latam','gcc','usa','molnu','europe','oceania','thailand'];
  if (!validTerritories.includes(territory)) {
    return res.status(400).json({ error: `Invalid territory: ${territory}. Must be one of: ${validTerritories.join(', ')}` });
  }
  if (!/^\d{4}-\d{2}$/.test(period)) {
    return res.status(400).json({ error: 'Invalid period (expected YYYY-MM)' });
  }
  const filesUploaded = (req.files || []).map(f => ({
    field: f.fieldname,
    name: f.originalname,
    path: f.path,
    size: f.size,
  }));
  res.json({
    ok: true,
    territory,
    period,
    files: filesUploaded,
  });
});

// POST /api/territory/build — spawn territory_build.py for a territory
app.post('/api/territory/build', requireAuth, requireAdmin, (req, res) => {
  const { territory, period } = req.body;
  const validTerritories = ['korea','japan','malaysia','indonesia','philippines','india','brasil','latam','gcc','usa','molnu','europe','oceania','thailand'];
  if (!validTerritories.includes(territory?.toLowerCase())) {
    return res.status(400).json({ error: `Invalid territory: ${territory}` });
  }
  const buildId = `${period}_${territory}_${Date.now()}`;
  TERR_BUILDS[buildId] = { status: 'running', log: 'Starting build…\n', startedAt: Date.now() };

  // Use hybrid orchestrator: routes to template_refresh.py for 10 territories
  // (pin-to-pin proven) or build-from-scratch + force-pin-to-pin for the 3 rebuilt
  // (USA/Europe/Oceania). Malaysia is deferred (not in Wix DATA_Orders).
  const script = 'C:/Users/LENOVO/Desktop/Perk Labs/Scripts/_FINAL/build_territory_hybrid.py';
  const child = spawn(PYTHON, [script, territory.toLowerCase()], {
    cwd: 'C:/Users/LENOVO/Desktop/Perk Labs',
  });
  child.stdout.on('data', d => { TERR_BUILDS[buildId].log += d.toString(); });
  child.stderr.on('data', d => { TERR_BUILDS[buildId].log += '[err] ' + d.toString(); });
  child.on('close', (code) => {
    TERR_BUILDS[buildId].status = code === 0 ? 'success' : 'failed';
    TERR_BUILDS[buildId].exitCode = code;
    if (code === 0) {
      // Find output file
      const wbDir = 'C:/Users/LENOVO/Desktop/Perk Labs/Output/Updated/Territory Workbooks Mar 2026';
      try {
        const files = readdirSync(wbDir).filter(f => f.toLowerCase().includes(territory.toLowerCase()) && f.endsWith('.xlsx'));
        if (files[0]) TERR_BUILDS[buildId].output = path.join(wbDir, files[0]);
      } catch {}
    }
  });
  res.json({ ok: true, buildId });
});

// GET /api/territory/status/:buildId
app.get('/api/territory/status/:buildId', requireAuth, requireAdmin, (req, res) => {
  const b = TERR_BUILDS[req.params.buildId];
  if (!b) return res.status(404).json({ error: 'Build not found' });
  res.json({
    status: b.status,
    log: b.log.slice(-4000),
    output: b.output ? path.basename(b.output) : null,
    elapsedSec: Math.round((Date.now() - b.startedAt) / 1000),
    exitCode: b.exitCode,
  });
});

// GET /api/territory/download/:buildId
app.get('/api/territory/download/:buildId', requireAuth, requireAdmin, (req, res) => {
  const b = TERR_BUILDS[req.params.buildId];
  if (!b || !b.output || !existsSync(b.output)) {
    return res.status(404).json({ error: 'Output not ready' });
  }
  res.download(b.output, path.basename(b.output));
});

// ── AI CFO ENDPOINTS ──────────────────────────────────────────────────────────
// POST /api/ai/chat — conversational financial query (CEO/manager questions)
app.post('/api/ai/chat', requireAuth, handleChat);

// POST /api/ai/insights — auto-generate insights for a dashboard view
app.post('/api/ai/insights', requireAuth, handleInsights);

// POST /api/ai/report — generate full management report
app.post('/api/ai/report', requireAuth, handleReport);

// GET /api/periods — list periods we have data for
app.get('/api/periods', requireAuth, (req, res) => {
  const settings = existsSync(SETTINGS_FILE)
    ? JSON.parse(readFileSync(SETTINGS_FILE, 'utf-8'))
    : {};
  const baseDir = settings.uploadDir || process.env.UPLOAD_DIR || 'D:/Perklabs-mis/Upload';
  if (!existsSync(baseDir)) return res.json({ periods: [] });
  // Find all subdirs matching YYYY-MM with a Consolidated.xlsx
  const periods = [];
  try {
    for (const entry of readdirSync(baseDir, { withFileTypes: true })) {
      if (entry.isDirectory() && /^\d{4}-\d{2}$/.test(entry.name)) {
        const fp = path.join(baseDir, entry.name, 'Consolidated.xlsx');
        if (existsSync(fp)) {
          const st = statSync(fp);
          periods.push({ period: entry.name, mtime: st.mtimeMs, size: st.size });
        }
      }
    }
  } catch {}
  periods.sort((a, b) => b.period.localeCompare(a.period));
  res.json({ periods });
});

// GET /api/export-excel — generate Excel report and download
app.get('/api/export-excel', requireAuth, (req, res) => {
  const period = req.query.period || '';
  const args = ['export_workbook.py'];
  if (period) args.push('--period', period);

  execFile(PYTHON, args, { cwd: ROOT, timeout: 120000 },
    (err, stdout, stderr) => {
      if (err) return res.status(500).json({ error: stderr || err.message });

      // Extract OUTPUT_PATH from stdout
      const match = stdout.match(/OUTPUT_PATH=(.+)/);
      if (!match) return res.status(500).json({ error: 'Export failed — no output path', stdout });

      const filePath = match[1].trim();
      if (!existsSync(filePath)) return res.status(500).json({ error: 'Export file not found' });

      res.download(filePath, path.basename(filePath), (dlErr) => {
        if (dlErr) console.error('Download error:', dlErr);
      });
    });
});

// GET /clear — clear JWT cookie and redirect to login (no auth needed)
// Public health check — Railway uses this to confirm service is running
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'BCL Hub', ts: Date.now() });
});
app.get('/api/verify', (req, res) => {
  // Railway default healthcheck path — return 200 so deployment passes
  const token = req.cookies?.token;
  if (!token) return res.status(200).json({ status: 'service_ok', auth: false });
  res.status(200).json({ status: 'service_ok', auth: true });
});

app.get('/clear', (req, res) => {
  res.clearCookie('token');
  res.redirect('/login');
});

// ── Login page — served without auth ───────────────────────────────────────
app.get('/login', (req, res) => {
  res.sendFile(path.join(DIST, 'login.html'));
});

// ── Admin panel — super_admin only ─────────────────────────────────────────
app.get('/admin', requireAdmin, (req, res) => {
  res.sendFile(path.join(DIST, 'admin.html'));
});
app.get('/admin-panel.js', requireAdmin, (req, res) => {
  res.sendFile(path.join(DIST, 'admin-panel.js'));
});

// Login page assets — must be public (before requireAuth)
app.get('/login.js', (req, res) => {
  res.sendFile(path.join(DIST, 'login.js'));
});

// ── Upload page ──────────────────────────────────────────────────────────────
app.get('/upload', requireAuth, (req, res) => {
  res.sendFile(path.join(DIST, 'upload.html'));
});

// ── Template downloads ────────────────────────────────────────────────────────
const TEMPLATES_DIR = path.join(ROOT, 'templates');
app.get('/api/templates/:filename', requireAuth, (req, res) => {
  const file = path.join(TEMPLATES_DIR, path.basename(req.params.filename));
  if (!existsSync(file)) return res.status(404).json({ error: 'Template not found' });
  res.download(file);
});

// ── File upload endpoint ──────────────────────────────────────────────────────
const uploadDir = process.env.UPLOAD_DIR || '/tmp/uploads';
mkdirSync(uploadDir, { recursive: true });

const sourceUploadStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const session = req.user.sub?.replace(/[^a-z0-9]/gi, '') || 'default';
    const dir = path.join(uploadDir, session);
    mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const type = (req.body.type || 'file').replace(/[^a-z0-9_]/gi, '');
    cb(null, `${type}_${Date.now()}.xlsx`);
  },
});
const uploader = multer({ storage: sourceUploadStorage, limits: { fileSize: 100 * 1024 * 1024 } });

app.post('/api/upload', requireAuth, uploader.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file received' });
  res.json({ ok: true, path: req.file.path, name: req.file.filename, type: req.body.type });
});

// ── Build endpoint — streams progress ─────────────────────────────────────────
app.post('/api/build', requireAuth, (req, res) => {
  const { period = '2026-04' } = req.body || {};
  const session = req.user.sub?.replace(/[^a-z0-9]/gi, '') || 'default';
  const dir = path.join(uploadDir, session);
  const scriptPath = path.join(__dirname, 'process_uploads.py');
  const clientId = req.user.client_id || '';

  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('Cache-Control', 'no-cache');

  if (!existsSync(scriptPath)) {
    res.write(JSON.stringify({ error: 'Processing script not found' }) + '\n');
    return res.end();
  }

  const args = ['--period', period, '--upload-dir', dir];
  if (clientId) args.push('--client-id', clientId);

  const proc = spawn(PYTHON, [scriptPath, ...args], {
    env: { ...process.env },
    cwd: ROOT,
  });

  proc.stdout.on('data', (d) => res.write(d));
  proc.stderr.on('data', (d) => {
    const msg = d.toString().trim();
    if (msg) res.write(JSON.stringify({ log: `[stderr] ${msg}` }) + '\n');
  });
  proc.on('close', (code) => {
    if (code !== 0) res.write(JSON.stringify({ error: `Process exited with code ${code}` }) + '\n');
    res.end();
  });
  proc.on('error', (e) => {
    res.write(JSON.stringify({ error: e.message }) + '\n');
    res.end();
  });
});

// Hashed assets: cache 1 year (filename changes on every build)
app.use('/assets', express.static(path.join(DIST, 'assets'), {
  maxAge: '1y',
  immutable: true,
}));

// ── Dashboard — requires valid JWT ─────────────────────────────────────────
app.use('/', requireAuth, express.static(DIST, { maxAge: 0, etag: false }));

// ── Catch-all: redirect to login ───────────────────────────────────────────
app.use((req, res) => {
  if (req.accepts('html')) return res.redirect('/login');
  res.status(404).json({ error: 'Not found' });
});

// ── Start ───────────────────────────────────────────────────────────────────
if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable not set. Add it to .env');
  process.exit(1);
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`FIP MIS SaaS running on http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Python: ${PYTHON}`);
  // data_cache.json is committed to repo — no startup parse needed.
  // Use /api/refresh endpoint to update data when needed.
  console.log('Server ready. Data cache loaded from committed data_cache.json');
});
