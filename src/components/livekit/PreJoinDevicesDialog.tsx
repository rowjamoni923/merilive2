/**
 * Pkg144 — Pre-join device picker dialog (Phase 1 #1)
 *
 * Industry-standard pre-join screen: camera + mic + speaker dropdowns,
 * live preview, mic volume meter. Saves to localStorage via
 * `livekitDevicePreferences`. Web-only — native Android uses Capacitor
 * camera plugin which handles its own facing-mode UX.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Eye, Mic, Volume2, CheckCircle2, Wifi, Loader2, XCircle, Activity } from 'lucide-react';
import { toast } from 'sonner';
import { hardenVideoElementForNative } from '@/utils/videoNativeHardening';
import { claimAndroidWebViewCameraForStream, releaseAndroidWebViewCamera } from '@/lib/androidCameraHandoff';
import {
  runConnectionCheck,
  CheckStatus,
  type CheckInfo,
  type CheckRunStatus,
} from '@/lib/livekitConnectionCheck';
import {
  enumerateMediaDevices,
  getDevicePreferences,
  setDevicePreferences,
  type DevicePreferences,
} from '@/lib/livekitDevicePreferences';
import { isNativeAndroidApp } from '@/utils/nativeUtils';
import { useProCamera } from '@/camera/useProCamera';
import * as ProCameraEngine from '@/camera/ProCameraEngine';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (prefs: DevicePreferences) => void;
}

export const PreJoinDevicesDialog = ({ open, onOpenChange, onSaved }: Props) => {
  // Native Android owns camera/mic via Capacitor LiveKit plugin — the WebView
  // pre-join picker would race the native engine and trigger Android-16
  // permission loops. Render nothing on native Android.
  if (isNativeAndroidApp()) return null;

  // Pkg-LSGAP-1 — Acquire the streaming-family camera slot via the
  // ref-counted ProCameraEngine arbiter. If GoLive/LiveStream already
  // holds 'live-stream', this just bumps the refcount and shares the
  // existing camera (no second getUserMedia conflict on Android). If the
  // verification family holds it, `ready=false` and we skip preview
  // entirely instead of racing Camera2.
  const proCamera = useProCamera('live-stream', open);

  const [devices, setDevs] = useState<{
    audioinput: MediaDeviceInfo[];
    videoinput: MediaDeviceInfo[];
    audiooutput: MediaDeviceInfo[];
  }>({ audioinput: [], videoinput: [], audiooutput: [] });
  const [prefs, setPrefs] = useState<DevicePreferences>({});
  const [micLevel, setMicLevel] = useState(0);
  // Pkg190 — ConnectionCheck state (Item #2)
  const [ccStatus, setCcStatus] = useState<CheckRunStatus>('idle');
  const [ccChecks, setCcChecks] = useState<CheckInfo[]>([]);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const previewStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  // Load saved prefs + enumerate devices when dialog opens.
  useEffect(() => {
    if (!open) return;
    setPrefs(getDevicePreferences());
    // Pkg-LSGAP-1 — wait until ProCameraEngine confirmed the streaming
    // family is free / owned by us before probing permissions.
    if (!proCamera.ready) return;
    (async () => {
      // Request permissions so labels are populated.
      try {
        if (!ProCameraEngine.isHeldBy('live-stream')) return;
        const tmp = await claimAndroidWebViewCameraForStream(
          () => navigator.mediaDevices.getUserMedia({ audio: true, video: true }),
          'prejoin:permission-probe',
        );
        tmp.getTracks().forEach((t) => t.stop());
      } catch {
        /* user may deny — labels will be blank but ids still work */
      }
      const list = await enumerateMediaDevices();
      setDevs(list);
    })();
  }, [open, proCamera.ready]);

  // (Re)build preview stream whenever selection changes while dialog open.
  useEffect(() => {
    if (!open) return;
    // Pkg-LSGAP-1 — never call getUserMedia unless ProCameraEngine has
    // granted us the streaming-family slot.
    if (!proCamera.ready) return;
    let cancelled = false;

    const start = async () => {
      stopPreview();
      try {
        if (!ProCameraEngine.isHeldBy('live-stream')) return;
        const stream = await claimAndroidWebViewCameraForStream(
          () => navigator.mediaDevices.getUserMedia({
            audio: prefs.audioinput ? { deviceId: { exact: prefs.audioinput } } : true,
            video: prefs.videoinput
              ? { deviceId: { exact: prefs.videoinput }, width: { ideal: 720 }, height: { ideal: 1280 }, aspectRatio: { ideal: 9 / 16 } }
              : { facingMode: { ideal: 'user' }, width: { ideal: 720 }, height: { ideal: 1280 }, aspectRatio: { ideal: 9 / 16 } },
          }),
          'prejoin:preview',
        );
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        previewStreamRef.current = stream;
        if (videoRef.current) {
          hardenVideoElementForNative(videoRef.current, { muted: true });
          videoRef.current.srcObject = stream;
          videoRef.current.muted = true;
          await videoRef.current.play().catch(() => {});
        }
        attachMicMeter(stream);
      } catch (err: any) {
        console.warn('[PreJoin] preview failed', err?.message);
      }
    };

    start();
    return () => {
      cancelled = true;
      stopPreview();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, proCamera.ready, prefs.audioinput, prefs.videoinput]);

  // Apply selected speaker (audiooutput) live to the preview video element.
  useEffect(() => {
    const v = videoRef.current as any;
    if (v && typeof v.setSinkId === 'function' && prefs.audiooutput) {
      v.setSinkId(prefs.audiooutput).catch(() => {});
    }
  }, [prefs.audiooutput]);

  const attachMicMeter = (stream: MediaStream) => {
    try {
      const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
      const ctx = new Ctx();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        setMicLevel(Math.min(100, Math.round((sum / data.length) * 1.5)));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      /* ignore */
    }
  };

  const stopPreview = () => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    previewStreamRef.current?.getTracks().forEach((t) => t.stop());
    if (previewStreamRef.current) releaseAndroidWebViewCamera('prejoin:stop-preview');
    previewStreamRef.current = null;
    setMicLevel(0);
  };

  useEffect(() => () => stopPreview(), []);

  const supportsSpeaker = useMemo(() => {
    if (typeof document === 'undefined') return false;
    return 'setSinkId' in document.createElement('video');
  }, []);

  const handleSave = () => {
    setDevicePreferences(prefs);
    onSaved?.(prefs);
    toast.success('Devices saved');
    onOpenChange(false);
  };

  const handleRunCheck = async () => {
    setCcStatus('running');
    setCcChecks([]);
    try {
      await runConnectionCheck(({ checks, overall }) => {
        setCcChecks([...checks]);
        setCcStatus(overall);
      });
    } catch (err: any) {
      console.warn('[ConnectionCheck] failed', err?.message);
      setCcStatus('failed');
      toast.error('Connection test failed to start');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            Device setup
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Preview */}
          <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
            <video 
              ref={videoRef}
              playsInline
              autoPlay
              muted
              controls={false}
              disablePictureInPicture
              disableRemotePlayback
              controlsList="nodownload nofullscreen noremoteplayback noplaybackrate"
              poster=""
              // @ts-ignore
              x5-video-player-type="h5"
              x5-video-player-fullscreen="false"
              x5-playsinline="true"
              webkit-playsinline="true"
              className="h-full w-full object-contain bg-black [transform:scaleX(-1)]"
              style={{ pointerEvents: 'none', WebkitAppearance: 'none' } as React.CSSProperties}/>

          </div>

          {/* Camera */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5" /> Camera
            </label>
            <Select
              value={prefs.videoinput ?? ''}
              onValueChange={(v) => setPrefs((p) => ({ ...p, videoinput: v }))}
            >
              <SelectTrigger><SelectValue placeholder="Default camera" /></SelectTrigger>
              <SelectContent>
                {devices.videoinput.map((d) => (
                  <SelectItem key={d.deviceId} value={d.deviceId}>
                    {d.label || `Camera ${d.deviceId.slice(0, 6)}`}
                  </SelectItem>
                ))}
                {devices.videoinput.length === 0 && (
                  <SelectItem value="none" disabled>No cameras found</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Microphone */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <Mic className="w-3.5 h-3.5" /> Microphone
            </label>
            <Select
              value={prefs.audioinput ?? ''}
              onValueChange={(v) => setPrefs((p) => ({ ...p, audioinput: v }))}
            >
              <SelectTrigger><SelectValue placeholder="Default microphone" /></SelectTrigger>
              <SelectContent>
                {devices.audioinput.map((d) => (
                  <SelectItem key={d.deviceId} value={d.deviceId}>
                    {d.label || `Mic ${d.deviceId.slice(0, 6)}`}
                  </SelectItem>
                ))}
                {devices.audioinput.length === 0 && (
                  <SelectItem value="none" disabled>No microphones found</SelectItem>
                )}
              </SelectContent>
            </Select>
            {/* Mic level meter */}
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-[width] duration-75"
                style={{ width: `${micLevel}%` }}
              />
            </div>
          </div>

          {/* Speaker (web only — setSinkId support) */}
          {supportsSpeaker && devices.audiooutput.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5" /> Speaker
              </label>
              <Select
                value={prefs.audiooutput ?? ''}
                onValueChange={(v) => setPrefs((p) => ({ ...p, audiooutput: v }))}
              >
                <SelectTrigger><SelectValue placeholder="System default" /></SelectTrigger>
                <SelectContent>
                  {devices.audiooutput.map((d) => (
                    <SelectItem key={d.deviceId} value={d.deviceId}>
                      {d.label || `Speaker ${d.deviceId.slice(0, 6)}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Pkg190 — ConnectionCheck (Item #2) */}
          <div className="space-y-2 rounded-xl border border-border/60 bg-muted/30 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <Wifi className="w-3.5 h-3.5" /> Connection test
              </div>
              <Button
                size="sm"
                variant={ccStatus === 'success' ? 'secondary' : 'outline'}
                onClick={handleRunCheck}
                disabled={ccStatus === 'running'}
                className="h-7 gap-1.5 text-xs"
              >
                {ccStatus === 'running' ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Testing…
                  </>
                ) : (
                  <>
                    <Activity className="w-3.5 h-3.5" /> {ccStatus === 'idle' ? 'Test' : 'Re-test'}
                  </>
                )}
              </Button>
            </div>
            {ccChecks.length > 0 && (
              <ul className="space-y-1">
                {ccChecks.map((c, idx) => (
                  <li key={`${c.name}-${idx}`} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate text-foreground/90">{c.name}</span>
                    <span className="flex items-center gap-1">
                      {c.status === CheckStatus.RUNNING && (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                      )}
                      {c.status === CheckStatus.SUCCESS && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      )}
                      {c.status === CheckStatus.FAILED && (
                        <XCircle className="w-3.5 h-3.5 text-destructive" />
                      )}
                      {c.status === CheckStatus.SKIPPED && (
                        <span className="text-[10px] text-muted-foreground">skipped</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {ccStatus === 'success' && (
 <p className="text-[11px] text-emerald-600 ">
                All checks passed — you're ready to go live.
              </p>
            )}
            {ccStatus === 'failed' && (
              <p className="text-[11px] text-destructive">
                Some checks failed. Try a different network (Wi-Fi / mobile data) or disable VPN.
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} className="gap-1.5">
            <CheckCircle2 className="w-4 h-4" />
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PreJoinDevicesDialog;
