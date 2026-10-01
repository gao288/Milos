import {
  DEFAULT_CONTRACT,
  validateContract,
  validateEvent,
  clamp,
} from "./contract.js";

/** Engine-independent state, blending, gestures and renderer lifecycle. */
export class AvatarRuntime {
  constructor({
    contract = DEFAULT_CONTRACT,
    clock = () => performance.now(),
    random = Math.random,
  } = {}) {
    this.contract = validateContract(structuredClone(contract));
    this.clock = clock;
    this.random = random;
    this.expression = this.contract.initialExpression;
    this.behavior = this.contract.initialBehavior;
    this.parameters = {
      intensity: 0.8,
      gazeX: 0,
      gazeY: 0,
      headTilt: 0,
      smoothing: 0.35,
    };
    this.options = { autoBlink: true, idleMotion: true };
    this.face = Object.fromEntries(
      (this.contract.faceControls ?? []).map((k) => [k, 0]),
    );
    this.smoothedFace = { ...this.face };
    this.smoothed = { ...this.parameters };
    this.weights = Object.fromEntries(
      this.contract.visemes.map((v) => [
        v,
        v === this.contract.restViseme ? 1 : 0,
      ]),
    );
    this.mouth = {
      value: this.contract.restViseme,
      weight: 1,
      expires: Infinity,
    };
    this.blinkStart = -Infinity;
    this.nodStart = -Infinity;
    this.nextBlink = clock() + 2500;
    this.last = clock();
    this.renderer = null;
    this.generation = 0;
    this.pending = new Set();
    this.disposed = false;
    this.performanceSource = null;
  }

  setPerformance(timeline, readTimeMs, { upperFaceWeight = 0 } = {}) {
    if (this.disposed) throw Error("Avatar runtime is disposed");
    if (typeof timeline?.sample !== "function" || typeof readTimeMs !== "function" ||
      !Number.isFinite(upperFaceWeight) || upperFaceWeight < 0 || upperFaceWeight > 1)
      throw Error("Invalid performance source");
    this.performanceSource = { timeline, readTimeMs, upperFaceWeight };
  }

  clearPerformance() { this.performanceSource = null; }

  dispatch(raw) {
    if (this.disposed) throw Error("Avatar runtime is disposed");
    const e = validateEvent(raw, this.contract);
    if (e.type === "face") Object.assign(this.face, e.values);
    if (e.type === "text")
      throw Error(
        "Text must pass through a text-to-viseme provider before AvatarRuntime",
      );
    if (e.type === "expression") {
      this.expression = e.emotion;
      this.parameters.intensity = e.intensity;
    }
    if (e.type === "behavior") {
      const allowed = this.contract.transitions?.[this.behavior];
      if (e.state !== this.behavior && allowed && !allowed.includes(e.state))
        throw Error(`Transition not allowed: ${this.behavior} → ${e.state}`);
      this.behavior = e.state;
    }
    if (e.type === "motion")
      for (const key of ["gazeX", "gazeY", "headTilt"]) {
        if (e[key] !== undefined) this.parameters[key] = e[key];
      }
    if (e.type === "gesture")
      this[e.name === "blink" ? "blinkStart" : "nodStart"] = this.clock();
    if (e.type === "viseme")
      this.mouth = {
        value: e.value,
        weight: e.weight,
        expires: e.durationMs === null ? Infinity : this.clock() + e.durationMs,
      };
    if (e.type === "stop") {
      this.clearPerformance();
      this.behavior = this.contract.initialBehavior;
      this.mouth = {
        value: this.contract.restViseme,
        weight: 1,
        expires: Infinity,
      };
      for (const v of this.contract.visemes)
        this.weights[v] = v === this.contract.restViseme ? 1 : 0;
    }
    return e;
  }

