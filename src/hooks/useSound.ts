import { useCallback, useRef, useEffect } from 'react';

// Sound types
type SoundType = 'ringtone' | 'notification' | 'message' | 'coin' | 'gift' | 'call-end' | 'call-connect';

// Generate sounds using Web Audio API (no external files needed)
const createAudioContext = () => {
  return new (window.AudioContext || (window as any).webkitAudioContext)();
};

// Apple-style Premium Ringtone (similar to Reflection/Opening)
const playRingtone = (audioContext: AudioContext, gainNode: GainNode) => {
  // Apple-inspired marimba/xylophone-like tones with harmonics
  const notes = [
    { freq: 1046.50, time: 0, duration: 0.15 },      // C6
    { freq: 1318.51, time: 0.15, duration: 0.15 },   // E6
    { freq: 1567.98, time: 0.30, duration: 0.15 },   // G6
    { freq: 2093.00, time: 0.45, duration: 0.20 },   // C7 (high)
    { freq: 1567.98, time: 0.70, duration: 0.12 },   // G6
    { freq: 1318.51, time: 0.85, duration: 0.12 },   // E6
    { freq: 1046.50, time: 1.00, duration: 0.15 },   // C6
    { freq: 1174.66, time: 1.20, duration: 0.15 },   // D6
    { freq: 1318.51, time: 1.40, duration: 0.20 },   // E6
    { freq: 1567.98, time: 1.65, duration: 0.25 },   // G6
  ];

  notes.forEach(({ freq, time, duration }) => {
    // Main tone (sine for clarity)
    const mainOsc = audioContext.createOscillator();
    const mainGain = audioContext.createGain();
    
    mainOsc.type = 'sine';
    mainOsc.frequency.setValueAtTime(freq, audioContext.currentTime + time);
    
    // Soft attack, natural decay (like a marimba/bell)
    mainGain.gain.setValueAtTime(0, audioContext.currentTime + time);
    mainGain.gain.linearRampToValueAtTime(0.35, audioContext.currentTime + time + 0.02);
    mainGain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + time + duration + 0.1);
    
    mainOsc.connect(mainGain);
    mainGain.connect(gainNode);
    
    mainOsc.start(audioContext.currentTime + time);
    mainOsc.stop(audioContext.currentTime + time + duration + 0.15);

    // Add harmonic overtone for richness (triangle wave at 2x frequency)
    const harmonicOsc = audioContext.createOscillator();
    const harmonicGain = audioContext.createGain();
    
    harmonicOsc.type = 'triangle';
    harmonicOsc.frequency.setValueAtTime(freq * 2, audioContext.currentTime + time);
    
    harmonicGain.gain.setValueAtTime(0, audioContext.currentTime + time);
    harmonicGain.gain.linearRampToValueAtTime(0.08, audioContext.currentTime + time + 0.01);
    harmonicGain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + time + duration * 0.6);
    
    harmonicOsc.connect(harmonicGain);
    harmonicGain.connect(gainNode);
    
    harmonicOsc.start(audioContext.currentTime + time);
    harmonicOsc.stop(audioContext.currentTime + time + duration + 0.1);

    // Add subtle low undertone for warmth
    if (freq < 1500) {
      const undertoneOsc = audioContext.createOscillator();
      const undertoneGain = audioContext.createGain();
      
      undertoneOsc.type = 'sine';
      undertoneOsc.frequency.setValueAtTime(freq / 2, audioContext.currentTime + time);
      
      undertoneGain.gain.setValueAtTime(0, audioContext.currentTime + time);
      undertoneGain.gain.linearRampToValueAtTime(0.12, audioContext.currentTime + time + 0.02);
      undertoneGain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + time + duration * 0.8);
      
      undertoneOsc.connect(undertoneGain);
      undertoneGain.connect(gainNode);
      
      undertoneOsc.start(audioContext.currentTime + time);
      undertoneOsc.stop(audioContext.currentTime + time + duration + 0.1);
    }
  });
};

// Notification sound (short pleasant chime)
const playNotificationSound = (audioContext: AudioContext, gainNode: GainNode) => {
  const frequencies = [880, 1108.73, 1318.51]; // A5, C#6, E6 - major chord
  
  frequencies.forEach((freq, i) => {
    const oscillator = audioContext.createOscillator();
    const noteGain = audioContext.createGain();
    
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(freq, audioContext.currentTime);
    
    noteGain.gain.setValueAtTime(0.2, audioContext.currentTime + i * 0.05);
    noteGain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
    
    oscillator.connect(noteGain);
    noteGain.connect(gainNode);
    
    oscillator.start(audioContext.currentTime + i * 0.05);
    oscillator.stop(audioContext.currentTime + 0.5);
  });
};

// Message sound (simple pop)
const playMessageSound = (audioContext: AudioContext, gainNode: GainNode) => {
  const oscillator = audioContext.createOscillator();
  const noteGain = audioContext.createGain();
  
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(1200, audioContext.currentTime + 0.1);
  
  noteGain.gain.setValueAtTime(0.3, audioContext.currentTime);
  noteGain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);
  
  oscillator.connect(noteGain);
  noteGain.connect(gainNode);
  
  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + 0.2);
};

