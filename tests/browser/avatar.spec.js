import { test, expect } from "@playwright/test";

// Legacy behavior assertions intentionally exercise the Chinese locale.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('realpet.locale', 'zh'));
});

test("expressive presets, facial controls and speech remain independent", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?character=milo");
  await page.waitForFunction(() => window.avatar?.getState().ready);
  await page.locator("#auto-blink").uncheck();
  await page.locator("#idle-motion").uncheck();
  await page.locator('[data-preset="laugh"]').click();
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => window.avatar.getState().face.jawOpen)).toBe(
    0.35,
  );
  const laugh = await page
    .locator("#avatar")
    .screenshot({ path: "test-results/expressive-laugh.png" });
  await page.locator('[data-preset="worried"]').click();
  await page.waitForTimeout(600);
  const worried = await page
    .locator("#avatar")
    .screenshot({ path: "test-results/expressive-worried.png" });
  expect(laugh.equals(worried)).toBe(false);
  await page.locator("#face-toggle").click();
  await page.locator("#face-browRaiseLeft").fill("0.6");
  await page.locator("#face-browRaiseLeft").dispatchEvent("input");
  await page.evaluate(() =>
    window.avatar.dispatch({ type: "viseme", value: "A" }),
  );
  expect(await page.evaluate(() => window.avatar.getState().emotion)).toBe(
    "sad",
  );
  expect(
    await page.evaluate(() => window.avatar.getState().face.browRaiseLeft),
  ).toBe(0.6);
  await expect
    .poll(() => page.evaluate(() => window.avatar.getFrame().mouth.viseme))
    .toBe("A");
  await page.selectOption("#character", "milo-basic");
  await expect
    .poll(() => page.evaluate(() => window.avatar.getState().character))
    .toBe("milo-basic");
  await page.selectOption("#character", "milo");
  await expect
    .poll(() => page.evaluate(() => window.avatar.getState().character))
    .toBe("milo");
  expect(
    await page.evaluate(() => window.avatar.getState().face.browRaiseLeft),
  ).toBe(0.6);
  await page.locator("#reset").click();
  expect(
    await page.evaluate(() => window.avatar.getState().face.browRaiseLeft),
  ).toBe(0);
  await page.locator("#demo").click();
  await expect(page.locator("#demo")).toHaveText("■ 停止演示");
  await page.locator("#demo").click();
  expect(errors).toEqual([]);
});

test("native Rive emotional mouth works without the Web frame solver", async ({
  page,
}) => {
  await page.goto("/?character=milo");
  await page.waitForFunction(() => window.avatar?.getState().ready);
  await page.evaluate(async () => {
    const { RiveAdapter } = await import("/src/adapters/rive.js");
    const { milo } = await import("/src/characters/milo.js");
    const { DEFAULT_CONTRACT } = await import("/src/framework/index.js");
    const host = document.createElement("div");
    host.id = "native-probe";
    host.style.cssText =
      "position:fixed;left:0;top:0;width:500px;height:500px;background:#eef2e5;z-index:999";
    document.body.append(host);
    const adapter = new RiveAdapter(milo);
    await adapter.mount(host, DEFAULT_CONTRACT);
    adapter.canvas.style.visibility = "visible";
    const vm = adapter.rive.viewModelInstance;
    vm.number("liveliness").value = 0;
    vm.number("intensity").value = 1;
    window.nativeProbe = adapter;
  });
  await page.waitForTimeout(500);
  const neutral = await page.locator("#native-probe").screenshot();
  await page.evaluate(
    () =>
      (window.nativeProbe.rive.viewModelInstance.number("emotion").value = 1),
  );
  await page.waitForTimeout(550);
  const happy = await page
    .locator("#native-probe")
    .screenshot({ path: "test-results/native-rive-happy.png" });
  expect(neutral.equals(happy)).toBe(false);
  // The native Rive state still drives the emotional mouth; JS-bound viseme remains at its default.
  expect(
    await page.evaluate(
      () =>
        window.nativeProbe.rive.viewModelInstance.number("mouthHeight").value,
    ),
  ).toBe(4);
  await page.evaluate(() => window.nativeProbe.dispose());
});
test("native Rive draws and reacts; stream, stop, bridge and mobile work", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?character=milo");
  await page.waitForFunction(() => window.avatar?.getState().ready);
  await page.locator("#auto-blink").uncheck();
  await page.locator("#idle-motion").uncheck();
  await page.waitForTimeout(500);
  const before = await page.locator("#avatar").screenshot();
  await page.locator('[data-emotion="angry"]').click();
  await page.waitForTimeout(700);
  const after = await page.locator("#avatar").screenshot();
  expect(before.equals(after)).toBe(false);
  await page.locator('[data-emotion="happy"]').click();
  await page.locator("#play").click();
  await expect
    .poll(() => page.evaluate(() => window.avatar.getState().queue))
    .toBeGreaterThan(0);
  expect(await page.evaluate(() => window.avatar.getState().emotion)).toBe(
    "happy",
  );
  await page.locator("#stop").click();
  expect(await page.evaluate(() => window.avatar.getState().viseme)).toBe(
    "REST",
  );
  await page.evaluate(() => window.avatar.pushText("你好", true));
  await expect
    .poll(() => page.evaluate(() => window.avatar.getState().viseme))
    .not.toBe("REST");
  await page.evaluate(() => window.avatar.stop());
  await page.locator(".event-box summary").click();
  await page.locator("#event-json").fill('{"type":"motion","gazeX":99}');
  await page.locator("#send-event").click();
  await expect(page.locator("#status")).toHaveClass("error");
  await page.locator("#reset").click();
  await page.locator(".event-box summary").click();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: "test-results/desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  expect(errors).toEqual([]);
});
test("microphone denial returns to idle", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("Permission denied", "NotAllowedError");
    };
  });
  await page.goto("/?character=milo");
  await page.waitForFunction(() => window.avatar?.getState().ready);
  await page.locator('[data-tab="audio"]').click();
  await page.locator("#mic").click();
  await expect(page.locator("#status")).toContainText("麦克风不可用");
  expect(await page.evaluate(() => window.avatar.getState().source)).toBe(
    "idle",
  );
});

