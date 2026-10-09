import http from "node:http";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import OpenAI from "openai";

export const ENGINE_LLM = "gpt-5.6-luna";
export const CALLBACK_PATH = "/speech-engine";

export function engineConfig(env) {
  const url = new URL(env.SPEECH_ENGINE_CALLBACK_URL);
  if (url.protocol !== "wss:" || url.pathname !== CALLBACK_PATH || url.username || url.password || url.search)
    throw Error("SPEECH_ENGINE_CALLBACK_URL must be wss://<host>/speech-engine");
  return {
    name: "RealPet Speech Engine experiment", speechEngine: { wsUrl: url.href },
    asr: { provider: "scribe_realtime", userInputAudioFormat: "pcm_16000" },
    tts: { modelId: env.SPEECH_ENGINE_TTS_MODEL || "eleven_v4_turbo", voiceId: env.ELEVENLABS_VOICE_ID,
      agentOutputAudioFormat: "pcm_16000", speed: 1, stability: 0.5 },
    conversation: { maxDurationSeconds: 600, clientEvents: ["audio", "interruption", "user_transcript", "agent_response", "agent_response_correction"] },
    privacy: { recordVoice: false, retentionDays: 1, deleteAudio: true, deleteTranscriptAndPii: true },
    callLimits: { agentConcurrencyLimit: 1, dailyLimit: 100, burstingEnabled: false },
    language: env.SPEECH_ENGINE_LANGUAGE || "zh", cascadeTimeoutSeconds: 15,
  };
}

export function textResponder(openai, env = process.env) {
  return async (transcript, signal, session) => {
    // Ignore stale turns even if an upstream request resolves after cancellation.
    try {
      const response = await openai.responses.create({
        model: env.SPEECH_ENGINE_LLM_MODEL || ENGINE_LLM, stream: true, store: false,
        reasoning: { effort: "none" }, max_output_tokens: 350,
        instructions: "You are a warm animated companion. Reply in the user's language (English or Chinese), usually one or two short conversational sentences. Speak naturally; no Markdown. You have no connected tools and must not claim to execute tasks. You may sparingly use ElevenLabs audio tags such as [happy], [sympathetic], [curious], [sighs] when the context calls for them. Do not overact or read the tags aloud.",
        input: transcript.slice(-20).filter(m => ["user", "agent"].includes(m.role)).map(m => ({
          role: m.role === "agent" ? "assistant" : "user", content: String(m.content).slice(-6000),
        })),
      }, { signal, timeout: 20000, maxRetries: 0 });
      if (signal.aborted || !session.isOpen) { response.controller?.abort(); return; }
      await session.sendResponse(response);
    } catch (error) {
      if (signal.aborted) return;
      // Do not log SDK errors: they may include request headers/transcripts.
      console.error("Speech Engine LLM failed", error.status || error.name);
      session.close();
    }
  };
}

// This server alone may be exposed through a tunnel. No health, tokens, assets,
// credentials or arbitrary HTTP routes are available on it. SDK verifies JWTs.
export function createEngineService({ env = process.env, eleven, openai } = {}) {
  eleven ??= new ElevenLabsClient({ apiKey: env.ELEVENLABS_API_KEY });
  const configured = !!(env.SPEECH_ENGINE_ID && env.ELEVENLABS_API_KEY && env.OPENAI_API_KEY);
  const service = { ready: false, configured, server: null,
    async signedUrl() {
      if (!service.ready) throw Error("Speech Engine 回调尚未连接，请先完成本地配置");
      const result = await eleven.conversationalAi.conversations.getSignedUrl({ agentId: env.SPEECH_ENGINE_ID });
      return { signedUrl: result.signedUrl };
    },
    async start(port = Number(env.SPEECH_ENGINE_PORT || 8789)) {
      if (!configured) return;
      openai ??= new OpenAI({ apiKey: env.OPENAI_API_KEY });
      const server = http.createServer((_req, res) => { res.writeHead(404); res.end(); });
      server.on("upgrade", (req, socket) => { if (req.url !== CALLBACK_PATH) socket.destroy(); });
      const attachment = await eleven.speechEngine.attach(env.SPEECH_ENGINE_ID, server, CALLBACK_PATH, {
        debug: false, onTranscript: textResponder(openai, env),
        onError: (_err, session) => { console.error("Speech Engine session error"); session?.close(); },
      });
      await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
      service.server = server; service.ready = true;
      service.close = async () => { service.ready = false; await attachment.close(); server.close(); };
      console.log(`Speech Engine callback listening on 127.0.0.1:${server.address().port}`);
    },
  };
  return service;
}
