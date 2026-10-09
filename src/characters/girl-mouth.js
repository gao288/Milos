import { FOLLOW_MOUTH_DEFAULTS } from './follow-mouth.js';

// Girl's outer lip envelope follows the shared inner mouth contour. Keeping the
// thickness outside the aperture preserves closure and asymmetric articulation.
export function girlLipEnvelope(mouth) {
  return {
    lipUpperLeftY: mouth.upperLeftY - 7,
    lipUpperCenterY: mouth.upperCenterY - 4,
    lipUpperRightY: mouth.upperRightY - 7,
    lipLowerRightY: mouth.lowerRightY + 7,
    lipLowerCenterY: mouth.lowerCenterY + 9,
    lipLowerLeftY: mouth.lowerLeftY + 7,
  };
}
export const GIRL_LIP_DEFAULTS = Object.freeze(girlLipEnvelope(FOLLOW_MOUTH_DEFAULTS));
