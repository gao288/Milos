# Avatar Framework · Milo Lab

可替换角色与动画引擎的框架，附带 Vite 演示页。Milo/Rive 和 Sprout/Canvas 是两个适配器示例，输入层与核心控制器不依赖特定模型。页面右侧可以实时切换两者，保留表情与嘴形。

## 界面语言与公开访问

界面默认英文。右上角 **中文 / English** 按钮立即切换，选择保存在浏览器的 `realpet.locale`；禁用本地存储时仍可切换。切换不重建角色或音频连接，不改动用户输入、聊天字幕、原始 JEV JSON 或语音语言。词典在 `src/i18n/catalog.js`，`src/i18n/index.js` 将既有命令式界面的文本节点与可访问性标签绑定到词典；新增动态文案应补充词典，用户/模型内容用 `data-i18n-ignore` 标记。

公开地址：**https://xufei-pc.tail110452.ts.net:10000/**。通过 Tailscale Funnel 提供 HTTPS，无需 Tailscale 账号、用户名或密码。任何访问者均可使用已配置的语音/模型服务，调用使用本机配置的 API 额度；当前语音服务仍有单会话并发限制。API key 保留在被 Git 忽略的 .env，不随构建发布。

公开入口指向本机 5180 上的构建版本；原来的 7443 开发入口及其他 Tailscale 服务保持不变。后续修改代码，必须重新构建才能更新公开页面：

```sh
npm run build
npm run serve:public   # 127.0.0.1:5180；另一个终端持续运行
tailscale funnel --bg --https=10000 http://127.0.0.1:5180
# 只关闭本应用的公开入口，不影响其他服务：
tailscale funnel --https=10000 off
```

当前构建服务在后台运行，日志 `/tmp/realpet-public.log`。Funnel 配置会保留，但机器重启后仍需启动页面、语音和模型进程，以及 Speech Engine 使用的回调隧道。该部署是公开试验环境。

验证：英文全界面/可访问性标签检查、刷新后的语言记忆、禁用 localStorage、手机布局，以及聊天中切换语言均通过。现有角色/音频回归加新增用例共 34 个浏览器用例通过（包含修复测试步骤后的定向重跑），48 个 Node 测试通过。通过公共 DNS 的 Funnel IP 验证 HTTPS 200、页面渲染、模型健康检查与 Speech Engine 短期会话接口；.env 和 Git 配置不会作为静态文件发布。

## GPT-Live 语音聊天与 JEV 情绪 v0.5

页面「和我聊聊」已接好 GPT-Live WebSocket 桥接、麦克风采集、PCM 播放、流式字幕、JEV 情绪和 UniTalker 分块嘴形。
已用本地测试 key 和中英文合成语音样本验证真实 GPT-Live 会话、输入／输出字幕、音频播放、JEV 情绪与 UniTalker 嘴形联动；两次浏览器实测均无 API 或页面错误。另有模拟回归测试。真实麦克风、扬声器回声与逐字同步精度仍需设备实测。本地 Codex harness 委派留作 P1，当前不会执行任务。

在已有 `.env` 中补充 `OPENAI_API_KEY`，保留已有 `JEV_API_KEY`。变量名称参考 `.env.example`；不要覆盖现有文件。Key 只由本地服务读取，不进入网页或 Git。

```sh
npm run voice:serve  # 终端 1：127.0.0.1:8788，读取 .env（更改后重启）
npm run model:serve  # 终端 2：127.0.0.1:8787，UniTalker 嘴形
npm run dev         # 终端 3：页面与本地 HTTP/WebSocket 代理
```

### 从另一台设备使用麦克风

浏览器不会在远程 IP 的普通 HTTP 页面上提供麦克风接口。本机使用 `http://localhost:5173`；通过 Tailscale 访问时使用 HTTPS 域名入口。
当前开发机已配置 `https://xufei-pc.tail110452.ts.net:7443/`，目标为本机 5173，访问设备需要连接到对应 Tailscale 网络。

其他机器可以在 `.env` 设置 `REALPET_ALLOWED_HOSTS=机器的完整域名`（多个域名用逗号分隔），再启用反向代理：

```sh
tailscale serve --bg --https=7443 http://127.0.0.1:5173
# 只关闭这个入口：tailscale serve --https=7443 off
```

使用命令返回的 HTTPS 链接，浏览器提示时允许麦克风。语音 WebSocket 自动使用同一入口的 WSS。

