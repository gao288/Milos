import { PerformanceTimeline } from "./framework/performance.js";
import { LocalAudioModelProvider, prepareAudio } from "./providers/audio-model.js";

const watched = ["jawOpen", "mouthClose", "mouthPucker", "mouthFunnel", "mouthStretchLeft", "mouthSmileLeft"];

/** Owns media playback; the runtime samples the media clock including pause/seek. */
export class AudioLab {
  constructor(runtime, hooks) {
    this.runtime = runtime; this.hooks = hooks;
    this.provider = new LocalAudioModelProvider();
    this.generation = 0; this.upperFaceWeight = 0; this.timeline = null;
    document.querySelector("#follow-info").insertAdjacentHTML("afterend", `
      <section class="panel audio-lab" id="audio-lab">
        <div class="panel-head"><div><div class="eyebrow">AUDIO → FACE</div><h2>让声音直接驱动表情</h2></div><span class="tag" id="model-health">连接模型…</span></div>
        <p>加载一段中英文语音，生成连续嘴部动作。播放、暂停和拖动进度时，角色跟随同一条音频时间线。</p>
        <div class="model-samples"><button class="btn" id="model-sample-en">试试英文</button><button class="btn" id="model-sample-zh">试试中文</button><span class="helper">本地合成测试语音</span></div>
        <label class="model-file">选择音频 <input id="model-audio-file" type="file" accept="audio/*"></label>
        <div class="actions"><button id="model-analyze" class="btn primary" disabled>生成面部动画</button><button id="model-stop" class="btn">停止</button><button id="model-download" class="btn" disabled>导出曲线</button></div>
        <audio id="model-audio" controls preload="metadata" aria-label="模型音频播放"></audio>
        <p id="model-status" role="status">正在检查本地模型服务。</p>
        <p class="helper">最长 60 秒；音频仅发往本机推理服务。先生成再播放，不是实时麦克风推理。</p>
        <div class="model-meter-grid">${watched.map((name) => `<div><span>${name}</span><meter id="model-${name}" min="0" max="1" value="0"></meter><output id="model-${name}-value">0.00</output></div>`).join("")}</div>
        <div class="control"><label for="model-upper-face">模型表情参与度 <output id="model-upper-face-value">0%</output></label><input id="model-upper-face" type="range" min="0" max="1" step="0.05" value="0"></div>
        <p class="helper">默认由声音控制嘴部发音，JEV／右侧预设控制情绪。调高参与度可叠加模型预测的眉眼与脸颊动作；Follow 的嘴角始终跟随嘴部通道。</p>
        <p id="model-character-note" class="helper"></p>
        <details><summary>导入其他模型的曲线</summary><p class="helper">选择 arkit-52-v1 JSON；先加载对应音频，曲线时间以音频起点为零。</p><input id="model-json-file" type="file" accept="application/json,.json" aria-label="面部曲线 JSON"></details>
      </section>`);
    this.root = document.querySelector("#audio-lab");
    this.$ = (selector) => this.root.querySelector(selector);
    this.audio = this.$("#model-audio");
    this.$("#model-audio-file").onchange = (e) => {
      if (e.target.files[0]) this.selectFile(e.target.files[0]);
    };
    this.$("#model-analyze").onclick = () => this.analyze();
    this.$("#model-stop").onclick = () => { hooks.stopAll(); this.message("已停止，可重新播放。"); };
    this.$("#model-download").onclick = () => this.download();
    this.$("#model-json-file").onchange = async (e) => {
      const file = e.target.files[0]; if (!file) return;
      try {
        if (!this.file) throw Error("请先选择对应音频");
        if (file.size > 20 * 1024 * 1024) throw Error("曲线 JSON 超过 20 MB");
        const clip = JSON.parse(await file.text());
        this.loadClip(clip);
        this.message("曲线已导入，点击播放。");
      } catch (error) { this.message(error.message, true); }
    };
    for (const language of ["en", "zh"]) {
      this.$(`#model-sample-${language}`).onclick = () => this.sample(language);
    }
    this.$("#model-upper-face").oninput = (event) => {
      this.upperFaceWeight = Number(event.target.value);
      this.$("#model-upper-face-value").textContent = `${Math.round(this.upperFaceWeight * 100)}%`;
      if (this.runtime.performanceSource?.timeline === this.timeline)
        this.runtime.performanceSource.upperFaceWeight = this.upperFaceWeight;
    };
    this.audio.onplay = () => {
      if (!this.timeline) return;
      hooks.stopLegacy();
      this.allowSeek = true;
      this.attach();
      hooks.setBehavior("speaking"); hooks.setSource("model");
    };
    this.audio.onpause = () => {
      if (this.runtime.performanceSource?.timeline === this.timeline) {
        hooks.setBehavior("idle"); hooks.setSource("model-paused");
      }
    };
    this.audio.onseeked = () => { if (this.timeline && this.allowSeek) this.attach(); };
    this.audio.onended = () => {
      this.runtime.clearPerformance(); hooks.setBehavior("idle"); hooks.setSource("idle");
    };
    this.refreshHealth();
  }
  message(text, error = false) {
    this.$("#model-status").textContent = text;
    this.$("#model-status").classList.toggle("error", error);
  }
  async refreshHealth() {
    const provider = this.provider;
    try {
      const health = await provider.health();
      if (provider !== this.provider) return;
      this.$("#model-health").textContent = health.loaded
        ? `${provider.label ?? "Audio model"} · ${health.device?.startsWith("CUDA") ? "GPU" : health.device ?? "ready"}` : "模型未就绪";
      this.message(health.loaded ? "本地模型已就绪。选择音频或试用中英文示例。" : health.error ?? "请运行 npm run model:setup 和 npm run model:serve", !health.loaded);
    } catch {
      if (provider !== this.provider) return;
      this.$("#model-health").textContent = "模型离线";
      this.message("请启动 npm run model:serve；已有曲线仍可导入播放。", true);
    }
  }
  setProvider(provider) {
    if (typeof provider?.infer !== "function" || typeof provider?.health !== "function")
      throw Error("Audio provider needs infer(wav, signal) and health()");
    this.hooks.stopAll();
    this.provider = provider;
    this.refreshHealth();
  }
  replaceAudio(blob) {
    const old = this.audioUrl;
    this.audioUrl = URL.createObjectURL(blob);
    this.audio.src = this.audioUrl;
    this.audio.load();
    if (old) URL.revokeObjectURL(old);
  }
  selectFile(file) {
    this.hooks.stopAll();
    this.file = file; this.clip = null; this.timeline = null;
    this.replaceAudio(file);
    this.$("#model-analyze").disabled = false;
    this.$("#model-download").disabled = true;
    this.message(`${file.name ?? "音频"} · 点击生成面部动画。`);
  }
  async sample(language) {
    this.hooks.stopAll();
    const generation = ++this.generation;
    this.message("正在加载示例音频…");
    try {
      const response = await fetch(`/samples/${language}.wav`);
      if (!response.ok) throw Error("示例音频加载失败");
      const blob = await response.blob();
      if (generation !== this.generation) return;
      this.selectFile(new File([blob], `${language}.wav`, { type: "audio/wav" }));
      await this.analyze();
    } catch (error) {
      if (generation === this.generation) this.message(error.message, true);
    }
  }
  async analyze() {
    if (!this.file) return;
    this.hooks.stopAll();
    const generation = ++this.generation;
    const abort = this.abort = new AbortController();
    this.$("#model-analyze").disabled = true;
    this.message("正在本地生成面部曲线…首次推理需要稍等。");
    try {
      const wav = await prepareAudio(this.file);
      if (generation !== this.generation) return;
      const clip = await this.provider.infer(wav, abort.signal);
      if (generation !== this.generation) return;
      this.loadClip(clip);
      this.replaceAudio(wav); // Playback exactly the PCM waveform used by inference.
      const timing = Number.isFinite(clip.inferenceMs) ? ` · 推理 ${(clip.inferenceMs / 1000).toFixed(2)} 秒` : "";
      this.message(`已生成 ${clip.frames.length} 帧 · ${(clip.durationMs / 1000).toFixed(1)} 秒音频${timing}。点击播放。`);
      this.$("#model-health").textContent = `${this.provider.label ?? "Audio model"} · ${clip.device?.startsWith("CUDA") ? "GPU" : clip.device ?? "ready"}`;
    } catch (error) {
      if (generation === this.generation && error.name !== "AbortError")
        this.message(error.message, true);
    } finally {
      if (generation === this.generation) this.$("#model-analyze").disabled = false;
    }
  }
  loadClip(clip) {
    if (!Number.isFinite(clip.durationMs) || clip.durationMs <= 0 || clip.durationMs > 60000 || !clip.frames?.length)
      throw Error("曲线需要有效的帧和 0–60 秒时长");
    const timeline = new PerformanceTimeline(clip);
    this.clip = structuredClone(clip); this.timeline = timeline;
    this.allowSeek = true;
    this.$("#model-download").disabled = false;
    if (!this.audio.paused) this.attach();
    return timeline;
  }
  attach() {
    this.runtime.setPerformance(this.timeline, () => this.audio.currentTime * 1000,
      { upperFaceWeight: this.upperFaceWeight });
  }
  stop() {
    ++this.generation;
    this.allowSeek = false;
    this.abort?.abort(); this.abort = null;
    this.audio.pause();
    // Do not seek here: a queued seeked event could reattach after stop.
    this.runtime.clearPerformance();
    this.$("#model-analyze").disabled = !this.file;
  }
  update(frame) {
    const weights = frame.performance?.weights ?? {};
    for (const name of watched) {
      this.$(`#model-${name}`).value = weights[name] ?? 0;
      this.$(`#model-${name}-value`).textContent = (weights[name] ?? 0).toFixed(2);
    }
  }
  setCharacter(id) {
    this.$("#model-character-note").textContent = ["milo", "orb", "follow", "follow-classic", "girl"].includes(id)
      ? "此角色支持连续嘴形。52 通道作为交换协议；当前角色仅映射其中部分面部动作。"
      : "此角色尚未映射连续面部参数，曲线可监视但不会驱动嘴形；请切换到 Milo 或 Sprout。";
  }
  download() {
    if (!this.clip) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(this.clip)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "face-performance.json"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  dispose() { this.stop(); if (this.audioUrl) URL.revokeObjectURL(this.audioUrl); }
}
