/**
 * =============================================================================
 * React Hook for Native Camera SDK
 * =============================================================================
 * 
 * Provides a React-friendly interface to the NativeCameraSDK.
 * 
 * Usage:
 *   const { 
 *     stream, 
 *     isRecording, 
 *     startPreview, 
 *     takePhoto, 
 *     startRecording,
 *     stopRecording 
 *   } = useCameraSDK();
 * 
 * =============================================================================
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { 
  NativeCameraSDK, 
  CameraConfig, 
  CameraCapabilities, 
  CameraPermissionResult,
  PhotoResult,
  VideoRecordingResult,
  CameraError,
} from './NativeCameraSDK';

interface UseCameraSDKReturn {
  // State
  sdk: NativeCameraSDK | null;
  stream: MediaStream | null;
  isInitialized: boolean;
  isLoading: boolean;
  isRecording: boolean;
  recordingDuration: number;
  error: CameraError | null;
  capabilities: CameraCapabilities | null;
  permissionStatus: CameraPermissionResult | null;
  
  // Actions
  initialize: () => Promise<CameraCapabilities>;
  checkPermissions: () => Promise<CameraPermissionResult>;
  requestPermissions: () => Promise<CameraPermissionResult>;
  startPreview: (videoElement?: HTMLVideoElement) => Promise<MediaStream>;
  stopPreview: () => Promise<void>;
  switchCamera: () => Promise<MediaStream>;
  takePhoto: () => Promise<PhotoResult>;
  pickFromGallery: () => Promise<PhotoResult>;
  startRecording: (maxDuration?: number) => Promise<void>;
  stopRecording: () => Promise<VideoRecordingResult>;
  toggleFlash: () => Promise<boolean>;
  cleanup: () => Promise<void>;
  clearError: () => void;
}

export function useCameraSDK(config?: Partial<CameraConfig>): UseCameraSDKReturn {
  const sdkRef = useRef<NativeCameraSDK | null>(null);
  
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [error, setError] = useState<CameraError | null>(null);
  const [capabilities, setCapabilities] = useState<CameraCapabilities | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<CameraPermissionResult | null>(null);

  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize SDK on mount
  useEffect(() => {
    sdkRef.current = new NativeCameraSDK(config);
    
    return () => {
      if (sdkRef.current) {
        sdkRef.current.cleanup();
      }
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    };
  }, []);

  // Update recording duration
  useEffect(() => {
    if (isRecording) {
      recordingTimerRef.current = setInterval(() => {
        if (sdkRef.current) {
          setRecordingDuration(sdkRef.current.currentRecordingDuration);
        }
      }, 100);
    } else {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      setRecordingDuration(0);
    }

    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    };
  }, [isRecording]);

  const initialize = useCallback(async (): Promise<CameraCapabilities> => {
    if (!sdkRef.current) {
      sdkRef.current = new NativeCameraSDK(config);
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      const caps = await sdkRef.current.initialize();
      setCapabilities(caps);
      setIsInitialized(true);
      return caps;
    } catch (err) {
      setError(err as CameraError);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [config]);

  const checkPermissions = useCallback(async (): Promise<CameraPermissionResult> => {
    if (!sdkRef.current) {
      sdkRef.current = new NativeCameraSDK(config);
    }
    
    try {
      const result = await sdkRef.current.checkPermissions();
      setPermissionStatus(result);
      return result;
    } catch (err) {
      setError(err as CameraError);
      throw err;
    }
  }, [config]);

  const requestPermissions = useCallback(async (): Promise<CameraPermissionResult> => {
    if (!sdkRef.current) {
      sdkRef.current = new NativeCameraSDK(config);
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await sdkRef.current.requestPermissions();
      setPermissionStatus(result);
      if (!result.granted && result.error) {
        setError({
          code: 'PERMISSION_DENIED',
          message: result.error,
          recoverable: true,
        });
      }
      return result;
    } catch (err) {
      setError(err as CameraError);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [config]);

  const startPreview = useCallback(async (videoElement?: HTMLVideoElement): Promise<MediaStream> => {
    if (!sdkRef.current) {
      sdkRef.current = new NativeCameraSDK(config);
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      const newStream = await sdkRef.current.startPreview(videoElement);
      setStream(newStream);
      return newStream;
    } catch (err) {
      setError(err as CameraError);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [config]);

  const stopPreview = useCallback(async (): Promise<void> => {
    if (sdkRef.current) {
      await sdkRef.current.stopPreview();
      setStream(null);
    }
  }, []);

  const switchCamera = useCallback(async (): Promise<MediaStream> => {
    if (!sdkRef.current) {
      throw new Error('SDK not initialized');
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      const newStream = await sdkRef.current.switchCamera();
      setStream(newStream);
      return newStream;
    } catch (err) {
      setError(err as CameraError);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const takePhoto = useCallback(async (): Promise<PhotoResult> => {
    if (!sdkRef.current) {
      sdkRef.current = new NativeCameraSDK(config);
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      return await sdkRef.current.takePhoto();
    } catch (err) {
      setError(err as CameraError);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [config]);

  const pickFromGallery = useCallback(async (): Promise<PhotoResult> => {
    if (!sdkRef.current) {
      sdkRef.current = new NativeCameraSDK(config);
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      return await sdkRef.current.pickFromGallery();
    } catch (err) {
      setError(err as CameraError);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [config]);

  const startRecording = useCallback(async (maxDuration?: number): Promise<void> => {
    if (!sdkRef.current) {
      sdkRef.current = new NativeCameraSDK(config);
    }
    
    setError(null);
    
    try {
      await sdkRef.current.startRecording(maxDuration);
      setIsRecording(true);
    } catch (err) {
      setError(err as CameraError);
      throw err;
    }
  }, [config]);

  const stopRecording = useCallback(async (): Promise<VideoRecordingResult> => {
    if (!sdkRef.current) {
      throw new Error('SDK not initialized');
    }
    
    try {
      const result = await sdkRef.current.stopRecording();
      setIsRecording(false);
      return result;
    } catch (err) {
      setIsRecording(false);
      setError(err as CameraError);
      throw err;
    }
  }, []);

  const toggleFlash = useCallback(async (): Promise<boolean> => {
    if (!sdkRef.current) {
      throw new Error('SDK not initialized');
    }
    
    try {
      return await sdkRef.current.toggleFlash();
    } catch (err) {
      setError(err as CameraError);
      throw err;
    }
  }, []);

  const cleanup = useCallback(async (): Promise<void> => {
    if (sdkRef.current) {
      await sdkRef.current.cleanup();
      setStream(null);
      setIsRecording(false);
      setRecordingDuration(0);
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    sdk: sdkRef.current,
    stream,
    isInitialized,
    isLoading,
    isRecording,
    recordingDuration,
    error,
    capabilities,
    permissionStatus,
    initialize,
    checkPermissions,
    requestPermissions,
    startPreview,
    stopPreview,
    switchCamera,
    takePhoto,
    pickFromGallery,
    startRecording,
    stopRecording,
    toggleFlash,
    cleanup,
    clearError,
  };
}
