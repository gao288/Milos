# Framework and animation guide

## Runtime contract

`AvatarRuntime` has no DOM, Rive, or voice SDK dependency. It validates events, handles behavior transitions, smooths parameters, blends mouth states, and produces an `AvatarFrame`. Pixel coordinates, bones, and provider tensor indices belong in adapters, not in this contract.

| Event | Fields / values |
| --- | --- |
| `expression` | `emotion`: neutral, happy, sad, curious, surprised, angry, fear; `intensity`: 0–1 |
| `behavior` | `state`: idle, listening, speaking |
| `motion` | `gazeX`, `gazeY`, `headTilt`: −1–1; optional `durationMs` |
| `gesture` | `name`: blink, nod, shake |
| `viseme` | `value`: REST, A, E, I, O, U, V (ü), M; `weight`: 0–1; optional `durationMs` |
| `face` | `values`: normalized character-facing controls; see the type declarations |
| `stop` | Clear active mouth input and restore initial behavior while retaining expression |

A motion event without a duration changes the base pose. A timed event is a temporary overlay that eases back to the base. Idle motion and gestures compose with it. Expressions and mouth performance remain independent.

The exported `DEFAULT_CONTRACT` can be extended with behaviors and allowed transitions. Event validation throws on invalid input. See [index.d.ts](../src/framework/index.d.ts) for the full interface.

## Continuous performance

`PerformanceTimeline` consumes `arkit-52-v1` clips: `{ schema, durationMs, frames }`, where each frame has `timeMs` and a named `weights` dictionary. Weights range from 0 to 1, timestamps must strictly increase, and omitted channels are zero rather than retained from the previous frame. Use `runtime.setPerformance(timeline, readTimeMs, options)` to sample against the audio playback clock, then continue calling `runtime.update(now)` from the render loop.

The default `upperFaceWeight: 0` leaves deliberate upper-face emotion to the expression controller. Mouth channels remain active. UniTalker's tensor-to-name conversion happens in the provider; its missing `tongueOut` output is zero-filled. A new model must explicitly map and calibrate its outputs into this schema. Shared names alone do not guarantee a good visual match.

In the demo, `window.avatar.performance.beginStream(readTimeMs, options)` returns `append`, `finish`, and `stop` controls. An audio provider can be replaced through `window.avatar.performance.setAudioProvider({ label, health, infer })`. Consult the declarations and existing audio provider for exact signatures.

The Follow mouth solver maps 27 continuous channels to eight cubic lip vertices and their tangent handles, with separate jaw, teeth, and tongue geometry. Upper and lower curves are constrained to maintain lip contact. This is a stylized 2D mapping: forward motion is approximated with projection, and tongue motion is inferred from the jaw. Confirm mirror conventions when integrating a new capture system.

## Replacing a character or renderer

For the Follow V2 monochrome preview and local task/voice event demonstrations,
see [1-bit device preview](device-preview.md). It samples the existing renderer;
it does not change the shared avatar or audio protocol.

A renderer implements:

```js
class MyRenderer {
  async mount(host, contract) { /* load assets and prepare the surface */ }
  render(frame) { /* map the normalized frame to this character */ }
  dispose() { /* cancel loading and release resources; safe to call again */ }
}
```

Pass a fresh renderer to `runtime.setRenderer(renderer, host)`. Successful replacement returns `true`; a superseded request returns `false`. A load failure throws and preserves the previous usable renderer. Treat each frame as a read-only snapshot.

A Rive character combines a resource URL, artboard/state machine names, state mappings, view-model bindings, and a frame solver. Start with [interactive-follow.js](../src/characters/interactive-follow.js) or [milo.js](../src/characters/milo.js). Unmapped expressions use the rig's fallback; missing required bindings fail explicitly.

Register a renderer in the demo:

```js
window.avatar.registerCharacter("custom", {
  name: "Custom character",
  create: () => new MyRenderer(),
});
await window.avatar.setCharacter("custom");
```

## Voice scheduling

