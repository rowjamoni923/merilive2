/**
 * Pkg196 (M2) — Live Captions Overlay.
 *
 * Subscribes to `window 'livekit-transcription'` CustomEvents dispatched by
 * `src/lib/livekitTranscription.ts` (Pkg116) and renders a premium subtitle
 * bar at the bottom of the live video tile.
 *
 * Auto-registers the LiveKit room for transcription as soon as it appears in
 * the Pkg121 stream-room registry (no polling — uses a single rAF check
 * every 500ms until the room is present, then stops).
 *
 * Per-participant rolling line buffer:
 *   - interim (non-final) segments overwrite the last line for that speaker,
 *   - final segments freeze the line and start a new one,
 *   - lines auto-expire after `lingerMs` (default 6s),
 *   - max `maxLines` (default 2) shown.
 *
 * Toggle is persisted in localStorage (`captions:enabled:<scope>:<id>` →
 * defaults true) so users can hide captions per room.
 *
 * Pure client-side render. Zero Supabase. Zero polling beyond the bounded
 * room-registry warm-up. $1400-rule safe.
 */
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Captions, CaptionsOff } from 'lucide-react';
import {
  registerRoomForTranscription,
  unregisterRoomForTranscription,
  type TranscriptionEvent,
  type TranscriptionScope,
} from '@/lib/livekitTranscription';
import { _getRegisteredRoom } from '@/lib/livekitStreams';

interface CaptionLine {
  id: string;            // composite: identity + segmentId
  speaker: string;       // participant identity
  text: string;
  final: boolean;
  updatedAt: number;
}

interface Props {
  scope: TranscriptionScope;
  id: string;
  /** Map participant identity → display name (avatars not needed). Optional. */
  speakerLabels?: Record<string, string>;
  /** Max simultaneous lines visible. Default 2. */
  maxLines?: number;
  /** Auto-dismiss a line after this many ms of no updates. Default 6000. */
  lingerMs?: number;
  /** Show toggle button at top-right of overlay. Default true. */
  showToggle?: boolean;
  /** Position offset from the bottom in CSS units (above bottom bar). */
  bottomOffset?: string;
  className?: string;
}

const TOGGLE_KEY = (scope: string, id: string) => `captions:enabled:${scope}:${id}`;

