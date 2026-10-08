// AudioContext is explicitly 16 kHz; the browser resamples the microphone track.
class VoiceCapture extends AudioWorkletProcessor {
  constructor() { super(); this.chunk = new Float32Array(320); this.offset = 0; }
  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true;
    for (const sample of input) {
      this.chunk[this.offset++] = sample;
      if (this.offset === this.chunk.length) {
        this.port.postMessage(this.chunk, [this.chunk.buffer]);
        this.chunk = new Float32Array(320); this.offset = 0;
      }
    }
    return true;
  }
}
registerProcessor("realpet-voice-capture", VoiceCapture);
