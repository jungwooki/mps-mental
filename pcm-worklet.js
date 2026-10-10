// Capture on the audio thread so UI/network delays cannot interrupt a recording.
class ConsultationPCM extends AudioWorkletProcessor {
  constructor({processorOptions = {}}) {
    super();
    this.rate = 16000;
    this.ratio = sampleRate / this.rate;
    this.remaining = this.ratio;
    this.sum = 0;
    this.enabled = false;
    this.finished = false;
    this.frames = 0;
    this.limit = processorOptions.maxFrames || this.rate * 60 * 60;
    this.buffer = new Int16Array(4096);
    this.used = 0;
    this.port.onmessage = ({data}) => {
      if (data.type === 'resume') this.enabled = true;
      if (data.type === 'pause' || data.type === 'stop') {
        this.enabled = false;
        this.flush();
        // Do not combine audio on opposite sides of a pause.
        this.remaining = this.ratio; this.sum = 0;
      }
      if (data.type === 'stop') this.finished = true;
      this.port.postMessage({type: 'ack', id: data.id});
    };
  }
  flush() {
    if (!this.used) return;
    const pcm = this.buffer.slice(0, this.used);
    this.port.postMessage({type: 'pcm', pcm, frames: this.frames}, [pcm.buffer]);
    this.used = 0;
  }
  process(inputs) {
    const channels = inputs[0];
    if (!this.enabled || this.finished || !channels?.length) return true;
    for (let i = 0; i < channels[0].length; i++) {
      let value = 0;
      for (const channel of channels) value += channel[i] / channels.length;
      // Average across fractional input intervals (44.1kHz and 48kHz included).
      let weight = 1;
      while (weight > 1e-8) {
        const take = Math.min(weight, this.remaining);
        this.sum += value * take; this.remaining -= take; weight -= take;
        if (this.remaining < 1e-8) {
          const sample = Math.max(-1, Math.min(1, this.sum / this.ratio));
          this.buffer[this.used++] = Math.round(sample * (sample < 0 ? 32768 : 32767));
          this.frames++; this.sum = 0; this.remaining = this.ratio;
          if (this.used === this.buffer.length) this.flush();
          if (this.frames >= this.limit) {
            this.enabled = false; this.finished = true; this.flush();
            this.port.postMessage({type: 'limit'});
            return true;
          }
        }
      }
    }
    return true;
  }
}
registerProcessor('consultation-pcm', ConsultationPCM);
