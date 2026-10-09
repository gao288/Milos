import { test, expect } from "@playwright/test";

// Legacy behavior assertions intentionally exercise the Chinese locale.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('realpet.locale', 'zh'));
});

test("marketplace character follows normalized gaze and swaps without losing state", async ({ page }) => {
  const errors = [];
  const external = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (["http:", "https:"].includes(url.protocol) &&
      !url.hostname.match(/^(localhost|127\.0\.0\.1)$/))
      external.push(request.url());
  });
  await page.goto("/?character=follow");
  await page.waitForFunction(() => window.avatar?.getState().ready);
  await expect(page.locator("#character")).toHaveValue("follow");
  await expect(page.locator("#follow-info")).toContainText("alinazari");
  await expect(page.locator("#follow-info")).toContainText("连续嘴形已接入");
  await expect(page.locator('[data-emotion="happy"]')).toBeEnabled();
  await expect(page.locator("#follow")).toBeChecked();
  const stage = await page.locator("#stage").boundingBox();
  await page.mouse.move(stage.x + stage.width * 0.8, stage.y + stage.height * 0.6);
  await expect.poll(() => page.evaluate(() => window.avatar.getFrame().motion.gazeX)).toBeGreaterThan(0.5);
  await page.locator("#follow").uncheck();

  // Inspect the native listener boundary as well as actual rendered output.
  await page.evaluate(() => {
    window.pointerSamples = [];
    document.querySelector("#avatar canvas").addEventListener("mousemove", (event) => {
      window.pointerSamples.push([event.clientX, event.clientY]);
    });
    window.avatar.dispatch({ type: "motion", gazeX: -0.9, gazeY: 0 });
  });
  await page.waitForTimeout(750);
  const leftPoint = await page.evaluate(() => window.pointerSamples.at(-1));
  const left = await page.locator("#avatar").screenshot();
  await page.locator("#gazeX").fill("0.9");
  await page.locator("#gazeX").dispatchEvent("input");
  await page.waitForTimeout(750);
  const rightPoint = await page.evaluate(() => window.pointerSamples.at(-1));
  const right = await page.locator("#avatar").screenshot({ path: "test-results/follow-gaze.png" });
  expect(rightPoint[0] - leftPoint[0]).toBeGreaterThan(100);
  expect(left.equals(right)).toBe(false);

  await page.evaluate(() => {
    window.avatar.dispatch({ type: "expression", emotion: "happy" });
    window.avatar.dispatch({ type: "viseme", value: "U" });
  });
  for (const character of ["milo", "follow", "orb", "follow", "milo"]) {
    await page.evaluate((id) => window.avatar.setCharacter(id), character);
    await expect(page.locator("#avatar canvas")).toHaveCount(1);
  }
  await expect(page.locator('[data-emotion="happy"]')).toBeEnabled();
  await expect(page.locator("#follow-info")).toBeHidden();
  expect(await page.evaluate(() => window.avatar.getState().emotion)).toBe("happy");
  expect(await page.evaluate(() => window.avatar.getState().viseme)).toBe("U");
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test("Follow's native expressions and speech bindings work independently", async ({ page }) => {
  await page.goto("/?character=follow");
  await page.waitForFunction(() => window.avatar?.getState().ready);
  await page.evaluate(async () => {
    const { RiveAdapter } = await import("/src/adapters/rive.js");
    const { interactiveFollow } = await import("/src/characters/interactive-follow.js");
    const { DEFAULT_CONTRACT } = await import("/src/framework/index.js");
    const host = document.createElement("div"); host.id = "follow-probe";
    host.style.cssText = "position:fixed;left:0;top:0;width:600px;height:600px;background:white;z-index:999";
    document.body.append(host);
    const adapter = new RiveAdapter(interactiveFollow);
    await adapter.mount(host, DEFAULT_CONTRACT);
    adapter.canvas.style.visibility = "visible";
    adapter.rive.viewModelInstance.number("nativeBlink").value = 0;
    adapter.rive.viewModelInstance.number("intensity").value = 1;
    window.followProbe = adapter;
  });
  await page.waitForTimeout(1000);
  const neutral = await page.locator("#follow-probe").screenshot();
  await page.waitForTimeout(250);
  expect(neutral.equals(await page.locator("#follow-probe").screenshot())).toBe(true);
  await page.evaluate(() => window.followProbe.rive.viewModelInstance.number("emotion").value = 1);
  await page.waitForTimeout(500);
  const happy = await page.locator("#follow-probe").screenshot({ path: "test-results/follow-native-happy.png" });
  expect(happy.equals(neutral)).toBe(false);
  expect(await page.evaluate(() => window.followProbe.rive.viewModelInstance.number("lowerCenterY").value)).toBe(2);
  await page.evaluate(() => {
    const vm = window.followProbe.rive.viewModelInstance;
    for (const [key, value] of Object.entries({ restWeight: 0, speechWeight: 1, lowerCenterY: 36, lowerLeftY: 30, lowerRightY: 30, teethVisible: 1 })) vm.number(key).value = value;
  });
  await page.waitForTimeout(100);
  const opened = await page.locator("#follow-probe").screenshot({ path: "test-results/follow-native-speech.png" });
  expect(opened.equals(happy)).toBe(false);
  await page.evaluate(() => {
    const vm = window.followProbe.rive.viewModelInstance;
    for (const name of ["lowerCenterY", "lowerLeftY", "lowerRightY"]) vm.number(name).value = -2;
  });
  await page.waitForTimeout(100);
  expect(opened.equals(await page.locator("#follow-probe").screenshot())).toBe(false);
  expect(await page.evaluate(() => window.followProbe.rive.viewModelInstance.number("emotion").value)).toBe(1);
  const jawRest = await page.locator("#follow-probe").screenshot();
  await page.evaluate(() => window.followProbe.rive.viewModelInstance.number("jawY").value = 15);
  await page.waitForTimeout(100);
  expect(jawRest.equals(await page.locator("#follow-probe").screenshot())).toBe(false);
  await page.evaluate(() => { window.followProbe.dispose(); document.querySelector("#follow-probe").remove(); });
});

