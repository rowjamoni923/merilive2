import { useEffect, useRef, useState, useCallback } from 'react';

interface UseVoiceActivityDetectionOptions {
  localStream: MediaStream | null;
  peerStreams: Map<string, MediaStream>;
  enabled: boolean;
  silenceTimeoutMs?: number;
  onSilenceTimeout: () => void;
}

export function useVoiceActivityDetection({
  localStream,
  peerStreams,
  enabled,
  silenceTimeoutMs = 10000, // Default 10 seconds
  onSilenceTimeout,
}: UseVoiceActivityDetectionOptions) {
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [silenceDuration, setSilenceDuration] = useState(0);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyzersRef = useRef<Map<string, AnalyserNode>>(new Map());
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastVoiceTimeRef = useRef<number>(Date.now());

  // Threshold for voice detection (0-255, typically 10-30 is good)
  const VOICE_THRESHOLD = 15;

  const checkVoiceActivity = useCallback(() => {
    if (!enabled) return false;

    let hasVoice = false;
    const dataArray = new Uint8Array(256);

    analyzersRef.current.forEach((analyser) => {
      analyser.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
      if (average > VOICE_THRESHOLD) {
        hasVoice = true;
      }
    });

    return hasVoice;
  }, [enabled]);

  const setupAnalyzer = useCallback((stream: MediaStream, id: string) => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    try {
      const source = audioContextRef.current.createMediaStreamSource(stream);
      const analyser = audioContextRef.current.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.3;
      source.connect(analyser);
      analyzersRef.current.set(id, analyser);
      console.log('[VoiceActivity] Analyzer setup for:', id);
    } catch (error) {
      console.error('[VoiceActivity] Error setting up analyzer:', error);
    }
  }, []);

  // Setup analyzers for all streams
  useEffect(() => {
    if (!enabled) return;

    // Clear old analyzers
    analyzersRef.current.clear();

    // Setup for local stream
    if (localStream) {
      const audioTracks = localStream.getAudioTracks();
      if (audioTracks.length > 0) {
        setupAnalyzer(localStream, 'local');
      }
    }

    // Setup for peer streams
    peerStreams.forEach((stream, peerId) => {
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length > 0) {
        setupAnalyzer(stream, peerId);
      }
    });

    console.log('[VoiceActivity] Total analyzers:', analyzersRef.current.size);
  }, [localStream, peerStreams, enabled, setupAnalyzer]);

  // Voice activity check loop
  useEffect(() => {
    if (!enabled) {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
        checkIntervalRef.current = null;
      }
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      return;
    }

    // Check voice activity every 500ms
    checkIntervalRef.current = setInterval(() => {
      const hasVoice = checkVoiceActivity();
      setIsVoiceActive(hasVoice);

      if (hasVoice) {
        lastVoiceTimeRef.current = Date.now();
        setSilenceDuration(0);
        
        // Clear silence timer if voice detected
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
        }
      } else {
        const silenceMs = Date.now() - lastVoiceTimeRef.current;
        setSilenceDuration(silenceMs);

        // Trigger timeout if silence exceeds threshold
        if (silenceMs >= silenceTimeoutMs && !silenceTimerRef.current) {
          console.log('[VoiceActivity] Silence timeout reached:', silenceMs, 'ms');
          silenceTimerRef.current = setTimeout(() => {
            onSilenceTimeout();
          }, 100);
        }
      }
    }, 500);

    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
        checkIntervalRef.current = null;
      }
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
    };
  }, [enabled, checkVoiceActivity, silenceTimeoutMs, onSilenceTimeout]);

  // Cleanup audio context on unmount
  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      analyzersRef.current.clear();
    };
  }, []);

  const resetSilenceTimer = useCallback(() => {
    lastVoiceTimeRef.current = Date.now();
    setSilenceDuration(0);
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  return {
    isVoiceActive,
    silenceDuration,
    resetSilenceTimer,
  };
}
