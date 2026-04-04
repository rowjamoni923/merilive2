import { useRef, useCallback, useEffect, useState } from 'react';

// Professional Casino Sound Hook with Game-Specific Sounds
// Each game has unique, realistic audio that stops when switching games

type GameType = 'roulette' | 'ferris-wheel' | 'teen-patti' | 'dice' | null;

export function useCasinoSound() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const activeOscillatorsRef = useRef<Set<OscillatorNode>>(new Set());
  const activeBufferSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const ambientLoopRef = useRef<{ source: AudioBufferSourceNode; gain: GainNode } | null>(null);
  const [currentGame, setCurrentGame] = useState<GameType>(null);
  const [volume, setVolumeState] = useState(0.5);
  const isMutedRef = useRef(false);

  // Initialize audio context on first user interaction
  useEffect(() => {
    const initAudio = () => {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        masterGainRef.current = audioContextRef.current.createGain();
        masterGainRef.current.connect(audioContextRef.current.destination);
        masterGainRef.current.gain.value = volume;
      }
    };

    document.addEventListener('click', initAudio, { once: true });
    document.addEventListener('touchstart', initAudio, { once: true });

    return () => {
      document.removeEventListener('click', initAudio);
      document.removeEventListener('touchstart', initAudio);
      stopAllSounds();
    };
  }, []);

  // Stop all active sounds
  const stopAllSounds = useCallback(() => {
    activeOscillatorsRef.current.forEach(osc => {
      try { osc.stop(); } catch (e) {}
    });
    activeOscillatorsRef.current.clear();

    activeBufferSourcesRef.current.forEach(src => {
      try { src.stop(); } catch (e) {}
    });
    activeBufferSourcesRef.current.clear();

    // Stop ambient loop
    if (ambientLoopRef.current) {
      try {
        ambientLoopRef.current.gain.gain.setValueAtTime(0, audioContextRef.current!.currentTime);
        ambientLoopRef.current.source.stop();
      } catch (e) {}
      ambientLoopRef.current = null;
    }
  }, []);

  // Switch to a new game - stops all previous sounds
  const switchGame = useCallback((game: GameType) => {
    if (currentGame !== game) {
      stopAllSounds();
      setCurrentGame(game);
    }
  }, [currentGame, stopAllSounds]);

  const setVolume = useCallback((newVolume: number) => {
    const vol = Math.max(0, Math.min(1, newVolume));
    setVolumeState(vol);
    if (masterGainRef.current) {
      masterGainRef.current.gain.value = isMutedRef.current ? 0 : vol;
    }
  }, []);

  const setMuted = useCallback((muted: boolean) => {
    isMutedRef.current = muted;
    if (masterGainRef.current) {
      masterGainRef.current.gain.value = muted ? 0 : volume;
    }
  }, [volume]);

  // Helper: Play oscillator-based tone
  const playTone = useCallback((frequency: number, duration: number, type: OscillatorType = 'sine', gain = 0.3) => {
    if (isMutedRef.current || !audioContextRef.current || !masterGainRef.current) return;

    const ctx = audioContextRef.current;
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    gainNode.gain.setValueAtTime(gain, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);

    osc.connect(gainNode);
    gainNode.connect(masterGainRef.current);

    activeOscillatorsRef.current.add(osc);
    osc.onended = () => activeOscillatorsRef.current.delete(osc);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  }, []);

  // Helper: Create noise buffer
  const createNoiseBuffer = useCallback((duration: number, type: 'white' | 'pink' | 'brown' = 'white') => {
    if (!audioContextRef.current) return null;
    const ctx = audioContextRef.current;
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    let lastOut = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      if (type === 'white') {
        data[i] = white;
      } else if (type === 'pink') {
        data[i] = (lastOut + (0.02 * white)) / 1.02;
        lastOut = data[i];
      } else {
        data[i] = (lastOut + (0.1 * white)) / 1.1;
        lastOut = data[i];
      }
    }
    return buffer;
  }, []);

  // ===========================================
  // ROULETTE SOUNDS - Realistic wheel spinning
  // ===========================================

  // Roulette wheel spin - Ball bouncing and wheel rotation
  const playRouletteWheelSpin = useCallback(() => {
    if (isMutedRef.current || !audioContextRef.current || !masterGainRef.current) return;
    const ctx = audioContextRef.current;

    // Wheel rotation sound - low frequency rumble
    const rumbleBuffer = createNoiseBuffer(5, 'brown');
    if (rumbleBuffer) {
      const source = ctx.createBufferSource();
      const gainNode = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      source.buffer = rumbleBuffer;
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(200, ctx.currentTime);
      filter.frequency.linearRampToValueAtTime(100, ctx.currentTime + 4);

      gainNode.gain.setValueAtTime(0.15, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 4);
      gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + 5);

      source.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(masterGainRef.current);

      activeBufferSourcesRef.current.add(source);
      source.onended = () => activeBufferSourcesRef.current.delete(source);
      source.start();
    }

    // Ball clicking sounds - faster at first, slowing down
    let clickDelay = 50;
    let totalTime = 0;
    const maxTime = 4000;

    const playClick = () => {
      if (totalTime > maxTime || isMutedRef.current) return;

      // Click sound
      playTone(800 + Math.random() * 400, 0.03, 'square', 0.08);

      // Gradually slow down
      clickDelay = Math.min(300, clickDelay * 1.08);
      totalTime += clickDelay;
      setTimeout(playClick, clickDelay);
    };

    playClick();

    // Final ball drop sound
    setTimeout(() => {
      playTone(400, 0.1, 'sine', 0.2);
      playTone(300, 0.15, 'sine', 0.15);
    }, 4200);
  }, [createNoiseBuffer, playTone]);

  // Roulette ball drop into slot
  const playRouletteBallDrop = useCallback(() => {
    if (isMutedRef.current) return;

    // Multiple bounces with decreasing intensity
    const bounces = [0, 80, 150, 210, 260];
    bounces.forEach((delay, i) => {
      setTimeout(() => {
        playTone(600 - i * 80, 0.06, 'sine', 0.15 - i * 0.02);
        playTone(400 - i * 60, 0.04, 'triangle', 0.1 - i * 0.015);
      }, delay);
    });
  }, [playTone]);

  // ===========================================
  // FERRIS WHEEL SOUNDS - Musical carnival
  // ===========================================

  // Ferris wheel spin - Mechanical spinning with music box feel
  const playFerrisWheelSpin = useCallback(() => {
    if (isMutedRef.current || !audioContextRef.current || !masterGainRef.current) return;
    const ctx = audioContextRef.current;

    // Mechanical whirring
    const whirBuffer = createNoiseBuffer(5, 'pink');
    if (whirBuffer) {
      const source = ctx.createBufferSource();
      const gainNode = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      source.buffer = whirBuffer;
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(400, ctx.currentTime);
      filter.Q.value = 2;

      gainNode.gain.setValueAtTime(0.08, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.02, ctx.currentTime + 4);
      gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + 5);

      source.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(masterGainRef.current);

      activeBufferSourcesRef.current.add(source);
      source.onended = () => activeBufferSourcesRef.current.delete(source);
      source.start();
    }

    // Music box-like chimes during spin
    const notes = [523, 659, 784, 880, 1047, 1319, 1568]; // C5 to G6
    let noteIndex = 0;
    let delay = 80;
    let totalTime = 0;

    const playChime = () => {
      if (totalTime > 4000 || isMutedRef.current) return;

      const freq = notes[noteIndex % notes.length];
      playTone(freq, 0.15, 'sine', 0.12);
      playTone(freq * 2, 0.1, 'triangle', 0.04);

      noteIndex++;
      delay = Math.min(250, delay * 1.1);
      totalTime += delay;
      setTimeout(playChime, delay);
    };

    playChime();
  }, [createNoiseBuffer, playTone]);

  // Ferris wheel stop - Final ding
  const playFerrisWheelStop = useCallback(() => {
    if (isMutedRef.current) return;

    // Bell-like ding
    playTone(1047, 0.4, 'sine', 0.25);
    playTone(2093, 0.3, 'triangle', 0.1);
    playTone(1567, 0.35, 'sine', 0.15);
  }, [playTone]);

  // ===========================================
  // TEEN PATTI SOUNDS - Card game atmosphere
  // ===========================================

  // Card shuffle sound
  const playCardShuffle = useCallback(() => {
    if (isMutedRef.current || !audioContextRef.current || !masterGainRef.current) return;
    const ctx = audioContextRef.current;

    // Multiple shuffle sounds
    for (let i = 0; i < 8; i++) {
      setTimeout(() => {
        const buffer = createNoiseBuffer(0.08, 'white');
        if (buffer) {
          const source = ctx.createBufferSource();
          const gainNode = ctx.createGain();
          const filter = ctx.createBiquadFilter();

          source.buffer = buffer;
          filter.type = 'highpass';
          filter.frequency.value = 3000;
          gainNode.gain.setValueAtTime(0.12, ctx.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);

          source.connect(filter);
          filter.connect(gainNode);
          gainNode.connect(masterGainRef.current!);

          activeBufferSourcesRef.current.add(source);
          source.onended = () => activeBufferSourcesRef.current.delete(source);
          source.start();
        }
      }, i * 80 + Math.random() * 30);
    }
  }, [createNoiseBuffer]);

  // Card deal/flip sound
  const playCardDeal = useCallback(() => {
    if (isMutedRef.current || !audioContextRef.current || !masterGainRef.current) return;
    const ctx = audioContextRef.current;

    // Card sliding and flipping sound
    const buffer = createNoiseBuffer(0.1, 'white');
    if (buffer) {
      const source = ctx.createBufferSource();
      const gainNode = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      source.buffer = buffer;
      filter.type = 'highpass';
      filter.frequency.value = 2500;
      gainNode.gain.setValueAtTime(0.18, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);

      source.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(masterGainRef.current);

      activeBufferSourcesRef.current.add(source);
      source.onended = () => activeBufferSourcesRef.current.delete(source);
      source.start();
    }

    // Soft thump as card lands
    setTimeout(() => {
      playTone(150, 0.05, 'sine', 0.1);
    }, 50);
  }, [createNoiseBuffer, playTone]);

  // Card reveal flourish
  const playCardReveal = useCallback(() => {
    if (isMutedRef.current) return;

    // Dramatic reveal
    playTone(440, 0.15, 'sine', 0.15);
    setTimeout(() => playTone(554, 0.15, 'sine', 0.12), 80);
    setTimeout(() => playTone(659, 0.2, 'sine', 0.15), 160);
  }, [playTone]);

  // ===========================================
  // COMMON GAME SOUNDS
  // ===========================================

  // Bet placed sound - Satisfying chip sound
  const playBetSound = useCallback(() => {
    if (isMutedRef.current) return;

    // Chip stack sound
    playTone(800, 0.05, 'sine', 0.2);
    setTimeout(() => {
      playTone(1000, 0.04, 'sine', 0.15);
      playTone(1200, 0.03, 'triangle', 0.1);
    }, 30);
    setTimeout(() => playTone(1400, 0.05, 'sine', 0.12), 60);
  }, [playTone]);

  // Win sound - Triumphant
  const playWinSound = useCallback(() => {
    if (isMutedRef.current) return;

    const notes = [523, 659, 784, 880, 1047, 1319];
    notes.forEach((freq, i) => {
      setTimeout(() => {
        playTone(freq, 0.35, 'sine', 0.25);
        playTone(freq * 0.5, 0.4, 'triangle', 0.12);
      }, i * 80);
    });
  }, [playTone]);

  // Lose sound - Descending
  const playLoseSound = useCallback(() => {
    if (isMutedRef.current) return;

    const notes = [400, 350, 300, 250];
    notes.forEach((freq, i) => {
      setTimeout(() => playTone(freq, 0.2, 'sawtooth', 0.12), i * 100);
    });
  }, [playTone]);

  // Coin cascade sound
  const playCoinSound = useCallback(() => {
    if (isMutedRef.current) return;

    const frequencies = [2000, 2400, 2800, 3200, 3600];
    frequencies.forEach((freq, i) => {
      setTimeout(() => playTone(freq, 0.12, 'sine', 0.15), i * 30);
    });
  }, [playTone]);

  // Jackpot sound
  const playJackpotSound = useCallback(() => {
    if (isMutedRef.current) return;

    const melody = [523, 659, 784, 1047, 1319, 1568, 2093];
    melody.forEach((freq, i) => {
      setTimeout(() => {
        playTone(freq, 0.3, 'sine', 0.22);
        playTone(freq * 0.5, 0.35, 'triangle', 0.12);
        playTone(freq * 1.5, 0.2, 'sine', 0.08);
      }, i * 100);
    });
  }, [playTone]);

  // Tick sound for countdown
  const playTickSound = useCallback(() => {
    if (isMutedRef.current) return;
    playTone(1200, 0.04, 'sine', 0.1);
  }, [playTone]);

  return {
    // State
    volume,
    currentGame,
    
    // Controls
    setVolume,
    setMuted,
    switchGame,
    stopAllSounds,

    // Roulette sounds
    playRouletteWheelSpin,
    playRouletteBallDrop,

    // Ferris wheel sounds
    playFerrisWheelSpin,
    playFerrisWheelStop,

    // Teen Patti sounds
    playCardShuffle,
    playCardDeal,
    playCardReveal,

    // Common sounds
    playBetSound,
    playWinSound,
    playLoseSound,
    playCoinSound,
    playJackpotSound,
    playTickSound,
  };
}

// Singleton for global access
let globalCasinoSoundInstance: ReturnType<typeof useCasinoSound> | null = null;

export function getGlobalCasinoSound() {
  return globalCasinoSoundInstance;
}

export function setGlobalCasinoSound(instance: ReturnType<typeof useCasinoSound>) {
  globalCasinoSoundInstance = instance;
}
