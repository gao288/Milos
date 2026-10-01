// Compatibility entrypoint; new integrations can import framework/index.js directly.
import { DEFAULT_CONTRACT } from "./framework/contract.js";
export const EMOTIONS = DEFAULT_CONTRACT.expressions;
export { clamp, validateEvent } from "./framework/contract.js";
export {
  TextStream,
  textToVisemes,
  estimateVowel,
} from "./providers/heuristics.js";
