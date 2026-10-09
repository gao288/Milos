import { test, expect } from '@playwright/test';

async function setup(page) {
  await page.route('**/api/voice/health', route => route.fulfill({json:{openaiConfigured:false,jevConfigured:false,token:'test'}}));
  await page.route('**/api/model/health', route => route.fulfill({json:{loaded:false}}));
  await page.goto('/'); await page.waitForFunction(() => window.avatar?.getState().ready);
}

test('English is default across all panels and accessibility labels, including dynamic errors', async ({page}) => {
  await setup(page);
  await expect(page.locator('html')).toHaveAttribute('lang','en');
  await expect(page.locator('#voice-start')).toHaveText('Start voice chat');
  const missing = await page.evaluate(() => {
    const results = [], walker = document.createTreeWalker(document.querySelector('#app'), NodeFilter.SHOW_TEXT);
    while(walker.nextNode()) { const n=walker.currentNode; if (!n.parentElement.closest('textarea,script,style,[data-i18n-ignore]') && /\p{Script=Han}/u.test(n.nodeValue)) results.push(n.nodeValue); }
    for(const el of document.querySelectorAll('[aria-label],[title],[placeholder]')) if(!el.closest('[data-i18n-ignore]'))
      for(const attr of ['aria-label','title','placeholder']) if(/\p{Script=Han}/u.test(el.getAttribute(attr)||''))results.push(el.getAttribute(attr));
    return results;
  });
  expect(missing).toEqual([]);
  await page.locator('#voice-start').click();
  await expect(page.locator('#voice-status')).toHaveText('Set OPENAI_API_KEY in .env and restart the voice service');
  await page.locator('#ui-language').click();
  await expect(page.locator('#voice-status')).toHaveText('请在本地 .env 配置 OPENAI_API_KEY 后重启语音服务');
});

test('language switches preserve avatar, input, controls and protocol data and persist on reload', async ({page}) => {
  await setup(page);
  await page.locator('#text').fill('不要翻译我的输入。Hello!');
  await page.locator('.event-box summary').click();
  await page.locator('#event-json').fill('{"type":"expression","emotion":"sad"}');
  await page.locator('#intensity').fill('0.42');
  await page.evaluate(() => { window.savedAvatar=window.avatar; window.savedCanvas=document.querySelector('#avatar canvas'); window.avatar.pushText('不要翻译字幕',true); });
  await page.locator('#ui-language').click();
  await expect(page.locator('h1')).toHaveText('认识你的表情伙伴。');
  await expect(page.locator('#voice-start')).toHaveText('开始语音聊天');
  await expect(page.locator('#text')).toHaveValue('不要翻译我的输入。Hello!');
  await expect(page.locator('#event-json')).toHaveValue('{"type":"expression","emotion":"sad"}');
  await expect(page.locator('#intensity')).toHaveValue('0.42');
  expect(await page.evaluate(()=>window.savedAvatar===window.avatar && window.savedCanvas===document.querySelector('#avatar canvas'))).toBe(true);
  await page.reload(); await expect(page.locator('html')).toHaveAttribute('lang','zh-CN');
  await page.locator('#ui-language').click(); await expect(page.locator('h1')).toHaveText('Meet your expressive companion.');
  await page.reload(); await expect(page.locator('html')).toHaveAttribute('lang','en');
});

test('language remains usable without localStorage and fits a mobile viewport', async ({page}) => {
  await page.addInitScript(()=>{Storage.prototype.getItem=()=>{throw Error('blocked')};Storage.prototype.setItem=()=>{throw Error('blocked')};});
  await page.setViewportSize({width:390,height:844}); await setup(page);
  await page.locator('#ui-language').click(); await expect(page.locator('html')).toHaveAttribute('lang','zh-CN');
  await page.locator('#ui-language').click(); await expect(page.locator('html')).toHaveAttribute('lang','en');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
