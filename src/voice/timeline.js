// Provider-independent cues use the Web Audio playback clock (seconds).
export class CueQueue {
  constructor() { this.clear(); }
  clear() { this.epoch = (this.epoch ?? 0) + 1; this.queue = []; this.lastApplied = -Infinity; }
  add(cue, epoch = this.epoch) {
    if (epoch !== this.epoch || !Number.isFinite(cue.at) || !Number.isFinite(cue.until) || cue.until < cue.at) return false;
    this.queue.push(cue); this.queue.sort((a, b) => a.at - b.at);
    if (this.queue.length > 200) this.queue.shift();
    return true;
  }
  take(now) {
    let current = null;
    while (this.queue.length && this.queue[0].at <= now) {
      const cue = this.queue.shift();
      if (cue.until >= now && cue.at >= this.lastApplied) current = cue;
    }
    if (current) this.lastApplied = current.at;
    return current;
  }
}

export function transcriptFragment(event) {
  if (!["session.output_transcript.delta", "session.input_transcript.delta"].includes(event?.type) ||
      typeof event.delta !== "string" || !Number.isFinite(event.start_ms) ||
      !Number.isFinite(event.end_ms) || event.start_ms < 0 || event.end_ms < event.start_ms) return null;
  return { role: event.type.includes("output") ? "assistant" : "user", text: event.delta,
    startMs: event.start_ms, endMs: event.end_ms };
}

// Absolute playback slots also provide an exact PCM-sample -> animation clock map.
export class PlayoutMap {
  constructor(delay = 0.8, rate = 16000) { this.delay = delay; this.rate = rate; this.clear(); }
  clear() { this.slots = []; this.samples = 0; this.next = 0; }
  append(length, now) {
    const at = Math.max(this.next, now + this.delay);
    const slot = { sample: this.samples, length, at, end: at + length / this.rate };
    this.samples += length; this.next = slot.end; this.slots.push(slot);
    // Keep recent history for overlapping inference windows without unbounded growth.
    while (this.slots.length > 1 && this.slots[0].end < now - 5) this.slots.shift();
    return slot;
  }
  timeForSample(sample) {
    const slot = this.slots.find(v => sample >= v.sample && sample < v.sample + v.length);
    return slot ? slot.at + (sample - slot.sample) / this.rate : null;
  }
}

export function pcmDecode(base64) {
  const binary = atob(base64);
  if (!binary.length || binary.length % 2) throw Error("Invalid PCM16 packet");
  const out = new Float32Array(binary.length / 2);
  for (let i = 0; i < out.length; i++) {
    const n = binary.charCodeAt(i * 2) | binary.charCodeAt(i * 2 + 1) << 8;
    out[i] = (n >= 32768 ? n - 65536 : n) / 32768;
  }
  return out;
}

export function pcmEncode(samples) {
  const buffer = new ArrayBuffer(samples.length * 2), view = new DataView(buffer);
  samples.forEach((v, i) => view.setInt16(i * 2, Math.round(Math.max(-1, Math.min(1, v)) * (v < 0 ? 32768 : 32767)), true));
  let binary = "";
  for (const b of new Uint8Array(buffer)) binary += String.fromCharCode(b);
  return btoa(binary);
}
