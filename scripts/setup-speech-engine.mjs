import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { readFile, writeFile, chmod } from "node:fs/promises";
import { engineConfig } from "../server/speech-engine.mjs";

// Explicit provisioning command; ordinary server restarts never mutate the
// ElevenLabs resource. Re-running updates this experiment's saved engine only.
const env = process.env;
if (!env.ELEVENLABS_API_KEY || !env.ELEVENLABS_VOICE_ID) throw Error("ElevenLabs credentials/voice missing");
const config = engineConfig(env);
const eleven = new ElevenLabsClient({ apiKey: env.ELEVENLABS_API_KEY });
try {
  const engine = env.SPEECH_ENGINE_ID
    ? await eleven.speechEngine.update(env.SPEECH_ENGINE_ID, config)
    : await eleven.speechEngine.create(config);
  const values = { SPEECH_ENGINE_ID: engine.engineId, SPEECH_ENGINE_CALLBACK_URL: config.speechEngine.wsUrl };
  let contents = await readFile(".env", "utf8");
  for (const [name, value] of Object.entries(values)) {
    const pattern = new RegExp(`^${name}=.*$`, "m");
    contents = pattern.test(contents) ? contents.replace(pattern, `${name}=${value}`) : contents.trimEnd() + `\n${name}=${value}\n`;
  }
  await writeFile(".env", contents, { mode: 0o600 }); await chmod(".env", 0o600);
  console.log("Speech Engine configured; ID and callback saved to ignored .env. Restart voice bridge.");
} catch (error) { console.error("Speech Engine provisioning failed:", error.statusCode || error.name, error.body?.detail || "See ElevenLabs account permissions/configuration"); process.exitCode = 1; }
