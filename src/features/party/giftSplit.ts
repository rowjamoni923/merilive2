/**
 * PR-2.5 — Party Room gift split helper (mirrors `record_party_gift_split` RPC).
 *
 * Pure functions ONLY — no Supabase calls. The RPC is server-authoritative;
 * this util is for optimistic UI (per-seat bean badges, host card total)
 * so `seatBeansReceived` updates instantly without waiting for the safety-net.
 *
 * Default split (research-locked from Chamet/Bigo/Poppo, see plan.md PR-2.5):
 *   host_pct      = 60
 *   speakers_pct  = 40 (split equally across occupied non-host speakers)
 *   rounding remainder folds back to host
 *   if no speakers, host gets 100%
 */

export interface GiftSplitConfig {
  host_pct: number;
  speakers_pct: number;
}

export const DEFAULT_GIFT_SPLIT: GiftSplitConfig = { host_pct: 60, speakers_pct: 40 };

export interface GiftSplitResult {
  /** Map of receiver_id -> beans earned. */
  perReceiver: Record<string, number>;
  hostBeans: number;
  perSpeakerBeans: number;
  speakerCount: number;
}

/**
 * Compute server-equivalent split for optimistic UI.
 *
 * @param hostId       Current room host's user_id.
 * @param speakerIds   Non-host user_ids currently seated.
 * @param totalBeans   Total beans the gift generates (already host-commission-applied).
 * @param config       Optional override; falls back to DEFAULT_GIFT_SPLIT.
 */
export function computeGiftSplit(
  hostId: string,
  speakerIds: string[],
  totalBeans: number,
  config: GiftSplitConfig = DEFAULT_GIFT_SPLIT,
): GiftSplitResult {
  if (!Number.isFinite(totalBeans) || totalBeans <= 0 || !hostId) {
    return { perReceiver: {}, hostBeans: 0, perSpeakerBeans: 0, speakerCount: 0 };
  }

  const hostPct = Number.isFinite(config.host_pct) ? config.host_pct : 60;
  const speakersPct = Number.isFinite(config.speakers_pct) ? config.speakers_pct : 40;
  const validSum = hostPct + speakersPct === 100;
  const hp = validSum ? hostPct : 60;
  // const sp = validSum ? speakersPct : 40; // unused; pool derived below

  const uniqueSpeakers = Array.from(new Set(speakerIds.filter((id) => id && id !== hostId)));
  const speakerCount = uniqueSpeakers.length;

  if (speakerCount === 0) {
    return {
      perReceiver: { [hostId]: totalBeans },
      hostBeans: totalBeans,
      perSpeakerBeans: 0,
      speakerCount: 0,
    };
  }

  let hostBeans = Math.floor((totalBeans * hp) / 100);
  const speakersPool = totalBeans - hostBeans;
  const perSpeaker = Math.floor(speakersPool / speakerCount);
  // Rounding remainder back to host (matches RPC behavior).
  hostBeans += speakersPool - perSpeaker * speakerCount;

  const perReceiver: Record<string, number> = { [hostId]: hostBeans };
  for (const sid of uniqueSpeakers) {
    perReceiver[sid] = (perReceiver[sid] ?? 0) + perSpeaker;
  }

  return { perReceiver, hostBeans, perSpeakerBeans: perSpeaker, speakerCount };
}
