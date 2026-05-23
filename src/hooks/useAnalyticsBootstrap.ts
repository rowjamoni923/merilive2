import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Analytics } from '@/plugins/Analytics';
import { getConsent, onConsentChange, applyConsent } from '@/lib/privacyConsent';

/**
 * Pkg213 — Analytics bootstrap.
 * Pkg223 — Gated by privacy consent. When the user has not opted in
 * (null or "denied"), we still wire error handlers (Crashlytics is a
 * crash-quality signal users expect) but skip event/user-id reporting
 * until consent flips to "granted".
 */
export function useAnalyticsBootstrap() {
  useEffect(() => {
    // Apply current consent to the native layer up-front.
    applyConsent(getConsent());

    const isAllowed = () => getConsent() === 'granted';

    const onError = (e: ErrorEvent) => {
      if (!isAllowed()) return;
      Analytics.recordError(e.message || 'window.error', e.error?.stack);
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      if (!isAllowed()) return;
      const reason: any = e.reason;
      Analytics.recordError(
        typeof reason === 'string' ? reason : reason?.message || 'unhandledrejection',
        reason?.stack,
      );
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);

    // Initial user id + auth changes — only when consented.
    const syncUser = (uid: string | null) => {
      if (!isAllowed()) {
        Analytics.setUserId(null);
        return;
      }
      Analytics.setUserId(uid);
    };

    supabase.auth.getUser().then(({ data }) => syncUser(data.user?.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      syncUser(session?.user?.id ?? null);
    });

    if (isAllowed()) {
      Analytics.log('app_boot');
      Analytics.logEvent('app_open');
    }

    // React to consent flips: re-sync user + emit first opt-in event.
    const offConsent = onConsentChange((state) => {
      if (state === 'granted') {
        supabase.auth.getUser().then(({ data }) => {
          Analytics.setUserId(data.user?.id ?? null);
          Analytics.logEvent('analytics_opt_in');
        });
      } else {
        Analytics.setUserId(null);
      }
    });

    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
      sub.subscription.unsubscribe();
      offConsent();
    };
  }, []);
}
