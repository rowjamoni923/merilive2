import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { PageSkeleton } from "@/components/common/PageSkeleton";
import { 
  ArrowLeft, 
  Film,
  User,
  CheckCircle2,
  AlertCircle,
  Upload,
  Loader2,
  Languages,
  Calendar,
  RotateCcw,
  Sparkles,
  ShieldCheck,
  ScanFace,
  ImagePlus,
  Play,
  XCircle,
  Settings,
  Download,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import AvatarWithFrame from "@/components/common/AvatarWithFrame";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { useNativeCameraPermission } from "@/hooks/useNativeCameraPermission";
import { hydrateProfileVerificationState } from "@/utils/profileVerification";
import { recordClientError } from "@/utils/clientErrorLog";
import { useUniversalRealtime } from "@/hooks/useUniversalRealtime";
import { useNativeAndroidFaceCamera } from "@/hooks/useNativeAndroidFaceCamera";
import { useProCamera } from "@/camera/useProCamera";
import { detectLocalFacePoseFromBase64, preloadLocalFacePoseDetector } from "@/lib/localFacePose";

const languages = [
  { code: "bn", name: "Bengali", flag: "🇧🇩" },
  { code: "en", name: "English", flag: "🇺🇸" },
  { code: "hi", name: "हिन्दी", flag: "🇮🇳" },
  { code: "ar", name: "العربية", flag: "🇸🇦" },
  { code: "ur", name: "اردو", flag: "🇵🇰" },
  { code: "id", name: "Bahasa Indonesia", flag: "🇮🇩" },
  { code: "ms", name: "Bahasa Melayu", flag: "🇲🇾" },
  { code: "th", name: "ไทย", flag: "🇹🇭" },
  { code: "vi", name: "Tiếng Việt", flag: "🇻🇳" },
  { code: "tl", name: "Filipino", flag: "🇵🇭" },
];

// Pure pose / threshold logic lives in `@/lib/face-pose` so the regression
// test runner + dev replay tool can exercise the exact same functions.
import {
  DEFAULT_CALIB,
  calibrateThresholds,
  evaluatePose,
  type PoseCalibration,
  type PoseSample,
} from "@/lib/face-pose";

const CALIB_STORAGE_KEY = 'face_verify_pose_calibration_v1';

function loadCachedCalibration(): PoseCalibration | null {
  try {
    const raw = localStorage.getItem(CALIB_STORAGE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as PoseCalibration;
    if (Date.now() - c.capturedAt > 30 * 24 * 60 * 60 * 1000) return null;
    return c;
  } catch { return null; }
}

function saveCalibration(c: PoseCalibration) {
  try { localStorage.setItem(CALIB_STORAGE_KEY, JSON.stringify(c)); } catch { /* ignore */ }
}


// Passive Chamet-style scan stages: no visible left/right/up/down prompts.
// The user holds still while the app captures live evidence, then the server
// compares uploaded photo/video/live scan and applies liveness + duplicate checks.
const FACE_INSTRUCTION_DEFS = {
  live:     { id: 'live',     direction: 'Hold Still',      icon: ScanFace,    description: 'Keep your face inside the frame',                 checkPose: (p: { yaw: number; pitch: number }) => evaluatePose('center', p, DEFAULT_CALIB) },
  photo:    { id: 'photo',    direction: 'Matching Photo',  icon: ImagePlus,   description: 'Comparing your uploaded photo with live scan',     checkPose: (p: { yaw: number; pitch: number }) => evaluatePose('center', p, DEFAULT_CALIB) },
  security: { id: 'security', direction: 'Security Check',  icon: ShieldCheck, description: 'Checking liveness and account ownership securely', checkPose: (p: { yaw: number; pitch: number }) => evaluatePose('center', p, DEFAULT_CALIB) },
} as const;

const buildRandomizedFaceInstructions = () => {
  return [FACE_INSTRUCTION_DEFS.live, FACE_INSTRUCTION_DEFS.photo, FACE_INSTRUCTION_DEFS.security];
};

const getLocalizedInstructions = (_countryName?: string) => buildRandomizedFaceInstructions();

// Single English-only message set.
const getLocalizedMessages = (_countryName?: string) => ({
  failed: 'Verification Failed',
  failedDesc: 'Follow each on-screen instruction carefully and move your head as shown.',
  success: '✅ Face Verification Successful',
  successDesc: 'All liveness checks passed. Your identity has been verified.',
  startScan: 'Start Face Scan',
  tryAgain: 'Try Again',
  recording: 'Recording',
  tips: '💡 Use good lighting • Remove glasses/masks • Keep your face inside the frame',
  beginCheck: 'Begin Face Scan',
  cancel: 'Cancel',
  staticFace: 'Static face detected. Please use a real camera, not a photo.',
});

// Capture the full camera sensor frame for AI analysis. The old object-cover
// crop matched the preview box, but on close-up mobile selfies it cut off part
// of the forehead/chin and made Rekognition/FaceMesh report "no face" even
// while the user clearly saw their face in the oval.
const captureFrameFromLiveVideo = (videoEl: HTMLVideoElement, size = 640): string | null => {
  if (!videoEl || videoEl.readyState < 2 || !videoEl.videoWidth || !videoEl.videoHeight) return null;
  const canvas = document.createElement('canvas');
  const sourceW = videoEl.videoWidth;
  const sourceH = videoEl.videoHeight;
  const scale = size / Math.max(sourceW, sourceH);
  canvas.width = Math.max(1, Math.round(sourceW * scale));
  canvas.height = Math.max(1, Math.round(sourceH * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(videoEl, 0, 0, sourceW, sourceH, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
  return dataUrl.split(',')[1];
};

const assessCameraFrameQuality = (imageBase64: string): Promise<{ usable: boolean; brightness: number; contrast: number }> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 40;
      canvas.height = 40;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return resolve({ usable: false, brightness: 0, contrast: 0 });
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let sum = 0;
      const values: number[] = [];
      for (let i = 0; i < data.length; i += 4) {
        const y = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        values.push(y);
        sum += y;
      }
      const brightness = sum / Math.max(1, values.length);
      const variance = values.reduce((acc, v) => acc + (v - brightness) ** 2, 0) / Math.max(1, values.length);
      const contrast = Math.sqrt(variance);
      resolve({ usable: brightness > 18 && brightness < 245 && contrast > 8, brightness, contrast });
    };
    img.onerror = () => resolve({ usable: false, brightness: 0, contrast: 0 });
    img.src = imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;
  });
};

const FaceVerification = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [verificationStatus, setVerificationStatus] = useState<'pending' | 'verified' | 'unverified' | 'submitted' | 'rejected'>('unverified');
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  const [submitInProgress, setSubmitInProgress] = useState(false);
  // Permanent block (banned face/device/IP, or 10-strike contact-violation lockout).
  // Checked once on mount via check_face_verification_eligibility RPC.
  const [eligibilityBlock, setEligibilityBlock] = useState<{ reason: string; violation_count?: number; threshold?: number } | null>(null);
  const [eligibilityChecked, setEligibilityChecked] = useState(false);
  
  // Native camera permission hook
  const { getCameraStream, requestCameraPermission } = useNativeCameraPermission();
  const nativeFaceCam = useNativeAndroidFaceCamera();

  // Pkg416: claim the verification slot. Mutually exclusive with the
  // streaming family (live / private call / video party / game party).
  // Phase 6 (Camera Rebuild, 2026-06-14) — surface CameraConflictError as a
  // friendly English toast so the user knows to end their live/call first
  // instead of seeing a silent blank CameraX preview.
  const faceVerifyCam = useProCamera('face-verify', true);
  useEffect(() => {
    if (!faceVerifyCam.error) return;
    const holders = faceVerifyCam.error.currentOwners.join(', ');
    toast({
      title: 'Camera busy',
      description: `Please end your ${holders || 'live/call'} session before verifying your face.`,
      variant: 'destructive',
    });
    // Bounce back so the user isn't stuck on a screen whose camera will
    // never start while the streaming family holds the slot.
    const t = setTimeout(() => navigate(-1), 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faceVerifyCam.error]);



  
  // Determine verification type based on user gender
  const isHost = profile?.is_host;
  const isFemale = profile?.gender === 'female' || profile?.gender === 'Female';
  const isHostVerification = isFemale;
  
  // Country-based localized instructions and messages
  const faceInstructions = React.useMemo(() => getLocalizedInstructions(profile?.country_name), [profile?.country_name]);
  const localizedMsg = React.useMemo(() => getLocalizedMessages(profile?.country_name), [profile?.country_name]);

  // Current step for multi-step verification (for hosts)
  const [currentStep, setCurrentStep] = useState(1);
  
  // Step 1: Basic Info (Hosts only)
  const [fullName, setFullName] = useState("");
  const [age, setAge] = useState("");
  const [language, setLanguage] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  
  // User verification photo step
  const [userPhotoFile, setUserPhotoFile] = useState<File | null>(null);
  const [userPhotoPreview, setUserPhotoPreview] = useState<string | null>(null);
  const [userInfoStepComplete, setUserInfoStepComplete] = useState(false);
  const [userPhotoStep, setUserPhotoStep] = useState(true);
  const userPhotoInputRef = useRef<HTMLInputElement>(null);
  
  // Step 2: Video & Photos (Hosts only)
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [videoPoster, setVideoPoster] = useState<string | null>(null);
  const [hostPhotos, setHostPhotos] = useState<File[]>([]);
  const [hostPhotosPreviews, setHostPhotosPreviews] = useState<string[]>([]);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const hostPhotosInputRef = useRef<HTMLInputElement>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [troubleshootOpen, setTroubleshootOpen] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const videoStreamRef = useRef<MediaStream | null>(null);
  const liveVideoRef = useRef<HTMLVideoElement>(null);
  const chunksRef = useRef<Blob[]>([]);
  
  // Face Verification Video States
  const [faceVerificationVideo, setFaceVerificationVideo] = useState<Blob | null>(null);
  const [faceStream, setFaceStream] = useState<MediaStream | null>(null);
  const [faceCameraStarting, setFaceCameraStarting] = useState(false);
  const [usingNativeFaceCamera, setUsingNativeFaceCamera] = useState(false);
  const [faceVerified, setFaceVerified] = useState(false);
  const [verifyingFace, setVerifyingFace] = useState(false);
  const faceVideoRef = useRef<HTMLVideoElement>(null);
  const faceCanvasRef = useRef<HTMLCanvasElement>(null);
  const faceCameraFrameRef = useRef<HTMLDivElement>(null);
  const faceRecorderRef = useRef<MediaRecorder | null>(null);
  const faceChunksRef = useRef<Blob[]>([]);
  const usingNativeFaceCameraRef = useRef(false);
  const faceStreamRef = useRef<MediaStream | null>(null);
  const nativeFaceRecordingRef = useRef(false);
  const autoFaceStartRef = useRef(false);
  const verifyInProgressRef = useRef(false);
  const postSubmitLockedRef = useRef(false);
  const profileRedirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Video verification flow states
  const [verificationStarted, setVerificationStarted] = useState(false);
  const [currentInstruction, setCurrentInstruction] = useState(0);
  const [instructionsCompleted, setInstructionsCompleted] = useState<boolean[]>([false, false, false]);
  const [verificationRecording, setVerificationRecording] = useState(false);
  const [verificationTime, setVerificationTime] = useState(0);
  const [verificationFailed, setVerificationFailed] = useState(false);
  const [faceManualReviewRequired, setFaceManualReviewRequired] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [scanningStatus, setScanningStatus] = useState<'idle' | 'scanning' | 'pass' | 'fail'>('idle');
  const poseHistoryRef = useRef<{yaw:number,pitch:number}[]>([]);
  const [failedAttempts, setFailedAttempts] = useState(0);
  // Live diagnostics — shown to the user during scanning so they understand
  // exactly why the current step is not passing yet.
  type LiveDiag = {
    faceDetected: boolean;
    eyesOpen: boolean;
    yaw: number;
    pitch: number;
    progress: number;       // 0..1 how close current pose is to target
    hint: string;           // short user-facing instruction
    severity: 'ok' | 'warn' | 'error';
  };
  const [liveDiag, setLiveDiag] = useState<LiveDiag | null>(null);
  // Per-device pose calibration. Loaded from cache on mount (skips wait on
  // repeat attempts), recalibrated at the start of every verification using
  // the first ~2s of pose samples.
  const calibrationRef = useRef<PoseCalibration>(loadCachedCalibration() ?? DEFAULT_CALIB);
  const calibSamplesRef = useRef<{ yaw: number; pitch: number }[]>([]);
  const [calibrating, setCalibrating] = useState(false);
  // ── Short neutral-pose calibration mode ────────────────────────────────
  // Lets the user explicitly capture their resting head position before
  // running the multi-step liveness check. Samples ~12 frames over ~3s,
  // computes baseline yaw/pitch + adaptive thresholds, persists to the
  // same cache the verification flow reads on mount.
  const [neutralCalibrating, setNeutralCalibrating] = useState(false);
  const [neutralProgress, setNeutralProgress] = useState(0);
  const [neutralCalib, setNeutralCalib] = useState<PoseCalibration | null>(
    () => loadCachedCalibration()
  );
  const neutralAbortRef = useRef(false);
  // ── Debug log: ring buffer of every poll tick + lifecycle event. Surfaced
  // as a downloadable JSON report on failure so the user / support can see
  // exactly which threshold (yaw/pitch/eyes/no-face) blocked verification
  // and how many polls/timeouts occurred.
  type DebugEntry = {
    t: number; // ms since session start
    kind: 'start' | 'tick' | 'no_face' | 'calib_done' | 'step_pass' | 'timeout' | 'finish' | 'antispoof_fail' | 'error';
    [k: string]: unknown;
  };
  const debugLogRef = useRef<DebugEntry[]>([]);
  const sessionStartRef = useRef<number>(0);
  const consecutiveFailsRef = useRef<number>(0);
  const [lastDebugReport, setLastDebugReport] = useState<string | null>(null);
  const pushDebug = useCallback((entry: Omit<DebugEntry, 't'>) => {
    const t = sessionStartRef.current ? Date.now() - sessionStartRef.current : 0;
    const log = debugLogRef.current;
    log.push({ t, ...entry } as DebugEntry);
    if (log.length > 800) log.splice(0, log.length - 800);
  }, []);
  // Build a self-contained JSON report (calibration + every poll tick + counters)
  // and stash it in state so the failure overlay can offer a Download button.
  const buildAndStoreDebugReport = useCallback((reason: 'failed' | 'antispoof') => {
    const entries = debugLogRef.current;
    const ticks = entries.filter(e => e.kind === 'tick');
    const noFace = entries.filter(e => e.kind === 'no_face');
    const stepPasses = entries.filter(e => e.kind === 'step_pass');
    const timeout = entries.find(e => e.kind === 'timeout');
    const yawVals = ticks.map(e => e.yaw as number).filter(n => typeof n === 'number');
    const pitchVals = ticks.map(e => e.pitch as number).filter(n => typeof n === 'number');
    const stat = (arr: number[]) => arr.length ? {
      min: +Math.min(...arr).toFixed(2),
      max: +Math.max(...arr).toFixed(2),
      avg: +(arr.reduce((s, v) => s + v, 0) / arr.length).toFixed(2),
    } : null;
    const report = {
      schema: 'face-verify-debug/v1',
      generatedAt: new Date().toISOString(),
      durationMs: sessionStartRef.current ? Date.now() - sessionStartRef.current : 0,
      reason,
      summary: {
        totalPolls: ticks.length,
        noFacePolls: noFace.length,
        stepsPassed: stepPasses.length,
        stepsTotal: faceInstructions.length,
        stuckOnStep: currentInstructionRef.current,
        stuckOnInstruction: faceInstructions[currentInstructionRef.current]?.id,
        timedOut: !!timeout,
        yawStats: stat(yawVals),
        pitchStats: stat(pitchVals),
        lastConsecutiveNoFace: consecutiveFailsRef.current,
      },
      calibration: { ...calibrationRef.current },
      env: {
        ua: typeof navigator !== 'undefined' ? navigator.userAgent : 'n/a',
        platform: typeof navigator !== 'undefined' ? (navigator as any).platform : 'n/a',
        viewport: typeof window !== 'undefined' ? { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio } : null,
      },
      events: entries,
    };
    const json = JSON.stringify(report, null, 2);
    setLastDebugReport(json);
    try { localStorage.setItem('face_verify_last_debug_v1', json); } catch {}
    return json;
  }, []);
  const downloadDebugReport = useCallback(() => {
    const json = lastDebugReport ?? buildAndStoreDebugReport('failed');
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `face-verify-debug-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [lastDebugReport, buildAndStoreDebugReport]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const instructionTimerRef = useRef<NodeJS.Timeout | null>(null);
  const poseCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const poseCheckInFlightRef = useRef(false);
  const currentInstructionRef = useRef(0);
  const instructionsCompletedRef = useRef<boolean[]>([false, false, false]);
  // 3-angle stills captured live during pose check (for AWS Rekognition auto-approve)
  const capturedAnglesRef = useRef<{ center?: string; left?: string; right?: string }>({});

  const attachFacePreviewStream = useCallback((stream: MediaStream) => {
    // Pkg-fix: race-guard — if stopVerification already nulled refs OR the
    // stream itself was killed, don't attach a dead stream to a stale element.
    if (!stream || !stream.active) {
      console.warn('[FaceVerification] attach skipped: stream inactive');
      return;
    }
    const videoEl = faceVideoRef.current;
    if (!videoEl) {
      console.warn('[FaceVerification] faceVideoRef not ready, retrying in 200ms...');
      setTimeout(() => {
        const retryEl = faceVideoRef.current;
        if (retryEl && stream.active) attachFacePreviewStream(stream);
      }, 200);
      return;
    }

    setCameraReady(false);
    
    // Clear any previous srcObject
    videoEl.srcObject = null;
    videoEl.muted = true;
    videoEl.defaultMuted = true;
    videoEl.autoplay = true;
    videoEl.playsInline = true;
    videoEl.controls = false;
    videoEl.removeAttribute('controls');
    videoEl.setAttribute('muted', '');
    videoEl.setAttribute('autoplay', '');
    videoEl.setAttribute('playsinline', '');
    videoEl.setAttribute('webkit-playsinline', 'true');
    videoEl.setAttribute('x5-playsinline', 'true');
    videoEl.style.opacity = '0';
    videoEl.style.transition = 'opacity 200ms ease-out';
    videoEl.style.backgroundColor = '#000';
    stream.getVideoTracks().forEach(track => {
      try { if ('contentHint' in track) (track as any).contentHint = 'motion'; } catch {}
    });
    
    const reveal = () => {
      if (videoEl) videoEl.style.opacity = '1';
      setCameraReady(true);
    };

    videoEl.onplaying = reveal;
    videoEl.onloadeddata = reveal;

    // Pkg-fix: wait for loadedmetadata before play() — fixes mobile WebView blank
    // frame when play() is called before hardware finishes initializing.
    const tryPlay = () => {
      videoEl.play()
        .then(() => {
          setTimeout(() => { if (stream.active) reveal(); }, 600);
        })
        .catch(err => {
          console.error('[FaceVerification] Video play failed:', err);
          setTimeout(() => {
            if (videoEl && videoEl.paused) {
              videoEl.play().then(reveal).catch(() => {});
            }
          }, 300);
        });
    };
    videoEl.srcObject = stream;
    if (videoEl.readyState >= 1) tryPlay();
    else videoEl.onloadedmetadata = tryPlay;
    setTimeout(() => {
      const liveVideo = stream.getVideoTracks().some(track => track.readyState === 'live');
      if (liveVideo) {
        reveal();
        if (videoEl.paused) videoEl.play().catch(() => {});
      }
    }, 900);
  }, []);

  const setNativeFaceCameraActive = useCallback((active: boolean) => {
    usingNativeFaceCameraRef.current = active;
    setUsingNativeFaceCamera(active);
  }, []);

  const teardownFaceCameraPreview = useCallback(async () => {
    autoFaceStartRef.current = false;
    verifyInProgressRef.current = false;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (instructionTimerRef.current) {
      clearTimeout(instructionTimerRef.current);
      instructionTimerRef.current = null;
    }
    if (poseCheckIntervalRef.current) {
      clearInterval(poseCheckIntervalRef.current);
      poseCheckIntervalRef.current = null;
    }
    if (usingNativeFaceCameraRef.current) {
      if (nativeFaceRecordingRef.current) {
        await nativeFaceCam.stopRecording().catch(() => null);
        nativeFaceRecordingRef.current = false;
      }
      await nativeFaceCam.stopPreview().catch(() => null);
      setNativeFaceCameraActive(false);
    }
    try { if (faceVideoRef.current) faceVideoRef.current.srcObject = null; } catch {}
    const currentStream = faceStreamRef.current || faceStream;
    if (currentStream) {
      try { currentStream.getTracks().forEach((track) => track.stop()); } catch {}
    }
    faceStreamRef.current = null;
    setFaceStream(null);
    setCameraReady(false);
    setVerificationRecording(false);
    setVerificationStarted(false);
    setScanningStatus('idle');
  }, [faceStream, nativeFaceCam, setNativeFaceCameraActive]);

  const scheduleProfileRedirect = useCallback(() => {
    if (profileRedirectTimerRef.current) clearTimeout(profileRedirectTimerRef.current);
    profileRedirectTimerRef.current = setTimeout(() => {
      navigate('/profile', { replace: true });
    }, 3000);
  }, [navigate]);

  useEffect(() => {
    return () => {
      if (profileRedirectTimerRef.current) clearTimeout(profileRedirectTimerRef.current);
    };
  }, []);

  // Pkg428 — useLayoutEffect so the class is removed synchronously before
  // the next route paints (prevents kalo flash on exit).
  useLayoutEffect(() => {
    document.documentElement.classList.toggle('native-face-camera-active', usingNativeFaceCamera);
    document.body.classList.toggle('native-face-camera-active', usingNativeFaceCamera);
    return () => {
      document.documentElement.classList.remove('native-face-camera-active');
      document.body.classList.remove('native-face-camera-active');
    };
  }, [usingNativeFaceCamera]);

  const syncNativeFaceAperture = useCallback(() => {
    if (typeof document === 'undefined' || !usingNativeFaceCameraRef.current) return;
    const el = faceCameraFrameRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width < 40 || rect.height < 40) return;
    const root = document.documentElement;
    root.style.setProperty('--face-aperture-x', `${Math.round(rect.left + rect.width * 0.5)}px`);
    root.style.setProperty('--face-aperture-y', `${Math.round(rect.top + rect.height * 0.45)}px`);
    root.style.setProperty('--face-aperture-rx', `${Math.round(rect.width * 0.34)}px`);
    root.style.setProperty('--face-aperture-ry', `${Math.round(rect.height * 0.42)}px`);
  }, []);

  useLayoutEffect(() => {
    if (!usingNativeFaceCamera) return;
    const raf = requestAnimationFrame(syncNativeFaceAperture);
    const onUpdate = () => syncNativeFaceAperture();
    window.addEventListener('resize', onUpdate);
    window.addEventListener('scroll', onUpdate, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onUpdate);
      window.removeEventListener('scroll', onUpdate, true);
      const root = document.documentElement;
      root.style.removeProperty('--face-aperture-x');
      root.style.removeProperty('--face-aperture-y');
      root.style.removeProperty('--face-aperture-rx');
      root.style.removeProperty('--face-aperture-ry');
    };
  }, [usingNativeFaceCamera, cameraReady, verificationStarted, currentInstruction, syncNativeFaceAperture]);


  const captureFaceFrameBase64 = useCallback(async (size = 480): Promise<string | null> => {
    if (usingNativeFaceCameraRef.current) {
      const dataUrl = await nativeFaceCam.captureFrame();
      if (!dataUrl) return null;
      return dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
    }

    const videoEl = faceVideoRef.current;
    return videoEl ? captureFrameFromLiveVideo(videoEl, size) : null;
  }, [nativeFaceCam]);

  const refreshVerificationState = useCallback(async (targetUserId: string) => {
    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', targetUserId)
      .single();

    const resolvedProfile = profileData ? await hydrateProfileVerificationState(profileData) : null;
    setProfile(resolvedProfile);

    if (resolvedProfile?.is_face_verified || resolvedProfile?.face_verification_image) {
      setVerificationStatus('verified');
      setRejectionReason(null);
      return;
    }

    const { data: latestSubmission } = await supabase
      .from('face_verification_submissions')
      .select('id, status, rejection_reason, admin_notes')
      .eq('user_id', targetUserId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestSubmission?.status === 'approved') {
      setVerificationStatus('verified');
      setRejectionReason(null);
    } else if (latestSubmission?.status === 'pending' || latestSubmission?.status === 'submitted' || latestSubmission?.status === 'under_review') {
      setVerificationStatus('submitted');
      setRejectionReason(null);
    } else if (latestSubmission?.status === 'rejected') {
      setVerificationStatus('rejected');
      setRejectionReason((latestSubmission as any).rejection_reason || null);
    } else {
      setVerificationStatus('unverified');
      setRejectionReason(null);
    }
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Permanent eligibility lockout (10-strike contact-violation rule +
  // banned face / device / IP reuse). Runs once we know who the user is.
  // If eligibility=false, the page renders a permanent block surface and
  // never mounts the camera — even on re-entry / back-nav.
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.rpc('check_face_verification_eligibility' as any);
        if (cancelled) return;
        if (error) {
          // Fail-open: don't block legit users on RPC outage, but log it.
          console.warn('[face-verification] eligibility RPC error', error);
          setEligibilityChecked(true);
          return;
        }
        const payload = (data ?? {}) as { eligible?: boolean; reason?: string; violation_count?: number; threshold?: number };
        if (payload.eligible === false) {
          setEligibilityBlock({
            reason: String(payload.reason || 'restricted'),
            violation_count: payload.violation_count,
            threshold: payload.threshold,
          });
          // Make sure we're not holding the camera open if the lockout
          // resolves mid-session.
          postSubmitLockedRef.current = true;
          if (typeof document !== 'undefined') {
            document.documentElement.classList.remove('native-face-camera-active');
            document.body.classList.remove('native-face-camera-active');
          }
        }
        setEligibilityChecked(true);
      } catch (e) {
        console.warn('[face-verification] eligibility check failed', e);
        setEligibilityChecked(true);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  // Pkg-instant: when an admin completes/rejects this user's face verification
  // from the admin panel, react instantly via Supabase Realtime so the user
  // doesn't have to refresh. Listens on both profiles (is_face_verified flip)
  // and face_verification_submissions (status change) for the active user.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`face-verify-instant-${userId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
        (payload: any) => {
          const next = payload?.new;
          if (next?.is_face_verified === true) {
            setProfile((prev: any) => ({ ...(prev || {}), ...next }));
            setVerificationStatus('verified');
            setRejectionReason(null);
            toast({ title: '✅ Face verification approved', description: 'Approved by admin. Redirecting…' });
            setTimeout(() => navigate('/profile', { replace: true }), 900);
          } else if (next && next.is_face_verified === false && next.face_verification_status === 'pending_face') {
            // Admin removed verification → keep user on this page to re-submit.
            setProfile((prev: any) => ({ ...(prev || {}), ...next }));
            setVerificationStatus('unverified');
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'face_verification_submissions', filter: `user_id=eq.${userId}` },
        (payload: any) => {
          const next = payload?.new;
          const status = String(next?.status || '').toLowerCase();
          if (status === 'approved') {
            setVerificationStatus('verified');
            setRejectionReason(null);
            toast({ title: '✅ Face verification approved', description: 'Approved by admin. Redirecting…' });
            setTimeout(() => navigate('/profile', { replace: true }), 900);
          } else if (status === 'rejected') {
            setVerificationStatus('rejected');
            setRejectionReason(next?.rejection_reason || null);
            toast({ title: 'Face verification rejected', description: next?.rejection_reason || 'Please re-submit.', variant: 'destructive' });
          } else if (status === 'pending' || status === 'submitted' || status === 'under_review') {
            setVerificationStatus('submitted');
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  
  // Existing account detection states
  const [existingAccount, setExistingAccount] = useState<{
    userId: string;
    displayName: string;
    avatarUrl: string;
    isDeleted: boolean;
    deletionScheduledAt: string | null;
  } | null>(null);
  const [showExistingAccountModal, setShowExistingAccountModal] = useState(false);

  // Capture a frame from video blob as base64 for Rekognition
  const captureFrameFromVideo = (videoBlob: Blob, size = 640): Promise<string> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.src = URL.createObjectURL(videoBlob);
      video.muted = true;
      
      video.onloadeddata = () => {
        video.currentTime = 1; // Get frame at 1 second
      };
      
      video.onseeked = () => {
        const canvas = document.createElement('canvas');
        const aspect = video.videoWidth / video.videoHeight;
        canvas.width = size;
        canvas.height = Math.round(size / aspect);
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Get base64 without the data:image prefix
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        const base64 = dataUrl.split(',')[1];
        URL.revokeObjectURL(video.src);
        resolve(base64);
      };
      
      video.onerror = () => {
        URL.revokeObjectURL(video.src);
        reject(new Error('Failed to load video for frame capture'));
      };
      
      video.load();
    });
  };

  const generateVideoPosterFromUrl = useCallback((sourceUrl: string): Promise<string | null> => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      let settled = false;
      const settle = (poster: string | null) => {
        if (settled) return;
        settled = true;
        resolve(poster);
      };

      video.muted = true;
      video.playsInline = true;
      video.preload = 'metadata';
      video.crossOrigin = 'anonymous';
      video.onloadedmetadata = () => {
        try {
          video.currentTime = Number.isFinite(video.duration) && video.duration > 0.4 ? 0.35 : 0;
        } catch {
          settle(null);
        }
      };
      video.onseeked = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, video.videoWidth || 640);
          canvas.height = Math.max(1, video.videoHeight || 360);
          const ctx = canvas.getContext('2d');
          if (!ctx) return settle(null);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          settle(canvas.toDataURL('image/jpeg', 0.82));
        } catch {
          settle(null);
        }
      };
      video.onerror = () => settle(null);
      setTimeout(() => settle(null), 2500);
      video.src = sourceUrl;
      video.load();
    });
  }, []);

  const setHostIntroVideoPreview = useCallback((url: string) => {
    setVideoPreview(url);
    setVideoPoster(null);
    generateVideoPosterFromUrl(url).then((poster) => {
      if (poster) setVideoPoster(poster);
    });
  }, [generateVideoPosterFromUrl]);

  // ⛔ Removed (Pkg357): the old single-shot `auto-face-verify` path produced
  // unreliable male/female detection because it analysed ONE frame with no
  // cross-checks. All face verification now goes through the 3-API pipeline
  // in `face-verification-analyze` (AWS Rekognition multi-angle + external
  // liveness provider + duplicate-face provider), triggered after DB insert.


  // Generate deterministic face/video hash; never random, so duplicate checks do not silently miss.
  const sha256String = async (value: string): Promise<string> => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const generateFaceHash = async (videoBlob: Blob): Promise<string> => {
    const fallbackHash = async () => {
      const bytes = new Uint8Array(await videoBlob.slice(0, 1024 * 1024).arrayBuffer());
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
    };

    return new Promise((resolve) => {
      const video = document.createElement('video');
      const objectUrl = URL.createObjectURL(videoBlob);
      let settled = false;
      const settle = async (value?: string) => {
        if (settled) return;
        settled = true;
        URL.revokeObjectURL(objectUrl);
        resolve(value || await fallbackHash());
      };

      video.src = objectUrl;
      video.muted = true;
      video.playsInline = true;
      video.onloadedmetadata = () => {
        const target = Number.isFinite(video.duration) && video.duration > 0.8 ? 0.5 : 0;
        try { video.currentTime = target; } catch { void settle(); }
      };
      video.onseeked = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = 32;
          canvas.height = 32;
          const ctx = canvas.getContext('2d');
          if (!ctx) return void settle();
          ctx.drawImage(video, 0, 0, 32, 32);
          const imageData = ctx.getImageData(0, 0, 32, 32);
          let hash = '';
          for (let i = 0; i < imageData.data.length; i += 16) {
            hash += imageData.data[i].toString(16).padStart(2, '0');
          }
          void settle(hash.substring(0, 64));
        } catch {
          void settle();
        }
      };
      video.onerror = () => { void settle(); };
      setTimeout(() => { void settle(); }, 4000);
      video.load();
    });
  };

  // Check if face already exists in system
  const checkExistingFace = async (faceHash: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase.rpc('find_account_by_face', {
        face_hash_param: faceHash
      });
      
      if (error) {
        console.error('Face check error:', error);
        recordClientError({ label: "FaceVerification.checkExistingFace", message: error instanceof Error ? error.message : String(error) });
        return false;
      }
      
      if (data && data.length > 0 && data[0].user_id !== userId) {
        setExistingAccount({
          userId: data[0].user_id,
          displayName: data[0].display_name || 'Unknown User',
          avatarUrl: data[0].avatar_url || '',
          isDeleted: data[0].is_deleted || false,
          deletionScheduledAt: data[0].deletion_scheduled_at,
        });
        setShowExistingAccountModal(true);
        return true;
      }
      
      return false;
    } catch (err) {
      console.error('Error checking existing face:', err);
      recordClientError({ label: "FaceVerification.checkExistingFace", message: err instanceof Error ? err.message : String(err) });
      return false;
    }
  };

  // BUG-03 fix: the client-side duplicate ban was driven by a trivially
  // spoofable 32×32 perceptual hash that produces a different hex string
  // every time lighting/compression changes — so a real duplicate often
  // slipped past, and a logged-in user could spoof a self-ban via injected
  // JS by calling ban_duplicate_face_attempt with their own user id.
  //
  // We now SHOW the duplicate-account warning modal (UX) but DO NOT auto-ban
  // or sign the user out from the client. The authoritative duplicate check
  // lives in face-verification-analyze (AWS Rekognition SearchFacesByImage +
  // external provider) and ban decisions are taken server-side.
  const enforceDuplicateFaceBan = async (matched: any) => {
    if (!userId || !matched?.user_id) return;
    console.warn('[FaceVerify] Client duplicate-face advisory — server analyze pipeline will enforce ban if AWS confirms.');
    toast({
      title: "Duplicate Face Detected",
      description: "This face appears already registered. Your submission will be reviewed and the account banned if confirmed by our verification system.",
      variant: "destructive",
    });
  };

  // Check user and verification status
  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/auth');
        return;
      }
      setUserId(user.id);
      await refreshVerificationState(user.id);
      
      setLoading(false);
    };
    checkUser();
    
    return () => {
      if (usingNativeFaceCameraRef.current) {
        nativeFaceCam.stopPreview().catch(() => null);
        usingNativeFaceCameraRef.current = false;
        nativeFaceRecordingRef.current = false;
      }
      // Pkg-fix: clear <video> srcObject BEFORE stopping tracks → prevents
      // frozen/white last-frame on Android WebView.
      try { if (faceVideoRef.current) faceVideoRef.current.srcObject = null; } catch {}
      try { if (liveVideoRef.current) liveVideoRef.current.srcObject = null; } catch {}
      if (faceStreamRef.current) {
        faceStreamRef.current.getTracks().forEach(track => track.stop());
        faceStreamRef.current = null;
      }
      if (videoStreamRef.current) {
        videoStreamRef.current.getTracks().forEach(track => track.stop());
        videoStreamRef.current = null;
      }
      // Pkg-fix: release cross-section prepared streams so Live/Call/Party can
      // acquire the camera immediately after the user leaves face verification.
      try {
        import('@/features/live/hostPreviewSession').then(m => m.clearPreparedHostPreviewStream({ stopTracks: true })).catch(() => {});
        import('@/features/call/preparedCallMedia').then(m => m.clearPreparedCallMediaStream(null, { stopTracks: true })).catch(() => {});
      } catch {}
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (instructionTimerRef.current) {
        clearTimeout(instructionTimerRef.current);
      }
      if (poseCheckIntervalRef.current) {
        clearInterval(poseCheckIntervalRef.current);
      }
    };
  }, [navigate, refreshVerificationState]);

  // 🚀 Enterprise Real-time Sync: listen to direct DB changes for instant UI updates.
  // When admin approves/rejects, the status updates here without manual refresh.
  useUniversalRealtime(
    ['face_verification_submissions', 'host_applications'],
    (table, _event, payload) => {
      if (!userId) return;
      const rowUser = (payload as any)?.user_id ?? (payload as any)?.id;
      if (rowUser && rowUser !== userId) return;

      console.log(`[FaceVerification] Real-time sync triggered by ${table}`);
      void refreshVerificationState(userId);
    },
    !!userId
  );

  // Handle photo selection (Step 1)
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "Error",
          description: "Image size cannot exceed 10MB",
          variant: "destructive",
        });
        return;
      }
      setPhotoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setPhotoPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  // Handle host photos selection (Step 2)
  const handleHostPhotosSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const newPhotos: File[] = [];
      const newPreviews: string[] = [];
      
      Array.from(files).slice(0, 3).forEach(file => {
        if (file.size <= 10 * 1024 * 1024) {
          newPhotos.push(file);
          const reader = new FileReader();
          reader.onloadend = () => {
            newPreviews.push(reader.result as string);
            if (newPreviews.length === newPhotos.length) {
              setHostPhotosPreviews(prev => [...prev, ...newPreviews].slice(0, 3));
            }
          };
          reader.readAsDataURL(file);
        }
      });
      
      setHostPhotos(prev => [...prev, ...newPhotos].slice(0, 3));
    }
  };

  // Handle video selection
  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 50 * 1024 * 1024) {
        toast({
          title: "Error",
          description: "Video size cannot exceed 50MB",
          variant: "destructive",
        });
        return;
      }
      setVideoFile(file);
      const url = URL.createObjectURL(file);
      setHostIntroVideoPreview(url);
    }
  };

  // Start video recording for host
  const startRecording = async () => {
    try {
      // Pkg-fix: removed double getUserMedia probe (requestCameraPermission) — getCameraStream
      // handles permission internally and keeps the user-gesture chain intact on Android WebView.
      // The previous probe stopped its own stream and the immediate re-acquire produced a blank
      // stream on Android because Camera2 HAL had not finished releasing.
      const stream = await getCameraStream(true); // true for audio
      if (!stream) {
        throw new Error('Failed to get camera stream');
      }
      
      videoStreamRef.current = stream;
      
      if (liveVideoRef.current) {
        liveVideoRef.current.srcObject = stream;
        await liveVideoRef.current.play().catch(console.error);
      }
      
      const mimeType = MediaRecorder.isTypeSupported('video/mp4')
        ? 'video/mp4'
        : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
          ? 'video/webm;codecs=vp8,opus'
          : MediaRecorder.isTypeSupported('video/webm')
            ? 'video/webm'
            : '';
      
      const mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      
      mediaRecorder.onstop = () => {
        const type = mediaRecorder.mimeType || mimeType || 'video/webm';
        const blob = new Blob(chunksRef.current, { type });
        const file = new File([blob], `verification-video.${type.includes('mp4') ? 'mp4' : 'webm'}`, { type });
        setVideoFile(file);
        setHostIntroVideoPreview(URL.createObjectURL(blob));
        stream.getTracks().forEach(track => track.stop());
      };
      
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      
      const timer = setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= 15) {
            clearInterval(timer);
            stopRecording();
            return 15;
          }
          return prev + 1;
        });
      }, 1000);
      
    } catch (error: any) {
      console.error('Recording error:', error);
      recordClientError({ label: "FaceVerification.timer", message: error instanceof Error ? error.message : String(error) });
      toast({
        title: "Camera access failed",
        description: error.message || "Please grant camera permission and try again",
        variant: "destructive",
      });
    }
  };

  // Stop video recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // Start face verification camera
  const startFaceCamera = useCallback(async () => {
    setFaceCameraStarting(true);
    setCameraReady(false);
    try {
      if (!faceVerifyCam.ready || faceVerifyCam.error) {
        throw new Error('Camera busy — Please end your live, party, or call session before verifying your face.');
      }
      autoFaceStartRef.current = false;
      preloadLocalFacePoseDetector();
      setNativeFaceCameraActive(false);

      // Section#5 pass-6 (Bug M — NATIVE CAMERA CONFLICT): kill any stale
      // preview streams from other sections (GoLive/PrivateCall) before starting
      // the verification camera. Ensures exclusive hardware access.
      const { clearPreparedHostPreviewStream } = await import('@/features/live/hostPreviewSession');
      const { clearPreparedCallMediaStream } = await import('@/features/call/preparedCallMedia');
      clearPreparedHostPreviewStream({ stopTracks: true });
      clearPreparedCallMediaStream(null, { stopTracks: true });
      // (duplicate stopPreview removed — single stopPreview below is sufficient)

      // Pkg-fix: clear <video> srcObject BEFORE stopping tracks to avoid the
      // frozen last-frame "white box" while the new stream initializes.
      try { if (faceVideoRef.current) faceVideoRef.current.srcObject = null; } catch {}
      if (faceStreamRef.current) {
        faceStreamRef.current.getTracks().forEach(track => track.stop());
        faceStreamRef.current = null;
        setFaceStream(null);
      }

      // Android native app: use our CameraX bridge as the source of truth.
      // MainActivity intentionally has no WebView getUserMedia permission gate,
      // so relying on navigator.mediaDevices inside the APK can fail even after
      // the Android runtime permission is granted. NativeCamera.start() owns the
      // Android permission + preview surface, and captureFrame() feeds liveness.
      await nativeFaceCam.stopPreview().catch(() => null);
      if (await nativeFaceCam.isAvailable()) {
        await nativeFaceCam.startPreview('720p');
        setNativeFaceCameraActive(true);
        for (let i = 0; i < 24; i++) {
          const frame = await nativeFaceCam.captureFrame();
          if (frame) {
            const base64 = frame.includes(',') ? frame.split(',')[1] : frame;
            capturedAnglesRef.current.center = capturedAnglesRef.current.center || base64;
            break;
          }
          await new Promise(resolve => setTimeout(resolve, 250));
        }
        setCameraReady(true);
        return;
      }

      // Browser / old APK fallback: keep the existing WebView MediaStream path.
      const stream = await getCameraStream(false);
      if (!stream) {
        throw new Error('Failed to get camera stream');
      }
      
      faceStreamRef.current = stream;
      setFaceStream(stream);
      // BUG-08 fix: do NOT attach here — the [faceStream] useEffect below
      // already attaches. Calling twice causes a `play()` race that throws
      // AbortError on Android WebView and leaves the preview black.
    } catch (error: any) {
      console.error('Face camera error:', error);
      recordClientError({ label: "FaceVerification.stream", message: error instanceof Error ? error.message : String(error) });
      setNativeFaceCameraActive(false);
      toast({
        title: "Camera access failed",
        description: error.message || "Please grant camera permission from settings.",
        variant: "destructive",
      });
    } finally {
      setFaceCameraStarting(false);
    }
  }, [faceStream, toast, getCameraStream, attachFacePreviewStream, nativeFaceCam, setNativeFaceCameraActive, faceVerifyCam.ready, faceVerifyCam.error]);
  
  useEffect(() => {
    if (faceStream) {
      attachFacePreviewStream(faceStream);
    }
  }, [faceStream, attachFacePreviewStream]);

  // Call face-check API to get real pose data
  const checkFacePose = async (imageBase64: string): Promise<{faceDetected: boolean, pose: {yaw: number, pitch: number, roll: number}, eyesOpen: boolean, source?: 'server' | 'local'} | null> => {
    const withSoftTimeout = async <T,>(promise: Promise<T>, timeoutMs: number): Promise<T | null> => {
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          promise,
          new Promise<null>((resolve) => { timeoutId = setTimeout(() => resolve(null), timeoutMs); }),
        ]);
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    };

    const quality = await assessCameraFrameQuality(imageBase64);
    if (!quality.usable) {
      pushDebug({ kind: 'bad_frame_quality', brightness: +quality.brightness.toFixed(1), contrast: +quality.contrast.toFixed(1) });
      return null;
    }

    const localPosePromise = detectLocalFacePoseFromBase64(imageBase64);
    const serverPosePromise = (async () => {
      try {
        const response = await supabase.functions.invoke('face-check', {
          body: { imageBase64, streamId: 'face-verification' },
        });
        if (response.error || !response.data) return null;
        const faces = Number(response.data.faceCount ?? (response.data.faceDetected ? 1 : 0));
        const confidence = Number(response.data.confidence ?? 0);
        // BUG-04 fix: AWS Rekognition's yaw convention is opposite of our
        // local MediaPipe pose (Rekognition: positive yaw = person's right;
        // local: positive yaw = person's left). Flipping the sign so server
        // fallback (used on low-end devices without WebGL) produces the same
        // left/right semantics as the local path. Without this, devices that
        // fail to load TF.js can NEVER pass the left/right steps.
        const rawPose = response.data.pose || { yaw: 0, pitch: 0, roll: 0 };
        return {
          faceDetected: Boolean(response.data.faceDetected) && faces === 1 && confidence >= 70,
          pose: { yaw: -Number(rawPose.yaw || 0), pitch: Number(rawPose.pitch || 0), roll: Number(rawPose.roll || 0) },
          eyesOpen: response.data.eyesOpen !== false,
          source: 'server' as const,
        };
      } catch (err) {
        console.error('[FaceVerify] Pose check error:', err);
        recordClientError({ label: "FaceVerification.response", message: err instanceof Error ? err.message : String(err) });
        return null;
      }
    })();

    try {
      // BUG-12 fix: race local detector first. If MediaPipe returns a confident
      // face we SKIP the server Rekognition call entirely — saves up to 90
      // AWS DetectFaces calls per verification attempt (one per second × 90s).
      // Server is only used as a fallback for devices without WebGL/TF.js.
      const fastLocalPose = await withSoftTimeout(localPosePromise, 900);
      if (fastLocalPose?.faceDetected) {
        return fastLocalPose;
      }

      const serverPose = await withSoftTimeout(serverPosePromise, 2200);
      // Local detector may have finished after the fast race — give it a small
      // additional window in case the first attempt returned no face.
      const localPose = fastLocalPose ?? await withSoftTimeout(localPosePromise, serverPose?.faceDetected ? 600 : 2200);
      if (localPose?.faceDetected) {
        return {
          ...localPose,
          eyesOpen: localPose.eyesOpen && serverPose?.eyesOpen !== false,
        };
      }

      if (serverPose?.faceDetected && serverPose.eyesOpen) return serverPose;
      if (localPose?.faceDetected) return localPose;

      return serverPose ?? localPose ?? null;
    } catch (err) {
      console.error('[FaceVerify] Pose check error:', err);
      recordClientError({ label: "FaceVerification.response", message: err instanceof Error ? err.message : String(err) });
      return null;
    }
  };

  // ── Short neutral-pose calibration ──────────────────────────────────────
  // Hold a neutral, forward-facing pose for ~3 seconds. Collected samples
  // feed `calibrateThresholds`, the resulting baseline + adaptive thresholds
  // are cached and used as the starting point for the next verification run,
  // so users with off-axis cameras / glasses don't have to fight defaults.
  const runNeutralCalibration = async () => {
    if (!cameraReady || (!usingNativeFaceCameraRef.current && !faceVideoRef.current)) {
      toast({ title: 'Camera not ready', description: 'Please wait for the preview, then try again.', variant: 'destructive' });
      return;
    }
    if (neutralCalibrating) return;
    neutralAbortRef.current = false;
    setNeutralCalibrating(true);
    setNeutralProgress(0);
    const TARGET = 12;          // ~3s at 250ms cadence
    const samples: PoseSample[] = [];
    let consecutiveNoFace = 0;
    try {
      while (samples.length < TARGET && !neutralAbortRef.current) {
        const frame = await captureFaceFrameBase64();
        if (frame) {
          const res = await checkFacePose(frame);
          if (res?.faceDetected) {
            samples.push({ yaw: res.pose.yaw, pitch: res.pose.pitch });
            setNeutralProgress(samples.length / TARGET);
            consecutiveNoFace = 0;
          } else {
            consecutiveNoFace++;
            if (consecutiveNoFace >= 8) {
              throw new Error('No face detected. Center your face in the frame and retry.');
            }
          }
        }
        await new Promise(r => setTimeout(r, 250));
      }
      if (neutralAbortRef.current) {
        setNeutralCalibrating(false);
        setNeutralProgress(0);
        return;
      }
      if (samples.length < 6) {
        throw new Error('Not enough samples captured. Please try again with steady lighting.');
      }
      const calib = calibrateThresholds(samples);
      calibrationRef.current = calib;
      saveCalibration(calib);
      setNeutralCalib(calib);
      pushDebug({ kind: 'calib_done', calibration: { ...calib }, samples: samples.length, source: 'neutral_mode' });
      toast({
        title: 'Calibration saved',
        description: `Baseline yaw ${calib.baselineYaw.toFixed(1)}°, pitch ${calib.baselinePitch.toFixed(1)}°. Thresholds tuned for your camera.`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Calibration failed';
      toast({ title: 'Calibration failed', description: msg, variant: 'destructive' });
    } finally {
      setNeutralCalibrating(false);
      setNeutralProgress(0);
    }
  };

  // Start face verification recording with REAL liveness checking
  const startFaceVerification = async () => {
    // BUG-06 fix: hard-lock re-entry. The auto-start effect retries up to 3×
    // with a 1.5s timer; if the first call is still negotiating (slow device
    // or Rekognition warm-up) the retry would spawn a 2nd MediaRecorder +
    // 2nd setInterval pose loop writing into the same chunks buffer.
    if (verifyInProgressRef.current) {
      console.log('[FaceVerify] start ignored — already in progress');
      return;
    }
    if (!cameraReady || (!usingNativeFaceCameraRef.current && !faceStream)) {
      toast({ title: "Camera not ready", description: "Please wait...", variant: "destructive" });
      return;
    }
    verifyInProgressRef.current = true;

    setVerificationStarted(true);
    setVerificationRecording(true);
    setCurrentInstruction(0);
    currentInstructionRef.current = 0;
    const freshCompleted = faceInstructions.map(() => false);
    setInstructionsCompleted(freshCompleted);
    instructionsCompletedRef.current = freshCompleted;
    setVerificationFailed(false);
    setFaceManualReviewRequired(false);
    setVerificationTime(0);
    setScanningStatus('idle');
      poseHistoryRef.current = [];
    setLiveDiag(null); setCalibrating(false);
    faceChunksRef.current = [];
    capturedAnglesRef.current = {};
    // Reset debug log for this attempt
    debugLogRef.current = [];
    sessionStartRef.current = Date.now();
    consecutiveFailsRef.current = 0;
    setLastDebugReport(null);
    pushDebug({
      kind: 'start',
      attempt: failedAttempts + 1,
      calibration: { ...calibrationRef.current },
      ua: typeof navigator !== 'undefined' ? navigator.userAgent : 'n/a',
      viewport: typeof window !== 'undefined' ? { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio } : null,
    });

    try {
      if (usingNativeFaceCameraRef.current) {
        for (let i = 0; i < 24; i++) {
          const warmupFrame = await captureFaceFrameBase64(720);
          if (warmupFrame) {
            capturedAnglesRef.current.center = capturedAnglesRef.current.center || warmupFrame;
            break;
          }
          await new Promise(resolve => setTimeout(resolve, 250));
        }
        try {
          await nativeFaceCam.startRecording();
          nativeFaceRecordingRef.current = true;
        } catch (nativeRecErr) {
          nativeFaceRecordingRef.current = false;
          pushDebug({ kind: 'recorder_skip', message: nativeRecErr instanceof Error ? nativeRecErr.message : String(nativeRecErr) });
        }
      } else {
        const webFaceStream = faceStream;
        if (!webFaceStream) throw new Error('Camera stream is not ready');
        // MediaRecorder is optional — we capture liveness stills separately.
        // If browser codec support fails (common on iOS Safari / some Android WebViews),
        // we still proceed with the pose-checking flow so verification is never blocked.
        try {
          const mimeType = MediaRecorder.isTypeSupported('video/mp4')
            ? 'video/mp4'
            : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
              ? 'video/webm;codecs=vp8,opus'
              : MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
                ? 'video/webm;codecs=vp8'
                : MediaRecorder.isTypeSupported('video/webm')
                  ? 'video/webm'
                  : '';

          const mediaRecorder = mimeType
            ? new MediaRecorder(webFaceStream, { mimeType })
            : new MediaRecorder(webFaceStream);
          faceRecorderRef.current = mediaRecorder;

          mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) faceChunksRef.current.push(e.data);
          };

          mediaRecorder.onstop = () => {
            const blob = new Blob(faceChunksRef.current, { type: mediaRecorder.mimeType || mimeType || 'video/webm' });
            setFaceVerificationVideo(blob);
          };

          mediaRecorder.start();
        } catch (recErr) {
          console.warn('[FaceVerify] MediaRecorder unavailable, continuing without video capture:', recErr);
          pushDebug({ kind: 'recorder_skip', message: recErr instanceof Error ? recErr.message : String(recErr) });
          faceRecorderRef.current = null;
        }
      }
      
      // Overall verification window: 3 essential liveness poses × stepWindowSec,
      // padded for calibration/capture latency. This avoids users getting stuck
      // on fragile up/down pitch detection while still capturing front/left/right
      // images for Rekognition + manual admin review.
      const calib = calibrationRef.current;
      const overallSec = Math.min(90, Math.max(55,
        Math.round(calib.stepWindowSec * faceInstructions.length + 22)
      ));
      let elapsed = 0;
      timerRef.current = setInterval(() => {
        elapsed++;
        setVerificationTime(elapsed);
        if (elapsed >= overallSec) {
          const completedCount = instructionsCompletedRef.current.filter(Boolean).length;
          const allDone = instructionsCompletedRef.current.every(Boolean);
          const partialDone = completedCount >= 2;
          const faceTicks = debugLogRef.current.filter(e => e.kind === 'tick' && e.eyesOpen !== false).length;
          const noFacePolls = debugLogRef.current.filter(e => e.kind === 'no_face').length;
          const enoughFaceEvidence = faceTicks >= 6 && noFacePolls <= Math.max(4, faceTicks);
          const analyzerUncertainButUsable = !allDone && enoughFaceEvidence && (completedCount >= 1 || poseHistoryRef.current.length >= 8);
          pushDebug({
            kind: 'timeout',
            elapsedSec: elapsed,
            overallSec,
            stepsCompleted: [...instructionsCompletedRef.current],
            faceTicks,
            noFacePolls,
            analyzerUncertainButUsable,
            stuckOnStep: currentInstructionRef.current,
            stuckOnInstruction: faceInstructions[currentInstructionRef.current]?.id,
          });
          finishVerification(allDone || partialDone || analyzerUncertainButUsable, !allDone && (partialDone || analyzerUncertainButUsable));
        }
      }, 1000);
      
      // Start real pose checking loop (every 1.5 seconds)
      startRealPoseChecking();
      
    } catch (error) {
      console.error('Face recording error:', error);
      recordClientError({ label: "FaceVerification.allDone", message: error instanceof Error ? error.message : String(error) });
      toast({ title: "Recording failed", description: "Please try again", variant: "destructive" });
      setVerificationStarted(false);
      setVerificationRecording(false);
      verifyInProgressRef.current = false; // BUG-06: release lock on error
    }
  };

  useEffect(() => {
    const faceCameraActive = !!faceStream || usingNativeFaceCamera;
    if (!faceCameraActive || !cameraReady || verificationStarted || verificationRecording || faceVerified) return;

    let cancelled = false;
    let attempt = 0;

    const tryStart = async () => {
      if (cancelled) return;
      attempt += 1;
      // Re-read latest state via refs / closure; if already started, bail
      if (verificationStarted || verificationRecording || faceVerified) return;
      try {
        console.log(`[FaceVerify] auto-start attempt ${attempt}`);
        await startFaceVerification();
      } catch (err) {
        console.error('[FaceVerify] auto-start error:', err);
        recordClientError({ label: 'FaceVerification.autoStart', message: err instanceof Error ? err.message : String(err) });
      }
      // If the start did not actually flip the state within 1.5s, retry up to 3 times.
      if (cancelled) return;
      window.setTimeout(() => {
        if (cancelled) return;
        if (!verificationStarted && !verificationRecording && !faceVerified && attempt < 3) {
          autoFaceStartRef.current = false;
          tryStart();
        }
      }, 1500);
    };

    autoFaceStartRef.current = true;
    const timer = window.setTimeout(tryStart, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [faceStream, usingNativeFaceCamera, cameraReady, verificationStarted, verificationRecording, faceVerified]);

  const evaluateAdaptivePose = (
    instrId: string,
    pose: { yaw: number; pitch: number },
    c: PoseCalibration,
  ): boolean => {
    const dy = pose.yaw - c.baselineYaw;
    const dp = pose.pitch - c.baselinePitch;
    return evaluatePose('center', pose, c);
  };

  // Compute a precise, user-facing hint about why the current step is not
  // yet passing. Uses the live calibration so deltas are measured from the
  // user's natural pose, not absolute zero.
  const computeStepDiag = (
    instrId: string,
    pose: { yaw: number; pitch: number },
    faceDetected: boolean,
    eyesOpen: boolean,
    c: PoseCalibration,
  ): { hint: string; severity: LiveDiag['severity']; progress: number } => {
    if (!faceDetected) {
      return { hint: 'Face not detected — center your face in the oval', severity: 'error', progress: 0 };
    }
    if (!eyesOpen) {
      return { hint: 'Keep your eyes open and look at the camera', severity: 'warn', progress: 0.3 };
    }
    const dy = pose.yaw   - c.baselineYaw;
    const dp = pose.pitch - c.baselinePitch;
    const ady = Math.abs(dy);
    const adp = Math.abs(dp);
    const clamp = (n: number) => Math.max(0, Math.min(1, n));
    switch (instrId) {
      case 'live':
      case 'photo':
      case 'security': {
        const progress = clamp(1 - Math.max(ady / c.centerYaw, adp / c.centerPitch));
        if (ady < c.centerYaw && adp < c.centerPitch)
          return { hint: 'Hold steady — looks great', severity: 'ok', progress: 1 };
        if (ady >= c.centerYaw)
          return { hint: 'Keep your face centered in the frame', severity: 'warn', progress };
        return { hint: 'Keep the phone level and hold steady', severity: 'warn', progress };
      }
      default:
        return { hint: 'Hold still while we verify your face', severity: 'warn', progress: 0 };
    }
  };

  // Real pose checking - captures frame & sends to face-check API
  const startRealPoseChecking = () => {
    let consecutiveFails = 0;
    let noFaceStartedAt = 0;
    // Reset calibration sampler. We collect ~10 samples (≈2s @ 200ms / ≈2.5s
    // @ 250ms — we sample faster than the main loop) of the user's natural
    // pose before scoring any step.
    calibSamplesRef.current = [];
    setCalibrating(true);
    const CALIB_TARGET = 2;
    
    poseCheckIntervalRef.current = setInterval(async () => {
      if (poseCheckInFlightRef.current) return;
      poseCheckInFlightRef.current = true;
      try {
        if (!usingNativeFaceCameraRef.current && !faceVideoRef.current) return;
      
        const frameBase64 = await captureFaceFrameBase64();
        if (!frameBase64) {
          consecutiveFails++;
          consecutiveFailsRef.current = consecutiveFails;
          if (!noFaceStartedAt) noFaceStartedAt = Date.now();
          setScanningStatus('fail');
          setLiveDiag({
            faceDetected: false, eyesOpen: false, yaw: 0, pitch: 0, progress: 0,
            hint: 'Camera frame is not ready — hold steady for a moment',
            severity: 'error',
          });
          pushDebug({ kind: 'no_face', consecutive: consecutiveFails, reason: 'empty_camera_frame', apiOk: false });
          if (consecutiveFails >= 8 || Date.now() - noFaceStartedAt > 12000) {
            pushDebug({ kind: 'finish', success: true, manualReviewRequired: true, reason: 'camera_frame_unavailable_open_to_admin' });
            finishVerification(true, true);
          }
          return;
        }
      
        setScanningStatus('scanning');
      
      const result = await checkFacePose(frameBase64);
      
      if (!result || !result.faceDetected) {
        consecutiveFails++;
        consecutiveFailsRef.current = consecutiveFails;
        if (!noFaceStartedAt) noFaceStartedAt = Date.now();
        setScanningStatus('fail');
        setLiveDiag({
          faceDetected: false, eyesOpen: false, yaw: 0, pitch: 0, progress: 0,
          hint: consecutiveFails > 3
            ? 'Still no face — improve lighting and hold the phone at eye level'
            : 'Face not detected — center your face in the oval',
          severity: 'error',
        });
        pushDebug({
          kind: 'no_face',
          consecutive: consecutiveFails,
          step: currentInstructionRef.current,
          instruction: faceInstructions[currentInstructionRef.current]?.id,
          apiOk: !!result,
        });
        return;
      }
      
      consecutiveFails = 0;
      noFaceStartedAt = 0;
      const pose = result.pose;
      
      // ─── Calibration phase ─────────────────────────────────────────────
      // Collect samples while the user looks naturally at the camera, then
      // derive baseline + thresholds. Skip if we already have a fresh cached
      // calibration AND this is not the first attempt of the session.
      if (calibSamplesRef.current.length < CALIB_TARGET) {
        calibSamplesRef.current.push({ yaw: pose.yaw, pitch: pose.pitch });
        const filled = calibSamplesRef.current.length;
        setLiveDiag({
          faceDetected: true,
          eyesOpen: result.eyesOpen,
          yaw: pose.yaw, pitch: pose.pitch,
          progress: filled / CALIB_TARGET,
            hint: 'Preparing secure scan…',
          severity: 'warn',
        });
        if (filled === CALIB_TARGET) {
          const calib = calibrateThresholds(calibSamplesRef.current);
          calibrationRef.current = calib;
          saveCalibration(calib);
          setNeutralCalib(calib);
          setCalibrating(false);
          console.log('[FaceVerify] calibration', calib);
          pushDebug({ kind: 'calib_done', calibration: { ...calib }, samples: calibSamplesRef.current.length });
        }
        return;
      }

      // Track pose history for anti-spoof (photos have zero variance)
      poseHistoryRef.current = [...poseHistoryRef.current.slice(-20), { yaw: pose.yaw, pitch: pose.pitch }];
      
      if (!capturedAnglesRef.current.center) {
        capturedAnglesRef.current.center = frameBase64;
      }

      // Check current instruction using LIVE calibration
      const calib = calibrationRef.current;
      const instrIdx = currentInstructionRef.current;
      const instruction = faceInstructions[instrIdx];
      
      if (instruction && !instructionsCompletedRef.current[instrIdx]) {
        const passed = evaluateAdaptivePose(instruction.id, pose, calib) && result.eyesOpen;
        const diag = computeStepDiag(instruction.id, pose, true, result.eyesOpen, calib);
        setLiveDiag({
          faceDetected: true, eyesOpen: result.eyesOpen,
          yaw: pose.yaw, pitch: pose.pitch,
          progress: passed ? 1 : diag.progress,
          hint: passed ? 'Perfect — locking in…' : diag.hint,
          severity: passed ? 'ok' : diag.severity,
        });
        pushDebug({
          kind: 'tick',
          step: instrIdx,
          instruction: instruction.id,
          yaw: +pose.yaw.toFixed(2),
          pitch: +pose.pitch.toFixed(2),
          eyesOpen: result.eyesOpen,
          passed,
          progress: +(passed ? 1 : diag.progress).toFixed(2),
          hint: diag.hint,
          baselineYaw: +calib.baselineYaw.toFixed(2),
          baselinePitch: +calib.baselinePitch.toFixed(2),
        });
        
        if (passed) {
          setScanningStatus('pass');
          if (instruction.id === 'live' && !capturedAnglesRef.current.center) {
              const stillFrame = await captureFaceFrameBase64(720);
              if (stillFrame) capturedAnglesRef.current.center = stillFrame;
          }
          const newCompleted = [...instructionsCompletedRef.current];
          newCompleted[instrIdx] = true;
          instructionsCompletedRef.current = newCompleted;
          setInstructionsCompleted([...newCompleted]);
          pushDebug({ kind: 'step_pass', step: instrIdx, instruction: instruction.id });
          
          const nextIdx = instrIdx + 1;
          if (nextIdx < faceInstructions.length) {
            currentInstructionRef.current = nextIdx;
            setCurrentInstruction(nextIdx);
            setScanningStatus('idle');
          } else {
            setTimeout(() => finishVerification(true), 500);
          }
        } else {
          setScanningStatus('scanning');
        }
      }
      } finally {
        poseCheckInFlightRef.current = false;
      }
    }, 700); // Passive scan cadence — fast lock-on without visible pose prompts
  };

  // Finish verification
  const finishVerification = async (success: boolean, manualReviewRequired = false) => {
    let effectiveManualReviewRequired = manualReviewRequired;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (instructionTimerRef.current) {
      clearTimeout(instructionTimerRef.current);
      instructionTimerRef.current = null;
    }
    if (poseCheckIntervalRef.current) {
      clearInterval(poseCheckIntervalRef.current);
      poseCheckIntervalRef.current = null;
    }
    
    if (usingNativeFaceCameraRef.current && nativeFaceRecordingRef.current) {
      const nativeVideo = await nativeFaceCam.stopRecording();
      nativeFaceRecordingRef.current = false;
      if (nativeVideo?.blob?.size) {
        setFaceVerificationVideo(nativeVideo.blob);
      } else if (success) {
        const proof = JSON.stringify({ type: 'face-verification-proof', at: Date.now(), angles: Object.keys(capturedAnglesRef.current) });
        setFaceVerificationVideo(new Blob([proof], { type: 'application/json' }));
        effectiveManualReviewRequired = true;
        pushDebug({ kind: 'recorder_skip', message: 'native_recording_empty_or_missing' });
      }
    } else if (faceRecorderRef.current && faceRecorderRef.current.state === 'recording') {
      faceRecorderRef.current.stop();
    } else if (success) {
      // If MediaRecorder is unavailable on the device/browser, still let a real
      // liveness pass be submitted with the captured angle stills for admin/AI review.
      const proof = JSON.stringify({ type: 'face-verification-proof', at: Date.now(), angles: Object.keys(capturedAnglesRef.current) });
      setFaceVerificationVideo(new Blob([proof], { type: 'application/json' }));
      effectiveManualReviewRequired = true;
      pushDebug({ kind: 'recorder_fallback_proof_blob', angles: Object.keys(capturedAnglesRef.current) });
    }
    
    setVerificationRecording(false);
    setScanningStatus('idle');
    
    if (success) {
      // Passive professional flow intentionally asks the user to hold still.
      // Replay/static-photo decisions are made server-side using provider
      // liveness + photo/video/live face comparison, not client pose variance.
      
      pushDebug({ kind: 'finish', success: true });
      setFaceVerified(true);
      setFaceManualReviewRequired(effectiveManualReviewRequired);
      toast({
        title: effectiveManualReviewRequired ? "Manual Review Ready" : localizedMsg.success,
        description: effectiveManualReviewRequired ? "Enough liveness data was captured. Submit it for admin review." : localizedMsg.successDesc,
      });
    } else {
      pushDebug({
        kind: 'finish',
        success: false,
        stepsCompleted: [...instructionsCompletedRef.current],
        stuckOnStep: currentInstructionRef.current,
        stuckOnInstruction: faceInstructions[currentInstructionRef.current]?.id,
      });
      setVerificationFailed(true);
      setFailedAttempts(prev => prev + 1);
      buildAndStoreDebugReport('failed');
      toast({
        title: "❌ " + localizedMsg.failed,
        description: localizedMsg.failedDesc,
        variant: "destructive",
      });
    }
  };

  // Reset verification
  const resetVerification = () => {
    verifyInProgressRef.current = false; // BUG-06: release lock on reset
    autoFaceStartRef.current = false;
    if (usingNativeFaceCameraRef.current && nativeFaceRecordingRef.current) {
      nativeFaceCam.stopRecording().catch(() => null);
      nativeFaceRecordingRef.current = false;
    }
    if (faceRecorderRef.current && faceRecorderRef.current.state === 'recording') {
      faceRecorderRef.current.stop();
    }
    setVerificationStarted(false);
    setVerificationRecording(false);
    setCurrentInstruction(0);
    currentInstructionRef.current = 0;
    const freshCompleted = faceInstructions.map(() => false);
    setInstructionsCompleted(freshCompleted);
    instructionsCompletedRef.current = freshCompleted;
    setVerificationFailed(false);
    setVerificationTime(0);
    setFaceVerificationVideo(null);
    setFaceVerified(false);
    setFaceManualReviewRequired(false);
    setScanningStatus('idle');
    poseHistoryRef.current = [];
    setLiveDiag(null); setCalibrating(false);
    if (poseCheckIntervalRef.current) {
      clearInterval(poseCheckIntervalRef.current);
      poseCheckIntervalRef.current = null;
    }
  };

  // Stop camera
  const stopFaceCamera = () => {
    void teardownFaceCameraPreview();
    resetVerification();
  };

  useEffect(() => {
    if (verificationStatus === 'submitted' || verificationStatus === 'verified' || verificationStatus === 'rejected') {
      void teardownFaceCameraPreview();
    }
  }, [verificationStatus, teardownFaceCameraPreview]);

  // Upload file to storage
  const storageExtensionFor = (file: File | Blob) => {
    const type = (file.type || '').split(';')[0].toLowerCase();
    if (type === 'image/jpeg') return 'jpg';
    if (type === 'image/png') return 'png';
    if (type === 'image/webp') return 'webp';
    if (type === 'video/mp4') return 'mp4';
    if (type === 'video/webm') return 'webm';
    if (file instanceof File) return file.name.split('.').pop() || 'bin';
    return 'bin';
  };

  const uploadFile = async (file: File | Blob, folder: string): Promise<string | null> => {
    if (!userId) return null;
    if (!file.size) throw new Error(`Upload blocked: ${folder} file is empty.`);
    
    const fileExt = storageExtensionFor(file);
    const fileName = `${userId}/${folder}/${Date.now()}.${fileExt}`;
    const contentType = file.type || (fileExt === 'jpg' ? 'image/jpeg' : 'application/octet-stream');
    
    const { data, error } = await supabase.storage
      .from('face-verification')
      .upload(fileName, file, { upsert: true, contentType });
    
    if (error) {
      console.error('Upload error:', error);
      recordClientError({ label: "FaceVerification.fileName", message: error instanceof Error ? error.message : String(error) });
      return null;
    }
    
    // ★ Bucket is PRIVATE (workspace policy blocks public face-verification).
    //   getPublicUrl() would produce a 400/broken-icon URL the user, admin and
    //   downstream viewers cannot open. Return a long-lived signed URL so the
    //   uploaded photo/video renders everywhere (user's own face screen,
    //   admin review panel, host application card). 10-year expiry — same
    //   lifetime as the verification record itself.
    const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 365 * 10; // 10 years
    const { data: signed, error: signErr } = await supabase.storage
      .from('face-verification')
      .createSignedUrl(fileName, SIGNED_URL_TTL_SECONDS);
    if (signErr || !signed?.signedUrl) {
      console.error('createSignedUrl error', signErr);
      recordClientError({ label: 'FaceVerification.signedUrl', message: signErr?.message || 'no signed url' });
      // Fallback so the upload itself is not considered failed; admin panel
      // resolves the path via useAdminSignedUrl regardless of stored URL.
      return `face-verification/${fileName}`;
    }
    return signed.signedUrl;
  };

  const lockUnderReviewAndReturn = (description: string) => {
    postSubmitLockedRef.current = true;
    try {
      sessionStorage.setItem('meri_face_verification_recent_submission', JSON.stringify({
        userId,
        status: 'under_review',
        timestamp: Date.now(),
      }));
    } catch {}
    setVerificationStatus('submitted');
    setRejectionReason(null);
    setLoading(false);
    setSubmitInProgress(false);
    toast({
      title: '✅ Under Review',
      description,
    });
    scheduleProfileRedirect();
  };

  const recoverPendingSubmissionAfterError = async () => {
    if (!userId) return false;
    try {
      const { data } = await supabase
        .from('face_verification_submissions')
        .select('id, status')
        .eq('user_id', userId)
        .in('status', ['pending', 'submitted', 'under_review'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!data) return false;
      lockUnderReviewAndReturn('Your verification was received and is now under review. Returning to profile…');
      return true;
    } catch {
      return false;
    }
  };

  // Convert dataURL → Blob for storage upload
  const dataUrlToBlob = (dataUrl: string): Blob | null => {
    try {
      const isDataUrl = dataUrl.startsWith('data:');
      const [meta, b64Raw] = isDataUrl ? dataUrl.split(',') : ['data:image/jpeg;base64', dataUrl];
      const b64 = (b64Raw || '').trim();
      if (!b64) return null;
      const mime = /data:(.*?);base64/.exec(meta || '')?.[1] || 'image/jpeg';
      const bin = atob(b64 || '');
      const len = bin.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
      return new Blob([bytes], { type: mime });
    } catch { return null; }
  };

  // Upload passive live-scan stills. Legacy admin/AI columns still expect
  // front/left/right URLs, so side slots fall back to the same live frame.
  const uploadCapturedAngles = async (): Promise<{ front_url?: string; left_url?: string; right_url?: string }> => {
    const out: { front_url?: string; left_url?: string; right_url?: string } = {};
    const fallbackCenter = capturedAnglesRef.current.center || await captureFaceFrameBase64(720);
    if (fallbackCenter && !capturedAnglesRef.current.center) capturedAnglesRef.current.center = fallbackCenter;
    if (fallbackCenter && !capturedAnglesRef.current.left) capturedAnglesRef.current.left = fallbackCenter;
    if (fallbackCenter && !capturedAnglesRef.current.right) capturedAnglesRef.current.right = fallbackCenter;
    const map: Array<['center' | 'left' | 'right', 'front_url' | 'left_url' | 'right_url', string]> = [
      ['center', 'front_url', 'face-angles/front'],
      ['left', 'left_url', 'face-angles/left'],
      ['right', 'right_url', 'face-angles/right'],
    ];
    for (const [angle, field, folder] of map) {
      const dataUrl = capturedAnglesRef.current[angle];
      if (!dataUrl) continue;
      const rawBlob = dataUrlToBlob(dataUrl);
      if (!rawBlob) continue;
      // ★ Force JPEG identity — captureFrameFromLiveVideo() always emits JPEG bytes,
      //   so wrap as a real File with .jpg name + image/jpeg type. This prevents the
      //   historical .webm extension drift in face_verification_submissions.front/left/right_url.
      const jpegFile = new File([rawBlob], `${angle}.jpg`, { type: 'image/jpeg' });
      const url = await uploadFile(jpegFile, folder);
      if (url) out[field] = url;
    }
    return out;
  };

  const getMissingHostRequirements = () => {
    const missing: string[] = [];

    if (!fullName.trim()) missing.push("full_name");
    if (!age || Number.isNaN(parseInt(age, 10)) || parseInt(age, 10) < 18) missing.push("age");
    if (!language) missing.push("language");
    if (!photoFile) missing.push("profile_photo");
    if (!videoFile) missing.push("intro_video");
    if (hostPhotos.length !== 3) missing.push("host_photos");
    if (!faceVerificationVideo) missing.push("face_video");
    if (!faceVerified) missing.push("face_verification");

    return missing;
  };

  // Complete user verification - ALL fields mandatory
  const completeUserVerification = async () => {
    if (postSubmitLockedRef.current) return;
    if (!faceVerified || !faceVerificationVideo) {
      toast({ title: "Error", description: "Please complete face verification first", variant: "destructive" });
      return;
    }

    // ★ STRICT: Validate video blob has actual content (prevents empty uploads)
    if (!faceManualReviewRequired && faceVerificationVideo.size < 10000) {
      toast({ title: "❌ Invalid Video", description: "Face verification video is too small or empty. Please record again.", variant: "destructive" });
      resetVerification();
      return;
    }

    if (!fullName.trim()) {
      toast({ title: "❌ Name Required", description: "Please go back and enter your name", variant: "destructive" });
      return;
    }
    if (!age || parseInt(age) < 18) {
      toast({ title: "❌ Age Required", description: "Please go back and enter valid age (18+)", variant: "destructive" });
      return;
    }
    if (!language) {
      toast({ title: "❌ Language Required", description: "Please go back and select your language", variant: "destructive" });
      return;
    }
    if (!userPhotoFile) {
      toast({ title: "❌ Photo Required", description: "Please go back and upload a profile photo", variant: "destructive" });
      return;
    }
    
    postSubmitLockedRef.current = true;
    setSubmitInProgress(true);
    setVerificationStatus('submitted'); // ★ instant lock so the Under Review screen takes over this very render
    setLoading(true);
    if (typeof document !== 'undefined') {
      document.documentElement.classList.remove('native-face-camera-active');
      document.body.classList.remove('native-face-camera-active');
    }
    await teardownFaceCameraPreview();
    
    try {
      // Upload profile photo to PUBLIC avatars bucket so every viewer can render it.
      // (Historically this went to private face-verification bucket → invisible to viewers.)
      let profilePhotoUrl: string | null = null;
      try {
        const ext = (userPhotoFile.type || '').includes('png') ? 'png'
          : (userPhotoFile.type || '').includes('webp') ? 'webp' : 'jpg';
        const avatarKey = `${userId}/${Date.now()}.${ext}`;
        const up = await supabase.storage.from('avatars').upload(avatarKey, userPhotoFile, {
          upsert: true,
          contentType: userPhotoFile.type || 'image/jpeg',
        });
        if (!up.error) {
          profilePhotoUrl = supabase.storage.from('avatars').getPublicUrl(avatarKey).data.publicUrl;
        }
      } catch (e) {
        console.warn('[FaceVerification] public avatar upload failed, falling back', e);
      }
      // Fallback only if public upload failed (keeps existing flow alive)
      if (!profilePhotoUrl) profilePhotoUrl = await uploadFile(userPhotoFile, 'profile-photos');
      // Basic Information (name/age/language) saved on profile immediately;
      // profile photo (avatar) is intentionally NOT written here — it only
      // appears on the user's profile after face verification is approved
      // (handled server-side by sync_profile_on_face_verification trigger).
      {
        const profilePatch: Record<string, unknown> = {
          display_name: fullName.trim(),
          age: parseInt(age, 10),
          language: language,
        };
        const { error: profUpdErr } = await supabase.from('profiles').update(profilePatch).eq('id', userId);
        if (profUpdErr) console.warn('[FaceVerification] profile basic-info update failed', profUpdErr);
      }

      // CRITICAL: Check for existing pending/approved submission before inserting
      const { data: existingSubmission } = await supabase
        .from('face_verification_submissions')
        .select('id, status')
        .eq('user_id', userId)
        .in('status', ['pending','submitted','under_review'])
        .maybeSingle();

      if (existingSubmission) {
        lockUnderReviewAndReturn('Your verification is already under review. Returning to profile…');
        return;
      }

      // CRITICAL: Generate face hash and check for duplicate face BEFORE submission
      const faceHash = faceManualReviewRequired && capturedAnglesRef.current.center
        ? await sha256String(capturedAnglesRef.current.center)
        : await generateFaceHash(faceVerificationVideo);
      
      try {
        const { data: faceData } = await supabase.rpc('find_account_by_face', {
          face_hash_param: faceHash
        });
        
        if (faceData && faceData.length > 0 && faceData[0].user_id !== userId) {
          const existingName = faceData[0].display_name || 'Unknown';
          console.log('[FaceVerification] Duplicate-face advisory for USER; continuing submission for server review. Existing:', faceData[0].user_id);
          toast({
            title: "Additional Review Needed",
            description: `This face may match another account (${existingName}). Your verification will be reviewed securely.`,
            variant: "destructive",
          });
          await enforceDuplicateFaceBan(faceData[0]);
        }
      } catch (err) {
        console.error('Face duplicate check error:', err);
        recordClientError({ label: "FaceVerification.existingName", message: err instanceof Error ? err.message : String(err) });
      }

      // Save face hash to profile
      await supabase
        .from('profiles')
        .update({ face_hash: faceHash })
        .eq('id', userId);

      const videoUrl = await uploadFile(faceVerificationVideo, 'face-videos');

      // Upload passive live scan stills for photo/video/live face comparison
      const angleUrls = await uploadCapturedAngles();

      // Insert submission with ALL user info (name, age, language, photo) + 3 angles
      const { data: submissionData, error: submissionError } = await supabase
        .from('face_verification_submissions')
        .insert({
          user_id: userId,
          verification_type: 'face',
          status: 'under_review', // ★ instant under_review (no submitted→review delay)
          // ★ DO NOT pre-flag manual_review_required — let face-verification-analyze
          //   run the full 3-API pipeline (AWS Rekognition + liveness + duplicate) and
          //   let service_auto_finalize_face_verification decide. Pre-flagging caused
          //   100% of submissions to bypass auto-approve (Pkg358).
          admin_notes: faceManualReviewRequired ? 'Client antispoof/pose hinted uncertain — AI pipeline will still attempt auto-approve.' : null,
          ai_analysis: {
            ...(faceManualReviewRequired ? { client_antispoof_hint: 'pose_partial_or_static' } : {}),
            scan_mode: 'passive_photo_video_live',
            evidence_required: ['profile_photo', 'face_video', 'live_face_scan'],
            visible_pose_prompts: false,
            challenge_sequence: faceInstructions.map(i => i.id),
            challenge_randomized: false,
          },
          face_image_url: videoUrl,
          // BUG-14 fix: never store the `pending://no-image` literal — it crashes
          // admin-rerun (`fetch('pending://no-image')` throws TypeError). If both
          // angle upload AND video upload returned null, abort the submission so
          // the user can retry on a working network instead of polluting the DB.
          selfie_url: (() => {
            const url = angleUrls.front_url || videoUrl;
            if (!url) throw new Error('Upload failed: no face image could be saved. Please check your connection and try again.');
            return url;
          })(),
          front_url: angleUrls.front_url ?? null,
          left_url: angleUrls.left_url ?? null,
          right_url: angleUrls.right_url ?? null,
          full_name: fullName.trim(),
          age: parseInt(age),
          language: language,
          profile_photo_url: profilePhotoUrl,
        })
        .select('id')
        .single();

      if (submissionError) throw submissionError;

      setVerificationStatus('submitted');
      setRejectionReason(null);
      if (submissionData?.id) {
        void supabase.functions.invoke('face-verification-analyze', {
          body: { submissionId: submissionData.id },
        }).catch((err) => {
          console.warn('[FaceVerification] immediate analyze fallback failed; DB trigger/sweeper will retry', err);
        });
      }

      lockUnderReviewAndReturn("Your verification is now under admin review. Returning to profile…");
      return;
      
    } catch (error: any) {
      const recovered = await recoverPendingSubmissionAfterError();
      if (recovered) return;
      postSubmitLockedRef.current = false;
      setVerificationStatus('unverified');
      setSubmitInProgress(false);
      toast({
        title: "Error",
        description: error.message || "Failed to complete verification",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Host Step 1: Save basic info - ALL fields mandatory
  const saveHostStep1 = async () => {
    if (!fullName.trim()) {
      toast({
        title: "❌ Name Required",
        description: "Please enter your full name",
        variant: "destructive",
      });
      return;
    }
    
    if (!age || parseInt(age) < 18) {
      toast({
        title: "❌ Valid Age Required",
        description: age ? "Age must be at least 18 years" : "Please enter your age",
        variant: "destructive",
      });
      return;
    }
    
    if (!language) {
      toast({
        title: "❌ Language Required",
        description: "Please select your preferred language",
        variant: "destructive",
      });
      return;
    }
    
    if (!photoFile) {
      toast({
        title: "❌ Profile Photo Required",
        description: "Please upload a profile photo to continue",
        variant: "destructive",
      });
      return;
    }
    
    setCurrentStep(2);
    toast({ title: "✅ Step 1 Complete!" });
  };

  // Host Step 2: Save video and photos - STRICT: requires 10s video + exactly 3 photos
  const saveHostStep2 = async () => {
    if (!videoFile) {
      toast({
        title: "❌ Video Required",
        description: "Please record or upload a 10-second introduction video",
        variant: "destructive",
      });
      return;
    }
    
    if (hostPhotos.length !== 3) {
      toast({
        title: "❌ 3 Photos Required",
        description: `You've uploaded ${hostPhotos.length}/3 photos. Please upload exactly 3 photos to continue.`,
        variant: "destructive",
      });
      return;
    }
    
    setCurrentStep(3);
    toast({ title: "✅ Step 2 Complete!" });
  };

  // Host Step 3: Complete verification
  const completeHostVerification = async () => {
    if (postSubmitLockedRef.current) return;
    const missingRequirements = getMissingHostRequirements();
    if (missingRequirements.length > 0) {
      toast({
        title: "❌ Requirements Incomplete",
        description: "Please complete all required host fields (profile, age, language, intro video, 3 photos, and face verification) before submitting.",
        variant: "destructive",
      });
      return;
    }

    // ★ STRICT: Validate all media files have actual content
    if (!faceManualReviewRequired && faceVerificationVideo && faceVerificationVideo.size < 10000) {
      toast({ title: "❌ Invalid Face Video", description: "Face verification video is too small or empty. Please record again.", variant: "destructive" });
      resetVerification();
      return;
    }
    if (videoFile && videoFile.size < 10000) {
      toast({ title: "❌ Invalid Intro Video", description: "Introduction video is too small or empty. Please record again.", variant: "destructive" });
      return;
    }
    if (photoFile && photoFile.size < 5000) {
      toast({ title: "❌ Invalid Photo", description: "Profile photo is too small or corrupted. Please upload again.", variant: "destructive" });
      return;
    }
    for (let i = 0; i < hostPhotos.length; i++) {
      if (hostPhotos[i].size < 5000) {
        toast({ title: "❌ Invalid Photo", description: `Host photo ${i + 1} is too small or corrupted. Please upload again.`, variant: "destructive" });
        return;
      }
    }
    
    postSubmitLockedRef.current = true;
    setSubmitInProgress(true);
    setVerificationStatus('submitted'); // ★ instant lock so the Under Review screen takes over this very render
    setLoading(true);
    // Synchronously strip the native-camera body class so the underlying
    // CameraX surface is hidden in the same paint frame as the lock flip.
    if (typeof document !== 'undefined') {
      document.documentElement.classList.remove('native-face-camera-active');
      document.body.classList.remove('native-face-camera-active');
    }
    await teardownFaceCameraPreview();
    
    try {
      // Generate face hash and check for existing account
      const faceHash = faceManualReviewRequired && capturedAnglesRef.current.center
        ? await sha256String(capturedAnglesRef.current.center)
        : await generateFaceHash(faceVerificationVideo);
      
      // CRITICAL: Check for duplicate face - BLOCK if found
      let duplicateFaceUserId: string | null = null;
      let duplicateFaceName: string | null = null;
      let duplicateFaceUid: string | null = null;
      let duplicateFaceAvatar: string | null = null;
      let isDuplicateFace = false;
      
      try {
        const { data: faceData } = await supabase.rpc('find_account_by_face', {
          face_hash_param: faceHash
        });
        
        if (faceData && faceData.length > 0 && faceData[0].user_id !== userId) {
          isDuplicateFace = true;
          duplicateFaceUserId = faceData[0].user_id;
          duplicateFaceName = faceData[0].display_name || 'Unknown';
          duplicateFaceUid = (faceData[0] as any).app_uid || null;
          duplicateFaceAvatar = faceData[0].avatar_url || null;
          console.log('[FaceVerification] Duplicate-face advisory for HOST; continuing submission for server review. Existing account:', duplicateFaceUserId);
          
          toast({
            title: "Additional Review Needed",
            description: `This face may match another account (${duplicateFaceName}). Your application will be reviewed securely.`,
            variant: "destructive",
          });
          await enforceDuplicateFaceBan(faceData[0]);
        }
      } catch (err) {
        console.error('Face duplicate check error:', err);
        recordClientError({ label: "FaceVerification.faceHash", message: err instanceof Error ? err.message : String(err) });
      }
      
      const profilePhotoUrl = photoFile ? await uploadFile(photoFile, 'photos') : null;
      const introVideoUrl = videoFile ? await uploadFile(videoFile, 'videos') : null;
      const faceVideoUrl = await uploadFile(faceVerificationVideo, 'face-videos');
      
      const photoUrls: string[] = [];
      for (const photo of hostPhotos) {
        const url = await uploadFile(photo, 'host-photos');
        if (url) photoUrls.push(url);
      }

      if (!profilePhotoUrl || !introVideoUrl || !faceVideoUrl || photoUrls.length !== 3) {
        throw new Error('Submission blocked: all host media requirements must be uploaded successfully.');
      }
      
      // Save face hash + Basic Information (name/age/language) on profile immediately.
      // Profile photo, 3 host gallery photos, and intro video are intentionally NOT
      // written here — they only appear on the host's profile after approval,
      // gated server-side by sync_profile_on_face_verification trigger.
      {
        const hostProfilePatch: Record<string, unknown> = {
          face_hash: faceHash,
          display_name: fullName.trim(),
          age: parseInt(age, 10),
          language: language,
        };
        const { error: hostProfUpdErr } = await supabase
          .from('profiles')
          .update(hostProfilePatch)
          .eq('id', userId);
        if (hostProfUpdErr) console.warn('[FaceVerification] host profile basic-info update failed', hostProfUpdErr);
      }
      
      // CRITICAL: Check for existing pending submission before inserting
      const { data: existingSubmission } = await supabase
        .from('face_verification_submissions')
        .select('id, status')
        .eq('user_id', userId)
        .in('status', ['pending','submitted','under_review'])
        .maybeSingle();

      if (existingSubmission) {
        lockUnderReviewAndReturn('Your host application is already under review. Returning to profile…');
        return;
      }
      
      // Upload passive live scan stills for photo/video/live face comparison
      const angleUrls = await uploadCapturedAngles();

      // Insert submission with submitted status (auto-approve pipeline)
      const { data: submissionData, error: submissionError } = await supabase
        .from('face_verification_submissions')
        .insert({
          user_id: userId,
          verification_type: 'host',
          status: 'under_review', // ★ instant under_review
          // ★ Pkg358: do NOT pre-flag manual_review_required — let analyze pipeline decide.
          admin_notes: faceManualReviewRequired ? 'Client antispoof/pose hinted uncertain — AI pipeline will still attempt auto-approve.' : null,
          ai_analysis: {
            ...(faceManualReviewRequired ? { client_antispoof_hint: 'pose_partial_or_static' } : {}),
            scan_mode: 'passive_photo_video_live',
            evidence_required: ['profile_photo', 'intro_video', 'host_gallery_photos', 'live_face_scan'],
            visible_pose_prompts: false,
            challenge_sequence: faceInstructions.map(i => i.id),
            challenge_randomized: false,
          },
          full_name: fullName,
          age: parseInt(age),
          language: language,
          profile_photo_url: profilePhotoUrl,
          video_url: introVideoUrl,
          host_photos: photoUrls,
          face_image_url: faceVideoUrl,
          // BUG-14 fix: see same fix in user-path insert above.
          selfie_url: (() => {
            const url = angleUrls.front_url || faceVideoUrl;
            if (!url) throw new Error('Upload failed: no face image could be saved. Please check your connection and try again.');
            return url;
          })(),
          front_url: angleUrls.front_url ?? null,
          left_url: angleUrls.left_url ?? null,
          right_url: angleUrls.right_url ?? null,
          is_duplicate_face: isDuplicateFace,
          duplicate_face_user_id: duplicateFaceUserId,
          duplicate_face_name: duplicateFaceName,
          duplicate_face_uid: duplicateFaceUid,
          duplicate_face_avatar: duplicateFaceAvatar,
        })
        .select('id')
        .single();

      if (submissionError) throw submissionError;

      setVerificationStatus('submitted');
      setRejectionReason(null);
      if (submissionData?.id) {
        void supabase.functions.invoke('face-verification-analyze', {
          body: { submissionId: submissionData.id },
        }).catch((err) => {
          console.warn('[FaceVerification] immediate analyze fallback failed; DB trigger/sweeper will retry', err);
        });
      }

      lockUnderReviewAndReturn('Your host application is now under admin review. Returning to profile…');
      return;

    } catch (error: any) {
      const recovered = await recoverPendingSubmissionAfterError();
      if (recovered) return;
      postSubmitLockedRef.current = false;
      setVerificationStatus('unverified');
      setSubmitInProgress(false);
      toast({
        title: "Error",
        description: error.message || "Failed to complete verification",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Face Verification Section JSX — Professional Scanning UI
  const renderFaceVerificationSection = () => {
    const faceCameraActive = faceCameraStarting || !!faceStream || usingNativeFaceCamera;
    const completedCount = instructionsCompleted.filter(Boolean).length;
    const progressPercent = (completedCount / faceInstructions.length) * 100;
    const borderColor = scanningStatus === 'pass' ? '#22c55e' : scanningStatus === 'fail' ? '#ef4444' : '#d4af37';
    const nativeApertureStyle: React.CSSProperties | undefined = usingNativeFaceCamera
      ? {
          WebkitMaskImage: 'radial-gradient(ellipse 34% 42% at 50% 45%, transparent 0 98%, #000 100%)',
          maskImage: 'radial-gradient(ellipse 34% 42% at 50% 45%, transparent 0 98%, #000 100%)',
          background: 'rgba(7, 10, 18, 0.84)',
        }
      : undefined;
    const completeFromPartialScan = () => {
      const completed = instructionsCompletedRef.current.filter(Boolean).length;
      if (completed < 2 || (!usingNativeFaceCameraRef.current && !faceChunksRef.current.length)) {
        toast({ title: 'Keep scanning', description: 'Complete at least forward + one side angle before manual review.', variant: 'destructive' });
        return;
      }
      finishVerification(true, true);
    };

    return (
    <div data-face-verification-scan className={`${usingNativeFaceCamera ? 'relative z-10 bg-transparent border-0 shadow-none rounded-none p-0' : 'bg-white border-slate-200 shadow-[0_8px_30px_-12px_rgba(15,23,42,0.18)] rounded-3xl p-5 border'}`}>
      {/* Header */}
      <div className={`${usingNativeFaceCamera ? 'rounded-2xl border border-slate-200 bg-white/95 px-3 py-3 shadow-sm' : ''} flex items-center gap-3 mb-5`}>
        <div className="relative">
          <div className="w-11 h-11 rounded-2xl bg-slate-900 flex items-center justify-center shadow-lg shadow-slate-900/20 ring-1 ring-slate-200">
            <ScanFace className="w-5 h-5 text-white" />
          </div>
          {verificationRecording && (
            <motion.div
              className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-red-500 ring-2 ring-white"
              animate={{ scale: [1, 1.25, 1], opacity: [1, 0.7, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
            />
          )}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-slate-900 text-lg tracking-tight">Live Face Scan</h2>
            <span className="px-1.5 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-semibold uppercase tracking-wide">Secure</span>
          </div>
          <p className="text-slate-500 text-xs">
            {verificationRecording ? 'Passive live scan in progress' : 'AI-powered identity verification'}
          </p>
        </div>
      </div>

      {/* Progress Bar */}
      {verificationRecording && (
        <div className={`${usingNativeFaceCamera ? 'rounded-2xl border border-slate-200 bg-white/95 px-3 py-3 shadow-sm' : ''} mb-4`}>
          <div className="flex justify-between text-xs text-slate-500 mb-1.5">
            <span className="font-medium">Identity Scan</span>
            <span className="font-mono">{completedCount}/{faceInstructions.length}</span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-full"
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: 0.4 }}
            />
          </div>
        </div>
      )}

      
      {/* Video Container with Face Oval */}
      <div ref={faceCameraFrameRef} data-face-verification-camera className={usingNativeFaceCamera
        ? 'relative aspect-[3/4] w-full max-w-sm mx-auto rounded-[28px] overflow-hidden mb-5 bg-slate-950 shadow-2xl shadow-slate-950/25 ring-1 ring-slate-900/10'
        : `relative aspect-[3/4] w-full max-w-sm mx-auto rounded-3xl overflow-hidden mb-5 ${faceCameraActive ? 'bg-black shadow-2xl' : 'bg-white/80 shadow-2xl'}`
      }>
        {usingNativeFaceCamera && faceCameraActive && !faceVerified && (
          <div className="absolute inset-0 z-[1] pointer-events-none" style={nativeApertureStyle} />
        )}
        {!faceCameraActive && !faceVerified ? (
          <div className="w-full h-full flex flex-col items-center justify-center p-6 bg-gradient-to-br from-[#0c0818] via-[#050208] to-black">
            {/* Pkg381: No large "Ready to Scan" icon — use a more professional subtle pulse to indicate camera is standby */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="relative w-full h-full flex flex-col items-center justify-center"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-white/20 animate-pulse mb-3" />
              <p className="text-white/40 text-xs font-medium tracking-wide">CAMERA STANDBY</p>
            </motion.div>
          </div>

        ) : faceVerified ? (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-emerald-900/60 to-green-900/40">
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", duration: 0.8 }}
            >
              <div className="relative">
                <motion.div
                  className="absolute -inset-6 rounded-full border-2 border-green-400/30"
                  animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
                <div className="w-28 h-28 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center shadow-lg shadow-green-500/30">
                  <CheckCircle2 className="w-14 h-14 text-slate-800" />
                </div>
              </div>
            </motion.div>
            <h3 className="text-xl font-bold text-slate-800 mt-6 mb-2">
              {faceManualReviewRequired ? 'Ready for Admin Review' : 'Scan Complete!'}
            </h3>
            <p className="text-green-300 text-sm text-center px-4">
              {faceManualReviewRequired ? 'AI could not safely auto-approve, but your scan can be submitted for manual review' : `All ${faceInstructions.length} liveness checks passed`}
            </p>
            <div className="flex gap-1 mt-3">
              {instructionsCompleted.map((_, idx) => (
                <div key={idx} className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4 text-slate-800" />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            {!usingNativeFaceCamera && (
              <video
                ref={faceVideoRef}
                autoPlay
                playsInline
                muted
                controls={false}
                poster=""
                disablePictureInPicture
                disableRemotePlayback
                controlsList="nodownload nofullscreen noremoteplayback noplaybackrate"
                {...({ 'x5-video-player-type': 'h5', 'x5-video-player-fullscreen': 'false', 'x5-playsinline': 'true', 'webkit-playsinline': 'true' } as Record<string, string>)}
                className="w-full h-full object-cover scale-x-[-1]"
                onLoadedMetadata={() => setCameraReady(true)}
                onCanPlay={() => setCameraReady(true)}
                onPlaying={() => setCameraReady(true)}
                style={{ backgroundColor: '#000', pointerEvents: 'none', WebkitAppearance: 'none' as React.CSSProperties['WebkitAppearance'], minHeight: '100%', transform: 'scaleX(-1) translateZ(0)', backfaceVisibility: 'hidden' }}
              />
            )}
            
            {/* Loading overlay */}
            {(faceCameraStarting || (faceCameraActive && !cameraReady)) && !usingNativeFaceCamera && (
              <div className={`${usingNativeFaceCamera ? 'fixed inset-0 z-[2147483647] bg-black/45' : 'absolute inset-0 bg-slate-900/90'} flex flex-col items-center justify-center pointer-events-none p-6`}>
                <div className="w-16 h-16 rounded-full border-4 border-white/20 border-t-purple-400 animate-spin mb-4" />
                <p className="text-white text-sm font-bold animate-pulse">Initializing Direct Camera...</p>
              </div>
            )}
            
            {/* Face oval guide with dynamic border color */}
            <div className="absolute inset-0 z-[2] flex items-center justify-center pointer-events-none">
              {/* Dark overlay outside oval */}
              {!usingNativeFaceCamera && (
                <div className="absolute inset-0" style={{
                  background: 'radial-gradient(ellipse 55% 45% at 50% 45%, transparent 100%, rgba(0,0,0,0.7) 100%)',
                }} />
              )}
              
              {/* Animated hex face frame */}
              <motion.div 
                className="relative"
                style={{ width: '74%', height: '62%' }}
              >
                <svg viewBox="0 0 200 260" className="w-full h-full" style={{ filter: `drop-shadow(0 0 10px ${borderColor}40)` }}>
                  <polygon points="100,12 178,56 178,204 100,248 22,204 22,56" fill="none" 
                    stroke={borderColor} strokeWidth={usingNativeFaceCamera ? "4" : "3"} strokeDasharray={verificationRecording ? "10 5" : "none"} 
                    opacity={usingNativeFaceCamera ? "0.95" : "0.8"}
                  />
                  <line x1="100" x2="100" y1="78" y2="182" stroke="#ffffff" strokeWidth="1" opacity="0.22" />
                  <line x1="48" x2="152" y1="130" y2="130" stroke="#ffffff" strokeWidth="1" opacity="0.22" />
                  {/* Scanning line animation */}
                  {verificationRecording && scanningStatus === 'scanning' && (
                    <motion.line
                      x1="34" x2="166" stroke="#22d3ee" strokeWidth="2" opacity="0.65"
                      initial={{ y1: 48, y2: 48 }}
                      animate={{ y1: [48, 212, 48], y2: [48, 212, 48] }}
                      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                    />
                  )}
                </svg>
              </motion.div>

              {/* Corner brackets */}
              <div className="absolute top-[15%] left-[12%] w-6 h-6 border-t-2 border-l-2 rounded-tl-lg" style={{ borderColor }} />
              <div className="absolute top-[15%] right-[12%] w-6 h-6 border-t-2 border-r-2 rounded-tr-lg" style={{ borderColor }} />
              <div className="absolute bottom-[20%] left-[12%] w-6 h-6 border-b-2 border-l-2 rounded-bl-lg" style={{ borderColor }} />
              <div className="absolute bottom-[20%] right-[12%] w-6 h-6 border-b-2 border-r-2 rounded-br-lg" style={{ borderColor }} />
            </div>
            
            {/* Instruction overlay — top banner */}
            {verificationRecording && (
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentInstruction}
                  initial={{ opacity: 0, y: -20, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 20, scale: 0.9 }}
                  className="absolute top-3 left-3 right-3 z-[3]"
                >
                  <div className="bg-white/80 backdrop-blur-xl rounded-2xl px-4 py-3 border border-amber-200/60">
                    <div className="flex items-center gap-3">
                      <motion.div 
                        className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                          scanningStatus === 'pass' ? 'bg-green-500' : 
                          scanningStatus === 'fail' ? 'bg-red-500' : 
                          'bg-gradient-to-br from-cyan-500 to-purple-500'
                        }`}
                        animate={scanningStatus === 'scanning' ? { rotate: [0, 5, -5, 0] } : {}}
                        transition={{ duration: 0.5, repeat: Infinity }}
                      >
                        {scanningStatus === 'pass' ? (
                          <CheckCircle2 className="w-5 h-5 text-slate-800" />
                        ) : (() => {
                          const Icon = faceInstructions[currentInstruction]?.icon || ScanFace;
                          return <Icon className="w-5 h-5 text-slate-800" />;
                        })()}
                      </motion.div>
                      <div className="flex-1">
                        <p className="text-slate-800 font-bold">
                          {currentInstruction === 0 ? 'Hold Still for a Moment' : 'Verifying'}
                        </p>
                        <p className="text-slate-500 text-xs">
                          {faceInstructions[currentInstruction]?.description}
                        </p>
                      </div>
                      {scanningStatus === 'scanning' && (
                        <Loader2 className="w-5 h-5 text-yellow-400 animate-spin" />
                      )}
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            )}
            
            {/* Live diagnostics panel — tells the user EXACTLY why the
                current step is not passing yet (face presence, eyes, angle). */}
            {verificationRecording && liveDiag && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute left-3 right-3 bottom-24 z-[3] pointer-events-auto max-h-[22%] overflow-y-auto"
              >
                <div className={`rounded-2xl backdrop-blur-xl px-3.5 py-3 border shadow-lg ${
                  liveDiag.severity === 'ok'
                    ? 'bg-emerald-50/95 border-emerald-300'
                    : liveDiag.severity === 'error'
                      ? 'bg-rose-50/95 border-rose-300'
                      : 'bg-white/95 border-amber-200'
                }`}>
                  {/* Hint line */}
                  <div className="flex items-center gap-2">
                    {liveDiag.severity === 'ok' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : liveDiag.severity === 'error' ? (
                      <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    ) : (
                      <Loader2 className="w-4 h-4 text-amber-600 animate-spin shrink-0" />
                    )}
                    <p className={`text-[13px] font-semibold leading-snug ${
                      liveDiag.severity === 'ok' ? 'text-emerald-800'
                      : liveDiag.severity === 'error' ? 'text-rose-800'
                      : 'text-slate-800'
                    }`}>
                      {liveDiag.severity === 'ok' ? 'Verifying your face…' : liveDiag.hint}
                    </p>
                  </div>

                  {/* Alignment meter */}
                  <div className="mt-2 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                    <motion.div
                      className={`h-full rounded-full ${
                        liveDiag.severity === 'ok' ? 'bg-emerald-500'
                        : liveDiag.severity === 'error' ? 'bg-rose-500'
                        : 'bg-gradient-to-r from-amber-400 to-amber-600'
                      }`}
                      animate={{ width: `${Math.round(liveDiag.progress * 100)}%` }}
                      transition={{ duration: 0.25 }}
                    />
                  </div>

                  {/* Live signal chips */}
                  <div className="mt-2 hidden sm:flex flex-wrap gap-1.5 text-[10px] font-medium">
                    <span className={`px-2 py-0.5 rounded-full border ${
                      liveDiag.faceDetected
                        ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
                        : 'bg-rose-100 text-rose-700 border-rose-300'
                    }`}>
                      Face {liveDiag.faceDetected ? '✓' : '✗'}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full border ${
                      liveDiag.eyesOpen
                        ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
                        : 'bg-amber-100 text-amber-700 border-amber-300'
                    }`}>
                      Eyes {liveDiag.eyesOpen ? 'open' : 'closed'}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-300 font-mono">
                      Yaw {liveDiag.yaw >= 0 ? '+' : ''}{liveDiag.yaw.toFixed(0)}°
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-300 font-mono">
                      Pitch {liveDiag.pitch >= 0 ? '+' : ''}{liveDiag.pitch.toFixed(0)}°
                    </span>
                    {!calibrating && calibrationRef.current.capturedAt > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-300" title={`Baseline yaw ${calibrationRef.current.baselineYaw.toFixed(0)}° / pitch ${calibrationRef.current.baselinePitch.toFixed(0)}° · noise ${(calibrationRef.current.noiseYaw + calibrationRef.current.noisePitch).toFixed(1)}°`}>
                        Calibrated ✓
                      </span>
                    )}
                  </div>

                  {/* Toggle for detailed troubleshooting checklist */}
                  <button
                    type="button"
                    onClick={() => setTroubleshootOpen(v => !v)}
                    className="mt-1 w-full hidden sm:flex items-center justify-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900 py-1 rounded-md hover:bg-slate-100/60"
                    aria-expanded={troubleshootOpen}
                  >
                    {troubleshootOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    {troubleshootOpen ? 'Hide details' : 'Show troubleshooting'}
                  </button>

                  {/* Step-specific live troubleshooting checklist */}
                  {troubleshootOpen && (() => {
                    const stepId = (faceInstructions[currentInstruction]?.id ?? 'center') as string;
                    const hint = (liveDiag.hint || '').toLowerCase();
                    const c = calibrationRef.current;
                    const dy = liveDiag.yaw - c.baselineYaw;
                    const dp = liveDiag.pitch - c.baselinePitch;
                    const ady = Math.abs(dy);
                    const adp = Math.abs(dp);

                    const lighting: 'ok' | 'warn' | 'error' = !liveDiag.faceDetected
                      ? (consecutiveFailsRef.current >= 3 ? 'error' : 'warn')
                      : 'ok';

                    const distance: 'ok' | 'warn' | 'error' = !liveDiag.faceDetected
                      ? 'warn'
                      : (ady > 35 || adp > 35) ? 'warn' : 'ok';

                    const alignmentMatters =
                      stepId === 'center' ||
                      hint.includes('face the camera') ||
                      hint.includes('level your head');
                    const alignment: 'ok' | 'warn' | 'error' = !liveDiag.faceDetected
                      ? 'warn'
                      : alignmentMatters
                        ? (ady < c.centerYaw && adp < c.centerPitch ? 'ok' : 'warn')
                        : 'ok';

                    let headAngle: 'ok' | 'warn' | 'error' = 'ok';
                    let headTip = 'Hold the requested angle';
                    if (!liveDiag.faceDetected) {
                      headAngle = 'warn';
                      headTip = 'Cannot read head angle without face';
                    } else {
                      switch (stepId) {
                        case 'left':
                          headAngle = dy > c.turnYaw ? 'ok' : 'warn';
                          headTip = headAngle === 'ok' ? 'Left angle reached' : `Turn ~${Math.round(Math.max(c.turnYaw - dy, 0) + 4)}° more left`;
                          break;
                        case 'right':
                          headAngle = dy < -c.turnYaw ? 'ok' : 'warn';
                          headTip = headAngle === 'ok' ? 'Right angle reached' : `Turn ~${Math.round(Math.max(c.turnYaw + dy, 0) + 4)}° more right`;
                          break;
                        default:
                          headAngle = (ady < c.centerYaw && adp < c.centerPitch) ? 'ok' : 'warn';
                          headTip = headAngle === 'ok' ? 'Looking straight' : 'Face the camera straight';
                      }
                    }

                    type FixAction = { label: string; run: () => void } | null;
                    const stepIdxOf = (id: string) => faceInstructions.findIndex(i => i.id === id);
                    const lightingFix: FixAction = lighting === 'ok' ? null : {
                      label: 'How to fix',
                      run: () => toast({
                        title: 'Improve lighting',
                        description: 'Face a window or lamp. Avoid backlight (no bright light behind you). Remove shadows on one side of your face.',
                      }),
                    };
                    const distanceFix: FixAction = distance === 'ok' ? null : {
                      label: 'How to fix',
                      run: () => toast({
                        title: 'Adjust distance',
                        description: 'Hold the phone ~30–40 cm (about an arm-bend) away. Your whole face should comfortably fit inside the oval.',
                      }),
                    };
                    const alignmentFix: FixAction = alignment === 'ok' ? null : {
                      label: 'Go to Center step',
                      run: () => {
                        const idx = stepIdxOf('center');
                        if (idx >= 0) setCurrentInstruction(idx);
                        toast({ title: 'Centering', description: 'Face the camera straight and hold still.' });
                      },
                    };
                    const headFix: FixAction = headAngle === 'ok' ? null : (
                      stepId === 'center'
                        ? { label: 'Recalibrate baseline', run: () => { runNeutralCalibration(); } }
                        : { label: `Go to ${stepId} step`, run: () => {
                            const idx = stepIdxOf(stepId);
                            if (idx >= 0) setCurrentInstruction(idx);
                          } }
                    );

                    const items: Array<{ key: string; label: string; status: 'ok' | 'warn' | 'error'; tip: string; fix: FixAction }> = [
                      { key: 'lighting', label: 'Lighting', status: lighting,
                        tip: lighting === 'ok' ? 'Looks bright enough' : 'Move to brighter, even light — avoid backlight',
                        fix: lightingFix },
                      { key: 'distance', label: 'Distance', status: distance,
                        tip: distance === 'ok' ? 'Good framing' : 'Hold phone ~30–40 cm away, fit face in oval',
                        fix: distanceFix },
                      { key: 'alignment', label: 'Alignment', status: alignment,
                        tip: alignment === 'ok' ? 'Centered' : 'Center your face in the oval',
                        fix: alignmentFix },
                      { key: 'head', label: 'Head angle', status: headAngle, tip: headTip, fix: headFix },
                    ];

                    return (
                      <ul className="mt-2 space-y-1" aria-label="Troubleshooting checklist">
                        {items.map(it => {
                          const dot = it.status === 'ok' ? 'bg-emerald-500'
                                    : it.status === 'error' ? 'bg-rose-500'
                                    : 'bg-amber-500';
                          const text = it.status === 'ok' ? 'text-slate-500' : 'text-slate-800';
                          const btnTone = it.status === 'error'
                            ? 'border-rose-300 text-rose-700 hover:bg-rose-50'
                            : 'border-amber-300 text-amber-700 hover:bg-amber-50';
                          return (
                            <li key={it.key} className="flex items-start gap-2 text-[11px] leading-5">
                              <span className={`mt-1 inline-block w-2 h-2 rounded-full shrink-0 ${dot}`} aria-hidden />
                              <span className={`font-semibold ${text} w-[68px] shrink-0`}>{it.label}</span>
                              <span className={`${text} flex-1`}>{it.tip}</span>
                              {it.fix && (
                                <button
                                  type="button"
                                  onClick={it.fix.run}
                                  className={`shrink-0 px-2 py-0.5 rounded-md border text-[10px] font-semibold leading-4 bg-white/80 ${btnTone}`}
                                  aria-label={`Quick fix for ${it.label}: ${it.fix.label}`}
                                >
                                  {it.fix.label}
                                </button>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    );
                  })()}
                </div>
              </motion.div>
            )}

            {/* Bottom: Timer + Step indicators */}
            {verificationRecording && (
              <div className="absolute bottom-3 left-3 right-3 z-[3]">
                {/* Step dots — show pending/active/done with icon for active */}
                <div className="flex justify-center gap-2 mb-2">
                  {faceInstructions.map((instr, idx) => {
                    const completed = instructionsCompleted[idx];
                    const isActive = idx === currentInstruction && !completed;
                    const Icon = instr.icon;
                    return (
                      <motion.div
                        key={instr.id}
                        title={instr.direction}
                        className={`w-9 h-9 rounded-full flex items-center justify-center border-2 ${
                          completed
                            ? 'bg-green-500 border-green-400'
                            : isActive
                              ? 'border-cyan-400 bg-cyan-500/20'
                              : 'border-amber-200/80 bg-white/80'
                        }`}
                        animate={completed ? { scale: [1, 1.15, 1] } : isActive ? { borderColor: ['#22d3ee', '#a855f7', '#22d3ee'] } : {}}
                        transition={{ duration: 1.5, repeat: Infinity }}
                      >
                        {completed ? (
                          <CheckCircle2 className="w-5 h-5 text-white" />
                        ) : isActive ? (
                          <Icon className="w-4 h-4 text-cyan-700" />
                        ) : (
                          <span className="text-slate-500 text-xs font-bold">{idx + 1}</span>
                        )}
                      </motion.div>
                    );
                  })}
                </div>
                
                {/* Timer bar */}
                <div className="bg-white/80 backdrop-blur-md rounded-full px-4 py-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-slate-500 text-xs">{localizedMsg.recording}</span>
                      <span className="text-slate-700 text-xs font-semibold">· Hold Still for a Moment</span>
                  </div>
                  <span className="text-slate-800 font-mono font-bold text-sm">{Math.max(0, Math.min(75, Math.max(35, Math.round(calibrationRef.current.stepWindowSec * faceInstructions.length + 10))) - verificationTime)}s</span>
                </div>
              </div>
            )}
            
            {/* Verification failed overlay */}
            {verificationFailed && (
              <div className={`absolute inset-0 flex flex-col items-center justify-center backdrop-blur-sm ${usingNativeFaceCamera ? 'bg-black/35' : 'bg-white/80'}`}>
                <motion.div 
                  initial={{ scale: 0 }} 
                  animate={{ scale: 1 }} 
                  transition={{ type: "spring" }}
                  className="w-20 h-20 rounded-full bg-red-100 border border-red-200 flex items-center justify-center mb-4"
                >
                  <XCircle className="w-12 h-12 text-red-600" />
                </motion.div>
                <p className="text-slate-800 font-bold text-lg mb-1">{localizedMsg.failed}</p>
                <p className="text-slate-600 text-sm text-center px-6 mb-1">
                  {localizedMsg.failedDesc}
                </p>
                <p className="text-slate-500 text-xs">Attempt {failedAttempts}</p>
              </div>
            )}
          </>
        )}
        
        <canvas ref={faceCanvasRef} className="hidden" />
      </div>

      {/* Tips */}
      {!faceCameraActive && !faceVerified && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-4">
          <p className="text-slate-600 text-xs text-center leading-relaxed">
            {localizedMsg.tips}
          </p>
        </div>
      )}

      {/* Action buttons */}
      {!faceCameraActive && !faceVerified && (
        <div className="flex flex-col items-center justify-center py-6">
          <Button
            className="w-full h-14 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 rounded-2xl text-base font-bold shadow-lg shadow-purple-900/20 text-white transition-all transform active:scale-95"
            onClick={startFaceCamera}
          >
            <ScanFace className="w-6 h-6 mr-3" />
            {localizedMsg.startScan}
          </Button>
          <p className="mt-4 text-[11px] text-slate-400 text-center">
            The camera will open directly for the live identity scan.
          </p>
        </div>
      )}

      {faceCameraActive && !verificationStarted && !faceVerified && (
        <div className={`${usingNativeFaceCamera ? 'relative z-20 space-y-3' : 'space-y-3'}`}>
          <div className="w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-center shadow-sm">
            <div className="flex items-center justify-center gap-2 text-slate-900 font-semibold text-sm">
              <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
              {cameraReady ? 'Auto-scanning now…' : 'Initializing camera…'}
            </div>
            <p className="mt-1 text-[11px] text-slate-600 leading-5">
              Hold your face inside the frame. The app will scan automatically.
            </p>
          </div>
          <Button
            variant="outline"
            className="w-full h-11 rounded-xl border-slate-300 bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900 text-sm font-semibold shadow-sm"
            onClick={stopFaceCamera}
          >
            {localizedMsg.cancel}
          </Button>
        </div>
      )}
      
      {verificationFailed && (
        <div className={`${usingNativeFaceCamera ? 'relative z-20 space-y-2' : 'space-y-2'}`}>
          {instructionsCompleted.filter(Boolean).length >= 2 && (
            <Button
              className="w-full h-14 bg-gradient-to-r from-emerald-600 to-cyan-600 rounded-2xl text-lg font-bold"
              onClick={completeFromPartialScan}
            >
              <ShieldCheck className="w-6 h-6 mr-3" />
              Submit for Manual Review
            </Button>
          )}
          <Button
            className="w-full h-14 bg-gradient-to-r from-amber-600 to-orange-600 rounded-2xl text-lg font-bold"
            onClick={resetVerification}
          >
            <RotateCcw className="w-6 h-6 mr-3" />
            {localizedMsg.tryAgain}
          </Button>
          <Button
            variant="outline"
            className="w-full h-11 rounded-xl border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium"
            onClick={downloadDebugReport}
          >
            <Download className="w-4 h-4 mr-2" />
            Download debug log (.json)
          </Button>
          <p className="text-[11px] text-slate-500 text-center px-2">
            Includes calibration, every poll tick (yaw/pitch/eyes/no-face), step progress and timeout data — share with support.
          </p>
        </div>
      )}
      
      {faceVerified && (
        <Button
          className={`${usingNativeFaceCamera ? 'relative z-20 w-full' : 'w-full'} h-14 bg-gradient-to-r from-green-600 to-emerald-600 rounded-2xl text-lg font-bold shadow-lg shadow-green-500/20`}
          onClick={isHostVerification ? completeHostVerification : completeUserVerification}
          disabled={loading || !faceVerificationVideo || (isHostVerification && getMissingHostRequirements().length > 0)}
        >
          {loading ? (
            <Loader2 className="w-6 h-6 mr-3 animate-spin" />
          ) : (
            <CheckCircle2 className="w-6 h-6 mr-3" />
          )}
          Submit Verification
        </Button>
      )}
    </div>
  );
};





  if (loading && !submitInProgress && verificationStatus !== 'submitted' && verificationStatus !== 'verified' && verificationStatus !== 'rejected') {
    return (
      <PageSkeleton
        className="fixed inset-0 flex flex-col bg-gradient-to-b from-[#FFFBF2] via-[#FAF5EA] to-[#FFFBF2] overflow-hidden"
        headerClassName="bg-amber-100/50 border-b border-amber-200/30"
        rows={4}
        hero={false}
      />
    );
  }

  // Parse duplicate info if present in rejection reason
  const duplicateMatch = rejectionReason?.match(/\[duplicate_info:(.*?)\]/);
  const duplicateInfo = duplicateMatch ? JSON.parse(duplicateMatch[1]) : null;
  const cleanRejectionReason = rejectionReason?.replace(/\[duplicate_info:.*?\]/, '').trim();

  // Contact Support is required for account-type mismatch or duplicate account.
  const lowerRejectReason = cleanRejectionReason?.toLowerCase() || '';
  const isContactSupportRequired = lowerRejectReason.includes('account type') || lowerRejectReason.includes('gender mismatch') || !!duplicateInfo;
  const openVerificationSupport = () => {
    try {
      sessionStorage.setItem(
        'verification_support_context',
        [
          '[Category: Face Verification]',
          '',
          'My face verification was rejected and I need support review.',
          cleanRejectionReason ? `Reason shown: ${cleanRejectionReason}` : null,
          duplicateInfo ? `Existing account shown: ${duplicateInfo.name || 'Unknown'} (ID: ${duplicateInfo.uid || 'Unknown'})` : null,
        ].filter(Boolean).join('\n')
      );
    } catch { /* ignore */ }
    navigate('/settings/customer-service?mode=live_chat&source=face_verification');
  };

  // Rejected - allow re-verification or contact support
  // Header component (no logo)
  const renderHeader = (title: string, subtitle?: string) => (
    <div className="relative mb-6">
      <div className="absolute inset-0 bg-gradient-to-r from-purple-600/20 via-pink-500/10 to-transparent blur-3xl -z-10" />
      <div className="flex items-center gap-3 mb-2">
        <Button size="icon" variant="ghost" className="w-10 h-10 rounded-xl bg-amber-50/70 hover:bg-amber-50 backdrop-blur-sm border border-amber-200/60" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5 text-slate-800" />
        </Button>
        <div>
          <h1 className="text-xl font-black tracking-tight bg-gradient-to-r from-purple-700 via-fuchsia-600 to-pink-600 bg-clip-text text-transparent">{title}</h1>
          {subtitle && <p className="text-slate-600 text-sm">{subtitle}</p>}
        </div>
      </div>
    </div>
  );

  if (verificationStatus === 'rejected') {
    return (
      <div data-face-verification-shell className={`fixed inset-0 flex flex-col ${usingNativeFaceCamera ? 'bg-transparent' : 'bg-gradient-to-b from-[#FFFBF2] via-[#FAF5EA] to-[#FFFBF2]'} overflow-hidden`}>
        {usingNativeFaceCamera && <div aria-hidden className="face-native-page-mask pointer-events-none absolute inset-0 bg-gradient-to-b from-[#FFFBF2] via-[#FAF5EA] to-[#FFFBF2]" />}
        <div data-face-verification-scroll className={`relative z-10 flex-1 overflow-y-auto overscroll-contain p-4 ${usingNativeFaceCamera ? 'pt-[40vh]' : ''}`} style={{ WebkitOverflowScrolling: "touch", paddingBottom: "var(--content-bottom-padding)" }}>

        {!usingNativeFaceCamera && renderHeader("Face Verification", "Identity check required")}
        <div className="flex flex-col items-center justify-center mt-12 pb-12">
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring" }}
            className="w-28 h-28 rounded-full bg-gradient-to-r from-red-400 to-rose-500 flex items-center justify-center mb-6 shadow-2xl shadow-red-500/20">
            <XCircle className="w-14 h-14 text-white" />
          </motion.div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Verification Rejected</h2>
          
          <div className="mx-6 mb-6">
            <p className="text-red-700 bg-red-50 border border-red-200 rounded-2xl px-5 py-4 text-center text-sm font-medium leading-relaxed shadow-sm">
              {cleanRejectionReason || "Your verification was rejected. Please ensure you are the same person as in your photos."}
            </p>
          </div>

          {duplicateInfo && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mx-6 mb-8 p-5 bg-white border border-slate-200 rounded-3xl shadow-xl w-full max-w-sm"
            >
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 text-center">Existing Account Detected</p>
              <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <AvatarWithFrame
                  userId={(duplicateInfo as any).user_id || (duplicateInfo as any).id}
                  src={duplicateInfo.avatar || undefined}
                  name={(duplicateInfo as any)?.name || "U"}
                  level={1}
                  size="lg"
                  showFrame={true}
                  showAnimation={false}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-slate-900 font-bold truncate text-lg">{duplicateInfo.name}</p>
                  <p className="text-slate-500 text-xs font-mono bg-slate-200/50 inline-block px-2 py-0.5 rounded-md mt-1">ID: {duplicateInfo.uid}</p>
                </div>
              </div>
              <div className="mt-4 flex items-start gap-2 text-amber-600 bg-amber-50 p-3 rounded-xl border border-amber-100">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <p className="text-[11px] leading-relaxed font-medium">This face is already linked to the account above. Merilive allows only one account per person.</p>
              </div>
            </motion.div>
          )}
          
          <div className="flex flex-col gap-3 w-full max-w-[280px] px-6">
            {isContactSupportRequired && (
              <Button
                className="w-full bg-slate-900 text-white rounded-2xl py-6 font-bold shadow-xl shadow-slate-900/20 active:scale-95 transition-transform"
                onClick={openVerificationSupport}
              >
                💬 Contact Support Chat
              </Button>
            )}
            
            {!duplicateInfo && (
              <Button 
                variant="outline" 
                className="w-full border-slate-200 text-slate-600 rounded-2xl py-6 font-semibold bg-white active:scale-95 transition-transform"
                onClick={async () => {
                  setPhotoFile(null); setPhotoPreview(null); setUserPhotoFile(null); setUserPhotoPreview(null);
                  postSubmitLockedRef.current = false; setSubmitInProgress(false); setUserInfoStepComplete(false);
                  setUserPhotoStep(true); setVideoFile(null); setVideoPreview(null); setHostPhotos([]); setHostPhotosPreviews([]);
                  setFaceVerificationVideo(null); setFaceVerified(false); setVerificationStarted(false);
                  setCurrentInstruction(0); setInstructionsCompleted(faceInstructions.map(() => false)); instructionsCompletedRef.current = faceInstructions.map(() => false);
                  setVerificationRecording(false); setVerificationTime(0); setVerificationFailed(false); setFaceManualReviewRequired(false);
                  setCameraReady(false); setCurrentStep(1); setFullName(""); setAge(""); setLanguage("");
                  setRejectionReason(null); setVerificationStatus('unverified');
                }}
              >
                🔄 Try Again
              </Button>
            )}

            <Button 
              variant="ghost" 
              className="w-full text-slate-400 font-medium hover:bg-slate-50 rounded-2xl py-6"
              onClick={() => navigate('/profile')}
            >
              Back to Profile
            </Button>
          </div>
        </div>
        </div>
      </div>
    );
  }



  // Already submitted - pending review
  // ★ Permanent eligibility lockout — render BEFORE every other branch so
  // the camera path is unreachable for users who hit the 10-strike contact
  // violation rule or whose face/device/IP is on the global ban list.
  if (eligibilityBlock) {
    const isContactBan = eligibilityBlock.reason === 'contact_violation_threshold';
    const isIdentityReuse = eligibilityBlock.reason === 'banned_identity_reuse';
    const headline = isContactBan
      ? 'Account Permanently Restricted'
      : isIdentityReuse
        ? 'This Identity Is Blocked'
        : 'Verification Unavailable';
    const subline = isContactBan
      ? `Your account has been flagged for repeatedly sharing contact information (${eligibilityBlock.violation_count ?? 'multiple'} strikes, limit ${eligibilityBlock.threshold ?? 10}). Face verification is no longer available for this account.`
      : isIdentityReuse
        ? 'This face, device, or network has been previously banned for policy violations. Re-opening a new account with the same identity is not permitted.'
        : 'You are not eligible to submit a face verification at this time. Please contact support if you believe this is a mistake.';
    return (
      <div data-face-verification-shell className="fixed inset-0 flex flex-col bg-gradient-to-b from-rose-50 via-orange-50 to-rose-50 overflow-hidden">
        <div className="flex-1 overflow-y-auto overscroll-contain p-4" style={{ WebkitOverflowScrolling: 'touch', paddingBottom: 'var(--content-bottom-padding)' }}>
          {renderHeader('Face Verification', 'Identity check unavailable')}
          <div className="flex flex-col items-center justify-center mt-16 px-4">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring' }}
              className="w-28 h-28 rounded-full bg-gradient-to-br from-rose-500 to-red-600 flex items-center justify-center mb-6 shadow-2xl shadow-rose-500/30"
            >
              <ShieldCheck className="w-14 h-14 text-white" />
            </motion.div>
            <h2 className="text-2xl font-bold text-slate-900 mb-3 text-center">{headline}</h2>
            <p className="text-slate-600 text-center max-w-md leading-relaxed mb-6">{subline}</p>
            <div className="bg-white/80 backdrop-blur border border-rose-100 rounded-2xl p-4 max-w-md w-full text-sm text-slate-600 mb-6">
              <p className="font-semibold text-slate-800 mb-1">Reason code</p>
              <code className="text-xs text-rose-700">{eligibilityBlock.reason}</code>
            </div>
            <Button
              className="bg-gradient-to-r from-slate-700 to-slate-900 text-white rounded-xl px-8 h-12 shadow-lg"
              onClick={() => navigate('/profile')}
            >
              Back to Profile
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (submitInProgress || verificationStatus === 'submitted') {
    return (
      <div data-face-verification-shell className="fixed inset-0 flex flex-col bg-gradient-to-b from-[#FFFBF2] via-[#FAF5EA] to-[#FFFBF2] overflow-hidden">
        <div data-face-verification-scroll className="flex-1 overflow-y-auto overscroll-contain p-4" style={{ WebkitOverflowScrolling: "touch", paddingBottom: "var(--content-bottom-padding)" }}>

        {renderHeader("Face Verification", "Identity check required")}
        <div className="flex flex-col items-center justify-center mt-12">
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring" }}
            className="w-28 h-28 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 flex items-center justify-center mb-4 shadow-2xl shadow-amber-500/20">
            {submitInProgress ? <ShieldCheck className="w-14 h-14 text-white" /> : <CheckCircle2 className="w-14 h-14 text-white" />}
          </motion.div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">{submitInProgress ? 'Submitting Verification' : 'Under Review'}</h2>
          <p className="text-slate-600 text-center px-6">
            {submitInProgress
              ? 'Your live scan is being uploaded securely. The camera is off and AI review will start automatically.'
              : 'Your face verification has been submitted and is pending AI/admin review. Please wait for approval.'}
          </p>
          {!submitInProgress && (
            <Button className="mt-6 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl px-8 shadow-lg shadow-purple-500/20" onClick={() => navigate('/profile')}>
              Back to Profile
            </Button>
          )}
        </div>
        </div>
      </div>
    );
  }

  // Already verified
  if (verificationStatus === 'verified') {
    return (
      <div data-face-verification-shell className={`fixed inset-0 flex flex-col ${usingNativeFaceCamera ? 'bg-transparent' : 'bg-gradient-to-b from-[#FFFBF2] via-[#FAF5EA] to-[#FFFBF2]'} overflow-hidden`}>
        {usingNativeFaceCamera && <div aria-hidden className="face-native-page-mask pointer-events-none absolute inset-0 bg-gradient-to-b from-[#FFFBF2] via-[#FAF5EA] to-[#FFFBF2]" />}
        <div data-face-verification-scroll className={`relative z-10 flex-1 overflow-y-auto overscroll-contain p-4 ${usingNativeFaceCamera ? 'pt-[40vh]' : ''}`} style={{ WebkitOverflowScrolling: "touch", paddingBottom: "var(--content-bottom-padding)" }}>
          {!usingNativeFaceCamera && renderHeader("Face Verification", "Identity check required")}
          <div className="flex flex-col items-center justify-center mt-12">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring" }}
              className="w-28 h-28 rounded-full bg-gradient-to-r from-green-400 to-emerald-500 flex items-center justify-center mb-4 shadow-2xl shadow-green-500/20"
            >
              <CheckCircle2 className="w-14 h-14 text-slate-800" />
            </motion.div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Already Verified!</h2>
            <p className="text-slate-500 text-center">Your face verification is complete</p>
            <Button
              className="mt-6 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl px-8 shadow-lg shadow-purple-500/20"
              onClick={() => navigate('/profile')}
            >
              Back to Profile
            </Button>
          </div>
        </div>
      </div>
    );
  }




  // User verification - 3-step process: Info → Photo → Face
  if (!isHostVerification) {
    const handleUserPhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        if (file.size > 10 * 1024 * 1024) {
          toast({ title: "Error", description: "Image size cannot exceed 10MB", variant: "destructive" });
          return;
        }
        setUserPhotoFile(file);
        const reader = new FileReader();
        reader.onloadend = () => setUserPhotoPreview(reader.result as string);
        reader.readAsDataURL(file);
      }
    };

    // User step tracking: 1 = Info, 2 = Photo, 3 = Face
    const userCurrentStep = !userInfoStepComplete ? 1 : userPhotoStep ? 2 : 3;

    const saveUserStep1 = () => {
      if (!fullName.trim()) {
        toast({ title: "❌ Name Required", description: "Please enter your full name", variant: "destructive" });
        return;
      }
      if (!age || parseInt(age) < 18) {
        toast({ title: "❌ Valid Age Required", description: age ? "Age must be at least 18 years" : "Please enter your age", variant: "destructive" });
        return;
      }
      if (!language) {
        toast({ title: "❌ Language Required", description: "Please select your preferred language", variant: "destructive" });
        return;
      }
      // Move only after an explicit tap. Do not auto-advance while the user is
      // still interacting with SelectContent; otherwise the language menu
      // unmounts immediately and looks like a jump/bounce on mobile WebView.
      setUserInfoStepComplete(true);
      setUserPhotoStep(true);
    };

    // Determine which user step to show
    // We repurpose: currentStep=1 for info, userPhotoStep=true & info done for photo, userPhotoStep=false for face
    const userInfoValid = Boolean(fullName.trim() && age && parseInt(age, 10) >= 18 && language);
    const showUserInfoStep = !userInfoStepComplete;
    const showUserPhotoStep = userInfoStepComplete && userPhotoStep;
    const showUserFaceStep = !userPhotoStep;

    return (
      <div data-face-verification-shell className={`fixed inset-0 flex flex-col ${usingNativeFaceCamera ? 'bg-transparent' : 'bg-gradient-to-b from-[#FFFBF2] via-[#FAF5EA] to-[#FFFBF2]'} overflow-hidden`}>
        {usingNativeFaceCamera && <div aria-hidden className="face-native-page-mask pointer-events-none absolute inset-0 bg-gradient-to-b from-[#FFFBF2] via-[#FAF5EA] to-[#FFFBF2]" />}
        <div data-face-verification-scroll className="relative z-10 flex-1 overflow-y-auto overscroll-contain p-4" style={{ WebkitOverflowScrolling: "touch", paddingBottom: "var(--content-bottom-padding)" }}>
        {!usingNativeFaceCamera && renderHeader("Face Verification", "Verify your identity")}

        {/* Progress Steps - 3 steps */}
        <div className={`flex items-center justify-center gap-3 mb-6 ${usingNativeFaceCamera ? 'hidden' : ''}`}>
          {[1, 2, 3].map((step) => {
            const isActive = (!userInfoStepComplete && step === 1) || (userInfoStepComplete && userPhotoStep && step === 2) || (!userPhotoStep && step === 3);
            const isDone = (step === 1 && userInfoStepComplete) || (step === 2 && !userPhotoStep && userPhotoFile);
            return (
              <React.Fragment key={step}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${isDone ? 'bg-green-500 text-white' : isActive ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white' : 'bg-amber-50/70 text-slate-700'}`}>
                  {isDone ? <CheckCircle2 className="w-5 h-5" /> : step}
                </div>
                {step < 3 && <div className={`w-12 h-1 rounded-full ${isDone ? 'bg-gradient-to-r from-purple-500 to-pink-500' : 'bg-amber-50'}`} />}
              </React.Fragment>
            );
          })}
        </div>

        {/* Step 1: Basic Info */}
        {showUserInfoStep && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
            <div className="bg-white rounded-3xl p-5 border border-purple-200 shadow-lg shadow-purple-500/5">
              <h2 className="font-bold text-slate-900 mb-5 flex items-center gap-3 text-lg">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-md shadow-purple-500/30">
                  <User className="w-5 h-5 text-white" />
                </div>
                Basic Information
              </h2>
              
              <div className="space-y-4">
                <div>
                  <Label className="text-slate-700 text-sm font-semibold">Full Name *</Label>
                  <Input
                    placeholder="Enter your name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 mt-1.5 h-12 rounded-xl focus:border-purple-400 focus:ring-1 focus:ring-purple-400"
                  />
                </div>
                
                <div>
                  <Label className="text-slate-700 text-sm font-semibold">Age *</Label>
                  <Input
                    type="number"
                    placeholder="18+"
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    className="bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 mt-1.5 h-12 rounded-xl focus:border-purple-400 focus:ring-1 focus:ring-purple-400"
                  />
                </div>
                
                <div>
                  <Label className="text-slate-700 text-sm font-semibold">Language *</Label>
                  <Select value={language} onValueChange={setLanguage}>
                    <SelectTrigger className="bg-white border-slate-200 text-slate-900 mt-1.5 h-12 rounded-xl focus:border-purple-400 focus:ring-1 focus:ring-purple-400">
                      <SelectValue placeholder="Select language" />
                    </SelectTrigger>
                    <SelectContent>
                      {languages.map((lang) => (
                        <SelectItem key={lang.code} value={lang.code}>
                          {lang.flag} {lang.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            
            <Button
              className="w-full bg-gradient-to-r from-purple-600 via-fuchsia-500 to-pink-600 hover:from-purple-500 hover:via-fuchsia-400 hover:to-pink-500 text-white h-14 rounded-2xl text-lg font-bold shadow-lg shadow-purple-600/25 transition-all duration-300 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:hover:scale-100"
              onClick={saveUserStep1}
              disabled={!userInfoValid}
            >
              Next
            </Button>
          </motion.div>
        )}

        {/* Step 2: Profile Photo */}
        {showUserPhotoStep && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
            <div className="bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30 rounded-2xl p-4">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 flex items-center justify-center shadow-lg">
                  <ImagePlus className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-lg">Step 2: Profile Photo</h3>
                  <p className="text-sm text-slate-600">Upload a clear photo of your face</p>
                </div>
              </div>
            </div>

            <div className="bg-white/80 rounded-3xl p-6 border border-amber-200/60">
              <input ref={userPhotoInputRef} type="file" accept="image/*" onChange={handleUserPhotoSelect} className="hidden" />
              
              {userPhotoPreview ? (
                <div className="space-y-4">
                  <div className="w-48 h-48 mx-auto rounded-2xl overflow-hidden border-2 border-purple-500/50">
                    <img loading="lazy" decoding="async" src={userPhotoPreview} alt="Profile" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex gap-3">
                    <Button variant="outline" className="flex-1 border-amber-200/60 text-slate-800" onClick={() => { setUserPhotoFile(null); setUserPhotoPreview(null); }}>
                      <RotateCcw className="w-4 h-4 mr-2" /> Change
                    </Button>
                    <Button className="flex-1 bg-gradient-to-r from-green-500 to-emerald-500" onClick={() => setUserPhotoStep(false)}>
                      <CheckCircle2 className="w-4 h-4 mr-2" /> Continue
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8" onClick={() => userPhotoInputRef.current?.click()}>
                  <div className="w-24 h-24 mx-auto rounded-full bg-amber-50/70 flex items-center justify-center mb-4 cursor-pointer hover:bg-amber-50 transition-colors">
                    <Upload className="w-10 h-10 text-purple-400" />
                  </div>
                  <p className="text-slate-800 font-medium mb-1">Tap to upload your photo</p>
                  <p className="text-slate-500 text-sm">Clear face photo required for verification</p>
                </div>
              )}
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
              <p className="text-blue-800 text-xs text-center">
                📸 This photo will be compared with your face video to verify your identity. Make sure your face is clearly visible.
              </p>
            </div>

            <Button variant="ghost" className="w-full text-slate-500" onClick={() => { setUserInfoStepComplete(false); setUserPhotoStep(true); }}>
              ← Back to Info
            </Button>
          </motion.div>
        )}

        {/* Step 3: Face Verification */}
        {showUserFaceStep && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
            <div className="bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30 rounded-2xl p-4 mb-2">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 flex items-center justify-center shadow-lg">
                  <ShieldCheck className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-lg">Step 3: Face Verification</h3>
                  <p className="text-sm text-slate-600">Record a 10-second face video</p>
                </div>
              </div>
            </div>

            {renderFaceVerificationSection()}

            <Button variant="ghost" className="w-full text-slate-500" onClick={() => setUserPhotoStep(true)}>
              ← Back to Photo Upload
            </Button>
          </motion.div>
        )}
      </div>
      </div>
    );
  }



  // Host verification (3-step process)
  return (
      <div data-face-verification-shell className={`fixed inset-0 flex flex-col ${usingNativeFaceCamera ? 'bg-transparent' : 'bg-gradient-to-b from-[#FFFBF2] via-[#FAF5EA] to-[#FFFBF2]'} overflow-hidden safe-top`}>
       {usingNativeFaceCamera && <div aria-hidden className="face-native-page-mask pointer-events-none absolute inset-0 bg-gradient-to-b from-[#FFFBF2] via-[#FAF5EA] to-[#FFFBF2]" />}
       <div data-face-verification-scroll className="relative z-10 flex-1 overflow-y-auto overscroll-contain px-3 pt-3 sm:px-4 sm:pt-4 safe-left safe-right" style={{ WebkitOverflowScrolling: "touch", paddingBottom: `calc(env(safe-area-inset-bottom) + var(--content-bottom-padding, 1rem))` }}>

      {!usingNativeFaceCamera && renderHeader("Host Verification", "Get verified as a host")}
      
      {/* Progress Steps — professional KYC-style indicator */}
      <div className={`mb-6 sm:mb-8 px-1 ${usingNativeFaceCamera ? 'hidden' : ''}`}>
        <div className="flex items-center justify-between">
          {[
            { n: 1, label: 'Basic Info' },
            { n: 2, label: 'Photos & Video' },
            { n: 3, label: 'Live Face Scan' },
          ].map((s, idx) => {
            const done = currentStep > s.n;
            const active = currentStep === s.n;
            return (
              <div key={s.n} className="flex items-center flex-1 min-w-0">
                <div className="flex flex-col items-center gap-1.5 min-w-0">
                  <motion.div
                    className={`relative w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center font-semibold text-sm transition-colors ${
                      done
                        ? 'bg-emerald-600 text-white ring-2 ring-emerald-200'
                        : active
                          ? 'bg-slate-900 text-white ring-4 ring-slate-200'
                          : 'bg-white text-slate-400 ring-1 ring-slate-200'
                    }`}
                    animate={active ? { scale: [1, 1.04, 1] } : {}}
                    transition={{ repeat: Infinity, duration: 2.2 }}
                  >
                    {done ? <CheckCircle2 className="w-5 h-5" /> : s.n}
                  </motion.div>
                  <span className={`text-[10px] sm:text-xs font-medium tracking-tight text-center leading-tight max-w-[72px] truncate ${
                    active ? 'text-slate-900' : done ? 'text-emerald-700' : 'text-slate-400'
                  }`}>{s.label}</span>
                </div>
                {idx < 2 && (
                  <div className="flex-1 h-[2px] mx-1.5 sm:mx-2 mt-[-18px] rounded-full bg-slate-200 overflow-hidden">
                    <motion.div
                      className="h-full bg-emerald-500"
                      initial={false}
                      animate={{ width: currentStep > s.n ? '100%' : '0%' }}
                      transition={{ duration: 0.4 }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>


      
      {/* Step Content */}
      {currentStep === 1 && (
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="space-y-4"
        >
          <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-purple-200 shadow-lg shadow-purple-500/5">
            <h2 className="font-bold text-slate-900 mb-4 sm:mb-5 flex items-center gap-3 text-base sm:text-lg">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-md shadow-purple-500/30 shrink-0">
                <User className="w-5 h-5 text-white" />
              </div>
              Basic Information
            </h2>
            
            {/* Profile Photo */}
            <div className="flex flex-col items-center mb-5">
              <div 
                className="w-24 h-24 sm:w-28 sm:h-28 rounded-3xl bg-purple-50 border-2 border-dashed border-purple-300 flex items-center justify-center cursor-pointer hover:bg-purple-100 active:scale-95 transition overflow-hidden shadow-md touch-target-lg"
                onClick={() => photoInputRef.current?.click()}
                role="button"
                aria-label="Upload profile photo"
              >
                {photoPreview ? (
                  <img loading="lazy" decoding="async" src={photoPreview} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <ImagePlus className="w-10 h-10 text-purple-400 opacity-60" />
                )}
              </div>
              <input 
                ref={photoInputRef}
                type="file" 
                accept="image/*" 
                className="hidden" 
                onChange={handlePhotoSelect}
              />
              <p className="text-xs sm:text-sm text-slate-600 mt-2">Upload profile photo</p>
            </div>
            
            <div className="space-y-4">
              <div>
                <Label className="text-slate-700 text-sm font-semibold">Full Name</Label>
                <Input
                  placeholder="Enter your name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  autoComplete="name"
                  className="bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 mt-1.5 h-12 rounded-xl text-base focus:border-purple-400 focus:ring-1 focus:ring-purple-400"
                />
              </div>
              
              <div>
                <Label className="text-slate-700 text-sm font-semibold">Age</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  placeholder="18+"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  className="bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 mt-1.5 h-12 rounded-xl text-base focus:border-purple-400 focus:ring-1 focus:ring-purple-400"
                />
              </div>
              
              <div>
                <Label className="text-slate-700 text-sm font-semibold">Language</Label>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger className="bg-white border-slate-200 text-slate-900 mt-1.5 h-12 rounded-xl text-base focus:border-purple-400 focus:ring-1 focus:ring-purple-400">
                    <SelectValue placeholder="Select language" />
                  </SelectTrigger>
                  <SelectContent>
                    {languages.map((lang) => (
                      <SelectItem key={lang.code} value={lang.code}>
                        {lang.flag} {lang.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          
          <div className="sticky-cta-bar -mx-3 sm:-mx-4 px-3 sm:px-4">
            <Button
              className="w-full bg-gradient-to-r from-purple-600 via-fuchsia-500 to-pink-600 hover:from-purple-500 hover:via-fuchsia-400 hover:to-pink-500 text-white min-h-cta h-14 rounded-2xl text-base sm:text-lg font-bold shadow-lg shadow-purple-600/25 transition-all duration-300 hover:shadow-xl active:scale-[0.98] disabled:opacity-40"
              onClick={saveHostStep1}
              disabled={loading || !fullName.trim() || !age || parseInt(age || "0", 10) < 18 || !language || !photoFile}
            >
              Next
            </Button>
          </div>

        </motion.div>
      )}
      
      {currentStep === 2 && (
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="space-y-4"
        >
          <div className="bg-gradient-to-br from-rose-50 to-orange-50 rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-purple-500/20">
            <h2 className="font-bold text-slate-800 mb-4 flex items-center gap-3 text-base sm:text-lg">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-pink-500 flex items-center justify-center shrink-0">
                <Film className="w-5 h-5 text-white" />
              </div>
              Video Upload
            </h2>
            
            {/* Video Upload/Record */}
            <div className="aspect-video w-full rounded-2xl overflow-hidden bg-white/80 border border-amber-200/60 mb-4 relative shadow-lg">
              {videoPreview ? (
                <video
                  src={videoPreview}
                  poster={videoPoster || undefined}
                  muted
                  autoPlay
                  loop
                  playsInline
                  controls
                  preload="metadata"
                  disablePictureInPicture
                  disableRemotePlayback
                  controlsList="nodownload noremoteplayback noplaybackrate"
                  className="w-full h-full object-cover bg-black"
                  onLoadedData={(event) => event.currentTarget.play().catch(() => {})}
                />
              ) : isRecording ? (
                <>
                  <video
                    ref={liveVideoRef}
                    autoPlay
                    playsInline
                    muted
                    controls={false}
                    poster=""
                    disablePictureInPicture
                    disableRemotePlayback
                    controlsList="nodownload nofullscreen noremoteplayback noplaybackrate"
                    {...({ 'x5-video-player-type': 'h5', 'x5-video-player-fullscreen': 'false', 'x5-playsinline': 'true', 'webkit-playsinline': 'true' } as Record<string, string>)}
                    className="w-full h-full object-cover scale-x-[-1]"
                    style={{ backgroundColor: '#000', pointerEvents: 'none', WebkitAppearance: 'none' as React.CSSProperties['WebkitAppearance'] }}
                  />
                  <div className="absolute top-3 left-3 flex items-center gap-2 bg-red-500 px-4 py-1.5 rounded-full shadow-lg">
                    <div className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
                    <span className="text-slate-800 text-sm font-bold">{recordingTime}s / 15s</span>
                  </div>
                </>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center">
                  <Upload className="w-14 h-14 text-slate-400/40" />
                  <p className="text-slate-500 text-sm">Record or upload video</p>
                </div>
              )}
            </div>
            
            <div className="flex gap-2">
              {!isRecording && !videoPreview && (
                <>
                  <Button
                    className="flex-1 bg-gradient-to-r from-red-500 to-pink-500 h-12 rounded-xl"
                    onClick={startRecording}
                  >
                    <Film className="w-5 h-5 mr-2" />
                    Record
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 border-amber-300 text-slate-800 hover:bg-amber-100 h-12 rounded-xl font-semibold"
                    onClick={() => videoInputRef.current?.click()}
                  >
                    <Upload className="w-5 h-5 mr-2" />
                    Upload
                  </Button>
                </>
              )}
              {isRecording && (
                <Button
                  className="w-full bg-red-600 h-12 rounded-xl"
                  onClick={stopRecording}
                >
                  Stop Recording
                </Button>
              )}
              {videoPreview && (
                <Button
                  variant="outline"
                  className="w-full border-amber-300 text-slate-800 hover:bg-amber-100 h-12 rounded-xl font-semibold"
                  onClick={() => {
                    setVideoPreview(null);
                    setVideoPoster(null);
                    setVideoFile(null);
                  }}
                >
                  <RotateCcw className="w-5 h-5 mr-2" />
                  Retake
                </Button>
              )}
            </div>
            <input 
              ref={videoInputRef}
              type="file" 
              accept="video/*" 
              className="hidden" 
              onChange={handleVideoSelect}
            />
          </div>
          
          {/* Host Photos */}
          <div className="bg-gradient-to-br from-rose-50 to-orange-50 rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-purple-500/20">
            <h2 className="font-bold text-slate-800 mb-4 flex items-center gap-3 text-base sm:text-lg">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shrink-0">
                <ImagePlus className="w-5 h-5 text-white" />
              </div>
              Photos Upload (up to 3)
            </h2>
            
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {[0, 1, 2].map((index) => (
                <div 
                  key={index}
                  className="aspect-square rounded-xl sm:rounded-2xl bg-amber-50/70 border-2 border-dashed border-amber-200/60 flex items-center justify-center cursor-pointer hover:bg-amber-50 active:scale-95 transition overflow-hidden shadow-md touch-target-lg"
                  onClick={() => hostPhotosInputRef.current?.click()}
                  role="button"
                  aria-label={`Add photo ${index + 1}`}
                >
                  {hostPhotosPreviews[index] ? (
                    <img loading="lazy" decoding="async" src={hostPhotosPreviews[index]} alt={`Photo ${index + 1}`} className="w-full h-full object-cover" />
                  ) : (
                    <ImagePlus className="w-7 h-7 sm:w-8 sm:h-8 text-slate-500" />
                  )}
                </div>
              ))}
            </div>
            <input 
              ref={hostPhotosInputRef}
              type="file" 
              accept="image/*" 
              multiple
              className="hidden" 
              onChange={handleHostPhotosSelect}
            />
          </div>
          
          <div className="sticky-cta-bar -mx-3 sm:-mx-4 px-3 sm:px-4">
            <div className="flex gap-2 sm:gap-3">
              <Button
                variant="outline"
                className="flex-1 border-amber-300 text-slate-800 hover:bg-amber-100 min-h-cta h-14 rounded-2xl font-semibold"
                onClick={() => setCurrentStep(1)}
              >
                Back
              </Button>
              <Button
                className="flex-[1.4] bg-gradient-to-r from-purple-500 to-pink-500 min-h-cta h-14 rounded-2xl text-base sm:text-lg font-bold"
                onClick={saveHostStep2}
                disabled={loading || !videoFile || hostPhotos.length !== 3}
              >
                Next
              </Button>
            </div>
          </div>

        </motion.div>
      )}
      
      {currentStep === 3 && (
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="space-y-4"
        >
          {renderFaceVerificationSection()}
          
          {!faceVerified && (
            <div className="sticky-cta-bar -mx-3 sm:-mx-4 px-3 sm:px-4">
              <Button
                variant="outline"
                className="w-full min-h-touch h-12 rounded-xl border-slate-300 bg-white text-slate-800 hover:bg-slate-50 hover:text-slate-900 font-semibold shadow-sm"
                onClick={() => {
                  stopFaceCamera();
                  setCurrentStep(2);
                }}
              >
                Go Back
              </Button>
            </div>
          )}
        </motion.div>
      )}
      
      {/* Existing Account Modal — bottom sheet on phones, centered on larger screens */}
      {showExistingAccountModal && existingAccount && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-sm safe-x">
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="w-full sm:max-w-sm bg-gradient-to-br from-rose-50 to-orange-50 rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] sm:pb-6 border border-purple-500/30 shadow-2xl"
          >
            <div className="text-center">
              <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-300 sm:hidden" />
              <div className="w-20 h-20 mx-auto mb-4 rounded-full overflow-hidden border-4 border-purple-500/50">
                {existingAccount.avatarUrl ? (
                  <img loading="lazy" decoding="async" src={existingAccount.avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-purple-600 flex items-center justify-center">
                    <User className="w-10 h-10 text-white" />
                  </div>
                )}
              </div>
              
              <h3 className="text-lg sm:text-xl font-bold text-slate-800 mb-2">
                Account Already Exists
              </h3>
              
              <p className="text-slate-600 text-sm mb-4 break-anywhere">
                This face is already registered with an account:
              </p>
              
              <div className="p-3 rounded-xl bg-amber-50/70 mb-4">
                <p className="font-semibold text-slate-800 break-anywhere">{existingAccount.displayName}</p>
                {existingAccount.isDeleted && (
                  <Badge className="mt-2 bg-amber-500/20 text-amber-700 border-amber-500/30">
                    Deletion Scheduled
                  </Badge>
                )}
              </div>
              
              <p className="text-slate-500 text-xs mb-5 sm:mb-6">
                One face can only be used for one host account. Please login to your existing account.
              </p>
              
              <div className="space-y-2.5">
                <Button
                  className="w-full bg-gradient-to-r from-purple-500 to-pink-500 min-h-cta h-12 rounded-xl font-bold"
                  onClick={async () => {
                    localStorage.setItem('meri_manual_logout', 'true');
                    await supabase.auth.signOut({ scope: 'local' });
                    navigate('/auth');
                  }}
                >
                  Login to Existing Account
                </Button>
                
                <Button
                  variant="ghost"
                  className="w-full min-h-touch text-slate-600 hover:text-slate-900 hover:bg-slate-100/80"
                  onClick={() => {
                    setShowExistingAccountModal(false);
                    setFaceVerified(false);
                    setFaceVerificationVideo(null);
                    resetVerification();
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
      </div>
    </div>
  );
};

export default FaceVerification;

