# Live2D / Mao integration

Milos can render Niziiro Mao using Live2D Cubism Core and
`pixi-live2d-display`, alongside its existing Rive and Canvas adapters.
Voice providers, JEV, the performance clock and character switching keep the
same renderer-independent interface.

## Setup

Review the Live2D terms linked in [third-party notices](../THIRD_PARTY_NOTICES.md), then run:

```sh
npm ci
npm run live2d:setup
npm run dev
```

Select **Mao · Live2D**, or open `/?character=mao`. For production, run the
setup command before `npm run build`; Vite copies the local runtime files into
`dist/live2d`. Existing Rive characters do not require this download.

The downloader uses official Live2D URLs and verifies SHA-256 hashes from
`scripts/live2d-assets.json`. The sample revision and Core URL are pinned there.
Downloaded files in `public/live2d/` are intentionally ignored by Git. They retain
Live2D's licenses and are not covered by the repository's ISC license.

## Controls

`src/adapters/live2d.js` implements `mount`, `render` and `dispose`.
`src/characters/mao.js` maps each `AvatarFrame` to native parameters:

| Milos input | Mao parameters |
| --- | --- |
| Seven emotion states + intensity | Brow form/angle, eyelids, smile, cheeks, pupil size and mouth expression |
| Gaze, head tilt, nod/shake | Head/body angles and eye direction |
| Blinks + facial adjustments | Left/right eye openness and brow height |
| Viseme weights | A / I / U / E / O blend shapes |
| Continuous speech performance | Jaw and upper/lower lip separation, closure, rounding and stretching reduced to five mouth shapes |
| Breathing / natural motion | Breathing and pose parameters, with native hair/clothing physics |

Speech parameters update before native physics. Milos owns the animation clock;
sample idle motions and the SDK's automatic blink/gaze are disabled to avoid
competing controllers. Expressions ease between states; speech and blinks use
faster smoothing. A silent performance frame closes articulation even during a
strong emotion. Without speech, laughter and surprise can hold a steady open-mouth
pose. Stopping speech removes its influence rather than leaving stale values.

The speech mapping calibrates the combined jaw/lip gap with a bounded response
curve: ordinary UniTalker speech has much smaller jaw values than a manual
full-open pose. Closure and lip pressing are applied after this calibration;
the playback weight still gates the result. Rounded vowel selection is separated
from opening amplitude so small jaw values do not vanish when mapped to O.
Low-jaw English and Mandarin frames from the bundled audio samples are included
as regression fixtures, with a browser check of the rendered mouth interior.

This is a rig-specific mapping, not a one-to-one 52-channel facial rig. Mao has
five continuous mouth shapes and mouth-expression controls, but no separately
addressable upper/lower lip control points. Its Rive lip-point lab is therefore
hidden; the shared facial-performance monitor remains available. The twelve
existing presets sample the seven mapped emotions; they are not twelve new
hand-authored Live2D motions. No editable Rive project is produced for this model.

## Verification

```sh
npm test
npx playwright test tests/browser/mao.spec.js
```

Browser tests require the downloaded sample. They exercise model loading,
expressions, articulation, translations, mobile layout, renderer replacement
during a stream, and failed-download recovery. Core/Pixi code loads only when
Mao is selected; switching away disposes the model, textures, canvas and renderer.
