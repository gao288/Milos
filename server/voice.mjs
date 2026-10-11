import http from "node:http";
import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import WebSocket, { WebSocketServer } from "ws";
import { inferEmotion, JEV_MODEL } from "./jev.mjs";
import { synthesizeEleven, ELEVEN_MODEL } from "./eleven.mjs";
import { createEngineService, ENGINE_LLM } from "./speech-engine.mjs";
import { liveVoices } from './voices.mjs';

export function liveConfig(env = process.env) {
  return { model: env.GPT_LIVE_MODEL || "gpt-live-1", audio: {
    format: { type: "audio/pcm", rate: 16000 }, output: { voice: env.GPT_LIVE_VOICE || "meridian" },
  }, delegation: { type: "client" }, instructions:
    "You are a friendly animated companion. Converse naturally in English or Chinese, following the user's language. Be concise and warm. Local task execution is not connected yet: do not claim to execute commands or modify files. If asked to perform a complex task, explain that task delegation is coming in the next update. Listen when the user interrupts." };
}

// A separate loopback bridge keeps credentials and provider logic out of Vite.
export function createVoiceServer({ env = process.env, connect = (url, options) => new WebSocket(url, options), emotion = inferEmotion, tts = synthesizeEleven, engine } = {}) {
  const token = randomBytes(24).toString("hex");
  const clients = new Set();
  const busy = new Set();
  const json = (res, code, data) => { res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(data)); };
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (req.method === "GET" && url.pathname === "/api/voice/health") {
      return json(res, 200, { openaiConfigured: !!env.OPENAI_API_KEY, jevConfigured: !!(env.JEV_API_KEY || env.TYPESAFE_API_KEY),
        liveModel: liveConfig(env).model, jevModel: env.JEV_MODEL || JEV_MODEL,
        elevenConfigured: !!(env.ELEVENLABS_API_KEY && env.ELEVENLABS_VOICE_ID), elevenModel: env.ELEVENLABS_MODEL || ELEVEN_MODEL,
        speechEngineConfigured: !!engine?.ready, speechEngineModel: env.SPEECH_ENGINE_LLM_MODEL || ENGINE_LLM,
        liveVoices: liveVoices(env), liveVoice: liveConfig(env).audio.output.voice,
        engineVoices: engine?.voices ?? [], engineVoice: engine?.defaultVoice,
        token, delegation: "pending-p1" });
    }
    if (req.headers["x-realpet-token"] !== token) return json(res, 403, { error: "Invalid local session token" });
    if (req.method === "POST" && url.pathname === "/api/voice/speech-engine") {
      if (!engine?.ready) return json(res, 503, { error: "Speech Engine 尚未配置回调服务" });
      try { return json(res, 200, await engine.signedUrl(url.searchParams.get('voice') || undefined)); }
      catch (error) { return json(res, error.message.startsWith('Invalid') ? 400 : 502,
        { error: error.message.startsWith('Invalid') ? 'Invalid voice selection' : "Speech Engine 会话创建失败，请检查 ElevenLabs 权限和回调服务" }); }
    }
    if (req.method !== "POST" || !["/api/voice/emotion", "/api/voice/eleven"].includes(url.pathname)) return json(res, 404, { error: "Not found" });
    if (busy.has(url.pathname)) return json(res, 429, { error: "Request already running" });
    if (!String(req.headers["content-type"]).startsWith("application/json")) return json(res, 415, { error: "Expected JSON" });
    busy.add(url.pathname);
    const abort = new AbortController();
    res.on("close", () => { if (!res.writableEnded) abort.abort(); });
    try {
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (Buffer.byteLength(body) > 40000) { json(res, 413, { error: "Request too large" }); return; }
      }
      let input;
      try { input = JSON.parse(body); } catch { return json(res, 400, { error: "Invalid JSON" }); }
      const result = url.pathname === "/api/voice/eleven"
        ? await tts(input, { env, emotion, signal: abort.signal })
        : await emotion(input, { key: env.JEV_API_KEY || env.TYPESAFE_API_KEY, model: env.JEV_MODEL || JEV_MODEL, signal: abort.signal });
      json(res, 200, result);
    } catch (error) {
      const message = error.name === "TimeoutError" ? "语音/情绪请求超时" : error.message;
      json(res, message.startsWith("Invalid") ? 400 : 502, { error: message });
    } finally { busy.delete(url.pathname); }
  });
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 128 * 1024 });
  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname !== "/api/voice/live" || url.searchParams.get("token") !== token) { socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n"); return; }
    const voice = url.searchParams.get('voice') || liveConfig(env).audio.output.voice;
    if (!liveVoices(env).some(v => v.id === voice)) { socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n"); return; }
    sockets.handleUpgrade(req, socket, head, ws => sockets.emit("connection", ws, voice));
  });
  sockets.on("connection", (client, voice) => {
    const send = event => { if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(event)); };
    if (!env.OPENAI_API_KEY) { send({ type: "bridge.error", message: "OPENAI_API_KEY 尚未配置" }); client.close(); return; }
    if (clients.size) { send({ type: "bridge.error", message: "已有语音会话，请先结束" }); client.close(); return; }
    clients.add(client);
    let upstream, started = false, closing = false, finalized = false, closeTimer;
    const startupTimer = setTimeout(() => { send({ type: "bridge.error", message: "GPT-Live 连接超时" }); client.close(); upstream?.terminate(); }, 20000);
    const closeUpstream = () => {
      if (closing) return;
      closing = true; clearTimeout(startupTimer);
      if (started && upstream.readyState === WebSocket.OPEN) {
        upstream.send(JSON.stringify({ type: "session.close" }));
        closeTimer = setTimeout(() => { send({ type: "bridge.error", message: "会话关闭未确认" }); upstream.terminate(); client.close(); }, 15000);
      } else { upstream?.terminate(); client.close(); }
    };
    try { upstream = connect("wss://api.openai.com/v1/live/sessions", { headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` }, maxPayload: 4 * 1024 * 1024 }); }
    catch { send({ type: "bridge.error", message: "无法连接 GPT-Live" }); clearTimeout(startupTimer); clients.delete(client); client.close(); return; }
    upstream.on("open", () => { upstream.send(JSON.stringify({ type: "session.start", session: liveConfig({ ...env, GPT_LIVE_VOICE: voice }) })); });
    upstream.on("message", data => {
      let event; try { event = JSON.parse(data.toString()); } catch { return; }
      if (event.type === "session.started") { clearTimeout(startupTimer); started = true; }
      if (event.type === "session.delegation.created") {
        send({ type: "bridge.delegation", status: "pending-p1" });
        upstream.send(JSON.stringify({ type: "session.commentary.append", delegation_id: event.delegation.id,
          content: "Local Codex delegation is not connected. No task was executed. Tell the user this capability is planned for the next update." }));
      }
      if (client.bufferedAmount > 2 * 1024 * 1024) { closeUpstream(); return; }
      send(event);
      if (event.type === "session.closed") {
        finalized = true; clients.delete(client); clearTimeout(closeTimer);
        upstream.close(); client.close();
      }
    });
    upstream.on("error", () => { send({ type: "bridge.error", message: "GPT-Live 连接失败，请检查 API key、模型权限和网络" }); client.close(); });
    upstream.on("close", () => {
      clearTimeout(startupTimer); clearTimeout(closeTimer); clients.delete(client);
      if (!finalized) send({ type: "bridge.error", message: "GPT-Live 连接已断开，最终用量未确认" });
      client.close();
    });
    client.on("message", data => {
      let event; try { event = JSON.parse(data.toString()); } catch { return; }
      if (event.type === "session.close") { closeUpstream(); return; }
      if (!started || closing || upstream.readyState !== WebSocket.OPEN) return;
      if (event.type === "bridge.interrupt") {
        upstream.send(JSON.stringify({ type: "session.instructions.append",
          delegation_id: null,
          content: "The user interrupted playback. Stop speaking now and listen. Wait for their next input before replying." }));
        return;
      }
      // No arbitrary client prompts, tools, credentials or provider URLs.
      if (event.type === "session.input_audio.append" && typeof event.audio === "string" &&
          event.audio.length <= 64000 && /^[A-Za-z0-9+/]*={0,2}$/.test(event.audio) &&
          Buffer.from(event.audio, "base64").length % 2 === 0) {
        if (upstream.bufferedAmount > 256000) { send({ type: "bridge.error", message: "语音上传阻塞，请重新连接" }); closeUpstream(); return; }
        upstream.send(JSON.stringify({ type: event.type, audio: event.audio }));
      }
    });
    client.on("close", closeUpstream);
    client.on("error", closeUpstream);
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.REALPET_VOICE_PORT || 8788);
  const engine = createEngineService();
  try { await engine.start(); } catch { console.error("Speech Engine callback unavailable; other voice modes remain available"); }
  createVoiceServer({ engine }).listen(port, "127.0.0.1", () => console.log(`Voice bridge: http://127.0.0.1:${port}`));
}
