import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { 
  ArrowLeft, 
  Camera,
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
  ArrowUp,
  ArrowDown,
  ArrowLeftIcon,
  ArrowRightIcon,
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
import { useAppSyncEvent } from "@/hooks/useAppSyncEvent";
import { useNativeFaceCamera } from "@/hooks/useNativeFaceCamera";

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


// Single English-only instruction set (per global English policy).
// `checkPose` is preserved for any external callers but the live loop uses
// `evaluatePose(id, pose, calibration)` so thresholds stay in sync.
const getLocalizedInstructions = (_countryName?: string) => [
  { id: 'center', direction: 'Look Forward', icon: ScanFace,       description: 'Keep your face straight towards the camera', checkPose: (p: { yaw: number; pitch: number }) => evaluatePose('center', p, DEFAULT_CALIB) },
  { id: 'left',   direction: 'Turn Left',    icon: ArrowLeftIcon,  description: 'Slowly turn your head to the left',          checkPose: (p: { yaw: number; pitch: number }) => evaluatePose('left',   p, DEFAULT_CALIB) },
  { id: 'right',  direction: 'Turn Right',   icon: ArrowRightIcon, description: 'Slowly turn your head to the right',         checkPose: (p: { yaw: number; pitch: number }) => evaluatePose('right',  p, DEFAULT_CALIB) },
];

// Single English-only message set.
const getLocalizedMessages = (_countryName?: string) => ({
  failed: 'Verification Failed',
  failedDesc: 'Follow each on-screen instruction carefully and move your head as shown.',
  success: '✅ Face Verification Successful',
  successDesc: 'All liveness checks passed. Your identity has been verified.',
  startScan: 'Start Face Scan',
  tryAgain: 'Try Again',
  recording: 'Recording',
  tips: '💡 Ensure good lighting • Remove glasses/masks • Keep your face centered in the oval',
  beginCheck: 'Begin Liveness Check',
  cancel: 'Cancel',
  staticFace: 'Static face detected. Please use a real camera, not a photo.',
});

// Capture a frame from live video element as base64
const captureFrameFromLiveVideo = (videoEl: HTMLVideoElement, size = 480): string | null => {
  if (!videoEl || videoEl.readyState < 2) return null;
  const canvas = document.createElement('canvas');
  const aspect = videoEl.videoWidth / videoEl.videoHeight;
  canvas.width = size;
  canvas.height = Math.round(size / aspect);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
  return dataUrl.split(',')[1];
};

const FaceVerification = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [verificationStatus, setVerificationStatus] = useState<'pending' | 'verified' | 'unverified' | 'submitted' | 'rejected'>('unverified');
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  
  // Native camera permission hook
  const { getCameraStream, requestCameraPermission } = useNativeCameraPermission();
  const nativeFaceCam = useNativeFaceCamera();
  
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
  const [userPhotoStep, setUserPhotoStep] = useState(true);
  const userPhotoInputRef = useRef<HTMLInputElement>(null);
  
  // Step 2: Video & Photos (Hosts only)
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
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
  const [usingNativeFaceCamera, setUsingNativeFaceCamera] = useState(false);
  const [faceVerified, setFaceVerified] = useState(false);
  const [verifyingFace, setVerifyingFace] = useState(false);
  const faceVideoRef = useRef<HTMLVideoElement>(null);
  const faceCanvasRef = useRef<HTMLCanvasElement>(null);
  const faceRecorderRef = useRef<MediaRecorder | null>(null);
  const faceChunksRef = useRef<Blob[]>([]);
  const usingNativeFaceCameraRef = useRef(false);
  const nativeFaceRecordingRef = useRef(false);
  
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
  const currentInstructionRef = useRef(0);
  const instructionsCompletedRef = useRef<boolean[]>([false, false, false]);
  // 3-angle stills captured live during pose check (for AWS Rekognition auto-approve)
  const capturedAnglesRef = useRef<{ center?: string; left?: string; right?: string }>({});
  const horizontalFirstTurnSignRef = useRef<number | null>(null);
  const verticalFirstTiltSignRef = useRef<number | null>(null);

  const attachFacePreviewStream = useCallback((stream: MediaStream) => {
    const videoEl = faceVideoRef.current;
    if (!videoEl) {
      console.warn('[FaceVerification] faceVideoRef not ready, retrying in 200ms...');
      setTimeout(() => {
        const retryEl = faceVideoRef.current;
        if (retryEl) {
          retryEl.srcObject = stream;
          retryEl.play().catch(console.error);
          setCameraReady(true);
        }
      }, 200);
      return;
    }

    setCameraReady(false);
    
    // Clear any previous srcObject
    videoEl.srcObject = null;
    
    // Small delay to let the browser release previous resources
    requestAnimationFrame(() => {
      videoEl.srcObject = stream;
      
      const markReady = () => {
        if (!cameraReadyMarked) {
          cameraReadyMarked = true;
          setCameraReady(true);
        }
      };
      let cameraReadyMarked = false;

      videoEl.onloadedmetadata = () => {
        videoEl.play().then(markReady).catch((e) => console.error('Video play error:', e));
      };

      // Fallback: force play after a short delay
      setTimeout(() => {
        if (!cameraReadyMarked) {
          videoEl.play().then(markReady).catch(console.error);
        }
      }, 500);

      // Last resort: check track state
      setTimeout(() => {
        const hasLiveTrack = stream.getVideoTracks().some((track) => track.readyState === 'live');
        if (hasLiveTrack) markReady();
      }, 1600);
    });
  }, []);

  const setNativeFaceCameraActive = useCallback((active: boolean) => {
    usingNativeFaceCameraRef.current = active;
    setUsingNativeFaceCamera(active);
  }, []);

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
    } else if (latestSubmission?.status === 'pending' || latestSubmission?.status === 'submitted') {
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

  // Call auto-face-verify edge function
  const callAutoFaceVerify = async (
    imageBase64: string,
    submissionId?: string,
    durations?: { introVideoDurationSeconds?: number; faceVideoDurationSeconds?: number }
  ) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const response = await supabase.functions.invoke('auto-face-verify', {
      body: { imageBase64, submissionId, ...durations },
    });

    if (response.error) throw new Error(response.error.message || 'Verification failed');
    return response.data;
  };

  // Generate deterministic face/video hash; never random, so duplicate checks do not silently miss.
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

  const enforceDuplicateFaceBan = async (matched: any) => {
    if (!userId || !matched?.user_id) return;

    try {
      await supabase.rpc('ban_duplicate_face_attempt', {
        _user_id: userId,
        _duplicate_user_id: matched.user_id,
        _duplicate_uid: matched.app_uid || matched.user_id,
      });
    } catch (banErr) {
      console.error('Duplicate face ban RPC failed:', banErr);
      recordClientError({ label: "FaceVerification.enforceDuplicateFaceBan", message: banErr instanceof Error ? banErr.message : String(banErr) });
    }

    toast({
      title: "Account Permanently Banned",
      description: "Duplicate face detected. One face can only be used for one account.",
      variant: "destructive",
    });

    localStorage.setItem('meri_manual_logout', 'true');
    await supabase.auth.signOut({ scope: 'local' });
    navigate('/auth');
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
      if (faceStream) {
        faceStream.getTracks().forEach(track => track.stop());
      }
      if (videoStreamRef.current) {
        videoStreamRef.current.getTracks().forEach(track => track.stop());
      }
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

  // Pkg91: dead postgres_changes channel (3 tables not in publication) replaced
  // with app_sync trigger fan-out via useAppSyncEvent (zero new realtime channels).
  useAppSyncEvent(
    ['face_verification_submissions', 'host_applications', 'profiles'],
    (detail) => {
      if (!userId) return;
      const rowUser = (detail.payload as any)?.user_id ?? (detail.payload as any)?.id;
      if (rowUser && rowUser !== userId) return;
      void refreshVerificationState(userId);
    },
    !!userId,
  );

  useEffect(() => {
    if (!userId) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshVerificationState(userId);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [userId, refreshVerificationState]);


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
      setVideoPreview(url);
    }
  };

  // Start video recording for host
  const startRecording = async () => {
    try {
      // Request camera permission first using native API
      const permResult = await requestCameraPermission();
      if (!permResult.granted) {
        toast({
          title: "Camera Permission Required",
          description: permResult.error || "Please allow camera access to continue",
          variant: "destructive",
        });
        return;
      }

      // Use native camera hook with fallback
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
        setVideoPreview(URL.createObjectURL(blob));
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
    try {
      if (await nativeFaceCam.isAvailable()) {
        if (faceStream) {
          faceStream.getTracks().forEach(track => track.stop());
          setFaceStream(null);
        }
        await nativeFaceCam.startPreview('1080p');
        setNativeFaceCameraActive(true);
        setCameraReady(true);
        return;
      }

      // Stop any existing stream first
      if (faceStream) {
        faceStream.getTracks().forEach(track => track.stop());
        setFaceStream(null);
      }

      // getCameraStream already handles permission internally — no separate probe needed
      // This avoids the double getUserMedia issue that causes black screen on Android WebView
      const stream = await getCameraStream(false);
      if (!stream) {
        throw new Error('Failed to get camera stream');
      }
      
      setFaceStream(stream);
      attachFacePreviewStream(stream);
    } catch (error: any) {
      console.error('Face camera error:', error);
      recordClientError({ label: "FaceVerification.stream", message: error instanceof Error ? error.message : String(error) });
      setNativeFaceCameraActive(false);
      toast({
        title: "Camera access failed",
        description: error.message || "Please grant camera permission from settings.",
        variant: "destructive",
      });
    }
  }, [faceStream, toast, getCameraStream, attachFacePreviewStream, nativeFaceCam, setNativeFaceCameraActive]);
  
  useEffect(() => {
    if (faceStream) {
      attachFacePreviewStream(faceStream);
    }
  }, [faceStream, attachFacePreviewStream]);

  // Call face-check API to get real pose data
  const checkFacePose = async (imageBase64: string): Promise<{faceDetected: boolean, pose: {yaw: number, pitch: number, roll: number}, eyesOpen: boolean} | null> => {
    try {
      const response = await supabase.functions.invoke('face-check', {
        body: { imageBase64, streamId: 'face-verification' },
      });
      if (response.error || !response.data) return null;
      return {
        faceDetected: response.data.faceDetected,
        pose: response.data.pose || { yaw: 0, pitch: 0, roll: 0 },
        eyesOpen: response.data.eyesOpen,
      };
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
    if (!cameraReady || (!usingNativeFaceCameraRef.current && !faceStream)) {
      toast({ title: "Camera not ready", description: "Please wait...", variant: "destructive" });
      return;
    }

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
      horizontalFirstTurnSignRef.current = null;
      verticalFirstTiltSignRef.current = null;
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
        let nativeFrameReady = false;
        for (let i = 0; i < 6; i++) {
          const warmupFrame = await captureFaceFrameBase64(720);
          if (warmupFrame) {
            capturedAnglesRef.current.center = capturedAnglesRef.current.center || warmupFrame;
            nativeFrameReady = true;
            break;
          }
          await new Promise(resolve => setTimeout(resolve, 250));
        }
        if (!nativeFrameReady) throw new Error('Native camera frame is not ready yet. Please try again.');
        await nativeFaceCam.startRecording();
        nativeFaceRecordingRef.current = true;
      } else {
        const webFaceStream = faceStream;
        if (!webFaceStream) throw new Error('Camera stream is not ready');
        const mimeType = MediaRecorder.isTypeSupported('video/mp4')
          ? 'video/mp4'
          : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
            ? 'video/webm;codecs=vp8,opus'
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
      }
      
      // Overall verification window: 3 essential liveness poses × stepWindowSec,
      // padded for calibration/capture latency. This avoids users getting stuck
      // on fragile up/down pitch detection while still capturing front/left/right
      // images for Rekognition + manual admin review.
      const calib = calibrationRef.current;
      const overallSec = Math.min(75, Math.max(35,
        Math.round(calib.stepWindowSec * faceInstructions.length + 10)
      ));
      let elapsed = 0;
      timerRef.current = setInterval(() => {
        elapsed++;
        setVerificationTime(elapsed);
        if (elapsed >= overallSec) {
          const allDone = instructionsCompletedRef.current.every(Boolean);
          const partialDone = instructionsCompletedRef.current.filter(Boolean).length >= 2;
          pushDebug({
            kind: 'timeout',
            elapsedSec: elapsed,
            overallSec,
            stepsCompleted: [...instructionsCompletedRef.current],
            stuckOnStep: currentInstructionRef.current,
            stuckOnInstruction: faceInstructions[currentInstructionRef.current]?.id,
          });
          finishVerification(allDone || partialDone, !allDone && partialDone);
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
    }
  };

  const evaluateAdaptivePose = (
    instrId: string,
    pose: { yaw: number; pitch: number },
    c: PoseCalibration,
  ): boolean => {
    const dy = pose.yaw - c.baselineYaw;
    const dp = pose.pitch - c.baselinePitch;
    if (instrId === 'left') return (horizontalFirstTurnSignRef.current ?? 1) * dy > c.turnYaw;
    if (instrId === 'right') return -(horizontalFirstTurnSignRef.current ?? 1) * dy > c.turnYaw;
    return evaluatePose(instrId, pose, c);
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
      case 'center': {
        const progress = clamp(1 - Math.max(ady / c.centerYaw, adp / c.centerPitch));
        if (ady < c.centerYaw && adp < c.centerPitch)
          return { hint: 'Hold steady — looks great', severity: 'ok', progress: 1 };
        if (ady >= c.centerYaw)
          return { hint: `Face the camera straight (turn ${dy > 0 ? 'right' : 'left'} ~${Math.round(ady - c.centerYaw + 4)}°)`, severity: 'warn', progress };
        return { hint: `Level your head (tilt ${dp > 0 ? 'up' : 'down'} ~${Math.round(adp - c.centerPitch + 4)}°)`, severity: 'warn', progress };
      }
      case 'left': {
        const signedDy = (horizontalFirstTurnSignRef.current ?? 1) * dy;
        const progress = clamp(signedDy / (c.turnYaw + 6));
        if (signedDy > c.turnYaw) return { hint: 'Hold — capturing left angle', severity: 'ok', progress: 1 };
        return { hint: horizontalFirstTurnSignRef.current == null ? 'Turn your head left slowly' : `Turn ~${Math.round(Math.max(c.turnYaw - signedDy, 0) + 4)}° more to your left`, severity: 'warn', progress };
      }
      case 'right': {
        const signedDy = -(horizontalFirstTurnSignRef.current ?? 1) * dy;
        const progress = clamp(signedDy / (c.turnYaw + 6));
        if (signedDy > c.turnYaw) return { hint: 'Hold — capturing right angle', severity: 'ok', progress: 1 };
        return { hint: horizontalFirstTurnSignRef.current == null ? 'Turn your head right slowly' : `Turn ~${Math.round(Math.max(c.turnYaw - signedDy, 0) + 4)}° more to your right`, severity: 'warn', progress };
      }
      default:
        return { hint: 'Follow the on-screen instruction', severity: 'warn', progress: 0 };
    }
  };

  // Real pose checking - captures frame & sends to face-check API
  const startRealPoseChecking = () => {
    let consecutiveFails = 0;
    // Reset calibration sampler. We collect ~10 samples (≈2s @ 200ms / ≈2.5s
    // @ 250ms — we sample faster than the main loop) of the user's natural
    // pose before scoring any step.
    calibSamplesRef.current = [];
    setCalibrating(true);
    const CALIB_TARGET = 8;
    
    poseCheckIntervalRef.current = setInterval(async () => {
      if (!usingNativeFaceCameraRef.current && !faceVideoRef.current) return;
      
      const frameBase64 = await captureFaceFrameBase64();
      if (!frameBase64) return;
      
      setScanningStatus('scanning');
      
      const result = await checkFacePose(frameBase64);
      
      if (!result || !result.faceDetected) {
        consecutiveFails++;
        consecutiveFailsRef.current = consecutiveFails;
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
        if (consecutiveFails >= 15) {
          const fallbackFrame = await captureFaceFrameBase64(720);
          if (fallbackFrame && !capturedAnglesRef.current.center) capturedAnglesRef.current.center = fallbackFrame;
          pushDebug({ kind: 'finish', success: true, manualReviewRequired: true, reason: 'pose_api_or_face_detect_failed_open_to_admin' });
          finishVerification(true, true);
        }
        return;
      }
      
      consecutiveFails = 0;
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
          hint: `Calibrating for your camera… (${filled}/${CALIB_TARGET})`,
          severity: 'warn',
        });
        if (filled === CALIB_TARGET) {
          const calib = calibrateThresholds(calibSamplesRef.current);
          calibrationRef.current = calib;
          saveCalibration(calib);
          setCalibrating(false);
          console.log('[FaceVerify] calibration', calib);
          pushDebug({ kind: 'calib_done', calibration: { ...calib }, samples: calibSamplesRef.current.length });
        }
        return;
      }

      // Track pose history for anti-spoof (photos have zero variance)
      poseHistoryRef.current = [...poseHistoryRef.current.slice(-20), { yaw: pose.yaw, pitch: pose.pitch }];
      
      // Check current instruction using LIVE calibration
      const calib = calibrationRef.current;
      const instrIdx = currentInstructionRef.current;
      const instruction = faceInstructions[instrIdx];
      
      if (instruction && !instructionsCompletedRef.current[instrIdx]) {
        const dy = pose.yaw - calib.baselineYaw;
        const dp = pose.pitch - calib.baselinePitch;
        if (instruction.id === 'left' && horizontalFirstTurnSignRef.current == null && Math.abs(dy) > 6) {
          horizontalFirstTurnSignRef.current = Math.sign(dy) || 1;
        }
        const passed = evaluateAdaptivePose(instruction.id, pose, calib);
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
          if (instruction.id === 'center' || instruction.id === 'left' || instruction.id === 'right') {
            const angleKey = instruction.id as 'center' | 'left' | 'right';
            if (!capturedAnglesRef.current[angleKey]) {
              const stillFrame = await captureFaceFrameBase64(720);
              if (stillFrame) capturedAnglesRef.current[angleKey] = stillFrame;
            }
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
    }, 1000); // Poll every 1s — faster lock-on without overloading Rekognition
  };

  // Finish verification
  const finishVerification = async (success: boolean, manualReviewRequired = false) => {
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
        success = false;
        pushDebug({ kind: 'error', message: 'native_recording_empty_or_missing' });
      }
    } else if (faceRecorderRef.current && faceRecorderRef.current.state === 'recording') {
      faceRecorderRef.current.stop();
    }
    
    setVerificationRecording(false);
    setScanningStatus('idle');
    
    if (success) {
      // Anti-spoof check: verify pose variance (photos have near-zero variance)
      const collectedPoseHistory = poseHistoryRef.current;
      if (collectedPoseHistory.length >= 3) {
        const yaws = collectedPoseHistory.map(p => p.yaw);
        const pitches = collectedPoseHistory.map(p => p.pitch);
        const yawVariance = Math.max(...yaws) - Math.min(...yaws);
        const pitchVariance = Math.max(...pitches) - Math.min(...pitches);
        
        if (yawVariance < 5 && pitchVariance < 5) {
          // Suspiciously static — likely a photo
          console.log('[FaceVerify] ⚠️ Anti-spoof: pose too static, likely photo');
          pushDebug({ kind: 'antispoof_fail', yawVariance, pitchVariance, samples: collectedPoseHistory.length });
          setFaceManualReviewRequired(true);
          setFaceVerified(true);
          buildAndStoreDebugReport('antispoof');
          toast({
            title: "Manual Review Required",
            description: "The scan was captured, but AI could not safely auto-approve it. Admin will review it manually.",
          });
          return;
        }
      }
      
      pushDebug({ kind: 'finish', success: true });
      setFaceVerified(true);
      setFaceManualReviewRequired(manualReviewRequired);
      toast({
        title: manualReviewRequired ? "Manual Review Ready" : localizedMsg.success,
        description: manualReviewRequired ? "Enough liveness data was captured. Submit it for admin review." : localizedMsg.successDesc,
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
    if (usingNativeFaceCameraRef.current) {
      nativeFaceCam.stopPreview().catch(() => null);
      nativeFaceRecordingRef.current = false;
      setNativeFaceCameraActive(false);
    }
    if (faceStream) {
      faceStream.getTracks().forEach(track => track.stop());
      setFaceStream(null);
    }
    setCameraReady(false);
    resetVerification();
  };

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
    
    const { data: { publicUrl } } = supabase.storage
      .from('face-verification')
      .getPublicUrl(fileName);
    
    return publicUrl;
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

  // Upload the 3 captured angle stills (front/left/right) for AWS Rekognition auto-approve.
  // Returns { front_url, left_url, right_url } — all three are required for auto-finalize.
  const uploadCapturedAngles = async (): Promise<{ front_url?: string; left_url?: string; right_url?: string }> => {
    const out: { front_url?: string; left_url?: string; right_url?: string } = {};
    const fallbackCenter = capturedAnglesRef.current.center || await captureFaceFrameBase64(720);
    if (fallbackCenter && !capturedAnglesRef.current.center) capturedAnglesRef.current.center = fallbackCenter;
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

  // Trigger AWS Rekognition analyze (DetectFaces + CompareFaces front-vs-left/right)
  // which writes ai_analysis.rekognition + (when app_settings allow) auto-finalizes the
  // submission via service_auto_finalize_face_verification (gender, is_host, status).
  const triggerRekognitionAutoApprove = async (submissionId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('face-verification-analyze', {
        body: { submissionId },
      });
      if (error) {
        console.warn('[FaceVerification] face-verification-analyze error:', error);
        return null;
      }
      console.log('[FaceVerification] Rekognition analyze result:', data);
      return data as {
        ok?: boolean;
        autoFinalize?: { success?: boolean; gender?: string; expected_gender?: string; verification_type?: string; reason?: string } | null;
        blocker?: 'gender_mismatch' | 'liveness_failed' | 'replay_suspected' | 'profile_face_mismatch' | 'duplicate_face' | null;
        declaredGender?: string | null;
        expectedGender?: string | null;
        detectedGender?: string | null;
      };
    } catch (err) {
      console.warn('[FaceVerification] face-verification-analyze invoke threw:', err);
      return null;
    }
  };

  // If the edge function returned a hard `blocker`, show a blocking dialog
  // (English only, per app convention) and route the user to support. Returns
  // true when the user was routed so the caller can short-circuit normal flow.
  const handleVerificationBlocker = (
    result: Awaited<ReturnType<typeof triggerRekognitionAutoApprove>>,
  ): boolean => {
    const blocker = result?.blocker;
    if (!blocker) return false;
    const declared = result?.declaredGender ?? result?.expectedGender ?? 'unknown';
    const detected = result?.detectedGender ?? 'unknown';
    const messages: Record<string, { title: string; body: string }> = {
      gender_mismatch: {
        title: '❌ Gender Mismatch Detected',
        body: `Your account is registered as "${declared}", but our AI detected your face as "${detected}". You cannot complete verification on this account. Please open a support ticket — our team will help you correct your account.`,
      },
      liveness_failed: {
        title: '❌ Liveness Check Failed',
        body: 'Our system detected that the verification was performed using a photo or recorded video instead of your real, live face. Please open a support ticket so our team can review your case.',
      },
      replay_suspected: {
        title: '❌ Replay / Static Image Detected',
        body: 'Your three angle captures showed almost no head movement — this looks like a phone screen, printed photo or static image instead of a live person. Please open a support ticket for assistance.',
      },
      profile_face_mismatch: {
        title: '❌ Profile Photo Does Not Match',
        body: 'The face in your verification selfie does not match the photo on your profile. Please open a support ticket so we can verify your identity manually.',
      },
      duplicate_face: {
        title: '❌ Duplicate Account Detected',
        body: 'This face is already verified on another account. You cannot verify the same face on multiple accounts. Please open a support ticket if you believe this is an error.',
      },
    };
    const { title, body } = messages[blocker];
    toast({ title, description: body, variant: 'destructive' });
    // Persist the blocker reason so the support page can pre-fill the ticket.
    try {
      sessionStorage.setItem('verification_blocker', JSON.stringify({
        blocker, declared, detected, at: Date.now(),
      }));
    } catch { /* noop */ }
    setTimeout(() => navigate('/settings/customer-service'), 600);
    return true;
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
    if (!faceVerified || !faceVerificationVideo) {
      toast({ title: "Error", description: "Please complete face verification first", variant: "destructive" });
      return;
    }

    // ★ STRICT: Validate video blob has actual content (prevents empty uploads)
    if (faceVerificationVideo.size < 10000) {
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
    
    setLoading(true);
    
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
      if (profilePhotoUrl) {
        await supabase.from('profiles').update({ avatar_url: profilePhotoUrl }).eq('id', userId);
      }

      // CRITICAL: Check for existing pending/approved submission before inserting
      const { data: existingSubmission } = await supabase
        .from('face_verification_submissions')
        .select('id, status')
        .eq('user_id', userId)
        .in('status', ['pending','submitted'])
        .maybeSingle();

      if (existingSubmission) {
        toast({
          title: "Already Submitted",
          description: "Your verification is already under review. Please wait for admin approval.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      // CRITICAL: Generate face hash and check for duplicate face BEFORE submission
      const faceHash = await generateFaceHash(faceVerificationVideo);
      
      try {
        const { data: faceData } = await supabase.rpc('find_account_by_face', {
          face_hash_param: faceHash
        });
        
        if (faceData && faceData.length > 0 && faceData[0].user_id !== userId) {
          const existingName = faceData[0].display_name || 'Unknown';
          console.log('[FaceVerification] 🚫 Duplicate face detected for USER, PERMANENT-BAN. Existing:', faceData[0].user_id);
          toast({
            title: "⚠️ Duplicate Account Detected",
            description: `This face is already registered with another account (${existingName}). This account will now be permanently banned.`,
            variant: "destructive",
          });
          await enforceDuplicateFaceBan(faceData[0]);
          setLoading(false);
          return;
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

      // Upload 3-angle stills (front/left/right) captured live for AWS Rekognition auto-approve
      const angleUrls = await uploadCapturedAngles();

      // Insert submission with ALL user info (name, age, language, photo) + 3 angles
      const { data: submissionData, error: submissionError } = await supabase
        .from('face_verification_submissions')
        .insert({
          user_id: userId,
          verification_type: 'face',
          status: 'submitted', // ★ 'submitted' so service_auto_finalize_face_verification can pick it up
          admin_notes: faceManualReviewRequired ? 'Manual review required: liveness captured but AI/pose detection could not safely auto-approve.' : null,
          ai_analysis: faceManualReviewRequired ? { manual_review_required: true, reason: 'client_pose_partial_or_antispoof_uncertain' } : null,
          face_image_url: videoUrl,
          selfie_url: angleUrls.front_url || videoUrl || 'pending://no-image',
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

      // ★ AUTO-APPROVE via AWS Rekognition: DetectFaces (gender) + CompareFaces (front-vs-left/right)
      // → service_auto_finalize_face_verification handles gender swap + is_host + status='approved'.
      let autoApproved = false;
      let autoMessage = "Your verification has been submitted. Admin will review and approve your account.";
      if (submissionData?.id && angleUrls.front_url && angleUrls.left_url && angleUrls.right_url) {
        const result = await triggerRekognitionAutoApprove(submissionData.id);
        // Hard blockers (gender/liveness/replay/profile/duplicate) → support ticket flow.
        if (handleVerificationBlocker(result)) { setLoading(false); return; }
        if (result?.autoFinalize?.success) {
          autoApproved = true;
          autoMessage = "🎉 Auto-approved! Your account is verified.";
        }
      }


      toast({
        title: autoApproved ? "✅ Auto-Approved!" : "✅ Submission Successful!",
        description: autoApproved ? autoMessage : faceManualReviewRequired ? "Your verification is in admin manual review." : autoMessage,
      });
      navigate('/profile');
      return;
      
    } catch (error: any) {
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
    if (faceVerificationVideo && faceVerificationVideo.size < 10000) {
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
    
    setLoading(true);
    
    try {
      // Generate face hash and check for existing account
      const faceHash = await generateFaceHash(faceVerificationVideo);
      
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
          console.log('[FaceVerification] 🚫 Duplicate face detected, PERMANENT-BAN. Existing account:', duplicateFaceUserId);
          
          toast({
            title: "⚠️ Duplicate Account Detected",
            description: `This face is already registered with another account (${duplicateFaceName}). This account will now be permanently banned.`,
            variant: "destructive",
          });
          await enforceDuplicateFaceBan(faceData[0]);
          setLoading(false);
          return;
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
      
      // Save face hash to profile
      await supabase
        .from('profiles')
        .update({ face_hash: faceHash })
        .eq('id', userId);
      
      // CRITICAL: Check for existing pending submission before inserting
      const { data: existingSubmission } = await supabase
        .from('face_verification_submissions')
        .select('id, status')
        .eq('user_id', userId)
        .in('status', ['pending','submitted'])
        .maybeSingle();

      if (existingSubmission) {
        toast({
          title: "Already Submitted",
          description: "Your verification is already under review. Please wait for admin approval.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }
      
      // Upload 3-angle stills (front/left/right) captured live for AWS Rekognition auto-approve
      const angleUrls = await uploadCapturedAngles();

      // Insert submission with submitted status (auto-approve pipeline)
      const { data: submissionData, error: submissionError } = await supabase
        .from('face_verification_submissions')
        .insert({
          user_id: userId,
          verification_type: 'host',
          status: 'submitted', // ★ 'submitted' so service_auto_finalize_face_verification can pick it up
          admin_notes: faceManualReviewRequired ? 'Manual review required: liveness captured but AI/pose detection could not safely auto-approve.' : null,
          ai_analysis: faceManualReviewRequired ? { manual_review_required: true, reason: 'client_pose_partial_or_antispoof_uncertain' } : null,
          full_name: fullName,
          age: parseInt(age),
          language: language,
          profile_photo_url: profilePhotoUrl,
          video_url: introVideoUrl,
          host_photos: photoUrls,
          face_image_url: faceVideoUrl,
          selfie_url: angleUrls.front_url || faceVideoUrl || 'pending://no-image',
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

      // ★ AUTO-APPROVE via AWS Rekognition: DetectFaces (gender) + CompareFaces (front-vs-left/right)
      // → service_auto_finalize_face_verification handles gender swap + is_host=true + status='approved'.
      let autoApproved = false;
      let autoMessage = "Your host verification has been submitted. Admin will review all your information and approve.";
      if (submissionData?.id && angleUrls.front_url && angleUrls.left_url && angleUrls.right_url) {
        const result = await triggerRekognitionAutoApprove(submissionData.id);
        // Hard blockers (gender/liveness/replay/profile/duplicate) → support ticket flow.
        if (handleVerificationBlocker(result)) { setLoading(false); return; }
        if (result?.autoFinalize?.success) {
          autoApproved = true;
          autoMessage = "🎉 Auto-approved as Host! Welcome to the platform.";
        }
      }


      toast({
        title: autoApproved ? "✅ Auto-Approved!" : "✅ Host Application Submitted!",
        description: autoApproved ? autoMessage : faceManualReviewRequired ? "Your host verification is in admin manual review." : autoMessage,
      });
      navigate('/profile');
      return;
      
      navigate('/profile');
      
    } catch (error: any) {
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
    const faceCameraActive = !!faceStream || usingNativeFaceCamera;
    const completedCount = instructionsCompleted.filter(Boolean).length;
    const progressPercent = (completedCount / faceInstructions.length) * 100;
    const borderColor = scanningStatus === 'pass' ? '#22c55e' : scanningStatus === 'fail' ? '#ef4444' : scanningStatus === 'scanning' ? '#eab308' : '#a855f7';
    const completeFromPartialScan = () => {
      const completed = instructionsCompletedRef.current.filter(Boolean).length;
      if (completed < 2 || (!usingNativeFaceCameraRef.current && !faceChunksRef.current.length)) {
        toast({ title: 'Keep scanning', description: 'Complete at least forward + one side angle before manual review.', variant: 'destructive' });
        return;
      }
      finishVerification(true, true);
    };

    return (
    <div className={`${usingNativeFaceCamera ? 'bg-background/20 backdrop-blur-[2px]' : 'bg-white'} rounded-3xl p-5 border border-slate-200 shadow-[0_8px_30px_-12px_rgba(15,23,42,0.18)]`}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative">
          <div className="w-12 h-12 rounded-2xl bg-slate-900 flex items-center justify-center shadow-lg shadow-slate-900/20 ring-1 ring-slate-200">
            <ScanFace className="w-6 h-6 text-white" />
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
            {verificationRecording ? `Step ${currentInstruction + 1} of ${faceInstructions.length} · Bank-grade liveness check` : 'AI-powered identity verification'}
          </p>
        </div>
      </div>

      {/* Progress Bar */}
      {verificationRecording && (
        <div className="mb-4">
          <div className="flex justify-between text-xs text-slate-500 mb-1.5">
            <span className="font-medium">Liveness Progress</span>
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
      <div className={`relative aspect-[3/4] w-full max-w-sm mx-auto rounded-3xl overflow-hidden mb-5 shadow-2xl ${usingNativeFaceCamera ? 'bg-transparent' : 'bg-white/80'}`}>
        {!faceCameraActive && !faceVerified ? (
          <div className="w-full h-full flex flex-col items-center justify-center p-6 bg-gradient-to-br from-slate-50 to-white">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="relative w-32 h-32 mb-6"
            >
              <motion.div
                className="absolute inset-0 rounded-full border-2 border-slate-300/60"
                animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.15, 0.5] }}
                transition={{ duration: 2.2, repeat: Infinity }}
              />
              <motion.div
                className="absolute inset-2 rounded-full border-2 border-slate-400/50"
                animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0.1, 0.4] }}
                transition={{ duration: 2.2, repeat: Infinity, delay: 0.3 }}
              />
              <div className="absolute inset-4 rounded-full bg-slate-900 flex items-center justify-center shadow-xl shadow-slate-900/20">
                <ScanFace className="w-12 h-12 text-white" />
              </div>
            </motion.div>
            <p className="text-slate-900 text-center font-semibold mb-1 text-base">Ready to Scan</p>
            <p className="text-slate-500 text-xs text-center max-w-[220px] leading-relaxed">Position your face inside the oval and follow each on-screen instruction</p>
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
                className="w-full h-full object-cover scale-x-[-1]"
                onLoadedMetadata={() => setCameraReady(true)}
                onCanPlay={() => setCameraReady(true)}
                onPlaying={() => setCameraReady(true)}
                style={{ backgroundColor: '#000' }}
              />
            )}
            
            {/* Loading overlay */}
            {faceCameraActive && !cameraReady && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/80">
                <div className="flex flex-col items-center">
                  <Loader2 className="w-12 h-12 text-cyan-600 animate-spin mb-2" />
                  <p className="text-slate-600 text-sm">Initializing camera...</p>
                </div>
              </div>
            )}
            
            {/* Face oval guide with dynamic border color */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              {/* Dark overlay outside oval */}
              <div className="absolute inset-0" style={{
                background: 'radial-gradient(ellipse 55% 45% at 50% 45%, transparent 100%, rgba(0,0,0,0.7) 100%)',
              }} />
              
              {/* Animated oval border */}
              <motion.div 
                className="relative"
                style={{ width: '70%', height: '60%' }}
              >
                <svg viewBox="0 0 200 260" className="w-full h-full" style={{ filter: `drop-shadow(0 0 10px ${borderColor}40)` }}>
                  <ellipse cx="100" cy="130" rx="85" ry="115" fill="none" 
                    stroke={borderColor} strokeWidth="3" strokeDasharray={verificationRecording ? "8 4" : "none"} 
                    opacity="0.8"
                  />
                  {/* Scanning line animation */}
                  {verificationRecording && scanningStatus === 'scanning' && (
                    <motion.line
                      x1="20" x2="180" stroke="#22d3ee" strokeWidth="2" opacity="0.6"
                      initial={{ y1: 30, y2: 30 }}
                      animate={{ y1: [30, 230, 30], y2: [30, 230, 30] }}
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
                  className="absolute top-3 left-3 right-3"
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
                          {faceInstructions[currentInstruction]?.direction}
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
                className="absolute left-3 right-3 bottom-3 pointer-events-auto max-h-[30%] overflow-y-auto"
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
                      {liveDiag.hint}
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
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-medium">
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
                    className="mt-2 w-full flex items-center justify-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900 py-1 rounded-md hover:bg-slate-100/60"
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
              <div className="absolute bottom-3 left-3 right-3">
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
                    <span className="text-slate-700 text-xs font-semibold">
                      · Step {currentInstruction + 1}/{faceInstructions.length}: {faceInstructions[currentInstruction]?.direction}
                    </span>
                  </div>
                  <span className="text-slate-800 font-mono font-bold text-sm">{Math.max(0, Math.min(75, Math.max(35, Math.round(calibrationRef.current.stepWindowSec * faceInstructions.length + 10))) - verificationTime)}s</span>
                </div>
              </div>
            )}
            
            {/* Verification failed overlay */}
            {verificationFailed && (
              <div className="absolute inset-0 bg-white/80 flex flex-col items-center justify-center backdrop-blur-sm">
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
        <Button
          className="w-full h-14 bg-slate-900 hover:bg-slate-800 rounded-2xl text-base font-semibold shadow-lg shadow-slate-900/20 text-white"
          onClick={startFaceCamera}
        >
          <ScanFace className="w-5 h-5 mr-2.5" />
          {localizedMsg.startScan}
        </Button>
      )}

      {faceCameraActive && !verificationStarted && !faceVerified && (
        <div className="space-y-3">
          <Button
            className="w-full h-14 bg-emerald-600 hover:bg-emerald-700 rounded-2xl text-base font-semibold shadow-lg shadow-emerald-600/25 text-white"
            onClick={startFaceVerification}
            disabled={!cameraReady}
          >
            {!cameraReady ? (
              <>
                <Loader2 className="w-5 h-5 mr-2.5 animate-spin" />
                Initializing camera…
              </>
            ) : (
              <>
                <Play className="w-5 h-5 mr-2.5" />
                {localizedMsg.beginCheck}
              </>
            )}
          </Button>

          <Button
            variant="outline"
            className="w-full h-11 rounded-xl border-slate-300 bg-white text-slate-800 hover:bg-slate-50 hover:text-slate-900 text-sm font-semibold leading-5 shadow-sm"
            onClick={runNeutralCalibration}
            disabled={!cameraReady || neutralCalibrating}
          >
            {neutralCalibrating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Calibrating… {Math.round(neutralProgress * 100)}%
              </>
            ) : (
              <>
                <ScanFace className="w-4 h-4 mr-2 text-slate-700" />
                {neutralCalib && neutralCalib.capturedAt > 0 ? 'Recalibrate neutral pose' : 'Calibrate neutral pose (3s)'}
              </>
            )}
          </Button>
          {neutralCalib && neutralCalib.capturedAt > 0 && !neutralCalibrating && (
            <p className="text-[11px] text-center text-slate-700 leading-5 font-medium">
              Tuned for you · baseline {neutralCalib.baselineYaw.toFixed(1)}° / {neutralCalib.baselinePitch.toFixed(1)}° ·
              turn ±{neutralCalib.turnYaw.toFixed(0)}°
            </p>
          )}
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
        <div className="space-y-2">
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
          className="w-full h-14 bg-gradient-to-r from-green-600 to-emerald-600 rounded-2xl text-lg font-bold shadow-lg shadow-green-500/20"
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

  if (loading) {
    return <LoadingSpinner fullScreen />;
  }

  // Check if rejection is because female host tried to open user ID
  const isContactSupportRequired = rejectionReason?.includes('Support Chat') || rejectionReason?.includes('contact us');

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
        <div className={`fixed inset-0 flex flex-col ${usingNativeFaceCamera ? 'bg-transparent' : 'bg-gradient-to-b from-[#FFFBF2] via-[#FAF5EA] to-[#FFFBF2]'} overflow-hidden`}><div className="flex-1 overflow-y-auto overscroll-contain p-4" style={{ WebkitOverflowScrolling: "touch", paddingBottom: "var(--content-bottom-padding)" }}>
        {renderHeader("Face Verification", "Identity check required")}
        <div className="flex flex-col items-center justify-center mt-12">
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring" }}
            className="w-28 h-28 rounded-full bg-gradient-to-r from-red-400 to-rose-500 flex items-center justify-center mb-4 shadow-2xl shadow-red-500/20">
            <XCircle className="w-14 h-14 text-white" />
          </motion.div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Verification Rejected</h2>
          {rejectionReason && (
            <p className="text-red-700 bg-red-50 border border-red-200 rounded-xl mx-6 px-4 py-2 text-center mb-2 text-sm">Reason: {rejectionReason}</p>
          )}
          
          {isContactSupportRequired ? (
            <>
              <p className="text-slate-500 text-center px-6 mb-4">To resolve this issue, please contact our Support Team.</p>
              <Button
                className="mt-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl px-8 shadow-lg shadow-blue-500/20"
                onClick={() => navigate('/support')}
              >
                💬 Support Chat
              </Button>
              <Button variant="ghost" className="mt-3 text-slate-500" onClick={() => navigate('/profile')}>
                Back to Profile
              </Button>
            </>
          ) : (
            <>
              <p className="text-slate-500 text-center px-6 mb-4">Your previous verification was rejected. Please try again with a clear face photo/video.</p>
              <Button
                className="mt-6 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl px-8 shadow-lg shadow-purple-500/20"
                onClick={async () => {
                  setPhotoFile(null); setPhotoPreview(null); setUserPhotoFile(null); setUserPhotoPreview(null);
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
              <p className="text-slate-600 text-xs text-center mt-3 px-8">
                Please ensure good lighting and remove any face coverings before retrying.
              </p>
            </>
          )}
        </div>
      </div>
      </div>
    );
  }

  // Already submitted - pending review
  if (verificationStatus === 'submitted') {
    return (
      <div className={`fixed inset-0 flex flex-col ${usingNativeFaceCamera ? 'bg-transparent' : 'bg-gradient-to-b from-[#FFFBF2] via-[#FAF5EA] to-[#FFFBF2]'} overflow-hidden`}><div className="flex-1 overflow-y-auto overscroll-contain p-4" style={{ WebkitOverflowScrolling: "touch", paddingBottom: "var(--content-bottom-padding)" }}>
        {renderHeader("Face Verification", "Identity check required")}
        <div className="flex flex-col items-center justify-center mt-12">
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring" }}
            className="w-28 h-28 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 flex items-center justify-center mb-4 shadow-2xl shadow-amber-500/20">
            <Loader2 className="w-14 h-14 text-white animate-spin" />
          </motion.div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Under Review</h2>
          <p className="text-slate-600 text-center px-6">Your face verification has already been submitted and is pending admin review. Please wait for approval.</p>
          <Button className="mt-6 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl px-8 shadow-lg shadow-purple-500/20" onClick={() => navigate('/profile')}>
            Back to Profile
          </Button>
        </div>
      </div>
      </div>
    );
  }

  // Already verified
  if (verificationStatus === 'verified') {
    return (
      <div className={`fixed inset-0 flex flex-col ${usingNativeFaceCamera ? 'bg-transparent' : 'bg-gradient-to-b from-[#FFFBF2] via-[#FAF5EA] to-[#FFFBF2]'} overflow-hidden`}><div className="flex-1 overflow-y-auto overscroll-contain p-4" style={{ WebkitOverflowScrolling: "touch", paddingBottom: "var(--content-bottom-padding)" }}>
        {renderHeader("Face Verification", "Identity check required")}
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
    const userCurrentStep = userPhotoStep ? (fullName.trim() && age && parseInt(age) >= 18 && language ? 2 : 1) : 3;

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
      // Move to photo step - userPhotoStep=true means we're on photo step now
      setUserPhotoStep(true);
    };

    // Determine which user step to show
    // We repurpose: currentStep=1 for info, userPhotoStep=true & info done for photo, userPhotoStep=false for face
    const userInfoDone = fullName.trim() && age && parseInt(age) >= 18 && language;
    const showUserInfoStep = !userInfoDone || (userPhotoStep && !userPhotoFile);
    const showUserPhotoStep = userInfoDone && userPhotoStep;
    const showUserFaceStep = !userPhotoStep;

    return (
      <div className="fixed inset-0 flex flex-col bg-gradient-to-b from-[#FFFBF2] via-[#FAF5EA] to-[#FFFBF2] overflow-hidden"><div className="flex-1 overflow-y-auto overscroll-contain p-4" style={{ WebkitOverflowScrolling: "touch", paddingBottom: "var(--content-bottom-padding)" }}>
        {renderHeader("Face Verification", "Verify your identity")}

        {/* Progress Steps - 3 steps */}
        <div className="flex items-center justify-center gap-3 mb-6">
          {[1, 2, 3].map((step) => {
            const isActive = (!userInfoDone && step === 1) || (userInfoDone && userPhotoStep && step === 2) || (!userPhotoStep && step === 3);
            const isDone = (step === 1 && userInfoDone) || (step === 2 && !userPhotoStep && userPhotoFile);
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
        {!userInfoDone && (
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
              disabled={!fullName.trim() || !age || parseInt(age || "0", 10) < 18 || !language}
            >
              Next
            </Button>
          </motion.div>
        )}

        {/* Step 2: Profile Photo */}
        {userInfoDone && userPhotoStep && (
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
                    <img src={userPhotoPreview} alt="Profile" className="w-full h-full object-cover" />
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

            <Button variant="ghost" className="w-full text-slate-500" onClick={() => { setFullName(""); setAge(""); setLanguage(""); }}>
              ← Back to Info
            </Button>
          </motion.div>
        )}

        {/* Step 3: Face Verification */}
        {!userPhotoStep && (
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
    <div className={`fixed inset-0 flex flex-col ${usingNativeFaceCamera ? 'bg-transparent' : 'bg-gradient-to-b from-[#FFFBF2] via-[#FAF5EA] to-[#FFFBF2]'} overflow-hidden`}><div className="flex-1 overflow-y-auto overscroll-contain p-4" style={{ WebkitOverflowScrolling: "touch", paddingBottom: "var(--content-bottom-padding)" }}>
      {renderHeader("Host Verification", "Get verified as a host")}
      
      {/* Progress Steps — professional KYC-style indicator */}
      <div className="mb-8 px-1">
        <div className="flex items-center justify-between">
          {[
            { n: 1, label: 'Basic Info' },
            { n: 2, label: 'Photos & Video' },
            { n: 3, label: 'Live Face Scan' },
          ].map((s, idx) => {
            const done = currentStep > s.n;
            const active = currentStep === s.n;
            return (
              <div key={s.n} className="flex items-center flex-1">
                <div className="flex flex-col items-center gap-1.5">
                  <motion.div
                    className={`relative w-11 h-11 rounded-full flex items-center justify-center font-semibold text-sm transition-colors ${
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
                  <span className={`text-[10px] font-medium tracking-tight whitespace-nowrap ${
                    active ? 'text-slate-900' : done ? 'text-emerald-700' : 'text-slate-400'
                  }`}>{s.label}</span>
                </div>
                {idx < 2 && (
                  <div className="flex-1 h-[2px] mx-2 mt-[-18px] rounded-full bg-slate-200 overflow-hidden">
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
          <div className="bg-white rounded-3xl p-5 border border-purple-200 shadow-lg shadow-purple-500/5">
            <h2 className="font-bold text-slate-900 mb-5 flex items-center gap-3 text-lg">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-md shadow-purple-500/30">
                <User className="w-5 h-5 text-white" />
              </div>
              Basic Information
            </h2>
            
            {/* Profile Photo */}
            <div className="flex flex-col items-center mb-5">
              <div 
                className="w-28 h-28 rounded-3xl bg-purple-50 border-2 border-dashed border-purple-300 flex items-center justify-center cursor-pointer hover:bg-purple-100 transition overflow-hidden shadow-md"
                onClick={() => photoInputRef.current?.click()}
              >
                {photoPreview ? (
                  <img src={photoPreview} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <Camera className="w-10 h-10 text-purple-500" />
                )}
              </div>
              <input 
                ref={photoInputRef}
                type="file" 
                accept="image/*" 
                className="hidden" 
                onChange={handlePhotoSelect}
              />
              <p className="text-xs text-slate-600 mt-2">Upload profile photo</p>
            </div>
            
            <div className="space-y-4">
              <div>
                <Label className="text-slate-700 text-sm font-semibold">Full Name</Label>
                <Input
                  placeholder="Enter your name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 mt-1.5 h-12 rounded-xl focus:border-purple-400 focus:ring-1 focus:ring-purple-400"
                />
              </div>
              
              <div>
                <Label className="text-slate-700 text-sm font-semibold">Age</Label>
                <Input
                  type="number"
                  placeholder="18+"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  className="bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 mt-1.5 h-12 rounded-xl focus:border-purple-400 focus:ring-1 focus:ring-purple-400"
                />
              </div>
              
              <div>
                <Label className="text-slate-700 text-sm font-semibold">Language</Label>
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
            onClick={saveHostStep1}
            disabled={loading || !fullName.trim() || !age || parseInt(age || "0", 10) < 18 || !language || !photoFile}
          >
            Next
          </Button>
        </motion.div>
      )}
      
      {currentStep === 2 && (
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="space-y-4"
        >
          <div className="bg-gradient-to-br from-rose-50 to-orange-50 rounded-3xl p-5 border border-purple-500/20">
            <h2 className="font-bold text-slate-800 mb-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-pink-500 flex items-center justify-center">
                <Film className="w-5 h-5 text-slate-800" />
              </div>
              Video Upload
            </h2>
            
            {/* Video Upload/Record */}
            <div className="aspect-video w-full rounded-2xl overflow-hidden bg-white/80 border border-amber-200/60 mb-4 relative shadow-lg">
              {videoPreview ? (
                <video src={videoPreview} controls className="w-full h-full object-cover" />
              ) : isRecording ? (
                <>
                  <video 
                    ref={liveVideoRef} 
                    autoPlay 
                    playsInline 
                    muted 
                    className="w-full h-full object-cover scale-x-[-1]"
                  />
                  <div className="absolute top-3 left-3 flex items-center gap-2 bg-red-500 px-4 py-1.5 rounded-full shadow-lg">
                    <div className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
                    <span className="text-slate-800 text-sm font-bold">{recordingTime}s / 15s</span>
                  </div>
                </>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center">
                  <Film className="w-16 h-16 text-slate-500 mb-3" />
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
                    className="flex-1 border-amber-200/60 text-white hover:bg-amber-50/70 h-12 rounded-xl"
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
                  className="w-full border-amber-200/60 text-white hover:bg-amber-50/70 h-12 rounded-xl"
                  onClick={() => {
                    setVideoPreview(null);
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
          <div className="bg-gradient-to-br from-rose-50 to-orange-50 rounded-3xl p-5 border border-purple-500/20">
            <h2 className="font-bold text-slate-800 mb-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                <ImagePlus className="w-5 h-5 text-slate-800" />
              </div>
              Photos Upload (up to 3)
            </h2>
            
            <div className="grid grid-cols-3 gap-3">
              {[0, 1, 2].map((index) => (
                <div 
                  key={index}
                  className="aspect-square rounded-2xl bg-amber-50/70 border-2 border-dashed border-amber-200/60 flex items-center justify-center cursor-pointer hover:bg-amber-50/70 transition overflow-hidden shadow-lg"
                  onClick={() => hostPhotosInputRef.current?.click()}
                >
                  {hostPhotosPreviews[index] ? (
                    <img src={hostPhotosPreviews[index]} alt={`Photo ${index + 1}`} className="w-full h-full object-cover" />
                  ) : (
                    <Camera className="w-8 h-8 text-slate-500" />
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
          
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1 border-amber-200/60 text-white hover:bg-amber-50/70 h-14 rounded-2xl"
              onClick={() => setCurrentStep(1)}
            >
              Back
            </Button>
            <Button
              className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500 h-14 rounded-2xl text-lg font-bold"
              onClick={saveHostStep2}
              disabled={loading || !videoFile || hostPhotos.length !== 3}
            >
              Next
            </Button>
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
            <Button
              variant="outline"
              className="w-full h-12 rounded-xl border-slate-300 bg-white text-slate-800 hover:bg-slate-50 hover:text-slate-900 font-semibold shadow-sm"
              onClick={() => {
                stopFaceCamera();
                setCurrentStep(2);
              }}
            >
              Go Back
            </Button>
          )}
        </motion.div>
      )}
      
      {/* Existing Account Modal */}
      {showExistingAccountModal && existingAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-white/80 backdrop-blur-sm">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-sm bg-gradient-to-br from-rose-50 to-orange-50 rounded-3xl p-6 border border-purple-500/30 shadow-2xl"
          >
            <div className="text-center">
              <div className="w-20 h-20 mx-auto mb-4 rounded-full overflow-hidden border-4 border-purple-500/50">
                {existingAccount.avatarUrl ? (
                  <img src={existingAccount.avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-purple-600 flex items-center justify-center">
                    <User className="w-10 h-10 text-slate-800" />
                  </div>
                )}
              </div>
              
              <h3 className="text-xl font-bold text-slate-800 mb-2">
                Account Already Exists
              </h3>
              
              <p className="text-slate-600 text-sm mb-4">
                This face is already registered with an account:
              </p>
              
              <div className="p-3 rounded-xl bg-amber-50/70 mb-4">
                <p className="font-semibold text-slate-800">{existingAccount.displayName}</p>
                {existingAccount.isDeleted && (
                  <Badge className="mt-2 bg-amber-500/20 text-amber-300 border-amber-500/30">
                    Deletion Scheduled
                  </Badge>
                )}
              </div>
              
              <p className="text-slate-500 text-xs mb-6">
                One face can only be used for one host account. Please login to your existing account.
              </p>
              
              <div className="space-y-3">
                <Button
                  className="w-full bg-gradient-to-r from-purple-500 to-pink-500 h-12 rounded-xl font-bold"
                  onClick={async () => {
                    // Sign out and go to login
                    localStorage.setItem('meri_manual_logout', 'true');
                    await supabase.auth.signOut({ scope: 'local' });
                    navigate('/auth');
                  }}
                >
                  Login to Existing Account
                </Button>
                
                <Button
                  variant="ghost"
                  className="w-full text-slate-500 hover:text-white hover:bg-amber-50/70"
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
