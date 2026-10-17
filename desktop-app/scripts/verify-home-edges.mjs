import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const phase = process.argv[2] || 'after';
assert.ok(['before', 'after', 'immersive'].includes(phase));
const evidence = phase === 'immersive' ? 'home-immersive' : 'home-edges';
mkdirSync('qa', { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.PROTOTYPE_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});
const context = await browser.newContext({ deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [], checks = [], views = {};
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
const loaded = () => page.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth > 0));
const check = (name, condition) => { assert.ok(condition, name); checks.push(name); };
try {
  for (const viewport of [{ width: 2048, height: 1152 }, { width: 1280, height: 720 }]) {
    await page.setViewportSize(viewport);
    await page.goto('http://127.0.0.1:4173/');
    await loaded();
    await page.screenshot({ path: `qa/${evidence}-${viewport.width}${phase === 'immersive' ? '' : `-${phase}`}.png` });
    views[viewport.width] = await page.evaluate(() => {
      const rect = element => {
        const { x, y, width, height } = element.getBoundingClientRect();
        return { x, y, width, height };
      };
      return {
        scene: rect(document.querySelector('.home-scene')),
        entries: [...document.querySelectorAll('.module-entry')].map(element => ({
          button: rect(element), image: rect(element.querySelector('img')),
          title: element.querySelector('h2').textContent, titleRect: rect(element.querySelector('h2')),
          count: element.querySelector('.module-count').textContent,
        })),
        footer: rect(document.querySelector('.imprint')),
        footerText: [...document.querySelectorAll('.imprint > span')].map(rect),
        mask: getComputedStyle(document.querySelector('.home-scene')).maskImage,
      };
    });
    const view = views[viewport.width];
    check(`Six readable module entries at ${viewport.width}`, view.entries.length === 6 && view.entries.every(e => e.title && e.count && e.button.y + e.button.height < Math.min(...view.footerText.map(r => r.y))));
    check(`Publication footer fits at ${viewport.width}`, view.footer.y + view.footer.height <= viewport.height);
    if (phase !== 'before') {
      const baseline = JSON.parse(readFileSync(`qa/home-edges-${phase === 'immersive' ? 'after' : 'before'}.json`, 'utf8')).views[viewport.width];
      const { mask: currentMask, scene: currentScene, ...currentContent } = view;
      const { mask: previousMask, scene: previousScene, ...previousContent } = baseline;
      const currentLayout = phase === 'immersive' ? currentContent : { scene: currentScene, ...currentContent };
      const previousLayout = phase === 'immersive' ? previousContent : { scene: previousScene, ...previousContent };
      assert.deepEqual(currentLayout, previousLayout, `Layout is unchanged at ${viewport.width}`);
      checks.push(`${phase === 'immersive' ? 'Module' : 'Scene, module'} image, button, title and footer geometry unchanged at ${viewport.width}`);
      check(`Raster display mask is applied at ${viewport.width}`, currentMask.includes('home-scene-mask.png'));
      if (phase === 'immersive') {
        check(`Enlarged scene reaches top/right viewport edges at ${viewport.width}`, currentScene.y === 0 && Math.abs(currentScene.x + currentScene.width - viewport.width) < 1 && currentScene.width > previousScene.width && currentScene.height > previousScene.height);
        check(`Adjacent catalog action removed at ${viewport.width}`, await page.getByRole('button', { name: '浏览全书目录', exact: true }).count() === 0);
        const primary = page.locator('.hero-actions .primary');
        await primary.focus();
        check(`Start action has visible keyboard focus at ${viewport.width}`, await primary.evaluate(e => getComputedStyle(e).outlineStyle !== 'none'));
        await page.screenshot({ path: `qa/home-immersive-${viewport.width}-focus.png` });
        check(`Primary action is above all overlapping artwork at ${viewport.width}`, await primary.evaluate(e => {
          const r = e.getBoundingClientRect();
          return [[r.left + 2, r.top + 2], [r.right - 2, r.top + 2], [r.left + 2, r.bottom - 2], [r.right - 2, r.bottom - 2]].every(([x, y]) => e.contains(document.elementFromPoint(x, y)));
        }));
        const box = await primary.boundingBox();
        await primary.click({ position: { x: box.width - 2, y: box.height - 2 } });
        check(`Start action bottom-right corner opens first module at ${viewport.width}`, page.url().endsWith('/module/foundations'));
        await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '首页', exact: true }).click();
        await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '全书目录', exact: true }).click();
        check(`Header catalog remains usable at ${viewport.width}`, await page.getByRole('dialog', { name: '全书目录' }).isVisible());
        await page.keyboard.press('Escape');
        await loaded();
      }
      const ids = ['foundations', 'exchange', 'astronomy', 'physics', 'medicine', 'china'];
      for (let index = 0; index < ids.length; index++) {
        const image = page.locator(`.entry-${index + 1} img`);
        await image.click();
        check(`Module ${index + 1} image opens correct directory at ${viewport.width}`, page.url().endsWith(`/module/${ids[index]}`));
        await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '首页', exact: true }).click();
        await loaded();
      }
      await page.keyboard.press('Tab');
      await page.locator('.entry-3').focus();
      check(`Keyboard focus is visible at ${viewport.width}`, await page.locator('.entry-3').evaluate(e => getComputedStyle(e).outlineStyle !== 'none'));
      await page.keyboard.press('Enter');
      check(`Keyboard entry opens astronomy at ${viewport.width}`, page.url().endsWith('/module/astronomy'));
    }
  }
  check('No page or console errors', errors.length === 0);
  writeFileSync(`qa/${evidence}${phase === 'immersive' ? '' : `-${phase}`}.json`, JSON.stringify({ views, checks, errors }, null, 2));
  console.log(JSON.stringify({ phase, checks: checks.length, errors }));
} finally {
  await browser.close();
}
