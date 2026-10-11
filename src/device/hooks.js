// Semantic events stay independent of display resolution, Rive and hardware.
// These are local demonstrations, not a network listener or task executor.
export const DEVICE_HOOKS = Object.freeze({
  'device.idle': { label: '待机', detail: '放松、轻轻转头', preset: 'rest', gaze: -.25, tilt: -.08 },
  'task.started': { label: '开始任务', detail: '好奇、抬眼思考', preset: 'skeptical', gaze: .35, tilt: -.22 },
  'task.waiting': { label: '等待输入', detail: '关切、侧头等待', preset: 'worried', gaze: -.3, tilt: .24 },
  'task.completed': { label: '任务完成', detail: '开心、点头回应', preset: 'laugh', gesture: 'nod', tilt: -.12 },
  'task.failed': { label: '任务失败', detail: '难过、轻轻摇头', preset: 'heartbroken', gesture: 'shake', tilt: .16 },
  'attention.required': { label: '需要注意', detail: '惊恐、转头提醒', preset: 'terrified', gaze: .5, tilt: -.18 },
  'voice.listening': { label: '开始聆听', detail: '微笑、专注倾听', preset: 'warm', behavior: 'listening', tilt: .18 },
  'voice.speaking': { label: '模拟说话', detail: '微笑、嘴形演示（无音频）', preset: 'warm', behavior: 'speaking', speech: true, gesture: 'nod' },
});

export class HookDemo {
  constructor({ start, preset, dispatch, mouth, clock = () => performance.now() }) {
    Object.assign(this, { start, preset, dispatch, mouth, clock });
  }
  trigger(name) {
    if (!Object.hasOwn(DEVICE_HOOKS, name)) throw Error('Unknown device hook');
    const hook = DEVICE_HOOKS[name];
    this.start();
    this.preset(hook.preset);
    this.active = { name, hook, started: this.clock(), step: -1 };
    this.dispatch({ type: 'behavior', state: hook.behavior ?? 'idle' });
    // Slow, held poses remain readable even when the screen samples at 1 Hz.
    this.dispatch({ type: 'motion', gazeX: hook.gaze ?? 0, gazeY: name === 'task.started' ? -.35 : 0,
      headTilt: hook.tilt ?? 0, durationMs: 3500 });
    return name;
  }
  update(now) {
    const active = this.active;
    if (!active) return;
    const elapsed = now - active.started;
    if (elapsed >= 4200) {
      this.mouth('REST');
      this.dispatch({ type: 'behavior', state: 'idle' });
      this.active = null;
      return;
    }
    const step = Math.floor(elapsed / 650);
    if (step === active.step) return;
    active.step = step;
    if (active.hook.speech) this.mouth(['A', 'O', 'E', 'M', 'U', 'REST', 'A'][step], .8);
    if (active.hook.gesture && (step === 1 || step === 3))
      this.dispatch({ type: 'gesture', name: active.hook.gesture });
  }
  cancel() {
    if (this.active) {
      this.mouth('REST');
      this.dispatch({ type: 'behavior', state: 'idle' });
      this.dispatch({ type: 'motion', gazeX: 0, gazeY: 0, headTilt: 0, durationMs: 0 });
    }
    this.active = null;
  }
}