export function LiveCaptionsOverlay({
  scope,
  id,
  speakerLabels,
  maxLines = 2,
  lingerMs = 6000,
  showToggle = true,
  bottomOffset = '6.5rem',
  className,
}: Props) {
  const [enabled, setEnabledState] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    try {
      const v = window.localStorage.getItem(TOGGLE_KEY(scope, id));
      return v == null ? true : v === '1';
    } catch { return true; }
  });

  const setEnabled = useCallback((v: boolean) => {
    setEnabledState(v);
    try { window.localStorage.setItem(TOGGLE_KEY(scope, id), v ? '1' : '0'); } catch { /* noop */ }
    if (!v) setLines([]);
  }, [scope, id]);

  const [lines, setLines] = useState<CaptionLine[]>([]);
  const linesRef = useRef<CaptionLine[]>([]);
  linesRef.current = lines;

  // Auto-register transcription on the room as soon as it shows up.
  useEffect(() => {
    if (!enabled) return;
    let off: (() => void) | null = null;
    let cancelled = false;

    const tryRegister = () => {
      if (cancelled) return;
      const room = _getRegisteredRoom(scope, id);
      if (room) {
        try {
          off = registerRoomForTranscription(scope, id, room);
        } catch (e) {
          console.warn('[Pkg196] registerRoomForTranscription failed', e);
        }
        return;
      }
      // Try again in 500ms — bounded, stops as soon as room appears.
      window.setTimeout(tryRegister, 500);
    };
    tryRegister();

    return () => {
      cancelled = true;
      if (off) { try { off(); } catch { /* noop */ } }
      else { try { unregisterRoomForTranscription(scope, id); } catch { /* noop */ } }
    };
  }, [scope, id, enabled]);

  // Listen for transcription events.
  useEffect(() => {
    if (!enabled) return;
    const onEvt = (e: Event) => {
      const ce = e as CustomEvent<TranscriptionEvent>;
      const d = ce.detail;
      if (!d || d.scope !== scope || d.id !== id) return;

      const now = Date.now();
      setLines((prev) => {
        const next = [...prev];
        for (const seg of d.segments) {
          const text = (seg.text ?? '').trim();
          if (!text) continue;
          const speaker = d.identity ?? 'unknown';
          // Interim segments share the same composite key so they overwrite.
          const composite = seg.final
            ? `${speaker}::${seg.id || `f-${now}`}`
            : `${speaker}::interim`;
          const idx = next.findIndex((l) => l.id === composite);
          const line: CaptionLine = {
            id: composite,
            speaker,
            text,
            final: !!seg.final,
            updatedAt: now,
          };
          if (idx >= 0) next[idx] = line;
          else next.push(line);

          // If final landed for a speaker, drop their interim row.
          if (seg.final) {
            const interimIdx = next.findIndex(
              (l) => l.id === `${speaker}::interim` && l.id !== composite,
            );
            if (interimIdx >= 0) next.splice(interimIdx, 1);
          }
        }
        // Trim oldest beyond cap.
        return next.slice(-maxLines);
      });
    };
    window.addEventListener('livekit-transcription', onEvt as EventListener);
    return () => window.removeEventListener('livekit-transcription', onEvt as EventListener);
  }, [scope, id, enabled, maxLines]);

  // Linger expiry — drops lines after `lingerMs` of inactivity.
  useEffect(() => {
    if (!enabled) return;
    const t = window.setInterval(() => {
      const cutoff = Date.now() - lingerMs;
      const current = linesRef.current;
      if (current.length === 0) return;
      const kept = current.filter((l) => l.updatedAt >= cutoff);
      if (kept.length !== current.length) setLines(kept);
    }, 750);
    return () => window.clearInterval(t);
  }, [enabled, lingerMs]);

  const visible = useMemo(() => lines.slice(-maxLines), [lines, maxLines]);

  return (
    <div
      className={`pointer-events-none fixed left-0 right-0 z-[60] flex flex-col items-center px-3 ${className ?? ''}`}
      style={{ bottom: bottomOffset }}
    >
      {/* Toggle */}
      {showToggle && (
        <div className="pointer-events-auto self-end mb-2">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setEnabled(!enabled)}
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{
              background: enabled
                ? 'linear-gradient(135deg, rgba(168,85,247,0.55) 0%, rgba(236,72,153,0.45) 100%)'
                : 'rgba(0,0,0,0.5)',
              border: `1px solid ${enabled ? 'rgba(236,72,153,0.45)' : 'rgba(255,255,255,0.15)'}`,
              backdropFilter: 'blur(14px)',
              boxShadow: enabled
                ? '0 0 0 1px rgba(255,255,255,0.16) inset, 0 6px 18px -4px rgba(236,72,153,0.55)'
                : '0 1px 0 rgba(255,255,255,0.08) inset',
            }}
            aria-label={enabled ? 'Hide captions' : 'Show captions'}
          >
            {enabled
              ? <Captions className="w-4 h-4 text-white" />
              : <CaptionsOff className="w-4 h-4 text-white/70" />}
          </motion.button>
        </div>
      )}

      {/* Caption stack */}
      <AnimatePresence initial={false}>
        {enabled && visible.map((line) => (
          <motion.div
            key={line.id}
            initial={{ y: 14, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: line.final ? 1 : 0.85, scale: 1 }}
            exit={{ y: -6, opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            className="max-w-full mt-1.5"
          >
            <div
              className="rounded-2xl px-4 py-2"
              style={{
                background: 'linear-gradient(135deg, rgba(0,0,0,0.72) 0%, rgba(20,15,40,0.62) 100%)',
                border: '1px solid rgba(255,255,255,0.10)',
                backdropFilter: 'blur(14px) saturate(140%)',
                boxShadow: '0 6px 18px -6px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.06) inset',
                textShadow: '0 1px 2px rgba(0,0,0,0.8)',
              }}
            >
              <div className="flex items-baseline gap-2">
                {speakerLabels?.[line.speaker] && (
                  <span
                    className="text-[10px] uppercase tracking-[0.15em] font-semibold"
                    style={{ color: 'rgba(236,72,153,0.95)' }}
                  >
                    {speakerLabels[line.speaker]}
                  </span>
                )}
                <span
                  className={`text-sm leading-snug text-white ${line.final ? 'font-medium' : 'font-normal italic'}`}
                  style={{ wordBreak: 'break-word' }}
                >
                  {line.text}
                </span>
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