test("same events work after live Rive → Canvas → Rive swaps", async ({
  page,
}) => {
  await page.goto("/?character=milo");
  await page.waitForFunction(() => window.avatar?.getState().ready);
  await page.evaluate(() => {
    window.avatar.dispatch({
      type: "expression",
      emotion: "happy",
      intensity: 0.9,
    });
    window.avatar.dispatch({ type: "viseme", value: "O" });
  });
  await page.selectOption("#character", "orb");
  await expect
    .poll(() => page.evaluate(() => window.avatar.getState().character))
    .toBe("orb");
  expect(await page.evaluate(() => window.avatar.getState().emotion)).toBe(
    "happy",
  );
  expect(await page.evaluate(() => window.avatar.getFrame().mouth.viseme)).toBe(
    "O",
  );
  await expect(page.locator("#avatar canvas")).toHaveCount(1);
  await page.screenshot({ path: "test-results/orb.png", fullPage: true });
  await page.evaluate(() => window.avatar.pushText("Hello 你好。", true));
  await page.selectOption("#character", "milo");
  await expect
    .poll(() => page.evaluate(() => window.avatar.getState().character))
    .toBe("milo");
  expect(await page.evaluate(() => window.avatar.getState().emotion)).toBe(
    "happy",
  );
  await expect(page.locator("#avatar canvas")).toHaveCount(1);
  await page.evaluate(() => {
    window.avatar.setProviders({
      textToVisemes: () => [{ value: "U", duration: 500 }],
    });
    window.avatar.pushText("custom provider", true);
  });
  await expect
    .poll(() => page.evaluate(() => window.avatar.getFrame().mouth.viseme))
    .toBe("U");
  await page.evaluate(() => window.avatar.stop());
});

test("microphone connects and stop releases capture", async ({
  page,
  context,
}) => {
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    navigator.mediaDevices.getUserMedia = async (options) => {
      const stream = await original(options);
      window.capturedStream = stream;
      return stream;
    };
  });
  await page.goto("/?character=milo");
  await page.waitForFunction(() => window.avatar?.getState().ready);
  await page.locator('[data-tab="audio"]').click();
  await page.locator("#mic").click();
  await expect
    .poll(async () => ({
      button: await page.locator("#mic").textContent(),
      status: await page.locator("#status").textContent(),
    }))
    .toMatchObject({ button: "停止麦克风" });
  expect(await page.evaluate(() => window.avatar.getState().source)).toBe(
    "microphone",
  );
  await page.locator("#mic").click();
  expect(
    await page.evaluate(() =>
      window.capturedStream.getTracks().every((t) => t.readyState === "ended"),
    ),
  ).toBe(true);
  expect(await page.evaluate(() => window.avatar.getState().source)).toBe(
    "idle",
  );
});
