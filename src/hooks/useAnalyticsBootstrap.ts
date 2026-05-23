import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Analytics } from '@/plugins/Analytics';

/**
 * Pkg213 — One-time analytics bootstrap.
 * - Attaches global error / unhandledrejection handlers → Crashlytics
 * - Syncs Supabase user id to Firebase Analytics + Crashlytics
 */
export function useAnalyticsBootstrap() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      Analytics.recordError(e.message || 'window.error', e.error?.stack);
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const reason: any = e.reason;
      Analytics.recordError(
        typeof reason === 'string' ? reason : reason?.message || 'unhandledrejection',
        reason?.stack,
      );
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);

    // Initial user id + auth changes
    supabase.auth.getUser().then(({ data }) => {
      Analytics.setUserId(data.user?.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      Analytics.setUserId(session?.user?.id ?? null);
    });

    Analytics.log('app_boot');
    Analytics.logEvent('app_open');

    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
      sub.subscription.unsubscribe();
    };
  }, []);
}
