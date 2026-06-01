/**
 * =============================================================================
 * MeriLive SDK Exports
 * =============================================================================
 *
 * Pkg416: NativeCameraSDK + useCameraSDK + CameraPreview REMOVED.
 * They were a parallel camera implementation that fought the LiveKit
 * publisher for the front-facing camera and caused the Android white-screen.
 *
 * Camera access is now centralized:
 *   - Streaming (live / private call / video party / game party) → LiveKit
 *     coordinated by `src/camera/ProCameraEngine.ts` + `useProCamera()`.
 *   - Face Verification → `@/plugins/NativeCamera` only.
 *
 * Nothing else may open the camera.
 * =============================================================================
 */

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

// Camera coordination (Pkg416)
export {
  ProCameraEngine,
  useProCamera,
  CameraConflictError,
  type ProCameraOwner,
} from '@/camera/ProCameraEngine';
