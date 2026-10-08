import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { WebSocket, WebSocketServer } from "ws";
import { CueQueue, PlayoutMap, transcriptFragment, pcmDecode, pcmEncode } from "../src/voice/timeline.js";
import { emotionRequest, decodeEmotion, inferEmotion } from "../server/jev.mjs";
import { createVoiceServer } from "../server/voice.mjs";

test("emotion cues follow playback, reject expired and previous-session results", () => {
  const queue = new CueQueue(), old = queue.epoch;
  queue.add({ at: 2, until: 3, emotion: "happy" });
  assert.equal(queue.take(1.9), null);
  assert.equal(queue.take(2.1).emotion, "happy");
  queue.add({ at: 1, until: 3, emotion: "sad" });
  assert.equal(queue.take(2.2), null);
  queue.add({ at: 4, until: 5, emotion: "angry" });
  assert.equal(queue.take(6), null);
  queue.clear();
  assert.equal(queue.add({ at: 7, until: 8 }, old), false);
});

test("PCM playback mapping preserves gaps and exact sample times", () => {
  const map = new PlayoutMap(0.8);
  assert.equal(map.append(8000, 0).at, 0.8);
  assert.equal(map.append(8000, 0.1).at, 1.3);
  assert.equal(map.timeForSample(4000), 1.05);
  assert.equal(map.append(8000, 3).at, 3.8);
  assert.equal(map.timeForSample(16000), 3.8);
  assert.equal(map.timeForSample(24000), null);
  map.clear(); assert.equal(map.timeForSample(0), null);
});

test("transcript fragments preserve spaces, repetitions and session timestamps", () => {
  const fragment = transcriptFragment({ type: "session.output_transcript.delta", delta: " yes yes 你好", start_ms: 900, end_ms: 1800 });
  assert.equal(fragment.text, " yes yes 你好"); assert.equal(fragment.startMs, 900);
  assert.equal(transcriptFragment({ type: "session.output_transcript.delta", delta: "bad", start_ms: 20, end_ms: 10 }), null);
});

test("PCM16 round-trips without a WAV header or signed sample corruption", () => {
  const input = Float32Array.from([-1, -0.4, 0, 0.3, 1]);
  const result = pcmDecode(pcmEncode(input));
  result.forEach((v, i) => assert.ok(Math.abs(v - input[i]) < 1 / 30000));
  assert.throws(() => pcmDecode("AQ=="));
});

const answer = { model: "jev-1.13.0", answers: { emotion: { type: "choice", choice: "happy", confidence: 0.9 }, intensity: { type: "score", score: 3.2 } } };
test("JEV scores normalize separately from confidence and reject bad output", async () => {
  const result = decodeEmotion(answer);
  assert.equal(result.intensity, 0.8); assert.equal(result.confidence, 0.9);
  assert.equal(emotionRequest({ text: "你好" }).model, "jev-1.13.0");
  assert.throws(() => emotionRequest({ text: "" }));
  assert.throws(() => decodeEmotion({ ...answer, answers: { ...answer.answers, intensity: { type: "score", score: 40 } } }));
  let requested;
  await inferEmotion({ text: "Great!" }, { key: "test", fetchFn: async (url, options) => { requested = { url, options }; return { ok: true, json: async () => answer }; } });
  assert.equal(requested.url, "https://api.typesafe.ai/v1/systemone");
  assert.equal(requested.options.redirect, "error");
});

test("voice bridge exposes configuration only, requires token, and detects missing key", async t => {
  const server = createVoiceServer({ env: { JEV_API_KEY: "secret-fixture" } });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const body = await (await fetch(base + "/api/voice/health")).json();
  assert.equal(body.openaiConfigured, false); assert.equal(body.jevConfigured, true);
  assert.ok(!JSON.stringify(body).includes("secret-fixture"));
  assert.equal((await fetch(base + "/api/voice/emotion", { method: "POST", body: "{}" })).status, 403);
  const ws = new WebSocket(base.replace("http", "ws") + "/api/voice/live?token=" + body.token);
  const [data] = await once(ws, "message");
  assert.equal(JSON.parse(data).type, "bridge.error");
  await once(ws, "close");
});

test("bridge relays audio, refuses arbitrary commands, and gracefully closes upstream", async t => {
  const provider = new WebSocketServer({ port: 0 }); await once(provider, "listening");
  let upstream, config, closed = false;
  const messages = [];
  provider.on("connection", socket => {
    upstream = socket;
    socket.on("message", data => {
      const event = JSON.parse(data); messages.push(event);
      if (event.type === "session.start") { config = event.session; socket.send(JSON.stringify({ type: "session.started", session: { id: "test" } })); }
      if (event.type === "session.input_audio.append") socket.send(JSON.stringify({ type: "session.output_audio.delta", delta: event.audio }));
      if (event.type === "session.close") { closed = true; socket.send(JSON.stringify({ type: "session.closed", usage: {} })); }
    });
  });
  const server = createVoiceServer({ env: { OPENAI_API_KEY: "fixture" }, connect: () => new WebSocket(`ws://127.0.0.1:${provider.address().port}`) });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => { upstream?.terminate(); server.close(); provider.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const { token } = await (await fetch(base + "/api/voice/health")).json();
  const client = new WebSocket(base.replace("http", "ws") + "/api/voice/live?token=" + token);
  await once(client, "message");
  assert.equal(config.model, "gpt-live-1"); assert.equal(config.delegation.type, "client");
  client.send(JSON.stringify({ type: "session.instructions.append", content: "not permitted" }));
  client.send(JSON.stringify({ type: "session.input_audio.append", audio: "AAAAAA==" }));
  const [audio] = await once(client, "message"); assert.equal(JSON.parse(audio).delta, "AAAAAA==");
  assert.ok(!messages.some(e => e.type === "session.instructions.append"));
  client.send(JSON.stringify({ type: "bridge.interrupt" }));
  client.send(JSON.stringify({ type: "session.input_audio.append", audio: "AAAAAA==" }));
  await once(client, "message");
  assert.equal(messages.filter(e => e.type === "session.instructions.append").length, 1);
  assert.match(messages.find(e => e.type === "session.instructions.append").content, /Stop speaking/);
  assert.equal(messages.find(e => e.type === "session.instructions.append").delegation_id, null);
  const ended = once(client, "close"); client.send(JSON.stringify({ type: "session.close" })); await ended;
  assert.equal(closed, true);
});
