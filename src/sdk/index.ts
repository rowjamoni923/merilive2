/**
 * =============================================================================
 * MeriLive SDK Exports
 * =============================================================================
 * 
 * Central export point for all SDK modules.
 * 
 * =============================================================================
 */

// Camera SDK
export { 
  NativeCameraSDK,
  getCameraSDK,
  resetCameraSDK,
  CameraErrorCodes,
  type CameraConfig,
  type CameraFacing,
  type CameraQuality,
  type PermissionStatus,
  type CameraPermissionResult,
  type PhotoResult,
  type VideoRecordingResult,
  type CameraCapabilities,
  type CameraError,
} from './NativeCameraSDK';

export { useCameraSDK } from './useCameraSDK';

// Video Processing SDK
export {
  VideoProcessingSDK,
  getVideoSDK,
  type VideoMetadata,
  type CompressionOptions,
  type ThumbnailOptions,
  type VideoFilter,
  type TrimOptions,
  type ProcessingProgress,
} from './VideoProcessingSDK';

// ML/AI SDK
export {
  FaceDetector,
  ImageClassifier,
  AIChatService,
  getFaceDetector,
  getImageClassifier,
  getAIChatService,
  type FaceDetectionResult,
  type Face,
  type BoundingBox,
  type FaceLandmarks,
  type Point,
  type ImageClassificationResult,
  type ClassificationLabel,
  type AIMessage,
  type AIStreamCallbacks,
} from './MLModelSDK';

// Native UI SDK
export {
  HapticFeedback,
  NativeDialogs,
  StatusBarControl,
  NativeToast,
  SwipeGestureDetector,
  PullToRefresh,
  KeyboardManager,
  NativeShare,
  NativeClipboard,
  type HapticType,
  type NativeDialogOptions,
  type NativeActionSheetOption,
  type ToastOptions,
  type SwipeGestureConfig,
} from './NativeUISDK';

// Animation SDK
export {
  AnimationEngine,
  PageTransitions,
  ParticleSystem,
  MicroInteractions,
  LoadingAnimations,
  NumberCounter,
  animationEngine,
  getParticleSystem,
  type EasingFunction,
  type AnimationConfig,
  type ParticleConfig,
  type PageTransitionConfig,
} from './AnimationSDK';
