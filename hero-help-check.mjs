import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1400, height: 900 },
  reducedMotion: 'no-preference',
});
page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));
page.on('pageerror', (err) => console.log('PAGE ERROR:', err.message));
await page.goto('http://localhost:4324/');
await page.waitForTimeout(1000);

const canvases = await page.locator('canvas').all();
console.log('canvas count', canvases.length);
for (const c of canvases) {
  const info = await c.evaluate((el) => ({
    w: el.width,
    h: el.height,
    cw: el.clientWidth,
    ch: el.clientHeight,
    cls: el.className,
    parentCls: el.parentElement?.className,
  }));
  console.log(info);
}

await browser.close();