// Coin sound (cheerful bling)
const playCoinSound = (audioContext: AudioContext, gainNode: GainNode) => {
  const frequencies = [1318.51, 1567.98, 2093]; // E6, G6, C7
  
  frequencies.forEach((freq, i) => {
    const oscillator = audioContext.createOscillator();
    const noteGain = audioContext.createGain();
    
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(freq, audioContext.currentTime + i * 0.08);
    
    noteGain.gain.setValueAtTime(0.25, audioContext.currentTime + i * 0.08);
    noteGain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + i * 0.08 + 0.2);
    
    oscillator.connect(noteGain);
    noteGain.connect(gainNode);
    
    oscillator.start(audioContext.currentTime + i * 0.08);
    oscillator.stop(audioContext.currentTime + i * 0.08 + 0.25);
  });
};

// Gift sound (magical sparkle)
const playGiftSound = (audioContext: AudioContext, gainNode: GainNode) => {
  // Create sparkle effect with multiple high frequencies
  for (let i = 0; i < 6; i++) {
    const oscillator = audioContext.createOscillator();
    const noteGain = audioContext.createGain();
    
    oscillator.type = 'sine';
    const baseFreq = 1500 + Math.random() * 1000;
    oscillator.frequency.setValueAtTime(baseFreq, audioContext.currentTime + i * 0.05);
    
    noteGain.gain.setValueAtTime(0.15, audioContext.currentTime + i * 0.05);
    noteGain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + i * 0.05 + 0.15);
    
    oscillator.connect(noteGain);
    noteGain.connect(gainNode);
    
    oscillator.start(audioContext.currentTime + i * 0.05);
    oscillator.stop(audioContext.currentTime + i * 0.05 + 0.2);
  }
};

// Call connect sound (success tone)
const playCallConnectSound = (audioContext: AudioContext, gainNode: GainNode) => {
  const frequencies = [523.25, 659.25, 783.99]; // C5, E5, G5 - ascending
  
  frequencies.forEach((freq, i) => {
    const oscillator = audioContext.createOscillator();
    const noteGain = audioContext.createGain();
    
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(freq, audioContext.currentTime + i * 0.15);
    
    noteGain.gain.setValueAtTime(0.25, audioContext.currentTime + i * 0.15);
    noteGain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + i * 0.15 + 0.2);
    
    oscillator.connect(noteGain);
    noteGain.connect(gainNode);
    
    oscillator.start(audioContext.currentTime + i * 0.15);
    oscillator.stop(audioContext.currentTime + i * 0.15 + 0.25);
  });
};

// Call end sound (descending tone)
const playCallEndSound = (audioContext: AudioContext, gainNode: GainNode) => {
  const frequencies = [783.99, 659.25, 523.25]; // G5, E5, C5 - descending
  
  frequencies.forEach((freq, i) => {
    const oscillator = audioContext.createOscillator();
    const noteGain = audioContext.createGain();
    
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(freq, audioContext.currentTime + i * 0.12);
    
    noteGain.gain.setValueAtTime(0.2, audioContext.currentTime + i * 0.12);
    noteGain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + i * 0.12 + 0.15);
    
    oscillator.connect(noteGain);
    noteGain.connect(gainNode);
    
    oscillator.start(audioContext.currentTime + i * 0.12);
    oscillator.stop(audioContext.currentTime + i * 0.12 + 0.2);
  });
};

export function useSound() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const ringtoneIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isPlayingRingtoneRef = useRef(false);

  // Initialize audio context on first interaction
  const initAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = createAudioContext();
    }
    // Resume if suspended (browser policy)
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
    return audioContextRef.current;
  }, []);

  // Play a single sound
  const playSound = useCallback((type: SoundType) => {
    try {
      const audioContext = initAudioContext();
      const gainNode = audioContext.createGain();
      gainNode.connect(audioContext.destination);

      switch (type) {
        case 'ringtone':
          playRingtone(audioContext, gainNode);
          break;
        case 'notification':
          playNotificationSound(audioContext, gainNode);
          break;
        case 'message':
          playMessageSound(audioContext, gainNode);
          break;
        case 'coin':
          playCoinSound(audioContext, gainNode);
          break;
        case 'gift':
          playGiftSound(audioContext, gainNode);
          break;
        case 'call-connect':
          playCallConnectSound(audioContext, gainNode);
          break;
        case 'call-end':
          playCallEndSound(audioContext, gainNode);
          break;
      }
    } catch (error) {
      console.error('Error playing sound:', error);
    }
  }, [initAudioContext]);

  // Start continuous ringtone (loops every 2.5 seconds for Apple-style pattern)
  const startRingtone = useCallback(() => {
    if (isPlayingRingtoneRef.current) return;
    
    isPlayingRingtoneRef.current = true;
    
    // Play immediately
    playSound('ringtone');
    
    // Then loop every 2.5 seconds (matches the Apple-style pattern duration + pause)
    ringtoneIntervalRef.current = setInterval(() => {
      if (isPlayingRingtoneRef.current) {
        playSound('ringtone');
      }
    }, 2500);
  }, [playSound]);

  // Stop ringtone
  const stopRingtone = useCallback(() => {
    isPlayingRingtoneRef.current = false;
    if (ringtoneIntervalRef.current) {
      clearInterval(ringtoneIntervalRef.current);
      ringtoneIntervalRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRingtone();
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [stopRingtone]);

  return {
    playSound,
    startRingtone,
    stopRingtone,
  };
}

// Singleton for global sound access
let globalSoundInstance: ReturnType<typeof useSound> | null = null;

export function getGlobalSound() {
  return globalSoundInstance;
}

export function setGlobalSound(instance: ReturnType<typeof useSound>) {
  globalSoundInstance = instance;
}
