/* Sky Pedal — render the 30s promo frames (deterministic, 30fps, 1080x1920).
 * usage: node promo/capture.js <outDir> [--preview] [--from N] [--to N] [--step N]
 * needs the game served at http://localhost:8123/ (e.g. `npx http-server -p 8123 .`) */
const path = require('path'), fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const args = process.argv.slice(2), out = args[0];
const opt = k => { const i = args.indexOf(k); return i > 0 ? +args[i + 1] : undefined; };
const preview = args.includes('--preview'), from = opt('--from') ?? 0, to = opt('--to') ?? 899, stepN = opt('--step') ?? 1;
(async () => {
  fs.mkdirSync(path.join(out, 'frames'), { recursive: true });
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 540, height: 960 }, deviceScaleFactor: preview ? 1 : 2 });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.error('PAGEERROR', e.message, (e.stack || '').split('\n')[1]));
  const QUALITY = args.includes('--mid') ? 'mid' : 'high';
  await page.addInitScript(QUALITY => { localStorage.setItem('sp_settings', JSON.stringify({ quality: QUALITY, assist: 'normal', kit: 'wing', paint: 'sky', motion: false, music: .6, sfx: .8 })); }, QUALITY);
  await page.goto('http://localhost:8123/index.html');
  await page.waitForFunction(() => window.SP && SP.game && SP.game.S.mode === 'title', null, { timeout: 120000 });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => { SP.game.freeze = true; });
  await page.addScriptTag({ path: path.join(__dirname, 'director.js') });
  const t0 = Date.now();
  const start = await page.evaluate(f => PROMO.seek(f), from);
  for (let i = start; i <= to; i++){
    const info = await page.evaluate(i => PROMO.frame(i), i);
    if (i < from || (i - from) % stepN) continue;
    await page.screenshot({ path: path.join(out, 'frames', String(i).padStart(4, '0') + '.jpg'), type: 'jpeg', quality: 93 });
    if (i % 30 === 0) console.log(`frame ${i} ${info.shot} t=${info.t.toFixed(2)} z=${info.z} y=${info.y} ${info.phase}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  fs.writeFileSync(path.join(out, `events-${from}.json`), JSON.stringify(await page.evaluate(() => PROMO.events), null, 1));
  await browser.close();
})();
