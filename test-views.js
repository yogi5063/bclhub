import puppeteer from 'puppeteer-core';
const EDGE = String.raw`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`;
(async () => {
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle2', timeout: 15000 });
  await page.type('#username','admin'); await page.type('#password','PerkLabs2026!');
  await Promise.all([page.waitForNavigation({waitUntil:'networkidle2',timeout:10000}).catch(()=>{}), page.click('#login-btn')]);
  await new Promise(r=>setTimeout(r,3000));
  for (const view of ['overview','pl','trends','products','geography','calendar','payments','leakage','validation','ar','gateway-recon','reconciliation','explorer']) {
    try {
      await page.evaluate((v) => { const el=document.querySelector(`[data-view="${v}"]`); if(el) el.click(); }, view);
      await new Promise(r=>setTimeout(r,800));
      const text = await page.evaluate(() => document.getElementById('main')?.innerText?.slice(0, 200) || '');
      const firstLine = text.split('\n').filter(l=>l.trim())[0] || '(empty)';
      console.log(`${view.padEnd(16)}: ${firstLine.slice(0,70)}`);
    } catch(e) { console.log(`${view.padEnd(16)}: ERROR ${e.message}`); }
  }
  if (errors.length) { console.log('\nErrors:'); errors.forEach(e=>console.log('  '+e)); }
  else console.log('\nNo page errors.');
  await browser.close();
})();