Voice adapters feed PCM audio, captions, and reply text into a shared playback timeline. Mouth inference follows the audio actually scheduled for playback. JEV examines new text about every 500 ms, with one request in flight; low-confidence, failed, or stale decisions do not block speech.

The Speech Engine adapter uses character alignment from audio packets when available, with a segment-level transcript fallback. Native GPT-Live uses approximate transcript timing and an estimated session audio origin. Neither path guarantees word-perfect synchronization.

Interruptions clear queued audio, captions, and facial events, and invalidate late results. Silence gating closes the mouth between spoken segments. Independent idle motion continues without making JEV calls.

## Rive authoring and rollback

Compiled `.riv` files ship with the app. No Rive account or CLI is required to run them. Authoring uses editable RML sources and a separately installed Rive CLI; the local tools directory is ignored by Git.

| File | Purpose |
| --- | --- |
| `scripts/generate_follow.py` | Follow rig generator and expression geometry |
| `rive-follow/source/original.xml` | Original editable source snapshot |
| `rive-follow/scene.rml` | Generated editable Follow V2 scene |
| `src/assets/follow-expressive.riv` | Runtime asset imported by the app |
| `public/follow-expressive.riv` | Downloadable runtime copy |
| `src/assets/follow-classic.riv` | Previous rig retained as Follow Classic |

```sh
RIVE_CLI=/absolute/path/to/rive npm run rive:follow:build
```

The build **regenerates `scene.rml`**, verifies and compiles it, then updates both runtime copies. Make durable Follow changes in the generator; manual scene edits are overwritten on the next build. Read [rive-follow/AGENTS.md](../rive-follow/AGENTS.md) before editing that source directory.

A `.riv` file is a runtime asset; an editor handoff uses `.rev`. Log in with your Rive CLI and export:

```sh
npm run rive:login
npm run rive:follow:export
```

Set `RIVE_CLI` for these commands too if your CLI is outside the default `.tools/rive/bin/rive` path. **The checked-in `public/follow-expressive.rev` predates Follow V2.** Generate a fresh export from current RML before editing V2 in the Rive Editor. The current `.riv` and RML are the authoritative V2 artifacts.

For visual comparison, run `node scripts/render-follow-studies.mjs` against the running app. `design/expression-studies/follow-v2-rendered.png` shows native rendered poses; `follow-v1.png` is concept art, not a runtime screenshot.

Use Follow Classic in the UI for an immediate visual fallback. For code rollback, use `git revert <commit>` to preserve subsequent work and history.

## Girl rig

Girl uses the same seven emotion names and intensity stops as Follow V2. Its
adapter is `src/characters/girl.js`; `scripts/generate_girl.py` extends the preserved
source in `rive-girl/source/original.xml`. All 71 original shapes are retained,
including the brows, lashes, irises, lips, gradients, and highlights. The generator
adds controller keyframes and additive speech offsets; it does not redraw paths.
The author's happy and blink timelines remain active through their joysticks.
Imported iris/pupil draw ordering is repaired explicitly, and their original paths
are positioned under bounded gaze controls with the original eye-white clips.
Nose wrinkle is not mapped.

`src/characters/girl-mouth.js` maps the shared articulation contour to offsets on
the original lip bones. Offsets return to zero when speech stops. Expression and
speech offsets use separate parent nodes so they can be composed.
`verify-girl-artwork.py` runs during builds and tests to guard the original
geometry, styles, and skin bindings against accidental replacement.

```sh
npm run rive:girl:build
npm run rive:girl:export   # Requires a Rive CLI login
npm run rive:girl:studies  # Generates the native expression contact sheet
```

The generator overwrites `rive-girl/scene.rml`; edit the generator for durable
changes. The shipped `public/girl-expressive.rev` is the current editable handoff,
validated by importing it into a fresh CLI project and compiling it. This local
project has no cloud push target, so it does not overwrite the user's original
Girl file. Attribution and the embedded font license are recorded in the notices.
