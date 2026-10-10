let corePromise;
// Pixi caches textures by URL. A candidate and the active model may overlap
// during a transactional swap; disposing either must not destroy shared art.
const textureUsers = new WeakMap();
function retainTextures(model) {
  for (const texture of model.textures) textureUsers.set(texture, (textureUsers.get(texture) ?? 0) + 1);
}
function releaseModel(model) {
  const textures = [...model.textures];
  model.destroy({ children: true });
  for (const texture of textures) {
    const count = (textureUsers.get(texture) ?? 1) - 1;
    if (count) textureUsers.set(texture, count);
    else { textureUsers.delete(texture); texture.destroy(true); }
  }
}
function loadCore() {
  if (window.Live2DCubismCore) return Promise.resolve();
  if (!corePromise) corePromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timer = setTimeout(() => finish(Error('Live2D Core loading timed out')), 20000);
    const finish = error => {
      clearTimeout(timer); script.onload = script.onerror = null;
      if (error) { script.remove(); corePromise = null; reject(error); } else resolve();
    };
    script.src = '/live2d/live2dcubismcore.min.js';
    script.onload = () => finish(window.Live2DCubismCore ? null : Error('Invalid Live2D Core'));
    script.onerror = () => finish(Error('Live2D assets missing. Run npm run live2d:setup.'));
    document.head.append(script);
  });
  return corePromise;
}

/** Same mount/render/dispose contract as Rive; speech and JEV remain engine-independent. */
export class Live2DAdapter {
  constructor(character) { this.character = character; this.values = {}; this.disposed = false; }

  async mount(host) {
    const loading = this.load(host);
    const timeout = new Promise((_, reject) => {
      this.rejectLoad = reject;
      this.timer = setTimeout(() => reject(Error('Live2D model loading timed out')), 30000);
    });
    try { await Promise.race([loading, timeout]); }
    catch (error) { this.dispose(); throw error; }
    finally { clearTimeout(this.timer); this.rejectLoad = null; }
  }

  async load(host) {
    await loadCore();
    const [{ Application }, { Live2DModel }] = await Promise.all([
      import('pixi.js'), import('pixi-live2d-display/cubism4'),
    ]);
    if (this.disposed) return;
    this.abort = new AbortController();
    const response = await fetch(this.character.src, { signal: this.abort.signal });
    if (!response.ok) throw Error('Mao assets missing. Run npm run live2d:setup.');
    const settings = await response.json();
    // Framework owns blinking, gaze and idle gestures. Native sample motions
    // include magic effects and speech, which must not randomly override them.
    settings.FileReferences.Motions = {};
    settings.FileReferences.Expressions = [];
    settings.url = new URL(this.character.src, location.href).href;
    const model = await Live2DModel.from(settings, { autoUpdate: false, autoInteract: false });
    retainTextures(model);
    if (this.disposed) { releaseModel(model); return; }
    this.model = model;
    this.app = new Application({ width: 1, height: 1, backgroundAlpha: 0,
      antialias: true, autoStart: false, resolution: Math.min(devicePixelRatio || 1, 2), autoDensity: true });
    this.canvas = this.app.view;
    this.canvas.style.visibility = 'hidden';
    this.canvas.dataset.renderer = 'live2d';
    host.append(this.canvas);
    this.app.stage.addChild(model);
    const internal = model.internalModel;
    internal.eyeBlink = undefined;
    internal.updateFocus = () => {};
    // Apply controls before physics so hair and clothing react to current pose.
    internal.updateNaturalMovements = () => this.applyParameters();
    const core = internal.coreModel;
    this.ranges = new Map(core._parameterIds.map((id, i) => [id, {
      min: core.getParameterMinimumValue(i), max: core.getParameterMaximumValue(i),
    }]));
    const resize = () => {
      const w = Math.max(host.clientWidth, 1), h = Math.max(host.clientHeight, 1);
      this.app.renderer.resize(w, h);
      // Portrait crop keeps the expression readable in the existing chat stage.
      const scale = Math.min(w * .95 / (internal.originalWidth * .62), h * .92 / (internal.originalHeight * .32));
      model.scale.set(scale);
      model.position.set((w - internal.originalWidth * scale) / 2, h * .06 - internal.originalHeight * scale * .07);
    };
    this.resize = new ResizeObserver(resize); this.resize.observe(host); resize();
  }

  applyParameters() {
    const core = this.model.internalModel.coreModel;
    for (const [id, value] of Object.entries(this.values)) {
      const range = this.ranges.get(id);
      if (range) core.setParameterValueById(id, Math.max(range.min, Math.min(range.max, value)));
    }
  }

  render(frame) {
    if (!this.app || this.disposed) return;
    const now = performance.now(), dt = Math.min(now - (this.last ?? now - 16), 50);
    this.last = now;
    const target = this.character.solveFrame(frame);
    for (const [id, value] of Object.entries(target)) {
      // Fast speech/blinks, softer expression transitions.
      const fast = /^Param[AIUEO]$|Open$|Angle[XYZ]$|EyeBall[XY]$/.test(id);
      const alpha = 1 - Math.exp(-dt / (fast ? 25 : 130));
      this.values[id] = (this.values[id] ?? value) + (value - (this.values[id] ?? value)) * alpha;
    }
    this.model.update(dt);
    this.app.renderer.render(this.app.stage);
    this.canvas.style.visibility = 'visible';
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    clearTimeout(this.timer); this.rejectLoad?.(Error('Live2D load cancelled'));
    this.abort?.abort(); this.resize?.disconnect();
    if (this.model) { this.model.parent?.removeChild(this.model); releaseModel(this.model); }
    this.app?.destroy(true, { children: true });
    this.app = this.model = null;
  }
}
