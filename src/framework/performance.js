// Shared semantic channels, independent of model tensor order and character geometry.
export const BLENDSHAPES = Object.freeze([
  "eyeBlinkLeft", "eyeBlinkRight", "eyeSquintLeft", "eyeSquintRight",
  "eyeLookDownLeft", "eyeLookDownRight", "eyeLookInLeft", "eyeLookInRight",
  "eyeWideLeft", "eyeWideRight", "eyeLookOutLeft", "eyeLookOutRight",
  "eyeLookUpLeft", "eyeLookUpRight", "browDownLeft", "browDownRight",
  "browInnerUp", "browOuterUpLeft", "browOuterUpRight", "jawOpen",
  "mouthClose", "jawLeft", "jawRight", "jawForward", "mouthUpperUpLeft",
  "mouthUpperUpRight", "mouthLowerDownLeft", "mouthLowerDownRight",
  "mouthRollUpper", "mouthRollLower", "mouthSmileLeft", "mouthSmileRight",
  "mouthDimpleLeft", "mouthDimpleRight", "mouthStretchLeft", "mouthStretchRight",
  "mouthFrownLeft", "mouthFrownRight", "mouthPressLeft", "mouthPressRight",
  "mouthPucker", "mouthFunnel", "mouthLeft", "mouthRight", "mouthShrugLower",
  "mouthShrugUpper", "noseSneerLeft", "noseSneerRight", "cheekPuff",
  "cheekSquintLeft", "cheekSquintRight", "tongueOut",
]);
export const PERFORMANCE_SCHEMA = "arkit-52-v1";
const MAX_FRAMES = 18000;
const zero = () => Object.fromEntries(BLENDSHAPES.map((name) => [name, 0]));

function validateFrame(frame) {
  if (!frame || !Number.isFinite(frame.timeMs) || frame.timeMs < 0 ||
    !frame.weights || typeof frame.weights !== "object" || Array.isArray(frame.weights))
    throw Error("Invalid performance frame: timeMs and weights are required");
  const weights = zero();
  for (const [name, value] of Object.entries(frame.weights)) {
    if (!BLENDSHAPES.includes(name)) throw Error("Unknown blendshape: " + name);
    if (!Number.isFinite(value) || value < 0 || value > 1)
      throw Error("Blendshape must be within 0–1: " + name);
    weights[name] = value;
  }
  return { timeMs: frame.timeMs, weights };
}

/** Full snapshots, not sparse patches. Omitted channels are neutral (zero).
 * Samples follow an external media clock, never the arrival time of a packet.
 * Appends are atomic. Unfinished streams fade when frames stop arriving.
 */
export class PerformanceTimeline {
  constructor({ schema = PERFORMANCE_SCHEMA, frames = [], durationMs = null } = {}) {
    if (schema !== PERFORMANCE_SCHEMA) throw Error("Unsupported performance schema");
    this.frames = [];
    this.durationMs = null;
    this.append(frames);
    if (durationMs !== null) this.finish(durationMs);
  }
  append(frames) {
    if (this.durationMs !== null) throw Error("Performance stream is already finished");
    if (!Array.isArray(frames) || this.frames.length + frames.length > MAX_FRAMES)
      throw Error("Performance frame limit exceeded");
    const next = frames.map(validateFrame);
    let previous = this.frames.at(-1)?.timeMs ?? -1;
    for (const frame of next) {
      if (frame.timeMs <= previous) throw Error("Frame times must strictly increase");
      previous = frame.timeMs;
    }
    this.frames.push(...next);
  }
  finish(durationMs) {
    if (!Number.isFinite(durationMs) || durationMs < 0 ||
      durationMs < (this.frames.at(-1)?.timeMs ?? 0))
      throw Error("Duration must include every frame");
    this.durationMs = durationMs;
  }
  sample(timeMs) {
    if (!Number.isFinite(timeMs) || !this.frames.length || timeMs < this.frames[0].timeMs)
      return null;
    const last = this.frames.at(-1);
    const end = this.durationMs ?? last.timeMs + 100;
    const weight = Math.max(0, Math.min(1, 1 - (timeMs - end) / 120));
    if (weight === 0) return null;
    let lo = 0, hi = this.frames.length - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (this.frames[mid].timeMs <= timeMs) lo = mid;
      else hi = mid - 1;
    }
    const a = this.frames[lo], b = this.frames[lo + 1] ?? a;
    const t = a === b ? 0 : Math.min(1, (timeMs - a.timeMs) / (b.timeMs - a.timeMs));
    return {
      schema: PERFORMANCE_SCHEMA, timeMs, weight,
      weights: Object.fromEntries(BLENDSHAPES.map((name) => [
        name, a.weights[name] + (b.weights[name] - a.weights[name]) * t,
      ])),
    };
  }
}

/** A common continuous aperture description; no vowel classification. */
export function performanceMouth(weights) {
  const average = (left, right) => ((weights[left] ?? 0) + (weights[right] ?? 0)) / 2;
  const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
  const round = Math.max(weights.mouthPucker ?? 0, weights.mouthFunnel ?? 0);
  return {
    open: clamp((weights.jawOpen ?? 0) * (1 - (weights.mouthClose ?? 0)) +
      average("mouthLowerDownLeft", "mouthLowerDownRight") * 0.18),
    width: clamp(1 - round * 0.6 + average("mouthStretchLeft", "mouthStretchRight") * 0.45 +
      average("mouthSmileLeft", "mouthSmileRight") * 0.2, 0.35, 1.65),
    smile: average("mouthSmileLeft", "mouthSmileRight") - average("mouthFrownLeft", "mouthFrownRight"),
  };
}
