import { supabase } from "@/integrations/supabase/client";

/**
 * Returns true if there's an active auth session.
 * Use at the top of admin fetch functions to prevent
 * RLS-rejected queries before auth is ready.
 */
export async function isAdminSessionReady(): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession();
  return !!session?.user;
}
