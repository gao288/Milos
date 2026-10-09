import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/600.css";
import "@fontsource/noto-sans-sc/400.css";
import "./style.css";
import { installLanguageSwitch } from "./i18n/index.js";
import {
  EMOTIONS,
  clamp,
  validateEvent,
  TextStream,
  textToVisemes,
  estimateVowel,
} from "./core.js";
import { AvatarRuntime } from "./framework/index.js";
import { RiveAdapter } from "./adapters/rive.js";
import { OrbAdapter } from "./adapters/orb.js";
import { milo } from "./characters/milo.js";
import { miloBasic } from "./characters/milo-basic.js";
import { followClassic } from "./characters/follow-classic.js";
import { followPresets } from "./characters/follow-presets.js";
import { interactiveFollow } from "./characters/interactive-follow.js";
import { MouthLab } from "./mouth-lab.js";
import { AudioLab } from "./audio-lab.js";
import { PerformanceTimeline } from "./framework/performance.js";
import { VoicePanel } from "./voice-panel.js";
const $ = (s) => document.querySelector(s);
const icons = ["◡", "☺", "◠", "◔", "◎", "≋", "◉"];
const labels = [
  "平静 Neutral",
  "开心 Happy",
  "难过 Sad",
  "好奇 Curious",
  "惊讶 Surprise",
  "生气 Angry",
  "恐惧 Fear",
];
const facialControls = [
  ["browRaiseLeft", "左眉抬起"],
  ["browRaiseRight", "右眉抬起"],
  ["squintLeft", "左眼眯起"],
  ["squintRight", "右眼眯起"],
  ["eyeWide", "睁大眼睛"],
  ["cheekRaise", "提起脸颊"],
  ["smile", "嘴角上提"],
  ["frown", "嘴角下压"],
  ["jawOpen", "下颌张开"],
  ["noseWrinkle", "鼻部紧张"],
];
const presets = {
  warm: {
    label: "温柔微笑",
    emotion: "happy",
    intensity: 0.5,
    face: { smile: 0.25, cheekRaise: 0.15 },
    tilt: -0.1,
  },
  laugh: {
    label: "开怀大笑",
    emotion: "happy",
    intensity: 1,
    face: {
      squintLeft: 0.36,
      squintRight: 0.36,
      cheekRaise: 0.5,
      jawOpen: 0.35,
      smile: 0.5,
    },
    tilt: 0.06,
  },
  skeptical: {
    label: "半信半疑",
    emotion: "curious",
    intensity: 0.85,
    face: { browRaiseLeft: 0.36, squintRight: 0.35, frown: 0.12 },
    tilt: -0.22,
  },
  worried: {
    label: "担心你",
    emotion: "sad",
    intensity: 0.8,
    face: { browRaiseLeft: 0.12, browRaiseRight: 0.12, frown: 0.22 },
    tilt: 0.12,
  },
  sleepy: {
    label: "有点困了",
    emotion: "neutral",
    intensity: 0.5,
    face: { squintLeft: 0.65, squintRight: 0.58, jawOpen: 0.12 },
    tilt: 0.18,
  },
};
$("#app").innerHTML =
  `<header><div class="brand"><span class="logo">m.</span>milo<span style="color:#95a18c"> / </span><small>EXPRESSION LAB</small></div><div class="top-right"><span>让每一个表情，都有回应。</span><div class="pill"><i class="dot"></i> Local playground</div></div></header><main><div class="intro"><div><div class="eyebrow">A little more human</div><h1>Meet your expressive companion.</h1><p>从一个微笑开始。探索表情、声音与动作之间的联系。</p></div><span class="pill">EXPRESSIVE RIG &nbsp; / &nbsp; v0.4</span></div><div class="layout"><section><div class="stage" id="stage"><div class="stage-top"><span class="pill"><i class="dot"></i> LIVE PREVIEW</span><span class="pill" id="emotion-badge">neutral</span></div><div class="orbit"></div><i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i><div id="avatar" role="img" aria-label="参数化动画角色"></div><div class="loading" id="loading" role="status"><span id="load-message">Loading Milo…</span><button id="retry-animation" class="btn hidden">Retry animation</button></div><div class="subtitle" id="subtitle" data-i18n-ignore></div><div class="stage-bottom"><div><strong id="character-name">Milo</strong><p>One protocol. Many personalities.</p></div><button class="round" id="reset" aria-label="重置所有参数">↺</button></div></div><section id="expression-studio" class="panel expression-studio"><div class="panel-head"><div><h2>More than a smile</h2><p>眼睑、眉毛、脸颊与下颌，一起表达。</p></div><button id="demo" class="btn">▷ 表情演示</button></div><div class="preset-grid">${Object.entries(
    followPresets,
  )
    .map(
      ([id, p]) =>
        `<button class="btn preset" data-preset="${id}">${p.label}</button>`,
    )
    .join(
      "",
    )}</div><div class="row"><span class="helper">3 个原生动画层 · 10 个细分参数</span><button class="btn" id="face-toggle" aria-expanded="false">面部微调 ＋</button></div><div id="face-tuning" class="hidden"><p class="helper">参数叠加在当前情绪上；左右以画面方向为准。</p><div class="face-grid">${facialControls.map(([id, label]) => `<div class="control"><label for="face-${id}">${label}<output id="face-${id}-value">0.00</output></label><input id="face-${id}" type="range" min="0" max="1" step=".01" value="0"></div>`).join("")}</div><button class="btn" id="face-reset">清除面部叠加</button></div></section><div class="bottom-grid"><div class="panel"><div class="panel-head"><h2>Give your avatar a voice</h2><span class="tag">EN / 中文</span></div><div class="tabs"><button class="tab active" data-tab="text">Streaming text</button><button class="tab" data-tab="audio">Microphone</button></div><div id="text-pane"><textarea id="text" aria-label="要播放的文本" maxlength="4000">Hello! It is great to meet you. Let’s explore some new expressions together.</textarea><div class="row"><select id="language" aria-label="语音语言"><option value="zh-CN">中文 · Mandarin</option><option value="en-US">English · US</option></select><label style="font-size:10px;color:#849078"><input type="checkbox" id="tts"> 浏览器朗读</label></div><div class="actions"><button class="btn primary wide" id="play">▷ &nbsp; 模拟文本流</button><button class="btn" id="stop">停止</button></div><p class="helper">文本→拼音/拼写嘴形估计。朗读与嘴形使用独立时钟，暂非精确同步。</p></div><div id="audio-pane" class="hidden"><div class="mic-zone"><div class="mic-symbol">◉</div><p>让角色跟随你的声音</p><button class="btn primary" id="mic">开启麦克风</button></div><p class="helper">本地频谱元音估计，支持中英语音；不录音、不上传。需 localhost 或 HTTPS。</p></div></div><div class="panel"><div class="panel-head"><h2>Lip-sync monitor</h2><span class="tag" id="source">IDLE</span></div><div class="eyebrow">Vowel / viseme</div><div class="visemes">${["A", "E", "I", "O", "U", "V", "M"].map((v) => `<button class="viseme" data-viseme="${v}" title="${v === "V" ? "ü / rounded front vowel" : v}">${v === "V" ? "Ü" : v}</button>`).join("")}</div><div class="meter" id="meter">${Array.from({ length: 37 }, () => "<i></i>").join("")}</div><div class="metrics"><span id="viseme-readout">REST</span><span id="confidence">—</span></div><hr><div class="eyebrow">Behavior state</div><div class="state-flow">${["idle", "listening", "speaking"].map((v, i) => `${i ? "<b>↔</b>" : ""}<span class="state-node ${i ? "" : "active"}" data-state="${v}">${v}</span>`).join("")}</div></div></div></section><aside><div class="panel"><div class="panel-head"><h2>Expression controls</h2><span class="tag">7 STATES</span></div><label class="character-label" for="character">角色 / Renderer</label><select id="character"><option value="milo">Milo · 表情升级版</option><option value="milo-basic">Milo Classic · 原版对比</option><option value="orb">Sprout · Canvas 2D</option></select><p>给此刻的角色一点情绪。</p><div class="emotions">${EMOTIONS.map((e, i) => `<button class="emotion ${i ? "" : "active"}" data-emotion="${e}"><span>${icons[i]}</span>${labels[i]}</button>`).join("")}</div>${[
    ["intensity", "表情强度 / Intensity", 0, 1, 0.8],
    ["gazeX", "视线 X / Gaze", -1, 1, 0],
    ["gazeY", "视线 Y / Gaze", -1, 1, 0],
    ["headTilt", "头部倾斜 / Tilt", -1, 1, 0],
    ["smoothing", "参数平滑 / Smoothing", 0.1, 1.2, 0.35],
  ]
    .map(
      ([id, l, min, max, val]) =>
        `<div class="control"><label for="${id}">${l}<output id="${id}-value">${val}</output></label><input id="${id}" type="range" min="${min}" max="${max}" step="0.01" value="${val}"></div>`,
    )
    .join(
      "",
    )}<hr><label class="switch-row">自然眨眼 <input id="auto-blink" type="checkbox" checked></label><label class="switch-row">自然待机动作 <input id="idle-motion" type="checkbox" checked></label><label class="switch-row">视线跟随鼠标 <input id="follow" type="checkbox"></label><div class="actions"><button class="btn wide" id="blink">眨一下眼</button><button class="btn wide" id="nod">点点头</button><button class="btn wide" id="shake">摇摇头</button></div><div class="event-box"><hr><details><summary>↗ &nbsp; JEV / JSON event bridge</summary><textarea id="event-json" aria-label="控制事件 JSON">{
  "type": "expression",
  "emotion": "happy",
  "intensity": 0.9
}</textarea><button class="btn" id="send-event">发送事件</button><p class="helper">window.avatar.dispatch(event)<br>window.avatar.pushText(chunk, final)</p></details></div><div id="status" role="status">正在加载 Rive 状态机…</div></div><p class="side-note">表情层与嘴形层独立运行。<br>切换角色时，表情与嘴形继续运行。</p></aside></div><footer><span>MILO LAB &nbsp; / &nbsp; Built for a more expressive connection.</span><span>Layered expressions · State & viseme protocol · v0.4</span></footer></main>`;
const runtime = new AvatarRuntime();
$("#character").add(new Option("Follow V2 · 12 个表情造型", "follow"));
$("#character").add(new Option("Follow Classic · 升级前对比", "follow-classic"));
$("#stage").insertAdjacentHTML("afterend", `
  <section id="follow-info" class="panel follow-info hidden">
    <strong>Interactive Character Follow</strong>
    <p>在画面上移动鼠标，或用视线 X / Y 滑块控制转头。角色自带眨眼。</p>
    <p>V2：七种情绪、12 个表情造型；独立眼睑、瞳孔、眉形和连续嘴形已接入。可以播放中英文语音样本，或发送 JEV / JSON 控制事件。</p>
    <p class="helper">作品：<a href="https://rive.app/marketplace/28334-53514-interactive-character-follow/" target="_blank" rel="noopener noreferrer">alinazari · Interactive Character Follow</a>
      · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>
      · 改编：保留角色与跟随动画，新增表情状态和语音嘴形。
      <span>V2 编辑器工程：等待 Rive 登录后导出</span> · <a href="/follow-classic.rev" download>下载升级前工程</a>
    </p>
  </section>`);
