import { FOLLOW_MOUTH_DEFAULTS, LIP_POINTS } from './follow-mouth.js';

// Translate the shared articulation contour into offsets on the original Girl
// lip bones. Zero speech weight preserves the source's authored lip silhouette.
export function girlMouthOffsets(mouth) {
  const amount = mouth.speechWeight ?? 0;
  const offsets = Object.fromEntries(LIP_POINTS.flatMap(point => ['X', 'Y'].map(axis => [
    'girl' + point[0].toUpperCase() + point.slice(1) + axis,
    (mouth[point + axis] - FOLLOW_MOUTH_DEFAULTS[point + axis]) * 1.3 * amount,
  ])));
  // The original right lip arcs have handle controls between center and corner.
  // Move these relative to their parent so a uniform opening is applied once.
  for (const lip of ['Upper', 'Lower']) for (const axis of ['X', 'Y']) {
    offsets['girl' + lip + 'RightHandle' + axis] =
      offsets['girl' + lip + 'Right' + axis] - offsets['girl' + lip + 'Center' + axis];
  }
  return offsets;
}
export const GIRL_MOUTH_DEFAULTS = Object.freeze(girlMouthOffsets(FOLLOW_MOUTH_DEFAULTS));
