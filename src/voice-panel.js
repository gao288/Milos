import { VoiceController } from "./voice/controller.js";
import { DEFAULT_CONTRACT } from "./framework/contract.js";

const emotionLabels = { neutral: "中性", happy: "开心", sad: "悲伤 / 关切", curious: "好奇", surprised: "惊讶", angry: "生气", fear: "恐惧 / 不安" };
const describeEmotion = value => value ? `${emotionLabels[value] ?? value} · ${value}` : "等待判定";
const number = value => Number.isFinite(value) ? value.toFixed(2) : "—";

export class VoicePanel {
  constructor(avatar) {
    document.querySelector("#follow-info").insertAdjacentHTML("afterend", `
      <section class="panel voice-panel" id="voice-panel">
        <div class="panel-head"><h2>和我聊聊</h2><span class="tag">LIVE VOICE</span></div>
        <p>中文或 English，直接开口。表情跟随正在说的话，嘴形跟随声音。</p>
        <div class="voice-output-switch" role="group" aria-label="回复配音方式">
          <button class="btn" id="voice-output-live" aria-pressed="true">GPT-Live 原声</button>
          <button class="btn" id="voice-output-eleven" aria-pressed="false">ElevenLabs · 实验</button>
          <button class="btn" id="voice-output-engine" aria-pressed="false">Speech Engine · 实验</button>
        </div>
        <p class="helper" id="voice-output-note">当前使用 GPT-Live 男声。结束聊天后可切换配音方式。</p>
        <div class="actions">
          <button class="btn primary" id="voice-start">开始语音聊天</button>
          <button class="btn" id="voice-stop" disabled>结束聊天</button>
          <button class="btn" id="voice-interrupt" disabled>打断播放</button>
        </div>
        <div id="voice-status" role="status">正在检查语音服务…</div>
        <div class="voice-captions" aria-label="语音字幕">
          <p><span>你</span><output id="voice-user">等待开口…</output></p>
          <p><span>伙伴</span><output id="voice-assistant">准备好听你说话。</output></p>
        </div>
        <div class="voice-settings"><label for="voice-buffer">同步缓冲 <output id="voice-buffer-value">800 ms</output></label>
          <input id="voice-buffer" type="range" min="200" max="1500" step="100" value="800">
          <p class="helper">缓冲越长，表情越容易赶上声音，但回复会稍晚开始。连接前可调整。</p>
        </div>
        <section class="jev-output" aria-labelledby="jev-output-title">
          <div class="row"><h3 id="jev-output-title">JEV 实时输出</h3><span id="jev-updated" class="helper">尚未收到结果</span></div>
          <div class="jev-choices" aria-label="当前配置的七种表情">${DEFAULT_CONTRACT.expressions.map(name => `<span data-jev-emotion="${name}">${emotionLabels[name]} <small>${name}</small></span>`).join("")}</div>
          <dl class="jev-values">
            <div><dt>模型判定</dt><dd id="jev-prediction">等待判定</dd></div>
            <div><dt>语音最近应用</dt><dd id="jev-applied">—</dd></div>
            <div><dt>强度 / 置信度</dt><dd id="jev-strength">— / —</dd></div>
            <div><dt>头部倾斜 / 置信度</dt><dd id="jev-tilt">— / —</dd></div>
            <div><dt>动作 / 置信度</dt><dd id="jev-gesture">— / —</dd></div>
            <div><dt>推理用时</dt><dd id="jev-latency">—</dd></div>
          </dl>
          <p class="helper">高亮的是模型建议；实际应用还需等待播放时机，并经过置信度过滤和动作冷却。</p>
          <p class="jev-fragment"><span>本次新增文本</span><output id="jev-fragment">等待回复文本…</output></p>
          <details><summary>完整输出 JSON 与判断文本</summary>
            <p class="helper">JSON 中 answers 为 JEV 的原始答案，其余为转换后的动画参数。强度与置信度为 0–1；本地将倾斜限制在 ±0.3。</p>
            <pre id="jev-json" aria-label="最新 JEV 输出 JSON">尚未收到结果</pre>
            <p class="helper">用于判断的最近话语</p><pre id="jev-input">—</pre>
          </details>
        </section>
        <details><summary>连接与同步状态</summary>
          <p class="helper" id="voice-config">GPT-Live · JEV · UniTalker</p>
          <p class="helper" id="voice-metrics">情绪每 500 ms 检查新增文本；无新文本时保持。</p>
          <p class="helper">字幕按近似片段时间对齐；同步效果受网络和播放缓冲影响。本地 Codex 委派为 P1。</p>
        </details>
      </section>`);
    this.$ = id => document.getElementById(id);
    const transcripts = { user: "", assistant: "" };
    const times = { user: -Infinity, assistant: -Infinity };
    this.metrics = {};
    this.output = "live";
    this.buffers = { live: 800, eleven: 800, engine: 300 };
    this.controller = new VoiceController({ avatar,
      onStatus: (text, error = false) => { this.$("voice-status").textContent = text; this.$("voice-status").classList.toggle("error", error); },
      onActive: active => {
        this.$("voice-start").disabled = active; this.$("voice-stop").disabled = !active;
        this.$("voice-interrupt").disabled = !active; this.$("voice-buffer").disabled = active;
        this.$("voice-output-live").disabled = active; this.$("voice-output-eleven").disabled = active;
        this.$("voice-output-engine").disabled = active;
        this.$("jev-applied").textContent = active ? "等待表情随播放应用" : "语音已停止";
      },
      onEmotionResult: ({ result, text, currentText, receivedAt }) => {
        for (const id of ["jev-json", "jev-input", "jev-fragment"]) this.$(id).dataset.i18nIgnore = "";
        this.$("jev-updated").textContent = new Date(receivedAt).toLocaleTimeString();
        this.$("jev-prediction").textContent = describeEmotion(result.emotion);
        this.$("jev-strength").textContent = `${number(result.intensity)} / ${number(result.confidence)}`;
        this.$("jev-tilt").textContent = `${number(result.motion?.headTilt)} / ${number(result.motionConfidence)}`;
        const gesture = { none: "无动作", nod: "点头", shake: "摇头" }[result.gesture] ?? "—";
        this.$("jev-gesture").textContent = `${gesture} / ${number(result.gestureConfidence)}`;
        this.$("jev-latency").textContent = Number.isFinite(result.inferenceMs) ? `${result.inferenceMs} ms` : "—";
        this.$("jev-fragment").textContent = currentText;
        this.$("jev-input").textContent = text;
        this.$("jev-json").textContent = JSON.stringify(result, null, 2);
        document.querySelectorAll("[data-jev-emotion]").forEach(el => el.classList.toggle("active", el.dataset.jevEmotion === result.emotion));
      },
      onTranscript: fragment => {
        if (fragment.startMs - times[fragment.role] > 1800) transcripts[fragment.role] = "";
        transcripts[fragment.role] = (transcripts[fragment.role] + fragment.text).slice(-500);
        times[fragment.role] = fragment.endMs;
        this.$(`voice-${fragment.role}`).dataset.i18nIgnore = "";
        this.$(`voice-${fragment.role}`).textContent = transcripts[fragment.role];
      },
      onMetrics: update => {
        Object.assign(this.metrics, update);
        const m = this.metrics;
        if (update.emotion !== undefined) this.$("jev-applied").textContent = `${describeEmotion(update.emotion)} · ${number(update.intensity)}`;
        this.$("voice-metrics").textContent = `JEV 判定 ${m.prediction ?? "—"}（置信度 ${m.predictionConfidence?.toFixed(2) ?? "—"}） · 当前情绪 ${m.emotion ?? "—"} · 强度 ${m.intensity?.toFixed(2) ?? "—"} · JEV ${m.inferenceMs ?? "—"} ms · 嘴形 ${m.mouthMs ?? "—"} ms · 情绪应用偏移 ${m.lateMs ?? "—"} ms（估计）`;
      },
    });
    this.$("voice-buffer").oninput = e => {
      this.buffers[this.output] = Number(e.target.value);
      this.$("voice-buffer-value").textContent = e.target.value + " ms";
    };
    for (const mode of ["live", "eleven", "engine"]) this.$(`voice-output-${mode}`).onclick = () => {
      this.output = mode;
      this.$("voice-buffer").value = this.buffers[mode];
      this.$("voice-buffer-value").textContent = this.buffers[mode] + " ms";
      for (const name of ["live", "eleven", "engine"]) this.$(`voice-output-${name}`).setAttribute("aria-pressed", String(name === mode));
      this.updateOutputNote();
    };
    this.$("voice-start").onclick = () => {
      for (const id of ["jev-json", "jev-input", "jev-fragment"]) delete this.$(id).dataset.i18nIgnore;
      transcripts.user = transcripts.assistant = ""; times.user = times.assistant = -Infinity;
      this.metrics = {};
      this.$("voice-metrics").textContent = "情绪每 500 ms 检查新增文本；无新文本时保持。";
      for (const id of ["jev-prediction", "jev-applied", "jev-strength", "jev-tilt", "jev-gesture", "jev-latency", "jev-input"]) this.$(id).textContent = "—";
      this.$("jev-updated").textContent = "等待本次会话的结果";
      this.$("jev-json").textContent = "尚未收到结果";
      this.$("jev-fragment").textContent = "等待回复文本…";
      document.querySelectorAll("[data-jev-emotion]").forEach(el => el.classList.remove("active"));
      return this.controller.start({ bufferMs: Number(this.$("voice-buffer").value), output: this.output });
    };
    this.$("voice-stop").onclick = () => { this.stop(); this.$("voice-status").textContent = "聊天已结束"; };
    this.$("voice-interrupt").onclick = () => this.controller.interrupt();
    this.refresh();
    window.addEventListener("pagehide", () => this.stop());
  }
  async refresh() {
    try {
      const config = await this.controller.health();
      this.config = config; this.updateOutputNote();
      this.$("voice-config").textContent = `${config.liveModel} · ${config.jevModel} · 本地 Codex P1`;
      this.$("voice-status").textContent = config.openaiConfigured
        ? (config.jevConfigured ? "准备就绪，点击开始聊天" : "语音已配置；JEV key 尚未配置")
        : "等待 GPT-Live API key · JEV " + (config.jevConfigured ? "已配置" : "未配置");
    } catch { this.$("voice-status").textContent = "语音服务未启动 · 运行 npm run voice:serve"; }
  }
  updateOutputNote() {
    if (this.output === "engine") {
      this.$("voice-output-note").textContent = "Speech Engine 负责听、说和语音打断；独立文本 LLM 流式回复，JEV 与嘴形跟随音频。" +
        (this.config?.speechEngineConfigured ? ` 当前 LLM：${this.config.speechEngineModel}，Chris 男声。` : " 回调服务尚未配置。") +
        "「打断播放」静音本轮回复；再次开口继续聊天。";
      return;
    }
    this.$("voice-output-note").textContent = this.output === "live"
      ? "当前使用 GPT-Live 男声。结束聊天后可切换配音方式。"
      : "实验配音：GPT-Live 仍负责听懂与回复，ElevenLabs 按短句重新配音；会增加等待时间，两项服务均会计费。" +
        (this.config?.elevenConfigured ? ` 当前模型：${this.config.elevenModel}。` : " 尚未配置 ElevenLabs：需要在本地 .env 填入 ELEVENLABS_API_KEY 和 ELEVENLABS_VOICE_ID，然后重启语音服务。");
  }
  stop() {
    if (!this.controller.active) return;
    this.controller.stop(); this.controller.avatar.dispatch({ type: "behavior", state: "idle" });
    this.controller.avatar.dispatch({ type: "expression", emotion: "neutral", intensity: 0.3 });
    this.$("voice-status").textContent = "聊天已结束";
  }
}
