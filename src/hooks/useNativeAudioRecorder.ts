import { useState, useCallback, useRef, useEffect } from 'react';
import { 
  startVoiceRecording, 
  stopVoiceRecording, 
  cancelVoiceRecording, 
  onAmplitudeUpdate,
  voiceRecordingToBlob,
  AudioRecorderStopResult
} from '@/plugins/AudioRecorder';
import { getNativeFlag } from '@/utils/nativeFlags';

export const useNativeAudioRecorder = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [amplitudes, setAmplitudes] = useState<number[]>([]);
  const [duration, setDuration] = useState(0);
  const [isNative] = useState(() => getNativeFlag('voiceNative'));
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const listenerRef = useRef<any>(null);

  const cleanup = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (listenerRef.current) {
      const l = await listenerRef.current;
      l.remove();
      listenerRef.current = null;
    }
  }, []);

  const start = useCallback(async () => {
    if (!isNative) return false;
    
    try {
      await startVoiceRecording();
      setIsRecording(true);
      setAmplitudes([]);
      setDuration(0);

      // Amplitude listener (Native only)
      listenerRef.current = onAmplitudeUpdate((e) => {
        setAmplitudes(prev => [...prev.slice(-100), e.amplitude]);
      });

      // Duration timer
      timerRef.current = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);

      return true;
    } catch (err) {
      console.error('Native recorder start failed:', err);
      return false;
    }
  }, [isNative]);

  const stop = useCallback(async () => {
    if (!isNative) return null;
    
    try {
      const result = await stopVoiceRecording();
      await cleanup();
      setIsRecording(false);
      
      const blob = await voiceRecordingToBlob(result);
      return { blob, durationMs: result.durationMs, path: result.path };
    } catch (err) {
      console.error('Native recorder stop failed:', err);
      await cleanup();
      setIsRecording(false);
      return null;
    }
  }, [isNative, cleanup]);

  const cancel = useCallback(async () => {
    if (!isNative) return;
    await cancelVoiceRecording();
    await cleanup();
    setIsRecording(false);
    setAmplitudes([]);
    setDuration(0);
  }, [isNative, cleanup]);

  useEffect(() => {
    return () => { cleanup().catch(() => {}); };
  }, [cleanup]);

  return {
    isRecording,
    amplitudes,
    duration,
    start,
    stop,
    cancel,
    isNative
  };
};
