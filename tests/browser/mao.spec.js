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

test('Mao renders an open mouth for ordinary low-jaw model speech, then closes in silence',async({page})=>{
 const {readFile}=await import('node:fs/promises');
 const clip=JSON.parse(await readFile('tests/fixtures/mao-speech.json','utf8'));
 await load(page);
 await page.evaluate(async()=>{
  const {Live2DAdapter}=await import('/src/adapters/live2d.js');const {mao}=await import('/src/characters/mao.js');
  const host=document.createElement('div');host.id='mao-mouth-probe';
  host.style.cssText='position:fixed;inset:0;width:600px;height:600px;background:white;z-index:999';document.body.append(host);
  window.maoProbe=new Live2DAdapter(mao);await window.maoProbe.mount(host);
 });
 const sample=async weights=>{
  await page.evaluate(async b=>{
   const f={expression:{state:'neutral',intensity:1},face:{},motion:{eyeOpen:1,gazeX:0,gazeY:0,headTilt:0,breath:0},mouth:{weights:{REST:1}},performance:{weight:1,weights:b}};
   for(let i=0;i<25;i++){window.maoProbe.render(f);await new Promise(r=>setTimeout(r,16));}
  },weights);
  const image=(await page.locator('#mao-mouth-probe').screenshot()).toString('base64');
  return page.evaluate(async data=>{
   const img=new Image();img.src='data:image/png;base64,'+data;await img.decode();
   const c=document.createElement('canvas');c.width=c.height=600;const ctx=c.getContext('2d');ctx.drawImage(img,0,0,600,600);
   // Mouth-only region: count the pink/dark interior, excluding skin and nose.
   const pixels=ctx.getImageData(278,300,44,28).data;let count=0;
   for(let i=0;i<pixels.length;i+=4)if(pixels[i]>70&&pixels[i+1]<180&&pixels[i+2]<185&&pixels[i]>pixels[i+1]*1.3)count++;
   return count;
  },image);
 };
 const rest=await sample({});
 for(const frame of clip.frames)expect(await sample(frame.weights),frame.language+' mouth interior').toBeGreaterThan(rest*2+50);
 expect(await sample({jawOpen:.04,mouthUpperUpLeft:.15,mouthUpperUpRight:.15,mouthLowerDownLeft:.25,mouthLowerDownRight:.25})).toBeGreaterThan(rest*2+50);
 const silence=await sample({});expect(Math.abs(silence-rest)).toBeLessThanOrEqual(3);
 await page.evaluate(()=>{window.maoProbe.dispose();document.querySelector('#mao-mouth-probe').remove();});
});
