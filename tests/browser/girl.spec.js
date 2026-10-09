import { test, expect } from '@playwright/test';

async function loadGirl(page) {
  await page.goto('/?character=girl');
  await page.waitForFunction(() => window.avatar?.getState().ready && window.avatar.getState().character === 'girl');
  for (const id of ['auto-blink', 'idle-motion', 'follow']) await page.locator('#' + id).uncheck();
}

test('Girl loads with attribution, twelve poses and continuous mouth controls in both locales', async ({page}) => {
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await loadGirl(page);
  await expect(page.locator('#girl-info')).toContainText('marvin.te');
  await expect(page.locator('#girl-info')).toContainText('CC BY 4.0');
  await expect(page.locator('#follow-info')).toBeHidden();
  await expect(page.locator('#mouth-lab')).toBeVisible();
  await expect(page.locator('[data-preset]')).toHaveCount(12);
  const pictures=[];
  for (const preset of ['rest','warm','laugh','worried','heartbroken','surprise','terrified','furious']) {
    await page.locator(`[data-preset="${preset}"]`).click();
    await page.waitForTimeout(650);
    pictures.push((await page.locator('#avatar').screenshot()).toString('base64'));
  }
  expect(new Set(pictures).size).toBe(pictures.length);
  expect(await page.evaluate(()=>window.avatar.getState().face.jawOpen)).toBe(0);
  await page.locator('#ui-language').click();
  await expect(page.locator('#girl-info')).toContainText('七种情绪');
  await page.locator('#ui-language').click();
  await expect(page.locator('#girl-info')).toContainText('Seven emotions');
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('Girl preserves articulation and emotional intent through live renderer swaps', async ({page}) => {
  await loadGirl(page);
  await page.locator('[data-preset="terrified"]').click();
  await page.evaluate(()=>{
    window.girlStream=window.avatar.performance.beginStream(()=>0);
    window.girlStream.append([{timeMs:0,weights:{jawOpen:.7,mouthPucker:.2,mouthSmileLeft:.6,mouthUpperUpRight:.8}}]);
  });
  for (const id of ['follow','girl','milo','girl']) {
    await page.selectOption('#character',id);
    await expect.poll(()=>page.evaluate(()=>window.avatar.getState().character)).toBe(id);
    const frame=await page.evaluate(()=>window.avatar.getFrame());
    expect(frame.expression.state).toBe('fear');
    expect(frame.performance.weights.jawOpen).toBe(.7);
    expect(frame.performance.weights.mouthUpperUpRight).toBe(.8);
    await expect(page.locator('#avatar canvas')).toHaveCount(1);
  }
  await page.evaluate(()=>window.girlStream.stop());
  await expect.poll(()=>page.evaluate(()=>window.avatar.getFrame().performance)).toBeNull();
});

test('Girl native rig clips white eyes when blinking and separates speech from expressions', async ({page}) => {
  await loadGirl(page);
  await page.evaluate(async()=>{
    const { RiveAdapter }=await import('/src/adapters/rive.js');
    const { girl }=await import('/src/characters/girl.js');
    const { DEFAULT_CONTRACT }=await import('/src/framework/index.js');
    const host=document.createElement('div');host.id='girl-probe';
    host.style.cssText='position:fixed;left:0;top:0;width:600px;height:600px;background:#25382f;z-index:999';
    document.body.append(host);
    window.girlProbe=new RiveAdapter(girl);
    await window.girlProbe.mount(host,DEFAULT_CONTRACT);
    window.girlProbe.canvas.style.visibility='visible';
  });
  await page.waitForTimeout(700);
  const counts=[];
  for(const openness of [1,.5,0,1]) {
    await page.evaluate(value=>window.girlProbe.properties.eyeOpen.value=value,openness);
    await page.waitForTimeout(120);
    const capture=(await page.locator('#girl-probe').screenshot()).toString('base64');
    counts.push(await page.evaluate(async data=>{
      const img=new Image();img.src='data:image/png;base64,'+data;await img.decode();
      const c=document.createElement('canvas');c.width=c.height=600;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);
      // Limit the measurement to the eyes; the source also has a white nose highlight.
      const pixels=ctx.getImageData(140,220,190,75).data;let white=0;
      for(let i=0;i<pixels.length;i+=4)if(pixels[i]>248&&pixels[i+1]>248&&pixels[i+2]>248)white++;
      return white;
    },capture));
  }
  expect(counts[0]).toBeGreaterThan(30);
  expect(counts[1]).toBeLessThan(counts[0]);
  expect(counts[2]).toBe(0);
  expect(counts[3]).toBeGreaterThan(30);
  await page.evaluate(()=>{
    const p=window.girlProbe.properties;
    p.emotion.value=6;p.intensity.value=1;p.speechWeight.value=1;p.restWeight.value=0;
    p.lowerCenterY.value=34;p.jawY.value=12;
  });
  await page.waitForTimeout(450);
  expect(await page.evaluate(()=>window.girlProbe.properties.lowerCenterY.value)).toBe(34);
  expect(await page.evaluate(()=>window.girlProbe.properties.emotion.value)).toBe(6);
  await page.evaluate(()=>{window.girlProbe.dispose();document.querySelector('#girl-probe').remove();});
});
