import { solveFollowMouth, blendMouth } from "./follow-mouth.js";

// Follow-specific geometry only. Inputs are the renderer-independent AvatarFrame.
export const FOLLOW_VISEMES = {
  REST: [56, 4], A: [57, 47], E: [66, 25], I: [71, 12],
  O: [34, 43], U: [27, 30], V: [31, 24], M: [51, 2],
};
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export function solveFollowFrame(frame) {
  const f = frame.face ?? {};
  const rest = frame.mouth.weights.REST ?? 0;
  let width = 0, height = 0;
  for (const [name, weight] of Object.entries(frame.mouth.weights)) {
    if (name === "REST") continue;
    const shape = FOLLOW_VISEMES[name] ?? FOLLOW_VISEMES.REST;
    width += shape[0] * weight; height += shape[1] * weight;
  }
  if (1 - rest > 0.0001) { width /= 1 - rest; height /= 1 - rest; }
  else { [width, height] = FOLLOW_VISEMES.REST; }
  const jaw = f.jawOpen ?? 0;
  const manualSpeech = clamp(jaw * 4, 0, 1);
  let mouthGeometry = solveFollowMouth({ jawOpen: clamp((height - 4) / 34 + jaw, 0, 1), mouthPucker: clamp((56 - width) / 29, 0, 1), mouthStretchLeft: clamp((width - 56) / 24, 0, 1), mouthStretchRight: clamp((width - 56) / 24, 0, 1) });
  const signals = {
    nativeBlink: 0, // The framework owns auto/manual blinks in the web app.
    restWeight: rest * (1 - manualSpeech), speechWeight: 1 - rest * (1 - manualSpeech),
    browRaiseLeft: -(f.browRaiseLeft ?? 0) * 18,
    browRaiseRight: -(f.browRaiseRight ?? 0) * 18,
    leftEyeScale: (1 - (f.squintLeft ?? 0) * .92) * (1 + (f.eyeWide ?? 0) * .4),
    rightEyeScale: (1 - (f.squintRight ?? 0) * .92) * (1 + (f.eyeWide ?? 0) * .4),
    mouthLift: -(f.smile ?? 0) * 7 + (f.frown ?? 0) * 5,
    mouthStretch: 1 + (f.smile ?? 0) * .22 - (f.frown ?? 0) * .15,
    cheekRaise: -(f.cheekRaise ?? 0) * 9,
    noseWrinkle: f.noseWrinkle ?? 0,
  };
  if (frame.performance) {
    const p = frame.performance, b = p.weights;
    const mix = p.weight, upper = mix * (p.upperFaceWeight ?? 0);
    mouthGeometry = blendMouth(mouthGeometry, solveFollowMouth({
      ...b, jawOpen: clamp((b.jawOpen ?? 0) + jaw * .5, 0, 1),
    }), mix);
    signals.restWeight *= 1 - mix;
    signals.speechWeight = 1 - signals.restWeight;
    signals.browRaiseLeft -= ((b.browInnerUp ?? 0) + (b.browOuterUpLeft ?? 0)) * 14 * upper;
    signals.browRaiseRight -= ((b.browInnerUp ?? 0) + (b.browOuterUpRight ?? 0)) * 14 * upper;
    signals.leftEyeScale *= 1 - Math.max(b.eyeBlinkLeft ?? 0, b.eyeSquintLeft ?? 0) * upper;
    signals.rightEyeScale *= 1 - Math.max(b.eyeBlinkRight ?? 0, b.eyeSquintRight ?? 0) * upper;
    signals.leftEyeScale += (b.eyeWideLeft ?? 0) * .4 * upper;
    signals.rightEyeScale += (b.eyeWideRight ?? 0) * .4 * upper;
    signals.cheekRaise -= ((b.cheekSquintLeft ?? 0) + (b.cheekSquintRight ?? 0)) * 4 * upper;
    // Mouth channels always own articulation; upperFaceWeight only gates brows/eyes/cheeks.
  }
  Object.assign(signals, mouthGeometry);
  return signals;
}
