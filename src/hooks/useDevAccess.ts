import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isDevAccessEmail } from "@/config/devAccess";

/**
 * useDevAccess
 *
 * Returns { hasAccess, loading, email } for the currently logged-in user.
 * hasAccess is true ONLY if the logged-in auth email is in the developer
 * whitelist (see src/config/devAccess.ts).
 *
 * Safe defaults: returns hasAccess=false until auth resolves, and on every
 * SIGNED_OUT event. Never throws. Cancellation-safe on unmount.
 */
export function useDevAccess(): {
  hasAccess: boolean;
  loading: boolean;
  email: string | null;
} {
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;

    const apply = (nextEmail: string | null) => {
      if (cancelled) return;
      setEmail(nextEmail);
      setLoading(false);
    };

    // Initial fetch
    supabase.auth
      .getUser()
      .then(({ data }) => apply(data?.user?.email ?? null))
      .catch(() => apply(null));

    // Live updates on login/logout/token-refresh
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      apply(session?.user?.email ?? null);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return {
    hasAccess: isDevAccessEmail(email),
    loading,
    email,
  };
}
