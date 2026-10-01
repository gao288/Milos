import { test, expect } from "@playwright/test";

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
  expect(await page.evaluate(() => window.followProbe.rive.viewModelInstance.number("mouthHeight").value)).toBe(4);
  await page.evaluate(() => {
    const vm = window.followProbe.rive.viewModelInstance;
    for (const [key, value] of Object.entries({ restWeight: 0, speechWeight: 1, mouthHeight: 46, mouthWidth: 56, teethVisible: 1 })) vm.number(key).value = value;
  });
  await page.waitForTimeout(100);
  const opened = await page.locator("#follow-probe").screenshot({ path: "test-results/follow-native-speech.png" });
  expect(opened.equals(happy)).toBe(false);
  await page.evaluate(() => window.followProbe.rive.viewModelInstance.number("mouthHeight").value = 2);
  await page.waitForTimeout(100);
  expect(opened.equals(await page.locator("#follow-probe").screenshot())).toBe(false);
  expect(await page.evaluate(() => window.followProbe.rive.viewModelInstance.number("emotion").value)).toBe(1);
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
