import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { readFile, writeFile, chmod } from 'node:fs/promises';
import { ENGINE_VOICES } from '../src/voice/voices.js';

// Explicit provisioning only. Voice buttons never mutate a shared remote engine.
// Keep the existing engine and clone its settings for three additional voices.
const env = process.env;
if (!env.SPEECH_ENGINE_ID || !env.ELEVENLABS_API_KEY) throw Error('Configure Speech Engine first.');
const eleven = new ElevenLabsClient({ apiKey: env.ELEVENLABS_API_KEY });
const ids = JSON.parse(env.SPEECH_ENGINE_VOICE_IDS || '{}');
const save = async () => {
  let contents = await readFile('.env', 'utf8');
  const line = 'SPEECH_ENGINE_VOICE_IDS=' + JSON.stringify(ids);
  contents = /^SPEECH_ENGINE_VOICE_IDS=.*$/m.test(contents)
    ? contents.replace(/^SPEECH_ENGINE_VOICE_IDS=.*$/m, () => line) : contents.trimEnd() + '\n' + line + '\n';
  await writeFile('.env', contents, { mode: 0o600 }); await chmod('.env', 0o600);
};
try {
  const original = await eleven.speechEngine.get(env.SPEECH_ENGINE_ID);
  const config = Object.fromEntries(['speechEngine','asr','tts','turn','vad','conversation','privacy','callLimits','language','cascadeTimeoutSeconds','overrides']
    .filter(key => original.config[key] !== undefined).map(key => [key, original.config[key]]));
  for (const voice of ENGINE_VOICES) {
    if (original.config.tts.voiceId === voice.voiceId) {
      ids[voice.id] = env.SPEECH_ENGINE_ID;
    } else {
      const settings = { ...config, name: 'Milos · ' + voice.name,
        tts: { ...config.tts, voiceId: voice.voiceId } };
      const engine = ids[voice.id]
        ? await eleven.speechEngine.update(ids[voice.id], settings)
        : await eleven.speechEngine.create(settings);
      ids[voice.id] = engine.engineId;
    }
    // Persist each success so an interrupted run can resume without duplicates.
    await save(); console.log(`Ready: ${voice.name}`);
  }
} catch (error) {
  console.error('Voice provisioning failed:', error.statusCode || error.name);
  process.exitCode = 1;
}
