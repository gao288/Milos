export function pcmRms(samples) {
  if (!samples.length) return 0;
  let sum = 0, squares = 0;
  for (const v of samples) { sum += v; squares += v * v; }
  return Math.sqrt(Math.max(0, squares / samples.length - (sum / samples.length) ** 2));
}

// A playback-clock envelope, independent of packet boundaries and inference.
// Hysteresis rejects background noise; short pauses retain lip continuity.
export class SpeechEnvelope {
  constructor() { this.clear(); }
  clear() {
    this.points = []; this.open = false; this.level = 0;
    this.attack = 0; this.quiet = 0; this.lastEnd = null;
  }
  append(samples, at, rate = 16000) {
    if (this.lastEnd !== null && at - this.lastEnd > 0.04) {
      this.points.push({ at: Math.min(at, this.lastEnd + 0.18), value: 0 });
      this.open = false; this.level = 0; this.attack = 0; this.quiet = 0;
    }
    const size = Math.round(rate * 0.02);
    for (let i = 0; i < samples.length; i += size) {
      const window = samples.subarray(i, i + size), dt = window.length / rate;
      const rms = pcmRms(window);
      this.attack = rms >= 0.008 ? this.attack + dt : 0;
      if (this.attack >= 0.03) this.open = true;
      this.quiet = rms < 0.004 ? this.quiet + dt : 0;
      if (this.quiet >= 0.10) this.open = false;
      const target = this.open ? 1 : 0;
      this.level += Math.sign(target - this.level) * Math.min(Math.abs(target - this.level), dt / (target ? 0.04 : 0.14));
      this.points.push({ at: at + i / rate, value: this.level });
    }
    this.lastEnd = at + samples.length / rate;
    this.points = this.points.filter(p => p.at > at - 5).sort((a, b) => a.at - b.at);
  }
  sample(now) {
    if (!this.points.length || now < this.points[0].at) return 0;
    let lo = 0, hi = this.points.length - 1;
    while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (this.points[mid].at <= now) lo = mid; else hi = mid - 1; }
    const a = this.points[lo], b = this.points[lo + 1];
    if (b) { const t = Math.min(1, (now - a.at) / Math.max(1e-6, b.at - a.at)); return a.value + (b.value - a.value) * t; }
    return a.value * Math.max(0, 1 - Math.max(0, now - this.lastEnd) / 0.14);
  }
}