  // Mount candidate before discarding the active renderer; failed swaps leave it usable.
  async setRenderer(renderer, host) {
    if (this.disposed) throw Error("Avatar runtime is disposed");
    if (renderer === this.renderer || this.pending.has(renderer))
      throw Error("Create a new renderer instance for each mount");
    for (const method of ["mount", "render", "dispose"])
      if (typeof renderer?.[method] !== "function")
        throw Error(`Renderer missing ${method}()`);
    const generation = ++this.generation;
    this.pending.add(renderer);
    try {
      await renderer.mount(host, this.contract);
      if (this.disposed || generation !== this.generation) {
        renderer.dispose();
        return false;
      }
      renderer.render(this.getFrame());
      const previous = this.renderer;
      this.renderer = renderer;
      previous?.dispose();
      return true;
    } catch (error) {
      renderer.dispose();
      throw error;
    } finally {
      this.pending.delete(renderer);
    }
  }

  update(now = this.clock()) {
    if (this.disposed) return;
    const dt = clamp((now - this.last) / 1000, 0, 0.05);
    this.last = now;
    const alpha =
      1 - Math.exp((-dt / clamp(this.parameters.smoothing, 0.01, 5)) * 4);
    for (const k of Object.keys(this.face))
      this.smoothedFace[k] += (this.face[k] - this.smoothedFace[k]) * alpha;
    for (const k of ["intensity", "gazeX", "gazeY", "headTilt"])
      this.smoothed[k] += (this.parameters[k] - this.smoothed[k]) * alpha;
    if (now >= this.mouth.expires)
      this.mouth = {
        value: this.contract.restViseme,
        weight: 1,
        expires: Infinity,
      };
    for (const v of this.contract.visemes) {
      const target =
        this.mouth.value === this.contract.restViseme
          ? v === this.contract.restViseme
            ? 1
            : 0
          : v === this.mouth.value
            ? this.mouth.weight
            : v === this.contract.restViseme
              ? 1 - this.mouth.weight
              : 0;
      this.weights[v] += (target - this.weights[v]) * (1 - Math.exp(-dt * 25));
    }
    if (this.options.autoBlink && now > this.nextBlink) {
      this.blinkStart = now;
      this.nextBlink = now + 2400 + this.random() * 3200;
    }
    const frame = this.getFrame(now);
    this.renderer?.render(frame);
    return frame;
  }

  getFrame(now = this.clock()) {
    const source = this.performanceSource;
    const performance = source?.timeline.sample(source.readTimeMs()) ?? null;
    const blinkAge = (now - this.blinkStart) / 180;
    const nodAge = (now - this.nodStart) / 700;
    return {
      version: 1,
      performance: performance ? { ...performance, upperFaceWeight: source.upperFaceWeight } : null,
      face: { ...this.smoothedFace },
      expression: {
        state: this.expression,
        intensity: this.smoothed.intensity,
      },
      behavior: this.behavior,
      mouth: { viseme: this.mouth.value, weights: { ...this.weights } },
      motion: {
        liveliness: this.options.idleMotion ? 1 : 0,
        gazeX: this.smoothed.gazeX,
        gazeY: this.smoothed.gazeY,
        headTilt: clamp(
          this.smoothed.headTilt +
            (nodAge >= 0 && nodAge < 1
              ? Math.sin(nodAge * Math.PI * 2) * 0.5
              : 0) +
            (this.options.idleMotion ? Math.sin(now / 2600) * 0.1 : 0),
          -1,
          1,
        ),
        eyeOpen:
          blinkAge >= 0 && blinkAge < 1
            ? Math.max(0.04, 1 - Math.sin(blinkAge * Math.PI))
            : 1,
        breath: this.options.idleMotion ? Math.sin(now / 1300) : 0,
      },
    };
  }

  dispose() {
    this.clearPerformance();
    this.disposed = true;
    ++this.generation;
    this.renderer?.dispose();
    this.renderer = null;
    for (const renderer of this.pending) renderer.dispose();
    this.pending.clear();
  }
}
