import { PerformanceTimeline } from './framework/performance.js';
import { MOUTH_CHANNEL_GROUPS, MOUTH_CHANNELS } from './characters/follow-mouth.js';

// Feeds the same model-independent performance protocol used by audio providers.
export class MouthLab {
  constructor(runtime, hooks) {
    this.runtime = runtime; this.hooks = hooks; this.source = null;
    this.weights = Object.fromEntries(MOUTH_CHANNELS.map(name => [name, 0]));
    document.querySelector('#expression-studio').insertAdjacentHTML('afterend', `
      <section class="panel mouth-lab hidden" id="mouth-lab">
        <details><summary>嘴部曲线实验 · 27 个独立通道</summary>
          <p class="helper">分别控制上下唇、左右嘴角和下颌。调节时会停止语音；播放语音后会恢复模型驱动。左右以画面方向为准。</p>
          <div class="actions"><button class="btn" id="mouth-lab-reset">清零并结束测试</button><span class="helper" id="mouth-lab-status">调节滑块开始测试</span></div>
          ${MOUTH_CHANNEL_GROUPS.map(([group, channels]) => `
            <div class="eyebrow">${group}</div><div class="face-grid">${channels.map(([name,label]) => `
              <div class="control"><label for="mouth-${name}">${label}<output id="mouth-${name}-value">0.00</output></label>
                <input id="mouth-${name}" type="range" min="0" max="1" step="0.01" value="0" title="${name}"></div>`).join('')}</div>`).join('')}
        </details>
      </section>`);
    this.root = document.querySelector('#mouth-lab');
    this.status = this.root.querySelector('#mouth-lab-status');
    for (const name of MOUTH_CHANNELS) this.root.querySelector('#mouth-' + name).oninput = event => {
      this.weights[name] = Number(event.target.value);
      this.root.querySelector('#mouth-' + name + '-value').textContent = this.weights[name].toFixed(2);
      hooks.stopAll();
      const timeline = new PerformanceTimeline({frames: [{timeMs: 0, weights: this.weights}], durationMs: 0});
      runtime.setPerformance(timeline, () => 0, { upperFaceWeight: 0 });
      this.source = runtime.performanceSource;
      hooks.setSource('mouth-test'); this.update();
    };
    this.root.querySelector('#mouth-lab-reset').onclick = () => {
      // Resetting an inactive experiment must not interrupt a new audio source.
      if (runtime.performanceSource === this.source && this.source) hooks.stopAll();
      for (const name of MOUTH_CHANNELS) {
        this.weights[name] = 0;
        this.root.querySelector('#mouth-' + name).value = '0';
        this.root.querySelector('#mouth-' + name + '-value').textContent = '0.00';
      }
      this.source = null; this.update();
    };
  }
  setCharacter(id) { this.root.classList.toggle('hidden', !['follow', 'follow-classic', 'girl'].includes(id)); }
  update() {
    const text = this.source && this.runtime.performanceSource === this.source
      ? '正在手动控制嘴部' : '调节滑块开始测试';
    if (this.status.textContent !== text) this.status.textContent = text;
  }
}
