const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * t * (t * (t * 6 - 15) + 10); };

/** Occasional poses with a settle/hold/return rhythm, not frame-wise randomness.
 * Additive normalized channels work with any renderer and leave rig data alone.
 */
export class NaturalMotion {
  constructor(random = Math.random, now = 0) {
    this.random = random; this.next = now + 900 + random() * 1400;
    this.pose = null; this.value = { gazeX: 0, gazeY: 0, headTilt: 0 };
  }
  update(now, { enabled = true, behavior = "idle", attention = false } = {}) {
    if (!enabled) { this.pose = null; this.next = now + 1200; this.value = { gazeX: 0, gazeY: 0, headTilt: 0 }; return this.value; }
    if (!this.pose && now >= this.next) {
      const r = this.random, amplitude = behavior === "listening" ? 0.55 : behavior === "speaking" ? 0.4 : 1;
      const side = r() < 0.5 ? -1 : 1;
      this.pose = { start: now, enter: 900 + r() * 500, hold: 700 + r() * 1300, leave: 1400 + r() * 900,
        gazeX: side * (0.12 + r() * 0.24) * amplitude,
        gazeY: (r() - 0.5) * 0.23 * amplitude,
        headTilt: side * (0.12 + r() * 0.18) * amplitude };
    }
    const p = this.pose;
    let gain = 0;
    if (p) {
      const age = now - p.start;
      gain = age < p.enter ? smooth(age / p.enter)
        : age < p.enter + p.hold ? 1 : 1 - smooth((age - p.enter - p.hold) / p.leave);
      if (age >= p.enter + p.hold + p.leave) { this.pose = null; this.next = now + 2200 + this.random() * 3800; }
    }
    for (const k of Object.keys(this.value)) this.value[k] = (p?.[k] ?? 0) * gain * (attention ? 0 : 1);
    return this.value;
  }
}
