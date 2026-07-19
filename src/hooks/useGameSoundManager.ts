import { useRef, useCallback, useEffect } from 'react';

/**
 * CENTRALIZED GAME SOUND MANAGER
 * 
 * This hook manages game-specific sounds with proper cleanup:
 * - Only ONE game's sounds play at a time
 * - Switching games stops previous game's sounds
 * - Closing game board stops ALL sounds
 * - Proper cleanup on unmount
 * 
 * Supports: Roulette, Ferris Wheel, Teen Patti, Rocket Race, Dice
 */

type GameType = 'roulette' | 'ferris-wheel' | 'teen-patti' | 'rocket-race' | 'dice' | null;

// Global sound manager singleton to ensure only one game plays at a time
let globalAudioContext: AudioContext | null = null;
let globalMasterGain: GainNode | null = null;
let activeGame: GameType = null;
let activeOscillators: Set<OscillatorNode> = new Set();
let activeBufferSources: Set<AudioBufferSourceNode> = new Set();
let isMuted = false;
let volume = 0.6;

// Initialize audio context
const initAudioContext = () => {
  if (!globalAudioContext) {
    globalAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    globalMasterGain = globalAudioContext.createGain();
    globalMasterGain.connect(globalAudioContext.destination);
    globalMasterGain.gain.value = volume;
  }
  // Resume if suspended
  if (globalAudioContext.state === 'suspended') {
    globalAudioContext.resume();
  }
  return { ctx: globalAudioContext, masterGain: globalMasterGain };
};

// Stop ALL active sounds immediately
const stopAllSoundsGlobal = () => {
  activeOscillators.forEach(osc => {
    try { osc.stop(); osc.disconnect(); } catch (e) {}
  });
  activeOscillators.clear();

  activeBufferSources.forEach(src => {
    try { src.stop(); src.disconnect(); } catch (e) {}
  });
  activeBufferSources.clear();
};

// Enhanced tone player with ADSR envelope
const playToneGlobal = (
  frequency: number, 
  duration: number, 
  type: OscillatorType = 'sine', 
  gain = 0.3,
  attack = 0.01,
  decay = 0.1
) => {
  if (isMuted || !globalAudioContext || !globalMasterGain) return;

  const ctx = globalAudioContext;
  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(frequency, ctx.currentTime);
  
  // ADSR Envelope for more realistic sound
  gainNode.gain.setValueAtTime(0, ctx.currentTime);
  gainNode.gain.linearRampToValueAtTime(gain, ctx.currentTime + attack);
  gainNode.gain.linearRampToValueAtTime(gain * 0.7, ctx.currentTime + attack + decay);
  gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);

  osc.connect(gainNode);
  gainNode.connect(globalMasterGain);

  activeOscillators.add(osc);
  osc.onended = () => {
    activeOscillators.delete(osc);
    try { osc.disconnect(); gainNode.disconnect(); } catch (e) {}
  };

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration);
};

// Play multiple oscillators for richer sound
const playRichTone = (
  frequency: number,
  duration: number,
  type: OscillatorType = 'sine',
  gain = 0.3
) => {
  if (isMuted || !globalAudioContext || !globalMasterGain) return;
  
  // Main tone
  playToneGlobal(frequency, duration, type, gain * 0.6);
  // Harmonic overtones
  playToneGlobal(frequency * 2, duration * 0.8, 'sine', gain * 0.2);
  playToneGlobal(frequency * 3, duration * 0.6, 'sine', gain * 0.1);
};

// Create noise buffer
const createNoiseBufferGlobal = (duration: number, type: 'white' | 'pink' | 'brown' = 'white') => {
  if (!globalAudioContext) return null;
  const ctx = globalAudioContext;
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
};