test("Follow consumes continuous model packets and keeps emotional intent", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => window.avatar?.getState().ready);
  await expect(page.locator("#character")).toHaveValue("follow");
  await expect(page.locator("#model-character-note")).toContainText("支持连续嘴形");
  await page.locator("#follow").uncheck();
  await page.locator("#auto-blink").uncheck();
  await page.locator("#idle-motion").uncheck();
  await page.evaluate(() => {
    window.avatar.dispatch({ type: "expression", emotion: "curious" });
    window.testTime = 0;
    window.testStream = window.avatar.performance.beginStream(() => window.testTime);
    window.testStream.append([
      { timeMs: 0, weights: { jawOpen: 0 } },
      { timeMs: 1000, weights: { jawOpen: .9, mouthPucker: .5 } },
    ]);
  });
  await page.waitForTimeout(1100);
  const closed = await page.locator("#avatar").screenshot();
  await page.evaluate(() => window.testTime = 1000);
  await page.waitForTimeout(150);
  const open = await page.locator("#avatar").screenshot({ path: "test-results/follow-model-open.png" });
  expect(open.equals(closed)).toBe(false);
  expect(await page.evaluate(() => window.avatar.getState().emotion)).toBe("curious");
  await page.evaluate(() => window.avatar.setCharacter("milo"));
  await page.evaluate(() => window.avatar.setCharacter("follow"));
  expect(await page.evaluate(() => window.avatar.getFrame().performance.weights.jawOpen)).toBe(.9);
  await page.evaluate(() => window.avatar.stop());
  expect(await page.evaluate(() => window.avatar.getFrame().performance)).toBeNull();
});

test("individual lip controls reach native geometry and release ownership to audio", async ({ page }) => {
  await page.goto('/?character=follow');
  await page.waitForFunction(() => window.avatar?.getState().ready);
  await page.locator('#follow').uncheck();
  await page.locator('#idle-motion').uncheck();
  await page.locator('#auto-blink').uncheck();
  await page.locator('#mouth-lab summary').click();
  const set = async (channel, value) => {
    await page.locator('#mouth-' + channel).fill(String(value));
    await page.locator('#mouth-' + channel).dispatchEvent('input');
    await page.waitForTimeout(120);
  };
  await set('jawOpen', .4);
  await page.waitForTimeout(800);
  const neutral = await page.locator('#avatar').screenshot();
  await set('mouthUpperUpLeft', 1);
  const upper = await page.locator('#avatar').screenshot({path:'test-results/follow-left-upper-lip.png'});
  expect(upper.equals(neutral)).toBe(false);
  const weights = await page.evaluate(() => window.avatar.getFrame().performance.weights);
  expect(weights.mouthUpperUpLeft).toBe(1); expect(weights.mouthUpperUpRight).toBe(0);
  await set('mouthClose', 1);
  const closed = await page.locator('#avatar').screenshot({path:'test-results/follow-sealed-lips.png'});
  expect(closed.equals(upper)).toBe(false);
  await page.locator('#mouth-lab-reset').click();
  expect(await page.evaluate(() => window.avatar.getFrame().performance)).toBeNull();
  // A different source takes over. Resetting stale sliders must leave it intact.
  await set('mouthPucker', .8);
  await page.evaluate(() => {
    const stream = window.avatar.performance.beginStream(() => 0);
    stream.append([{timeMs:0,weights:{jawOpen:.7}}]);
  });
  await expect(page.locator('#mouth-lab-status')).toContainText('调节滑块');
  await page.locator('#mouth-lab-reset').click();
  expect(await page.evaluate(() => window.avatar.getFrame().performance.weights.jawOpen)).toBe(.7);
  await page.evaluate(() => window.avatar.setCharacter('milo'));
  await expect(page.locator('#mouth-lab')).toBeHidden();
  await page.evaluate(() => window.avatar.setCharacter('follow'));
  await expect(page.locator('#mouth-lab')).toBeVisible();
});

