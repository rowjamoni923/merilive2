import { adminSupabase } from "@/integrations/supabase/adminClient";

/**
 * Returns true if there's an active auth session.
 * Use at the top of admin fetch functions to prevent
 * RLS-rejected queries before auth is ready.
 */
export async function isAdminSessionReady(): Promise<boolean> {
  const { data: { session } } = await adminSupabase.auth.getSession();
  return !!session?.user;
}
