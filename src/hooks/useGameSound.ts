import { useRef, useCallback, useEffect, useState } from 'react';

// Game sound effects using Web Audio API with volume control
export function useGameSound() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const [volume, setVolumeState] = useState(0.5);
  const isMutedRef = useRef(false);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode | OscillatorNode>>(new Set());

  useEffect(() => {
    const initAudio = () => {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        masterGainRef.current = audioContextRef.current.createGain();
        masterGainRef.current.connect(audioContextRef.current.destination);
        masterGainRef.current.gain.value = 0.5;
      }
    };
    
    document.addEventListener('click', initAudio, { once: true });
    document.addEventListener('touchstart', initAudio, { once: true });
    
    // Pause sounds when page/tab loses visibility
    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (masterGainRef.current) masterGainRef.current.gain.value = 0;
        if (audioContextRef.current?.state === 'running') {
          audioContextRef.current.suspend();
        }
      } else if (!isMutedRef.current) {
        if (audioContextRef.current?.state === 'suspended') {
          audioContextRef.current.resume();
        }
        if (masterGainRef.current) masterGainRef.current.gain.value = volume;
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Cleanup function - stop all sounds when component unmounts
    return () => {
      document.removeEventListener('click', initAudio);
      document.removeEventListener('touchstart', initAudio);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      
      // Stop all active audio sources
      activeSourcesRef.current.forEach(source => {
        try {
          source.stop();
        } catch (e) {
          // Source may have already stopped
        }
      });
      activeSourcesRef.current.clear();
      
      // Close AudioContext entirely on unmount
      if (audioContextRef.current) {
        try {
          audioContextRef.current.close();
        } catch (e) {}
        audioContextRef.current = null;
        masterGainRef.current = null;
      }
    };
  }, []);

  const setVolume = useCallback((newVolume: number) => {
    const vol = Math.max(0, Math.min(1, newVolume));
    setVolumeState(vol);
    if (masterGainRef.current) {
      masterGainRef.current.gain.value = vol;
    }
  }, []);

  const playTone = useCallback((frequency: number, duration: number, type: OscillatorType = 'sine', gain = 0.3) => {
    if (isMutedRef.current || !audioContextRef.current || !masterGainRef.current) return;
    
    const ctx = audioContextRef.current;
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);
    
    gainNode.gain.setValueAtTime(gain, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
    
    oscillator.connect(gainNode);
    gainNode.connect(masterGainRef.current);
    
    // Track active source for cleanup
    activeSourcesRef.current.add(oscillator);
    oscillator.onended = () => activeSourcesRef.current.delete(oscillator);
    
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration);
  }, []);

  // Dragon roar - deep rumbling with reverb
  const playDragonRoar = useCallback(() => {
    if (!audioContextRef.current) return;
    
    for (let i = 0; i < 6; i++) {
      setTimeout(() => {
        playTone(60 + Math.random() * 30, 0.4, 'sawtooth', 0.25);
        playTone(100 + Math.random() * 50, 0.3, 'triangle', 0.2);
        playTone(140 + Math.random() * 40, 0.25, 'square', 0.1);
      }, i * 60);
    }
  }, [playTone]);

  // Tiger growl - fierce higher pitched
  const playTigerGrowl = useCallback(() => {
    if (!audioContextRef.current) return;
    
    for (let i = 0; i < 5; i++) {
      setTimeout(() => {
        playTone(130 + Math.random() * 70, 0.3, 'sawtooth', 0.22);
        playTone(180 + Math.random() * 80, 0.25, 'square', 0.12);
        playTone(220 + Math.random() * 60, 0.2, 'triangle', 0.08);
      }, i * 45);
    }
  }, [playTone]);

  // Epic win sound - triumphant fanfare
  const playWinSound = useCallback(() => {
    const notes = [523, 659, 784, 880, 1047, 1319]; // C5, E5, G5, A5, C6, E6
    notes.forEach((freq, i) => {
      setTimeout(() => {
        playTone(freq, 0.4, 'sine', 0.3);
        playTone(freq * 0.5, 0.5, 'triangle', 0.15); // Harmony
      }, i * 80);
    });
  }, [playTone]);

  // Lose sound - descending
  const playLoseSound = useCallback(() => {
    const notes = [400, 350, 300, 250];
    notes.forEach((freq, i) => {
      setTimeout(() => playTone(freq, 0.25, 'sawtooth', 0.18), i * 100);
    });
  }, [playTone]);

  // Bet placed sound - satisfying click
  const playBetSound = useCallback(() => {
    playTone(900, 0.08, 'sine', 0.25);
    setTimeout(() => playTone(1200, 0.1, 'sine', 0.2), 40);
    setTimeout(() => playTone(1500, 0.08, 'triangle', 0.15), 80);
  }, [playTone]);

  // Card flip sound
  const playCardFlip = useCallback(() => {
    if (!audioContextRef.current || !masterGainRef.current) return;
    const ctx = audioContextRef.current;
    
    const bufferSize = ctx.sampleRate * 0.06;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
    }
    
    const source = ctx.createBufferSource();
    const gainNode = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    
    source.buffer = buffer;
    filter.type = 'highpass';
    filter.frequency.value = 2500;
    gainNode.gain.setValueAtTime(0.2, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.06);
    
    source.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(masterGainRef.current);
    
    source.start();
  }, []);

  // Coin cascade sound
  const playCoinSound = useCallback(() => {
    const frequencies = [2000, 2500, 3000, 3500, 4000];
    frequencies.forEach((freq, i) => {
      setTimeout(() => playTone(freq, 0.1, 'sine', 0.18), i * 25);
    });
  }, [playTone]);

  // Crash/explosion sound - dramatic
  const playCrashSound = useCallback(() => {
    if (!audioContextRef.current || !masterGainRef.current) return;
    const ctx = audioContextRef.current;
    
    const bufferSize = ctx.sampleRate * 0.4;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
      const decay = Math.exp(-i / (bufferSize * 0.08));
      data[i] = (Math.random() * 2 - 1) * decay;
    }
    
    const source = ctx.createBufferSource();
    const gainNode = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    
    source.buffer = buffer;
    filter.type = 'lowpass';
    filter.frequency.value = 800;
    gainNode.gain.setValueAtTime(0.5, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
    
    source.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(masterGainRef.current);
    
    source.start();
    
    // Add impact
    playTone(100, 0.3, 'sawtooth', 0.3);
  }, [playTone]);

  // Tick sound for timer
  const playTickSound = useCallback(() => {
    playTone(1200, 0.04, 'sine', 0.12);
  }, [playTone]);

  // Wheel spin sound - accelerating clicks
  const playSpinSound = useCallback(() => {
    let freq = 300;
    let delay = 100;
    const playClick = (f: number) => {
      playTone(f, 0.03, 'square', 0.12);
    };
    
    for (let i = 0; i < 20; i++) {
      setTimeout(() => playClick(freq + i * 30), i * delay);
      delay = Math.max(30, delay - 5);
    }
  }, [playTone]);

  // Dice roll sound - rattling
  const playDiceRoll = useCallback(() => {
    for (let i = 0; i < 15; i++) {
      setTimeout(() => {
        playTone(600 + Math.random() * 600, 0.04, 'square', 0.08);
        if (i % 3 === 0) playTone(300 + Math.random() * 200, 0.06, 'triangle', 0.1);
      }, i * 40 + Math.random() * 15);
    }
  }, [playTone]);

  // Rocket launch sound
  const playRocketSound = useCallback(() => {
    if (!audioContextRef.current || !masterGainRef.current) return;
    const ctx = audioContextRef.current;
    
    // Rising pitch
    for (let i = 0; i < 10; i++) {
      setTimeout(() => {
        playTone(200 + i * 50, 0.15, 'sawtooth', 0.15);
      }, i * 80);
    }
    
    // Rumble
    const bufferSize = ctx.sampleRate * 0.5;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.3 * Math.sin(i / 100);
    }
    
    const source = ctx.createBufferSource();
    const gainNode = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    
    source.buffer = buffer;
    filter.type = 'lowpass';
    filter.frequency.value = 300;
    gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
    
    source.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(masterGainRef.current);
    
    source.start();
  }, [playTone]);

  // Plink sound for plinko
  const playPlinkSound = useCallback(() => {
    const freq = 800 + Math.random() * 800;
    playTone(freq, 0.08, 'sine', 0.2);
    setTimeout(() => playTone(freq * 1.5, 0.06, 'triangle', 0.1), 20);
  }, [playTone]);

  // Slot spin sound
  const playSlotSound = useCallback(() => {
    for (let i = 0; i < 8; i++) {
      setTimeout(() => {
        playTone(400 + (i % 3) * 200, 0.05, 'square', 0.1);
      }, i * 60);
    }
  }, [playTone]);

  // Jackpot sound
  const playJackpotSound = useCallback(() => {
    const melody = [523, 659, 784, 1047, 1319, 1568, 2093];
    melody.forEach((freq, i) => {
      setTimeout(() => {
        playTone(freq, 0.3, 'sine', 0.25);
        playTone(freq * 0.5, 0.4, 'triangle', 0.15);
        playTone(freq * 1.5, 0.2, 'sine', 0.1);
      }, i * 100);
    });
  }, [playTone]);

  const setMuted = useCallback((muted: boolean) => {
    isMutedRef.current = muted;
    // Also adjust gain immediately when muting
    if (masterGainRef.current) {
      masterGainRef.current.gain.value = muted ? 0 : volume;
    }
  }, [volume]);

  // Stop all sounds - call this when leaving the game
  const stopAllSounds = useCallback(() => {
    activeSourcesRef.current.forEach(source => {
      try {
        source.stop();
      } catch (e) {
        // Source may have already stopped
      }
    });
    activeSourcesRef.current.clear();
    
    if (masterGainRef.current) {
      masterGainRef.current.gain.value = 0;
    }
  }, []);

  return {
    volume,
    setVolume,
    playDragonRoar,
    playTigerGrowl,
    playWinSound,
    playLoseSound,
    playBetSound,
    playCardFlip,
    playCoinSound,
    playCrashSound,
    playTickSound,
    playSpinSound,
    playDiceRoll,
    playRocketSound,
    playPlinkSound,
    playSlotSound,
    playJackpotSound,
    setMuted,
    stopAllSounds
  };
}