- GPT-Live：默认 `gpt-live-1` / `meridian`（男声），双向 16 kHz PCM16；可用 `GPT_LIVE_MODEL` / `GPT_LIVE_VOICE` 配置。会话开始前不上传麦克风数据，结束时释放麦克风、音频队列及动画，并等待服务端关闭确认。
- JEV：官方 `POST https://api.typesafe.ai/v1/systemone`，固定 `jev-1.13.0`（可用 `JEV_MODEL` 配置）。一次请求同时判断七种情绪（含 fear）、强度、头部倾斜和有意的点头/摇头。`score / 4` 才是强度，confidence 单独用于抑制低置信度切换。
- 头部倾斜是文本语义对应的动作建议，不是从音频学习得到的真实姿态预测。JEV 的倾斜建议限制在 ±0.3，置信度至少 0.5 才使用；以 1.8 秒临时叠加层平滑进入/退出，不覆盖手动滑块。点头/摇头要求置信度至少 0.65，间隔至少 6 秒。
- 静音嘴形：在实际播放时钟上计算 20ms 音量包络，使用开启/关闭双阈值（RMS 0.008/0.004）、短暂停顿保持和约 140ms 收口。低于阈值的音频不会让静息嘴形反复切换到说话曲线；纯静音窗口也跳过嘴形推理。很轻的耳语可能被阈值过滤，仍需不同声音的实机调参。
- 自然待机动作由本地 `NaturalMotion` 生成，不调用 JEV：随机间隔转头、歪头、停留、回正，加上呼吸和眨眼；说话和聆听时动作较小，鼠标跟随时暂让出自主视线。可通过「自然待机动作」开关关闭。
- 每 500ms 检查新增回复文本；分类时带上同一话语最近 8 秒的文本，并将零碎字幕合并为最多 12 个对话片段保留上下文。新增片段单独标记，仍只按新增片段的时间调度，不重播旧表情；遇到用户新一轮发言或较长停顿就切开语义窗口。最多一个 JEV 请求在途，没有新增文本时不重复收费调用。慢请求会降低实际更新频率；超时、失败或过期结果不会阻塞声音，失败后退避两秒。
- JEV 将安慰、同情和关切映射为 `sad`，不把单纯温柔视为开心，也不要求助手声称自己很悲伤。表情应用后至少保留 1.2 秒（新的有效情绪仍可覆盖），避免短字幕片段让表情一闪即逝。语音面板的「JEV 实时输出」直接显示七种候选表情、最新判定、强度/置信度、头部倾斜、动作和推理耗时，并单独显示语音最近应用的表情。展开可查看完整输出 JSON（`answers` 保留四个问题的 JEV 原始答案）和判断文本；低置信度结果也会显示，但不强制应用。仅保留内存中的最新结果，新会话会清空。
- 播放缓冲默认 **800ms**，可在连接前调为 200–1500ms。字幕和情绪保留 GPT-Live 的 `start_ms/end_ms`，以 AudioContext 时钟调度；嘴形按实际 PCM 样本对应的播放位置调度。音频与嘴形映射不依赖请求返回先后。
- **同步限制：** 官方文本时间戳仅为近似片段时间；输出音频没有时间戳，也没有 audio-done 事件。当前以收到 session.started 时的音频时钟估算会话起点，不能消除传输延迟与服务端时钟偏差，不能保证逐字同步。已验证片段级联动，仍需逐字测量与设备校准。JEV 低于 500ms 也不等于端到端表情延迟低于 500ms。
- UniTalker 每约 500ms 推理一次，带 400ms 左侧上下文、最长保留两秒音频；不是重新训练的流式模型，没有完整右侧上下文。迟到帧丢弃，声音不中断；服务不可用时显示提示，嘴形回到休息。新链路不做元音检测。
- 手动打断会清除排队音频、字幕及情绪，并以 `delegation_id: null` 的指令通知 GPT-Live 停止说话。麦克风连续约 180ms 超过能量阈值时，仅在助手有可听语音排队时清除本地播放；GPT-Live 自己处理双向语音打断，避免重复停止指令阻止正常回复。嘈杂环境与扬声器回声仍需实机调试。迟到推理不能恢复已打断的动作。切换角色可继续对话，启用其他输入模式会结束语音会话。

语音面板新增 **GPT-Live 原声 / ElevenLabs · 实验** 按钮，结束会话后切换，再点击开始聊天。

- ElevenLabs 模式保留 GPT-Live 的麦克风理解与回复文本，屏蔽其原声，将文本按短句重新合成为 ElevenLabs 声音；两个服务都会产生用量。这是分段配音实验，尚非独立的 ElevenLabs 对话代理，也不是音频直通替换。
- 在 `.env` 配置 `ELEVENLABS_API_KEY`、`ELEVENLABS_VOICE_ID`，可选 `ELEVENLABS_MODEL`（默认 `eleven_v4_turbo`，也接受 `eleven_v4`、`eleven_v3`），重启语音服务。音色必须对该 key 可用；真实账号可用性和听感需要实测。缺少配置会在申请麦克风前提示。
- 服务端 `/api/voice/eleven` 先用 JEV 判断本段情绪，高置信度时添加简短表演标签，再请求 ElevenLabs TTS。`sad` 使用轻度同情语气，不自动加入哭腔。标签是模型提示，遵循程度依赖音色；JEV 故障时沿用默认语气并提示。
- 每个短句完整合成、解码后播放，嘴形使用同一替换音频推理；字幕和表情按新音频的播放时钟安排。此模式的 JEV 更新按短句进行，不保证每 500ms；需等待文本成句、JEV、TTS 和最多 1.8 秒嘴形准备，延迟高于原声模式。打断/停止会取消合成并丢弃旧结果；合成失败会停止会话，不偷偷播放另一种音色。
- 单段文本最多 400 字符、音频最多 25 秒，队列有上限；key 仅在本地服务端使用。已用模拟音频验证切换、对齐及打断；已用真实凭据验证 Chris 男声（`iP95p4xoKVk53GoZ742B`）和 `eleven_v4_turbo` 的中英文短句合成，JEV 的 happy / sad 标签随请求传入，浏览器可解码为 16 kHz 非静音音频。完整双向对话的听感与延迟仍需实机体验；本地凭据仅存在被 Git 忽略的 `.env`。

表情概念稿：`design/expression-studies/follow-v1.png`，12 个变体含不安与惊恐；生成提示保存在同目录 `.prompt.txt`，使用内置 imagegen。已据此实现 Follow V2 的原生眼睑、瞳孔、眉形、情绪嘴与头部姿态；运行时和 JEV 已加入 `fear`。这是保留原角色几何的动画改编，并非概念图的逐像素复刻。实际原生渲染对照图为 `design/expression-studies/follow-v2-rendered.png`，可运行 `node scripts/render-follow-studies.mjs` 重建。