// Keep the expression studies immediately below the avatar, ahead of voice labs.
$("#stage").insertAdjacentElement("afterend", $("#expression-studio"));
const target = runtime.parameters;
let emotion = "neutral",
  behavior = "idle",
  source = "idle",
  viseme = "REST",
  manualUntil = 0;
let character = "milo";
let requestedCharacter = "milo";
let loadAttempt = 0;
let demoTimer = null;
let audioLab = null;
let mouthLab = null;
let voicePanel = null;
const characters = new Map([
  ["follow-classic", { name: "Follow Classic", create: () => new RiveAdapter(followClassic) }],
  ["follow", { name: "Follow V2", create: () => new RiveAdapter(interactiveFollow) }],
  ["milo", { name: "Milo", create: () => new RiveAdapter(milo) }],
  [
    "milo-basic",
    { name: "Milo Classic", create: () => new RiveAdapter(miloBasic) },
  ],
  ["orb", { name: "Sprout", create: () => new OrbAdapter() }],
]);
let providers = { textToVisemes, estimateVowel };
let frameId;
let streamTimer = null,
  textDeadline = 0,
  flushTimer = null,
  micSession = 0,
  audioContext = null,
  media = null,
  analyser = null,
  timeData = null,
  freqData = null,
  rms = 0,
  confidence = 0;
