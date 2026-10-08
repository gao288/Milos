import { test, expect } from "@playwright/test";
import { encodeWav } from "../../src/providers/audio-model.js";

const health = { openaiConfigured: true, jevConfigured: true, token: "test-session", liveModel: "gpt-live-1", jevModel: "jev-1.13.0" };
const pcm = Buffer.alloc(32000);
for (let i = 0; i < 16000; i++) pcm.writeInt16LE(Math.round(3000 * Math.sin(i * 0.08)), i * 2);

async function setup(page, { output = "live" } = {}) {
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
  await page.route("**/api/voice/health", route => route.fulfill({ json: { ...health, elevenConfigured: true, elevenModel: "eleven_v4_turbo" } }));
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
  if (output === "eleven") await page.locator("#voice-output-eleven").click();
  await page.locator("#voice-start").click();
  await expect(page.locator("#voice-status")).toContainText("已连接");
  return {
    sent,
    event(event) { socket.send(JSON.stringify(event)); },
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
  await expect(page.locator("#jev-prediction")).toHaveText("开心 · happy");
  await expect(page.locator("#jev-strength")).toHaveText("0.80 / 0.95");
  await expect(page.locator("#jev-tilt")).toHaveText("0.30 / 0.90");
  await expect(page.locator("#jev-gesture")).toHaveText("点头 / 0.90");
  await expect(page.locator("[data-jev-emotion].active")).toHaveAttribute("data-jev-emotion", "happy");
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

test("JEV inspector shows rejected model output separately from applied animation and clears for a new session", async ({ page }) => {
  const result = { emotion: "sad", intensity: .7, confidence: .2, inferenceMs: 91,
    model: "jev-1.13.0", answers: {emotion:{type:"choice",choice:"sad",confidence:.2},intensity:{type:"score",score:2.8}} };
  await page.route("**/api/voice/emotion", route => route.fulfill({json:result}));
  const voice = await setup(page); voice.speak();
  await expect(page.locator("#jev-prediction")).toHaveText("悲伤 / 关切 · sad");
  await expect(page.locator("[data-jev-emotion]")).toHaveCount(6);
  await expect(page.locator("#jev-strength")).toHaveText("0.70 / 0.20");
  await page.locator(".jev-output summary").click();
  expect(JSON.parse(await page.locator("#jev-json").textContent())).toEqual(result);
  await expect(page.locator("#jev-input")).toHaveText("Hello! 你好！");
  await page.waitForTimeout(1100);
  expect(await page.evaluate(()=>window.avatar.getState().emotion)).toBe("neutral");
  await expect(page.locator("#jev-applied")).not.toContainText("sad");
  await page.setViewportSize({width:390,height:844});
  await page.locator(".jev-output").scrollIntoViewIfNeeded();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator(".jev-output").screenshot({path:"test-results/jev-inspector-mobile.png"});
  await page.locator("#voice-stop").click();
  await expect(page.locator("#jev-applied")).toHaveText("语音已停止");
  await page.locator("#voice-start").click();
  await expect(page.locator("#jev-json")).toHaveText("尚未收到结果");
  await expect(page.locator("[data-jev-emotion].active")).toHaveCount(0);
  await page.locator("#voice-stop").click();
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

test("sad delivery survives fragmented text, reaches the speaking avatar and settles after the phrase", async ({ page }) => {
  const requests = [];
  await page.route("**/api/voice/emotion", route => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({ json: { emotion: "sad", intensity: .65, confidence: .98, inferenceMs: 80 } });
  });
  const voice = await setup(page);
  await page.locator("#idle-motion").uncheck();
  await page.locator("#auto-blink").uncheck();
  voice.event({type:"session.input_transcript.delta",delta:"我失去了好朋友。",start_ms:0,end_ms:0});
  voice.event({type:"session.output_transcript.delta",delta:"听到这个消息，我很难过。",start_ms:0,end_ms:500});
  voice.audio(pcm);
  await expect.poll(()=>requests.length).toBe(1);
  voice.event({type:"session.output_transcript.delta",delta:"我在这里陪着",start_ms:500,end_ms:700});
  voice.event({type:"session.output_transcript.delta",delta:"你。",start_ms:700,end_ms:1000});
  await expect.poll(()=>requests.length).toBe(2);
  expect(requests[1].text).toBe("听到这个消息，我很难过。我在这里陪着你。");
  expect(requests[1].currentText).toBe("我在这里陪着你。");
  expect(requests[1].context).toContainEqual({role:"user",text:"我失去了好朋友。"});
  await expect.poll(()=>page.evaluate(()=>{
    const frame=window.avatar.getFrame();
    return frame.expression.state === "sad" && frame.expression.intensity > .5 && frame.performance?.weight > .8;
  })).toBe(true);
  await expect(page.locator("#emotion-badge")).toHaveText("sad");
  await expect(page.locator("#voice-metrics")).toContainText("JEV 判定 sad（置信度 0.98）");
  await page.locator("#stage").screenshot({path:"test-results/voice-sad-speaking.png"});
  await expect.poll(()=>page.evaluate(()=>window.avatar.getState().emotion),{timeout:4000}).toBe("neutral");
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

test('ElevenLabs selection explains missing configuration before requesting the microphone',async({page})=>{
 await page.route('**/api/voice/health',route=>route.fulfill({json:{...health,elevenConfigured:false}}));
 await page.goto('/');
 await page.locator('#voice-output-eleven').click();
 await expect(page.locator('#voice-output-note')).toContainText('ELEVENLABS_API_KEY');
 await page.locator('#voice-start').click();
 await expect(page.locator('#voice-status')).toContainText('ELEVENLABS_VOICE_ID');
 await expect(page.locator('#voice-output-live')).toBeEnabled();
 await page.locator('#voice-output-live').click();
 await expect(page.locator('#voice-output-live')).toHaveAttribute('aria-pressed','true');
});

const replacementAudio=Buffer.from(await encodeWav(Float32Array.from({length:16000},(_,i)=>Math.sin(i*.08)*.15)).arrayBuffer()).toString('base64');

test('ElevenLabs plays replacement audio with aligned captions, JEV and mouth while original Live audio stays muted',async({page})=>{
 let release;const gate=new Promise(resolve=>{release=resolve;});
 await page.route('**/api/voice/eleven',async route=>{await gate;await route.fulfill({json:{audio:replacementAudio,format:'wav',synthesisMs:150,emotion:{emotion:'sad',intensity:.7,confidence:.99,inferenceMs:80}}});});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const voice=await setup(page,{output:'eleven'});
 const request=page.waitForRequest('**/api/voice/eleven');voice.speak();await request;
 await expect(page.locator('#voice-output-live')).toBeDisabled();
 await page.waitForTimeout(1200);
 expect(await page.evaluate(()=>window.avatar.getState().behavior)).toBe('listening');
 expect(await page.evaluate(()=>window.avatar.getFrame().performance)).toBeNull();
 await expect(page.locator('#voice-assistant')).not.toContainText('Hello!');
 release();
 await expect(page.locator('#voice-assistant')).toHaveText('Hello! 你好！');
 await expect.poll(()=>page.evaluate(()=>window.avatar.getFrame().expression.state)).toBe('sad');
 await expect.poll(()=>page.evaluate(()=>window.avatar.getFrame().performance?.weight??0)).toBeGreaterThan(.8);
 await page.locator('#voice-stop').click();
 await page.locator('#voice-output-live').click();
 await expect(page.locator('#voice-output-live')).toHaveAttribute('aria-pressed','true');
 expect(errors).toEqual([]);
});

test('interrupting ElevenLabs synthesis discards late audio and emotion',async({page})=>{
 let release;const gate=new Promise(resolve=>{release=resolve;});
 await page.route('**/api/voice/eleven',async route=>{await gate;await route.fulfill({json:{audio:replacementAudio,emotion:{emotion:'angry',intensity:1,confidence:1}}}).catch(()=>{});});
 const voice=await setup(page,{output:'eleven'});
 const request=page.waitForRequest('**/api/voice/eleven');voice.speak();await request;
 await page.locator('#voice-interrupt').click();release();
 await page.waitForTimeout(1300);
 expect(await page.evaluate(()=>window.avatar.getState().emotion)).toBe('neutral');
 expect(await page.evaluate(()=>window.avatar.getFrame().performance)).toBeNull();
 await expect(page.locator('#voice-assistant')).not.toContainText('Hello!');
 await expect(page.locator('#voice-stop')).toBeEnabled();
 await page.locator('#voice-stop').click();
});
