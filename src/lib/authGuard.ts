/**
 * Global Auth Guard — Layer 1 of the app-wide reliability stack.
 *
 * Single source of truth for "session is invalid, get the user back to /auth".
 * Any layer (apiClient, React Query, realtime, raw fetch) can call
 * `triggerAuthGuard()` and the user will be redirected exactly once, with a
 * toast and without race conditions across 400+ pages.
 */
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type GuardReason = 'session_expired' | 'signed_out' | 'forbidden';

let firing = false;
let lastFiredAt = 0;
const COOLDOWN_MS = 5_000;

const PUBLIC_PATHS = ['/auth', '/reset-password', '/unsubscribe', '/~oauth'];

function isOnPublicPath(): boolean {
  if (typeof window === 'undefined') return true;
  const path = window.location.pathname;
  return PUBLIC_PATHS.some(p => path.startsWith(p));
}

/**
 * Force a return to /auth. Safe to call from anywhere, any number of times —
 * it de-dupes within a 5 s window and never fires on public pages.
 */
export async function triggerAuthGuard(reason: GuardReason = 'session_expired'): Promise<void> {
  if (firing) return;
  if (Date.now() - lastFiredAt < COOLDOWN_MS) return;
  if (isOnPublicPath()) return;

  firing = true;
  lastFiredAt = Date.now();

  try {
    if (reason === 'session_expired') {
      // Quiet attempt to recover before showing UI.
      try {
        const { data } = await supabase.auth.refreshSession();
        if (data?.session) {
          firing = false;
          return;
        }
      } catch {
        /* fall through */
      }
    }

    try { await supabase.auth.signOut({ scope: 'local' }); } catch { /* ignore */ }

    const messages: Record<GuardReason, string> = {
      session_expired: 'Session expired. Please sign in again.',
      signed_out: 'You have been signed out.',
      forbidden: 'You do not have access to this page.',
    };
    try { toast.error(messages[reason]); } catch { /* ignore */ }

    if (typeof window !== 'undefined') {
      const back = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.replace(`/auth?next=${back}`);
    }
  } finally {
    // Keep firing=true; navigation will tear the page down anyway.
    setTimeout(() => { firing = false; }, COOLDOWN_MS);
  }
}

/**
 * Inspect an arbitrary thrown value and trigger the guard if it looks like
 * an auth failure. Returns true if the guard fired.
 */
export function maybeTriggerAuthGuardFromError(err: unknown): boolean {
  const status = (err as { status?: number; statusCode?: number })?.status
    ?? (err as { statusCode?: number })?.statusCode;
  const code = (err as { code?: string })?.code;
  const message = (err as { message?: string })?.message?.toLowerCase() ?? '';

  const looksLikeAuth =
    status === 401 ||
    code === 'PGRST301' ||
    code === '401' ||
    message.includes('jwt') ||
    message.includes('unauthorized') ||
    message.includes('session') && message.includes('expire');

  if (looksLikeAuth) {
    void triggerAuthGuard('session_expired');
    return true;
  }
  return false;
}
