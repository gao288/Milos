import animationUrl from "../assets/follow-expressive.riv?url";
import { FOLLOW_VISEMES, solveFollowFrame } from "./follow-signals.js";

// Modified native rig based on alinazari's CC BY 4.0 character.
// Editable source: rive-follow/; the framework remains renderer-independent.
export const interactiveFollow = {
  id: "follow",
  label: "Interactive Follow · Expressive",
  src: animationUrl,
  artboard: "Follow",
  stateMachine: "State Machine 1",
  pointerGaze: { inset: 0.12 },
  expressions: { neutral: 0, happy: 1, sad: 2, curious: 3, surprised: 4, angry: 5 },
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
    mouthWidth: { property: "mouthWidth", smoothingMs: 65 },
    mouthHeight: { property: "mouthHeight", smoothingMs: 65 },
    teethVisible: { property: "teethVisible", smoothingMs: 65 },
    headTilt: { property: "headTilt", scale: .15 },
    breath: { property: "breath", scale: 2 },
  },
};
