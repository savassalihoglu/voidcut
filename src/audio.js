// All sound is synthesized with WebAudio — zero audio files, tiny download.
// The context unlocks on first user gesture. `setEnabled` follows YouTube's
// audio setting; when disabled the master gain is 0 (hard silence).

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.enabled = true;
    this.noiseBuf = null;
    this.drawNode = null;
    this.fuseNode = null;
    this.musicMode = 'off';
    this.musicTimer = null;
    this.nextBeat = 0;
    this.beat = 0;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { return; }
    const c = this.ctx;

    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.connect(c.destination);

    this.master = c.createGain();
    this.master.gain.value = this.enabled ? 0.9 : 0;
    this.master.connect(comp);

    this.musicGain = c.createGain();
    this.musicGain.gain.value = 0.16;
    this.musicGain.connect(this.master);

    // shared noise buffer
    const len = c.sampleRate * 1;
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this.startMusicScheduler();
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) {
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.linearRampToValueAtTime(on ? 0.9 : 0, t + 0.1);
    }
  }

  suspend() { this.ctx?.suspend().catch(() => {}); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); }

  // ---------- primitives ----------
  beep({ freq = 440, end = null, dur = 0.15, type = 'square', vol = 0.2, delay = 0, curve = 'exp' }) {
    if (!this.ctx || !this.enabled) return;
    const c = this.ctx, t0 = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (end) {
      if (curve === 'exp') o.frequency.exponentialRampToValueAtTime(Math.max(1, end), t0 + dur);
      else o.frequency.linearRampToValueAtTime(end, t0 + dur);
    }
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  noise({ dur = 0.3, vol = 0.25, freq = 1200, q = 1, delay = 0, slide = null }) {
    if (!this.ctx || !this.enabled) return;
    const c = this.ctx, t0 = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    const f = c.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
    if (slide) f.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t0); src.stop(t0 + dur + 0.05);
  }

  // ---------- one-shots ----------
  tap()   { this.beep({ freq: 660, dur: 0.06, type: 'triangle', vol: 0.15 }); }
  start() {
    [440, 587, 880, 1174].forEach((f, i) =>
      this.beep({ freq: f, dur: 0.12, type: 'square', vol: 0.14, delay: i * 0.07 }));
  }
  claim(pct) { // bigger cut → bigger whoosh, higher chord
    const base = 300 + Math.min(500, pct * 18);
    this.noise({ dur: 0.35, vol: 0.3, freq: 500, slide: 3200, q: 0.8 });
    this.beep({ freq: base, dur: 0.22, type: 'triangle', vol: 0.2 });
    this.beep({ freq: base * 1.5, dur: 0.26, type: 'triangle', vol: 0.16, delay: 0.05 });
    if (pct >= 6) this.beep({ freq: base * 2, dur: 0.3, type: 'triangle', vol: 0.14, delay: 0.1 });
  }
  kill()  { this.beep({ freq: 900, end: 1800, dur: 0.14, type: 'square', vol: 0.16 }); }
  death() {
    this.noise({ dur: 0.5, vol: 0.4, freq: 900, slide: 120, q: 0.6 });
    this.beep({ freq: 340, end: 45, dur: 0.6, type: 'sawtooth', vol: 0.3 });
  }
  clear() {
    [523, 659, 784, 1046, 1318].forEach((f, i) =>
      this.beep({ freq: f, dur: 0.16, type: 'square', vol: 0.15, delay: i * 0.09 }));
  }
  perfect() {
    [1046, 1318, 1568, 2093].forEach((f, i) =>
      this.beep({ freq: f, dur: 0.2, type: 'triangle', vol: 0.16, delay: 0.5 + i * 0.1 }));
  }
  power() {
    [880, 1174, 1760].forEach((f, i) =>
      this.beep({ freq: f, dur: 0.1, type: 'triangle', vol: 0.16, delay: i * 0.05 }));
  }
  milestone() {
    this.beep({ freq: 988, dur: 0.09, type: 'triangle', vol: 0.15 });
    this.beep({ freq: 1319, dur: 0.14, type: 'triangle', vol: 0.15, delay: 0.08 });
  }
  shoot() { this.beep({ freq: 1400, end: 300, dur: 0.18, type: 'sawtooth', vol: 0.12 }); }
  gameOver() {
    [392, 311, 233, 155].forEach((f, i) =>
      this.beep({ freq: f, dur: 0.3, type: 'sawtooth', vol: 0.18, delay: i * 0.22 }));
  }

  // ---------- loops (draw hum / fuse crackle) ----------
  setDrawing(on) {
    if (!this.ctx) return;
    if (on && !this.drawNode && this.enabled) {
      const c = this.ctx;
      const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = 96;
      const lfo = c.createOscillator(); lfo.frequency.value = 7;
      const lfoG = c.createGain(); lfoG.gain.value = 9;
      lfo.connect(lfoG); lfoG.connect(o.frequency);
      const g = c.createGain(); g.gain.value = 0;
      g.gain.linearRampToValueAtTime(0.06, c.currentTime + 0.08);
      o.connect(g); g.connect(this.master);
      o.start(); lfo.start();
      this.drawNode = { o, lfo, g };
    } else if (!on && this.drawNode) {
      const { o, lfo, g } = this.drawNode;
      const t = this.ctx.currentTime;
      g.gain.cancelScheduledValues(t);
      g.gain.linearRampToValueAtTime(0, t + 0.08);
      o.stop(t + 0.15); lfo.stop(t + 0.15);
      this.drawNode = null;
    }
  }

  setFuse(on) {
    if (!this.ctx) return;
    if (on && !this.fuseNode && this.enabled) {
      const c = this.ctx;
      const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2600; f.Q.value = 2;
      const g = c.createGain(); g.gain.value = 0.12;
      const lfo = c.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 16;
      const lfoG = c.createGain(); lfoG.gain.value = 0.08;
      lfo.connect(lfoG); lfoG.connect(g.gain);
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start(); lfo.start();
      this.fuseNode = { src, lfo, g };
    } else if (!on && this.fuseNode) {
      const { src, lfo } = this.fuseNode;
      try { src.stop(); lfo.stop(); } catch (e) { /* already stopped */ }
      this.fuseNode = null;
    }
  }

  stopLoops() { this.setDrawing(false); this.setFuse(false); }

  // ---------- generative music ----------
  setMusic(mode) { this.musicMode = mode; }

  startMusicScheduler() {
    const BPM = 96, SPB = 60 / BPM / 2; // eighth notes
    const bass = [0, 0, 12, 0, 3, 0, 10, 8];   // semitones above A1
    const pads = [[0, 3, 7], [-2, 2, 5], [-4, 0, 3], [-2, 2, 5]];
    this.nextBeat = 0;
    this.beat = 0;
    this.musicTimer = setInterval(() => {
      if (!this.ctx || this.musicMode === 'off' || !this.enabled) return;
      const c = this.ctx;
      if (c.state !== 'running') return;
      if (this.nextBeat < c.currentTime) this.nextBeat = c.currentTime + 0.05;
      while (this.nextBeat < c.currentTime + 0.25) {
        this.scheduleBeat(this.nextBeat, this.beat, SPB, bass, pads);
        this.nextBeat += SPB;
        this.beat++;
      }
    }, 90);
  }

  scheduleBeat(t, beat, spb, bass, pads) {
    const c = this.ctx;
    const intense = this.musicMode === 'play';
    const root = 55; // A1

    // bass
    const semi = bass[beat % bass.length];
    if (beat % 2 === 0 || intense) {
      const o = c.createOscillator(); o.type = 'sawtooth';
      o.frequency.value = root * Math.pow(2, semi / 12);
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = intense ? 700 : 420;
      const g = c.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(intense ? 0.5 : 0.35, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + spb * 0.95);
      o.connect(f); f.connect(g); g.connect(this.musicGain);
      o.start(t); o.stop(t + spb);
    }

    // pad — one soft chord every 2 bars
    if (beat % 32 === 0) {
      const chord = pads[(beat / 32) % pads.length];
      for (const s of chord) {
        const o = c.createOscillator(); o.type = 'triangle';
        o.frequency.value = 220 * Math.pow(2, s / 12);
        const g = c.createGain();
        const dur = spb * 32;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.09, t + dur * 0.3);
        g.gain.linearRampToValueAtTime(0, t + dur);
        o.connect(g); g.connect(this.musicGain);
        o.start(t); o.stop(t + dur);
      }
    }

    // hats
    if (intense && beat % 2 === 1) {
      const src = c.createBufferSource(); src.buffer = this.noiseBuf;
      const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6000;
      const g = c.createGain();
      g.gain.setValueAtTime(0.10, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      src.connect(f); f.connect(g); g.connect(this.musicGain);
      src.start(t); src.stop(t + 0.08);
    }
  }
}
