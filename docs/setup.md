# Setup and configuration

## Animation playground

Install Node.js 22.12+ and run `npm ci`, then `npm run dev`. Open the URL printed by Vite (normally http://localhost:5173). No backend is needed for character animation, expression controls, or the text/viseme demos.

## Server configuration

On a fresh clone, copy `.env.example` to `.env` and fill in the services you want to use. If `.env` already exists, edit it without overwriting existing settings. Restart the voice service after changes.

Keep `.env` local. It is ignored by Git, and provider secrets are read by the server. Never use a `VITE_` prefix for API keys: those variables can enter the browser bundle.

| Variable | Purpose / checked-in default |
| --- | --- |
| `OPENAI_API_KEY` | GPT-Live and Speech Engine's separate text model |
| `GPT_LIVE_MODEL` | Native voice model: `gpt-live-1` |
| `GPT_LIVE_VOICE` | Native voice: `meridian` |
| `JEV_API_KEY` | Emotion inference through the JEV service |
| `JEV_MODEL` | `jev-1.13.0` |
| `ELEVENLABS_API_KEY` | ElevenLabs revoicing and Speech Engine |
| `ELEVENLABS_VOICE_ID` | A voice available to your ElevenLabs account |
| `ELEVENLABS_MODEL` | Revoicing model: `eleven_v4_turbo` |
| `SPEECH_ENGINE_ID` | Saved resource ID, written by the setup script |
| `SPEECH_ENGINE_CALLBACK_URL` | Public `wss://…/speech-engine` callback |
| `SPEECH_ENGINE_PORT` | Dedicated callback listener: `8789` |
| `SPEECH_ENGINE_LLM_MODEL` | Streaming text model: `gpt-5.6-luna` |
| `SPEECH_ENGINE_TTS_MODEL` | Streaming speech model: `eleven_v4_turbo` |
| `SPEECH_ENGINE_LANGUAGE` | Recognition language: `zh` |
| `REALPET_ALLOWED_HOSTS` | Comma-separated exact hostnames for an HTTPS reverse proxy |

These are implementation defaults, not a promise of model access for every account. Choose models supported by your account and the integration's API. JEV uses `https://api.typesafe.ai/v1/systemone`.

Run the services in separate terminals:

```sh
npm run voice:serve  # Loopback port 8788; reads .env
npm run model:serve  # Loopback port 8787; requires the setup below
npm run dev         # Web UI and HTTP/WebSocket proxy
```

The page exposes service status before starting a conversation. Missing model inference does not fabricate model output; the voice path can continue with the mouth at rest. Choose a voice mode before starting the session. Stop the session to switch modes.

## Audio-to-face model

The provided installation is tested on Linux with Python 3.11 and NVIDIA CUDA. Install [uv](https://docs.astral.sh/uv/) first, then:

```sh
npm run model:setup
npm run model:serve
```

Setup creates `.venv`, installs the pinned Python dependencies, and downloads the approximately 371 MiB ONNX checkpoint into ignored `models/`. CUDA dependencies require additional disk space. The download is SHA-256 verified; its source and licensing notes are in [third-party notices](../THIRD_PARTY_NOTICES.md).

To use the same environment with CPU inference:

```sh
REALPET_MODEL_DEVICE=cpu npm run model:serve
```

The default installer still includes GPU dependencies. CPU performance and other operating systems have not been established as supported real-time configurations.

`GET /api/model/health` reports provider status. `POST /api/model/infer` accepts a binary mono, 16-bit PCM WAV at 16 kHz, between 0.1 and 60 seconds. The browser audio panel handles decoding and resampling. Output frames use named channels and millisecond timestamps at a nominal 30 fps.

```sh
npm run test:model
```

The Python unit tests use a stub inference session and do not download or evaluate the actual model.

## Speech Engine

This mode uses ElevenLabs for recognition, turns, and streaming speech, with our own streaming OpenAI Responses text callback. It needs OpenAI and ElevenLabs credentials, a voice ID, and a public WSS callback reachable by ElevenLabs.

For local experimentation, start a dedicated tunnel in a separate terminal:

```sh
cloudflared tunnel --config /dev/null --url http://127.0.0.1:8789 --no-autoupdate
```

Set `SPEECH_ENGINE_CALLBACK_URL=wss://<returned-hostname>/speech-engine` in `.env`, then run:

```sh
npm run speech-engine:setup
npm run voice:serve
```

The setup script creates a resource on first use, or updates the saved `SPEECH_ENGINE_ID`, and saves the configuration in ignored `.env`. It changes a remote ElevenLabs resource; an ordinary server restart does not. A new temporary tunnel hostname requires running setup again.

The callback listener accepts only the Speech Engine WebSocket route. The ElevenLabs SDK verifies the callback JWT. Do not substitute the application URL or expose the voice server's port as the callback.

Current resource defaults disable audio recording, request one-day transcript/PII retention, limit sessions to ten minutes, and set concurrency to one. This is not a zero-retention guarantee. Audio goes to ElevenLabs, reply context to OpenAI, and emotion text to JEV; each provider can incur usage.

Speech Engine applies its default 300 ms playback buffer once per turn. GPT-Live defaults to 800 ms. The UI remembers each mode's buffer separately. Network starvation and upstream generation can still cause pauses; lowering the buffer trades synchronization headroom for earlier playback.

## Troubleshooting

- **Microphone unavailable:** open localhost or an HTTPS URL; remote plain HTTP is not a secure microphone context.
- **Animation cannot load:** inspect the displayed error and use **Retry animation**. Run the app through Vite or the built-site server, not by opening `index.html` directly.
- **Voice unavailable:** inspect server health/configuration and restart `voice:serve` after editing `.env`.
- **No model mouth movement:** check the model service, downloaded checkpoint, and selected execution provider. Very quiet speech may be suppressed by silence gating.
- **Speech Engine callback fails:** check that the tunnel is running, its current hostname matches `.env`, and setup has updated the saved resource.
