/**
 * usePKBattleSfx — Native Android polish for PK Battle.
 *
 * Plays admin-configurable SFX (mp3/ogg via HTML5 Audio — works in Android
 * WebView and web preview) and full-screen VAP/SVGA cues (via existing
 * NativeGiftAnimationPlugin on Android, no-op on web) at key battle moments.
 *
 * Also fires haptic presets (`pkWin`/`pkLose`/`tick`) at the right moments.
 *
 * Design contract:
 *   - Pure side-effect hook. Renders nothing. Mutates no battle state.
 *   - Listens to the same `pk_battles` row + own-room LiveKit gift events
 *     that PKBattleActive already observes, but never writes back.
 *   - Web fallback: HTML5 audio still plays in browser, VAP silently no-ops.
 *   - All cue assets fetched ONCE from `pk_battle_assets` table on mount.
 *
 * Research: Bigo / Chamet / ZEGOCLOUD / Tencent TUILiveKit (see
 * .lovable/plan.md → "PK Battle — Native Android Polish Plan", 2026-06-08).
 */
import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  tryEnqueueNativeGift,
  tryPrefetchNativeGiftBatch,
  type NativeGiftType,
} from '@/plugins/NativeGiftAnimation';
import { hapticPreset, hapticTick } from '@/plugins/Vibration';
import type { GiftSentDetail } from '@/lib/livekitGiftSignaling';

type Cue =
  | 'battle_start'
  | 'countdown'
  | 'time_up'
  | 'victory'
  | 'defeat'
  | 'punishment_sticker';

interface AssetRow {
  cue: Cue;
  sound_url: string | null;
  animation_url: string | null;
  animation_type: string | null;
  is_active: boolean;
}

interface PKBattleSfxArgs {
  battleId: string;
  currentUserId: string | null | undefined;
  challengerId?: string | null;
  opponentId?: string | null;
  /** Server-authoritative status — flip 'pending' → 'active' triggers battle_start cue. */
  status: string | null;
  /** Server-derived seconds remaining (0 = time up). */
  timeLeft: number;
  /** Set only after server ends the battle. */
  winnerUserId: string | null;
  finalStatus: string | null;
  /** Punishment_end_ts in ms — non-null → loser sees sticker overlay. */
  punishmentEndTs: number | null;
}

// Module-scope asset cache (one fetch per session).
let cachedAssets: Record<Cue, AssetRow | undefined> | null = null;
let inflight: Promise<typeof cachedAssets> | null = null;

async function loadAssets(): Promise<typeof cachedAssets> {
  if (cachedAssets) return cachedAssets;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { data, error } = await supabase
        .from('pk_battle_assets')
        .select('cue, sound_url, animation_url, animation_type, is_active');
      if (error) throw error;
      const map: Record<string, AssetRow> = {};
      for (const row of (data ?? []) as AssetRow[]) {
        if (row.is_active) map[row.cue] = row;
      }
      cachedAssets = map as Record<Cue, AssetRow | undefined>;
    } catch {
      cachedAssets = {} as Record<Cue, AssetRow | undefined>;
    }
    return cachedAssets;
  })();
  return inflight;
}

// Audio pool — reuse Audio elements per URL to avoid GC churn.
const audioPool = new Map<string, HTMLAudioElement>();
function playSfx(url: string | null | undefined, volume = 0.85) {
  if (!url) return;
  try {
    let a = audioPool.get(url);
    if (!a) {
      a = new Audio(url);
      a.preload = 'auto';
      audioPool.set(url, a);
    }
    a.volume = volume;
    a.currentTime = 0;
    void a.play().catch(() => {});
  } catch {}
}

function fireAnim(cue: Cue, row: AssetRow | undefined, priority: number) {
  if (!row?.animation_url) return;
  void tryEnqueueNativeGift({
    id: `pk-${cue}-${Date.now()}`,
    url: row.animation_url,
    type: (row.animation_type as NativeGiftType | null) ?? undefined,
    soundUrl: undefined, // sound handled separately so it plays on web too
    priority,
    timeoutMs: 8000,
  });
}

