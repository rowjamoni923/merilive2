/**
 * =============================================================================
 * Camera Preview Component
 * =============================================================================
 * 
 * A ready-to-use camera preview component powered by NativeCameraSDK.
 * 
 * Features:
 * - Automatic permission handling
 * - Camera switching
 * - Photo capture
 * - Video recording
 * - Loading states
 * - Error handling with Bengali messages
 * 
 * Usage:
 *   <CameraPreview 
 *     onPhoto={(photo) => console.log(photo)}
 *     onVideo={(video) => console.log(video)}
 *   />
 * 
 * =============================================================================
 */

import React, { useRef, useEffect, useState } from 'react';
import { Camera, SwitchCamera, Loader2, Circle, Square, AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCameraSDK } from '@/sdk/useCameraSDK';
import { PhotoResult, VideoRecordingResult } from '@/sdk/NativeCameraSDK';

interface CameraPreviewProps {
  // Callbacks
  onPhoto?: (photo: PhotoResult) => void;
  onVideo?: (video: VideoRecordingResult) => void;
  onStreamReady?: (stream: MediaStream) => void;
  onError?: (error: string) => void;
  
  // Configuration
  facing?: 'user' | 'environment';
  includeAudio?: boolean;
  autoStart?: boolean;
  showControls?: boolean;
  maxRecordingDuration?: number;
  
  // Styling
  className?: string;
  aspectRatio?: 'square' | '4:3' | '16:9' | 'full';
  mirror?: boolean;
}

export function CameraPreview({
  onPhoto,
  onVideo,
  onStreamReady,
  onError,
  facing = 'user',
  includeAudio = true,
  autoStart = true,
  showControls = true,
  maxRecordingDuration = 60,
  className = '',
  aspectRatio = '4:3',
  mirror = true,
}: CameraPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isReady, setIsReady] = useState(false);
  
  const {
    stream,
    isLoading,
    isRecording,
    recordingDuration,
    error,
    requestPermissions,
    startPreview,
    stopPreview,
    switchCamera,
    takePhoto,
    startRecording,
    stopRecording,
    clearError,
  } = useCameraSDK({ facing, includeAudio });

  // Auto-start camera
  useEffect(() => {
    if (autoStart) {
      handleStart();
    }

    return () => {
      stopPreview();
    };
  }, []);

  // Attach stream to video element
  useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.onloadedmetadata = () => {
        videoRef.current?.play().catch(console.warn);
        setIsReady(true);
        onStreamReady?.(stream);
      };
    }
  }, [stream, onStreamReady]);

  // Handle errors
  useEffect(() => {
    if (error) {
      onError?.(error.message);
    }
  }, [error, onError]);

  const handleStart = async () => {
    try {
      clearError();
      const permResult = await requestPermissions();
      if (permResult.granted) {
        await startPreview(videoRef.current || undefined);
      }
    } catch (err) {
      console.error('Camera start failed:', err);
    }
  };

  const handleTakePhoto = async () => {
    try {
      const photo = await takePhoto();
      onPhoto?.(photo);
    } catch (err) {
      console.error('Photo capture failed:', err);
    }
  };

  const handleToggleRecording = async () => {
    try {
      if (isRecording) {
        const video = await stopRecording();
        onVideo?.(video);
      } else {
        await startRecording(maxRecordingDuration);
      }
    } catch (err) {
      console.error('Recording toggle failed:', err);
    }
  };

  const handleSwitchCamera = async () => {
    try {
      await switchCamera();
    } catch (err) {
      console.error('Camera switch failed:', err);
    }
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getAspectRatioClass = () => {
    switch (aspectRatio) {
      case 'square': return 'aspect-square';
      case '4:3': return 'aspect-[4/3]';
      case '16:9': return 'aspect-video';
      case 'full': return 'h-full';
      default: return 'aspect-[4/3]';
    }
  };

  return (
    <div className={`relative bg-black rounded-xl overflow-hidden camera-locked ${className}`}>
      {/* Video Element */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`w-full ${getAspectRatioClass()} object-cover ${
          mirror && facing === 'user' ? 'scale-x-[-1]' : ''
        }`}
        style={{ touchAction: 'none', objectPosition: 'center center', pointerEvents: 'none' }}
      />

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70">
          <div className="text-center text-white">
            <Loader2 className="w-10 h-10 animate-spin mx-auto mb-2" />
            <p className="text-sm">Loading camera...</p>
          </div>
        </div>
      )}

      {/* Error Overlay */}
      {error && !isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <div className="text-center text-white p-4 max-w-xs">
            <AlertTriangle className="w-12 h-12 text-yellow-400 mx-auto mb-3" />
            <p className="text-sm mb-4">{error.message}</p>
            <Button 
              onClick={handleStart}
              variant="outline"
              size="sm"
              className="gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Try Again
            </Button>
          </div>
        </div>
      )}

      {/* Recording Indicator */}
      {isRecording && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
          <div className="flex items-center gap-2 bg-red-600 text-white px-3 py-1 rounded-full">
            <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
            <span className="text-sm font-medium">{formatDuration(recordingDuration)}</span>
          </div>
        </div>
      )}

      {/* Controls */}
      {showControls && isReady && !error && (
        <div className="absolute bottom-4 left-0 right-0 flex items-center justify-center gap-6">
          {/* Switch Camera */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleSwitchCamera}
            className="h-12 w-12 rounded-full bg-white/20 text-white hover:bg-white/30"
            disabled={isRecording}
          >
            <SwitchCamera className="w-6 h-6" />
          </Button>

          {/* Main Capture Button */}
          {onVideo ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleToggleRecording}
              className={`h-16 w-16 rounded-full border-4 border-white ${
                isRecording ? 'bg-red-600' : 'bg-transparent'
              }`}
            >
              {isRecording ? (
                <Square className="w-6 h-6 text-white fill-white" />
              ) : (
                <Circle className="w-10 h-10 text-red-500 fill-red-500" />
              )}
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleTakePhoto}
              className="h-16 w-16 rounded-full bg-white border-4 border-white/50"
            >
              <Camera className="w-8 h-8 text-black" />
            </Button>
          )}

          {/* Photo Button (if video mode) */}
          {onVideo && onPhoto && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleTakePhoto}
              className="h-12 w-12 rounded-full bg-white/20 text-white hover:bg-white/30"
              disabled={isRecording}
            >
              <Camera className="w-6 h-6" />
            </Button>
          )}
        </div>
      )}

      {/* Permission Request Button (when not started) */}
      {!stream && !isLoading && !error && !autoStart && (
        <div className="absolute inset-0 flex items-center justify-center bg-amber-50">
          <Button onClick={handleStart} className="gap-2">
            <Camera className="w-5 h-5" />
            Start Camera
          </Button>
        </div>
      )}
    </div>
  );
}

export default CameraPreview;
