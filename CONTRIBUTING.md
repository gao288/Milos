# Contributing to Milos

Milos separates input providers, animation state, and character rendering. Changes should preserve that boundary so new characters and speech models can reuse the same framework.

## Local workflow

1. Install Node.js 22.12+ and run `npm ci`.
2. Run `npm run dev` and reproduce the behavior in the playground.
3. Make a focused change. Keep provider secrets in ignored `.env`.
4. Run `npm test` and `npm run build`.
5. For UI, animation, or voice scheduling changes, install Chromium with `npx playwright install chromium` and run `npm run test:browser`.

Browser tests use mocked voice services and a simulated microphone. Real API calls are not required for CI. Use your own credentials only when an integration needs manual verification, and distinguish that verification from mocked test results in the pull request.

For Python provider changes, prepare the environment with the [setup guide](docs/setup.md), then run `npm run test:model`. These unit tests use a stub inference session; actual model inference needs a separate manual check.

## Implementation conventions

- Keep provider-specific response formats out of `AvatarFrame` and `AvatarRuntime`.
- Map model outputs explicitly; document unsupported channels and coordinate conventions.
- Preserve interruption and disposal behavior. Late asynchronous results must not revive a stopped session.
- Add UI strings to `src/i18n/catalog.js`; mark user text and raw provider output so translation does not rewrite them.
- For Rive changes, read the instructions inside the source directory and update generated runtime copies together. See the [authoring guide](docs/architecture.md#rive-authoring-and-rollback).
- Preserve third-party attribution when modifying or adding artwork and model integrations.

A pull request should explain the user-visible change, how it was validated, and any new configuration or limitations. For visual changes, include an actual rendered screenshot or recording. Do not submit API keys, private recordings, downloaded model weights, `.venv`, or local tool installations.
