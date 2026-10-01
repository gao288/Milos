// A second, independent Canvas renderer proves the protocol is not Rive-specific.
import { performanceMouth } from "../framework/performance.js";
export class OrbAdapter {
  async mount(host, contract) {
    this.contract = contract;
    this.canvas = document.createElement("canvas");
    this.canvas.width = 700;
    this.canvas.height = 700;
    this.canvas.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;visibility:hidden";
    host.append(this.canvas);
    this.ctx = this.canvas.getContext("2d");
    if (!this.ctx) throw Error("Canvas 2D unavailable");
    this.pose = { brow: 0, eyes: 1, smile: 0 };
  }
  render(frame) {
    const c = this.ctx;
    const poses = {
      neutral: [0, 1, 0.1],
      happy: [-0.12, 0.65, 0.8],
      sad: [-0.35, 0.8, -0.5],
      curious: [0.25, 1.15, 0.2],
      surprised: [0, 1.5, 0],
      angry: [0.4, 0.65, -0.3],
    };
    const p = poses[frame.expression.state] ?? poses.neutral;
    ["brow", "eyes", "smile"].forEach((k, i) => {
      const baseline = poses.neutral[i];
      this.pose[k] +=
        (baseline +
          (p[i] - baseline) * frame.expression.intensity -
          this.pose[k]) *
        0.18;
    });
    const shapes = {
      REST: [27, 2],
      A: [27, 23],
      E: [35, 12],
      I: [40, 6],
      O: [16, 25],
      U: [12, 18],
      V: [15, 13],
      M: [28, 1],
    };
    let w = 0,
      h = 0;
    for (const [name, weight] of Object.entries(frame.mouth.weights)) {
      const shape = shapes[name] ?? shapes.REST;
      w += shape[0] * weight;
      h += shape[1] * weight;
    }
    if (frame.performance) {
      const mouth = performanceMouth(frame.performance.weights);
      const mix = frame.performance.weight;
      w += (27 * mouth.width - w) * mix;
      h += (1 + mouth.open * 30 - h) * mix;
    }
    c.clearRect(0, 0, 700, 700);
    c.save();
    c.translate(350, 365 + frame.motion.breath * 5);
    c.rotate(frame.motion.headTilt * 0.2);
    c.fillStyle = "#b0bca866";
    c.beginPath();
    c.ellipse(0, 211, 135, 15, 0, 0, Math.PI * 2);
    c.fill();
    const g = c.createRadialGradient(-65, -90, 5, 10, 15, 215);
    g.addColorStop(0, "#f4e6ba");
    g.addColorStop(0.6, "#afc99e");
    g.addColorStop(1, "#587d62");
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(0, 0, 164, 179, 0, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "#365c45";
    c.lineWidth = 8;
    c.lineCap = "round";
    for (const x of [-59, 59]) {
      c.save();
      c.translate(x, -25);
      c.fillStyle = "#264a38";
      c.beginPath();
      c.ellipse(
        frame.motion.gazeX * 10,
        frame.motion.gazeY * 7,
        13,
        Math.max(1, 24 * this.pose.eyes * frame.motion.eyeOpen),
        0,
        0,
        Math.PI * 2,
      );
      c.fill();
      c.translate(0, -44);
      c.rotate(this.pose.brow * (x < 0 ? 1 : -1));
      c.beginPath();
      c.moveTo(-18, 0);
      c.quadraticCurveTo(0, -5, 18, 0);
      c.stroke();
      c.restore();
    }
    c.fillStyle = "#395b46";
    c.beginPath();
    c.ellipse(0, 60, Math.max(1, w), Math.max(1, h), 0, 0, Math.PI * 2);
    c.fill();
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(-27, 60);
    c.quadraticCurveTo(
      0,
      60 +
        this.pose.smile *
          32 *
          (frame.mouth.weights[this.contract.restViseme] ?? 0),
      27,
      60,
    );
    c.stroke();
    c.fillStyle =
      frame.behavior === "listening"
        ? "#e8c878"
        : frame.behavior === "speaking"
          ? "#ceef9a"
          : "#7a9e70";
    c.beginPath();
    c.arc(0, -151, 6, 0, Math.PI * 2);
    c.fill();
    c.restore();
    this.canvas.style.visibility = "visible";
  }
  dispose() {
    this.canvas?.remove();
  }
}
