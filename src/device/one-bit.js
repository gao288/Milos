/** Opaque, packed-display-compatible pixels: no gray or alpha in the output. */
export function toOneBit(rgba, threshold = 160) {
  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3] / 255;
    const luminance = (.2126 * rgba[i] + .7152 * rgba[i + 1] + .0722 * rgba[i + 2]) * a + 255 * (1 - a);
    const value = luminance < threshold ? 0 : 255;
    rgba[i] = rgba[i + 1] = rgba[i + 2] = value;
    rgba[i + 3] = 255;
  }
  return rgba;
}

/** Display sampling only. Rive and audio keep their independent clocks. */
export class OneBitDisplay {
  constructor(host, source, { zoom = 1 } = {}) {
    this.source = source;
    this.zoom = zoom;
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'onebit-canvas';
    this.canvas.setAttribute('aria-label', '1-bit avatar preview');
    this.canvas.width = this.canvas.height = 320;
    this.context = this.canvas.getContext('2d', { willReadFrequently: true });
    this.clear();
    this.fps = 30;
    this.threshold = 160;
    this.next = 0;
    this.samples = 0;
    host.append(this.canvas);
  }
  configure({ resolution, fps, threshold }) {
    if (resolution !== undefined) {
      this.canvas.width = this.canvas.height = resolution;
      this.clear();
    }
    if (fps !== undefined) this.fps = fps;
    if (threshold !== undefined) this.threshold = threshold;
    this.next = 0;
  }
  clear() {
    this.context.fillStyle = '#fff';
    this.context.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }
  update(now) {
    if (now < this.next) return;
    const source = this.source();
    if (!source?.width || !source?.height) return;
    const interval = 1000 / this.fps;
    // Retain cadence when browser frames arrive slightly after a deadline.
    this.next = now + interval - (this.next ? (now - this.next) % interval : 0);
    const c = this.context, n = this.canvas.width;
    c.fillStyle = '#fff'; c.fillRect(0, 0, n, n);
    const scale = Math.min(n / source.width, n / source.height) * this.zoom;
    const w = source.width * scale, h = source.height * scale;
    c.drawImage(source, (n - w) / 2, (n - h) / 2, w, h);
    const pixels = c.getImageData(0, 0, n, n);
    toOneBit(pixels.data, this.threshold);
    c.putImageData(pixels, 0, 0);
    this.samples++;
  }
  dispose() { this.canvas.remove(); }
}