test('V2 fear reaches native rendering and Classic swaps preserve continuous articulation', async ({page}) => {
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?character=follow');
  await page.waitForFunction(()=>window.avatar?.getState().ready);
  for(const id of ['auto-blink','idle-motion','follow']) await page.locator('#'+id).uncheck();
  await expect(page.locator('[data-preset]')).toHaveCount(12);
  await page.locator('[data-preset="uneasy"]').click();
  await page.waitForTimeout(850);
  const uneasy=await page.locator('#avatar').screenshot();
  await page.locator('[data-preset="terrified"]').click();
  await page.waitForTimeout(850);
  const fear=await page.locator('#avatar').screenshot({path:'test-results/follow-v2-fear.png'});
  expect(uneasy.equals(fear)).toBe(false);
  expect(await page.evaluate(()=>window.avatar.getFrame().expression.state)).toBe('fear');
  expect(await page.evaluate(()=>window.avatar.getState().face.jawOpen)).toBe(0);
  await page.evaluate(()=>window.avatar.performance.beginStream(()=>0).append([{timeMs:0,weights:{jawOpen:.7,mouthUpperUpLeft:.8}}]));
  for(const id of ['follow-classic','follow']) {
    await page.selectOption('#character',id);
    await expect.poll(()=>page.evaluate(()=>window.avatar.getState().character)).toBe(id);
    const frame=await page.evaluate(()=>window.avatar.getFrame());
    expect(frame.expression.state).toBe('fear');
    expect(frame.performance.weights.jawOpen).toBe(.7);
    await expect(page.locator('#loading')).toBeHidden();
  }
  expect(errors).toEqual([]);
});

test('blinking never paints white outside the cheek silhouette', async ({page}) => {
  await page.goto('/?character=follow');
  await page.waitForFunction(()=>window.avatar?.getState().ready);
  await page.evaluate(async()=>{
    const { RiveAdapter }=await import('/src/adapters/rive.js');
    const { interactiveFollow }=await import('/src/characters/interactive-follow.js');
    const { DEFAULT_CONTRACT }=await import('/src/framework/index.js');
    const host=document.createElement('div');host.id='blink-probe';
    host.style.cssText='position:fixed;left:0;top:0;width:600px;height:600px;background:#d6ddd0;z-index:999';
    document.body.append(host);
    const adapter=new RiveAdapter(interactiveFollow);
    await adapter.mount(host,DEFAULT_CONTRACT);adapter.canvas.style.visibility='visible';
    adapter.rive.viewModelInstance.number('nativeBlink').value=0;
    window.blinkProbe=adapter;
  });
  await page.waitForTimeout(600);
  for(const openness of [1,.5,.1,0,1]) {
    await page.evaluate(value=>window.blinkProbe.rive.viewModelInstance.number('eyeOpen').value=value,openness);
    await page.waitForTimeout(80);
    const capture=(await page.locator('#blink-probe').screenshot()).toString('base64');
    const whitePixels=await page.evaluate(async data=>{
      const img=new Image();img.src='data:image/png;base64,'+data;await img.decode();
      const canvas=document.createElement('canvas');canvas.width=600;canvas.height=600;
      const c=canvas.getContext('2d');c.drawImage(img,0,0);
      // Inside the left lens, immediately outside the face's black outline.
      // The former painted mask covered this background patch when eyes opened.
      const pixels=c.getImageData(222,267,4,12).data;
      let white=0;
      for(let i=0;i<pixels.length;i+=4) if(pixels[i]>245&&pixels[i+1]>245&&pixels[i+2]>245) white++;
      return white;
    },capture);
    expect(whitePixels,`eyeOpen=${openness}`).toBe(0);
  }
  await page.evaluate(()=>{window.blinkProbe.dispose();document.querySelector('#blink-probe').remove();});
});
