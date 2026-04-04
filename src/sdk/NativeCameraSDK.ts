/**
 * =============================================================================
 * MeriLive Native Camera SDK
 * =============================================================================
 * 
 * A comprehensive camera solution for Capacitor-based Android/iOS apps.
 * Handles all camera operations with progressive fallback for maximum compatibility.
 * 
 * Features:
 * - Native permission handling via Capacitor
 * - Progressive resolution fallback (HD -> SD -> Basic)
 * - Photo capture with camera or gallery
 * - Video recording with MediaRecorder
 * - Face detection integration ready
 * - Front/back camera switching
 * - Flash control
 * - Bengali error messages for user-friendly UX
 * 
 * Usage:
 *   import { NativeCameraSDK } from '@/sdk/NativeCameraSDK';
 *   
 *   const camera = new NativeCameraSDK();
 *   await camera.initialize();
 *   const stream = await camera.startPreview();
 * 
 * =============================================================================
 */

import { Capacitor } from '@capacitor/core';
import { isNativeApp as detectNativeApp, getPlatform as detectPlatform } from '@/utils/nativeUtils';

// =============================================================================
// Types & Interfaces
// =============================================================================

export type CameraFacing = 'user' | 'environment';
export type CameraQuality = 'hd' | 'sd' | 'low' | 'auto';
export type PermissionStatus = 'granted' | 'denied' | 'prompt' | 'unknown';

export interface CameraConfig {
  facing: CameraFacing;
  quality: CameraQuality;
  includeAudio: boolean;
  enableFlash: boolean;
}

export interface CameraPermissionResult {
  camera: PermissionStatus;
  microphone: PermissionStatus;
  granted: boolean;
  error?: string;
}

export interface PhotoResult {
  dataUrl: string;
  base64: string;
  width: number;
  height: number;
  format: 'jpeg' | 'png' | 'webp';
}

export interface VideoRecordingResult {
  blob: Blob;
  url: string;
  duration: number;
  mimeType: string;
}

export interface CameraCapabilities {
  hasCamera: boolean;
  hasFrontCamera: boolean;
  hasBackCamera: boolean;
  hasFlash: boolean;
  hasMicrophone: boolean;
  supportsHD: boolean;
  maxResolution: { width: number; height: number };
}

export interface CameraError {
  code: string;
  message: string;
  recoverable: boolean;
}

// =============================================================================
// Error Codes
// =============================================================================

