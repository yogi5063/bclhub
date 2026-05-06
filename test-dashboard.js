// Headless browser smoke test for the dashboard
import puppeteer from 'puppeteer-core';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();

  const consoleLogs = [];
  const errors = [];
  const failedReqs = [];

  page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => errors.push(`PAGEERROR: ${err.message}`));
  page.on('requestfailed', req => failedReqs.push(`FAILED ${req.url()}: ${req.failure()?.errorText}`));
  page.on('response', resp => {
    if (resp.status() >= 400) failedReqs.push(`HTTP ${resp.status()}: ${resp.url()}`);
  });

  console.log('=== Step 1: GET /login ===');
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle2', timeout: 15000 });
  await page.waitForSelector('#login-form', { timeout: 5000 });

  console.log('=== Step 2: Submit login ===');
  await page.type('#username', 'admin');
  await page.type('#password', 'PerkLabs2026!');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(e => console.log('nav timeout:', e.message)),
    page.click('#login-btn'),
  ]);

  console.log('Final URL:', page.url());

  console.log('=== Step 3: Wait 5s for dashboard render ===');
  await new Promise(r => setTimeout(r, 5000));

  console.log('=== Step 4: Inspect DOM ===');
  const snapshot = await page.evaluate(() => {
    return {
      title: document.title,
      bodyTextLen: document.body.innerText.length,
      bodyTextPreview: document.body.innerText.slice(0, 500),
      hasSidebarItems: !!document.getElementById('sidebar-list'),
      sidebarChildren: document.getElementById('sidebar-list')?.children?.length || 0,
      kpiBarText: document.getElementById('top-kpi-bar')?.innerText || '',
      mainText: document.getElementById('main')?.innerText?.slice(0, 800) || '',
      visibleNavItems: Array.from(document.querySelectorAll('.nav-item')).map(n => n.dataset.view).filter(Boolean),
      hasUploadPanel: !!document.getElementById('upload-panel'),
      uploadPanelText: document.getElementById('upload-panel')?.innerText?.slice(0, 200) || '',
    };
  });
  console.log(JSON.stringify(snapshot, null, 2));

  console.log('\n=== Console messages ===');
  consoleLogs.forEach(l => console.log(l));

  console.log('\n=== Page errors ===');
  errors.forEach(e => console.log(e));

  console.log('\n=== Failed requests ===');
  failedReqs.forEach(r => console.log(r));

  await browser.close();
})().catch(err => { console.error('TEST FAILED:', err); process.exit(1); });
