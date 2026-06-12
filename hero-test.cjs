const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage({
    viewport: { width: 1400, height: 900 },
    reducedMotion: 'no-preference',
  });
  page.on('console', (msg) => console.log('CONSOLE:', msg.type(), msg.text()));
  page.on('pageerror', (err) => console.log('PAGEERROR:', err.message));

  await page.goto('http://localhost:4326/?spawn=cloud');
  await page.waitForSelector('canvas.hero-canvas');
  await page.waitForTimeout(1500);

  const canvas = await page.$('canvas.hero-canvas');
  const box = await canvas.boundingBox();
  console.log('canvas box:', box);

  // Probe the top-right area of the canvas (billboard region, away from
  // the .hero__content overlay which sits on the left/center).
  const cx = box.x + box.width * 0.78;
  const cy = box.y + box.height * 0.25;

  const elInfo = await page.evaluate(
    ([x, y]) => {
      const el = document.elementFromPoint(x, y);
      return { tag: el?.tagName, cls: el?.className };
    },
    [cx, cy],
  );
  console.log('elementFromPoint:', elInfo, 'at', cx, cy);

  await page.mouse.click(cx, cy);
  await page.waitForTimeout(600);

  const gameActive = await page.evaluate(() =>
    document.querySelector('.hero')?.getAttribute('data-game-active'),
  );
  console.log('data-game-active:', gameActive);

  await page.screenshot({ path: '/tmp/hero-1-activated.png' });

  // Walk right toward the star (spawn is `cell*2.4` left of the star)
  await page.keyboard.down('d');
  await page.waitForTimeout(1200);
  await page.keyboard.up('d');
  await page.waitForTimeout(300);
  await page.screenshot({ path: '/tmp/hero-2-after-walk.png' });

  // Star power should now be active — cat face + plasma background + fireworks
  await page.waitForTimeout(800);
  await page.screenshot({ path: '/tmp/hero-3-starpower.png', clip: box });

  // Wait past STAR_POWER_MS (4s) for everything to end together
  await page.waitForTimeout(4500);
  await page.screenshot({ path: '/tmp/hero-4-after-starpower.png', clip: box });

  await browser.close();
})();