export const CameraErrorCodes = {
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  CAMERA_NOT_FOUND: 'CAMERA_NOT_FOUND',
  CAMERA_IN_USE: 'CAMERA_IN_USE',
  CONSTRAINTS_NOT_SATISFIED: 'CONSTRAINTS_NOT_SATISFIED',
  SECURITY_ERROR: 'SECURITY_ERROR',
  STREAM_FAILED: 'STREAM_FAILED',
  RECORDING_FAILED: 'RECORDING_FAILED',
  FLASH_NOT_SUPPORTED: 'FLASH_NOT_SUPPORTED',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const;

// =============================================================================
// Error Messages (English Only)
// =============================================================================

const ErrorMessages: Record<string, CameraError> = {
  [CameraErrorCodes.PERMISSION_DENIED]: {
    code: CameraErrorCodes.PERMISSION_DENIED,
    message: 'Camera permission denied. Please enable in Settings > Apps > MeriLive > Permissions.',
    recoverable: true,
  },
  [CameraErrorCodes.CAMERA_NOT_FOUND]: {
    code: CameraErrorCodes.CAMERA_NOT_FOUND,
    message: 'No camera found on this device.',
    recoverable: false,
  },
  [CameraErrorCodes.CAMERA_IN_USE]: {
    code: CameraErrorCodes.CAMERA_IN_USE,
    message: 'Camera is being used by another app. Please close other camera apps.',
    recoverable: true,
  },
  [CameraErrorCodes.CONSTRAINTS_NOT_SATISFIED]: {
    code: CameraErrorCodes.CONSTRAINTS_NOT_SATISFIED,
    message: 'Camera settings not supported on this device.',
    recoverable: true,
  },
  [CameraErrorCodes.SECURITY_ERROR]: {
    code: CameraErrorCodes.SECURITY_ERROR,
    message: 'Camera blocked for security reasons.',
    recoverable: false,
  },
  [CameraErrorCodes.STREAM_FAILED]: {
    code: CameraErrorCodes.STREAM_FAILED,
    message: 'Failed to start camera stream. Please try again.',
    recoverable: true,
  },
  [CameraErrorCodes.RECORDING_FAILED]: {
    code: CameraErrorCodes.RECORDING_FAILED,
    message: 'Video recording failed.',
    recoverable: true,
  },
  [CameraErrorCodes.FLASH_NOT_SUPPORTED]: {
    code: CameraErrorCodes.FLASH_NOT_SUPPORTED,
    message: 'Flash is not supported on this device.',
    recoverable: false,
  },
  [CameraErrorCodes.UNKNOWN_ERROR]: {
    code: CameraErrorCodes.UNKNOWN_ERROR,
    message: 'An unknown camera error occurred. Please try again.',
    recoverable: true,
  },
};

// =============================================================================
// Resolution Presets
// =============================================================================

const QualityPresets = {
  fullhd: { width: 1920, height: 1080 },
  hd: { width: 1280, height: 720 },
  sd: { width: 640, height: 480 },
  low: { width: 320, height: 240 },
};

// =============================================================================
// Main Camera SDK Class
// =============================================================================

export class NativeCameraSDK {
  private stream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private isRecording: boolean = false;
  private recordingStartTime: number = 0;
  private config: CameraConfig;
  private capabilities: CameraCapabilities | null = null;
  private isInitialized: boolean = false;

  constructor(config?: Partial<CameraConfig>) {
    this.config = {
      facing: config?.facing ?? 'user',
      quality: config?.quality ?? 'auto',
      includeAudio: config?.includeAudio ?? true,
      enableFlash: config?.enableFlash ?? false,
    };
    
    console.log('[NativeCameraSDK] Initialized with config:', this.config);
  }

  // ===========================================================================
  // Platform Detection
  // ===========================================================================

  get isNative(): boolean {
    return detectNativeApp();
  }

  get platform(): 'android' | 'ios' | 'web' {
    return detectPlatform();
  }

  // ===========================================================================
  // Initialization
  // ===========================================================================

  async initialize(): Promise<CameraCapabilities> {
    console.log('[NativeCameraSDK] Initializing...');
    
    try {
      this.capabilities = await this.detectCapabilities();
      this.isInitialized = true;
      console.log('[NativeCameraSDK] Capabilities:', this.capabilities);
      return this.capabilities;
    } catch (error) {
      console.error('[NativeCameraSDK] Initialization failed:', error);
      throw this.createError(CameraErrorCodes.UNKNOWN_ERROR);
    }
  }

  private async detectCapabilities(): Promise<CameraCapabilities> {
    const capabilities: CameraCapabilities = {
      hasCamera: false,
      hasFrontCamera: false,
      hasBackCamera: false,
      hasFlash: false,
      hasMicrophone: false,
      supportsHD: false,
      maxResolution: { width: 640, height: 480 },
    };

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      const audioDevices = devices.filter(d => d.kind === 'audioinput');
      
      capabilities.hasCamera = videoDevices.length > 0;
      capabilities.hasMicrophone = audioDevices.length > 0;
      
      // Check for front/back cameras
      for (const device of videoDevices) {
        const label = device.label.toLowerCase();
        if (label.includes('front') || label.includes('user') || label.includes('facetime')) {
          capabilities.hasFrontCamera = true;
        }
        if (label.includes('back') || label.includes('rear') || label.includes('environment')) {
          capabilities.hasBackCamera = true;
        }
      }
      
      // If labels are empty (permission not granted), assume both exist on mobile
      if (videoDevices.length > 0 && !capabilities.hasFrontCamera && !capabilities.hasBackCamera) {
        if (this.isNative || videoDevices.length > 1) {
          capabilities.hasFrontCamera = true;
          capabilities.hasBackCamera = true;
        } else {
          capabilities.hasFrontCamera = true;
        }
      }

      // Test HD capability
      try {
        const testStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } }
        });
        const track = testStream.getVideoTracks()[0];
        const settings = track.getSettings();
        testStream.getTracks().forEach(t => t.stop());
        
        if (settings.width && settings.width >= 1280) {
          capabilities.supportsHD = true;
          capabilities.maxResolution = { width: settings.width, height: settings.height || 720 };
        }
      } catch {
        // HD not supported
      }

      // Check flash (only possible with ImageCapture API)
      if ('ImageCapture' in window && capabilities.hasCamera) {
        try {
          const testStream = await navigator.mediaDevices.getUserMedia({ video: true });
          const track = testStream.getVideoTracks()[0];
          // @ts-ignore - ImageCapture may not be in types
          const imageCapture = new ImageCapture(track);
          const photoCapabilities = await imageCapture.getPhotoCapabilities();
          capabilities.hasFlash = photoCapabilities.fillLightMode?.includes('flash') ?? false;
          testStream.getTracks().forEach(t => t.stop());
        } catch {
          // Flash check failed
        }
      }

    } catch (error) {
      console.warn('[NativeCameraSDK] Capability detection error:', error);
    }

    return capabilities;
  }

  // ===========================================================================
  // Permission Management
  // ===========================================================================

  async checkPermissions(): Promise<CameraPermissionResult> {
    console.log('[NativeCameraSDK] Checking permissions...');
    
    const result: CameraPermissionResult = {
      camera: 'unknown',
      microphone: 'unknown',
      granted: false,
    };

    try {
      if (this.isNative) {
        try {
          const { Camera } = await import('@capacitor/camera');
          const status = await Camera.checkPermissions();
          result.camera = status.camera as PermissionStatus;
        } catch (nativeError) {
          console.warn('[NativeCameraSDK] Native permission check failed, falling back:', nativeError);
          result.camera = 'unknown';
        }
      } else {
        // Web permissions API
        if (navigator.permissions) {
          try {
            const camPerm = await navigator.permissions.query({ name: 'camera' as PermissionName });
            result.camera = camPerm.state as PermissionStatus;
          } catch {
            result.camera = 'unknown';
          }
          
          try {
            const micPerm = await navigator.permissions.query({ name: 'microphone' as PermissionName });
            result.microphone = micPerm.state as PermissionStatus;
          } catch {
            result.microphone = 'unknown';
          }
        }
      }

      if (result.camera !== 'granted' && this.isNative) {
        try {
          const probeStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          probeStream.getTracks().forEach(t => t.stop());
          result.camera = 'granted';
        } catch (probeError: any) {
          if (probeError?.name === 'NotAllowedError') {
            result.camera = 'denied';
          }
        }
      }

      result.granted = result.camera === 'granted';
      console.log('[NativeCameraSDK] Permission status:', result);
      return result;
    } catch (error) {
      console.error('[NativeCameraSDK] Permission check failed:', error);
      return result;
    }
  }

  async requestPermissions(): Promise<CameraPermissionResult> {
    console.log('[NativeCameraSDK] Requesting permissions...');
    
    try {
      // Native: Use Capacitor Camera plugin
      if (this.isNative) {
        const { Camera } = await import('@capacitor/camera');
        
        // Check current status
        const currentStatus = await Camera.checkPermissions();
        console.log('[NativeCameraSDK] Current native status:', currentStatus);
        
        if (currentStatus.camera === 'granted') {
          return { camera: 'granted', microphone: 'unknown', granted: true };
        }
        
        if (currentStatus.camera === 'denied') {
          return {
            camera: 'denied',
            microphone: 'unknown',
            granted: false,
            error: ErrorMessages[CameraErrorCodes.PERMISSION_DENIED].message,
          };
        }
        
        // Request permission
        const permission = await Camera.requestPermissions({ permissions: ['camera'] });
        console.log('[NativeCameraSDK] Native permission result:', permission);
        
        if (permission.camera === 'granted') {
          return { camera: 'granted', microphone: 'unknown', granted: true };
        }
        
        return {
          camera: permission.camera as PermissionStatus,
          microphone: 'unknown',
          granted: false,
          error: ErrorMessages[CameraErrorCodes.PERMISSION_DENIED].message,
        };
      }

      // Web: Request via getUserMedia
      console.log('[NativeCameraSDK] Requesting web permissions via getUserMedia...');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: true, 
        audio: this.config.includeAudio 
      });
      stream.getTracks().forEach(t => t.stop());
      
      return { camera: 'granted', microphone: 'granted', granted: true };
      
    } catch (error: any) {
      console.error('[NativeCameraSDK] Permission request failed:', error);
      
      const errorCode = this.mapErrorToCode(error);
      return {
        camera: 'denied',
        microphone: 'unknown',
        granted: false,
        error: ErrorMessages[errorCode].message,
      };
    }
  }

  // ===========================================================================
  // Camera Preview / Stream
  // ===========================================================================

  async startPreview(videoElement?: HTMLVideoElement): Promise<MediaStream> {
    console.log('[NativeCameraSDK] Starting preview...');
    
    // Ensure permissions
    const permResult = await this.requestPermissions();
    if (!permResult.granted) {
      throw this.createError(CameraErrorCodes.PERMISSION_DENIED);
    }

    // Stop existing stream
    await this.stopPreview();

    // Build constraints with progressive fallback
    const constraints = this.buildConstraints();
    
    for (let i = 0; i < constraints.length; i++) {
      try {
        console.log(`[NativeCameraSDK] Trying constraint ${i + 1}/${constraints.length}:`, 
          JSON.stringify(constraints[i]));
        
        this.stream = await navigator.mediaDevices.getUserMedia(constraints[i]);

        // Verify video track exists
        const videoTracks = this.stream.getVideoTracks();
        if (videoTracks.length === 0) {
          this.stream.getTracks().forEach(t => t.stop());
          continue;
        }
        
        const settings = videoTracks[0].getSettings();
        console.log('[NativeCameraSDK] Stream started:', settings);
        
        // Attach to video element if provided
        if (videoElement) {
          videoElement.srcObject = this.stream;
          await videoElement.play().catch(e => console.warn('Video play warning:', e));
        }
        
        return this.stream;
        
      } catch (error: any) {
        console.warn(`[NativeCameraSDK] Constraint ${i + 1} failed:`, error.name);
        continue;
      }
    }

    throw this.createError(CameraErrorCodes.STREAM_FAILED);
  }

  private buildConstraints(): MediaStreamConstraints[] {
    const { facing, quality, includeAudio } = this.config;
    const constraints: MediaStreamConstraints[] = [];

    // Quality-based resolution
    const resolutions = quality === 'auto' 
      ? [QualityPresets.hd, QualityPresets.sd, QualityPresets.low]
      : [QualityPresets[quality]];

    // Add constraints in order of preference
    for (const res of resolutions) {
      // Exact facing mode
      constraints.push({
        video: {
          facingMode: facing,
          width: { ideal: res.width },
          height: { ideal: res.height },
        },
        audio: includeAudio,
      });
      
      // Flexible facing mode
      constraints.push({
        video: {
          facingMode: { ideal: facing },
          width: { ideal: res.width },
          height: { ideal: res.height },
        },
        audio: includeAudio,
      });
    }

    // Fallback: just facing mode
    constraints.push({
      video: { facingMode: facing },
      audio: includeAudio,
    });

    constraints.push({
      video: { facingMode: { ideal: facing } },
      audio: includeAudio,
    });

    // Last resort: any video
    constraints.push({
      video: true,
      audio: includeAudio,
    });

    return constraints;
  }

  async stopPreview(): Promise<void> {
    if (this.stream) {
      console.log('[NativeCameraSDK] Stopping preview...');
      this.stream.getTracks().forEach(track => {
        track.stop();
        console.log(`[NativeCameraSDK] Stopped ${track.kind} track`);
      });
      this.stream = null;
    }
  }

  async switchCamera(): Promise<MediaStream> {
    console.log('[NativeCameraSDK] Switching camera...');
    this.config.facing = this.config.facing === 'user' ? 'environment' : 'user';
    return this.startPreview();
  }

  // ===========================================================================
  // Photo Capture
  // ===========================================================================

  async takePhoto(): Promise<PhotoResult> {
    console.log('[NativeCameraSDK] Taking photo...');

    // Native: Use Capacitor Camera
    if (this.isNative) {
      try {
        const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
        
        const photo = await Camera.getPhoto({
          quality: 90,
          allowEditing: false,
          resultType: CameraResultType.Base64,
          source: CameraSource.Camera,
          direction: this.config.facing === 'user' ? 'front' as any : 'rear' as any,
          promptLabelHeader: 'Take Photo',
          promptLabelPhoto: 'From Gallery',
          promptLabelPicture: 'Using Camera',
        });

        if (!photo.base64String) {
          throw new Error('No image data');
        }

        return {
          dataUrl: `data:image/jpeg;base64,${photo.base64String}`,
          base64: photo.base64String,
          width: 0, // Not available from Capacitor
          height: 0,
          format: 'jpeg',
        };
      } catch (error) {
        console.error('[NativeCameraSDK] Native photo failed:', error);
        // Fall through to stream-based capture
      }
    }

    // Web / Fallback: Capture from stream
    if (!this.stream) {
      await this.startPreview();
    }

    return this.captureFromStream();
  }

  async pickFromGallery(): Promise<PhotoResult> {
    console.log('[NativeCameraSDK] Picking from gallery...');

    if (this.isNative) {
      try {
        const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
        
        const photo = await Camera.getPhoto({
          quality: 90,
          allowEditing: true,
          resultType: CameraResultType.Base64,
          source: CameraSource.Photos,
          promptLabelHeader: 'Choose Photo',
        });

        if (!photo.base64String) {
          throw new Error('No image data');
        }

        return {
          dataUrl: `data:image/jpeg;base64,${photo.base64String}`,
          base64: photo.base64String,
          width: 0,
          height: 0,
          format: 'jpeg',
        };
      } catch (error) {
        console.error('[NativeCameraSDK] Gallery pick failed:', error);
        throw this.createError(CameraErrorCodes.UNKNOWN_ERROR);
      }
    }

    // Web: Use file input
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) {
          reject(this.createError(CameraErrorCodes.UNKNOWN_ERROR));
          return;
        }

        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          const base64 = dataUrl.split(',')[1];
          resolve({
            dataUrl,
            base64,
            width: 0,
            height: 0,
            format: 'jpeg',
          });
        };
        reader.onerror = () => reject(this.createError(CameraErrorCodes.UNKNOWN_ERROR));
        reader.readAsDataURL(file);
      };
      input.click();
    });
  }

  private async captureFromStream(): Promise<PhotoResult> {
    if (!this.stream) {
      throw this.createError(CameraErrorCodes.STREAM_FAILED);
    }

    const videoTrack = this.stream.getVideoTracks()[0];
    const settings = videoTrack.getSettings();
    const width = settings.width || 640;
    const height = settings.height || 480;

    // Create canvas and capture frame
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    // Create video element to draw from
    const video = document.createElement('video');
    video.srcObject = this.stream;
    video.muted = true;
    await video.play();

    ctx.drawImage(video, 0, 0, width, height);
    video.pause();

    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    const base64 = dataUrl.split(',')[1];

    return {
      dataUrl,
      base64,
      width,
      height,
      format: 'jpeg',
    };
  }

  // ===========================================================================
  // Video Recording
  // ===========================================================================

  async startRecording(maxDuration?: number): Promise<void> {
    console.log('[NativeCameraSDK] Starting recording...');

    if (this.isRecording) {
      console.warn('[NativeCameraSDK] Already recording');
      return;
    }

    // Ensure stream exists with audio
    if (!this.stream) {
      this.config.includeAudio = true;
      await this.startPreview();
    }

    if (!this.stream) {
      throw this.createError(CameraErrorCodes.STREAM_FAILED);
    }

    // Determine best mime type
    const mimeTypes = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'video/mp4',
    ];

    let mimeType = '';
    for (const type of mimeTypes) {
      if (MediaRecorder.isTypeSupported(type)) {
        mimeType = type;
        break;
      }
    }

    if (!mimeType) {
      throw this.createError(CameraErrorCodes.RECORDING_FAILED);
    }

    console.log('[NativeCameraSDK] Using mime type:', mimeType);

    try {
      this.recordedChunks = [];
      this.mediaRecorder = new MediaRecorder(this.stream, { mimeType });

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };

      this.mediaRecorder.start(1000); // Collect data every second
      this.isRecording = true;
      this.recordingStartTime = Date.now();

      console.log('[NativeCameraSDK] Recording started');

      // Auto-stop after max duration
      if (maxDuration && maxDuration > 0) {
        setTimeout(() => {
          if (this.isRecording) {
            this.stopRecording();
          }
        }, maxDuration * 1000);
      }

    } catch (error) {
      console.error('[NativeCameraSDK] Recording start failed:', error);
      throw this.createError(CameraErrorCodes.RECORDING_FAILED);
    }
  }

  async stopRecording(): Promise<VideoRecordingResult> {
    console.log('[NativeCameraSDK] Stopping recording...');

    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder || !this.isRecording) {
        reject(this.createError(CameraErrorCodes.RECORDING_FAILED));
        return;
      }

      this.mediaRecorder.onstop = () => {
        const duration = (Date.now() - this.recordingStartTime) / 1000;
        const mimeType = this.mediaRecorder?.mimeType || 'video/webm';
        const blob = new Blob(this.recordedChunks, { type: mimeType });
        const url = URL.createObjectURL(blob);

        console.log('[NativeCameraSDK] Recording stopped, duration:', duration);

        this.isRecording = false;
        this.mediaRecorder = null;
        this.recordedChunks = [];

        resolve({
          blob,
          url,
          duration,
          mimeType,
        });
      };

      this.mediaRecorder.onerror = () => {
        reject(this.createError(CameraErrorCodes.RECORDING_FAILED));
      };

      this.mediaRecorder.stop();
    });
  }

  get recordingState(): 'inactive' | 'recording' | 'paused' {
    return this.mediaRecorder?.state || 'inactive';
  }

  get currentRecordingDuration(): number {
    if (!this.isRecording) return 0;
    return (Date.now() - this.recordingStartTime) / 1000;
  }

  // ===========================================================================
  // Flash Control
  // ===========================================================================

  async toggleFlash(): Promise<boolean> {
    if (!this.stream) {
      throw this.createError(CameraErrorCodes.STREAM_FAILED);
    }

    const videoTrack = this.stream.getVideoTracks()[0];
    const capabilities = videoTrack.getCapabilities() as any;

    if (!capabilities.torch) {
      throw this.createError(CameraErrorCodes.FLASH_NOT_SUPPORTED);
    }

    this.config.enableFlash = !this.config.enableFlash;
    
    await videoTrack.applyConstraints({
      advanced: [{ torch: this.config.enableFlash } as any],
    });

    console.log('[NativeCameraSDK] Flash:', this.config.enableFlash ? 'ON' : 'OFF');
    return this.config.enableFlash;
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  getStream(): MediaStream | null {
    return this.stream;
  }

  getCapabilities(): CameraCapabilities | null {
    return this.capabilities;
  }

  getConfig(): CameraConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<CameraConfig>): void {
    this.config = { ...this.config, ...config };
  }

  async cleanup(): Promise<void> {
    console.log('[NativeCameraSDK] Cleaning up...');
    await this.stopPreview();
    if (this.isRecording) {
      await this.stopRecording();
    }
  }

  // ===========================================================================
  // Error Handling
  // ===========================================================================

  private mapErrorToCode(error: any): string {
    const name = error?.name || '';
    
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      return CameraErrorCodes.PERMISSION_DENIED;
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return CameraErrorCodes.CAMERA_NOT_FOUND;
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
      return CameraErrorCodes.CAMERA_IN_USE;
    }
    if (name === 'OverconstrainedError') {
      return CameraErrorCodes.CONSTRAINTS_NOT_SATISFIED;
    }
    if (name === 'SecurityError') {
      return CameraErrorCodes.SECURITY_ERROR;
    }
    
    return CameraErrorCodes.UNKNOWN_ERROR;
  }

  private createError(code: string): CameraError {
    return ErrorMessages[code] || ErrorMessages[CameraErrorCodes.UNKNOWN_ERROR];
  }
}

// =============================================================================
// Singleton Instance Export
// =============================================================================

let cameraSDKInstance: NativeCameraSDK | null = null;

export function getCameraSDK(config?: Partial<CameraConfig>): NativeCameraSDK {
  if (!cameraSDKInstance) {
    cameraSDKInstance = new NativeCameraSDK(config);
  }
  return cameraSDKInstance;
}

export function resetCameraSDK(): void {
  if (cameraSDKInstance) {
    cameraSDKInstance.cleanup();
    cameraSDKInstance = null;
  }
}

// =============================================================================
// React Hook Export
// =============================================================================

export { useCameraSDK } from './useCameraSDK';
