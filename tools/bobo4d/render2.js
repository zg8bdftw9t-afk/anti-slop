const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const [, , startArg, endArg, stepArg, offArg, outDir] = process.argv;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', e => console.log('PAGEERR', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
  await page.goto('http://localhost:8765/index2.html');
  await page.waitForFunction('window.READY', null, { timeout: 120000 });
  const total = await page.evaluate('window.TOTAL'), fps = await page.evaluate('window.FPS');
  const N = Math.floor(total * fps);
  const start = +startArg, step = +stepArg, off = +offArg;
  const end = endArg === 'end' ? N : +endArg;
  fs.mkdirSync(outDir, { recursive: true });
  for (let f = start + off; f < end; f += step) {
    await page.evaluate(`window.renderT(${f / fps})`);
    await page.screenshot({ path: `${outDir}/f${String(f).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 92 });
  }
  await browser.close();
})();
