# Third-party resources

## Interactive Character Follow

- Creator: **alinazari**
- Original work: https://rive.app/marketplace/28334-53514-interactive-character-follow/
- License: [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/)
- File: `src/assets/interactive-follow.riv`
- Download: https://public.rive.app/community/runtime-files/28334-53514-interactive-character-follow.riv
- Marketplace revision: 53514; retrieved 2026-10-01.

`src/assets/interactive-follow.riv` remains the unmodified original runtime asset.
`rive-follow/` and `src/assets/follow-expressive.riv` are modified versions based on
an editable copy supplied by the user (Rive file 2624622). Modifications add seven
expression states (including fear), twelve Follow V2 pose variations, parameterized
mouth geometry, eyebrows, eyelids, cheek controls,
and independent speech/gesture bindings. A subsequent revision adds eight cubic
lip controls driven by 27 mouth blendshape channels, jaw skinning on the original
face/shadow contours, and separately clipped upper/lower teeth and tongue.
The original pose animations are retained.
The app supplies pointer coordinates from normalized motion events and maps model
face channels to the added geometry. Modified artwork retains CC BY 4.0 attribution.
No affiliation with or endorsement by the creator is implied.

## Girl Animation (Cursor Tracking)

- Creator: **marvin.te**
- Original work: https://rive.app/marketplace/19397-36522-girl-animation-cursor-tracking/
- License: [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/)
- Source imported from the user's editable Rive copy, file `2221939`.
- Preserved source: `rive-girl/source/original.xml`.
- Adapted assets: `rive-girl/scene.rml`, `src/assets/girl-expressive.riv`, and the matching `.riv` / `.rev` files in `public/`.

Modifications preserve the original character artwork and pose controllers, add
seven expression states with twelve authored poses, replace eye and mouth artwork
with parameterized geometry, and connect continuous lip/jaw control to Milos.
The original cloud file is not overwritten. Modified character artwork retains
CC BY 4.0 attribution; no endorsement by its creator is implied.

`rive-girl/Inter.ttf` was included with the editable source. Inter is licensed under
the SIL Open Font License 1.1; its license is included as `rive-girl/Inter-LICENSE.txt`.

`design/expression-studies/girl/v1.png` is an imagegen concept sheet based on a
native screenshot of this character. `v1-rendered.png` contains actual native Rive
renders of the implemented poses. The concept sheet is not a pixel-exact rendering
guarantee.

## UniTalker ONNX provider

- Upstream integration: https://github.com/dlp3d-ai/audio2face
- Inspected upstream revision: `ceba323464d609759dc25ccefdef6c05179d980b`.
- Algorithm: https://github.com/X-niper/UniTalker (ECCV 2024).
- Checkpoint linked by upstream: https://github.com/LazyBusyYang/CatStream/releases/download/a2f_cicd_files/unitalker_v0.4.0_base.onnx
- SHA-256: `2f446ccaa0d5e901472e7214cdccd2373619d9cc5542c42abba47b29fd1f3fce`.
- Local checkpoint: `models/unitalker_v0.4.0_base.onnx` (excluded from source/build).
- `server/unitalker_channels.json` reproduces upstream's published tensor ordering.
- Upstream integration's MIT license is included at `server/licenses/dlp3d-MIT.txt`.

Our independent provider follows the documented inputs (normalized 16 kHz audio,
neutral `emo_id=10`, requested frame count). It adds bounded inference windows,
validation, silence gating, and conversion to named lowerCamelCase channels.
No model training was performed. This is a UniTalker-derived checkpoint distributed
by dlp3d, not an NVIDIA Audio2Face checkpoint or a newly trained model. Repository
code licenses should not be interpreted as a blanket license for every original
training dataset or downstream use of model weights; consult upstream for those terms.

## Synthetic speech fixtures

`public/samples/en.wav` and `public/samples/zh.wav` are locally generated synthetic
speech, created with eSpeak NG 1.50 using original test sentences. They contain no
recorded person's voice. eSpeak NG binaries and data are not included in the app
bundle; see https://github.com/espeak-ng/espeak-ng for the speech engine.

- English: “Hello! I am your animated companion. Watch my lips as I speak. We can
  change the character and keep the same voice.”
- Mandarin: “你好，很高兴见到你。现在我的嘴形跟着声音变化。我们可以换一个角色，再听同一句话。”

These fixtures validate the pipeline only; they are not a speech accuracy benchmark.
