import { LIVE_VOICES, ENGINE_VOICES } from '../src/voice/voices.js';

export function liveVoices(env) {
  const id = env.GPT_LIVE_VOICE || 'meridian';
  return LIVE_VOICES.some(v => v.id === id) ? LIVE_VOICES
    : [...LIVE_VOICES, { id, name: 'Configured voice', description: '默认音色' }];
}

export function engineVoices(env) {
  // Separate persistent engines avoid changing the voice of another session
  // between signed-URL issuance and conversation startup.
  const configured = JSON.parse(env.SPEECH_ENGINE_VOICE_IDS || '{}');
  const defaultVoice = ENGINE_VOICES.find(v => v.voiceId === env.ELEVENLABS_VOICE_ID)
    || { id: 'default', name: 'Configured voice', description: '默认音色' };
  const entries = ENGINE_VOICES.filter(v => typeof configured[v.id] === 'string' && configured[v.id])
    .map(v => ({ ...v, engineId: configured[v.id] }));
  if (env.SPEECH_ENGINE_ID && !entries.some(v => v.id === defaultVoice.id))
    entries.unshift({ ...defaultVoice, engineId: env.SPEECH_ENGINE_ID });
  return { entries, defaultId: defaultVoice.id };
}
