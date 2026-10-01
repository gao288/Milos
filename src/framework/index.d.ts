export interface AvatarContract {
  expressions: readonly string[];
  behaviors: readonly string[];
  visemes: readonly string[];
  faceControls?: readonly string[];
  initialExpression: string;
  initialBehavior: string;
  restViseme: string;
  /** Omit to allow all behavior transitions; [] forbids leaving a state. */
  transitions?: Record<string, string[]>;
}

export type AvatarEvent =
  | { type: "face"; values: Record<string, number> }
  | { type: "expression"; emotion: string; intensity?: number }
  | { type: "behavior"; state: string }
  | { type: "motion"; gazeX?: number; gazeY?: number; headTilt?: number }
  | { type: "gesture"; name: "blink" | "nod" }
  | { type: "viseme"; value: string; weight?: number; durationMs?: number }
  | { type: "stop" };

export type NormalizedAvatarEvent =
  | Exclude<AvatarEvent, { type: "viseme" }>
  | {
      type: "viseme";
      value: string;
      weight: number;
      durationMs: number | null;
    };

export interface AvatarFrame {
  version: 1;
  /** Optional continuous performance. Lip aperture takes precedence over visemes. */
  performance?: SampledPerformance | null;
  expression: { state: string; intensity: number };
  behavior: string;
  face: Record<string, number>;
  /** Weights sum to 1, including REST. No model geometry in this interface. */
  mouth: { viseme: string; weights: Record<string, number> };
  motion: {
    liveliness: number;
    gazeX: number;
    gazeY: number;
    headTilt: number;
    eyeOpen: number;
    breath: number;
  };
}

export interface AvatarRenderer<Host = unknown> {
  /** Prepare resources without exposing an incomplete frame; throw on failure. */
  mount(host: Host, contract: AvatarContract): Promise<void> | void;
  render(frame: AvatarFrame): void;
  /** Idempotent. Release resources and cancel any outstanding mount. */
  dispose(): void;
}

export interface VisemeCue {
  value: string;
  duration: number;
}
export interface InputProviders {
  textToVisemes(text: string): VisemeCue[];
  estimateVowel(
    spectrum: Float32Array,
    sampleRate: number,
    fftSize: number,
    rms: number,
  ): {
    value: string;
    confidence: number;
  };
}

export class AvatarRuntime {
  constructor(options?: {
    contract?: AvatarContract;
    clock?: () => number;
    random?: () => number;
  });
  readonly contract: AvatarContract;
  readonly renderer: AvatarRenderer | null;
  parameters: {
    intensity: number;
    gazeX: number;
    gazeY: number;
    headTilt: number;
    smoothing: number;
  };
  options: { autoBlink: boolean; idleMotion: boolean };
  dispatch(event: AvatarEvent): NormalizedAvatarEvent;
  setPerformance(timeline: PerformanceTimeline, readTimeMs: () => number,
    options?: { upperFaceWeight?: number }): void;
  clearPerformance(): void;
  setRenderer<Host>(
    renderer: AvatarRenderer<Host>,
    host: Host,
  ): Promise<boolean>;
  update(now?: number): AvatarFrame | undefined;
  getFrame(now?: number): AvatarFrame;
  dispose(): void;
}
export const DEFAULT_CONTRACT: AvatarContract;
export function validateContract(contract: AvatarContract): AvatarContract;
export function validateEvent(
  event: unknown,
  contract?: AvatarContract,
): NormalizedAvatarEvent | { type: "text"; chunk: string; final: boolean };
export function clamp(value: number, min?: number, max?: number): number;

export interface PerformanceFrame {
  /** Milliseconds from the start of the associated audio, not wall-clock time. */
  timeMs: number;
  /** ARKit-style lowerCamelCase names, 0–1. Missing channels are zero. */
  weights: Record<string, number>;
}
export interface PerformanceClip {
  schema: "arkit-52-v1";
  frames: PerformanceFrame[];
  durationMs?: number | null;
  fps?: number;
  provider?: string;
}
export interface SampledPerformance extends PerformanceFrame {
  schema: "arkit-52-v1";
  weight: number;
  upperFaceWeight?: number;
}
export class PerformanceTimeline {
  constructor(clip?: Partial<PerformanceClip>);
  readonly frames: PerformanceFrame[];
  readonly durationMs: number | null;
  append(frames: PerformanceFrame[]): void;
  finish(durationMs: number): void;
  sample(timeMs: number): SampledPerformance | null;
}
export const BLENDSHAPES: readonly string[];
export const PERFORMANCE_SCHEMA: "arkit-52-v1";
export function performanceMouth(weights: Record<string, number>): {
  open: number; width: number; smile: number;
};
