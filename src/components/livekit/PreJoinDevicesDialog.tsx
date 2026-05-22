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
import { Camera, Mic, Volume2, CheckCircle2, Wifi, Loader2, XCircle, Activity } from 'lucide-react';
import { toast } from 'sonner';
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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (prefs: DevicePreferences) => void;
}

export const PreJoinDevicesDialog = ({ open, onOpenChange, onSaved }: Props) => {
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
    (async () => {
      // Request permissions so labels are populated.
      try {
        const tmp = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        tmp.getTracks().forEach((t) => t.stop());
      } catch {
        /* user may deny — labels will be blank but ids still work */
      }
      const list = await enumerateMediaDevices();
      setDevs(list);
    })();
  }, [open]);

  // (Re)build preview stream whenever selection changes while dialog open.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const start = async () => {
      stopPreview();
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: prefs.audioinput ? { deviceId: { exact: prefs.audioinput } } : true,
          video: prefs.videoinput ? { deviceId: { exact: prefs.videoinput } } : true,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        previewStreamRef.current = stream;
        if (videoRef.current) {
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
  }, [open, prefs.audioinput, prefs.videoinput]);

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
            <Camera className="w-5 h-5 text-primary" />
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
              className="h-full w-full object-cover [transform:scaleX(-1)]"
            />
          </div>

          {/* Camera */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <Camera className="w-3.5 h-3.5" /> Camera
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
