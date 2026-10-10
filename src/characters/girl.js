import animationUrl from '../assets/girl-expressive.riv?url';
import { GIRL_MOUTH_DEFAULTS, girlMouthOffsets } from './girl-mouth.js';
import { FOLLOW_MOUTH_DEFAULTS } from './follow-mouth.js';
import { FOLLOW_VISEMES, solveFollowFrame } from './follow-signals.js';

// Adapted from marvin.te's CC BY 4.0 Girl Animation (Cursor Tracking).
// The shared mouth solver supplies semantic geometry, scaled by the native rig.
export function solveGirlFrame(frame) {
  const signals = solveFollowFrame(frame);
  return {
    ...signals,
    ...girlMouthOffsets(signals),
    nativeBlink: 1 - 1.56 * frame.motion.eyeOpen,
    gazeX: frame.motion.gazeX * 13,
    gazeY: frame.motion.gazeY * 8,
    mouseX: 1060 + frame.motion.gazeX * 280,
    mouseY: 730 + frame.motion.gazeY * 200,
  };
}
export const girl = {
  id: 'girl', label: 'Girl · 12 expression poses', src: animationUrl,
  artboard: 'Girl', stateMachine: 'Girl State Machine',
  expressions: { neutral: 0, happy: 1, sad: 2, curious: 3, surprised: 4, angry: 5, fear: 6 },
  fallbackExpression: 'neutral', visemes: FOLLOW_VISEMES, fallbackViseme: 'REST',
  solveFrame: solveGirlFrame,
  bindings: {
    ...Object.fromEntries([
      'emotion', 'intensity', 'nativeBlink', 'eyeOpen', 'leftEyeScale', 'rightEyeScale',
      'browRaiseLeft', 'browRaiseRight', 'restWeight', 'speechWeight',
      'mouthLift', 'mouthStretch', 'cheekRaise', 'noseWrinkle', 'gazeX', 'gazeY',
      ...Object.keys(FOLLOW_MOUTH_DEFAULTS), ...Object.keys(GIRL_MOUTH_DEFAULTS),
    ].map(name => [name, { property: name }])),
    mouseX: { property: 'Mouse X' }, mouseY: { property: 'Mouse Y' },
    headTilt: { property: 'headTilt', scale: .13 },
    breath: { property: 'breath', scale: 2 },
  },
};
