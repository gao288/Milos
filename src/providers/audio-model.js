import { PerformanceTimeline } from "../framework/performance.js";

export function encodeWav(samples, sampleRate = 16000) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const text = (offset, value) => [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0, "RIFF"); view.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE"); text(12, "fmt "); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, "data"); view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, i) => view.setInt16(44 + i * 2,
    Math.round(Math.max(-1, Math.min(1, sample)) * (sample < 0 ? 32768 : 32767)), true));
  return new Blob([buffer], { type: "audio/wav" });
}

export async function prepareAudio(file) {
  if (!file || file.size > 25 * 1024 * 1024) throw Error("请选择不超过 25 MB 的音频");
  const context = new AudioContext();
  let decoded;
  try { decoded = await context.decodeAudioData(await file.arrayBuffer()); }
  finally { await context.close(); }
  if (decoded.duration < 0.1 || decoded.duration > 60)
    throw Error("音频时长需为 0.1–60 秒");
  const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000);
  const source = offline.createBufferSource();
  source.buffer = decoded; source.connect(offline.destination); source.start();
  const resampled = await offline.startRendering();
  return encodeWav(resampled.getChannelData(0));
}

export class LocalAudioModelProvider {
  constructor(baseUrl = "/api/model") { this.baseUrl = baseUrl; this.label = "UniTalker"; }
  async health() {
    const response = await fetch(this.baseUrl + "/health", { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw Error("本地模型服务未启动");
    return response.json();
  }
  async infer(wav, signal) {
    const response = await fetch(this.baseUrl + "/infer", {
      method: "POST", headers: { "Content-Type": "audio/wav" }, body: wav, signal,
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw Error(detail.detail ?? `模型服务返回 HTTP ${response.status}`);
    }
    const clip = await response.json();
    if (!clip.frames?.length || !Number.isFinite(clip.durationMs))
      throw Error("模型未返回有效的动画片段");
    new PerformanceTimeline(clip); // Validate before exposing an untrusted provider result.
    return clip;
  }
}
