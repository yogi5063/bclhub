/**
 * build-js.js — Post-build step: minify + obfuscate all JS files in dist/
 * Run after: npm run build
 *
 * Concatenates all app JS in the correct load order into a single bundle,
 * runs terser obfuscation, then writes to dist/assets/bundle.js.
 * Also minifies login.js in-place.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { minify } from 'terser';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.join(__dirname, 'frontend');
const DIST     = path.join(__dirname, 'dist');

// Correct load order (mirrors the <script> order in index.html)
// Note: all territory/Wix/gateway parsers removed — Python handles all data parsing now
const APP_SCRIPTS = [
  'auth-guard.js',
  'parsers/helpers.js',
  'charts.js',
  'views/overview.js',
  'views/build-territory.js',
  'views/pl-detail.js',
  'views/trends.js',
  'views/products.js',
  'views/geography.js',
  'views/calendar.js',
  'views/payments.js',
  'views/leakage.js',
  'views/validation.js',
  'views/ar.js',
  'views/reconciliation.js',
  'views/gateway-recon.js',
  'views/explorer.js',
  'app.js',
  'upload-consolidated.js',
  'ai-chat.js',  // AI CFO chat interface — must load last
];

async function buildJS() {
  console.log('\n[build-js] Minifying and obfuscating JavaScript…\n');

  // Ensure dist/assets exists
  mkdirSync(path.join(DIST, 'assets'), { recursive: true });

  // ── 1. Concatenate all app scripts ──────────────────────────────────────────
  const parts = [];
  for (const script of APP_SCRIPTS) {
    const src = path.join(FRONTEND, script);
    if (!existsSync(src)) { console.warn(`  [skip] ${script} (not found)`); continue; }
    parts.push(`/* ${script} */`);
    parts.push(readFileSync(src, 'utf-8'));
    parts.push('');
  }
  const combined = parts.join('\n');

  // ── 2. Minify + obfuscate ────────────────────────────────────────────────────
  const result = await minify(combined, {
    compress: {
      passes:         2,
      drop_console:   true,
      drop_debugger:  true,
      dead_code:      true,
      global_defs:    { DEBUG: false },
    },
    mangle: {
      toplevel: false,  // Keep false — globals like STATE, fmt, etc. used from HTML onclick
    },
    format: {
      comments: false,
    },
  });

  // Content-hash the filename so browsers never serve a stale bundle
  const hash = createHash('md5').update(result.code).digest('hex').slice(0, 8);
  const bundleFilename = `bundle-${hash}.js`;
  const bundlePath = path.join(DIST, 'assets', bundleFilename);

  // Delete any old bundle-*.js files from previous builds
  for (const f of readdirSync(path.join(DIST, 'assets'))) {
    if (f.startsWith('bundle-') && f.endsWith('.js') && f !== bundleFilename) {
      const { unlinkSync } = await import('fs');
      unlinkSync(path.join(DIST, 'assets', f));
    }
  }

  writeFileSync(bundlePath, result.code, 'utf-8');
  console.log(`  ✓ dist/assets/${bundleFilename}  (${(result.code.length / 1024).toFixed(1)} kB minified)`);

  // ── 3. Update index.html to use hashed bundle instead of individual scripts ──
  const indexPath = path.join(DIST, 'index.html');
  let html = readFileSync(indexPath, 'utf-8');

  // Remove all individual app <script> tags
  for (const script of APP_SCRIPTS) {
    const tag = `<script src="${script}"></script>`;
    html = html.replace(tag, '');
  }

  // Remove any old bundle script tag if present
  html = html.replace(/<script src="\/assets\/bundle-[^"]+\.js"><\/script>\n?/g, '');

  // Inject hashed bundle script before </body>
  html = html.replace('</body>', `<script src="/assets/${bundleFilename}"></script>\n</body>`);
  writeFileSync(indexPath, html, 'utf-8');
  console.log(`  ✓ dist/index.html updated to use ${bundleFilename}`);

  // ── 4. Minify login.js separately ───────────────────────────────────────────
  const loginSrc = path.join(FRONTEND, 'login.js');
  if (existsSync(loginSrc)) {
    const loginResult = await minify(readFileSync(loginSrc, 'utf-8'), {
      compress: { drop_console: true },
      mangle: true,
      format: { comments: false },
    });
    const loginDistPath = path.join(DIST, 'login.js');
    writeFileSync(loginDistPath, loginResult.code, 'utf-8');
    console.log(`  ✓ dist/login.js  (${(loginResult.code.length / 1024).toFixed(1)} kB minified)`);
  }

  // Update login.html to reference login.js correctly
  const loginHtmlPath = path.join(DIST, 'login.html');
  if (existsSync(loginHtmlPath)) {
    let loginHtml = readFileSync(loginHtmlPath, 'utf-8');
    loginHtml = loginHtml.replace('<script src="login.js"></script>', '<script src="/login.js"></script>');
    loginHtml = loginHtml.replace(/href="login\.css"/, 'href="/assets/login-D2a4to3K.css"');
    writeFileSync(loginHtmlPath, loginHtml, 'utf-8');
    console.log(`  ✓ dist/login.html updated`);
  }

  console.log('\n[build-js] Done.\n');
}

buildJS().catch(err => { console.error('[build-js] Error:', err); process.exit(1); });
