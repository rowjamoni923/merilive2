/**
 * PR-2.5 — Host moderation action wrappers for Party Rooms.
 *
 * Thin, typed RPC callers for the new backend functions:
 *   - transfer_party_host        (#4)
 *   - mute_all_speakers          (#5)
 *   - unmute_all_speakers        (#5)
 *   - set_seat_lock              (#6)
 *   - record_party_gift_split    (#8)
 *
 * Each returns { ok: true, ... } | { ok: false, error: string } mirroring the
 * RPC JSON shape so callers can render a toast directly.
 */
import { supabase } from '@/integrations/supabase/client';

type RpcResult = { ok: true; [k: string]: unknown } | { ok: false; error: string; [k: string]: unknown };

async function callRpc(name: string, args: Record<string, unknown>): Promise<RpcResult> {
  const { data, error } = await (supabase.rpc as any)(name, args);
  if (error) return { ok: false, error: error.message || 'rpc_error' };
  if (data && typeof data === 'object' && 'ok' in (data as Record<string, unknown>)) {
    return data as RpcResult;
  }
  return { ok: true };
}

export const transferPartyHost = (roomId: string, newHostId: string) =>
  callRpc('transfer_party_host', { p_room_id: roomId, p_new_host_id: newHostId });

export const muteAllSpeakers = (roomId: string) =>
  callRpc('mute_all_speakers', { p_room_id: roomId });

export const unmuteAllSpeakers = (roomId: string) =>
  callRpc('unmute_all_speakers', { p_room_id: roomId });

export const setSeatLock = (
  roomId: string,
  seatNumber: number,
  locked: boolean,
  forbidAudio = false,
  forbidVideo = false,
) =>
  callRpc('set_seat_lock', {
    p_room_id: roomId,
    p_seat_number: seatNumber,
    p_locked: locked,
    p_forbid_audio: forbidAudio,
    p_forbid_video: forbidVideo,
  });

export const recordPartyGiftSplit = (
  roomId: string,
  senderId: string,
  giftId: string,
  totalDiamonds: number,
  totalBeans: number,
  idempotencyKey?: string,
) =>
  callRpc('record_party_gift_split', {
    p_room_id: roomId,
    p_sender_id: senderId,
    p_gift_id: giftId,
    p_total_diamonds: totalDiamonds,
    p_total_beans: totalBeans,
    p_idempotency_key: idempotencyKey ?? null,
  });
