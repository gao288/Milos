# HTTPS and public access

## Local and private access

Use http://localhost:5173 on the development machine. For another device, microphone access requires HTTPS. Add your exact hostname to `REALPET_ALLOWED_HOSTS` in `.env`, then restart Vite.

A private Tailscale example:

```sh
tailscale serve --bg --https=7443 http://127.0.0.1:5173
```

Use the HTTPS URL printed by the command. Devices must be on the appropriate tailnet. The browser uses the same origin for the voice WebSocket.

## Public demo through Tailscale Funnel

Funnel provides a public HTTPS URL without requiring visitors to sign in to Tailscale. Enable Funnel for the machine in your Tailscale configuration, and run:

```sh
npm run build
npm run serve:public  # Keep running; loopback port 5180
```

In another terminal:

```sh
tailscale funnel --bg --https=10000 http://127.0.0.1:5180
```

Use the returned public URL. This serves `dist/` and proxies the existing model/voice routes; keep those backends running for their features. Add the public hostname to `REALPET_ALLOWED_HOSTS` if required by the host check. Rebuild after application changes.

To disable only this public entry:

```sh
tailscale funnel --https=10000 off
```

Avoid resetting Tailscale's whole configuration when the machine has other services. Background Funnel configuration does not start the app, Python model, voice backend, or Speech Engine callback tunnel after a host reboot. Use a process supervisor for an unattended installation.

This is an anonymous experimental demo. Visitors can consume the configured owner's provider quota; the local voice-session token is not a user login or a per-user billing boundary. Existing concurrency limits do not make it a production multi-user service. Provider keys stay server-side in ignored `.env`.

The app exposes neither a local task executor nor Codex harness delegation. Do not add such capabilities to an anonymous deployment without a separate authorization design.

## Speech Engine callback

The ElevenLabs callback is separate from the public app. Expose only the dedicated port 8789 endpoint at `/speech-engine`, as described in [setup](setup.md). The SDK validates the callback JWT, and other HTTP paths on that listener return 404. Temporary tunnel addresses can change; update the saved Speech Engine resource when they do.

## Build and runtime notes

`npm run serve:public` uses Vite preview as a convenient demo server. For a production deployment, serve the built assets with a maintained web server and configure same-origin HTTP/WebSocket proxies for `/api/voice` and `/api/model`. Keep backend listeners on loopback and manage their lifecycles separately.

Model files, `.env`, `.git`, and local tools are not part of the production asset directory. Deploy `dist/`, not the repository root. Keep API credentials out of frontend environment variables and client bundles.