// Play filtered noise
const playFilteredNoise = (
  duration: number, 
  filterType: BiquadFilterType, 
  frequency: number, 
  gain: number,
  noiseType: 'white' | 'pink' | 'brown' = 'white'
) => {
  if (isMuted || !globalAudioContext || !globalMasterGain) return;
  
  const ctx = globalAudioContext;
  const buffer = createNoiseBufferGlobal(duration, noiseType);
  if (!buffer) return;
  
  const source = ctx.createBufferSource();
  const gainNode = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  
  source.buffer = buffer;
  filter.type = filterType;
  filter.frequency.value = frequency;
  gainNode.gain.setValueAtTime(gain, ctx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
  
  source.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(globalMasterGain);
  
  activeBufferSources.add(source);
  source.onended = () => {
    activeBufferSources.delete(source);
    try { source.disconnect(); filter.disconnect(); gainNode.disconnect(); } catch (e) {}
  };
  source.start();
};

export function useGameSoundManager(gameType: GameType) {
  const isActiveRef = useRef(true);

  // Initialize audio on first interaction
  useEffect(() => {
    const init = () => initAudioContext();
    document.addEventListener('click', init, { once: true });
    document.addEventListener('touchstart', init, { once: true });
    
    return () => {
      document.removeEventListener('click', init);
      document.removeEventListener('touchstart', init);
    };
  }, []);

  // When this game mounts, stop previous game's sounds and set this as active
  useEffect(() => {
    if (gameType && activeGame !== gameType) {
      stopAllSoundsGlobal();
      activeGame = gameType;
    }
    isActiveRef.current = true;

    // Pause/resume sounds on visibility change
    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopAllSoundsGlobal();
        if (globalAudioContext?.state === 'running') {
          globalAudioContext.suspend();
        }
      } else if (!isMuted && activeGame === gameType) {
        if (globalAudioContext?.state === 'suspended') {
          globalAudioContext.resume();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isActiveRef.current = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      // When this game unmounts, stop its sounds
      if (activeGame === gameType) {
        stopAllSoundsGlobal();
        activeGame = null;
      }
    };
  }, [gameType]);

  const setMuted = useCallback((muted: boolean) => {
    isMuted = muted;
    if (globalMasterGain) {
      globalMasterGain.gain.value = muted ? 0 : volume;
    }
  }, []);

  const setVolume = useCallback((newVolume: number) => {
    volume = Math.max(0, Math.min(1, newVolume));
    if (globalMasterGain && !isMuted) {
      globalMasterGain.gain.value = volume;
    }
  }, []);

  const stopAllSounds = useCallback(() => {
    stopAllSoundsGlobal();
  }, []);

  // ==========================================
  // COMMON SOUNDS - Used by all games
  // ==========================================
  
  // Chip/Bet placement sound - realistic casino chip
  const playBetSound = useCallback(() => {
    if (!isActiveRef.current || activeGame !== gameType) return;
    initAudioContext();
    
    // Chip click sound
    playToneGlobal(2500, 0.04, 'square', 0.15, 0.001, 0.01);
    playToneGlobal(3500, 0.03, 'sine', 0.1, 0.001, 0.005);
    
    // Chip landing on felt
    setTimeout(() => {
      playFilteredNoise(0.06, 'highpass', 4000, 0.08, 'white');
      playToneGlobal(800, 0.05, 'sine', 0.08);
    }, 20);
    
    // Secondary click
    setTimeout(() => {
      playToneGlobal(2000, 0.02, 'square', 0.06);
    }, 40);
  }, [gameType]);

  // Victory fanfare - diamonds pouring
  const playWinSound = useCallback(() => {
    if (!isActiveRef.current || activeGame !== gameType) return;
    initAudioContext();
    
    // Victory fanfare notes (C major arpeggio)
    const notes = [523, 659, 784, 1047, 1319, 1568];
    notes.forEach((freq, i) => {
      setTimeout(() => {
        if (!isActiveRef.current || activeGame !== gameType) return;
        playRichTone(freq, 0.4, 'sine', 0.25);
        // Shimmer effect
        playToneGlobal(freq * 2, 0.2, 'triangle', 0.08);
      }, i * 100);
    });
    
    // Diamond shower sound
    setTimeout(() => {
      for (let i = 0; i < 12; i++) {
        setTimeout(() => {
          if (!isActiveRef.current || activeGame !== gameType) return;
          playToneGlobal(3000 + Math.random() * 2000, 0.08, 'sine', 0.1);
          playToneGlobal(4000 + Math.random() * 1500, 0.05, 'triangle', 0.05);
        }, i * 50);
      }
    }, 400);
    
    // Big impact
    setTimeout(() => {
      if (!isActiveRef.current || activeGame !== gameType) return;
      playToneGlobal(150, 0.3, 'sine', 0.2);
      playToneGlobal(200, 0.25, 'triangle', 0.15);
    }, 800);
  }, [gameType]);

  // Lose sound - descending sad tones
  const playLoseSound = useCallback(() => {
    if (!isActiveRef.current || activeGame !== gameType) return;
    initAudioContext();
    
    // Descending minor notes
    const notes = [440, 392, 349, 294, 262];
    notes.forEach((freq, i) => {
      setTimeout(() => {
        if (!isActiveRef.current || activeGame !== gameType) return;
        playToneGlobal(freq, 0.25, 'sine', 0.12);
        playToneGlobal(freq * 0.5, 0.3, 'triangle', 0.06);
      }, i * 120);
    });
    
    // Low rumble
    setTimeout(() => {
      playFilteredNoise(0.3, 'lowpass', 200, 0.08, 'brown');
    }, 400);
  }, [gameType]);

  // Diamond collection sound
  const playDiamondSound = useCallback(() => {
    if (!isActiveRef.current || activeGame !== gameType) return;
    initAudioContext();
    
    const frequencies = [2500, 3000, 3500, 4000, 4500];
    frequencies.forEach((freq, i) => {
      setTimeout(() => {
        if (!isActiveRef.current || activeGame !== gameType) return;
        playToneGlobal(freq, 0.1, 'sine', 0.12);
        playToneGlobal(freq * 1.5, 0.06, 'triangle', 0.05);
      }, i * 40);
    });
  }, [gameType]);

  // Timer tick sound
  const playTickSound = useCallback(() => {
    if (!isActiveRef.current || activeGame !== gameType) return;
    initAudioContext();
    playToneGlobal(1500, 0.03, 'square', 0.08, 0.001, 0.005);
  }, [gameType]);
  
  // Countdown beep (for 3-2-1 countdown)
  const playCountdownBeep = useCallback((isLast: boolean = false) => {
    if (!isActiveRef.current || activeGame !== gameType) return;
    initAudioContext();
    
    if (isLast) {
      // Final beep - higher and longer
      playRichTone(880, 0.4, 'sine', 0.3);
      playToneGlobal(1760, 0.3, 'triangle', 0.15);
    } else {
      // Regular countdown beep
      playToneGlobal(660, 0.15, 'sine', 0.2);
      playToneGlobal(1320, 0.1, 'triangle', 0.08);
    }
  }, [gameType]);

  // ==========================================
  // ROULETTE SPECIFIC SOUNDS
  // ==========================================
  
  const playRouletteWheelSpin = useCallback(() => {
    if (!isActiveRef.current || activeGame !== 'roulette') return;
    initAudioContext();
    if (!globalAudioContext || !globalMasterGain) return;

    const ctx = globalAudioContext;
    
    // Mechanical wheel rumble
    const rumbleBuffer = createNoiseBufferGlobal(5, 'brown');
    if (rumbleBuffer) {
      const source = ctx.createBufferSource();
      const gainNode = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      source.buffer = rumbleBuffer;
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(250, ctx.currentTime);
      filter.frequency.linearRampToValueAtTime(80, ctx.currentTime + 4.5);

      gainNode.gain.setValueAtTime(0.2, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 4);
      gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + 5);

      source.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(globalMasterGain);

      activeBufferSources.add(source);
      source.onended = () => {
        activeBufferSources.delete(source);
        try { source.disconnect(); filter.disconnect(); gainNode.disconnect(); } catch (e) {}
      };
      source.start();
    }

    // Ball clicking on wheel dividers - starts fast, slows down
    let clickDelay = 40;
    let totalTime = 0;
    const maxTime = 4500;

    const playClick = () => {
      if (totalTime > maxTime || isMuted || !isActiveRef.current || activeGame !== 'roulette') return;
      
      // Metallic click
      const clickFreq = 700 + Math.random() * 500;
      playToneGlobal(clickFreq, 0.025, 'square', 0.06);
      playToneGlobal(clickFreq * 1.5, 0.015, 'sine', 0.03);
      
      clickDelay = Math.min(350, clickDelay * 1.06);
      totalTime += clickDelay;
      setTimeout(playClick, clickDelay);
    };
    playClick();

    // Final ball drop sound
    setTimeout(() => {
      if (isActiveRef.current && activeGame === 'roulette') {
        // Ball settling in pocket
        playToneGlobal(350, 0.12, 'sine', 0.2);
        playToneGlobal(250, 0.15, 'triangle', 0.12);
        playFilteredNoise(0.1, 'lowpass', 300, 0.1, 'brown');
      }
    }, 4600);
  }, [gameType]);

  const playRouletteBallDrop = useCallback(() => {
    if (!isActiveRef.current || activeGame !== 'roulette') return;
    initAudioContext();
    
    // Ball bouncing in pocket
    const bounces = [0, 60, 110, 150, 180, 200];
    bounces.forEach((delay, i) => {
      setTimeout(() => {
        if (isActiveRef.current && activeGame === 'roulette') {
          const freq = 500 - i * 50;
          const gain = 0.15 - i * 0.02;
          playToneGlobal(freq, 0.05, 'sine', gain);
          playFilteredNoise(0.03, 'bandpass', 800 - i * 80, 0.05, 'white');
        }
      }, delay);
    });
  }, [gameType]);

  // ==========================================
  // FERRIS WHEEL SPECIFIC SOUNDS
  // ==========================================
  
  const playFerrisWheelSpin = useCallback(() => {
    if (!isActiveRef.current || activeGame !== 'ferris-wheel') return;
    initAudioContext();
    if (!globalAudioContext || !globalMasterGain) return;

    const ctx = globalAudioContext;
    
    // Mechanical wheel whirring
    const whirBuffer = createNoiseBufferGlobal(5, 'pink');
    if (whirBuffer) {
      const source = ctx.createBufferSource();
      const gainNode = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      source.buffer = whirBuffer;
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(500, ctx.currentTime);
      filter.frequency.linearRampToValueAtTime(200, ctx.currentTime + 4.5);
      filter.Q.value = 3;

      gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.03, ctx.currentTime + 4);
      gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + 5);

      source.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(globalMasterGain);

      activeBufferSources.add(source);
      source.onended = () => {
        activeBufferSources.delete(source);
        try { source.disconnect(); filter.disconnect(); gainNode.disconnect(); } catch (e) {}
      };
      source.start();
    }

    // Carnival music box chimes
    const notes = [659, 784, 880, 1047, 1175, 1319, 1568, 1760];
    let noteIndex = 0;
    let delay = 60;
    let totalTime = 0;

    const playChime = () => {
      if (totalTime > 4500 || isMuted || !isActiveRef.current || activeGame !== 'ferris-wheel') return;
      const freq = notes[noteIndex % notes.length];
      playToneGlobal(freq, 0.2, 'sine', 0.1);
      playToneGlobal(freq * 2, 0.12, 'triangle', 0.03);
      noteIndex++;
      delay = Math.min(280, delay * 1.08);
      totalTime += delay;
      setTimeout(playChime, delay);
    };
    playChime();

    // Ticker/pointer sound on each segment
    let tickDelay = 50;
    let tickTime = 0;
    const playTick = () => {
      if (tickTime > 4500 || isMuted || !isActiveRef.current || activeGame !== 'ferris-wheel') return;
      playToneGlobal(2000, 0.02, 'square', 0.05);
      tickDelay = Math.min(300, tickDelay * 1.07);
      tickTime += tickDelay;
      setTimeout(playTick, tickDelay);
    };
    playTick();
  }, [gameType]);

  const playFerrisWheelStop = useCallback(() => {
    if (!isActiveRef.current || activeGame !== 'ferris-wheel') return;
    initAudioContext();
    
    // Victory chime
    playRichTone(1047, 0.5, 'sine', 0.25);
    setTimeout(() => {
      playRichTone(1319, 0.4, 'sine', 0.2);
    }, 100);
    setTimeout(() => {
      playRichTone(1568, 0.5, 'sine', 0.25);
    }, 200);
    
    // Bell ding
    setTimeout(() => {
      playToneGlobal(2093, 0.3, 'sine', 0.15);
      playToneGlobal(4186, 0.2, 'triangle', 0.05);
    }, 350);
  }, [gameType]);

  // ==========================================
  // TEEN PATTI SPECIFIC SOUNDS
  // ==========================================
  
  const playCardShuffle = useCallback(() => {
    if (!isActiveRef.current || activeGame !== 'teen-patti') return;
    initAudioContext();
    if (!globalAudioContext || !globalMasterGain) return;

    // Multiple card shuffle sounds
    for (let i = 0; i < 10; i++) {
      setTimeout(() => {
        if (!isActiveRef.current || activeGame !== 'teen-patti') return;
        // Card flutter
        playFilteredNoise(0.06, 'highpass', 3500 + Math.random() * 1000, 0.1, 'white');
        // Table thump
        playToneGlobal(80 + Math.random() * 40, 0.04, 'sine', 0.05);
      }, i * 60 + Math.random() * 20);
    }
    
    // Final riffle
    setTimeout(() => {
      if (!isActiveRef.current || activeGame !== 'teen-patti') return;
      for (let j = 0; j < 5; j++) {
        setTimeout(() => {
          playFilteredNoise(0.04, 'highpass', 4000, 0.08, 'white');
        }, j * 30);
      }
    }, 600);
  }, [gameType]);

  const playCardDeal = useCallback(() => {
    if (!isActiveRef.current || activeGame !== 'teen-patti') return;
    initAudioContext();
    
    // Card sliding on felt
    playFilteredNoise(0.08, 'highpass', 2800, 0.15, 'white');
    
    // Card landing
    setTimeout(() => {
      if (isActiveRef.current && activeGame === 'teen-patti') {
        playToneGlobal(120, 0.04, 'sine', 0.1);
        playFilteredNoise(0.03, 'lowpass', 500, 0.06, 'brown');
      }
    }, 60);
  }, [gameType]);

  const playCardReveal = useCallback(() => {
    if (!isActiveRef.current || activeGame !== 'teen-patti') return;
    initAudioContext();
    
    // Card flip sound
    playFilteredNoise(0.06, 'highpass', 3000, 0.12, 'white');
    
    // Musical reveal (rising notes)
    setTimeout(() => {
      playToneGlobal(523, 0.12, 'sine', 0.12);
    }, 50);
    setTimeout(() => {
      playToneGlobal(659, 0.12, 'sine', 0.1);
    }, 120);
    setTimeout(() => {
      playToneGlobal(784, 0.15, 'sine', 0.12);
    }, 190);
  }, [gameType]);

  // ==========================================
  // ROCKET RACE SPECIFIC SOUNDS
  // ==========================================
  
  const playRocketCountdown = useCallback(() => {
    if (!isActiveRef.current || activeGame !== 'rocket-race') return;
    initAudioContext();
    
    // Alarm/siren countdown
    playToneGlobal(800, 0.3, 'square', 0.15);
    playToneGlobal(600, 0.25, 'sawtooth', 0.1);
  }, [gameType]);

  const playRocketLaunch = useCallback(() => {
    if (!isActiveRef.current || activeGame !== 'rocket-race') return;
    initAudioContext();
    if (!globalAudioContext || !globalMasterGain) return;

    const ctx = globalAudioContext;
    
    // Initial ignition burst
    playToneGlobal(100, 0.2, 'sawtooth', 0.3);
    playFilteredNoise(0.3, 'lowpass', 400, 0.25, 'brown');
    
    // Engine roar - sustained
    const roarBuffer = createNoiseBufferGlobal(4, 'brown');
    if (roarBuffer) {
      const source = ctx.createBufferSource();
      const gainNode = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      const filter2 = ctx.createBiquadFilter();

      source.buffer = roarBuffer;
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(150, ctx.currentTime);
      filter.frequency.linearRampToValueAtTime(300, ctx.currentTime + 0.5);
      filter.frequency.linearRampToValueAtTime(200, ctx.currentTime + 3.5);
      
      filter2.type = 'highpass';
      filter2.frequency.value = 30;

      gainNode.gain.setValueAtTime(0, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.35, ctx.currentTime + 0.3);
      gainNode.gain.setValueAtTime(0.35, ctx.currentTime + 3);
      gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + 4);

      source.connect(filter);
      filter.connect(filter2);
      filter2.connect(gainNode);
      gainNode.connect(globalMasterGain);

      activeBufferSources.add(source);
      source.onended = () => {
        activeBufferSources.delete(source);
        try { source.disconnect(); filter.disconnect(); filter2.disconnect(); gainNode.disconnect(); } catch (e) {}
      };
      source.start();
    }

    // Crackling flames
    let crackleCount = 0;
    const playCrackle = () => {
      if (crackleCount > 30 || isMuted || !isActiveRef.current || activeGame !== 'rocket-race') return;
      playFilteredNoise(0.03, 'bandpass', 800 + Math.random() * 600, 0.06, 'white');
      playToneGlobal(50 + Math.random() * 30, 0.02, 'sawtooth', 0.04);
      crackleCount++;
      setTimeout(playCrackle, 80 + Math.random() * 60);
    };
    setTimeout(playCrackle, 200);

    // Whoosh as rocket accelerates
    setTimeout(() => {
      if (!isActiveRef.current || activeGame !== 'rocket-race') return;
      playFilteredNoise(0.5, 'highpass', 500, 0.1, 'pink');
    }, 500);
  }, [gameType]);

  const playRocketBoost = useCallback(() => {
    if (!isActiveRef.current || activeGame !== 'rocket-race') return;
    initAudioContext();
    
    // Boost burst
    playToneGlobal(150, 0.15, 'sawtooth', 0.2);
    playFilteredNoise(0.2, 'lowpass', 300, 0.15, 'brown');
    playToneGlobal(80, 0.2, 'sine', 0.1);
  }, [gameType]);

  const playRocketWin = useCallback(() => {
    if (!isActiveRef.current || activeGame !== 'rocket-race') return;
    initAudioContext();
    
    // Victory explosion
    playFilteredNoise(0.3, 'lowpass', 400, 0.2, 'brown');
    playToneGlobal(100, 0.25, 'sine', 0.15);
    
    // Fireworks
    setTimeout(() => {
      for (let i = 0; i < 8; i++) {
        setTimeout(() => {
          if (!isActiveRef.current || activeGame !== 'rocket-race') return;
          playToneGlobal(1500 + Math.random() * 2000, 0.15, 'sine', 0.12);
          playFilteredNoise(0.08, 'highpass', 4000, 0.06, 'white');
        }, i * 80);
      }
    }, 200);
    
    // Victory fanfare
    setTimeout(() => {
      const notes = [784, 988, 1175, 1568];
      notes.forEach((freq, i) => {
        setTimeout(() => {
          if (!isActiveRef.current || activeGame !== 'rocket-race') return;
          playRichTone(freq, 0.35, 'sine', 0.2);
        }, i * 100);
      });
    }, 500);
  }, [gameType]);

  const playRocketExplode = useCallback(() => {
    if (!isActiveRef.current || activeGame !== 'rocket-race') return;
    initAudioContext();
    
    // Explosion
    playFilteredNoise(0.4, 'lowpass', 200, 0.3, 'brown');
    playToneGlobal(60, 0.35, 'sawtooth', 0.2);
    
    // Debris
    setTimeout(() => {
      for (let i = 0; i < 6; i++) {
        setTimeout(() => {
          if (!isActiveRef.current || activeGame !== 'rocket-race') return;
          playFilteredNoise(0.05, 'bandpass', 1000 + Math.random() * 1500, 0.05, 'white');
        }, i * 50);
      }
    }, 150);
  }, [gameType]);

  // ==========================================
  // DICE SPECIFIC SOUNDS
  // ==========================================
  
  const playDiceRoll = useCallback(() => {
    if (!isActiveRef.current || activeGame !== 'dice') return;
    initAudioContext();
    
    // Dice shaking in cup/hand
    for (let i = 0; i < 6; i++) {
      setTimeout(() => {
        if (!isActiveRef.current || activeGame !== 'dice') return;
        playToneGlobal(400 + Math.random() * 200, 0.04, 'square', 0.1);
        playFilteredNoise(0.03, 'highpass', 3000, 0.06, 'white');
      }, i * 80);
    }
  }, [gameType]);

  const playDiceLand = useCallback(() => {
    if (!isActiveRef.current || activeGame !== 'dice') return;
    initAudioContext();
    
    // Dice bouncing on table
    const bounces = [0, 80, 140, 190, 230];
    bounces.forEach((delay, i) => {
      setTimeout(() => {
        if (!isActiveRef.current || activeGame !== 'dice') return;
        playToneGlobal(300 - i * 30, 0.05, 'square', 0.12 - i * 0.02);
        playFilteredNoise(0.03, 'bandpass', 1500, 0.04, 'white');
      }, delay);
    });
    
    // Final settle
    setTimeout(() => {
      playToneGlobal(150, 0.08, 'sine', 0.1);
    }, 280);
  }, [gameType]);

  return {
    setMuted,
    setVolume,
    stopAllSounds,
    
    // Common
    playBetSound,
    playWinSound,
    playLoseSound,
    playDiamondSound,
    playTickSound,
    playCountdownBeep,
    
    // Roulette
    playRouletteWheelSpin,
    playRouletteBallDrop,
    
    // Ferris Wheel
    playFerrisWheelSpin,
    playFerrisWheelStop,
    
    // Teen Patti
    playCardShuffle,
    playCardDeal,
    playCardReveal,
    
    // Rocket Race
    playRocketCountdown,
    playRocketLaunch,
    playRocketBoost,
    playRocketWin,
    playRocketExplode,
    
    // Dice
    playDiceRoll,
    playDiceLand,
  };
}

// Export function to stop all sounds globally (for use when closing game board)
export const stopAllGameSounds = () => {
  stopAllSoundsGlobal();
  activeGame = null;
};