export function usePKBattleSfx(args: PKBattleSfxArgs) {
  const {
    battleId,
    currentUserId,
    challengerId,
    opponentId,
    status,
    timeLeft,
    winnerUserId,
    finalStatus,
    punishmentEndTs,
  } = args;

  const firedRef = useRef<Record<string, boolean>>({});
  const assetsRef = useRef<typeof cachedAssets | null>(null);

  // Load + prefetch animation assets once.
  useEffect(() => {
    let cancelled = false;
    void loadAssets().then((m) => {
      if (cancelled || !m) return;
      assetsRef.current = m;
      const urls = Object.values(m)
        .map((r) => r?.animation_url)
        .filter((u): u is string => !!u);
      if (urls.length) void tryPrefetchNativeGiftBatch(urls);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Reset edge-trigger memory when battle id changes.
  useEffect(() => {
    firedRef.current = {};
  }, [battleId]);

  // battle_start — fires once on first 'active' observation.
  useEffect(() => {
    if (status !== 'active' || firedRef.current.start) return;
    firedRef.current.start = true;
    const m = assetsRef.current;
    playSfx(m?.battle_start?.sound_url);
    fireAnim('battle_start', m?.battle_start, 90);
    void hapticPreset('tick');
  }, [status]);

  // countdown beep at T-3s.
  useEffect(() => {
    if (status !== 'active') return;
    if (timeLeft === 3 && !firedRef.current.countdown) {
      firedRef.current.countdown = true;
      playSfx(assetsRef.current?.countdown?.sound_url, 0.7);
    }
    // re-arm if battle restarts (timeLeft jumps back up)
    if (timeLeft > 10) firedRef.current.countdown = false;
  }, [status, timeLeft]);

  // time_up at T-0 (still active, not yet ended).
  useEffect(() => {
    if (status !== 'active') return;
    if (timeLeft <= 0 && !firedRef.current.timeup) {
      firedRef.current.timeup = true;
      playSfx(assetsRef.current?.time_up?.sound_url);
      void hapticTick(60);
    }
  }, [status, timeLeft]);

  // victory / defeat — fires once when winner_user_id resolves.
  useEffect(() => {
    if (!winnerUserId || !currentUserId || firedRef.current.outcome) return;
    if (finalStatus === 'draw') {
      firedRef.current.outcome = true;
      return; // no cue for draws (industry norm)
    }
    firedRef.current.outcome = true;
    const m = assetsRef.current;
    if (winnerUserId === currentUserId) {
      playSfx(m?.victory?.sound_url, 1.0);
      fireAnim('victory', m?.victory, 200);
      void hapticPreset('pkWin');
    } else {
      playSfx(m?.defeat?.sound_url, 0.75);
      // No full-screen VAP on defeat — only sticker (handled below).
      void hapticPreset('pkLose');
    }
  }, [winnerUserId, finalStatus, currentUserId]);

  // Punishment sticker overlay (loser only) — fires once when window opens.
  useEffect(() => {
    if (!punishmentEndTs || !winnerUserId || !currentUserId) return;
    if (firedRef.current.punishment) return;
    if (finalStatus === 'draw') return;
    if (winnerUserId === currentUserId) return; // winners don't get sticker
    if (punishmentEndTs <= Date.now()) return;
    firedRef.current.punishment = true;
    const m = assetsRef.current;
    const dur = Math.max(2000, Math.min(180_000, punishmentEndTs - Date.now()));
    if (m?.punishment_sticker?.animation_url) {
      void tryEnqueueNativeGift({
        id: `pk-punish-${battleId}`,
        url: m.punishment_sticker.animation_url,
        type: (m.punishment_sticker.animation_type as NativeGiftType | null) ?? undefined,
        priority: 50,
        timeoutMs: dur,
      });
    }
  }, [punishmentEndTs, winnerUserId, finalStatus, currentUserId, battleId]);

  // Gift-receive haptic — only fires on the receiving host's device.
  useEffect(() => {
    if (status !== 'active' || !currentUserId) return;
    const myRole =
      currentUserId === challengerId
        ? 'challenger'
        : currentUserId === opponentId
        ? 'opponent'
        : null;
    if (!myRole) return;

    const onGift = (event: Event) => {
      const detail = (event as CustomEvent<GiftSentDetail>).detail;
      if (!detail) return;
      if (detail.receiverId !== currentUserId) return;
      void hapticTick(22);
    };
    window.addEventListener('livekit-gift-sent', onGift as EventListener);
    return () => {
      window.removeEventListener('livekit-gift-sent', onGift as EventListener);
    };
  }, [status, currentUserId, challengerId, opponentId]);
}