### Speech Engine 流式实验

第三个按钮 **Speech Engine · 实验** 使用 ElevenLabs 识别、TTS 和轮次/语音打断，独立的 OpenAI Responses 文本流负责回复，不生成 GPT-Live 原声。默认 `gpt-5.6-luna`（reasoning none）→ `eleven_v4_turbo` / Chris；可在 .env 更换模型和识别语言（默认 zh）。中英混说的识别准确率仍需设备实测。

- 私有的 `POST /api/voice/speech-engine` 需要本地 token，返回短期签名 URL。浏览器接收 ElevenLabs WebSocket 的 PCM16 / 16 kHz 音频，API key 不进入网页。
- 字幕优先使用音频包的字符对齐；JEV 每 500ms 检查即将播放的新增文字，嘴形根据同一时钟滚动推理。缺少字符对齐时使用回复文本作为片段级备用，不保证逐字同步。
- 合成可以快于播放：待播队列有一分钟上限，只将近期要播放的 PCM 送入 UniTalker，避免提前覆盖尚未播放的嘴形窗口。JEV 和嘴形都不阻塞语音。
- Speech Engine 默认开口缓冲为 **300ms**，每种模式分别保留滑块值。同一轮只在首包缓冲，后续音频直接续接；网络确实断粮时仅留 20ms 调度余量，不重新等待完整缓冲。字幕/嘴形仍使用实际播放时间，音频中的自然停顿不被裁掉。同步优先时可调大缓冲。
- 轮次结束判断使用 `turnEagerness: eager`，更快接话，也可能更早认为用户已说完；保留 `speculativeTurn: false`。修改配置后新会话生效。`turnTimeout` 是等待用户回应后再次提示的时间，不用它来假装加速首句。
- 语音打断由 Speech Engine 处理，新 transcript 取消上一轮 LLM 请求；客户端清除待播音频、字幕、表情和过期事件。手动「打断播放」静音本轮，下一次用户开口恢复；结束聊天关闭连接并释放麦克风。
- 独立端口 8789 只接受 `/speech-engine` WebSocket，官方 SDK 验证 ElevenLabs JWT；其他 HTTP 路径均为 404。需要公网 WSS 回调，不能填写 tailnet-only 页面地址。回调入口没有网页、健康检查、签名 URL 或密钥接口。
- 实验资源不录音、一天后清理 transcript/PII，每次会话最多 10 分钟、并发 1。这不是零保留承诺；文字经过 OpenAI/JEV，语音经过 ElevenLabs，各服务均有用量。

已有 .env 配好 ElevenLabs / OpenAI key 和 voice ID 后，在独立终端启动临时回调隧道：

```sh
cloudflared tunnel --config /dev/null --url http://127.0.0.1:8789 --no-autoupdate
# 将返回的临时域名填入 .env：
# SPEECH_ENGINE_CALLBACK_URL=wss://<临时域名>/speech-engine
npm run speech-engine:setup
npm run voice:serve
```

setup 首次创建资源，随后只更新 .env 指定的实验资源，将 ID/回调保存到被 Git 忽略的 .env。普通服务器重启不修改远端资源。临时隧道重建后域名会变，需要重新 setup；这不是常驻生产部署。网页仍使用原来的 Tailscale HTTPS 入口，不修改已有服务。

验证：48 个 Node 测试、12 个语音浏览器测试及生产构建通过。真实账号已用中英文音频样本跑通识别 → 文本流 → 分块语音 → 字幕/JEV/UniTalker；通过现有 HTTPS 页面验证两轮英语对话和一次语音插话，收到 interruption/response correction 后仍能继续回复。字幕隐藏跨包的音频表演标签，JEV 保留它们作为语气上下文。新增回归复现了后续包重补缓冲造成的 520ms 人为空隙；修复后同一输入的调度空隙为 0，真实 HTTPS 样本 15 个包也全部连续调度。该样本从输入音频结束到首包开始播放仍约 3 秒，包含上游与本地延迟，单次测量不是性能基准。中文样本存在识别错误；真实麦克风、回声环境、主观音质仍需设备体验。

