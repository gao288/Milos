import { CueQueue, PlayoutMap, transcriptFragment, pcmDecode, pcmEncode } from "./timeline.js";
import { PerformanceTimeline } from "../framework/performance.js";
import { encodeWav, LocalAudioModelProvider } from "../providers/audio-model.js";
import { SpeechEnvelope, pcmRms } from "./speech-envelope.js";
import { emotionWindow, rememberSpeech } from "./emotion-context.js";
import { ElevenOutput } from "./eleven-output.js";
import { SpeechEngineOutput } from "./speech-engine.js";

/** Voice, expression and mouth providers meet only at normalized avatar events.
 * Transcript timestamps are approximate session times. PCM packets have no
 * timestamps: session/audio alignment is an estimate, never a word-sync claim.
 */
export class VoiceController {
  constructor({ avatar, onStatus, onTranscript, onMetrics, onActive, onEmotionResult = () => {} }) {
    Object.assign(this, { avatar, onStatus, onTranscript, onMetrics, onActive, onEmotionResult });
    this.generation = 0; this.sources = new Set(); this.active = false;
    this.model = new LocalAudioModelProvider();
  }
  async health() {
    const response = await fetch("/api/voice/health", { signal: AbortSignal.timeout(3000) });
    if (!response.ok) throw Error("请启动语音服务：npm run voice:serve");
    this.config = await response.json(); return this.config;
  }
  async start({ bufferMs = 800, output = "live" } = {}) {
    this.stop();
    this.avatar.stop();
    const generation = ++this.generation;
    this.active = true; this.onActive(true); this.onStatus("正在连接语音…");
    try {
      if (!["live", "eleven", "engine"].includes(output)) throw Error("未知配音模式");
      this.output = output;
      const config = await this.health();
      if (generation !== this.generation) return;
      if (!config.openaiConfigured) throw Error("请在本地 .env 配置 OPENAI_API_KEY 后重启语音服务");
      if (output === "eleven" && !config.elevenConfigured) throw Error("请在本地 .env 配置 ELEVENLABS_API_KEY 和 ELEVENLABS_VOICE_ID 后重启语音服务");
      if (output === "engine" && !config.speechEngineConfigured) throw Error("Speech Engine 尚未就绪：需要配置 ElevenLabs 回调服务");
      if (!navigator.mediaDevices?.getUserMedia) throw Error("麦克风需要 HTTPS 或 localhost");
      const context = new AudioContext({ sampleRate: 16000 }); this.context = context;
      await context.resume();
      if (generation !== this.generation) return;
      if (context.sampleRate !== 16000) throw Error("当前浏览器不支持 16 kHz 音频会话");
      const media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      if (generation !== this.generation) { media.getTracks().forEach(t => t.stop()); return; }
      this.media = media;
      media.getAudioTracks()[0].onended = () => { if (this.active) { this.stop(); this.onStatus("麦克风已断开"); } };
      await context.audioWorklet.addModule("/voice-capture.js");
      if (generation !== this.generation) return;
      this.capture = new AudioWorkletNode(context, "realpet-voice-capture");
      this.mic = context.createMediaStreamSource(media);
      const mute = context.createGain(); mute.gain.value = 0;
      this.mic.connect(this.capture); this.capture.connect(mute); mute.connect(context.destination);
      this.map = new PlayoutMap(bufferMs / 1000);
      this.envelope = new SpeechEnvelope();
      this.captions = []; this.history = []; this.fragments = []; this.emotions = new CueQueue();
      this.mouth = new PerformanceTimeline(); this.resetMouth();
      this.eleven = output === "eleven" ? new ElevenOutput(this) : null;
      this.engine = output === "engine" ? new SpeechEngineOutput(this) : null;
      this.sessionOrigin = context.currentTime; this.started = false; this.inputLevel = 0; this.speechMs = 0;
      this.emotionBusy = false; this.lastEmotionEnd = -1; this.lastEmotionAt = -Infinity;
      this.installMouth();
      const connection = this.engine ? await this.engine.connect() : new WebSocket(`${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/api/voice/live?token=${encodeURIComponent(config.token)}`);
      if (generation !== this.generation) { connection?.close(); return; }
      this.socket = connection;
      const socket = this.socket;
      this.startupTimer = setTimeout(() => { if (generation === this.generation && !this.started) { this.stop(); this.onStatus("语音连接超时，请检查回调服务", true); } }, 25000);
      socket.onmessage = message => {
        if (generation !== this.generation) return;
        try { const event = JSON.parse(message.data); if (this.engine) this.engine.receive(event); else this.receive(event); }
        catch (error) { this.stop(); this.onStatus(error.message, true); }
      };
      socket.onerror = () => { if (generation === this.generation) { this.stop(); this.onStatus("语音连接失败，请检查本地服务", true); } };
      socket.onclose = event => { if (generation === this.generation) {
        const failed = this.engine && event.code !== 1000;
        this.stop(); this.onStatus(failed ? `Speech Engine 异常断开（${event.code}），请检查回调与 LLM 服务` : "语音会话已结束", !!failed);
      } };
      this.capture.port.onmessage = ({ data }) => {
        if (!this.started || socket.readyState !== WebSocket.OPEN) return;
        const rms = Math.sqrt(data.reduce((sum, v) => sum + v * v, 0) / data.length);
        this.inputLevel = rms;
        this.speechMs = rms > 0.035 ? this.speechMs + 20 : 0;
        // Live streams silent output packets while listening. Only interrupt
        // audible speech, not every phrase the user says during a quiet turn.
        if (!this.engine && this.speechMs === 180 && (this.map.slots.some(slot => slot.audible && slot.end > context.currentTime) ||
          this.eleven?.busy || this.eleven?.queue.length || this.eleven?.pending))
          this.interrupt(true);
        if (rms > 0.035) this.quietUntil = context.currentTime + 0.25;
        if (socket.bufferedAmount < 128000) socket.send(JSON.stringify(this.engine ? { user_audio_chunk: pcmEncode(data) } : { type: "session.input_audio.append", audio: pcmEncode(data) }));
        else { this.stop(); this.onStatus("语音上传拥塞，已断开以避免累积延迟", true); }
      };
      this.timer = setInterval(() => this.tick(), 30);
      this.model.health().then(h => { if (generation === this.generation) { this.modelReady = h.loaded; if (!h.loaded) this.onStatus("嘴形模型尚未就绪；语音仍可使用"); } }).catch(() => {
        if (generation === this.generation) { this.modelReady = false; this.onStatus("嘴形服务未连接；语音仍可使用"); }
      });
    } catch (error) {
      if (generation === this.generation) { this.stop(); this.onStatus(error.message, true); }
    }
  }
  // The runtime sees a bounded rolling timeline; no renderer-specific state.
  installMouth() {
    this.avatar.setTimeline({ sample: ms => {
      const gain = this.envelope.sample(ms / 1000);
      if (gain <= 0.001) return null;
      const frame = this.mouth.sample(ms);
      return frame ? { ...frame, weight: frame.weight * gain } : null;
    } }, () => this.context.currentTime * 1000);
  }
  resetMouth() { this.pcm = new Float32Array(0); this.pcmStart = 0; this.inferredThrough = 0; this.lastMouthFrame = -1; this.mouthBusy = false; }
  playPCM(samples, { infer = true, maxQueueSeconds = 5 } = {}) {
    const now = this.context.currentTime;
    const slot = this.map.append(samples.length, now);
    slot.audible = pcmRms(samples) >= 0.008;
    this.envelope.append(samples, slot.at);
    if (slot.end - now > maxQueueSeconds) throw Error("播放队列过长，请结束并重连");
    const buffer = this.context.createBuffer(1, samples.length, 16000); buffer.copyToChannel(samples, 0);
    const source = this.context.createBufferSource(); source.buffer = buffer; source.connect(this.context.destination);
    this.sources.add(source); source.onended = () => { this.sources.delete(source); source.disconnect(); };
    source.start(slot.at);
    if (infer) {
      const merged = new Float32Array(this.pcm.length + samples.length); merged.set(this.pcm); merged.set(samples, this.pcm.length);
      const trim = Math.max(0, merged.length - 32000); this.pcm = merged.slice(trim); this.pcmStart += trim;
      this.inferMouth();
    }
    return slot;
  }
  receive(event) {
    const now = this.context.currentTime;
    if (event.type === "session.started") {
      clearTimeout(this.startupTimer);
      this.started = true; this.sessionOrigin = now; this.onStatus("已连接 · 可以开始说话");
      this.avatar.dispatch({ type: "behavior", state: "listening" }); return;
    }
    if (event.type === "session.output_audio.delta") {
      if (this.output === "eleven") return;
      if (now < (this.dropAudioUntil ?? 0) || (this.bargeActive && now < (this.quietUntil ?? 0))) return;
      this.bargeActive = false;
      this.playPCM(pcmDecode(event.delta)); return;
    }
    const fragment = transcriptFragment(event);
    if (fragment) {
      rememberSpeech(this.history, fragment);
      if (fragment.role === "user") this.onTranscript(fragment);
      else if (fragment.endMs >= (this.discardBeforeMs ?? 0)) {
        if (this.eleven) {
          if (now >= (this.dropAudioUntil ?? 0) && !(this.bargeActive && now < (this.quietUntil ?? 0))) {
            this.bargeActive = false; this.eleven.push(fragment);
          }
          return;
        }
        this.fragments.push(fragment); this.captions.push(fragment);
        this.fragments.sort((a, b) => a.startMs - b.startMs);
        this.captions.sort((a, b) => a.startMs - b.startMs);
        if (this.fragments.length > 200) this.fragments.shift();
        if (this.captions.length > 200) this.captions.shift();
      }
      return;
    }
    if (event.type === "bridge.delegation") this.onStatus("本地 Codex 任务委派将在 P1 接入");
    if (["bridge.error", "error"].includes(event.type)) {
      const message = event.message || event.error?.message || "语音服务错误";
      this.stop(); this.onStatus(message, true);
    }
    if (event.type === "session.closed") { this.stop(); this.onStatus("会话已结束，用量已确认"); }
  }
  tick() {
    if (!this.active || !this.context) return;
    const now = this.context.currentTime;
    this.eleven?.tick(now);
    try { this.engine?.tick(); } catch (error) { this.stop(); this.onStatus(error.message, true); return; }
    const transcriptClock = (now - this.sessionOrigin - this.map.delay) * 1000;
    // Do not reveal a caption until corresponding audio has at least started.
    // Allow late transcript fragments to update already spoken captions.
    while (this.captions[0]?.startMs <= transcriptClock && this.map.slots.some(slot =>
      slot.audible && slot.at <= now && slot.end >= this.sessionOrigin + this.captions[0].startMs / 1000 + this.map.delay))
      this.onTranscript(this.captions.shift());
    const speaking = this.envelope.sample(now) > 0.08;
    const cue = speaking ? this.emotions.take(now) : null;
    if (cue && cue.confidence >= 0.35) {
      this.avatar.dispatch({ type: "expression", emotion: cue.emotion, intensity: cue.intensity });
      this.emotionUntil = Math.max(cue.until, now + 1.2);
      if (cue.motion && cue.motionConfidence >= 0.5) {
        this.avatar.dispatch({ type: "motion", headTilt: cue.motion.headTilt, durationMs: 1800 });
      }
      if (cue.gesture && cue.gesture !== "none" && cue.gestureConfidence >= 0.65 && now >= (this.nextGestureAt ?? 0)) {
        this.avatar.dispatch({ type: "gesture", name: cue.gesture });
        this.nextGestureAt = now + 6;
      }
      this.onMetrics({ emotion: cue.emotion, intensity: cue.intensity, confidence: cue.confidence,
        inferenceMs: cue.inferenceMs, lateMs: Math.max(0, Math.round((now - cue.at) * 1000)) });
    }
    if (this.emotionUntil && now > this.emotionUntil) {
      this.avatar.dispatch({ type: "expression", emotion: "neutral", intensity: 0.3 });
      this.onMetrics({ emotion: "neutral", intensity: 0.3, confidence: null });
      this.emotionUntil = 0;
    }
    const state = speaking ? "speaking" : "listening";
    if (this.started && state !== this.behavior) { this.avatar.dispatch({ type: "behavior", state }); this.behavior = state; }
    if (!this.eleven) this.inferEmotion();
    // Send a final short tail even when packets stop before the next 500 ms block.
    this.inferMouth(true);
    if (this.mouth.frames.length > 300) this.mouth.frames = this.mouth.frames.filter(f => f.timeMs > now * 1000 - 1000);
  }
  async inferEmotion() {
    const now = this.context.currentTime, latest = this.fragments.at(-1);
    if (!this.config.jevConfigured || !latest || this.emotionBusy || now < (this.retryEmotionAt ?? 0) ||
        now - this.lastEmotionAt < 0.5 || latest.endMs <= this.lastEmotionEnd) return;
    const window = emotionWindow(this.fragments, this.history, this.lastEmotionEnd);
    if (!window) return;
    this.lastEmotionAt = now; this.lastEmotionEnd = latest.endMs;
    if (!window.currentText.trim()) return;
    const epoch = this.emotions.epoch, generation = this.generation;
    this.emotionBusy = true;
    const abort = new AbortController(); this.emotionAbort = abort;
    try {
      const response = await fetch("/api/voice/emotion", { method: "POST",
        headers: { "Content-Type": "application/json", "X-Realpet-Token": this.config.token },
        body: JSON.stringify({ text: window.text, currentText: window.currentText, context: window.context }),
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(2500)]),
      });
      const data = await response.json(); if (!response.ok) throw Error(data.error || `JEV HTTP ${response.status}`);
      if (generation !== this.generation || epoch !== this.emotions.epoch) return;
      this.onEmotionResult({ result: data, text: window.text, currentText: window.currentText, receivedAt: Date.now() });
      this.emotions.add({ ...data, at: this.sessionOrigin + window.startMs / 1000 + this.map.delay,
        until: this.sessionOrigin + latest.endMs / 1000 + this.map.delay + 0.6 }, epoch);
      this.onMetrics({ prediction: data.emotion, predictionConfidence: data.confidence, inferenceMs: data.inferenceMs });
    } catch (error) {
      if (generation === this.generation && !abort.signal.aborted) { this.retryEmotionAt = this.context.currentTime + 2; this.onStatus(`情绪暂时沿用上一状态：${error.message}`); }
    } finally { if (generation === this.generation && this.emotionAbort === abort) this.emotionBusy = false; }
  }
  async inferMouth(tail = false) {
    if (!this.modelReady || this.mouthBusy || !this.pcm.length) return;
    const end = this.pcmStart + this.pcm.length;
    const pending = end - this.inferredThrough;
    if (pending < 8000 && !(tail && pending >= 1600 && this.context.currentTime > this.map.next - this.map.delay + 0.12)) return;
    const generation = this.generation, epoch = this.emotions.epoch;
    const from = Math.max(this.pcmStart, this.inferredThrough - 6400);
    const samples = this.pcm.slice(from - this.pcmStart);
    const startNew = this.inferredThrough;
    this.inferredThrough = end; this.mouthBusy = true;
    if (pcmRms(samples) < 0.003) { this.mouthBusy = false; return; }
    const abort = new AbortController(); this.mouthAbort = abort;
    try {
      const clip = await this.model.infer(encodeWav(samples), AbortSignal.any([abort.signal, AbortSignal.timeout(1800)]));
      if (generation !== this.generation || epoch !== this.emotions.epoch) return;
      const now = this.context.currentTime * 1000;
      const frames = clip.frames.flatMap(f => {
        const sample = from + f.timeMs * 16;
        if (sample < startNew) return [];
        const time = this.map.timeForSample(sample);
        if (time === null || time * 1000 <= this.lastMouthFrame || time * 1000 < now - 80) return [];
        this.lastMouthFrame = time * 1000; return [{ timeMs: time * 1000, weights: f.weights }];
      });
      this.mouth.append(frames);
      this.onMetrics({ mouthMs: clip.inferenceMs });
    } catch (error) {
      if (generation === this.generation && !abort.signal.aborted) this.onStatus(`嘴形暂不可用：${error.message}`);
    } finally { if (generation === this.generation && this.mouthAbort === abort) this.mouthBusy = false; }
  }
  interrupt(fromMic = false) {
    if (!this.map) return;
    this.eleven?.clear();
    this.engine?.interrupt(fromMic);
    // Mic barge-in is handled by Live's full-duplex audio understanding. A
    // persistent "wait for next input" instruction would suppress its reply.
    if (!this.engine && !fromMic && this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type: "bridge.interrupt" }));
    this.dropAudioUntil = this.context.currentTime + 0.3;
    this.bargeActive = fromMic;
    for (const s of this.sources) s.stop(); this.sources.clear(); this.map.clear();
    this.envelope.clear();
    this.emotions.clear(); this.emotionAbort?.abort(); this.mouthAbort?.abort();
    this.emotionBusy = false; this.captions = []; this.fragments = [];
    this.discardBeforeMs = Math.max(0, (this.context.currentTime - this.sessionOrigin) * 1000);
    this.mouth = new PerformanceTimeline(); this.resetMouth(); this.installMouth();
    this.avatar.dispatch({ type: "expression", emotion: "neutral", intensity: 0.3 });
    this.avatar.dispatch({ type: "motion", headTilt: 0, durationMs: 200 });
  }
  stop() {
    const wasActive = this.active;
    this.eleven?.clear(); this.eleven = null;
    ++this.generation; this.active = false; this.started = false; clearInterval(this.timer);
    clearTimeout(this.startupTimer);
    this.emotionAbort?.abort(); this.mouthAbort?.abort();
    const socket = this.socket; this.socket = null;
    if (socket) {
      socket.onmessage = socket.onerror = socket.onclose = null;
      if (this.engine) socket.close();
      else if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "session.close" }));
        const timeout = setTimeout(() => socket.close(), 16000);
        socket.onmessage = ({ data }) => { try { if (JSON.parse(data).type === "session.closed") { clearTimeout(timeout); socket.close(); } } catch {} };
        socket.onclose = () => clearTimeout(timeout);
      } else socket.close();
    }
    this.engine = null;
    this.media?.getTracks().forEach(t => t.stop()); this.media = null;
    this.capture?.disconnect(); this.mic?.disconnect(); this.capture = this.mic = null;
    for (const s of this.sources) { try { s.stop(); } catch {} } this.sources.clear();
    this.context?.close().catch(() => {}); this.context = null;
    this.avatar.clearTimeline();
    if (wasActive) this.avatar.dispatch({ type: "expression", emotion: "neutral", intensity: 0.3 });
    if (wasActive) this.avatar.dispatch({ type: "motion", headTilt: 0, durationMs: 200 });
    this.nextGestureAt = 0;
    this.onActive(false);
    this.modelReady = false; this.discardBeforeMs = 0; this.quietUntil = 0; this.dropAudioUntil = 0; this.bargeActive = false; this.emotionUntil = 0; this.retryEmotionAt = 0; this.behavior = null;
  }
}
