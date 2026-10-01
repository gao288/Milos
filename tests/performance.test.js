import { test } from "node:test";
import assert from "node:assert/strict";
import { AvatarRuntime, PerformanceTimeline, performanceMouth } from "../src/framework/index.js";
import { solveMiloFrame } from "../src/characters/milo-signals.js";

const frames = [
  { timeMs: 0, weights: { jawOpen: 0 } },
  { timeMs: 100, weights: { jawOpen: 1, mouthPucker: 0.8 } },
  { timeMs: 200, weights: { jawOpen: 0 } },
];

test("performance interpolates on media time, supports backward seeks, and fades stale streams", () => {
  const timeline = new PerformanceTimeline({ frames });
  assert.equal(timeline.sample(-1), null);
  assert.equal(timeline.sample(50).weights.jawOpen, 0.5);
  assert.equal(timeline.sample(150).weights.mouthPucker, 0.4);
  assert.equal(timeline.sample(50).weights.jawOpen, 0.5);
  assert.equal(timeline.sample(300).weight, 1);
  assert.equal(timeline.sample(360).weight, 0.5);
  assert.equal(timeline.sample(420), null);
  timeline.finish(500);
  assert.equal(timeline.sample(450).weight, 1);
  assert.throws(() => timeline.append([{ timeMs: 600, weights: {} }]));
});

test("invalid packets are rejected atomically; frame snapshots and missing channels stay isolated", () => {
  const source = structuredClone(frames);
  const timeline = new PerformanceTimeline({ frames: source });
  source[1].weights.jawOpen = 0;
  assert.equal(timeline.sample(100).weights.jawOpen, 1);
  const sample = timeline.sample(100); sample.weights.jawOpen = 0;
  assert.equal(timeline.sample(100).weights.jawOpen, 1);
  assert.equal(timeline.sample(100).weights.tongueOut, 0);
  for (const weights of [{ unknown: 1 }, { jawOpen: NaN }, { jawOpen: 1.1 }])
    assert.throws(() => timeline.append([{ timeMs: 300, weights: {} }, { timeMs: 400, weights }]));
  assert.equal(timeline.frames.length, 3);
  assert.throws(() => timeline.append([{ timeMs: 199, weights: {} }]));
  assert.throws(() => timeline.finish(100));
  assert.throws(() => new PerformanceTimeline({ schema: "vendor-format" }));
});

test("model aperture bypasses vowel selection; emotion survives swaps and stop releases the model", async () => {
  let audioTime = 100;
  const runtime = new AvatarRuntime({ clock: () => 0 });
  const timeline = new PerformanceTimeline({ frames, durationMs: 250 });
  runtime.dispatch({ type: "expression", emotion: "happy" });
  runtime.setPerformance(timeline, () => audioTime);
  const open = solveMiloFrame(runtime.getFrame());
  assert.equal(open.speechWeight, 1);
  assert.equal(open.restWeight, 0);
  assert.ok(open.mouthHeight > 40);
  runtime.dispatch({ type: "viseme", value: "M" });
  assert.equal(solveMiloFrame(runtime.getFrame()).mouthHeight, open.mouthHeight);
  const adapter = () => ({ mount() {}, dispose() {}, render(frame) { this.frame = frame; } });
  const a = adapter(), b = adapter();
  await runtime.setRenderer(a, {}); await runtime.setRenderer(b, {});
  assert.equal(b.frame.performance.weights.jawOpen, 1);
  assert.equal(b.frame.expression.state, "happy");
  audioTime = 0;
  assert.ok(solveMiloFrame(runtime.getFrame()).mouthHeight < open.mouthHeight);
  runtime.dispatch({ type: "stop" });
  assert.equal(runtime.getFrame().performance, null);
  assert.equal(runtime.getFrame().expression.state, "happy");
  assert.throws(() => runtime.setPerformance(timeline, () => 0, { upperFaceWeight: 3 }));
});

test("lip closure and rounding are independent continuous controls", () => {
  assert.equal(performanceMouth({ jawOpen: 1, mouthClose: 1 }).open, 0);
  assert.equal(performanceMouth({ jawOpen: 1 }).open, 1);
  assert.ok(performanceMouth({ mouthPucker: 1 }).width < performanceMouth({}).width);
});
