import { supabase } from "@/integrations/supabase/client";

// Cached auth user - avoids redundant getUser() calls across pages
let cachedUser: { id: string; email?: string } | null = null;
let cachedUserPromise: Promise<{ id: string; email?: string } | null> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60_000; // 1 minute

/**
 * Get the current authenticated user with caching.
 * Eliminates redundant supabase.auth.getUser() calls across page navigations.
 * Every page was calling getUser() independently, adding ~200-400ms per navigation.
 */
export async function getCachedUser(): Promise<{ id: string; email?: string } | null> {
  const now = Date.now();
  
  // Return cached user if fresh
  if (cachedUser && (now - cacheTimestamp) < CACHE_TTL) {
    return cachedUser;
  }
  
  // Deduplicate concurrent calls
  if (cachedUserPromise) {
    return cachedUserPromise;
  }
  
  cachedUserPromise = (async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user ?? null;
      cachedUser = user ? { id: user.id, email: user.email ?? undefined } : null;
      cacheTimestamp = Date.now();
      return cachedUser;
    } catch {
      return null;
    } finally {
      cachedUserPromise = null;
    }
  })();
  
  return cachedUserPromise;
}

/**
 * Invalidate the cached user (call on sign-out or auth state change)
 */
export function invalidateCachedUser() {
  cachedUser = null;
  cachedUserPromise = null;
  cacheTimestamp = 0;
}

/**
 * Set cached user directly (call from auth state listener to pre-warm)
 */
export function setCachedUser(user: { id: string; email?: string } | null) {
  cachedUser = user;
  cacheTimestamp = Date.now();
}
