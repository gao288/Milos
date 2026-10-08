import { emotionRequest, inferEmotion, JEV_MODEL } from './jev.mjs';

export const ELEVEN_MODEL = 'eleven_v4_turbo';
const models = new Set(['eleven_v4_turbo', 'eleven_v4', 'eleven_v3']);
const tags = { happy: '[happy]', sad: '[sympathetic]', curious: '[curious]', surprised: '[surprised]', angry: '[frustrated]' };

export async function synthesizeEleven(input, { env = process.env, emotion = inferEmotion, fetchFn = fetch, signal } = {}) {
  if (!env.ELEVENLABS_API_KEY || !env.ELEVENLABS_VOICE_ID)
    throw Error('请在本地 .env 配置 ELEVENLABS_API_KEY 和 ELEVENLABS_VOICE_ID 后重启语音服务');
  if (!input || typeof input.text !== 'string' || input.text.length > 400) throw Error('Invalid TTS text');
  emotionRequest(input); // Shared bounded text/context contract.
  const model = env.ELEVENLABS_MODEL || ELEVEN_MODEL;
  if (!models.has(model) || !/^[A-Za-z0-9_-]{1,128}$/.test(env.ELEVENLABS_VOICE_ID)) throw Error('Invalid ElevenLabs configuration');
  const abort = signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000);
  const started = performance.now();
  let prediction = null, warning = null;
  if (env.JEV_API_KEY || env.TYPESAFE_API_KEY) {
    try { prediction = await emotion(input, { key: env.JEV_API_KEY || env.TYPESAFE_API_KEY, model: env.JEV_MODEL || JEV_MODEL, signal: abort }); }
    catch { abort.throwIfAborted(); warning = 'JEV 暂不可用，本段使用默认语气'; }
  }
  // Tags are controlled here; literal transcript brackets cannot introduce directions.
  const text = input.text.replace(/[\[\]]/g, '');
  if (!text.trim()) throw Error('Invalid TTS text');
  const tag = prediction?.confidence >= .35 ? tags[prediction.emotion] || '' : '';
  const response = await fetchFn(`https://api.elevenlabs.io/v1/text-to-speech/${env.ELEVENLABS_VOICE_ID}?output_format=mp3_44100_128`, {
    method: 'POST', redirect: 'error', signal: abort,
    headers: { 'xi-api-key': env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: tag ? `${tag} ${text}` : text, model_id: model }),
  });
  if (!response.ok) throw Error(`ElevenLabs HTTP ${response.status}，请检查 key、音色权限和额度`);
  const chunks = []; let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.length;
    if (bytes > 5 * 1024 * 1024) throw Error('ElevenLabs 音频过长');
    chunks.push(chunk);
  }
  if (!bytes) throw Error('ElevenLabs 返回了空音频');
  return { audio: Buffer.concat(chunks).toString('base64'), format: 'mp3', model, emotion: prediction,
    text: input.text, deliveryTag: tag || null, warning, synthesisMs: Math.round(performance.now() - started) };
}
