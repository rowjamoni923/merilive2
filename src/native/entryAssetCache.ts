/**
 * Pkg438 Phase B — Cached entry-banner lookup for the native dispatcher.
 *
 * Resolves a user's equipped entry banner / noble entrance animation to
 * the URL + format NativeEntryAnimation needs. Read-side only.
 */
import { supabase } from '@/integrations/supabase/client';
import { detectProfessionalAnimationFormat } from '@/utils/animationFormat';
import { normalizeGiftMediaUrl } from '@/utils/giftMediaUrl';
import type { NativeEntryType } from '@/plugins/NativeEntryAnimation';

export interface ResolvedEntryAsset {
  url: string;
  type: NativeEntryType;
  soundUrl?: string;
  level?: number;
}

interface EntryProfile {
  equipped_entry_banner_id: string | null;
  equipped_noble_card_id: string | null;
  user_level: number | null;
  vip_expires_at: string | null;
  current_vip_tier_id: string | null;
}

const profileCache = new Map<string, { fetchedAt: number; data: EntryProfile | null }>();
const bannerCache = new Map<string, ResolvedEntryAsset | null>();
const nobleCache = new Map<string, ResolvedEntryAsset | null>();
const PROFILE_TTL = 60_000;

function pickEntryFormat(url?: string | null, declared?: string | null): { url: string; type: NativeEntryType } | null {
  const raw = normalizeGiftMediaUrl(url || '');
  if (!raw) return null;
  const fmt = detectProfessionalAnimationFormat(raw, declared || undefined);
  switch (fmt) {
    case 'vap': return { url: raw, type: 'vap' };
    case 'lottie': return { url: raw, type: 'lottie' };
    case 'svga':
    case 'mp4':
    case 'webm':
    case 'pag':
      return null; // not supported by NativeEntryAnimation — let web handle
    case 'gif': case 'webp': case 'png': case 'static': return { url: raw, type: 'image' };
    default: return null;
  }
}

async function fetchEntryBanner(id: string): Promise<ResolvedEntryAsset | null> {
  if (bannerCache.has(id)) return bannerCache.get(id) ?? null;
  try {
    const { data } = await supabase
      .from('entry_banners')
      .select('id,image_url,animation_url,sound_url,animation_format,level_required')
      .eq('id', id)
      .maybeSingle();
    if (!data) { bannerCache.set(id, null); return null; }
    const picked =
      pickEntryFormat(data.animation_url, data.animation_format) ||
      pickEntryFormat(data.image_url, 'image');
    if (!picked) { bannerCache.set(id, null); return null; }
    const resolved: ResolvedEntryAsset = {
      url: picked.url,
      type: picked.type,
      soundUrl: normalizeGiftMediaUrl(data.sound_url || '') || undefined,
      level: data.level_required ?? undefined,
    };
    bannerCache.set(id, resolved);
    return resolved;
  } catch { bannerCache.set(id, null); return null; }
}

async function fetchNobleEntrance(id: string): Promise<ResolvedEntryAsset | null> {
  if (nobleCache.has(id)) return nobleCache.get(id) ?? null;
  try {
    const { data } = await supabase
      .from('noble_cards')
      .select('id,animation_url,animation_format,entrance_animation_url')
      .eq('id', id)
      .maybeSingle();
    if (!data) { nobleCache.set(id, null); return null; }
    const picked =
      pickEntryFormat(data.entrance_animation_url, data.animation_format) ||
      pickEntryFormat(data.animation_url, data.animation_format);
    if (!picked) { nobleCache.set(id, null); return null; }
    const resolved: ResolvedEntryAsset = { url: picked.url, type: picked.type };
    nobleCache.set(id, resolved);
    return resolved;
  } catch { nobleCache.set(id, null); return null; }
}

async function fetchEntryProfile(userId: string): Promise<EntryProfile | null> {
  const cached = profileCache.get(userId);
  if (cached && Date.now() - cached.fetchedAt < PROFILE_TTL) return cached.data;
  try {
    const { data } = await supabase
      .from('profiles')
      .select('equipped_entry_banner_id,equipped_noble_card_id,user_level,vip_expires_at,current_vip_tier_id')
      .eq('id', userId)
      .maybeSingle();
    profileCache.set(userId, { fetchedAt: Date.now(), data: (data as EntryProfile) || null });
    return (data as EntryProfile) || null;
  } catch { return null; }
}

export interface ResolvedEntryForUser extends ResolvedEntryAsset {
  priority: number;
}

export async function resolveEntryForUser(userId: string): Promise<ResolvedEntryForUser | null> {
  if (!userId) return null;
  const profile = await fetchEntryProfile(userId);
  if (!profile) return null;

  // Noble entrance wins (highest priority)
  if (profile.equipped_noble_card_id) {
    const noble = await fetchNobleEntrance(profile.equipped_noble_card_id);
    if (noble) return { ...noble, priority: 500 };
  }

  // Then equipped banner
  if (profile.equipped_entry_banner_id) {
    const banner = await fetchEntryBanner(profile.equipped_entry_banner_id);
    if (banner) {
      const isVip = profile.current_vip_tier_id &&
        (!profile.vip_expires_at || new Date(profile.vip_expires_at).getTime() > Date.now());
      const priority = isVip ? 300 : Math.max(0, Math.min(200, profile.user_level ?? 0));
      return { ...banner, priority };
    }
  }

  return null;
}

export function invalidateEntryProfile(userId: string) {
  profileCache.delete(userId);
}
