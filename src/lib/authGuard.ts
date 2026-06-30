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

// Admin panel uses a fully isolated supabase client (`adminSupabase` with
// `x-admin-token` header). The main-app supabase session is irrelevant there,
// so a missing/expired main-app JWT must NEVER bounce an admin user to /auth.
// Also exclude all standalone public/legal/share/landing routes so background
// JWT errors on those pages don't yank visitors into the app login form.
const PUBLIC_PATH_PREFIXES = [
  '/admin',
  '/csa-login',
  '/country-admin',
  '/super-admin',
  '/share',
  '/link',
  '/smart-link',
  '/policies',
  '/policies-benefits',
  '/privacy',
  '/privacy-policy',
  '/terms',
  '/account-deletion',
  '/delete-account',
  '/google-library-order-rules',
  '/about',
  '/contact',
  '/support',
  '/agency-policy',
  '/helper-policy',
  '/create-agency',
  '/agency-signup',
  '/become-sub-agent',
  '/payroll-helper-guide',
  '/landing',
  '/download',
];

function isOnPublicPath(): boolean {
  if (typeof window === 'undefined') return true;
  const path = window.location.pathname;
  if (PUBLIC_PATHS.some(p => path === p || path.startsWith(p + '/') || path.startsWith(p + '?'))) return true;
  return PUBLIC_PATH_PREFIXES.some(p => path === p || path.startsWith(p + '/') || path.startsWith(p + '?'));
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
 * Inspect an arbitrary thrown value and trigger the guard ONLY when the
 * current Supabase session is genuinely invalid.
 *
 * Important: a 401 from an edge function does NOT necessarily mean the
 * user's session is dead. Many edge functions return 401 for their own
 * authorization reasons (missing role, IP block, custom JWT, etc.).
 * Logging the user out on every such 401 would be a regression.
 *
 * Strategy:
 *  1. Quickly detect "auth-shaped" errors (PostgREST JWT errors, explicit
 *     session-expired strings).
 *  2. Re-validate with `supabase.auth.getSession()` — only if there is
 *     no session (or refresh fails) do we trigger the guard.
 *
 * Returns true if the guard was scheduled to fire.
 */
export function maybeTriggerAuthGuardFromError(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  const message = (err as { message?: string })?.message?.toLowerCase() ?? '';

  // PostgREST returns PGRST301 specifically for JWT issues.
  // The string "jwt expired" / "jwt malformed" come from Supabase auth itself.
  const looksLikeSupabaseAuth =
    code === 'PGRST301' ||
    message.includes('jwt expired') ||
    message.includes('jwt malformed') ||
    message.includes('invalid jwt') ||
    message.includes('refresh token') && message.includes('not found') ||
    (message.includes('session') && message.includes('expire'));

  if (!looksLikeSupabaseAuth) return false;

  // Verify before redirecting — getSession() is local & cheap.
  void (async () => {
    try {
      const { data } = await supabase.auth.getSession();
      if (!data?.session) {
        await triggerAuthGuard('session_expired');
      }
    } catch {
      await triggerAuthGuard('session_expired');
    }
  })();
  return true;
}
