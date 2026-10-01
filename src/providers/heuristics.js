import { pinyin } from "pinyin-pro";
import { clamp, DEFAULT_CONTRACT } from "../framework/contract.js";
export function textToVisemes(text) {
  // Mandarin pronunciation via pinyin; English spelling heuristic, not phoneme alignment.
  const roman = pinyin(text, {
    toneType: "none",
    type: "array",
    nonZh: "consecutive",
  })
    .join(" ")
    .toLowerCase();
  return [...roman].flatMap((c) => {
    const value = {
      a: "A",
      e: "E",
      i: "I",
      o: "O",
      u: "U",
      ü: "V",
      v: "V",
      b: "M",
      p: "M",
      m: "M",
    }[c];
    return value
      ? [{ value, duration: 90 }]
      : /[\s.,!?，。！？]/u.test(c)
        ? [{ value: "REST", duration: 65 }]
        : [];
  });
}
export class TextStream {
  constructor(convert = textToVisemes, visemes = DEFAULT_CONTRACT.visemes) {
    this.convert = convert;
    this.visemes = visemes;
    this.buffer = "";
    this.queue = [];
    this.max = 16000;
  }
  push(chunk, final = false) {
    if (typeof chunk !== "string" || typeof final !== "boolean")
      throw Error("无效文本块");
    const buffer = this.buffer + chunk;
    if (buffer.length > this.max) throw Error("文本队列已满，请等待或停止");
    const cut = final
      ? buffer.length
      : Math.max(
          buffer.lastIndexOf(" "),
          buffer.lastIndexOf("\n"),
          buffer.search(/[。！？!?](?=[^。！？!?]*$)/u),
        ) + 1;
    const cues = cut > 0 ? this.convert(buffer.slice(0, cut)) : [];
    if (
      !Array.isArray(cues) ||
      cues.some(
        (c) =>
          !c ||
          !this.visemes.includes(c.value) ||
          !Number.isFinite(c.duration) ||
          c.duration <= 0 ||
          c.duration > 60000,
      )
    )
      throw Error("Provider 必须同步返回有效的 { value, duration } 嘴形数组");
    if (this.queue.length + cues.length > 4000)
      throw Error("文本队列已满，请等待或停止");
    this.queue.push(...cues.map((c) => ({ ...c })));
    this.buffer = buffer.slice(cut);
  }
  clear() {
    this.buffer = "";
    this.queue = [];
  }
}
// Rough vowel estimate from two spectral peaks. No transcription or language recognition.
export function estimateVowel(spectrum, sampleRate, fftSize, rms) {
  if (rms < 0.012) return { value: "REST", confidence: 0 };
  const peak = (lo, hi) => {
    let best = -Infinity,
      f = lo;
    for (
      let i = Math.ceil((lo * fftSize) / sampleRate);
      i < Math.min(spectrum.length, (hi * fftSize) / sampleRate);
      i++
    ) {
      if (spectrum[i] > best) {
        best = spectrum[i];
        f = (i * sampleRate) / fftSize;
      }
    }
    return f;
  };
  const f1 = peak(250, 950),
    f2 = peak(1000, 2900);
  const refs = {
    A: [750, 1250],
    E: [500, 1850],
    I: [300, 2400],
    O: [500, 1000],
    U: [300, 1100],
    V: [320, 1850],
  };
  const ranked = Object.entries(refs)
    .map(([value, [a, b]]) => ({
      value,
      d: Math.hypot((f1 - a) / 450, (f2 - b) / 1000),
    }))
    .sort((a, b) => a.d - b.d);
  return { value: ranked[0].value, confidence: clamp(1 - ranked[0].d), f1, f2 };
}