const textStream = new TextStream((text) => providers.textToVisemes(text));
function status(text, error = false) {
  $("#status").textContent = text;
  $("#status").classList.toggle("error", error);
}
function setBehavior(v) {
  runtime.dispatch({ type: "behavior", state: v });
  behavior = v;
  document
    .querySelectorAll("[data-state]")
    .forEach((el) => el.classList.toggle("active", el.dataset.state === v));
}
function setSource(v) {
  source = v;
  $("#source").textContent = v.toUpperCase();
}
function setEmotion(e, intensity = target.intensity) {
  document
    .querySelectorAll("[data-preset]")
    .forEach((el) => el.classList.remove("active"));
  runtime.dispatch({ type: "expression", emotion: e, intensity });
  emotion = e;
  target.intensity = intensity;
  $("#intensity").value = intensity;
  $("#intensity-value").textContent = intensity.toFixed(2);
  document
    .querySelectorAll("[data-emotion]")
    .forEach((el) => el.classList.toggle("active", el.dataset.emotion === e));
  $("#emotion-badge").textContent = e;
  status("Expression → " + e);
}
function chooseViseme(v, weight = 1) {
  runtime.dispatch({ type: "viseme", value: v, weight });
  viseme = v;
  document
    .querySelectorAll("[data-viseme]")
    .forEach((el) => el.classList.toggle("active", el.dataset.viseme === v));
  $("#viseme-readout").textContent = v;
}
function stopAudio() {
  micSession++;
  media?.getTracks().forEach((t) => t.stop());
  media = null;
  const old = audioContext;
  audioContext = null;
  old?.close().catch(() => {});
  analyser = null;
  rms = 0;
  $("#mic").textContent = "开启麦克风";
  $("#mic").disabled = false;
}
function stop(options = {}) {
  if (!options.keepVoice) voicePanel?.stop();
  if (!options.keepModel) audioLab?.stop();
  stopDemo();
  clearInterval(streamTimer);
  streamTimer = null;
  clearTimeout(flushTimer);
  textStream.clear();
  textDeadline = 0;
  manualUntil = 0;
  window.speechSynthesis?.cancel();
  stopAudio();
  chooseViseme("REST");
  setBehavior("idle");
  setSource("idle");
  runtime.dispatch({ type: "stop" });
  $("#subtitle").textContent = "";
}
function pushText(chunk, final = false) {
  if (typeof chunk !== "string") throw Error("chunk 必须是字符串");
  textStream.push(chunk, final);
  setSource("text");
  setBehavior("speaking");
  $("#subtitle").textContent = ($("#subtitle").textContent + chunk).slice(-100);
  clearTimeout(flushTimer);
  if (!final)
    flushTimer = setTimeout(() => {
      try {
        textStream.push("", true);
      } catch (error) {
        stop();
        status(error.message, true);
      }
    }, 350);
}
function dispatch(raw) {
  const e = validateEvent(raw);
  if (e.type === "face") setFace(e.values);
  if (e.type === "expression") setEmotion(e.emotion, e.intensity);
  if (e.type === "motion") {
    runtime.dispatch(e);
    if (e.durationMs === undefined) for (const k of ["gazeX", "gazeY", "headTilt"])
      if (e[k] !== undefined) {
        target[k] = e[k];
        $("#" + k).value = e[k];
        $("#" + k + "-value").textContent = e[k].toFixed(2);
      }
  }
  if (e.type === "text") {
    if (source !== "text") stop();
    pushText(e.chunk, e.final);
  }
  if (e.type === "stop") stop();
  if (e.type === "viseme") {
    stop();
    chooseViseme(e.value, e.weight);
    manualUntil =
      e.durationMs === null ? Infinity : performance.now() + e.durationMs;
    setSource("manual");
  }
  if (e.type === "gesture") runtime.dispatch(e);
  if (e.type === "behavior") setBehavior(e.state);
  return e;
}
async function setCharacter(id) {
  const entry = characters.get(id);
  if (!entry) throw Error("未知角色: " + id);
  const attempt = ++loadAttempt;
  requestedCharacter = id;
  if (!runtime.renderer) {
    $("#loading").classList.remove("hidden");
    $("#load-message").textContent = "Loading " + entry.name + "…";
    $("#retry-animation").classList.add("hidden");
  }
  status("正在加载 " + entry.name + "…");
  try {
    const committed = await runtime.setRenderer(entry.create(), $("#avatar"));
    if (!committed) return false;
    character = id;
    audioLab?.setCharacter(id);
    mouthLab?.setCharacter(id);
    const isFollow = id === "follow" || id === "follow-classic";
    $("#stage").classList.toggle("follow-stage", isFollow);
    $("#follow-info").classList.toggle("hidden", !isFollow);
    $("#follow").checked = isFollow;
    document.querySelectorAll("[data-emotion], #intensity, #headTilt, #auto-blink, #idle-motion, #blink, #nod, #shake")
      .forEach((control) => { control.disabled = false; });
    $("#emotion-badge").textContent = emotion;
    $(".side-note").textContent = id === "follow-classic"
      ? "升级前版本：六种原生表情；fear 使用旧版惊讶造型。切换回 Follow V2 可查看新版眼睑和恐惧。"
      : isFollow
      ? "原生转头、眨眼与表情层同时运行；语音模型控制连续嘴形，JEV 控制情绪和动作。"
      : "表情层与嘴形层独立运行。切换角色时，表情与嘴形继续运行。";
    $("#expression-studio").classList.toggle("hidden", !["milo", "follow", "follow-classic"].includes(id));
    stopDemo();
    $("#character").value = id;
    $("#character-name").textContent = entry.name;
    $("#loading").classList.add("hidden");
    status(entry.name + (isFollow ? " 已连接 · 原生表情 / 连续嘴形 / 视线跟随" : " 已连接 · 统一状态/嘴形接口"));
    return true;
  } catch (error) {
    if (attempt !== loadAttempt) return false;
    if (!runtime.renderer) {
      $("#loading").classList.remove("hidden");
      $("#load-message").textContent =
        "Animation could not load. " + error.message.split("\n")[0];
      $("#retry-animation").classList.remove("hidden");
    }
    $("#character").value = character;
    status(error.message, true);
    throw error;
  }
}
function setProviders(next) {
  for (const key of Object.keys(next))
    if (
      !["textToVisemes", "estimateVowel"].includes(key) ||
      typeof next[key] !== "function"
    )
      throw Error("未知 provider 或 provider 不是函数");
  stop();
  providers = { ...providers, ...next };
}
window.avatar = {
  dispatch,
  pushText: (c, final = false) => {
    if (source !== "text") stop();
    pushText(c, final);
  },
  stop,
  setCharacter,
  applyPreset,
  setProviders,
  registerCharacter: (id, entry) => {
    if (
      typeof id !== "string" ||
      !id ||
      characters.has(id) ||
      typeof entry?.create !== "function" ||
      typeof entry.name !== "string"
    )
      throw Error("角色需要唯一 id、name 和 create()");
    characters.set(id, entry);
    $("#character").add(new Option(entry.name, id));
  },
  getState: () => ({
    ready: !!runtime.renderer,
    character,
    emotion,
    behavior,
    source,
    viseme,
    parameters: { ...target },
    face: { ...runtime.face },
    queue: textStream.queue.length,
  }),
  getFrame: () => runtime.getFrame(),
  performance: {
    loadClip: (clip) => audioLab.loadClip(clip),
    setAudioProvider: (provider) => audioLab.setProvider(provider),
    // A TTS/model bridge can append timestamped frames and supply its own
    // audio clock. The timeline interpolates; packet arrival never drives time.
    beginStream: (readTimeMs, options = {}) => {
      stop();
      const timeline = new PerformanceTimeline();
      runtime.setPerformance(timeline, readTimeMs, options);
      const source = runtime.performanceSource;
      setSource("model-stream");
      return {
        append: (frames) => timeline.append(frames),
        finish: (durationMs) => timeline.finish(durationMs),
        stop: () => {
          if (runtime.performanceSource === source) {
            runtime.clearPerformance(); setSource("idle");
          }
        },
      };
    },
  },
};
audioLab = new AudioLab(runtime, {
  stopAll: () => stop(), stopLegacy: () => stop({ keepModel: true }),
  setBehavior, setSource,
});
mouthLab = new MouthLab(runtime, { stopAll: () => stop(), setSource });
let voicePerformance = null;
voicePanel = new VoicePanel({
  stop: () => stop({ keepVoice: true }), dispatch,
  setTimeline: (timeline, readTimeMs) => {
    runtime.setPerformance(timeline, readTimeMs, { upperFaceWeight: 0 });
    voicePerformance = runtime.performanceSource; setSource("live-voice");
  },
  clearTimeline: () => {
    if (voicePerformance && runtime.performanceSource === voicePerformance) {
      runtime.clearPerformance(); setBehavior("idle"); setSource("idle");
    }
    voicePerformance = null;
  },
});
$("#character").onchange = (e) => {
  setCharacter(e.target.value).catch(() => {});
};
$("#retry-animation").onclick = () => {
  setCharacter(requestedCharacter).catch(() => {});
};
const initialCharacter = new URLSearchParams(location.search).get("character");
setCharacter(characters.has(initialCharacter) ? initialCharacter : "follow").catch(() => {});
document.querySelectorAll("[data-emotion]").forEach(
  (el) =>
    (el.onclick = () => {
      stopDemo();
      setEmotion(el.dataset.emotion);
    }),
);
for (const k of Object.keys(target))
  $("#" + k).oninput = (e) => {
    target[k] = +e.target.value;
    $("#" + k + "-value").textContent = target[k].toFixed(2);
  };
