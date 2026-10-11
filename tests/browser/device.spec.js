import { test, expect } from '@playwright/test';

async function setup(page) {
  await page.route('**/api/voice/health', route => route.fulfill({ json: { openaiConfigured: false, jevConfigured: false } }));
  await page.route('**/api/model/health', route => route.fulfill({ json: { loaded: false } }));
  await page.goto('/?character=follow');
  await page.waitForFunction(() => window.avatar?.getState().ready);
  await page.locator('#onebit-toggle').click();
  await expect(page.locator('#onebit-canvas')).toBeVisible();
}

async function pixels(page) {
  return page.evaluate(() => {
    const c = document.querySelector('#onebit-canvas');
    const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let black = 0, invalid = 0, hash = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] === 0) black++;
      if (![0,255].includes(data[i]) || data[i] !== data[i+1] || data[i] !== data[i+2] || data[i+3] !== 255) invalid++;
      hash = ((hash * 31) + data[i]) | 0;
    }
    return { black, invalid, hash };
  });
}

test('Follow is rendered as real binary pixels and responds to presets, resolution and refresh limits', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await setup(page);
  await expect.poll(async () => (await pixels(page)).black).toBeGreaterThan(1000);
  expect((await pixels(page)).invalid).toBe(0);
  await page.locator('#auto-blink').uncheck(); await page.locator('#idle-motion').uncheck();
  await page.locator('[data-preset="rest"]').click(); await page.waitForTimeout(900);
  const rest = await pixels(page);
  await page.locator('[data-preset="terrified"]').click(); await page.waitForTimeout(900);
  expect((await pixels(page)).hash).not.toBe(rest.hash);
  await page.selectOption('#onebit-resolution', '200');
  await expect(page.locator('#onebit-canvas')).toHaveAttribute('width', '200');
  await page.selectOption('#onebit-fps', '1');
  // Observe actual putImageData calls, not the configured FPS value.
  await page.evaluate(() => {
    const c = document.querySelector('#onebit-canvas').getContext('2d');
    const put = c.putImageData.bind(c); window.sampleTimes = [];
    c.putImageData = (...args) => { window.sampleTimes.push(performance.now()); return put(...args); };
  });
  await page.waitForTimeout(2250);
  const times = await page.evaluate(() => window.sampleTimes);
  expect(times.length).toBeGreaterThanOrEqual(2); expect(times.length).toBeLessThanOrEqual(3);
  expect(times[1] - times[0]).toBeGreaterThanOrEqual(980);
  expect((await pixels(page)).invalid).toBe(0);
  await page.locator('#onebit-toggle').click();
  await expect(page.locator('#avatar canvas')).toHaveCount(1);
  await expect(page.locator('#avatar canvas')).toHaveCSS('opacity', '1');
  expect(errors).toEqual([]);
});

test('hook demos are interruptible, translated, and release mouth control before switching renderers', async ({ page }) => {
  await setup(page);
  await page.locator('[data-device-hook="voice.speaking"]').click();
  await expect.poll(() => page.evaluate(() => window.avatar.getState().viseme)).not.toBe('REST');
  await page.locator('[data-device-hook="task.failed"]').click();
  expect(await page.evaluate(() => window.avatar.getState().viseme)).toBe('REST');
  expect(await page.evaluate(() => window.avatar.getState().emotion)).toBe('sad');
  await page.waitForTimeout(1400);
  expect(await page.evaluate(() => window.avatar.getState().viseme)).toBe('REST');
  await page.locator('#ui-language').click();
  await expect(page.locator('#device-panel h2')).toHaveText('1-bit 墨水屏预览');
  await expect(page.locator('#device-hook-event')).toHaveText('task.failed');
  await page.locator('[data-preset="laugh"]').click();
  await expect(page.locator('#device-hook-event')).toHaveText('—');
  await page.locator('[data-device-hook="voice.speaking"]').click();
  await page.selectOption('#character', 'orb');
  await expect(page.locator('#onebit-canvas')).toHaveCount(0);
  await expect(page.locator('#onebit-toggle')).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => window.avatar.getState().viseme)).toBe('REST');
  await page.locator('#onebit-toggle').click();
  await expect(page.locator('#character')).toHaveValue('follow');
  await expect(page.locator('#onebit-canvas')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
