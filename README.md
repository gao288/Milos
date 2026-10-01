# Avatar Framework · Milo Lab

可替换角色与动画引擎的框架，附带 Vite 演示页。Milo/Rive 和 Sprout/Canvas 是两个适配器示例，输入层与核心控制器不依赖特定模型。页面右侧可以实时切换两者，保留表情与嘴形。

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
- 目前是**音频片段先推理、再同步播放**。已有追加曲线和外部音频时钟接口，但尚未接入流式 TTS 或实时麦克风模型推理。下方旧文本／麦克风面板仍是启发式备用路径。
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
- 新增 neutral / happy / sad / curious / surprised / angry 六种原生状态，280ms 转换；
  `intensity` 在中性和目标状态之间混合。眉毛、眼睑、嘴部和脸颊一起变化。
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

`public/follow-expressive.rev` 可导入 Rive Editor，`.riv` 为网页运行文件。
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
| gesture    | blink / nod                                                        |

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

目前尚未确定 JEV 的具体产品/协议，因此提供通用适配入口，未连接外部模型。下列 API 可由后续 WebSocket / SSE 客户端调用；本项目不包含远程连接后端。

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
