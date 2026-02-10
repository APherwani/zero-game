export class SoundManager {
  private ctx: AudioContext | null = null;
  private _muted = false;

  get muted() {
    return this._muted;
  }

  set muted(value: boolean) {
    this._muted = value;
  }

  private getContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  private playTone(frequency: number, duration: number, startTime: number, type: OscillatorType = 'sine', gain = 0.15) {
    const ctx = this.getContext();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    g.gain.setValueAtTime(gain, startTime);
    g.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    osc.connect(g).connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + duration);
  }

  playCard() {
    if (this._muted) return;
    const ctx = this.getContext();
    const now = ctx.currentTime;
    const duration = 0.05;
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.12, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + duration);
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 2000;
    source.connect(filter).connect(g).connect(ctx.destination);
    source.start(now);
  }

  yourTurn() {
    if (this._muted) return;
    const ctx = this.getContext();
    const now = ctx.currentTime;
    this.playTone(660, 0.12, now);
    this.playTone(880, 0.15, now + 0.13);
  }

  trickWon() {
    if (this._muted) return;
    const ctx = this.getContext();
    const now = ctx.currentTime;
    this.playTone(523, 0.12, now, 'sine', 0.12);
    this.playTone(659, 0.12, now + 0.1, 'sine', 0.12);
    this.playTone(784, 0.2, now + 0.2, 'sine', 0.15);
  }

  bidPlaced() {
    if (this._muted) return;
    const ctx = this.getContext();
    const now = ctx.currentTime;
    this.playTone(440, 0.08, now, 'sine', 0.1);
  }

  roundEnd() {
    if (this._muted) return;
    const ctx = this.getContext();
    const now = ctx.currentTime;
    this.playTone(523, 0.15, now, 'triangle', 0.12);
    this.playTone(659, 0.15, now + 0.12, 'triangle', 0.12);
    this.playTone(784, 0.15, now + 0.24, 'triangle', 0.12);
    this.playTone(1047, 0.3, now + 0.36, 'triangle', 0.15);
  }

  gameOver() {
    if (this._muted) return;
    const ctx = this.getContext();
    const now = ctx.currentTime;
    this.playTone(523, 0.15, now, 'triangle', 0.12);
    this.playTone(659, 0.15, now + 0.15, 'triangle', 0.12);
    this.playTone(784, 0.15, now + 0.3, 'triangle', 0.12);
    this.playTone(1047, 0.2, now + 0.45, 'triangle', 0.15);
    this.playTone(784, 0.15, now + 0.65, 'triangle', 0.12);
    this.playTone(1047, 0.4, now + 0.8, 'sine', 0.18);
  }
}