function setFace(values) {
  document
    .querySelectorAll("[data-preset]")
    .forEach((el) => el.classList.remove("active"));
  runtime.dispatch({ type: "face", values });
  for (const [key, value] of Object.entries(values)) {
    $("#face-" + key).value = value;
    $("#face-" + key + "-value").textContent = value.toFixed(2);
  }
}
function stopDemo() {
  clearInterval(demoTimer);
  demoTimer = null;
  $("#demo").textContent = "▷ 表情演示";
}
function applyPreset(id) {
  const preset = character === "follow" ? (followPresets[id] ?? presets[id]) : (presets[id] ?? followPresets[id]);
  if (!preset) throw Error("未知 preset");
  setFace({
    ...Object.fromEntries(facialControls.map(([k]) => [k, 0])),
    ...preset.face,
  });
  setEmotion(preset.emotion, preset.intensity);
  dispatch({ type: "motion", headTilt: preset.tilt ?? 0, gazeX: 0, gazeY: 0 });
  document
    .querySelectorAll("[data-preset]")
    .forEach((el) => el.classList.toggle("active", el.dataset.preset === id));
}
for (const [key] of facialControls)
  $("#face-" + key).oninput = (e) => {
    stopDemo();
    setFace({ [key]: +e.target.value });
  };
