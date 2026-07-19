import { useQuery, useQueryClient } from "@tanstack/react-query";
import { adminSupabase } from "@/integrations/supabase/adminClient";
import { useEffect, useState } from "react";
import { getAdminSession, type AdminSession } from "@/utils/adminSession";

interface AdminUser {
  id: string;
  user_id: string | null;
  email: string;
  display_name: string | null;
  role: 'owner' | 'sub_admin';
  is_active: boolean;
  invited_at: string;
  accepted_at: string | null;
  last_login_at: string | null;
}

interface AccessibleSection {
  section_key: string;
  section_name: string;
  hub_key: string;
  can_edit: boolean;
}

/**
 * useAdminAccess - now reads from the dedicated admin session instead of auth.users.
 * This means admin panel works independently from the user app login state.
 */
export const useAdminAccess = () => {
  const [session, setSession] = useState<AdminSession | null>(() => getAdminSession());
  const queryClient = useQueryClient();

  // Re-read session on storage events (cross-tab)
  useEffect(() => {
    const handler = () => setSession(getAdminSession());
    if (typeof window !== 'undefined') {
      const resetHandler = () => {
        queryClient.removeQueries({ queryKey: ['verified-admin-id'] });
        queryClient.removeQueries({ queryKey: ['admin-user'] });
        queryClient.removeQueries({ queryKey: ['admin-accessible-sections'] });
        handler();
      };
      window.addEventListener('storage', resetHandler);
      window.addEventListener('admin-session-change', resetHandler);
      return () => {
        window.removeEventListener('storage', resetHandler);
        window.removeEventListener('admin-session-change', resetHandler);
      };
    }
    return undefined;
  }, [queryClient]);

  const adminId = session?.admin_id ?? null;

  // Server-derived admin id from the x-admin-token header. Never trust the
  // locally stored admin_id/role for permissions because localStorage can be edited.
  const { data: verifiedAdminId, isLoading: isLoadingVerifiedAdmin } = useQuery({
    queryKey: ["verified-admin-id", adminId, session?.session_token],
    queryFn: async () => {
      if (!adminId) return null;
      let { data, error } = await adminSupabase.rpc('current_admin_id_from_header' as any);
      // Self-heal: legacy admin_sessions rows without device_fingerprint break
      // the strict header→admin lookup. Re-run device-access RPC and retry once.
      if ((error || !data) && session?.device_fingerprint) {
        try {
          await adminSupabase.rpc('admin_request_device_access' as any, {
            _admin_id: adminId,
            _device_fingerprint: session.device_fingerprint,
            _device_name: session.display_name || null,
            _device_info: { ua: typeof navigator !== 'undefined' ? navigator.userAgent : null },
            _ip_address: null,
            _user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
          });
          const retry = await adminSupabase.rpc('current_admin_id_from_header' as any);
          data = retry.data as any;
          error = retry.error as any;
        } catch { /* fall through */ }
      }
      if (error || !data) return null;
      return String(data);
    },
    enabled: !!adminId,
    staleTime: Infinity, // Owner link session is stable; verify once per tab mount
    gcTime: 24 * 60 * 60 * 1000,
    retry: false,
  });

  // Fetch admin user record by admin_id (from the dedicated admin session)
  const { data: adminUser, isLoading: isLoadingUser } = useQuery({
      if (!verifiedAdminId) return null;
      const { data, error } = await adminSupabase
        .from("admin_users")
        .select("id, user_id, email, display_name, role, is_active, invited_at, accepted_at, last_login_at")
        .eq("id", verifiedAdminId)
        .eq("is_active", true)
        .maybeSingle();
      if (error || !data) return null;
      return data as AdminUser;
    },
  });

  // Fetch accessible sections — for sub-admin we look up by admin_user_id directly
  const { data: accessibleSections, isLoading: isLoadingSections } = useQuery({
      if (!verifiedAdminId) return [];
      const { data, error } = await adminSupabase
        .from("admin_section_permissions")
        .select(`
          can_edit,
          admin_sections (
            section_key,
            section_name,
            hub_key
          )
        `)
        .eq("admin_user_id", verifiedAdminId);

      if (error || !data) return [];

      return data
        .filter((row: any) => row.admin_sections)
        .map((row: any) => ({
          section_key: row.admin_sections.section_key,
          section_name: row.admin_sections.section_name,
          hub_key: row.admin_sections.hub_key,
          can_edit: !!row.can_edit,
        })) as AccessibleSection[];
    },
  });

  // Admin access loads on mount only. Realtime permission invalidation is disabled
  // so admin pages never refetch while an admin is working.
  useEffect(() => {
    return undefined;
  }, []);

  const isOwner = adminUser?.id === verifiedAdminId && adminUser?.role === 'owner';

  const hasAccessTo = (sectionKey: string): boolean => {
    if (isOwner) return true;
    return accessibleSections?.some(s => s.section_key === sectionKey) ?? false;
  };

  const canEdit = (sectionKey: string): boolean => {
    if (isOwner) return true;
    const section = accessibleSections?.find(s => s.section_key === sectionKey);
    return section?.can_edit ?? false;
  };

  const hasHubAccess = (hubKey: string): boolean => {
    if (isOwner) return true;
    return accessibleSections?.some(s => s.hub_key === hubKey) ?? false;
  };

  const accessibleHubs = isOwner
    ? ['user-hub', 'agency-hub', 'level-hub', 'vip-hub', 'visual-hub', 'trader-hub', 'finance-hub', 'game-hub', 'party-hub', 'content-hub', 'shop-hub', 'settings-hub', 'moderation-hub']
    : [...new Set(accessibleSections?.map(s => s.hub_key) ?? [])];

  return {
    adminUser,
    accessibleSections,
    accessibleHubs,
    isOwner,
    isSubAdmin: !!session && !isOwner,
    isAdmin: !!session && !!verifiedAdminId && !!adminUser,
    hasAccessTo,
    canEdit,
    hasHubAccess,
    isLoading: !!session && ((isLoadingVerifiedAdmin && !verifiedAdminId) || (isLoadingUser && !adminUser) || (isLoadingSections && !accessibleSections && !isOwner)),
    session,
  };
};

export default useAdminAccess;