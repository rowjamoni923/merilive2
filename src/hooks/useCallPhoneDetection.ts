import { useState, useRef, useCallback, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { detectPhoneNumber } from '@/utils/phoneNumberDetector';
import { useToast } from '@/hooks/use-toast';

interface UseCallPhoneDetectionProps {
  callId: string | null;
  userId: string | null;
  remoteUserId: string | null;
  remoteUserName: string;
  isConnected: boolean;
  isHost: boolean;
}

interface DetectionResult {
  detected: boolean;
  content: string;
  timestamp: Date;
}

export function useCallPhoneDetection({
  callId,
  userId,
  remoteUserId,
  remoteUserName,
  isConnected,
  isHost,
}: UseCallPhoneDetectionProps) {
  const { toast } = useToast();
  const [isListening, setIsListening] = useState(false);
  const [detections, setDetections] = useState<DetectionResult[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Send audio for transcription and check for phone numbers
  const processAudioChunk = useCallback(async (audioBlob: Blob) => {
    // Owner-locked rule: only verified hosts are restricted from sharing
    // phone/contact numbers. User/agency speech must never create a host alert.
    if (!isHost) return;
    if (audioBlob.size < 1000) return; // Skip too small chunks

    try {
      // Convert blob to base64
      const arrayBuffer = await audioBlob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < uint8Array.length; i++) {
        binary += String.fromCharCode(uint8Array[i]);
      }
      const base64Audio = btoa(binary);

      // Send to STT edge function
      const { data, error } = await supabase.functions.invoke('speech-to-text', {
        body: { audio: base64Audio, language: 'bn' }
      });

      if (error) {
        console.error('[PhoneDetection] STT error:', error);
        return;
      }

      if (data?.text) {
        console.log('[PhoneDetection] Transcription:', data.text);
        
        // Check for phone numbers
        const detection = detectPhoneNumber(data.text);
        
        if (detection.detected) {
          console.log('[PhoneDetection] Phone number detected:', detection.matches);
          
          const newDetection: DetectionResult = {
            detected: true,
            content: detection.matches.join(', '),
            timestamp: new Date(),
          };
          
          setDetections(prev => [...prev, newDetection]);

          // Send alert to admin
          const violatorId = userId;
          const { data: alertData } = await supabase.functions.invoke('admin-phone-alert', {
              userId: violatorId,
              detectedContent: detection.matches.join(', '),
              contextType: 'video_call',
              callId,
              hostId: userId,
              callerName: remoteUserName,
              hostName: 'You',
            }
          });

          // Show warning toast - Only hosts get auto-deduction
          if (violatorId === userId && Number(alertData?.violationResult?.beans_deducted || 0) > 0) {
            toast({
              title: "🚨 2000 Beans Deducted!",
              description: "Auto-deduction applied for sharing phone number as host.",
              variant: "destructive",
            });
          }
        }
      }
    } catch (err) {
      console.error('[PhoneDetection] Processing error:', err);
    }
  }, [callId, userId, remoteUserId, remoteUserName, isHost, toast]);

  // Start listening to audio
  const startListening = useCallback(async () => {
    if (isListening || !isConnected) return;

    // Phase-A fix: on Android/iOS native, the LiveKit native track owns the
    // mic exclusively on most devices. Opening a second WebView getUserMedia
    // here causes mic capture conflicts, killing call audio. Phone-number
    // detection is intentionally disabled on native — the JS WebView mic path
    // is not safe to share with the native LiveKit audio track.
    if (Capacitor.isNativePlatform()) {
      return;
    }


    try {
      // Get audio from microphone
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        }
      });

      streamRef.current = stream;
      
      // Record audio in chunks
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        if (audioChunksRef.current.length > 0) {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          audioChunksRef.current = [];
          await processAudioChunk(audioBlob);
        }
      };

      // Start recording
      mediaRecorder.start();
      setIsListening(true);

      // Process every 10 seconds
      recordingIntervalRef.current = setInterval(() => {
        if (mediaRecorderRef.current?.state === 'recording') {
          mediaRecorderRef.current.stop();
          mediaRecorderRef.current.start();
        }
      }, 10000);

      console.log('[PhoneDetection] Started listening');
    } catch (err) {
      console.error('[PhoneDetection] Failed to start listening:', err);
    }
  }, [isConnected, isListening, processAudioChunk]);

  // Stop listening
  const stopListening = useCallback(() => {
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }

    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    setIsListening(false);
    console.log('[PhoneDetection] Stopped listening');
  }, []);

  // Auto start/stop based on connection
  useEffect(() => {
    if (isConnected && callId) {
      // Delay start to let the call establish
      const timeout = setTimeout(() => {
        startListening();
      }, 3000);
      return () => clearTimeout(timeout);
    } else {
      stopListening();
    }
  }, [isConnected, callId, startListening, stopListening]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopListening();
    };
  }, [stopListening]);

  return {
    isListening,
    detections,
    startListening,
    stopListening,
  };
}
