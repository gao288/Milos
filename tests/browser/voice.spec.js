import { test, expect } from "@playwright/test";

const health = { openaiConfigured: true, jevConfigured: true, token: "test-session", liveModel: "gpt-live-1", jevModel: "jev-1.13.0" };
const pcm = Buffer.alloc(32000);
for (let i = 0; i < 16000; i++) pcm.writeInt16LE(Math.round(3000 * Math.sin(i * 0.08)), i * 2);

async function setup(page) {
  // A silent microphone exercises the worklet without synthetic-device barge-in.
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext({ sampleRate: 16000 });
      const dest = context.createMediaStreamDestination();
      window.fixtureMicContext = context;
      window.fixtureMicDestination = dest;
      return dest.stream;
    };
  });
  await page.route("**/api/voice/health", route => route.fulfill({ json: health }));
  await page.route("**/api/model/health", route => route.fulfill({ json: { loaded: true } }));
  await page.route("**/api/model/infer", route => route.fulfill({ json: {
    schema: "arkit-52-v1", durationMs: 1000, inferenceMs: 20,
    frames: Array.from({ length: 30 }, (_, i) => ({ timeMs: i * 1000 / 30, weights: { jawOpen: 0.7, mouthUpperUpLeft: 0.4 } })),
  } }));
  let socket;
  const sent = [];
  await page.routeWebSocket("**/api/voice/live?*", ws => {
    socket = ws;
    ws.onMessage(data => { const event = JSON.parse(data); sent.push(event.type); if (event.type === "session.close") { ws.send(JSON.stringify({ type: "session.closed" })); ws.close(); } });
    ws.send(JSON.stringify({ type: "session.started", session: { id: "fixture" } }));
  });
  await page.goto("/?character=follow");
  await page.waitForFunction(() => window.avatar?.getState().ready);
  await page.locator("#voice-start").click();
  await expect(page.locator("#voice-status")).toContainText("已连接");
  return {
    sent,
    audio(buffer) { socket.send(JSON.stringify({ type: "session.output_audio.delta", delta: buffer.toString("base64") })); },
    speak() {
      socket.send(JSON.stringify({ type: "session.output_transcript.delta", delta: "Hello! 你好！", start_ms: 0, end_ms: 1000 }));
      socket.send(JSON.stringify({ type: "session.output_audio.delta", delta: pcm.toString("base64") }));
    },
  };
}

test("missing OpenAI key explains setup without opening the microphone", async ({ page }) => {
  await page.route("**/api/voice/health", route => route.fulfill({ json: { ...health, openaiConfigured: false } }));
  await page.goto("/");
  await expect(page.locator("#voice-status")).toContainText("等待 GPT-Live");
  await page.locator("#voice-start").click();
  await expect(page.locator("#voice-status")).toContainText("OPENAI_API_KEY");
  await expect(page.locator("#voice-start")).toBeEnabled();
  await expect(page.locator("#voice-stop")).toBeDisabled();
});

test("user speech during a quiet turn does not send a stop-speaking instruction", async ({ page }) => {
  const voice = await setup(page);
  await page.evaluate(async () => {
    const context = window.fixtureMicContext;
    await context.resume();
    const tone = context.createOscillator();
    tone.connect(window.fixtureMicDestination); tone.start(); tone.stop(context.currentTime + 0.5);
  });
  await page.waitForTimeout(700);
  expect(voice.sent.filter(v => v === "session.input_audio.append").length).toBeGreaterThan(10);
  expect(voice.sent).not.toContain("bridge.interrupt");
  await expect(page.locator("#voice-stop")).toBeEnabled();
  await page.locator("#voice-stop").click();
});

test("captions, JEV and model mouth wait for playback; stopping releases the avatar", async ({ page }) => {
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.route("**/api/voice/emotion", route => route.fulfill({ json: { emotion: "happy", intensity: 0.8, confidence: 0.95, inferenceMs: 110,
    motion: { headTilt: .3 }, motionConfidence: .9, gesture: "nod", gestureConfidence: .9 } }));
  const voice = await setup(page); voice.speak();
  await page.locator("#idle-motion").uncheck();
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => window.avatar.getState().emotion)).toBe("neutral");
  await expect(page.locator("#voice-assistant")).not.toContainText("Hello!");
  await expect.poll(() => page.evaluate(() => window.avatar.getState().emotion)).toBe("happy");
  await expect(page.locator("#voice-assistant")).toHaveText("Hello! 你好！");
  await expect.poll(() => page.evaluate(() => window.avatar.getFrame().performance?.weights.jawOpen)).toBe(0.7);
  await expect.poll(() => page.evaluate(() => window.avatar.getFrame().motion.headTilt)).toBeGreaterThan(.1);
  expect(await page.locator("#headTilt").inputValue()).toBe("0");
  await page.locator("#voice-stop").click();
  expect(await page.evaluate(() => window.avatar.getFrame().performance)).toBeNull();
  expect(await page.evaluate(() => window.avatar.getState().behavior)).toBe("idle");
  await expect(page.locator("#voice-start")).toBeEnabled();
  expect(errors).toEqual([]);
});

test("continuous quiet packets cannot animate the mouth; speech resumes after silence", async ({ page }) => {
  let modelCalls = 0;
  page.on("request", req => { if (req.url().endsWith("/api/model/infer")) modelCalls++; });
  const voice = await setup(page);
  for (let i = 0; i < 6; i++) {
    voice.audio(Buffer.alloc(6400));
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.avatar.getFrame().performance)).toBeNull();
    expect(await page.evaluate(() => window.avatar.getState().behavior)).toBe("listening");
  }
  expect(modelCalls).toBe(0);
  voice.audio(pcm);
  await expect.poll(() => page.evaluate(() => window.avatar.getFrame().performance?.weight ?? 0)).toBeGreaterThan(.8);
  for (let i = 0; i < 8; i++) { voice.audio(Buffer.alloc(6400)); await page.waitForTimeout(200); }
  await expect.poll(() => page.evaluate(() => window.avatar.getFrame().performance)).toBeNull();
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.avatar.getFrame().performance)).toBeNull();
  voice.audio(pcm);
  await expect.poll(() => page.evaluate(() => window.avatar.getFrame().performance?.weight ?? 0)).toBeGreaterThan(.8);
  await page.locator("#voice-stop").click();
});

test("barge-in discards a late emotion result and queued audio without ending the session", async ({ page }) => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route("**/api/voice/emotion", async route => {
    await gate;
    await route.fulfill({ json: { emotion: "angry", intensity: 1, confidence: 1, inferenceMs: 800 } }).catch(() => {});
  });
  const voice = await setup(page);
  const request = page.waitForRequest("**/api/voice/emotion"); voice.speak(); await request;
  await page.locator("#voice-interrupt").click(); release();
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => window.avatar.getState().emotion)).toBe("neutral");
  expect(await page.evaluate(() => window.avatar.getFrame().performance)).toBeNull();
  await expect(page.locator("#voice-stop")).toBeEnabled();
  await expect(page.locator("#voice-assistant")).not.toContainText("Hello!");
  await page.locator("#voice-stop").click();
});
