import { test } from "node:test";
import assert from "node:assert/strict";
import { AvatarRuntime, DEFAULT_CONTRACT } from "../src/framework/index.js";

function fixture(contract = DEFAULT_CONTRACT) {
  let now = 0;
  const runtime = new AvatarRuntime({
    contract,
    clock: () => now,
    random: () => 0.5,
  });
  return {
    runtime,
    step: (ms) => {
      now += ms;
      return runtime.update();
    },
  };
}
function renderer() {
  return {
    frames: [],
    disposed: 0,
    async mount() {},
    render(frame) {
      this.frames.push(frame);
    },
    dispose() {
      this.disposed++;
    },
  };
}

test("facial controls blend independently, survive renderer swaps, and validate names", async () => {
  const { runtime, step } = fixture();
  runtime.dispatch({ type: "expression", emotion: "happy" });
  runtime.dispatch({ type: "viseme", value: "U" });
  runtime.dispatch({
    type: "face",
    values: { browRaiseLeft: 0.8, squintRight: 0.4 },
  });
  let frame = step(100);
  assert.ok(frame.face.browRaiseLeft > 0 && frame.face.browRaiseLeft < 0.8);
  assert.equal(frame.face.browRaiseRight, 0);
  assert.equal(frame.mouth.viseme, "U");
  assert.equal(frame.expression.state, "happy");
  await runtime.setRenderer(renderer(), {});
  assert.ok(runtime.getFrame().face.squintRight > 0);
  assert.throws(() =>
    runtime.dispatch({ type: "face", values: { jawOpen: 2 } }),
  );
  assert.throws(() =>
    runtime.dispatch({ type: "face", values: { unknown: 1 } }),
  );
  assert.throws(() => runtime.dispatch({ type: "face", values: null }));
});

test("normalized mouth blends independently of expressions and timed cues expire", () => {
  const { runtime, step } = fixture();
  runtime.dispatch({
    type: "viseme",
    value: "A",
    weight: 0.75,
    durationMs: 200,
  });
  runtime.dispatch({ type: "expression", emotion: "angry", intensity: 1 });
  let frame = step(100);
  assert.equal(frame.expression.state, "angry");
  assert.equal(frame.mouth.viseme, "A");
  assert.ok(frame.mouth.weights.A > 0);
  assert.ok(
    Math.abs(Object.values(frame.mouth.weights).reduce((a, b) => a + b) - 1) <
      1e-9,
  );
  frame = step(100);
  assert.equal(frame.mouth.viseme, "REST");
  runtime.dispatch({ type: "stop" });
  assert.equal(runtime.getFrame().expression.state, "angry");
  assert.equal(runtime.getFrame().mouth.weights.REST, 1);
});

test("custom contracts and transition guards do not need Rive or a browser", () => {
  const { runtime } = fixture({
    expressions: ["calm", "excited"],
    behaviors: ["rest", "talk"],
    visemes: ["sil", "aa"],
    initialExpression: "calm",
    initialBehavior: "rest",
    restViseme: "sil",
    transitions: { rest: ["talk"], talk: [] },
  });
  runtime.dispatch({ type: "expression", emotion: "excited" });
  runtime.dispatch({ type: "viseme", value: "aa" });
  runtime.dispatch({ type: "behavior", state: "talk" });
  assert.throws(
    () => runtime.dispatch({ type: "behavior", state: "rest" }),
    /Transition not allowed/,
  );
  assert.throws(() => runtime.dispatch({ type: "viseme", value: "A" }));
  runtime.dispatch({ type: "stop" });
  assert.equal(runtime.getFrame().behavior, "rest");
  assert.equal(runtime.getFrame().mouth.weights.sil, 1);
});

test("renderer replacement preserves control state, disposes old resources, and rolls back failure", async () => {
  const { runtime, step } = fixture();
  const first = renderer(),
    second = renderer();
  await runtime.setRenderer(first, {});
  runtime.dispatch({ type: "expression", emotion: "happy" });
  runtime.dispatch({ type: "viseme", value: "U" });
  step(50);
  await runtime.setRenderer(second, {});
  assert.equal(first.disposed, 1);
  assert.equal(second.frames.at(-1).expression.state, "happy");
  assert.equal(second.frames.at(-1).mouth.viseme, "U");
  const broken = {
    ...renderer(),
    async mount() {
      throw Error("missing asset");
    },
  };
  await assert.rejects(runtime.setRenderer(broken, {}), /missing asset/);
  assert.equal(runtime.renderer, second);
  assert.equal(broken.disposed, 1);
  step(50);
  assert.equal(second.frames.length, 2);
});

test("late asynchronous mount cannot overwrite newer renderer or revive disposed runtime", async () => {
  const { runtime } = fixture();
  let resolve;
  const slow = {
    ...renderer(),
    mount: () =>
      new Promise((r) => {
        resolve = r;
      }),
  };
  const pending = runtime.setRenderer(slow, {});
  const newest = renderer();
  await runtime.setRenderer(newest, {});
  resolve();
  assert.equal(await pending, false);
  assert.equal(runtime.renderer, newest);
  assert.equal(slow.disposed, 1);
  runtime.dispose();
  assert.equal(newest.disposed, 1);
  assert.throws(() => runtime.dispatch({ type: "stop" }), /disposed/);
  await assert.rejects(runtime.setRenderer(renderer(), {}), /disposed/);
});
