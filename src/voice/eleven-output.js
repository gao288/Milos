import { encodeWav } from '../providers/audio-model.js';

// Experimental sentence revoicing. Original Live audio is not played. All
// captions, emotion cues and mouth frames use the replacement audio's clock.
export class ElevenOutput {
  constructor(owner) { this.owner = owner; this.epoch = 0; this.clear(); }
  clear() {
    ++this.epoch; clearTimeout(this.idleTimer); clearTimeout(this.maxTimer);
    this.maxTimer = null;
    this.abort?.abort(); this.abort = null; this.busy = false;
    this.pending = ''; this.queue = []; this.captions = [];
  }
  push(fragment) {
    if (this.pending.length + fragment.text.length > 400) this.flush();
    // Do not let one unexpectedly large transcript bypass request bounds.
    for (let i = 0; i < fragment.text.length; i += 160) {
      this.pending += fragment.text.slice(i, i + 160);
      if (this.pending.length >= 160 || /[。！？.!?\n]["'”’]*\s*$/.test(this.pending)) this.flush();
    }
    if (!this.pending) return;
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.flush(), 700);
    this.maxTimer ??= setTimeout(() => this.flush(), 1600);
  }
  flush() {
    clearTimeout(this.idleTimer); clearTimeout(this.maxTimer); this.maxTimer = null;
    const text = this.pending; this.pending = '';
    if (!text.trim()) return;
    if (this.queue.length >= 8) { this.owner.stop(); this.owner.onStatus('ElevenLabs 配音积压，请重新开始或切回 GPT-Live', true); return; }
    const context = this.owner.history.slice(-4).map(({role,text})=>({role,text:text.slice(-1000)}));
    this.queue.push({text,context}); this.pump();
  }
  tick(now) {
    while (this.captions[0]?.at <= now) this.owner.onTranscript(this.captions.shift().fragment);
    this.pump();
  }
  async pump() {
    const o = this.owner;
    if (!o.active || this.busy || !this.queue.length || o.map.next - o.context.currentTime > 2) return;
    const epoch = this.epoch, context = o.context, item = this.queue.shift();
    const abort = new AbortController(); this.abort = abort; this.busy = true;
    try {
      const response = await fetch('/api/voice/eleven', {method:'POST',
        headers:{'Content-Type':'application/json','X-Realpet-Token':o.config.token},
        body:JSON.stringify(item),signal:AbortSignal.any([abort.signal,AbortSignal.timeout(25000)])});
      const result = await response.json();
      if (!response.ok) throw Error(result.error || `ElevenLabs HTTP ${response.status}`);
      if (epoch !== this.epoch || !o.active) return;
      const bytes = Uint8Array.from(atob(result.audio), c => c.charCodeAt(0));
      const audio = await context.decodeAudioData(bytes.buffer);
      if (epoch !== this.epoch || !o.active) return;
      if (audio.duration <= 0 || audio.duration > 25) throw Error('ElevenLabs 单段音频需在 25 秒以内');
      const samples = audio.getChannelData(0);
      let clip = null;
      if (o.modelReady) {
        try { clip = await o.model.infer(encodeWav(samples), AbortSignal.any([abort.signal,AbortSignal.timeout(1800)])); }
        catch { if (!abort.signal.aborted) o.onStatus('本段嘴形未就绪，仍播放 ElevenLabs 声音'); }
      }
      if (epoch !== this.epoch || !o.active) return;
      const slot = o.playPCM(samples, { infer: false, maxQueueSeconds: 30 });
      if (clip) {
        const frames = clip.frames.filter(f=>f.timeMs < audio.duration*1000).map(f=>({...f,timeMs:slot.at*1000+f.timeMs}));
        o.mouth.append(frames); o.onMetrics({mouthMs:clip.inferenceMs});
      }
      const startMs=(slot.at-o.sessionOrigin)*1000;
      this.captions.push({at:slot.at,fragment:{role:'assistant',text:item.text,startMs,endMs:startMs+audio.duration*1000}});
      if (result.emotion) {
        o.onEmotionResult({result:result.emotion,text:item.text,currentText:item.text,receivedAt:Date.now()});
        o.emotions.add({...result.emotion,at:slot.at,until:slot.end+.6});
        o.onMetrics({prediction:result.emotion.emotion,predictionConfidence:result.emotion.confidence,inferenceMs:result.emotion.inferenceMs});
      }
      o.onStatus(result.warning || `已连接 · ElevenLabs 配音（合成 ${result.synthesisMs ?? '—'} ms）`);
    } catch (error) {
      if (epoch === this.epoch && !abort.signal.aborted && o.active) {
        o.stop(); o.onStatus(`配音已停止：${error.message}`, true);
      }
    } finally {
      if (epoch === this.epoch) { this.busy = false; this.abort = null; }
    }
  }
}
