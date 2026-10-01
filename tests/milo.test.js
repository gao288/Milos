import { test } from "node:test";
import assert from "node:assert/strict";
import { solveMiloFrame } from "../src/characters/milo-signals.js";

const frame = (expression, weights, face = {}) => ({
  expression: { state: expression, intensity: 1 },
  mouth: { weights },
  face,
});
test("speaking vowel geometry is independent of the emotional rest mouth", () => {
  const happy = solveMiloFrame(frame("happy", { REST: 0, U: 1 }));
  const sad = solveMiloFrame(frame("sad", { REST: 0, U: 1 }));
  assert.equal(happy.mouthWidth, sad.mouthWidth);
  assert.equal(happy.mouthHeight, sad.mouthHeight);
  assert.equal(happy.speechWeight, 1);
  assert.equal(happy.restWeight, 0);
  const rest = solveMiloFrame(frame("happy", { REST: 1 }));
  assert.equal(rest.restWeight, 1);
  assert.equal(rest.speechWeight, 0);
  assert.ok(Number.isFinite(rest.mouthHeight));
});
test("independent brow and squint controls do not affect the opposite side", () => {
  const v = solveMiloFrame(
    frame(
      "neutral",
      { REST: 1 },
      { browRaiseLeft: 1, squintRight: 1, jawOpen: 0.5 },
    ),
  );
  assert.equal(v.browRaiseLeft, -17);
  assert.equal(Math.abs(v.browRaiseRight), 0);
  assert.equal(v.squintLeft, 1);
  assert.ok(v.squintRight < 0.11);
  assert.equal(v.jawScale, 2);
});
