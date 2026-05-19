// Lightweight, batched gender + viewer-id cache used by AvatarWithFrame and
// FramedAvatarWithPrivileges so every avatar surface in the app (chat, leaderboard,
// live overlays, party seats, rankings, search results …) can show a gender-aware
// AI placeholder for profiles without a real photo — WITHOUT each call-site needing
// to pass `gender` or `isOwner`.
//
// - One profiles_public query per ~30ms tick batches all requested userIds.
// - Viewer id (auth.uid) is fetched once at module init.
// - The cache is read-only/append-only; entries never expire (profile gender rarely
//   changes; full reload picks up changes naturally).
import { supabase } from "@/integrations/supabase/client";

type Gender = "male" | "female" | null;

interface GenderRecord {
  gender: Gender;
  is_host: boolean;
}

const genderCache = new Map<string, GenderRecord>();
const pending = new Set<string>();
const resolvers = new Map<string, Array<() => void>>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

let viewerId: string | null = null;
let viewerLoaded = false;
let viewerLoadPromise: Promise<void> | null = null;

export function getCachedGender(userId: string): GenderRecord | undefined {
  return genderCache.get(userId);
}

export function getCachedViewerId(): string | null {
  return viewerId;
}

export function setCachedGender(userId: string, gender: Gender, isHost: boolean) {
  genderCache.set(userId, { gender: gender ?? null, is_host: !!isHost });
}

export function ensureViewerLoaded(): Promise<void> {
  if (viewerLoaded) return Promise.resolve();
  if (viewerLoadPromise) return viewerLoadPromise;
  viewerLoadPromise = supabase.auth.getUser().then(({ data }) => {
    viewerId = data.user?.id ?? null;
    viewerLoaded = true;
  }).catch(() => {
    viewerLoaded = true;
  });
  return viewerLoadPromise;
}

// Keep viewer id in sync with auth state.
supabase.auth.onAuthStateChange((_event, session) => {
  viewerId = session?.user?.id ?? null;
  viewerLoaded = true;
});

async function flush() {
  const ids = Array.from(pending);
  pending.clear();
  flushTimer = null;
  if (ids.length === 0) return;

  try {
    const { data } = await supabase
      .from("profiles_public")
      .select("id, gender, is_host")
      .in("id", ids);

    const map = new Map<string, any>();
    (data || []).forEach((r: any) => map.set(r.id, r));

    ids.forEach((id) => {
      const r = map.get(id);
      const raw = (r?.gender ?? "").toString().toLowerCase();
      const gender: Gender = raw === "female" ? "female" : raw === "male" ? "male" : null;
      genderCache.set(id, { gender, is_host: !!r?.is_host });
      (resolvers.get(id) || []).forEach((fn) => fn());
      resolvers.delete(id);
    });
  } catch {
    ids.forEach((id) => {
      // Resolve anyway so UI doesn't hang; leave cache empty so subsequent retries are possible.
      (resolvers.get(id) || []).forEach((fn) => fn());
      resolvers.delete(id);
    });
  }
}

export function requestGender(userId: string): Promise<void> {
  if (!userId) return Promise.resolve();
  if (genderCache.has(userId)) return Promise.resolve();
  return new Promise((resolve) => {
    const arr = resolvers.get(userId) || [];
    arr.push(resolve);
    resolvers.set(userId, arr);
    pending.add(userId);
    if (!flushTimer) flushTimer = setTimeout(flush, 30);
  });
}
