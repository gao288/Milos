import { pcmDecode } from "./timeline.js";
import { rememberSpeech } from "./emotion-context.js";

// Browser audio transport, separate from the authenticated Eleven -> LLM socket.
// Own playback lets UniTalker, captions and JEV share the exact PCM clock.
export class SpeechEngineOutput {
  constructor(owner) {
    this.owner = owner; this.lastEvent = -1; this.cutoff = -1;
    this.pendingText = ""; this.hasAlignment = false; this.muted = false;
    this.queue = []; this.queuedSamples = 0;
    this.fallbackUsed = false;
    this.captionTagOpen = false;
  }
  async connect() {
    const o = this.owner, generation = o.generation;
    const response = await fetch("/api/voice/speech-engine", { method: "POST",
      headers: { "X-Realpet-Token": o.config.token }, signal: AbortSignal.timeout(15000) });
    const data = await response.json();
    if (!response.ok) throw Error(data.error || "Speech Engine 连接失败");
    if (generation !== o.generation) return null;
    const url = new URL(data.signedUrl);
    if (url.protocol !== "wss:" || url.hostname !== "api.elevenlabs.io") throw Error("Invalid Speech Engine session URL");
    const socket = new WebSocket(url);
    socket.onopen = () => socket.send(JSON.stringify({ type: "conversation_initiation_client_data" }));
    return socket;
  }
  receive(event) {
    const o = this.owner, now = o.context.currentTime;
    if (event.type === "ping") {
      o.socket.send(JSON.stringify({ type: "pong", event_id: event.ping_event.event_id })); return;
    }
    if (event.type === "conversation_initiation_metadata") {
      const m = event.conversation_initiation_metadata_event;
      if (m?.agent_output_audio_format !== "pcm_16000" || m?.user_input_audio_format !== "pcm_16000")
        throw Error("Speech Engine 必须配置 pcm_16000 输入和输出");
      o.receive({ type: "session.started" }); return;
    }
    if (event.type === "interruption") {
      this.cutoff = Math.max(this.cutoff, this.lastEvent, event.interruption_event?.event_id ?? -1);
      o.interrupt(true); return;
    }
    if (event.type === "user_transcript") {
      this.muted = false; this.pendingText = ""; this.hasAlignment = false;
      this.fallbackUsed = false;
      this.captionTagOpen = false;
      const text = event.user_transcription_event?.user_transcript;
      if (text) {
        const ms = (now - o.sessionOrigin) * 1000;
        o.receive({ type: "session.input_transcript.delta", delta: text, start_ms: ms, end_ms: ms });
      }
      return;
    }
    if (event.type === "agent_response") {
      // Alignment is preferred. Full-response text is only a fallback for
      // providers/voices that omit alignment; it is never displayed twice.
      if (!this.hasAlignment && !this.muted && !this.fallbackUsed) {
        this.pendingText = event.agent_response_event?.agent_response || "";
        // Some responses arrive after the final audio packet. Still show a
        // coarse caption if that packet is currently playing, without replay.
        const slot = o.map.slots?.at(-1);
        if (!this.queue.length && slot?.end > now && this.pendingText) {
          this.fragment(this.pendingText, slot, 0, (slot.end - slot.at) * 1000);
          this.pendingText = ""; this.fallbackUsed = true;
        }
      }
      return;
    }
    if (event.type === "audio") {
      const audio = event.audio_event;
      if (!audio?.audio_base_64 || this.muted || audio.event_id <= this.cutoff) return;
      this.lastEvent = Math.max(this.lastEvent, audio.event_id ?? -1);
      if (audio.alignment?.chars?.length) { this.hasAlignment = true; this.pendingText = ""; }
      const samples = pcmDecode(audio.audio_base_64);
      if (this.queuedSamples + samples.length > 16000 * 60) throw Error("Speech Engine 回复缓冲超过一分钟，请重连");
      this.queue.push({ audio, samples }); this.queuedSamples += samples.length;
      this.tick();
      return;
    }
    if (["error", "client_error"].includes(event.type)) throw Error("Speech Engine 会话错误，请重连并检查服务状态");
  }
  tick() {
    const o = this.owner;
    // TTS can arrive much faster than playback. Feed only the near-future PCM
    // into the rolling mouth model, so fast generation cannot evict unplayed lips.
    while (this.queue.length && o.map.next < o.context.currentTime + o.map.delay + .25) {
      const { audio, samples } = this.queue.shift(); this.queuedSamples -= samples.length;
      const slot = o.playPCM(samples, { maxQueueSeconds: 30 });
      const a = audio.alignment;
      if (a?.chars?.length && !this.fallbackUsed) {
        this.hasAlignment = true; this.pendingText = "";
        // Packet-local character timestamps; group into <= 500 ms text cues.
        let text = "", start = 0, end = 0;
        a.chars.forEach((char, i) => {
          const at = Math.max(0, Number(a.char_start_times_ms?.[i]) || 0);
          if (text && at - start >= 500) { this.fragment(text, slot, start, end); text = ""; }
          if (!text) start = at;
          text += char; end = at + Math.max(0, Number(a.char_durations_ms?.[i]) || 0);
        });
        if (text) this.fragment(text, slot, start, end);
      } else if (this.pendingText) {
        this.fragment(this.pendingText, slot, 0, (slot.end - slot.at) * 1000); this.pendingText = ""; this.fallbackUsed = true;
      }
    }
  }
  fragment(text, slot, start, end) {
    const o = this.owner;
    // Convert the real playback clock to the controller's pre-buffer timeline.
    const base = (slot.at - o.sessionOrigin - o.map.delay) * 1000;
    const duration = (slot.end - slot.at) * 1000;
    const fragment = { role: "assistant", text, startMs: base + Math.min(start, duration),
      endMs: base + Math.min(Math.max(start + 1, end), duration) };
    rememberSpeech(o.history, fragment);
    o.fragments.push(fragment);
    // Audio tags can themselves be split across aligned packets. JEV sees
    // them as delivery context, but captions only show the spoken words.
    let caption = "";
    for (const char of text) {
      if (char === "[") this.captionTagOpen = true;
      else if (char === "]" && this.captionTagOpen) this.captionTagOpen = false;
      else if (!this.captionTagOpen) caption += char;
    }
    if (caption) o.captions.push({ ...fragment, text: caption });
    if (o.fragments.length > 200) o.fragments.shift();
    if (o.captions.length > 200) o.captions.shift();
  }
  interrupt(fromProvider) {
    this.cutoff = Math.max(this.cutoff, this.lastEvent);
    this.pendingText = ""; this.hasAlignment = false;
    this.queue = []; this.queuedSamples = 0;
    this.fallbackUsed = false;
    this.captionTagOpen = false;
    // Manual button silences this response until a new user turn. Microphone
    // interruption/LLM cancellation is managed by Speech Engine itself.
    if (!fromProvider) this.muted = true;
  }
}
