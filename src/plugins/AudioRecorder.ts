import { registerPlugin, Capacitor, PluginListenerHandle } from "@capacitor/core";

export interface AudioRecorderStartResult {
  path: string;
}

export interface AudioRecorderStopResult {
  path: string;
  uri: string;
  mimeType: string;
  durationMs: number;
  sizeBytes: number;
  base64?: string;
}

export interface AudioRecorderPluginNative {
  start(): Promise<AudioRecorderStartResult>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(options?: { includeBase64?: boolean }): Promise<AudioRecorderStopResult>;
  cancel(): Promise<void>;
  getAmplitude(): Promise<{ amplitude: number }>;
  isRecording(): Promise<{ recording: boolean; paused: boolean }>;
  addListener(
    eventName: "audioRecorderMaxDuration",
    cb: (e: { reason: string }) => void
  ): Promise<PluginListenerHandle> & PluginListenerHandle;
  addListener(
  ): Promise<PluginListenerHandle> & PluginListenerHandle;
}


const Native = registerPlugin<AudioRecorderPluginNative>("AudioRecorder");

export const isAudioRecorderNative = () =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";

// ---------------------------------------------------------------------------
// Web fallback — MediaRecorder API (webm/opus). Same shape as native return.
// ---------------------------------------------------------------------------
let webRecorder: MediaRecorder | null = null;
let webChunks: Blob[] = [];
let webStream: MediaStream | null = null;
let webStartedAt = 0;
let webPausedAccum = 0;
let webPauseStart = 0;
let webAudioCtx: AudioContext | null = null;
let webAnalyser: AnalyserNode | null = null;

async function webStart(): Promise<AudioRecorderStartResult> {
  if (webRecorder) throw new Error("already_recording");
  webStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  webChunks = [];
  const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
    ? "audio/webm;codecs=opus"
    : "audio/webm";
  webRecorder = new MediaRecorder(webStream, { mimeType: mime, audioBitsPerSecond: 64000 });
  webRecorder.ondataavailable = (e) => e.data.size > 0 && webChunks.push(e.data);
  webRecorder.start(250);
  webStartedAt = Date.now();
  webPausedAccum = 0;

  try {
    webAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const src = webAudioCtx.createMediaStreamSource(webStream);
    webAnalyser = webAudioCtx.createAnalyser();
    webAnalyser.fftSize = 1024;
    src.connect(webAnalyser);
  } catch {}

  return { path: "web://recording" };
}

async function webStop(includeBase64 = false): Promise<AudioRecorderStopResult> {
  if (!webRecorder) throw new Error("not_recording");
  const r = webRecorder;
  const blob: Blob = await new Promise((resolve) => {
    r.onstop = () => resolve(new Blob(webChunks, { type: r.mimeType }));
    r.stop();
  });
  webStream?.getTracks().forEach((t) => t.stop());
  webAudioCtx?.close().catch(() => {});
  webRecorder = null;
  webStream = null;
  webAnalyser = null;
  webAudioCtx = null;

  const url = URL.createObjectURL(blob);
  const durationMs = Date.now() - webStartedAt - webPausedAccum;
  const result: AudioRecorderStopResult = {
    path: url,
    uri: url,
    mimeType: blob.type || "audio/webm",
    durationMs,
    sizeBytes: blob.size,
  };
  if (includeBase64) {
    result.base64 = await new Promise<string>((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result).split(",")[1] || "");
      fr.readAsDataURL(blob);
    });
  }
  return result;
}

function webGetAmplitude(): number {
  if (!webAnalyser) return 0;
  const buf = new Uint8Array(webAnalyser.fftSize);
  webAnalyser.getByteTimeDomainData(buf);
  let peak = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = Math.abs(buf[i] - 128);
    if (v > peak) peak = v;
  }
  // map 0..128 → 0..32767 to match native scale
  return Math.round((peak / 128) * 32767);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export async function startVoiceRecording(): Promise<AudioRecorderStartResult> {
  if (isAudioRecorderNative()) return Native.start();
  return webStart();
}

export async function pauseVoiceRecording(): Promise<void> {
  if (isAudioRecorderNative()) return Native.pause();
  if (webRecorder && webRecorder.state === "recording") {
    webRecorder.pause();
    webPauseStart = Date.now();
  }
}

export async function resumeVoiceRecording(): Promise<void> {
  if (isAudioRecorderNative()) return Native.resume();
  if (webRecorder && webRecorder.state === "paused") {
    webRecorder.resume();
    webPausedAccum += Date.now() - webPauseStart;
  }
}

export async function stopVoiceRecording(
  includeBase64 = false
): Promise<AudioRecorderStopResult> {
  if (isAudioRecorderNative()) return Native.stop({ includeBase64 });
  return webStop(includeBase64);
}

export async function cancelVoiceRecording(): Promise<void> {
  if (isAudioRecorderNative()) return Native.cancel();
  if (webRecorder) {
    try { webRecorder.stop(); } catch {}
    webStream?.getTracks().forEach((t) => t.stop());
    webAudioCtx?.close().catch(() => {});
    webRecorder = null;
    webStream = null;
    webAnalyser = null;
    webAudioCtx = null;
  }
}

export async function getRecordingAmplitude(): Promise<number> {
  if (isAudioRecorderNative()) {
    const { amplitude } = await Native.getAmplitude();
    return amplitude;
  }
  return webGetAmplitude();
}

export async function isCurrentlyRecording(): Promise<{ recording: boolean; paused: boolean }> {
  if (isAudioRecorderNative()) return Native.isRecording();
  return {
    recording: !!webRecorder && webRecorder.state === "recording",
    paused: !!webRecorder && webRecorder.state === "paused",
  };
}

export function onMaxDurationReached(
  cb: (e: { reason: string }) => void
): Promise<PluginListenerHandle> | null {
  if (!isAudioRecorderNative()) return null;
  return Native.addListener("audioRecorderMaxDuration", cb);
}

export function onAmplitudeUpdate(
  cb: (e: { amplitude: number }) => void
): Promise<PluginListenerHandle> | null {
  if (!isAudioRecorderNative()) return null;
  return Native.addListener("audioRecorderAmplitude", cb);
}


/**
 * Helper: read a native file:// path into a Blob for Supabase upload.
 * On web, fetch the object-URL directly.
 */
export async function voiceRecordingToBlob(
  result: AudioRecorderStopResult
): Promise<Blob> {
  if (result.base64) {
    const bin = atob(result.base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: result.mimeType });
  }
  const res = await fetch(result.uri);
  return res.blob();
}
