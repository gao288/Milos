// Geometry mapping is character-specific. The matching rest poses are also
// authored in Rive: exported files express emotions without running this JS.
import { performanceMouth } from "../framework/performance.js";
export const REST_SHAPES = {
  neutral: [36, 4],
  happy: [54, 19],
  sad: [32, 4],
  curious: [32, 5],
  surprised: [25, 32],
  angry: [43, 8],
};
export const SPEECH_SHAPES = {
  REST: [36, 4],
  A: [41, 36],
  E: [49, 18],
  I: [53, 10],
  O: [27, 32],
  U: [20, 23],
  V: [23, 18],
  M: [35, 2],
};
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export function solveMiloFrame(frame) {
  const f = frame.face ?? {};
  const intensity = frame.expression.intensity;
  const target = REST_SHAPES[frame.expression.state] ?? REST_SHAPES.neutral;
  const resting = REST_SHAPES.neutral.map(
    (v, i) => v + (target[i] - v) * intensity,
  );
  const restWeight = frame.mouth.weights.REST ?? 0;
  const speechWeight = 1 - restWeight;
  let width = 0,
    height = 0;
  for (const [viseme, weight] of Object.entries(frame.mouth.weights)) {
    if (viseme === "REST") continue;
    const shape = SPEECH_SHAPES[viseme] ?? SPEECH_SHAPES.REST;
    width += shape[0] * weight;
    height += shape[1] * weight;
  }
  if (speechWeight > 0.0001) {
    width /= speechWeight;
    height /= speechWeight;
  } else {
    [width, height] = SPEECH_SHAPES.REST;
  }
  height = clamp(height + (f.jawOpen ?? 0) * 30, 2, 55);
  const jawScale = 1 + (f.jawOpen ?? 0) * 2;
  const effectiveHeight =
    resting[1] * jawScale * restWeight + height * speechWeight;
  const signals = {
    mouthWidth: width,
    mouthHeight: height,
    restWeight,
    speechWeight,
    jawScale,
    jawShift: Math.max(0, effectiveHeight - 8) * 0.13,
    chinY: 121 + Math.max(0, effectiveHeight - 8) * 0.18,
    teethVisible: clamp((height - 6) / 9, 0, 1),
    browRaiseLeft: -(f.browRaiseLeft ?? 0) * 17,
    browRaiseRight: -(f.browRaiseRight ?? 0) * 17,
    squintLeft: 1 - (f.squintLeft ?? 0) * 0.9,
    squintRight: 1 - (f.squintRight ?? 0) * 0.9,
    eyeWide: 1 + (f.eyeWide ?? 0) * 0.28,
    mouthLift: -(f.smile ?? 0) * 5 + (f.frown ?? 0) * 4,
    mouthStretch: 1 + (f.smile ?? 0) * 0.2 - (f.frown ?? 0) * 0.12,
    cheekRaise: -(f.cheekRaise ?? 0) * 7,
    noseWrinkle: f.noseWrinkle ?? 0,
  };
  const performance = frame.performance;
  if (performance) {
    const b = performance.weights;
    const m = performanceMouth(b);
    const mix = performance.weight;
    const upper = mix * (performance.upperFaceWeight ?? 0);
    const mixValue = (name, value, amount = mix) => {
      signals[name] += (value - signals[name]) * amount;
    };
    // Speech owns aperture; JEV keeps the emotional pose and manual overlays.
    const aperture = clamp(2 + m.open * 48 + (f.jawOpen ?? 0) * 16, 2, 55);
    mixValue("mouthWidth", 38 * m.width);
    mixValue("mouthHeight", aperture);
    mixValue("restWeight", 0);
    mixValue("speechWeight", 1);
    mixValue("jawShift", Math.max(0, aperture - 8) * 0.13);
    mixValue("chinY", 121 + Math.max(0, aperture - 8) * 0.18);
    mixValue("teethVisible", clamp((aperture - 6) / 9, 0, 1));
    signals.browRaiseLeft -= ((b.browInnerUp ?? 0) + (b.browOuterUpLeft ?? 0)) * 12 * upper;
    signals.browRaiseRight -= ((b.browInnerUp ?? 0) + (b.browOuterUpRight ?? 0)) * 12 * upper;
    signals.squintLeft *= 1 - Math.max(b.eyeBlinkLeft ?? 0, b.eyeSquintLeft ?? 0) * upper;
    signals.squintRight *= 1 - Math.max(b.eyeBlinkRight ?? 0, b.eyeSquintRight ?? 0) * upper;
    signals.eyeWide += ((b.eyeWideLeft ?? 0) + (b.eyeWideRight ?? 0)) * 0.14 * upper;
    signals.cheekRaise -= ((b.cheekSquintLeft ?? 0) + (b.cheekSquintRight ?? 0)) * 3.5 * upper;
    signals.mouthLift -= m.smile * 5 * upper;
  }
  return signals;
}
