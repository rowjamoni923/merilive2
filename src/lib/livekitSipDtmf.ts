/**
 * Pkg195 (M1) — LiveKit SIP DTMF send + active SIP participant detection.
 *
 * `localParticipant.publishDtmf(code, digit)` already ships in livekit-client
 * (browser SDK). This wrapper:
 *   - exposes a single-digit send + a queued sequence sender with proper
 *     inter-digit gap (default 120ms, matches Twilio/IVR best practice),
 *   - maps RFC 4733 codes for 0-9, *, # (and A-D for completeness),
 *   - provides a `useSipParticipants(scope, id)` React hook that detects any
 *     participant whose identity starts with `sip_` (Pkg110 convention) and
 *     reactively returns the live list — zero polling, pure LiveKit events.
 *
 * Pure client-side. Zero Supabase round-trips. Zero new realtime channels.
 * Kill-switch: only renders/sends when caller chooses; the lib itself never
 * auto-runs. $1400-rule safe.
 */
import { useEffect, useState } from 'react';
import type { RemoteParticipant } from 'livekit-client';
import { _getRegisteredRoom, type StreamScope } from './livekitStreams';

/** RFC 4733 §3.2 — DTMF event codes. */
export const DTMF_CODE: Record<string, number> = {
  '0': 0, '1': 1, '2': 2, '3': 3, '4': 4,
  '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  '*': 10, '#': 11,
  A: 12, B: 13, C: 14, D: 15,
};

export const DTMF_KEYS: string[] = [
  '1', '2', '3',
  '4', '5', '6',
  '7', '8', '9',
  '*', '0', '#',
];

export function sanitizeDigit(input: string): string | null {
  const k = input.trim().toUpperCase();
  return k in DTMF_CODE ? k : null;
}

/**
 * Send a single DTMF digit to the room. SIP participant(s) in the room will
 * relay it down the PSTN leg via `telephone-event/8000`.
 */
export async function sendDtmfDigit(
  scope: StreamScope,
  id: string,
  digit: string,
): Promise<boolean> {
  const room = _getRegisteredRoom(scope, id);
  if (!room) return false;
  const key = sanitizeDigit(digit);
  if (key == null) return false;
  const code = DTMF_CODE[key];
  const lp: any = room.localParticipant;
  if (typeof lp?.publishDtmf !== 'function') return false;
  try {
    await lp.publishDtmf(code, key);
    return true;
  } catch (e) {
    console.warn('[Pkg195] publishDtmf failed', e);
    return false;
  }
}

/**
 * Send a sequence of digits with `gapMs` between each (default 120ms).
 * Returns the number of digits successfully sent.
 */
export async function sendDtmfSequence(
  scope: StreamScope,
  id: string,
  digits: string,
  gapMs = 120,
): Promise<number> {
  let sent = 0;
  for (const ch of digits) {
    const ok = await sendDtmfDigit(scope, id, ch);
    if (ok) sent += 1;
    if (ch !== digits[digits.length - 1]) {
      await new Promise((r) => setTimeout(r, Math.max(40, gapMs)));
    }
  }
  return sent;
}

export interface SipParticipantInfo {
  identity: string;
  name: string;
  sid: string;
  joinedAt: number;
}

function isSipIdentity(identity: string | undefined | null): boolean {
  return !!identity && identity.startsWith('sip_');
}

function toInfo(p: RemoteParticipant): SipParticipantInfo {
  return {
    identity: p.identity,
    name: p.name || p.identity,
    sid: p.sid,
    joinedAt: typeof p.joinedAt === 'object' && p.joinedAt
      ? (p.joinedAt as Date).getTime()
      : Date.now(),
  };
}

/**
 * Reactive list of SIP participants in the given registered Room.
 * Updates on ParticipantConnected / ParticipantDisconnected. Zero polling.
 */
export function useSipParticipants(
  scope: StreamScope,
  id: string,
): SipParticipantInfo[] {
  const [list, setList] = useState<SipParticipantInfo[]>([]);

  useEffect(() => {
    const room = _getRegisteredRoom(scope, id);
    if (!room) {
      setList([]);
      return;
    }

    const snapshot = () => {
      const arr: SipParticipantInfo[] = [];
      room.remoteParticipants.forEach((p) => {
        if (isSipIdentity(p.identity)) arr.push(toInfo(p));
      });
      arr.sort((a, b) => a.joinedAt - b.joinedAt);
      setList(arr);
    };

    // Initial snapshot
    snapshot();

    // Lazy import to keep tree-shake friendly.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const lk = require('livekit-client') as typeof import('livekit-client');
    const onConn = (p: RemoteParticipant) => { if (isSipIdentity(p.identity)) snapshot(); };
    const onDisc = (p: RemoteParticipant) => { if (isSipIdentity(p.identity)) snapshot(); };

    (room as any).on(lk.RoomEvent.ParticipantConnected, onConn);
    (room as any).on(lk.RoomEvent.ParticipantDisconnected, onDisc);

    return () => {
      try {
        (room as any).off(lk.RoomEvent.ParticipantConnected, onConn);
        (room as any).off(lk.RoomEvent.ParticipantDisconnected, onDisc);
      } catch {
        /* room may already be disconnected */
      }
    };
  }, [scope, id]);

  return list;
}
