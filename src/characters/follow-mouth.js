// Follow's mouth rig consumes named blendshapes, independently of their provider.
// Left/right use the same screen-side convention as this stylized avatar's controls.
export const MOUTH_CHANNEL_GROUPS = [
  ["下颌", [["jawOpen", "张开"], ["jawLeft", "向左"], ["jawRight", "向右"], ["jawForward", "前伸"]]],
  ["上下唇", [["mouthUpperUpLeft", "左上唇抬起"], ["mouthUpperUpRight", "右上唇抬起"], ["mouthLowerDownLeft", "左下唇下拉"], ["mouthLowerDownRight", "右下唇下拉"], ["mouthRollUpper", "上唇内卷"], ["mouthRollLower", "下唇内卷"], ["mouthShrugUpper", "上唇上提"], ["mouthShrugLower", "下唇上提"]]],
  ["左右嘴角", [["mouthSmileLeft", "左嘴角上提"], ["mouthSmileRight", "右嘴角上提"], ["mouthFrownLeft", "左嘴角下压"], ["mouthFrownRight", "右嘴角下压"], ["mouthStretchLeft", "左侧拉伸"], ["mouthStretchRight", "右侧拉伸"], ["mouthDimpleLeft", "左侧收紧"], ["mouthDimpleRight", "右侧收紧"]]],
  ["唇形与闭合", [["mouthPucker", "撅嘴"], ["mouthFunnel", "漏斗形"], ["mouthClose", "双唇闭合"], ["mouthPressLeft", "左侧压唇"], ["mouthPressRight", "右侧压唇"], ["mouthLeft", "嘴部左移"], ["mouthRight", "嘴部右移"]]],
];
export const MOUTH_CHANNELS = MOUTH_CHANNEL_GROUPS.flatMap(([, channels]) => channels.map(([name]) => name));
export const LIP_POINTS = ["cornerLeft", "upperLeft", "upperCenter", "upperRight", "cornerRight", "lowerRight", "lowerCenter", "lowerLeft"];
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const number = v => Number.isFinite(v) ? clamp(v) : 0;

/** Eight native cubic vertices. Shared x stations keep the upper and lower
 * boundaries ordered, even under closure/asymmetric extreme combinations.
 * Jaw translation also drives a separate lower dentition and chin rig.
 */
export function solveFollowMouth(weights = {}) {
  const b = Object.fromEntries(MOUTH_CHANNELS.map(name => [name, number(weights[name])]));
  const jawY = b.jawOpen * 34 + b.jawForward * 3;
  const jawX = (b.jawRight - b.jawLeft) * 9;
  const shift = (b.mouthRight - b.mouthLeft) * 9 + jawX * .25;
  const projection = 1 + b.jawForward * .12;
  const half = side => (28 * (1 - b.mouthPucker * .52 - b.mouthFunnel * .28) +
    b['mouthStretch' + side] * 12 + b['mouthSmile' + side] * 5 - b['mouthDimple' + side] * 3) * projection;
  const left = Math.max(9, half('Left')), right = Math.max(9, half('Right'));
  const corner = side => -b['mouthSmile' + side] * 8 + b['mouthFrown' + side] * 7 -
    b['mouthDimple' + side] * 2 + jawY * .15;
  const cy = [corner('Left'), corner('Right')];
  const upper = [], lower = [];
  for (const [i, side] of ['Left', 'Right'].entries()) {
    const top = -2 - b['mouthUpperUp' + side] * 12 + b.mouthRollUpper * 7 -
      b.mouthShrugUpper * 4 - b.mouthFunnel * 9 + cy[i] * .3;
    const bottom = 2 + jawY + b['mouthLowerDown' + side] * 12 -
      b.mouthRollLower * 9 - b.mouthShrugLower * 7 + b.mouthFunnel * 7 + cy[i] * .3;
    const seam = (top + bottom) / 2;
    // Pucker narrows and gathers the lips; funnel opens both lips separately.
    const gap = Math.max(0, bottom - top) * (1 - b.mouthClose) *
      (1 - b['mouthPress' + side]) * (1 - .55 * b.mouthPucker);
    upper.push(seam - gap / 2); lower.push(seam + gap / 2);
  }
  const points = [
    [-left + shift, cy[0]], [-left * .52 + shift, upper[0]],
    [shift, (upper[0] + upper[1]) / 2], [right * .52 + shift, upper[1]],
    [right + shift, cy[1]], [right * .52 + shift, lower[1]],
    [shift, (lower[0] + lower[1]) / 2], [-left * .52 + shift, lower[0]],
  ];
  const signals = {};
  const putHandle = (index, which, x, y) => {
    const p = points[index], dx = x - p[0], dy = y - p[1];
    signals[LIP_POINTS[index] + which + 'Rotation'] = Math.atan2(dy, dx);
    signals[LIP_POINTS[index] + which + 'Distance'] = Math.hypot(dx, dy);
  };
  points.forEach(([x, y], i) => {
    signals[LIP_POINTS[i] + 'X'] = x; signals[LIP_POINTS[i] + 'Y'] = y;
    const j = (i + 1) % points.length, [nx, ny] = points[j];
    // Horizontal tangents inside the lips, vertical tangents at both corners.
    // Paired Bezier controls have identical x and ordered y; no lip crossing.
    const atCorner = i === 0 || i === 4, nextCorner = j === 0 || j === 4;
    putHandle(i, 'Out', atCorner ? x : x + (nx - x) / 3, atCorner ? y + (ny - y) * .65 : y);
    putHandle(j, 'In', nextCorner ? nx : nx - (nx - x) / 3, nextCorner ? ny + (y - ny) * .65 : ny);
  });
  Object.assign(signals, {
    jawX: jawX * .65, jawY: jawY * .4, jawScale: 1 + b.jawForward * .07,
    teethX: shift, teethWidth: 46 * projection,
    lowerTeethX: shift + jawX * .6, lowerTeethY: jawY + 9,
    tongueX: shift + jawX * .6, tongueY: jawY + 12,
    // Geometry performs the occlusion. Rows stay attached to their jaw.
    teethVisible: clamp((Math.max(...lower) - Math.min(...upper) - 3) / 12),
  });
  return signals;
}
export const FOLLOW_MOUTH_DEFAULTS = Object.freeze(solveFollowMouth());

// Interpolate Bezier handles in Cartesian coordinates, then encode for Rive.
// This preserves ordered boundaries during a fade and avoids angular wraparound.
export function blendMouth(a, b, amount) {
  const result = Object.fromEntries(Object.keys(a).map(key => [key, a[key] + (b[key] - a[key]) * amount]));
  for (const point of LIP_POINTS) for (const side of ['In', 'Out']) {
    const angle = point + side + 'Rotation', distance = point + side + 'Distance';
    const ax = Math.cos(a[angle]) * a[distance], ay = Math.sin(a[angle]) * a[distance];
    const bx = Math.cos(b[angle]) * b[distance], by = Math.sin(b[angle]) * b[distance];
    const dx = ax + (bx - ax) * amount, dy = ay + (by - ay) * amount;
    result[angle] = Math.atan2(dy, dx); result[distance] = Math.hypot(dx, dy);
  }
  return result;
}
