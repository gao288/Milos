import { test, expect } from '@playwright/test';
import { existsSync } from 'node:fs';

test.skip(!existsSync('public/live2d/Mao/Mao.moc3'), 'Run npm run live2d:setup for licensed sample assets.');
async function load(page){
 await page.goto('/?character=mao');
 await expect.poll(()=>page.evaluate(()=>window.avatar?.getState().character)).toBe('mao');
 for(const id of ['auto-blink','idle-motion','follow'])await page.locator('#'+id).uncheck();
}
test('Mao loads native artwork, distinct expressions, speech and translations',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await load(page);
 await expect(page.locator('#avatar canvas[data-renderer="live2d"]')).toHaveCount(1);
 await expect(page.locator('#mao-info')).toBeVisible();
 await expect(page.locator('#mouth-lab')).toBeHidden();
 const pictures=[];
 for(const preset of ['rest','laugh','heartbroken','terrified','furious']){
  await page.locator(`[data-preset="${preset}"]`).click();await page.waitForTimeout(650);
  pictures.push((await page.locator('#avatar').screenshot()).toString('base64'));
 }
 expect(new Set(pictures).size).toBe(pictures.length);
 await page.locator('[data-preset="rest"]').click();await page.waitForTimeout(650);
 const rest=(await page.locator('#avatar').screenshot()).toString('base64');
 await page.evaluate(()=>window.avatar.dispatch({type:'viseme',value:'A',weight:1,durationMs:3000}));
 await page.waitForTimeout(400);
 expect((await page.locator('#avatar').screenshot()).toString('base64')).not.toBe(rest);
 await page.locator('#ui-language').click();await expect(page.locator('#mao-info')).toContainText('原生眉眼');
 await page.locator('#ui-language').click();await expect(page.locator('#mao-info')).toContainText('Native eyes');
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect(errors).toEqual([]);
});
test('Mao/Rive swaps preserve the live facial stream and dispose old canvases',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await load(page);
 await page.locator('[data-preset="terrified"]').click();
 await page.evaluate(()=>{window.testStream=window.avatar.performance.beginStream(()=>0);
 window.testStream.append([{timeMs:0,weights:{jawOpen:.7,mouthPucker:.8}}]);});
 for(const id of ['girl','mao','follow','mao']){
  await page.selectOption('#character',id);
  await expect.poll(()=>page.evaluate(()=>window.avatar.getState().character)).toBe(id);
  const frame=await page.evaluate(()=>window.avatar.getFrame());
  expect(frame.expression.state).toBe('fear');expect(frame.performance.weights.jawOpen).toBe(.7);
  await expect(page.locator('#avatar canvas')).toHaveCount(1);
 }
 // Replacing Mao with another Mao instance overlaps Pixi's cached textures.
 await page.evaluate(()=>window.avatar.setCharacter('mao'));
 await page.waitForTimeout(100);
 const capture=(await page.locator('#avatar').screenshot()).toString('base64');
 const coloredPixels=await page.evaluate(async data=>{
  const img=new Image();img.src='data:image/png;base64,'+data;await img.decode();
  const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d');ctx.drawImage(img,0,0,256,256);
  const pixels=ctx.getImageData(0,0,256,256).data;let count=0;
  for(let i=0;i<pixels.length;i+=4)if(pixels[i]-pixels[i+1]>50||pixels[i+2]-pixels[i+1]>30)count++;
  return count;
 },capture);
 expect(coloredPixels).toBeGreaterThan(1000);
 await page.evaluate(()=>window.testStream.stop());
 await expect.poll(()=>page.evaluate(()=>window.avatar.getFrame().performance)).toBeNull();
 expect(errors).toEqual([]);
});
test('Mao download failure retains the working renderer and can be retried',async({page})=>{
 await page.goto('/?character=orb');await page.waitForFunction(()=>window.avatar?.getState().ready);
 await page.route('**/Mao.model3.json',route=>route.fulfill({status:404,body:'Missing'}));
 await page.selectOption('#character','mao');await expect(page.locator('#status')).toHaveClass('error');
 expect(await page.evaluate(()=>window.avatar.getState().character)).toBe('orb');
 await expect(page.locator('#avatar canvas')).toHaveCount(1);
 await page.unroute('**/Mao.model3.json');await page.selectOption('#character','mao');
 await expect.poll(()=>page.evaluate(()=>window.avatar.getState().character)).toBe('mao');
 await expect(page.locator('#avatar canvas')).toHaveCount(1);
});
