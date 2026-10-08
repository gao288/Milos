import { VoiceController } from "./voice/controller.js";

export class VoicePanel {
  constructor(avatar) {
    document.querySelector("#follow-info").insertAdjacentHTML("afterend", `
      <section class="panel voice-panel" id="voice-panel">
        <div class="panel-head"><h2>和我聊聊</h2><span class="tag">LIVE VOICE</span></div>
        <p>中文或 English，直接开口。表情跟随正在说的话，嘴形跟随声音。</p>
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
    this.controller = new VoiceController({ avatar,
      onStatus: (text, error = false) => { this.$("voice-status").textContent = text; this.$("voice-status").classList.toggle("error", error); },
      onActive: active => {
        this.$("voice-start").disabled = active; this.$("voice-stop").disabled = !active;
        this.$("voice-interrupt").disabled = !active; this.$("voice-buffer").disabled = active;
      },
      onTranscript: fragment => {
        if (fragment.startMs - times[fragment.role] > 1800) transcripts[fragment.role] = "";
        transcripts[fragment.role] = (transcripts[fragment.role] + fragment.text).slice(-500);
        times[fragment.role] = fragment.endMs;
        this.$(`voice-${fragment.role}`).textContent = transcripts[fragment.role];
      },
      onMetrics: update => {
        Object.assign(this.metrics, update);
        const m = this.metrics;
        this.$("voice-metrics").textContent = `情绪 ${m.emotion ?? "—"} · JEV ${m.inferenceMs ?? "—"} ms · 嘴形 ${m.mouthMs ?? "—"} ms · 情绪应用偏移 ${m.lateMs ?? "—"} ms（估计）`;
      },
    });
    this.$("voice-buffer").oninput = e => { this.$("voice-buffer-value").textContent = e.target.value + " ms"; };
    this.$("voice-start").onclick = () => {
      transcripts.user = transcripts.assistant = ""; times.user = times.assistant = -Infinity;
      return this.controller.start({ bufferMs: Number(this.$("voice-buffer").value) });
    };
    this.$("voice-stop").onclick = () => { this.stop(); this.$("voice-status").textContent = "聊天已结束"; };
    this.$("voice-interrupt").onclick = () => this.controller.interrupt();
    this.refresh();
    window.addEventListener("pagehide", () => this.stop());
  }
  async refresh() {
    try {
      const config = await this.controller.health();
      this.$("voice-config").textContent = `${config.liveModel} · ${config.jevModel} · 本地 Codex P1`;
      this.$("voice-status").textContent = config.openaiConfigured
        ? (config.jevConfigured ? "准备就绪，点击开始聊天" : "语音已配置；JEV key 尚未配置")
        : "等待 GPT-Live API key · JEV " + (config.jevConfigured ? "已配置" : "未配置");
    } catch { this.$("voice-status").textContent = "语音服务未启动 · 运行 npm run voice:serve"; }
  }
  stop() {
    if (!this.controller.active) return;
    this.controller.stop(); this.controller.avatar.dispatch({ type: "behavior", state: "idle" });
    this.controller.avatar.dispatch({ type: "expression", emotion: "neutral", intensity: 0.3 });
    this.$("voice-status").textContent = "聊天已结束";
  }
}
