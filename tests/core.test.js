import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateEvent,
  TextStream,
  textToVisemes,
  estimateVowel,
} from "../src/core.js";
test("rejects malformed external controls", () => {
  for (const e of [
    null,
    { type: "expression", emotion: "invalid" },
    { type: "motion", gazeX: NaN },
    { type: "expression", emotion: "happy", intensity: 2 },
    { type: "viseme", value: "unknown" },
  ])
    assert.throws(() => validateEvent(e));
  assert.equal(
    validateEvent({ type: "expression", emotion: "happy" }).intensity,
    0.8,
  );
});
test("stream preserves split English tokens and final Chinese chunk", () => {
  const s = new TextStream();
  s.push("hel");
  assert.equal(s.queue.length, 0);
  s.push("lo ");
  assert.deepEqual(s.queue, textToVisemes("hello "));
  s.clear();
  s.push("你好");
  s.push("世界", true);
  assert.deepEqual(s.queue, textToVisemes("你好世界"));
  assert.equal(s.buffer, "");
});
test("Chinese ü maps to rounded front vowel", () =>
  assert.ok(textToVisemes("女").some((v) => v.value === "V")));
test("silence rests; synthetic vowel-like spectral peaks classify", () => {
  const spectrum = new Float32Array(2048).fill(-100);
  assert.equal(estimateVowel(spectrum, 48000, 4096, 0).value, "REST");
  spectrum[Math.round((750 * 4096) / 48000)] = -12;
  spectrum[Math.round((1250 * 4096) / 48000)] = -14;
  assert.equal(estimateVowel(spectrum, 48000, 4096, 0.1).value, "A");
});
test("replaceable text provider rejects invalid cues without corrupting queued text", () => {
  const stream = new TextStream(() => [{ value: "invalid", duration: 10 }]);
  stream.push("hello");
  assert.throws(() => stream.push(" ", true), /Provider/);
  assert.equal(stream.buffer, "hello");
  assert.equal(stream.queue.length, 0);
  stream.convert = () => [{ value: "A", duration: 80 }];
  stream.push(" ", true);
  assert.equal(stream.queue[0].value, "A");
});
