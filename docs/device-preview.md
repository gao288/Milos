# 1-bit device preview

The Device Lab on the existing playground previews Follow V2's twelve expression
poses on a monochrome display. Select **Enable 1-bit** above the character. This
selects Follow V2 and disables pointer following so event poses remain readable.
Use **Original preview** to return to the normal renderer, or choose another
character to leave device mode.

The preview samples the running Rive canvas at 1, 2, 4 or 8 FPS, scales a portrait
crop into a 200, 320 or 480 pixel square, composites transparency on white, and
thresholds luminance. Every output pixel is opaque black or white, including
edges. The threshold slider trades fine detail against shadow removal. Browser
scaling uses nearest-neighbor pixels. The display buffer is ordinary RGBA canvas
memory; it is **not** a packed 1-bit hardware framebuffer.

This is a visual simulator, not a Raspberry Pi driver. It does not emulate panel
waveforms, ghosting, busy times, partial/full refresh, network latency or power
consumption. Rive continues rendering at its normal rate, and existing real audio
playback keeps its own clock. Lowering preview FPS does not simulate lower CPU
usage. No hardware FPS claim is made; the target display needs measurement.

## Local hook demonstrations

The eight buttons use the same semantic hook handler as this browser API:

```js
await window.avatar.device.setEnabled(true);
window.avatar.device.trigger('task.completed');
```

| Event | Response |
| --- | --- |
| `device.idle` | Rest and glance aside |
| `task.started` | Curious expression, upward gaze, head tilt |
| `task.waiting` | Concerned expression and waiting pose |
| `task.completed` | Happy expression and repeated nod |
| `task.failed` | Sad expression and head shake |
| `attention.required` | Fearful expression and turned head |
| `voice.listening` | Warm smile and listening pose |
| `voice.speaking` | Silent demonstration of mouth shapes and nodding |

These are demonstrations: triggering one stops current voice/sample playback.
The speaking hook does not call a speech provider or microphone. A new hook,
manual expression, stop, or character switch cancels the previous demonstration.
After about four seconds the motion ends and the expression remains. Mouth shapes
return to rest. Events are validated before any current playback is interrupted.

This API runs inside the page only. No public HTTP hook receiver, MQTT service,
task execution or Petdex integration is included. A future device transport can
map external events to the same names, with its own authentication and scheduling.

For Raspberry Pi deployment, add the actual screen and audio drivers plus a
transport to the voice backend. Choose local Rive rendering or pre-rendered frame
playback only after confirming the Pi and display models.