实现：`server/speech-engine.mjs`（认证回调与流式 LLM）、`src/voice/speech-engine.js`（播放/对齐适配）、`scripts/setup-speech-engine.mjs`（资源配置）。官方参考：[Speech Engine quickstart](https://elevenlabs.io/docs/eleven-api/guides/cookbooks/speech-engine)、[WebSocket 事件](https://elevenlabs.io/docs/eleven-agents/libraries/web-sockets)。

可替换组件：`server/jev.mjs`（情绪 provider）、`server/voice.mjs`（语音连接与 P1 委派占位）、`src/voice/controller.js`（编排）、`src/voice/timeline.js`（播放与动作时间线）。头像仍消费 `expression` 与 `arkit-52-v1`，不依赖供应商 API。

本地接口：`GET /api/voice/health` 返回配置状态和本次服务的临时 token；`POST /api/voice/emotion` 需要 `X-Realpet-Token`；`WS /api/voice/live?token=…` 只转发受限的音频与控制事件。API key 不通过这些接口返回。

官方参考：[GPT-Live WebSocket](https://developers.openai.com/api/docs/guides/voice-websockets)、[字幕与会话时间](https://developers.openai.com/api/docs/guides/live-conversations)、[JEV API](https://docs.typesafe.ai/api)、[JEV 模型](https://docs.typesafe.ai/models)。

## 音频驱动面部参数 v0.4

新增 **真实 UniTalker ONNX 推理 → 带时间戳的面部曲线 → Rive / Canvas** 链路。
页面「让声音直接驱动表情」可加载 0.1–60 秒音频，也有中英文合成语音用于测试。
点击生成后，通过播放器播放、暂停和拖动进度。动画以播放器 `currentTime` 为时钟，
不会按网络响应速度播放。模型在本机 Python 服务运行，音频不发往外部服务。

```sh
npm run model:setup  # 需要 uv；创建独立 Python 3.11 环境，下载并校验 371 MiB ONNX 权重
npm run model:serve  # 终端 1：127.0.0.1:8787，默认 CUDA，不能用时 ORT 回退 CPU
npm run dev         # 终端 2：http://localhost:5173，代理本地模型接口
```

CPU 模式可用 `REALPET_MODEL_DEVICE=cpu npm run model:serve`。默认安装 GPU 依赖需要数 GB 磁盘空间。
模型未启动时，原有角色、元音估计与导入曲线回放仍可用。

### 此次实现的范围

- 使用 **dlp3d-ai/audio2face 发布的 UniTalker v0.4.0 ONNX 检查点**，不是 NVIDIA Audio2Face，也没有重新训练模型。
- 模型输出 51 通道；适配为 `arkit-52-v1` 命名协议，缺失的 `tongueOut` 为 0。这里采用 ARKit 风格名称和 0–1 权重，不能视为所有来源都已经完成相同标定。
- **模型链路不做元音分类**。连续嘴形直接覆盖旧 viseme 的嘴部开合；只有静音幅度门限用于抑制无声时嘴部漂移。
- 此音频实验面板是**音频片段先推理、再同步播放**；上方 v0.5 语音聊天另有分块嘴形链路。下方旧文本／麦克风面板仍是启发式备用路径。
- 中英文示例用本地 eSpeak NG 合成，只用于验证输入、推理、同步链路，不代表真人语音或准确率评测。
- Milo 映射嘴部开合、收圆、拉伸，以及部分眉眼／脸颊；Sprout 映射嘴部开合和宽度。Follow 也已映射连续嘴形及部分眉眼／脸颊；Classic 尚未映射模型输出。**角色不是完整的 52 通道 rig**，切换模型与角色仍需要对应适配。
- 默认模型表情参与度为 0：模型控制发音，JEV 保留情绪意图。滑块可叠加模型眉眼和嘴角；模型固定 neutral conditioning，没有做语义情绪识别。
- 没有实现视频提取数据集或模型训练。本轮先验证现成模型及动画协议。

### 连续面部协议

```js
import { PerformanceTimeline } from "./src/framework/index.js";
const timeline = new PerformanceTimeline({
  schema: "arkit-52-v1",
  durationMs: 1000,
  frames: [
    { timeMs: 0, weights: { jawOpen: 0 } },
    { timeMs: 500, weights: { jawOpen: 0.6, mouthPucker: 0.3 } },
    { timeMs: 1000, weights: { jawOpen: 0 } },
  ],
});
runtime.setPerformance(timeline, () => audioElement.currentTime * 1000,
  { upperFaceWeight: 0 });
```

每帧为完整快照，未提供的通道为 0；时间戳严格递增，非法包整包拒绝。
时间线支持插值、暂停、向后 seek 和状态保留。未结束的流断更后先保持 100ms，
再用 120ms 淡出；最大 18000 帧，长期会话应按音频片段新建时间线。
`AvatarFrame.version` 仍为 1，新增可选 `performance` 字段，旧 renderer 可忽略。
`stop` 清理模型驱动并保留 JEV 情绪；更换 renderer 不会清理曲线或音频时钟。

外部 TTS / WebSocket 桥接可直接追加曲线，不需要经过元音接口：

```js
const stream = window.avatar.performance.beginStream(
  () => audioElement.currentTime * 1000,
  { upperFaceWeight: 0.2 },
);
stream.append(packet.frames); // timeMs 必须相对同一段音频起点
stream.finish(audioDurationMs);
// stream.stop();
```

`window.avatar.performance.loadClip(clip)` 把曲线交给页面播放器；需先选择对应音频。
也可在页面导入／导出 JSON。替换音频模型时实现
`window.avatar.performance.setAudioProvider({label, health, infer})`：
`health()` 返回 `{loaded, device}`；`infer(wavBlob, abortSignal)` 接收单声道 16kHz PCM WAV，
返回 `{schema, durationMs, frames}`，可附加 `provider/device/inferenceMs`。
每个来源自行处理通道命名、缩放与中性值；框架负责校验和时间插值。

服务端只接受 16kHz、单声道、16-bit PCM WAV，浏览器先解码并重采样，随后播放同一份 WAV。
长片段按 4 秒块推理，每块带 400ms 前后文，限制模型 attention 内存；这是分块离线策略，
并非已验证的低延迟实时算法。`GET /api/model/health` 可查看实际设备，
`POST /api/model/infer` 接收 WAV 二进制，返回标准曲线。接口出错会明确失败，不生成伪造曲线。

验证命令：`npm test`、`npm run test:model`、`npm run test:browser`、`npm run build`。
模型、来源、权重校验与测试音频说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 表情升级版 v0.3

默认 Milo 已换成更细的原生 Rive 面部 rig。下拉框的 **Milo Classic** 保留原版供对比，**Sprout** 继续用于验证跨渲染器协议。

- 三个原生状态机层：Emotional pose（表情）、Saccades and settling（眼部微扫视/瞳孔和头部微动）、Attention（idle/listening/speaking 姿态）。
- 六种表情同时变形眉形、上下眼睑、脸颊/笑纹、鼻部紧张、嘴角和唇线；眼球与高光裁剪在眼睑轮廓内。
- 嘴部包含唇部轮廓、口腔、被裁剪的牙齿与舌头。情绪静息嘴形在 Rive 中原生动画化；说话嘴形独立混合，避免改变情绪时覆盖音素。
- 五组复合预设：温柔微笑、开怀大笑、半信半疑、担心你、有点困了；可以点击“表情演示”循环预览。
- 十个 0–1 面部微调：左右抬眉、左右眯眼、睁眼、提脸颊、嘴角上提/下压、张颌、鼻部紧张。该通道与表情、嘴形分开平滑，切换 renderer 时保留。

```js
window.avatar.applyPreset("skeptical");
window.avatar.dispatch({
  type: "face",
  values: { browRaiseLeft: 0.5, squintRight: 0.3, jawOpen: 0.15 },
});
window.avatar.dispatch({ type: "viseme", value: "U", durationMs: 150 });
```

`face` 是稀疏更新，只修改传入字段。`stop` 保留面部叠加，页面“清除面部叠加”或全局重置会清零。左右按画面方向定义。新 renderer 可以选择支持这些可选通道；Classic 和 Sprout 目前忽略它们。它们是艺术控制参数，并非经过标定的 FACS 单元。

在 Rive 编辑器里，视图模型 `Avatar` 的 `emotion`（0–5）和 `intensity`（0–1）直接控制原生六种表情，不需要 Web 脚本。`liveliness=0` 关闭原生微动作；`behavior=0/1/2` 切换注意力层。嘴形使用 `restWeight` / `speechWeight`（和为 1），加上 `mouthWidth` / `mouthHeight`；静息时使用 1/0，说话时使用 0/1。复合预设和 `face` 归一化参数通过 `milo-signals.js` 映射到 rig 单位，复现复合预设时需要该适配层或手动设置对应视图模型值。

登录和导出编辑器文件：

```sh
npm run rive:login   # 在运行项目的机器上完成浏览器登录
npm run rive:export  # 写入 public/milo.rev，不上传到任何 Rive 项目
```

已于 2026-10-01 完成 CLI 登录并导出 `public/milo.rev`，可导入 Rive Editor。修改 RML 后需重新运行导出命令。若以后在远程机器重新登录，OAuth 回调的 127.0.0.1 端口需要转发到浏览器所在机器，或直接在项目机器浏览器完成登录。测试覆盖不依赖 Web 求解器的原生 Rive 笑脸、面部叠加与嘴形独立、Classic/Canvas 往返切换。

## 运行

### Marketplace Follow：可编辑表情与嘴形

网页默认使用升级后的 Follow；也可打开 http://localhost:5173/?character=follow。
基于 [alinazari 的 Interactive Character Follow](https://rive.app/marketplace/28334-53514-interactive-character-follow/)
和用户提供的 [可编辑副本](https://editor.rive.app/file/Interactive-Character-Follow/2624622)。

- 保留黑白造型、原生左右转头与上下跟随；表情和嘴形属于原始面部层，随头部运动。
- `Follow` 画板 / `State Machine 1` / `FollowFace` View Model。
- V2 使用 neutral / happy / sad / curious / surprised / angry / fear 七种原生状态，320ms 转换；数值索引依次为 0–6，前六个保持兼容。
  `intensity=0` 为放松基准，`0.5` 为温和表情，`1` 为强烈表情。happy、sad、surprised、angry、fear 有独立中间造型，共 12 个原生造型。
  例如 `sad + .5` 是关切，`sad + 1` 是难过；`fear + .5` 是不安，`fear + 1` 是惊恐。
  上下眼睑使用独立曲线并裁剪瞳孔；瞳孔大小、高光、眉形、情绪嘴和头部姿态一同变化。原始跟随动画仍保留。
- 在角色选择器切换 **Follow V2 / Follow Classic** 可实时对比；Classic 是 checkpoint `5853e28` 的运行资源和编辑器导出，不随 V2 构建覆盖。
  Classic 无原生恐惧状态，会把 `fear` 映射为旧版惊讶；其他未支持 fear 的 renderer 使用各自 fallback。
  UI 的 12 个按钮来自 `src/characters/follow-presets.js`；Follow 预设不写入 jawOpen，保持音频口型独立。
  控制接口仍是 `{"type":"expression","emotion":"fear","intensity":0.8}`，不依赖 JEV，也不新增模型专用字段。
- 连续语音几何由八个三次 Bézier 控制点构成：两侧嘴角、上唇左／中／右、下唇左／中／右。
  27 个嘴部通道直接映射到曲线位置与切线，不再合并成嘴宽／嘴高。
  独立 `restWeight / speechWeight` 混合情绪嘴和说话嘴。
- 下颌骨骼通过 Skin / CubicWeight 叠加在原有转头动画上，带动下巴轮廓和颈部阴影。
  上牙固定，下牙与舌头随下颌运动；三个形状均裁剪到同一个嘴腔。
- 支持十个框架面部微调参数、手动眨眼、头部倾斜、点头、微动作；保留原生眨眼动画，
  `nativeBlink=1` 可在 Editor 使用。网页设为 0，由框架统一管理自动／手动眨眼。
- 支持现有中英文模型音频、连续参数流、文本与备用元音输入。模型与动画无需互相依赖，
  但当前是部分通道映射，尚非完整 52 通道面部绑定；Follow 没有单独的行为姿态动画。
- Rive 的 `pointerGaze` 连接沿用原生监听器，接收归一化 motion 坐标。
- 作者与 CC BY 4.0 归属保留在网页和第三方声明中。

源工程为 `rive-follow/scene.rml`，未改动的导入源备份为 `rive-follow/source/original.xml`。
`src/assets/interactive-follow.riv` 也保留原始 Marketplace 运行文件。
生成器从备份重建扩展工程：**重新生成会覆盖手工编辑过的 scene.rml**；从 Editor 拉回的修改应先备份。

```sh
npm run rive:follow:build   # 生成、校验、检查并更新本地 .riv
npm run rive:follow:export  # 已登录 CLI 导出 public/follow-expressive.rev
# 下面的命令更新账号里的副本，并创建 revision history 条目：
bash scripts/rive-cli.sh push rive-follow --name="Follow expressions and continuous speech"
```

`public/follow-expressive.rev` 可导入 Rive Editor，`.riv` 为网页运行文件。当前 V2 的 `.rev` 导出等待 Rive CLI 重新登录；现有该文件仍是升级前版本，不应当作 V2。`public/follow-classic.rev` 固定保留升级前工程；V2 的可编辑本地源码是 `rive-follow/scene.rml`，重新登录后运行 export 命令即可导出。

需要回退时优先在网页切换 Follow Classic。代码级回退可以针对本次升级提交执行 `git revert <升级提交>`，会保留先前语音、JEV、ElevenLabs 功能；不要对整个仓库使用 hard reset。
在 Editor 选 `Follow` 画板、运行状态机，通过 `FollowFace` 的 `emotion=0..5`、
`intensity=0..1` 测试表情；嘴形测试设 `restWeight=0`、`speechWeight=1`。
新版 Follow 用控制点替换了旧的内部 `mouthWidth / mouthHeight` 绑定，公共 AvatarFrame 协议保持不变：

| 参数／通道 | 驱动部位 |
| --- | --- |
| `mouthUpperUpLeft/Right`, `mouthLowerDownLeft/Right` | 左右上下唇分别升降 |
| `mouthSmile/Frown/Stretch/Dimple` + `Left/Right` | 两侧嘴角分别上提、下压、拉伸、收紧 |
| `mouthRollUpper/Lower`, `mouthShrugUpper/Lower` | 上下唇分别内卷与上提 |
| `mouthPucker`, `mouthFunnel` | 撅嘴收拢与漏斗形张开，独立计算 |
| `mouthClose`, `mouthPressLeft/Right` | 双唇接触与单侧压紧，保留下颌姿态 |
| `jawOpen/Left/Right/Forward`, `mouthLeft/Right` | 下颌、下牙及嘴部位置 |

这些 0–1 语义通道通过 `follow-mouth.js` 映射为 Rive 的角色局部坐标。
`cornerLeft/Right`、`upperLeft/Center/Right`、`lowerLeft/Center/Right` 各自暴露
`X/Y/InRotation/InDistance/OutRotation/OutDistance`，可在 Editor 调整点和切线。
`jawX/Y/Scale` 驱动原生下颌骨骼。无需新增模型或重新训练。

网页展开 **「嘴部曲线实验 · 27 个独立通道」**，即可直接调节语义通道。
调节会停止原语音并使用同一条 performance 协议；播放新音频会接管。
测试清零按钮只结束自己的控制，不会打断后来开始的音频／参数流。

曲线成对约束上下唇的位置，完整闭唇时两条边界重合。淡出采用 Bézier 控制向量插值，
避免角度跨越 ±π 时翻折。400 组确定性极端输入及淡出测试检查曲线不交叉。
原生状态机仍负责情绪，嘴部通道不受 `upperFaceWeight` 开关影响；该开关对 Follow 仅控制眉眼和脸颊。

这是为黑白 2D 角色标定的形变映射，前伸用轻微投影缩放表达，不代表真实 3D 位移；
左右沿用网页画面方向约定，接入其他捕捉系统时需确认镜像设置。
模型输出中仍没有舌头通道，舌头位置随下颌推算；并非完整的牙齿／舌头发音模拟。

```js
await window.avatar.setCharacter("follow");
window.avatar.dispatch({ type: "expression", emotion: "happy", intensity: .8 });
window.avatar.dispatch({ type: "motion", gazeX: .8, gazeY: -.3 });
// 连续语音使用上文的 performance.beginStream / loadClip 接口。
```

### 开发服务

```sh
npm install
npm run dev
```

打开 http://localhost:5173 。麦克风需要 localhost 或 HTTPS。所有动画、WASM 和字体从本地项目加载；麦克风备用路径在浏览器分析；Audio → Face 面板将音频发送给本机模型服务进行推理。

```sh
npm run build
npm test
npm run test:browser
```

浏览器测试需先运行 `npx playwright install chromium`。覆盖 Rive 实际画面变化、文本流与情绪同时运行、尾部 flush、非法事件、手机布局、拒绝麦克风和停止后释放音轨。浏览器使用模拟麦克风；高级音频约束不被设备支持时会退回基础音频输入。声学算法只做合成频谱测试，尚无真实中英语音准确率评测。

## 框架边界

```text
JEV / SSE / WebSocket ── expression / behavior / motion / gesture ─┐
音频模型 / 文本 provider ── viseme + weight + duration ────────────┤
                                                                ▼
                       AvatarRuntime → AvatarFrame（归一化）
                                        ├─ RiveAdapter + 角色 rig
                                        ├─ OrbAdapter（Canvas 示例）
                                        └─ 后续自定义 renderer
```

- `src/framework/contract.js`：预定义状态、嘴形、事件验证，可传入自己的 contract。
- `src/framework/runtime.js`：状态、行为转换规则、嘴形混合、参数平滑、眨眼与 renderer 生命周期。无 DOM、Rive 或语音库依赖，可在 Node 中测试。
- `src/framework/index.d.ts`：事件、帧、renderer、provider 的类型接口。
- `src/adapters/`：渲染后端。替换引擎时实现 `mount(host, contract)`、`render(frame)`、`dispose()`。
- `src/characters/milo.js`：Milo 的资源路径、状态编号和属性映射；`milo-signals.js` 负责面部通道与口腔几何求解。替换兼容 Rive 角色时调整配置即可。
- `src/providers/heuristics.js`：可替换的文本/频谱嘴形估计与文本分块缓冲。
- `src/main.js`：演示 UI、浏览器麦克风与文本调度、注册角色和外部事件桥接。

当前是可复用源码模块，还没有发布独立 npm 包。任意新资源都需要实现这份协议或提供映射；不是把不兼容模型文件改名就能自动适配。

## 通用状态与嘴形协议

| 通道       | 默认名称 / 范围                                                    |
| ---------- | ------------------------------------------------------------------ |
| expression | neutral / happy / sad / curious / surprised / angry，intensity 0–1 |
| behavior   | idle / listening / speaking                                        |
| mouth      | REST / A / E / I / O / U / V（ü）/ M，weight 0–1                   |
| motion     | gazeX / gazeY / headTilt：-1–1                                     |
| gesture    | blink / nod / shake                                                        |

motion 不带 `durationMs` 时更新手动基础姿态；带 `durationMs` 时是临时叠加姿态，到期平滑回到基础姿态。例：`dispatch({type: "motion", headTilt: .25, durationMs: 1800})`。临时层、待机层与基础姿态合成后限制在 -1–1。`gesture: nod` 在竖直转头通道上点头，`shake` 在水平通道上摇头。

`AvatarFrame` 的嘴形输出是包含 REST 的权重字典，总和为 1，切换时逐渐混合。像素尺寸、骨骼名称、Rive 数字编号都属于 adapter/rig。`durationMs` 为收到事件后的相对时长；省略则保持到下一条嘴形事件，设为 0 则下一帧恢复 REST。当前没有绝对音频时间轴调度器，TTS/语音服务应在音频时钟到达时发送对应事件。

表情与嘴形是独立通道，表情事件不会关闭嘴形。`stop` 清空嘴形并恢复初始行为，保留表情。核心默认允许任意行为转换，可在 contract.transitions 中限制；stop 是无条件中断。具体表情间动画过渡由渲染适配器实现：Milo 为原生 Rive 状态转换，Sprout 为连续参数插值。

```js
import { AvatarRuntime, DEFAULT_CONTRACT } from "./src/framework/index.js";
import { RiveAdapter } from "./src/adapters/rive.js";
import { milo } from "./src/characters/milo.js";

const runtime = new AvatarRuntime({
  contract: {
    ...DEFAULT_CONTRACT,
    behaviors: ["idle", "listening", "speaking", "thinking"],
    transitions: {
      idle: ["listening", "thinking"],
      listening: ["thinking", "idle"],
      thinking: ["speaking", "idle"],
      speaking: ["listening", "idle"],
    },
  },
});
// host 是具有 position:relative 和明确宽高的 DOM 容器。
await runtime.setRenderer(new RiveAdapter(milo), host);
runtime.dispatch({ type: "expression", emotion: "happy", intensity: 0.8 });
runtime.dispatch({ type: "viseme", value: "A", weight: 0.9, durationMs: 120 });
let raf;
function tick(now) {
  runtime.update(now);
  raf = requestAnimationFrame(tick);
}
raf = requestAnimationFrame(tick);
// 卸载时：cancelAnimationFrame(raf); runtime.dispose();
```

`setRenderer()` 成功返回 true；被更新请求取代返回 false；加载失败抛异常并保留旧 renderer。每次调用传入新 adapter 实例。`dispose()` 必须幂等，并取消未完成的加载。每次 render 收到独立帧快照，可读取但不应修改。

## 换角色、动画或检测模型

同引擎的新 Rive 角色：复制 `milo.js`，配置 `src`、`stateMachine`、expressions、visemes 和 bindings。未映射的表情/嘴形用角色配置的 fallback；缺少必需 view-model 属性或状态机时加载失败并保留旧角色。Milo 当前使用 number 类型 view-model 属性，其他形式的数据绑定需要扩展 RiveAdapter。

```js
// 在应用模块中导入 RiveAdapter 和你的 rig 后注册：
window.avatar.registerCharacter("new-character", {
  name: "New character",
  create: () => new RiveAdapter(myRig),
});
await window.avatar.setCharacter("new-character");
// 内置示例可直接切换：
await window.avatar.setCharacter("orb");
await window.avatar.setCharacter("milo");
```

换动画引擎：实现 renderer 三个生命周期方法，按 `AvatarFrame` 把参数映射到自己的动画/骨骼/形状。无需改动输入事件、核心控制器或语音识别。

换检测模型：demo 支持 `window.avatar.setProviders({textToVisemes, estimateVowel})`，可以只覆盖一个函数；两者均为同步接口，函数签名见 `InputProviders`。切换 provider 会停止旧输入和清空队列。异步模型/SSE 则在结果到达后调用 `dispatch({type:'viseme', ...})`，不必使用默认估计器。核心不依赖这些估计器，也不依赖 JEV。

## 加载故障处理

页面需要持续运行的开发服务器：`npm run dev`，然后打开终端显示的 URL。Rive 主 WASM 和兼容 WASM 均随项目打包，不依赖第三方 CDN。动画也通过 Vite 资源导入，生产构建使用内容哈希。

如果动画下载失败，画面会显示实际原因（例如 HTTP 503、返回 HTML 或缺少绑定），并提供 **Retry animation**。连接恢复后直接重试；已有可用角色时，替换加载失败会保留当前角色。

## 动画文件

- `src/assets/milo.riv`：网页导入的动画源文件，构建时生成带内容哈希的资源 URL，避免旧动画缓存与新参数映射混用。
- `public/milo.riv`：可直接下载的同版本副本；`npm run rive:build` 同时更新两个位置。
- `rive/scene.rml`：可编辑 Rive 源文件，包含图形、视图模型和原生状态机。
- `scripts/generate_rive.py`：重新生成 RML 的源程序。修改 RML 后再运行它会覆盖手工编辑。
- `scripts/build-rive.sh`：编译 RML 并复制运行文件。

Rive CLI 1.2.0 安装在 `.tools/rive`；Linux GLES 依赖在 `.tools/libs`，均不应提交版本库。也可以用 `RIVE_CLI=/path/to/rive npm run rive:build` 指定已安装的 CLI。

```sh
python3 scripts/generate_rive.py  # 仅需要重新生成图形时运行
npm run rive:build
```

`.riv` 是运行文件；`.rev` 是编辑器交接文件。目前已提供 RML、可播放的 `.riv` 和通过 Rive CLI 正式导出的 `public/milo.rev`。导出 `.rev` 需要有效登录会话；重新登录及导出可执行：

```sh
export LD_LIBRARY_PATH="$PWD/.tools/libs/usr/lib/x86_64-linux-gnu:${LD_LIBRARY_PATH:-}"
.tools/rive/bin/rive login
.tools/rive/bin/rive rive --once --rev=milo.rev
```

原生动画没有 Luau 脚本，本地 `.riv` 不需要脚本签名。参考 https://rive.app/docs/cli/overview 及本地 CLI `docs/publishing.md`。

## 状态与参数

`ExpressionMachine` 是真正的 Rive 状态机：neutral / happy / sad / curious / surprised / angry 六个状态，每个状态按 `intensity` 在中性和目标姿态之间混合，任意两种表情间进行 360ms 带缓动的原生转换。

网页的 Smoothing 控制参数插值时间尺度，原生状态切换固定 360ms。表情驱动眉毛角度/高度、眼睛形状和脸颊；嘴形、眨眼、视线不被表情动画覆盖。idle/listening/speaking 是框架的独立行为通道。新版 Milo 通过原生 Attention 层绑定该通道；Sprout 用它改变额头指示灯。其他 Rive 文件可通过 rig.behaviors 和可选 behavior binding 绑定。

| Rive Avatar view model   | 值                  |
| ------------------------ | ------------------- |
| emotion                  | 0–5，按上述表情顺序 |
| intensity                | 0–1                 |
| gazeX / gazeY            | 瞳孔位置，像素      |
| headTilt                 | 头部旋转，弧度      |
| breath                   | 身体纵向微动，像素  |
| eyeOpen                  | 0.04–1              |
| mouthWidth / mouthHeight | 嘴形宽高，像素      |
| restWeight / speechWeight | 静息/说话嘴部权重，和为 1 |
| jawScale / jawShift / chinY | 手动张颌比例、下颌偏移与下巴坐标 |
| teethVisible | 说话牙齿可见度，0–1 |

## JEV 接入

GPT-Live 面板已通过本地 `server/jev.mjs` 接入 JEV，密钥只留在服务端。下列归一化 API 也可以由其他 WebSocket / SSE 客户端调用，角色和动画不依赖 JEV 的响应格式。

```js
window.avatar.dispatch({
  type: "expression",
  emotion: "happy",
  intensity: 0.9,
});
window.avatar.dispatch({
  type: "motion",
  gazeX: 0.3,
  gazeY: -0.2,
  headTilt: 0.1,
});
window.avatar.pushText("Hello! ", false);
window.avatar.pushText("你好，世界。", true); // final=true 刷新最后一块
window.avatar.dispatch({
  type: "viseme",
  value: "A",
  weight: 0.9,
  durationMs: 600,
});
window.avatar.stop();
window.avatar.getState();
```

motion 参数为 -1–1，映射到 Rive 的像素/弧度。外部事件验证失败会抛异常，调用方应捕获。表情事件不打断语音；选择手动嘴形或更换输入源会停止已有输入。文本缓冲在边界或 final 时输出，350ms 无新块时自动 flush；生产流建议显式 final，以避免跨块英文单词过早切分。

## 嘴形能力与边界

以下为保留的**启发式备用路径**；上方 Audio → Face 面板使用真实模型与音频时钟。

- A / E / I / O / U / Ü / M / REST；中文普通话用 pinyin-pro 转拼音，再映射嘴形。
- 英文仅按拼写字母估计，尚非词典/G2P 发音；中文多音字准确率依赖词典，不覆盖方言。
- 文本演示按固定嘴形时长播放，不代表真实音频时间戳。浏览器朗读仅作试听，与嘴形使用独立时钟；中英混读质量依赖系统声音。
- 麦克风用 RMS 做静音门限、频谱双峰估计元音。这不是训练过的音素识别器，也不是可靠共振峰跟踪；噪音、音高、说话人变化可能导致误判，界面的 estimate 不是校准后的概率。
- 流式 TTS 可通过新的 performance 时间线提供连续参数；也可继续用带时间戳的音素/viseme。实际流式 TTS 连接仍需后续实现。
- 当前为风格化矢量人物，不是照片级真实人脸；可继续增加下颌、唇部、眼睑和头部姿态的细分控制。
