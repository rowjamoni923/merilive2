import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

// ──────────────────────────────────────────────
// TYPES
// ──────────────────────────────────────────────

export interface FaceDetectionState {
  isFaceVisible: boolean;
  isCountdownActive: boolean;
  countdownSeconds: number;
  countdownTotalSeconds: number;
  warningCount: number;
  isBanned: boolean;
  banInfo: {
    reason: string;
    endTime: Date | null;
    remainingHours: number | null;
  } | null;
}

interface UseLiveFaceDetectionProps {
  localVideoTrack: any | null;
  streamId: string | null;
  userId: string | null;
  isHost: boolean;
  isStreaming: boolean;
  streamStartTimeMs?: number | null;
  onAutoClose: () => void;
}

interface ModerationSettings {
  faceDetectionEnabled: boolean;
  faceAbsenceTimeout: number;
  maxWarningsBeforeBan: number;
  autoBanDurationHours: number;
}

// ──────────────────────────────────────────────
// DEFAULTS (overridden by DB)
// ──────────────────────────────────────────────

const DEFAULT_SETTINGS: ModerationSettings = {
  faceDetectionEnabled: true,
  faceAbsenceTimeout: 30,
  maxWarningsBeforeBan: 2,
  autoBanDurationHours: 2,
};

const ENFORCED_MAX_TIMEOUT_SECONDS = 60;
const ENFORCED_MIN_TIMEOUT_SECONDS = 30;

const normalizeFaceAbsenceTimeout = (seconds?: number) => {
  const safeValue = Number.isFinite(seconds) ? Number(seconds) : DEFAULT_SETTINGS.faceAbsenceTimeout;
  return Math.max(
    ENFORCED_MIN_TIMEOUT_SECONDS,
    Math.min(ENFORCED_MAX_TIMEOUT_SECONDS, Math.floor(safeValue))
  );
};

const FACE_DETECTION_START_DELAY_MS = 60_000; // Start 1 minute after host joins
const AUTO_CLOSE_COUNTDOWN_SECONDS = 10;

// ══════════════════════════════════════════════
// SERVER-ONLY ENFORCEMENT CONFIGURATION
// The server (AWS Rekognition) is the SOLE authority for face detection.
// Client-side pixel analysis is DISABLED to prevent banner flickering.
// ══════════════════════════════════════════════

// Server check intervals
const SERVER_CHECK_INTERVAL_NORMAL_MS = 4000;   // Every 4s when no issues
const SERVER_CHECK_INTERVAL_COUNTDOWN_MS = 2000; // Every 2s during countdown (faster recovery)
const SERVER_INITIAL_CHECK_DELAY_MS = 2000;

// Server thresholds
const SERVER_FAILS_TO_START_COUNTDOWN = 2;  // 2 consecutive server fails → start countdown
const SERVER_PASSES_TO_RECOVER = 3;         // 3 consecutive server passes → stop countdown

// Critical violations that trigger countdown
const CRITICAL_VIOLATIONS = new Set([
  'no_face',
  'face_out_of_frame',
  'poor_lighting',
]);

// Anti-spoof
const POSE_HISTORY_SIZE = 6;
const POSE_VARIANCE_THRESHOLD = 1.5;
const STATIC_FRAME_COUNT_LIMIT = 8;

// ──────────────────────────────────────────────
// HOOK
// ──────────────────────────────────────────────

