import { useCallback, useRef } from "react";

type EffectPreset = "bet" | "spin" | "deal" | "launch" | "win" | "lose";

let sharedContext: AudioContext | null = null;
let sharedGain: GainNode | null = null;

const ensureAudio = () => {
  if (typeof window === "undefined") return null;
  sharedContext ||= new (window.AudioContext || (window as any).webkitAudioContext)();
  sharedGain ||= sharedContext.createGain();
  if (!sharedGain.numberOfOutputs) sharedGain.connect(sharedContext.destination);
  sharedGain.gain.value = 0.55;
  if (sharedContext.state === "suspended") sharedContext.resume();
  return { ctx: sharedContext, gain: sharedGain };
};

const tone = (frequency: number, duration: number, type: OscillatorType, gainValue: number, delay = 0) => {
  const audio = ensureAudio();
  if (!audio) return;
  const { ctx, gain } = audio;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  const start = ctx.currentTime + delay;
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, start);
  amp.gain.setValueAtTime(0.001, start);
  amp.gain.exponentialRampToValueAtTime(gainValue, start + 0.015);
  amp.gain.exponentialRampToValueAtTime(0.001, start + duration);
  osc.connect(amp);
  amp.connect(gain);
  osc.start(start);
  osc.stop(start + duration + 0.02);
};

const noise = (duration: number, gainValue: number, filter: BiquadFilterType, frequency: number, delay = 0) => {
  const audio = ensureAudio();
  if (!audio) return;
  const { ctx, gain } = audio;
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const source = ctx.createBufferSource();
  const amp = ctx.createGain();
  const biquad = ctx.createBiquadFilter();
  const start = ctx.currentTime + delay;
  source.buffer = buffer;
  biquad.type = filter;
  biquad.frequency.value = frequency;
  amp.gain.setValueAtTime(gainValue, start);
  amp.gain.exponentialRampToValueAtTime(0.001, start + duration);
  source.connect(biquad);
  biquad.connect(amp);
  amp.connect(gain);
  source.start(start);
};

export function useLiveGameEffects() {
  const layerRef = useRef<HTMLDivElement | null>(null);

  const bindLayer = useCallback((node: HTMLDivElement | null) => {
    layerRef.current = node;
  }, []);

  const burst = useCallback((preset: EffectPreset) => {
    const layer = layerRef.current;
    if (!layer) return;
    const count = preset === "win" ? 34 : preset === "spin" || preset === "launch" ? 18 : 8;
    layer.dataset.effect = preset;
    for (let i = 0; i < count; i++) {
      const dot = document.createElement("span");
      dot.className = "live-game-fx-particle";
      dot.style.setProperty("--fx-x", `${(Math.random() - 0.5) * 260}px`);
      dot.style.setProperty("--fx-y", `${(Math.random() - 0.6) * 220}px`);
      dot.style.setProperty("--fx-delay", `${Math.random() * 110}ms`);
      layer.appendChild(dot);
      window.setTimeout(() => dot.remove(), 1250);
    }
    window.setTimeout(() => {
      if (layerRef.current) delete layerRef.current.dataset.effect;
    }, 520);
  }, []);

  const play = useCallback((preset: EffectPreset) => {
    ensureAudio();
    burst(preset);

    if (preset === "bet") {
      tone(1800, 0.045, "square", 0.08);
      tone(2800, 0.035, "triangle", 0.055, 0.025);
      noise(0.05, 0.035, "highpass", 3800, 0.015);
    }

    if (preset === "spin") {
      noise(1.05, 0.14, "bandpass", 520);
      [880, 1040, 1280, 1560, 1880].forEach((f, i) => tone(f, 0.07, "triangle", 0.07, i * 0.11));
    }

    if (preset === "deal") {
      for (let i = 0; i < 8; i++) noise(0.055, 0.045, "highpass", 3200 + i * 140, i * 0.055);
      tone(140, 0.08, "sine", 0.07, 0.45);
    }

    if (preset === "launch") {
      tone(85, 0.35, "sawtooth", 0.18);
      noise(0.7, 0.16, "lowpass", 300);
      noise(0.35, 0.08, "highpass", 650, 0.22);
    }

    if (preset === "win") {
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.28, "sine", 0.13, i * 0.085));
      for (let i = 0; i < 12; i++) tone(2500 + Math.random() * 1800, 0.06, "triangle", 0.045, 0.35 + i * 0.045);
    }

    if (preset === "lose") {
      [392, 330, 262].forEach((f, i) => tone(f, 0.22, "sine", 0.08, i * 0.12));
      noise(0.22, 0.055, "lowpass", 180, 0.2);
    }

    if (navigator.vibrate && ["spin", "deal", "launch", "win"].includes(preset)) {
      navigator.vibrate(preset === "win" ? [80, 40, 120] : 45);
    }
  }, [burst]);

  return { bindLayer, play };
}