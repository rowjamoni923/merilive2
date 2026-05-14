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
  Settings
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
import { useRefreshOnResume } from "@/hooks/useAppResumeHandler";
import { recordClientError } from "@/utils/clientErrorLog";

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

// Pose thresholds — tuned for real-world mobile use (phone held below face,
// natural lighting, slight head tilt). These are intentionally forgiving so
// genuine users complete the flow on first try; the AWS Rekognition step that
// runs AFTER submission is the strict identity gate (gender ≥86%, compare ≥72%,
// face ≥80% — see service_auto_finalize_face_verification).
const POSE = {
  CENTER_YAW: 22,   // |yaw|  < 22  → looking forward
  CENTER_PITCH: 22, // |pitch|< 22  → not tilted up/down
  TURN_YAW: 14,     // |yaw|  > 14  → clear left/right turn
  TILT_PITCH: 10,   // |pitch|> 10  → clear up/down tilt
};

// Single English-only instruction set (per global English policy).
const getLocalizedInstructions = (_countryName?: string) => [
  { id: 'center', direction: 'Look Forward', icon: ScanFace, description: 'Keep your face straight towards the camera', checkPose: (p: { yaw: number; pitch: number }) => Math.abs(p.yaw) < POSE.CENTER_YAW && Math.abs(p.pitch) < POSE.CENTER_PITCH },
  { id: 'left',   direction: 'Turn Left',    icon: ArrowLeftIcon,  description: 'Slowly turn your head to the left',  checkPose: (p: { yaw: number; pitch: number }) => p.yaw >  POSE.TURN_YAW },
  { id: 'right',  direction: 'Turn Right',   icon: ArrowRightIcon, description: 'Slowly turn your head to the right', checkPose: (p: { yaw: number; pitch: number }) => p.yaw < -POSE.TURN_YAW },
  { id: 'up',     direction: 'Look Up',      icon: ArrowUp,        description: 'Tilt your head upward slightly',     checkPose: (p: { yaw: number; pitch: number }) => p.pitch < -POSE.TILT_PITCH },
  { id: 'down',   direction: 'Look Down',    icon: ArrowDown,      description: 'Tilt your head downward slightly',   checkPose: (p: { yaw: number; pitch: number }) => p.pitch >  POSE.TILT_PITCH },
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
  const { getCameraStream, requestCameraPermission, isNativeApp } = useNativeCameraPermission();
  
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
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const videoStreamRef = useRef<MediaStream | null>(null);
  const liveVideoRef = useRef<HTMLVideoElement>(null);
  const chunksRef = useRef<Blob[]>([]);
  
  // Face Verification Video States
  const [faceVerificationVideo, setFaceVerificationVideo] = useState<Blob | null>(null);
  const [faceStream, setFaceStream] = useState<MediaStream | null>(null);
  const [faceVerified, setFaceVerified] = useState(false);
  const [verifyingFace, setVerifyingFace] = useState(false);
  const faceVideoRef = useRef<HTMLVideoElement>(null);
  const faceCanvasRef = useRef<HTMLCanvasElement>(null);
  const faceRecorderRef = useRef<MediaRecorder | null>(null);
  const faceChunksRef = useRef<Blob[]>([]);
  
  // Video verification flow states
  const [verificationStarted, setVerificationStarted] = useState(false);
  const [currentInstruction, setCurrentInstruction] = useState(0);
  const [instructionsCompleted, setInstructionsCompleted] = useState<boolean[]>([false, false, false, false, false]);
  const [verificationRecording, setVerificationRecording] = useState(false);
  const [verificationTime, setVerificationTime] = useState(0);
  const [verificationFailed, setVerificationFailed] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [scanningStatus, setScanningStatus] = useState<'idle' | 'scanning' | 'pass' | 'fail'>('idle');
  const [poseHistory, setPoseHistory] = useState<{yaw:number,pitch:number}[]>([]);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const instructionTimerRef = useRef<NodeJS.Timeout | null>(null);
  const poseCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const currentInstructionRef = useRef(0);
  const instructionsCompletedRef = useRef<boolean[]>([false, false, false, false, false]);
  // 3-angle stills captured live during pose check (for AWS Rekognition auto-approve)
  const capturedAnglesRef = useRef<{ center?: string; left?: string; right?: string }>({});

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
    } else if (latestSubmission?.status === 'pending') {
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

  // Generate simple face hash from video frame
  const generateFaceHash = async (videoBlob: Blob): Promise<string> => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.src = URL.createObjectURL(videoBlob);
      video.muted = true;
      
      video.onloadeddata = () => {
        video.currentTime = 0.5;
      };
      
      video.onseeked = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(video, 0, 0, 32, 32);
        
        const imageData = ctx?.getImageData(0, 0, 32, 32);
        if (imageData) {
          let hash = '';
          for (let i = 0; i < imageData.data.length; i += 16) {
            hash += imageData.data[i].toString(16).padStart(2, '0');
          }
          resolve(hash.substring(0, 64));
        } else {
          resolve(Math.random().toString(36).substring(2, 66));
        }
        URL.revokeObjectURL(video.src);
      };
      
      video.onerror = () => {
        resolve(Math.random().toString(36).substring(2, 66));
      };
      
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

  useEffect(() => {
    if (!userId) return;

    const syncVerificationState = () => {
      void refreshVerificationState(userId);
    };

    const handleVisibilityRefresh = () => {
      if (document.visibilityState === 'visible') syncVerificationState();
    };

    const channel = supabase
      .channel(`face-verification-sync-${userId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'profiles',
        filter: `id=eq.${userId}`,
      }, syncVerificationState)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'face_verification_submissions',
        filter: `user_id=eq.${userId}`,
      }, syncVerificationState)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'host_applications',
        filter: `user_id=eq.${userId}`,
      }, syncVerificationState)
      .subscribe();

    window.addEventListener('focus', syncVerificationState);
    document.addEventListener('visibilitychange', handleVisibilityRefresh);

    return () => {
      window.removeEventListener('focus', syncVerificationState);
      document.removeEventListener('visibilitychange', handleVisibilityRefresh);
      supabase.removeChannel(channel);
    };
  }, [userId, refreshVerificationState]);

  useRefreshOnResume(() => {
    if (userId) void refreshVerificationState(userId);
  });

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
      
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') 
        ? 'video/webm;codecs=vp9' 
        : MediaRecorder.isTypeSupported('video/webm') 
          ? 'video/webm' 
          : 'video/mp4';
      
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const file = new File([blob], 'verification-video.webm', { type: mimeType });
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
      // Stop any existing stream first
      if (faceStream) {
        faceStream.getTracks().forEach(track => track.stop());
        setFaceStream(null);
      }
      
      // Small delay to let the camera hardware fully release
      await new Promise(resolve => setTimeout(resolve, 300));
      
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
      toast({
        title: "Camera access failed",
        description: error.message || "Please grant camera permission from settings.",
        variant: "destructive",
      });
    }
  }, [faceStream, toast, getCameraStream, attachFacePreviewStream]);
  
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

  // Start face verification recording with REAL liveness checking
  const startFaceVerification = async () => {
    if (!cameraReady || !faceStream) {
      toast({ title: "Camera not ready", description: "Please wait...", variant: "destructive" });
      return;
    }

    setVerificationStarted(true);
    setVerificationRecording(true);
    setCurrentInstruction(0);
    currentInstructionRef.current = 0;
    const freshCompleted = [false, false, false, false, false];
    setInstructionsCompleted(freshCompleted);
    instructionsCompletedRef.current = freshCompleted;
    setVerificationFailed(false);
    setVerificationTime(0);
    setScanningStatus('idle');
    setPoseHistory([]);
    faceChunksRef.current = [];
    capturedAnglesRef.current = {};

    try {
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') 
        ? 'video/webm;codecs=vp9' 
        : MediaRecorder.isTypeSupported('video/webm') 
          ? 'video/webm' 
          : 'video/mp4';
      
      const mediaRecorder = new MediaRecorder(faceStream, { mimeType });
      faceRecorderRef.current = mediaRecorder;
      
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) faceChunksRef.current.push(e.data);
      };
      
      mediaRecorder.onstop = () => {
        const blob = new Blob(faceChunksRef.current, { type: mimeType });
        setFaceVerificationVideo(blob);
      };
      
      mediaRecorder.start();
      
      // Start timer (max 30 seconds for all instructions)
      let elapsed = 0;
      timerRef.current = setInterval(() => {
        elapsed++;
        setVerificationTime(elapsed);
        if (elapsed >= 30) {
          // Time's up — check if all completed
          const allDone = instructionsCompletedRef.current.every(Boolean);
          finishVerification(allDone);
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

  // Real pose checking - captures frame & sends to face-check API
  const startRealPoseChecking = () => {
    let consecutiveFails = 0;
    
    poseCheckIntervalRef.current = setInterval(async () => {
      const videoEl = faceVideoRef.current;
      if (!videoEl) return;
      
      const frameBase64 = captureFrameFromLiveVideo(videoEl);
      if (!frameBase64) return;
      
      setScanningStatus('scanning');
      
      const result = await checkFacePose(frameBase64);
      
      if (!result || !result.faceDetected) {
        consecutiveFails++;
        setScanningStatus('fail');
        if (consecutiveFails >= 5) {
          // Too many fails — no face visible
          finishVerification(false);
        }
        return;
      }
      
      consecutiveFails = 0;
      const pose = result.pose;
      
      // Track pose history for anti-spoof (photos have zero variance)
      setPoseHistory(prev => [...prev.slice(-20), { yaw: pose.yaw, pitch: pose.pitch }]);
      
      // Check current instruction
      const instrIdx = currentInstructionRef.current;
      const instruction = faceInstructions[instrIdx];
      
      if (instruction && !instructionsCompletedRef.current[instrIdx]) {
        const passed = instruction.checkPose({ yaw: pose.yaw, pitch: pose.pitch });
        
        if (passed) {
          setScanningStatus('pass');
          // Capture this angle's still frame for AWS Rekognition (front/left/right only)
          if (instruction.id === 'center' || instruction.id === 'left' || instruction.id === 'right') {
            const angleKey = instruction.id as 'center' | 'left' | 'right';
            if (!capturedAnglesRef.current[angleKey]) {
              const stillFrame = captureFrameFromLiveVideo(videoEl, 720);
              if (stillFrame) capturedAnglesRef.current[angleKey] = stillFrame;
            }
          }
          const newCompleted = [...instructionsCompletedRef.current];
          newCompleted[instrIdx] = true;
          instructionsCompletedRef.current = newCompleted;
          setInstructionsCompleted([...newCompleted]);
          
          // Move to next instruction
          const nextIdx = instrIdx + 1;
          if (nextIdx < faceInstructions.length) {
            currentInstructionRef.current = nextIdx;
            setCurrentInstruction(nextIdx);
            setScanningStatus('idle');
          } else {
            // All instructions completed! 
            setTimeout(() => finishVerification(true), 500);
          }
        } else {
          setScanningStatus('scanning');
        }
      }
    }, 1500); // Check every 1.5 seconds
  };

  // Finish verification
  const finishVerification = async (success: boolean) => {
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
    
    if (faceRecorderRef.current && faceRecorderRef.current.state === 'recording') {
      faceRecorderRef.current.stop();
    }
    
    setVerificationRecording(false);
    setScanningStatus('idle');
    
    if (success) {
      // Anti-spoof check: verify pose variance (photos have near-zero variance)
      if (poseHistory.length >= 3) {
        const yaws = poseHistory.map(p => p.yaw);
        const pitches = poseHistory.map(p => p.pitch);
        const yawVariance = Math.max(...yaws) - Math.min(...yaws);
        const pitchVariance = Math.max(...pitches) - Math.min(...pitches);
        
        if (yawVariance < 5 && pitchVariance < 5) {
          // Suspiciously static — likely a photo
          console.log('[FaceVerify] ⚠️ Anti-spoof: pose too static, likely photo');
          setVerificationFailed(true);
          setFailedAttempts(prev => prev + 1);
          toast({
            title: "❌ " + localizedMsg.failed,
            description: localizedMsg.staticFace,
            variant: "destructive",
          });
          return;
        }
      }
      
      setFaceVerified(true);
      toast({
        title: localizedMsg.success,
        description: localizedMsg.successDesc,
      });
    } else {
      setVerificationFailed(true);
      setFailedAttempts(prev => prev + 1);
      toast({
        title: "❌ " + localizedMsg.failed,
        description: localizedMsg.failedDesc,
        variant: "destructive",
      });
    }
  };

  // Reset verification
  const resetVerification = () => {
    setVerificationStarted(false);
    setVerificationRecording(false);
    setCurrentInstruction(0);
    currentInstructionRef.current = 0;
    setInstructionsCompleted([false, false, false, false, false]);
    instructionsCompletedRef.current = [false, false, false, false, false];
    setVerificationFailed(false);
    setVerificationTime(0);
    setFaceVerificationVideo(null);
    setFaceVerified(false);
    setScanningStatus('idle');
    setPoseHistory([]);
    if (poseCheckIntervalRef.current) {
      clearInterval(poseCheckIntervalRef.current);
      poseCheckIntervalRef.current = null;
    }
  };

  // Stop camera
  const stopFaceCamera = () => {
    if (faceStream) {
      faceStream.getTracks().forEach(track => track.stop());
      setFaceStream(null);
    }
    setCameraReady(false);
    resetVerification();
  };

  // Upload file to storage
  const uploadFile = async (file: File | Blob, folder: string): Promise<string | null> => {
    if (!userId) return null;
    
    const fileExt = file instanceof File ? file.name.split('.').pop() : 'webm';
    const fileName = `${userId}/${folder}/${Date.now()}.${fileExt}`;
    
    const { data, error } = await supabase.storage
      .from('face-verification')
      .upload(fileName, file, { upsert: true });
    
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
      const [meta, b64] = dataUrl.split(',');
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
    const map: Array<['center' | 'left' | 'right', 'front_url' | 'left_url' | 'right_url', string]> = [
      ['center', 'front_url', 'face-angles/front'],
      ['left', 'left_url', 'face-angles/left'],
      ['right', 'right_url', 'face-angles/right'],
    ];
    for (const [angle, field, folder] of map) {
      const dataUrl = capturedAnglesRef.current[angle];
      if (!dataUrl) continue;
      const blob = dataUrlToBlob(dataUrl);
      if (!blob) continue;
      const url = await uploadFile(blob, folder);
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
      return data as { ok?: boolean; autoFinalize?: { success?: boolean; gender?: string; verification_type?: string; reason?: string } | null };
    } catch (err) {
      console.warn('[FaceVerification] face-verification-analyze invoke threw:', err);
      return null;
    }
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
      // Upload profile photo first
      const profilePhotoUrl = await uploadFile(userPhotoFile, 'profile-photos');
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
        if (result?.autoFinalize?.success) {
          autoApproved = true;
          const detected = result.autoFinalize.gender;
          autoMessage = detected === 'female'
            ? "🎉 Auto-approved as Host! Welcome."
            : "🎉 Auto-approved! Your account is verified.";
        }
      }

      toast({
        title: autoApproved ? "✅ Auto-Approved!" : "✅ Submission Successful!",
        description: autoMessage,
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
        if (result?.autoFinalize?.success) {
          autoApproved = true;
          const detected = result.autoFinalize.gender;
          autoMessage = detected === 'female'
            ? "🎉 Auto-approved as Host! Welcome to the platform."
            : "🎉 Auto-approved! Note: detected as male, account converted to user.";
        }
      }

      toast({
        title: autoApproved ? "✅ Auto-Approved!" : "✅ Host Application Submitted!",
        description: autoMessage,
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
    const completedCount = instructionsCompleted.filter(Boolean).length;
    const progressPercent = (completedCount / faceInstructions.length) * 100;
    const borderColor = scanningStatus === 'pass' ? '#22c55e' : scanningStatus === 'fail' ? '#ef4444' : scanningStatus === 'scanning' ? '#eab308' : '#a855f7';

    return (
    <div className="bg-gradient-to-br from-[#FFFBF2] to-[#FFFBF2] rounded-3xl p-5 border border-purple-500/20 shadow-2xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg">
            <ScanFace className="w-6 h-6 text-slate-800" />
          </div>
          {verificationRecording && (
            <motion.div 
              className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500"
              animate={{ scale: [1, 1.3, 1], opacity: [1, 0.7, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
            />
          )}
        </div>
        <div>
          <h2 className="font-bold text-slate-800 text-lg">Live Face Scan</h2>
          <p className="text-slate-400 text-sm">
            {verificationRecording ? `Step ${currentInstruction + 1} of ${faceInstructions.length}` : 'AI-powered identity verification'}
          </p>
        </div>
      </div>

      {/* Progress Bar */}
      {verificationRecording && (
        <div className="mb-4">
          <div className="flex justify-between text-xs text-slate-500 mb-1.5">
            <span>Liveness Check Progress</span>
            <span>{completedCount}/{faceInstructions.length} steps</span>
          </div>
          <div className="h-2 bg-amber-50/70 rounded-full overflow-hidden">
            <motion.div 
              className="h-full bg-gradient-to-r from-cyan-400 via-purple-500 to-pink-500 rounded-full"
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </div>
      )}
      
      {/* Video Container with Face Oval */}
      <div className="relative aspect-[3/4] w-full max-w-sm mx-auto rounded-3xl overflow-hidden bg-white/80 mb-5 shadow-2xl">
        {!faceStream && !faceVerified ? (
          <div className="w-full h-full flex flex-col items-center justify-center p-6 bg-gradient-to-br from-[#FAF5EA] to-[#FFFBF2]">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="relative w-32 h-32 mb-6"
            >
              {/* Animated scanning circle */}
              <motion.div
                className="absolute inset-0 rounded-full border-2 border-cyan-400/30"
                animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.1, 0.3] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
              <motion.div
                className="absolute inset-2 rounded-full border-2 border-purple-400/40"
                animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0.1, 0.4] }}
                transition={{ duration: 2, repeat: Infinity, delay: 0.3 }}
              />
              <div className="absolute inset-4 rounded-full bg-gradient-to-br from-cyan-500/20 to-purple-500/20 flex items-center justify-center">
                <ScanFace className="w-12 h-12 text-cyan-400" />
              </div>
            </motion.div>
            <p className="text-slate-700 text-center font-medium mb-1">Ready to Scan</p>
            <p className="text-slate-400 text-xs text-center max-w-[200px]">Position your face in the oval and follow each instruction</p>
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
            <h3 className="text-xl font-bold text-slate-800 mt-6 mb-2">Scan Complete!</h3>
            <p className="text-green-300 text-sm">All {faceInstructions.length} liveness checks passed</p>
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
            
            {/* Loading overlay */}
            {faceStream && !cameraReady && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/80">
                <div className="flex flex-col items-center">
                  <Loader2 className="w-12 h-12 text-cyan-400 animate-spin mb-2" />
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
            
            {/* Bottom: Timer + Step indicators */}
            {verificationRecording && (
              <div className="absolute bottom-3 left-3 right-3">
                {/* Step dots */}
                <div className="flex justify-center gap-2 mb-2">
                  {instructionsCompleted.map((completed, idx) => (
                    <motion.div
                      key={idx}
                      className={`w-9 h-9 rounded-full flex items-center justify-center border-2 ${
                        completed 
                          ? 'bg-green-500 border-green-400' 
                          : idx === currentInstruction 
                            ? 'border-cyan-400 bg-cyan-500/20' 
                            : 'border-amber-200/60 bg-white/5'
                      }`}
                      animate={completed ? { scale: [1, 1.15, 1] } : idx === currentInstruction ? { borderColor: ['#22d3ee', '#a855f7', '#22d3ee'] } : {}}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    >
                      {completed ? (
                        <CheckCircle2 className="w-5 h-5 text-slate-800" />
                      ) : (
                        <span className="text-slate-600 text-xs font-bold">{idx + 1}</span>
                      )}
                    </motion.div>
                  ))}
                </div>
                
                {/* Timer bar */}
                <div className="bg-white/80 backdrop-blur-md rounded-full px-4 py-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-slate-500 text-xs">{localizedMsg.recording}</span>
                  </div>
                  <span className="text-slate-800 font-mono font-bold text-sm">{Math.max(0, 30 - verificationTime)}s</span>
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
                  className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center mb-4"
                >
                  <XCircle className="w-12 h-12 text-red-400" />
                </motion.div>
                <p className="text-slate-800 font-bold text-lg mb-1">{localizedMsg.failed}</p>
                <p className="text-slate-500 text-sm text-center px-6 mb-1">
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
      {!faceStream && !faceVerified && (
        <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-xl p-3 mb-4">
          <p className="text-cyan-300 text-xs text-center">
            {localizedMsg.tips}
          </p>
        </div>
      )}
      
      {/* Action buttons */}
      {!faceStream && !faceVerified && (
        <Button
          className="w-full h-14 bg-gradient-to-r from-cyan-600 via-purple-600 to-pink-600 hover:from-cyan-500 hover:via-purple-500 hover:to-pink-500 rounded-2xl text-lg font-bold shadow-lg shadow-purple-500/20"
          onClick={startFaceCamera}
        >
          <ScanFace className="w-6 h-6 mr-3" />
          {localizedMsg.startScan}
        </Button>
      )}
      
      {faceStream && !verificationStarted && !faceVerified && (
        <div className="space-y-3">
          <Button
            className="w-full h-14 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 rounded-2xl text-lg font-bold shadow-lg shadow-cyan-500/20"
            onClick={startFaceVerification}
            disabled={!cameraReady}
          >
            {!cameraReady ? (
              <>
                <Loader2 className="w-6 h-6 mr-3 animate-spin" />
                Initializing...
              </>
            ) : (
              <>
                <Play className="w-6 h-6 mr-3" />
                {localizedMsg.beginCheck}
              </>
            )}
          </Button>
          <Button
            variant="outline"
            className="w-full border-amber-200/60 text-white hover:bg-amber-50/70 rounded-xl"
            onClick={stopFaceCamera}
          >
            {localizedMsg.cancel}
          </Button>
        </div>
      )}
      
      {verificationFailed && (
        <Button
          className="w-full h-14 bg-gradient-to-r from-amber-600 to-orange-600 rounded-2xl text-lg font-bold"
          onClick={resetVerification}
        >
          <RotateCcw className="w-6 h-6 mr-3" />
          {localizedMsg.tryAgain}
        </Button>
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
      <div className="fixed inset-0 flex flex-col bg-gradient-to-b from-[#FFFBF2] via-[#FAF5EA] to-[#FFFBF2] overflow-hidden"><div className="flex-1 overflow-y-auto overscroll-contain p-4" style={{ WebkitOverflowScrolling: "touch", paddingBottom: "var(--content-bottom-padding)" }}>
        {renderHeader("Face Verification", "Identity check required")}
        <div className="flex flex-col items-center justify-center mt-12">
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring" }}
            className="w-28 h-28 rounded-full bg-gradient-to-r from-red-400 to-rose-500 flex items-center justify-center mb-4 shadow-2xl shadow-red-500/20">
            <XCircle className="w-14 h-14 text-white" />
          </motion.div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Verification Rejected</h2>
          {rejectionReason && (
            <p className="text-red-300 text-center px-6 mb-2 text-sm">Reason: {rejectionReason}</p>
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
                  setCurrentInstruction(0); setInstructionsCompleted([false, false, false, false, false]);
                  setVerificationRecording(false); setVerificationTime(0); setVerificationFailed(false);
                  setCameraReady(false); setCurrentStep(1); setFullName(""); setAge(""); setLanguage("");
                  setRejectionReason(null); setVerificationStatus('unverified');
                }}
              >
                🔄 Try Again
              </Button>
              <p className="text-slate-400 text-xs text-center mt-3 px-8">
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
      <div className="fixed inset-0 flex flex-col bg-gradient-to-b from-[#FFFBF2] via-[#FAF5EA] to-[#FFFBF2] overflow-hidden"><div className="flex-1 overflow-y-auto overscroll-contain p-4" style={{ WebkitOverflowScrolling: "touch", paddingBottom: "var(--content-bottom-padding)" }}>
        {renderHeader("Face Verification", "Identity check required")}
        <div className="flex flex-col items-center justify-center mt-12">
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring" }}
            className="w-28 h-28 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 flex items-center justify-center mb-4 shadow-2xl shadow-amber-500/20">
            <Loader2 className="w-14 h-14 text-slate-800 animate-spin" />
          </motion.div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Under Review</h2>
          <p className="text-slate-500 text-center px-6">Your face verification has already been submitted and is pending admin review. Please wait for approval.</p>
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
      <div className="fixed inset-0 flex flex-col bg-gradient-to-b from-[#FFFBF2] via-[#FAF5EA] to-[#FFFBF2] overflow-hidden"><div className="flex-1 overflow-y-auto overscroll-contain p-4" style={{ WebkitOverflowScrolling: "touch", paddingBottom: "var(--content-bottom-padding)" }}>
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
    <div className="fixed inset-0 flex flex-col bg-gradient-to-b from-[#FFFBF2] via-[#FAF5EA] to-[#FFFBF2] overflow-hidden"><div className="flex-1 overflow-y-auto overscroll-contain p-4" style={{ WebkitOverflowScrolling: "touch", paddingBottom: "var(--content-bottom-padding)" }}>
      {renderHeader("Host Verification", "Get verified as a host")}
      
      {/* Progress Steps */}
      <div className="flex items-center justify-between mb-8 px-2">
        {[1, 2, 3].map((step) => (
          <div key={step} className="flex items-center">
            <motion.div 
              className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold shadow-lg ${
                currentStep >= step 
                  ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white' 
                  : 'bg-amber-50/70 text-slate-700'
              }`}
              animate={currentStep === step ? { scale: [1, 1.05, 1] } : {}}
              transition={{ repeat: Infinity, duration: 2 }}
            >
              {currentStep > step ? <CheckCircle2 className="w-6 h-6" /> : step}
            </motion.div>
            {step < 3 && (
              <div className={`w-12 sm:w-20 h-1.5 mx-1 rounded-full ${
                currentStep > step ? 'bg-gradient-to-r from-purple-500 to-pink-500' : 'bg-amber-50/70'
              }`} />
            )}
          </div>
        ))}
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
              className="w-full border-amber-200/60 text-white hover:bg-amber-50/70 h-12 rounded-xl"
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