export function useLiveFaceDetection({
  localVideoTrack,
  streamId,
  userId,
  isHost,
  isStreaming,
  streamStartTimeMs,
  onAutoClose,
}: UseLiveFaceDetectionProps) {
  const [state, setState] = useState<FaceDetectionState>({
    isFaceVisible: true,
    isCountdownActive: false,
    countdownSeconds: AUTO_CLOSE_COUNTDOWN_SECONDS,
    countdownTotalSeconds: AUTO_CLOSE_COUNTDOWN_SECONDS,
    warningCount: 0,
    isBanned: false,
    banInfo: null,
  });

  // ── Dynamic settings from DB ──
  const settingsRef = useRef<ModerationSettings>({ ...DEFAULT_SETTINGS });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const countdownRef = useRef(AUTO_CLOSE_COUNTDOWN_SECONDS);
  const isCountingDownRef = useRef(false);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const violationRecordedRef = useRef(false);
  const mountedRef = useRef(true);
  const videoReadyRef = useRef(false);
  const trackRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoCleanupRef = useRef<(() => void) | null>(null);

  // Server-side enforcement refs
  const serverCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const serverFailCountRef = useRef(0);
  const serverPassCountRef = useRef(0);
  const serverLastCheckRef = useRef(0);
  const firstServerCheckTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Anti-spoof
  const poseHistoryRef = useRef<Array<{ yaw: number; pitch: number; roll: number }>>([]);
  const staticFrameCountRef = useRef(0);
  const lastFrameHashRef = useRef('');

  const onAutoCloseRef = useRef(onAutoClose);

  useEffect(() => {
    onAutoCloseRef.current = onAutoClose;
  }, [onAutoClose]);

  // ──────────────────────────────────────────────
  // Settings sync via Pkg37 admin_broadcast. No direct Supabase Realtime here.
  // ──────────────────────────────────────────────

  useEffect(() => {
    if (!isHost || !isStreaming) return;

    const fetchSettings = async () => {
      try {
        const { data, error } = await supabase
          .from('live_moderation_settings')
          .select('setting_key, setting_value');

        if (error) throw error;

        if (data) {
          const newSettings = { ...DEFAULT_SETTINGS };
          for (const row of data) {
            const val = row.setting_value as any;
            switch (row.setting_key) {
              case 'face_detection_enabled':
                newSettings.faceDetectionEnabled = val?.enabled ?? true;
                break;
              case 'face_absence_timeout':
                newSettings.faceAbsenceTimeout = normalizeFaceAbsenceTimeout(val?.seconds);
                break;
              case 'max_warnings_before_ban':
                newSettings.maxWarningsBeforeBan = val?.count ?? 2;
                break;
              case 'auto_ban_duration_hours':
                newSettings.autoBanDurationHours = val?.hours ?? 2;
                break;
            }
          }
          settingsRef.current = newSettings;
          console.log('[FaceDetection] ⚙️ Settings loaded:', newSettings);
        }
      } catch (err) {
        console.error('[FaceDetection] Failed to load settings:', err);
      }
    };

    fetchSettings();

    const handleAdminUpdate = (event: Event) => {
      const table = (event as CustomEvent<{ table?: string }>).detail?.table;
      if (!table || table === 'live_moderation_settings') void fetchSettings();
    };
    window.addEventListener('admin-table-update', handleAdminUpdate as EventListener);

    return () => {
      window.removeEventListener('admin-table-update', handleAdminUpdate as EventListener);
    };
  }, [isHost, isStreaming]);

  // ── Find video element from DOM ──
  const findDOMVideo = useCallback((): HTMLVideoElement | null => {
    const allVideos = document.querySelectorAll('video');
    let bestVideo: HTMLVideoElement | null = null;
    let bestScore = 0;

    for (const v of allVideos) {
      if (v.videoWidth === 0 && v.videoHeight === 0) continue;

      let score = 1;
      score += (v.videoWidth * v.videoHeight) / 100000;
      if (!v.paused && v.readyState >= 2) score += 50;
      if (v.srcObject) score += 200;

      const id = v.id || '';
      const cls = v.className || '';
      const parentId = v.parentElement?.id || '';
      const parentCls = v.parentElement?.className || '';

      if (id.includes('livekit') || cls.includes('livekit') ||
          parentId.includes('livekit') || parentCls.includes('livekit') ||
          id.startsWith('video_')) {
        score += 100;
      }

      let ancestor = v.parentElement;
      for (let i = 0; i < 5 && ancestor; i++) {
        const aId = ancestor.id || '';
        const aCls = ancestor.className || '';
        if (aId.includes('local') || aCls.includes('local') ||
            aId.includes('stream') || aCls.includes('video-container') ||
            aCls.includes('bg-gradient')) {
          score += 30;
          break;
        }
        ancestor = ancestor.parentElement;
      }

      if (score > bestScore) {
        bestScore = score;
        bestVideo = v;
      }
    }

    return bestVideo;
  }, []);

  // ── Extract video element from track ──
  useEffect(() => {
    if (!localVideoTrack || !isHost) {
      videoRef.current = null;
      videoReadyRef.current = false;
      return;
    }

    if (videoCleanupRef.current) {
      videoCleanupRef.current();
      videoCleanupRef.current = null;
    }

    let cancelled = false;
    let retryAttempts = 0;

    const setupVideo = () => {
      if (cancelled) return;
      retryAttempts++;

      try {
        const domVideo = findDOMVideo();
        if (domVideo && domVideo.videoWidth > 0 && domVideo.readyState >= 2) {
          videoRef.current = domVideo;
          videoReadyRef.current = true;
          console.log('[FaceDetection] ✅ Video element ready');
          return;
        }

        try {
          const mediaStreamTrack = localVideoTrack.getMediaStreamTrack?.();
          if (mediaStreamTrack && mediaStreamTrack.readyState === 'live') {
            setupFromMediaStreamTrack(mediaStreamTrack);
            return;
          }
        } catch {}

        try {
          const mediaStream = localVideoTrack.getMediaStream?.();
          if (mediaStream) {
            const videoTracks = mediaStream.getVideoTracks();
            if (videoTracks.length > 0 && videoTracks[0].readyState === 'live') {
              setupFromMediaStreamTrack(videoTracks[0]);
              return;
            }
          }
        } catch {}

        try {
          const track = localVideoTrack._mediaStreamTrack || localVideoTrack._originMediaStreamTrack;
          if (track && track.readyState === 'live') {
            setupFromMediaStreamTrack(track);
            return;
          }
        } catch {}

        if (retryAttempts <= 20) {
          trackRetryRef.current = setTimeout(setupVideo, retryAttempts <= 5 ? 500 : 1000);
        }
      } catch (err) {
        console.error('[FaceDetection] Error extracting video:', err);
        if (!cancelled && retryAttempts <= 20) {
          trackRetryRef.current = setTimeout(setupVideo, 2000);
        }
      }
    };

    const setupFromMediaStreamTrack = (mediaStreamTrack: MediaStreamTrack) => {
      if (cancelled) return;

      if (videoRef.current && videoRef.current.tagName === 'VIDEO') {
        try { videoRef.current.pause(); videoRef.current.srcObject = null; } catch {}
      }

      const video = document.createElement('video');
      video.setAttribute('playsinline', 'true');
      video.setAttribute('autoplay', 'true');
      video.muted = true;
      video.srcObject = new MediaStream([mediaStreamTrack]);

      const onCanPlay = () => {
        if (!cancelled) {
          videoReadyRef.current = true;
          console.log('[FaceDetection] ✅ Hidden video element ready');
        }
      };

      const onEnded = () => {
        videoReadyRef.current = false;
        if (!cancelled) trackRetryRef.current = setTimeout(setupVideo, 2000);
      };

      video.addEventListener('canplay', onCanPlay);
      mediaStreamTrack.addEventListener('ended', onEnded);

      video.play().catch(() => {
        if (!cancelled) trackRetryRef.current = setTimeout(setupVideo, 2000);
      });

      videoRef.current = video;

      videoCleanupRef.current = () => {
        video.removeEventListener('canplay', onCanPlay);
        mediaStreamTrack.removeEventListener('ended', onEnded);
        video.pause();
        video.srcObject = null;
        videoRef.current = null;
        videoReadyRef.current = false;
      };
    };

    trackRetryRef.current = setTimeout(setupVideo, 1500);

    return () => {
      cancelled = true;
      if (trackRetryRef.current) clearTimeout(trackRetryRef.current);
      if (videoCleanupRef.current) {
        videoCleanupRef.current();
        videoCleanupRef.current = null;
      }
    };
  }, [localVideoTrack, isHost, findDOMVideo]);

  // ── Create canvas once ──
  useEffect(() => {
    canvasRef.current = document.createElement('canvas');
    canvasRef.current.width = 640;
    canvasRef.current.height = 480;
    return () => { canvasRef.current = null; };
  }, []);

  // ── Capture frame as base64 for server ──
  const captureFrameAsBase64 = useCallback((): string | null => {
    let video = videoRef.current;
    const canvas = canvasRef.current;

    if ((!video || !videoReadyRef.current || video.readyState < 2) && canvas) {
      const domVideo = findDOMVideo();
      if (domVideo) {
        video = domVideo;
        videoRef.current = domVideo;
        videoReadyRef.current = true;
      }
    }

    if (!video || !canvas || video.readyState < 2 || video.videoWidth === 0) return null;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    try {
      ctx.drawImage(video, 0, 0, 640, 480);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
      return dataUrl.split(',')[1];
    } catch {
      return null;
    }
  }, [findDOMVideo]);

  // ── Start countdown (FIXED 10s, only server can start) ──
  const startCountdown = useCallback(() => {
    if (isCountingDownRef.current) return; // Already running - never restart

    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }

    isCountingDownRef.current = true;
    const timeout = AUTO_CLOSE_COUNTDOWN_SECONDS;
    const endAt = Date.now() + timeout * 1000;
    countdownRef.current = timeout;
    violationRecordedRef.current = false;
    serverPassCountRef.current = 0; // Reset recovery counter

    console.log(`[FaceDetection] 🔴 Starting ${timeout}-second countdown!`);

    setState(prev => ({
      ...prev,
      isCountdownActive: true,
      countdownSeconds: timeout,
      countdownTotalSeconds: timeout,
      isFaceVisible: false,
    }));

    countdownIntervalRef.current = setInterval(() => {
      if (!mountedRef.current) {
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
        return;
      }

      const remaining = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      if (remaining === countdownRef.current && remaining > 0) return;

      countdownRef.current = remaining;
      setState(prev => ({ ...prev, countdownSeconds: remaining }));

      if (remaining <= 0) {
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
        isCountingDownRef.current = false;

        console.log(`[FaceDetection] 🚫 Live stream auto-closed: face not detected for ${timeout}s`);

        recordViolation();
        onAutoCloseRef.current();
      }
    }, 250);
  }, []);

  // ── Stop countdown (ONLY called when server confirms face recovery) ──
  const stopCountdown = useCallback(() => {
    if (!isCountingDownRef.current) return;
    isCountingDownRef.current = false;
    countdownRef.current = AUTO_CLOSE_COUNTDOWN_SECONDS;

    console.log('[FaceDetection] 🟢 Server confirmed face recovery, stopping countdown');

    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }

    setState(prev => ({
      ...prev,
      isCountdownActive: false,
      countdownSeconds: AUTO_CLOSE_COUNTDOWN_SECONDS,
      countdownTotalSeconds: AUTO_CLOSE_COUNTDOWN_SECONDS,
      isFaceVisible: true,
    }));
  }, []);

  // ── Record violation ──
  const recordViolation = useCallback(async () => {
    if (!userId || violationRecordedRef.current) return;
    violationRecordedRef.current = true;

    try {
      await supabase.from('live_face_violations').insert({
        host_id: userId,
        stream_id: streamId,
        violation_type: 'no_face',
        auto_closed: true,
        countdown_duration: AUTO_CLOSE_COUNTDOWN_SECONDS,
        brightness_level: 0,
        detection_confidence: 0,
      });

      if (streamId) {
        await supabase.rpc('record_live_violation', {
          p_user_id: userId,
          p_stream_id: streamId,
          p_violation_type: 'face_absence',
          p_auto_detected: true,
        });
      }
    } catch (error) {
      console.error('[FaceDetection] Error recording violation:', error);
    }
  }, [userId, streamId]);

  // ── Anti-spoof: pose variance ──
  const getPoseVariance = useCallback((): number => {
    const history = poseHistoryRef.current;
    if (history.length < 3) return 999;

    const n = history.length;
    const avgYaw = history.reduce((s, p) => s + p.yaw, 0) / n;
    const avgPitch = history.reduce((s, p) => s + p.pitch, 0) / n;
    const avgRoll = history.reduce((s, p) => s + p.roll, 0) / n;

    let yawVar = 0, pitchVar = 0, rollVar = 0;
    for (const p of history) {
      yawVar += (p.yaw - avgYaw) ** 2;
      pitchVar += (p.pitch - avgPitch) ** 2;
      rollVar += (p.roll - avgRoll) ** 2;
    }

    return Math.sqrt((yawVar + pitchVar + rollVar) / n);
  }, []);

  // ══════════════════════════════════════════════
  // SERVER-ONLY FACE CHECK (AWS Rekognition)
  // This is the SOLE authority for face detection.
  // No client-side pixel analysis is used.
  // ══════════════════════════════════════════════

  const runServerFaceCheck = useCallback(async () => {
    if (!mountedRef.current || !settingsRef.current.faceDetectionEnabled) return;

    const imageBase64 = captureFrameAsBase64();
    if (!imageBase64) {
      console.log('[FaceDetection] 🔍 Server: Could not capture frame');
      // Treat as fail (camera blocked?)
      serverFailCountRef.current += 1;
      if (serverFailCountRef.current >= SERVER_FAILS_TO_START_COUNTDOWN && !isCountingDownRef.current) {
        console.log('[FaceDetection] 🔴 Camera blocked - starting countdown');
        startCountdown();
      }
      return;
    }

    // Anti-spoof: static frame detection
    const frameHash = imageBase64.substring(0, 200);
    if (frameHash === lastFrameHashRef.current) {
      staticFrameCountRef.current += 1;
      if (staticFrameCountRef.current >= STATIC_FRAME_COUNT_LIMIT) {
        console.log('[FaceDetection] 🔍 Anti-spoof: Static frame → photo detected');
        serverFailCountRef.current = SERVER_FAILS_TO_START_COUNTDOWN;
        if (!isCountingDownRef.current) startCountdown();
        return;
      }
    } else {
      staticFrameCountRef.current = 0;
    }
    lastFrameHashRef.current = frameHash;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/face-check`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ imageBase64, streamId }),
        }
      );

      if (!response.ok) {
        console.error('[FaceDetection] Server API error:', response.status);
        return; // Don't count API errors as face violations
      }

      const analysis = await response.json();
      console.log(`[FaceDetection] 🔍 Server: face=${analysis.faceDetected} eyes=${analysis.eyesOpen}(${analysis.eyesOpenConfidence?.toFixed(0)}%) sleep=${analysis.sleepScore} violations=${analysis.violations?.join(',') || 'none'}`);

      // Track pose for anti-spoof
      if (analysis.pose && analysis.faceDetected) {
        poseHistoryRef.current.push(analysis.pose);
        if (poseHistoryRef.current.length > POSE_HISTORY_SIZE) {
          poseHistoryRef.current.shift();
        }

        const poseVar = getPoseVariance();
        if (poseHistoryRef.current.length >= POSE_HISTORY_SIZE && poseVar < POSE_VARIANCE_THRESHOLD) {
          console.log(`[FaceDetection] 🔍 Anti-spoof: Low pose variance (${poseVar.toFixed(2)}) - possible photo`);
          serverFailCountRef.current += 1;
          serverPassCountRef.current = 0;
          return;
        }
      }

      // Check for critical violations
      const violations: string[] = Array.isArray(analysis.violations) ? analysis.violations : [];
      const hasCriticalViolation = violations.some(v => CRITICAL_VIOLATIONS.has(v));

      if (hasCriticalViolation) {
        // ═══ FAIL PATH ═══
        serverFailCountRef.current += 1;
        serverPassCountRef.current = 0; // Reset recovery

        console.log(`[FaceDetection] 🔴 Server fail ${serverFailCountRef.current}/${SERVER_FAILS_TO_START_COUNTDOWN} (${violations.join(',')})`);

        setState(prev => ({ ...prev, isFaceVisible: false }));

        if (serverFailCountRef.current >= SERVER_FAILS_TO_START_COUNTDOWN && !isCountingDownRef.current) {
          console.log('[FaceDetection] 🔴 Server: Critical violation confirmed, starting countdown!');
          startCountdown();
        }
      } else {
        // ═══ PASS PATH ═══
        serverFailCountRef.current = 0;

        if (isCountingDownRef.current) {
          // During countdown: require N consecutive passes to recover
          serverPassCountRef.current += 1;
          console.log(`[FaceDetection] 🟡 Server recovery pass ${serverPassCountRef.current}/${SERVER_PASSES_TO_RECOVER}`);

          if (serverPassCountRef.current >= SERVER_PASSES_TO_RECOVER) {
            console.log('[FaceDetection] 🟢 Server confirmed face recovery! Stopping countdown.');
            serverPassCountRef.current = 0;
            stopCountdown();
          }
        } else {
          // Normal operation: face is visible
          setState(prev => ({ ...prev, isFaceVisible: true }));

          // Log non-critical violations for diagnostics
          if (violations.length > 0) {
            console.log(`[FaceDetection] ℹ️ Non-critical: ${violations.join(',')}`);
          }
        }
      }
    } catch (error) {
      console.error('[FaceDetection] Server check error:', error);
    }
  }, [streamId, captureFrameAsBase64, getPoseVariance, startCountdown, stopCountdown]);

  // ── Check ban status ──
  const checkBanStatus = useCallback(async () => {
    if (!userId) return false;

    try {
      const { data, error } = await supabase.rpc('is_user_live_banned', {
        p_user_id: userId,
      });

      if (error) throw error;

      if (data) {
        const { data: banData } = await supabase.rpc('get_user_live_ban', {
          p_user_id: userId,
        });

        setState(prev => ({
          ...prev,
          isBanned: true,
          banInfo: banData?.[0] ? {
            reason: banData[0].ban_reason,
            endTime: banData[0].ban_end ? new Date(banData[0].ban_end) : null,
            remainingHours: banData[0].remaining_hours,
          } : null,
        }));
        return true;
      }
      return false;
    } catch (error) {
      console.error('[FaceDetection] Ban check error:', error);
      return false;
    }
  }, [userId]);

  // ══════════════════════════════════════════════
  // MAIN DETECTION LOOP (SERVER-ONLY)
  // ══════════════════════════════════════════════

  useEffect(() => {
    if (!isHost || !isStreaming || !userId) return;

    mountedRef.current = true;
    serverFailCountRef.current = 0;
    serverPassCountRef.current = 0;
    serverLastCheckRef.current = 0;
    poseHistoryRef.current = [];
    staticFrameCountRef.current = 0;
    lastFrameHashRef.current = '';

    console.log('[FaceDetection] 🚀 Initializing face detection (SERVER-ONLY mode via AWS Rekognition)');

    checkBanStatus();

    const effectiveStartDelay = FACE_DETECTION_START_DELAY_MS;
    console.log(`[FaceDetection] ⏱️ Monitoring starts in ${Math.ceil(effectiveStartDelay / 1000)}s after host joins live`);

    const startDelay = setTimeout(() => {
      if (!mountedRef.current) return;

      console.log('[FaceDetection] ✅ Starting server-only detection loop');

      // Dynamic interval: faster during countdown for quicker recovery
      const scheduleNextCheck = () => {
        if (!mountedRef.current) return;

        const interval = isCountingDownRef.current
          ? SERVER_CHECK_INTERVAL_COUNTDOWN_MS
          : SERVER_CHECK_INTERVAL_NORMAL_MS;

        serverCheckIntervalRef.current = setTimeout(async () => {
          if (!mountedRef.current) return;

          // Skip if face detection disabled by admin
          if (!settingsRef.current.faceDetectionEnabled) {
            serverFailCountRef.current = 0;
            if (isCountingDownRef.current) stopCountdown();
            scheduleNextCheck();
            return;
          }

          await runServerFaceCheck();
          scheduleNextCheck();
        }, interval);
      };

      // First check after short delay
      firstServerCheckTimeoutRef.current = setTimeout(() => {
        if (mountedRef.current) {
          runServerFaceCheck();
          scheduleNextCheck();
        }
      }, SERVER_INITIAL_CHECK_DELAY_MS);
    }, effectiveStartDelay);

    return () => {
      mountedRef.current = false;
      clearTimeout(startDelay);
      if (firstServerCheckTimeoutRef.current) {
        clearTimeout(firstServerCheckTimeoutRef.current);
        firstServerCheckTimeoutRef.current = null;
      }
      if (serverCheckIntervalRef.current) {
        clearTimeout(serverCheckIntervalRef.current);
        serverCheckIntervalRef.current = null;
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      isCountingDownRef.current = false;
    };
  }, [isHost, isStreaming, userId, streamStartTimeMs, runServerFaceCheck, startCountdown, stopCountdown, checkBanStatus]);

  return {
    ...state,
    checkBanStatus,
  };
}
