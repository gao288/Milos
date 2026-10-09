import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { WebSocket } from "ws";
import { engineConfig, textResponder, createEngineService } from "../server/speech-engine.mjs";
import { createVoiceServer } from "../server/voice.mjs";
import { SpeechEngineOutput } from "../src/voice/speech-engine.js";
import { pcmEncode } from "../src/voice/timeline.js";

test("engine restricts callback URL, disables recordings and uses PCM16 on both sides", () => {
  assert.throws(() => engineConfig({ SPEECH_ENGINE_CALLBACK_URL: "http://localhost/api/voice" }));
  const c = engineConfig({ SPEECH_ENGINE_CALLBACK_URL: "wss://callback.example/speech-engine", ELEVENLABS_VOICE_ID: "male" });
  assert.equal(c.asr.userInputAudioFormat, "pcm_16000");
  assert.equal(c.tts.agentOutputAudioFormat, "pcm_16000");
  assert.equal(c.privacy.recordVoice, false);
  assert.equal(c.callLimits.agentConcurrencyLimit, 1);
});

test("cancelled LLM request cannot send stale text to a newer speech turn", async () => {
  let resolve, sent = 0, aborted = 0, options;
  const handler = textResponder({ responses: { create: (_request, opts) => { options = opts; return new Promise(r => resolve = r); } } });
  const controller = new AbortController();
  const pending = handler([{ role: "user", content: "你好" }], controller.signal, { isOpen: true, sendResponse: () => sent++ });
  assert.equal(options.signal, controller.signal);
  controller.abort(); resolve({ controller: { abort: () => aborted++ } }); await pending;
  assert.equal(sent, 0); assert.equal(aborted, 1);
});

test("public callback has no HTTP/token routes and rejects unsigned WebSocket connections", async t => {
  const service = createEngineService({ env: { SPEECH_ENGINE_ID: "seng_fixture", ELEVENLABS_API_KEY: "fixture", OPENAI_API_KEY: "fixture" } });
  await service.start(0); t.after(() => service.close());
  const base = `http://127.0.0.1:${service.server.address().port}`;
  assert.equal((await fetch(base + "/api/voice/health")).status, 404);
  const ws = new WebSocket(base.replace("http:", "ws:") + "/speech-engine");
  const error = await once(ws, "error"); assert.ok(error[0]);
});

test("private signed-session endpoint requires local token and never exposes API keys", async t => {
  let calls = 0;
  const server = createVoiceServer({ env: {}, engine: { ready: true, signedUrl: async () => { calls++; return { signedUrl: "wss://api.elevenlabs.io/fixture" }; } } });
  server.listen(0, "127.0.0.1"); await once(server, "listening"); t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(base + "/api/voice/speech-engine", { method: "POST" })).status, 403);
  assert.equal(calls, 0);
  const health = await (await fetch(base + "/api/voice/health")).json();
  assert.equal(health.speechEngineConfigured, true);
  const r = await fetch(base + "/api/voice/speech-engine", { method: "POST", headers: { "X-Realpet-Token": health.token } });
  assert.equal(r.status, 200); assert.equal(calls, 1);
});

test("engine captions use queued audio time; interrupted packet IDs never replay", () => {
  let plays = 0;
  const owner = { context: { currentTime: 1 }, sessionOrigin: 0, map: { delay: .8, next: 0 }, history: [], fragments: [], captions: [],
    playPCM() { plays++; return { at: 3.8, end: 4.8 }; }, interrupt() { output.interrupt(true); }, receive() {} };
  const output = new SpeechEngineOutput(owner);
  const packet = { type: "audio", audio_event: { event_id: 1, audio_base_64: pcmEncode(new Float32Array(16000)),
    alignment: { chars: ["你", "好"], char_start_times_ms: [0, 500], char_durations_ms: [400, 400] } } };
  output.receive(packet);
  assert.equal(plays, 1);
  assert.equal(owner.captions[0].startMs, 3000);
  assert.equal(owner.captions[1].startMs, 3500);
  output.receive({ type: "interruption", interruption_event: { event_id: 1 } });
  output.receive(packet); assert.equal(plays, 1);
  output.receive({ ...packet, audio_event: { ...packet.audio_event, event_id: 2 } }); assert.equal(plays, 2);
  output.interrupt(false);
  output.receive({ ...packet, audio_event: { ...packet.audio_event, event_id: 3 } }); assert.equal(plays, 2);
});

test("fast TTS bursts are paced into the mouth window and interruption empties all unplayed PCM", () => {
  let plays = 0;
  const owner = { context: { currentTime: 0 }, sessionOrigin: 0, map: { delay: .8, next: 0 }, history: [], fragments: [], captions: [],
    playPCM(samples) { plays++; const at = Math.max(this.context.currentTime + .8, this.map.next); this.map.next = at + samples.length / 16000; return { at, end: this.map.next }; } };
  const output = new SpeechEngineOutput(owner);
  const packet = { type: "audio", audio_event: { event_id: 1, audio_base_64: pcmEncode(new Float32Array(16000)) } };
  for (let i = 0; i < 12; i++) output.receive(packet);
  assert.equal(plays, 1); assert.equal(output.queuedSamples, 11 * 16000);
  owner.context.currentTime = 1; output.tick(); assert.equal(plays, 2);
  output.interrupt(true); assert.equal(output.queue.length, 0); assert.equal(output.queuedSamples, 0);
  owner.context.currentTime = 5; output.tick(); assert.equal(plays, 2);
});
