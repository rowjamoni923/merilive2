/**
 * Lucky Wheel Audio Engine
 * Pure Web Audio API — no external assets needed.
 * Generates spin ticks, win fanfare, lose buzzer, and ambient bg loop synthetically.
 */

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let bgmGain: GainNode | null = null;
let bgmNodes: { osc: OscillatorNode; lfo: OscillatorNode } | null = null;

const getCtx = (): AudioContext | null => {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
      if (!Ctx) return null;
      ctx = new Ctx();
      masterGain = ctx.createGain();
      masterGain.gain.value = 0.6;
      masterGain.connect(ctx.destination);
      bgmGain = ctx.createGain();
      bgmGain.gain.value = 0;
      bgmGain.connect(masterGain);
    } catch {
      return null;
    }
  }
  if (ctx?.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
};

export const luckyWheelAudio = {
  resume() {
    getCtx();
  },

  tick(pitch = 1) {
    const c = getCtx();
    if (!c || !masterGain) return;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "square";
    o.frequency.value = 800 * pitch;
    g.gain.setValueAtTime(0.15, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.05);
    o.connect(g).connect(masterGain);
    o.start();
    o.stop(c.currentTime + 0.06);
  },

  spinStart() {
    const c = getCtx();
    if (!c || !masterGain) return;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(200, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(800, c.currentTime + 0.4);
    g.gain.setValueAtTime(0.2, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.5);
    o.connect(g).connect(masterGain);
    o.start();
    o.stop(c.currentTime + 0.5);
  },

  win(multiplier: number) {
    const c = getCtx();
    if (!c || !masterGain) return;
    // Fanfare — ascending triad
    const notes = multiplier >= 20 ? [523, 659, 784, 1047, 1319] : [523, 659, 784];
    notes.forEach((freq, i) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = "triangle";
      o.frequency.value = freq;
      const start = c.currentTime + i * 0.12;
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(0.25, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.4);
      o.connect(g).connect(masterGain);
      o.start(start);
      o.stop(start + 0.45);
    });
  },

  lose() {
    const c = getCtx();
    if (!c || !masterGain) return;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(220, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(80, c.currentTime + 0.6);
    g.gain.setValueAtTime(0.2, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.6);
    o.connect(g).connect(masterGain);
    o.start();
    o.stop(c.currentTime + 0.65);
  },

  diamondDrop() {
    const c = getCtx();
    if (!c || !masterGain) return;
    [880, 1175, 1568].forEach((freq, i) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = "sine";
      o.frequency.value = freq;
      const start = c.currentTime + i * 0.05;
      g.gain.setValueAtTime(0.15, start);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.15);
      o.connect(g).connect(masterGain);
      o.start(start);
      o.stop(start + 0.2);
    });
  },

  startBgm() {
    const c = getCtx();
    if (!c || !bgmGain || bgmNodes) return;
    // Warm pad: detuned saw + slow LFO filter sweep
    const osc = c.createOscillator();
    const lfo = c.createOscillator();
    const lfoGain = c.createGain();
    const filter = c.createBiquadFilter();
    osc.type = "sawtooth";
    osc.frequency.value = 110;
    filter.type = "lowpass";
    filter.frequency.value = 600;
    filter.Q.value = 4;
    lfo.frequency.value = 0.15;
    lfoGain.gain.value = 300;
    lfo.connect(lfoGain).connect(filter.frequency);
    osc.connect(filter).connect(bgmGain);
    osc.start();
    lfo.start();
    bgmGain.gain.cancelScheduledValues(c.currentTime);
    bgmGain.gain.linearRampToValueAtTime(0.08, c.currentTime + 1);
    bgmNodes = { osc, lfo };
  },

  stopBgm() {
    const c = getCtx();
    if (!c || !bgmGain || !bgmNodes) return;
    bgmGain.gain.cancelScheduledValues(c.currentTime);
    bgmGain.gain.linearRampToValueAtTime(0, c.currentTime + 0.5);
    const nodes = bgmNodes;
    setTimeout(() => {
      try {
        nodes.osc.stop();
        nodes.lfo.stop();
      } catch {}
    }, 600);
    bgmNodes = null;
  },

  setMasterVolume(v: number) {
    if (masterGain) masterGain.gain.value = Math.max(0, Math.min(1, v));
  },
};
