import { OneBitDisplay } from './device/one-bit.js';
import { DEVICE_HOOKS, HookDemo } from './device/hooks.js';

export class DevicePanel {
  constructor({ runtime, api, stop, preset, mouth }) {
    this.runtime = runtime;
    this.api = api;
    this.hooks = new HookDemo({ start: stop, preset, dispatch: api.dispatch, mouth });
    document.querySelector('#stage').insertAdjacentHTML('beforebegin', `
      <section class="panel device-panel" id="device-panel">
        <div class="panel-head"><div><div class="eyebrow">DEVICE LAB</div><h2>1-bit 墨水屏预览</h2></div>
          <button class="btn" id="onebit-toggle" aria-pressed="false">开启 1-bit</button></div>
        <p>Follow V2 · 同一套 12 个表情，换一种屏幕。</p>
        <div id="device-controls" class="hidden">
          <div class="device-settings">
            <label>像素尺寸<select id="onebit-resolution"><option value="200">200 × 200</option><option value="320" selected>320 × 320</option><option value="480">480 × 480</option></select></label>
            <label>预览刷新率<select id="onebit-fps"><option value="1">1 FPS</option><option value="2">2 FPS</option><option value="4" selected>4 FPS</option><option value="8">8 FPS</option></select></label>
            <label for="onebit-threshold">黑白阈值<input id="onebit-threshold" type="range" min="80" max="220" value="160"></label>
          </div>
          <p class="helper">浏览器模拟：仅黑白像素与刷新频率，不模拟真实墨水屏的残影、全刷或耗电。</p>
          <div class="device-hook-heading"><strong>Hook 动画演示</strong><span class="tag">8 EVENTS</span></div>
          <div class="device-hooks">${Object.entries(DEVICE_HOOKS).map(([name, hook]) => `
            <button class="btn device-hook" data-device-hook="${name}" aria-pressed="false"><strong>${hook.label}</strong><span>${hook.detail}</span></button>`).join('')}</div>
          <p class="helper">演示会停止当前播放；下方 12 个表情也可以直接切换。</p>
          <div class="device-event"><span id="device-hook-status" role="status">选择一个事件，看看角色的反应。</span><code id="device-hook-event" data-i18n-ignore>—</code></div>
          <button class="btn" id="device-hook-stop">停止动作</button>
        </div>
        <p class="helper hidden" id="device-error" role="alert">预览无法加载，请重试。</p>
      </section>`);
    // Keep the character above the event buttons instead of pushing it below
    // an expanded control panel. The original expression grid stays available.
    const controls = document.querySelector('#device-controls');
    controls.classList.add('panel', 'device-controls');
    document.querySelector('#stage').insertAdjacentElement('afterend', controls);
    this.toggle = document.querySelector('#onebit-toggle');
    this.toggle.onclick = () => this.setEnabled(!this.enabled).catch(() => {});
    for (const name of ['resolution', 'fps', 'threshold']) {
      document.querySelector('#onebit-' + name).addEventListener('input', () => {
        this.display?.configure({ [name]: Number(document.querySelector('#onebit-' + name).value) });
      });
    }
    document.querySelectorAll('[data-device-hook]').forEach(button => {
      button.onclick = () => this.trigger(button.dataset.deviceHook);
    });
    document.querySelector('#device-hook-stop').onclick = () => {
      stop(); preset('rest'); this.cancel();
    };
    this.stop = stop;
  }
  async setEnabled(enabled) {
    if (this.busy) return false;
    this.busy = true;
    this.toggle.disabled = true;
    document.querySelector('#device-error').classList.add('hidden');
    try {
      if (enabled && this.api.getState().character !== 'follow') {
        const committed = await this.api.setCharacter('follow');
        if (!committed) return false;
      }
      if (enabled && !this.display) {
        this.savedFollow = document.querySelector('#follow').checked;
        document.querySelector('#follow').checked = false;
        this.display = new OneBitDisplay(document.querySelector('#avatar'), () => this.runtime.renderer?.canvas, { zoom: 1.45 });
        this.display.configure(Object.fromEntries(['resolution', 'fps', 'threshold'].map(name =>
          [name, Number(document.querySelector('#onebit-' + name).value)])));
      } else if (!enabled) {
        if (this.hooks.active) this.stop();
        this.display?.dispose(); this.display = null;
        if (this.enabled) document.querySelector('#follow').checked = this.savedFollow;
      }
      this.enabled = enabled;
      document.querySelector('#stage').classList.toggle('onebit-stage', enabled);
      document.querySelector('#device-controls').classList.toggle('hidden', !enabled);
      this.toggle.setAttribute('aria-pressed', String(enabled));
      this.toggle.textContent = enabled ? '恢复原始预览' : '开启 1-bit';
      this.cancel();
      return true;
    } catch (error) {
      document.querySelector('#device-error').classList.remove('hidden');
      throw error;
    } finally { this.busy = false; this.toggle.disabled = false; }
  }
  characterChanged(id) {
    if (id !== 'follow' && this.enabled) this.setEnabled(false).catch(() => {});
  }
  trigger(name) {
    if (!this.enabled) throw Error('Enable the 1-bit preview first');
    this.hooks.trigger(name);
    document.querySelector('#device-hook-event').textContent = name;
    document.querySelector('#device-hook-status').textContent = DEVICE_HOOKS[name].detail;
    document.querySelectorAll('[data-device-hook]').forEach(button => {
      const selected = button.dataset.deviceHook === name;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }
  cancel() {
    this.hooks.cancel();
    document.querySelectorAll('[data-device-hook]').forEach(button => {
      button.classList.remove('active'); button.setAttribute('aria-pressed', 'false');
    });
    document.querySelector('#device-hook-event').textContent = '—';
    document.querySelector('#device-hook-status').textContent = '选择一个事件，看看角色的反应。';
  }
  update(now) {
    const wasActive = this.hooks.active;
    this.hooks.update(now);
    if (wasActive && !this.hooks.active)
      document.querySelector('#device-hook-status').textContent = '动作完成，保留当前表情。';
  }
  render(now) {
    try { this.display?.update(now); }
    catch {
      this.setEnabled(false).catch(() => {});
      document.querySelector('#device-error').classList.remove('hidden');
    }
  }
  dispose() { this.hooks.cancel(); this.display?.dispose(); }
}