$("#face-reset").onclick = () => {
  stopDemo();
  setFace(Object.fromEntries(facialControls.map(([k]) => [k, 0])));
};
$("#face-toggle").onclick = () => {
  const hidden = $("#face-tuning").classList.toggle("hidden");
  $("#face-toggle").setAttribute("aria-expanded", String(!hidden));
  $("#face-toggle").textContent = hidden ? "面部微调 ＋" : "收起微调 −";
};
document.querySelectorAll("[data-preset]").forEach(
  (el) =>
    (el.onclick = () => {
      stopDemo();
      applyPreset(el.dataset.preset);
    }),
);
$("#demo").onclick = () => {
  if (demoTimer) {
    stopDemo();
    return;
  }
  stop();
  const sequence = Object.keys(followPresets);
  let index = 0;
  applyPreset(sequence[index]);
  $("#demo").textContent = "■ 停止演示";
  demoTimer = setInterval(() => {
    index = (index + 1) % sequence.length;
    applyPreset(sequence[index]);
  }, 2200);
};
$("#blink").onclick = () =>
  runtime.dispatch({ type: "gesture", name: "blink" });
$("#nod").onclick = () => runtime.dispatch({ type: "gesture", name: "nod" });
$("#shake").onclick = () => runtime.dispatch({ type: "gesture", name: "shake" });
$("#reset").onclick = () => {
  stop();
  setEmotion("neutral", 0.8);
  setFace(Object.fromEntries(facialControls.map(([k]) => [k, 0])));
  dispatch({ type: "motion", gazeX: 0, gazeY: 0, headTilt: 0 });
  target.smoothing = 0.35;
  $("#smoothing").value = 0.35;
  $("#smoothing-value").textContent = ".35";
  $("#auto-blink").checked = true;
  $("#idle-motion").checked = true;
  $("#follow").checked = false;
};
$("#stage").onpointermove = (e) => {
  if ($("#follow").checked) {
    runtime.attentionUntil = performance.now() + 1800;
    const b = $("#stage").getBoundingClientRect();
    target.gazeX = clamp(((e.clientX - b.left) / b.width) * 2 - 1, -1, 1);
    target.gazeY = clamp(((e.clientY - b.top) / b.height) * 2 - 1, -1, 1);
  }
};
document.querySelectorAll("[data-viseme]").forEach(
  (el) =>
    (el.onclick = () =>
      dispatch({
        type: "viseme",
        value: el.dataset.viseme,
        durationMs: 600,
      })),
);
document.querySelectorAll("[data-tab]").forEach(
  (el) =>
    (el.onclick = () => {
      stop();
      document
        .querySelectorAll("[data-tab]")
        .forEach((b) => b.classList.toggle("active", b === el));
      $("#text-pane").classList.toggle("hidden", el.dataset.tab !== "text");
      $("#audio-pane").classList.toggle("hidden", el.dataset.tab !== "audio");
    }),
);
$("#stop").onclick = stop;
$("#play").onclick = () => {
  stop();
  const text = $("#text").value.trim();
  if (!text) return status("请先输入文字");
  let i = 0;
  streamTimer = setInterval(() => {
    const chunk = text.slice(i, i + 4);
    i += 4;
    try {
      pushText(chunk, i >= text.length);
    } catch (error) {
      stop();
      status(error.message, true);
      return;
    }
    if (i >= text.length) {
      clearInterval(streamTimer);
      streamTimer = null;
    }
  }, 110);
  if ($("#tts").checked) {
    if (!window.speechSynthesis) status("此浏览器不支持朗读", true);
    else {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = $("#language").value;
      u.onerror = (e) => status("朗读不可用：" + e.error, true);
      speechSynthesis.speak(u);
    }
  }
  status("正在模拟逐块文本流");
};
$("#send-event").onclick = () => {
  try {
    dispatch(JSON.parse($("#event-json").value));
  } catch (e) {
    status(e.message, true);
  }
};
$("#mic").onclick = async () => {
  if (media) {
    stop();
    return;
  }
  stop();
  const session = micSession;
  $("#mic").disabled = true;
  status("等待麦克风权限…");
  try {
    if (!navigator.mediaDevices?.getUserMedia)
      throw Error("需要 localhost / HTTPS 和支持麦克风的浏览器");
    let acquired;
    try {
      acquired = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
        },
      });
    } catch (error) {
      if (session !== micSession) return;
      if (!["NotSupportedError", "OverconstrainedError"].includes(error.name))
        throw error;
      acquired = await navigator.mediaDevices.getUserMedia({ audio: true });
    }
    if (session !== micSession) {
      acquired.getTracks().forEach((t) => t.stop());
      return;
    }
    media = acquired;
    audioContext = new AudioContext(
      "sinkId" in AudioContext.prototype ? { sinkId: { type: "none" } } : {},
    );
    await audioContext.resume();
    if (session !== micSession) return;
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 4096;
    analyser.smoothingTimeConstant = 0.65;
    audioContext.createMediaStreamSource(media).connect(analyser);
    timeData = new Float32Array(analyser.fftSize);
    freqData = new Float32Array(analyser.frequencyBinCount);
    $("#mic").textContent = "停止麦克风";
    setSource("microphone");
    setBehavior("listening");
    status("麦克风已连接 · 本地元音估计");
    media.getTracks()[0].onended = () => {
      stop();
      status("麦克风已断开");
    };
  } catch (e) {
    if (session === micSession) {
      stop();
      status("麦克风不可用：" + e.message, true);
    }
  } finally {
    if (session === micSession) $("#mic").disabled = false;
  }
};
let audioTick = 0;
function frame(now) {
  if (analyser && now - audioTick > 55) {
    audioTick = now;
    analyser.getFloatTimeDomainData(timeData);
    rms = Math.sqrt(timeData.reduce((s, v) => s + v * v, 0) / timeData.length);
    analyser.getFloatFrequencyData(freqData);
    try {
      const estimate = providers.estimateVowel(
        freqData,
        audioContext.sampleRate,
        analyser.fftSize,
        rms,
      );
      if (
        !Number.isFinite(estimate?.confidence) ||
        estimate.confidence < 0 ||
        estimate.confidence > 1
      )
        throw Error("无效 provider confidence");
      confidence = estimate.confidence;
      chooseViseme(estimate.value, clamp(rms * 14, 0.15, 1));
      setBehavior(viseme === "REST" ? "listening" : "speaking");
    } catch (error) {
      stop();
      status("Audio provider: " + error.message, true);
    }
  }
  if (source === "text" && now >= textDeadline) {
    const next = textStream.queue.shift();
    if (next) {
      chooseViseme(next.value);
      textDeadline = now + next.duration;
    } else if (!textStream.buffer && !streamTimer) {
      chooseViseme("REST");
      setBehavior("idle");
      setSource("idle");
    }
  }
  if (source === "manual" && now > manualUntil) {
    chooseViseme("REST");
    setSource("idle");
  }
  runtime.options.autoBlink = $("#auto-blink").checked;
  runtime.options.idleMotion = $("#idle-motion").checked;
  const renderedFrame = runtime.update(now);
  audioLab.update(renderedFrame);
  mouthLab.update();
  $("#viseme-readout").textContent = renderedFrame.performance ? "CONTINUOUS" : viseme;
  $("#confidence").textContent =
    source === "microphone"
      ? `estimate ${Math.round(confidence * 100)}%`
      : source === "text"
        ? "TEXT HEURISTIC"
        : "—";
  const energy =
    renderedFrame.performance ? renderedFrame.performance.weights.jawOpen :
    source === "microphone" ? clamp(rms * 9) : viseme === "REST" ? 0 : 0.5;
  document
    .querySelectorAll("#meter i")
    .forEach(
      (el, i) =>
        (el.style.height =
          4 +
          energy * (8 + 22 * Math.abs(Math.sin(now / 120 + i * 0.9))) +
          "px"),
    );
  frameId = requestAnimationFrame(frame);
}
const localization = installLanguageSwitch();
frameId = requestAnimationFrame(frame);
window.addEventListener("pagehide", () => {
  localization.disconnect();
  cancelAnimationFrame(frameId);
  stop();
  runtime.dispose();
  audioLab.dispose();
});
