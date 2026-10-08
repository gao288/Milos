import { FOLLOW_MOUTH_DEFAULTS } from "./follow-mouth.js";
import animationUrl from "../assets/follow-classic.riv?url";
import { FOLLOW_VISEMES, solveFollowFrame } from "./follow-signals.js";

// Modified native rig based on alinazari's CC BY 4.0 character.
// Frozen rig from checkpoint 5853e28; editor export: public/follow-classic.rev.
// Its original RML is preserved at that commit, independently of the V2 generator.
export const followClassic = {
  id: "follow-classic",
  label: "Interactive Follow · Classic",
  src: animationUrl,
  artboard: "Follow",
  stateMachine: "State Machine 1",
  pointerGaze: { inset: 0.12 },
  expressions: { neutral: 0, happy: 1, sad: 2, curious: 3, surprised: 4, angry: 5, fear: 4 },
  fallbackExpression: "neutral",
  visemes: FOLLOW_VISEMES,
  fallbackViseme: "REST",
  solveFrame: solveFollowFrame,
  bindings: {
    ...Object.fromEntries([
      "emotion", "intensity", "nativeBlink", "eyeOpen", "leftEyeScale", "rightEyeScale",
      "browRaiseLeft", "browRaiseRight", "restWeight", "speechWeight",
      "mouthLift", "mouthStretch", "cheekRaise", "noseWrinkle",
    ].map(name => [name, { property: name }])),
    // Timeline interpolation provides temporal smoothing. Keep correlated
    // vertex/handle values in the same frame to preserve lip contact.
    ...Object.fromEntries(Object.keys(FOLLOW_MOUTH_DEFAULTS).map(name => [name, { property: name }])) ,
    headTilt: { property: "headTilt", scale: .15 },
    breath: { property: "breath", scale: 2 },
  },
};
