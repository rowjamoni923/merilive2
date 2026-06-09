/**
 * F7 — Live voice moderation hook.
 *
 * Records short audio chunks (~20s every 30s) from either:
 *   - the local microphone (LiveStream host path, no LiveKit MediaStream
 *     reference available), OR
 *   - a caller-supplied MediaStream (private call path, reuses the LiveKit
 *     local audio track so we never open a second mic).
 *
 * Each chunk is POSTed to the `live-voice-moderate` edge function which
 * transcribes (ElevenLabs Scribe v2) and runs the F6 unicode-hardened
 * contact detector. Penalties are applied server-side via the shared
 * `process_contact_violation` RPC so voice + text stay synchronized.
 *
 * Safety:
 *   - Pauses recording when the tab/app is hidden.
 *   - Pauses when the mic is muted (private call) or `enabled` flips false.
 *   - Skips unverified hosts (caller passes `isVerified`).
 *   - Soft-fails when ElevenLabs key is not configured.
 */
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface UseLiveVoiceMonitorOptions {
  enabled: boolean;
  userId: string | null;
  context: "live" | "call";
  /** Source id — live stream id OR private call id. */
  sourceId?: string | null;
  /** Skip when host is not verified yet. */
  isVerified?: boolean;
  /** Caller-supplied MediaStream (private call). When omitted we open mic. */
  getMediaStream?: () => MediaStream | null;
  /** Mic state — when false, recorder pauses. */
  isMicEnabled?: boolean;
  /** Optional language hint (BCP-47 / ISO-639-3). */
  language?: string;
  /** Chunk duration in ms (default 20000). */
  chunkMs?: number;
  /** Interval between chunks in ms (default 30000). */
  intervalMs?: number;
  onViolation?: (info: {
    matches: string[];
    beansDeducted: number;
    violationNumber: number;
    confidence: string;
  }) => void;
}

export function useLiveVoiceMonitor(opts: UseLiveVoiceMonitorOptions) {
  const {
    enabled,
    userId,
    context,
    sourceId,
    isVerified = true,
    getMediaStream,
    isMicEnabled = true,
    language,
    chunkMs = 20_000,
    intervalMs = 30_000,
    onViolation,
  } = opts;

  const ownedStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const cycleTimerRef = useRef<number | null>(null);
  const stopTimerRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const visibleRef = useRef<boolean>(typeof document === "undefined" ? true : !document.hidden);
  const inFlightRef = useRef<boolean>(false);
  const disposedRef = useRef<boolean>(false);

  // Track visibility — pause cycle when tab hidden.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVis = () => { visibleRef.current = !document.hidden; };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    disposedRef.current = false;
    if (!enabled || !userId || !isVerified) return;

    const pickMimeType = (): string | undefined => {
      if (typeof MediaRecorder === "undefined") return undefined;
      const candidates = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ];
      for (const c of candidates) {
        try { if (MediaRecorder.isTypeSupported(c)) return c; } catch { /* ignore */ }
      }
      return undefined;
    };

    const acquireAudioStream = async (): Promise<MediaStream | null> => {
      // Prefer the caller-supplied stream (private call LiveKit track).
      const supplied = getMediaStream?.();
      if (supplied) {
        const audioTracks = supplied.getAudioTracks();
        if (audioTracks.length > 0) {
          // Wrap so we don't accidentally stop LiveKit's track on cleanup.
          const wrapper = new MediaStream();
          audioTracks.forEach((t) => wrapper.addTrack(t));
          return wrapper;
        }
      }
      // Fallback — open a dedicated mic (LiveStream host path).
      try {
        const ms = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        ownedStreamRef.current = ms;
        return ms;
      } catch (err) {
        console.warn("[useLiveVoiceMonitor] mic acquire failed:", err);
        return null;
      }
    };

    const uploadChunk = async (blob: Blob) => {
      if (blob.size < 2_000) return;
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        const form = new FormData();
        form.append("audio", blob, "chunk.webm");
        form.append("context", context);
        if (sourceId) form.append("source_id", sourceId);
        if (userId) form.append("user_id", userId);
        if (language) form.append("language", language);
        const { data, error } = await supabase.functions.invoke(
          "live-voice-moderate",
          { body: form },
        );
        if (error) {
          console.warn("[useLiveVoiceMonitor] invoke error:", error);
          return;
        }
        const res = data as any;
        if (res?.detected && Array.isArray(res?.matches) && res.matches.length > 0) {
          onViolation?.({
            matches: res.matches,
            beansDeducted: Number(res.beans_deducted || 0),
            violationNumber: Number(res.violation_number || 0),
            confidence: String(res.confidence || "low"),
          });
        }
      } catch (err) {
        console.warn("[useLiveVoiceMonitor] upload failed:", err);
      } finally {
        inFlightRef.current = false;
      }
    };

    const runChunk = async () => {
      if (disposedRef.current) return;
      if (!visibleRef.current) return;
      if (!isMicEnabled) return;
      if (recorderRef.current) return; // chunk still running
      const stream = await acquireAudioStream();
      if (!stream || disposedRef.current) return;
      const mimeType = pickMimeType();
      let rec: MediaRecorder;
      try {
        rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      } catch (err) {
        console.warn("[useLiveVoiceMonitor] MediaRecorder ctor failed:", err);
        return;
      }
      recorderRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType || "audio/webm" });
        chunksRef.current = [];
        // Release owned mic stream so we don't hold the indicator on.
        if (ownedStreamRef.current) {
          try { ownedStreamRef.current.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
          ownedStreamRef.current = null;
        }
        recorderRef.current = null;
        void uploadChunk(blob);
      };
      try {
        rec.start();
      } catch (err) {
        console.warn("[useLiveVoiceMonitor] rec.start failed:", err);
        recorderRef.current = null;
        return;
      }
      stopTimerRef.current = window.setTimeout(() => {
        try { rec.state !== "inactive" && rec.stop(); } catch { /* ignore */ }
        stopTimerRef.current = null;
      }, chunkMs);
    };

    // Kick first chunk after a short delay so initial connection settles.
    const bootTimer = window.setTimeout(() => void runChunk(), 5_000);
    cycleTimerRef.current = window.setInterval(() => void runChunk(), intervalMs);

    return () => {
      disposedRef.current = true;
      window.clearTimeout(bootTimer);
      if (cycleTimerRef.current) {
        window.clearInterval(cycleTimerRef.current);
        cycleTimerRef.current = null;
      }
      if (stopTimerRef.current) {
        window.clearTimeout(stopTimerRef.current);
        stopTimerRef.current = null;
      }
      const rec = recorderRef.current;
      if (rec) {
        try { rec.state !== "inactive" && rec.stop(); } catch { /* ignore */ }
        recorderRef.current = null;
      }
      if (ownedStreamRef.current) {
        try { ownedStreamRef.current.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
        ownedStreamRef.current = null;
      }
      chunksRef.current = [];
    };
  }, [
    enabled,
    userId,
    context,
    sourceId,
    isVerified,
    isMicEnabled,
    language,
    chunkMs,
    intervalMs,
    getMediaStream,
    onViolation,
  ]);
}
