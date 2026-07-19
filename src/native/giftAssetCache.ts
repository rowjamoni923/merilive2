/**
 * Pkg438 Phase B — Cached gift-row lookup for the native dispatcher.
 *
 * Resolves a `gift_id` to the asset URL + format the NativeGiftAnimation
 * plugin needs. Pure read-side; never edits forbidden web components.
 *
 * Caches forever in memory (gift rows are stable) + de-dupes in-flight
 * fetches so a 100-quantity batch only triggers one network call.
 */
import { supabase } from '@/integrations/supabase/client';
import { detectProfessionalAnimationFormat } from '@/utils/animationFormat';
import { normalizeGiftMediaUrl } from '@/utils/giftMediaUrl';
import type { NativeGiftType } from '@/plugins/NativeGiftAnimation';

export interface ResolvedGiftAsset {
  id: string;
  name: string;
  url: string;
  type: NativeGiftType;
  soundUrl?: string;
  diamonds: number;
}

type GiftRow = {
  id: string;
  name: string | null;
  icon_url: string | null;
  animation_url: string | null;
  svga_url: string | null;
  lottie_url: string | null;
  animation_format: string | null;
  animation_type: string | null;
  sound_url: string | null;
  price?: number | null;
  cost?: number | null;
  diamonds?: number | null;
};

const cache = new Map<string, ResolvedGiftAsset | null>();
const inFlight = new Map<string, Promise<ResolvedGiftAsset | null>>();

function pickFormat(row: GiftRow): { url: string; type: NativeGiftType } | null {
  const declared = (row.animation_format || row.animation_type || '').toLowerCase();
  const candidates: Array<{ url?: string | null; declared?: string }> = [
    { url: row.svga_url, declared: 'svga' },
    { url: row.lottie_url, declared: 'lottie' },
    { url: row.animation_url, declared },
    { url: row.icon_url, declared: 'image' },
  ];
  for (const c of candidates) {
    const raw = normalizeGiftMediaUrl(c.url || '');
    if (!raw) continue;
    const fmt = detectProfessionalAnimationFormat(raw, c.declared || declared);
    switch (fmt) {
      case 'vap': return { url: raw, type: 'vap' };
      case 'svga': return { url: raw, type: 'svga' };
      case 'lottie': return { url: raw, type: 'lottie' };
      case 'mp4': case 'webm': return { url: raw, type: 'mp4' };
      case 'gif': case 'webp': case 'png': case 'static': return { url: raw, type: 'image' };
      default: continue; // 'pag' and unknowns: skip — let WebView path handle
    }
  }
  return null;
}

export async function resolveGiftAsset(giftId: string): Promise<ResolvedGiftAsset | null> {
  if (!giftId) return null;
  if (cache.has(giftId)) return cache.get(giftId) ?? null;
  const pending = inFlight.get(giftId);
  if (pending) return pending;

  const p = (async () => {
    try {
      const { data, error } = await supabase
        .from('gifts')
        .select('id,name,icon_url,animation_url,svga_url,lottie_url,animation_format,animation_type,sound_url,price,cost,diamonds')
        .eq('id', giftId)
        .maybeSingle();
      if (error || !data) { cache.set(giftId, null); return null; }
      const row = data as GiftRow;
      const picked = pickFormat(row);
      if (!picked) { cache.set(giftId, null); return null; }
      const diamonds = Number(row.diamonds ?? row.price ?? row.cost ?? 0) || 0;
      const resolved: ResolvedGiftAsset = {
        id: row.id,
        name: row.name || '',
        url: picked.url,
        type: picked.type,
        soundUrl: normalizeGiftMediaUrl(row.sound_url || '') || undefined,
        diamonds,
      };
      cache.set(giftId, resolved);
      return resolved;
    } catch {
      cache.set(giftId, null);
      return null;
    } finally {
      inFlight.delete(giftId);
    }
  })();

  inFlight.set(giftId, p);
  return p;
}

export function primeGiftAssetCache(rows: Array<Partial<GiftRow> & { id: string }>) {
  for (const r of rows) {
    if (cache.has(r.id)) continue;
    const picked = pickFormat(r as GiftRow);
    if (!picked) { cache.set(r.id, null); continue; }
    const diamonds = Number((r as any).diamonds ?? (r as any).price ?? (r as any).cost ?? 0) || 0;
    cache.set(r.id, {
      id: r.id,
      name: r.name || '',
      url: picked.url,
      type: picked.type,
      soundUrl: normalizeGiftMediaUrl(r.sound_url || '') || undefined,
      diamonds,
    });
  }
}
