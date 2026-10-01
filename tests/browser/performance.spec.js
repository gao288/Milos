import { test, expect } from "@playwright/test";

const clip = {
  schema: "arkit-52-v1", durationMs: 9000, fps: 30,
  provider: "test-fixture", device: "CPUExecutionProvider", inferenceMs: 10,
  frames: [
    { timeMs: 0, weights: { jawOpen: 0 } },
    { timeMs: 1000, weights: { jawOpen: 0.8, mouthPucker: 0.4 } },
    { timeMs: 2000, weights: { jawOpen: 0.1 } },
    { timeMs: 8000, weights: { jawOpen: 0 } },
  ],
};

test("audio-clock performance pauses, seeks, survives renderer swaps, and stops", async ({ page }) => {
  const errors = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/model/health", (route) => route.fulfill({ json: { loaded: true, device: "CPUExecutionProvider" } }));
  await page.route("**/api/model/infer", (route) => route.fulfill({ json: clip }));
  await page.goto("/?character=milo"); await page.waitForFunction(() => window.avatar?.getState().ready);
  await page.locator("#model-sample-en").click();
  await expect(page.locator("#model-status")).toContainText("已生成");
  await page.evaluate(async () => {
    const audio = document.querySelector("#model-audio");
    await audio.play(); audio.pause(); audio.currentTime = 1;
  });
  await expect.poll(() => page.evaluate(() => window.avatar.getFrame().performance?.weights.jawOpen)).toBe(0.8);
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.avatar.getFrame().performance.timeMs)).toBe(1000);
  await page.evaluate(() => window.avatar.dispatch({ type: "expression", emotion: "happy" }));
  await page.selectOption("#character", "orb");
  await expect.poll(() => page.evaluate(() => window.avatar.getState().character)).toBe("orb");
  expect(await page.evaluate(() => window.avatar.getFrame().performance.weights.jawOpen)).toBe(0.8);
  await page.evaluate(() => { document.querySelector("#model-audio").currentTime = 0.5; });
  await expect.poll(() => page.evaluate(() => window.avatar.getFrame().performance?.weights.jawOpen)).toBe(0.4);
  await page.selectOption("#character", "milo");
  await expect.poll(() => page.evaluate(() => window.avatar.getState().character)).toBe("milo");
  // A queued seeked event must not revive the stream after a synchronous stop.
  await page.evaluate(() => {
    document.querySelector("#model-audio").currentTime = 1.5;
    window.avatar.stop();
  });
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.avatar.getFrame().performance)).toBeNull();
  await page.locator("#model-stop").click();
  expect(await page.evaluate(() => window.avatar.getFrame().performance)).toBeNull();
  expect(await page.evaluate(() => window.avatar.getState().emotion)).toBe("happy");
  expect(await page.evaluate(() => document.querySelector("#model-audio").paused)).toBe(true);
  expect(errors).toEqual([]);
});

test("stopping an in-flight model request cannot install a late result", async ({ page }) => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  await page.route("**/api/model/infer", async (route) => {
    await gate; await route.fulfill({ json: clip }).catch(() => {});
  });
  await page.goto("/?character=milo"); await page.waitForFunction(() => window.avatar?.getState().ready);
  const request = page.waitForRequest("**/api/model/infer");
  await page.locator("#model-sample-en").click(); await request;
  await page.locator("#model-stop").click(); release();
  await page.waitForTimeout(250);
  await expect(page.locator("#model-download")).toBeDisabled();
  expect(await page.evaluate(() => window.avatar.getFrame().performance)).toBeNull();
});

test("streamed model packets use the caller's clock, not arrival time", async ({ page }) => {
  await page.goto("/?character=milo"); await page.waitForFunction(() => window.avatar?.getState().ready);
  await page.evaluate(() => {
    window.testAudioTime = 0;
    window.testStream = window.avatar.performance.beginStream(() => window.testAudioTime);
    window.testStream.append([{ timeMs: 0, weights: { jawOpen: 0 } }, { timeMs: 1000, weights: { jawOpen: 1 } }]);
    window.testAudioTime = 500;
  });
  expect(await page.evaluate(() => window.avatar.getFrame().performance.weights.jawOpen)).toBe(0.5);
  await page.evaluate(() => window.avatar.stop());
  expect(await page.evaluate(() => window.avatar.getFrame().performance)).toBeNull();
});
