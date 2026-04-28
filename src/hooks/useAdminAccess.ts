import { useQuery, useQueryClient } from "@tanstack/react-query";
import { adminSupabase } from "@/integrations/supabase/adminClient";
import { useEffect, useState } from "react";
import { getAdminSession, type AdminSession } from "@/utils/adminSession";

// Owner emails - hardcoded for absolute certainty
const OWNER_EMAILS = ["smtv923@gmail.com", "sazzadshifa776@gmail.com"];
const ADMIN_ACCESS_EVENT = "admin-access-updated";

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

type AdminAccessEventDetail = {
  adminId: string;
  target: 'user' | 'sections' | 'all';
};

const adminAccessChannelRegistry = new Map<string, { channel: any; listeners: number }>();

function emitAdminAccessUpdate(adminId: string, target: AdminAccessEventDetail['target']) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<AdminAccessEventDetail>(ADMIN_ACCESS_EVENT, {
      detail: { adminId, target },
    })
  );
}

function ensureAdminAccessChannel(adminId: string) {
  const existing = adminAccessChannelRegistry.get(adminId);
  if (existing) {
    existing.listeners += 1;
    return existing.channel;
  }

  const channel = adminSupabase
    .channel(`admin-access-${adminId}-${crypto.randomUUID()}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'admin_users', filter: `id=eq.${adminId}` },
      () => emitAdminAccessUpdate(adminId, 'user')
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'admin_section_permissions', filter: `admin_user_id=eq.${adminId}` },
      () => emitAdminAccessUpdate(adminId, 'sections')
    )
    .subscribe();

  adminAccessChannelRegistry.set(adminId, { channel, listeners: 1 });
  return channel;
}

function releaseAdminAccessChannel(adminId: string) {
  const existing = adminAccessChannelRegistry.get(adminId);
  if (!existing) return;

  if (existing.listeners <= 1) {
    adminSupabase.removeChannel(existing.channel);
    adminAccessChannelRegistry.delete(adminId);
    return;
  }

  existing.listeners -= 1;
}

/**
 * useAdminAccess - now reads from the dedicated admin session instead of auth.users.
 * This means admin panel works independently from the user app login state.
 */
export const useAdminAccess = () => {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<AdminSession | null>(() => getAdminSession());

  // Re-read session on storage events (cross-tab)
  useEffect(() => {
    const handler = () => setSession(getAdminSession());
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', handler);
      window.addEventListener('admin-session-change', handler);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('storage', handler);
        window.removeEventListener('admin-session-change', handler);
      }
    };
  }, []);

  const adminId = session?.admin_id ?? null;

  // Fetch admin user record by admin_id (from the dedicated admin session)
  const { data: adminUser, isLoading: isLoadingUser } = useQuery({
    queryKey: ["admin-user", adminId],
    queryFn: async () => {
      if (!adminId) return null;
      const { data, error } = await adminSupabase
        .from("admin_users")
        .select("*")
        .eq("id", adminId)
        .eq("is_active", true)
        .maybeSingle();
      if (error || !data) return null;
      return data as AdminUser;
    },
    enabled: !!adminId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // Fetch accessible sections — for sub-admin we look up by admin_user_id directly
  const { data: accessibleSections, isLoading: isLoadingSections } = useQuery({
    queryKey: ["admin-accessible-sections", adminId],
    queryFn: async () => {
      if (!adminId) return [];
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
        .eq("admin_user_id", adminId);

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
    enabled: !!adminUser && adminUser.role !== 'owner',
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // Admin access loads on mount only. Realtime permission invalidation is disabled
  // so admin pages never refetch while an admin is working.
  useEffect(() => {
    return undefined;
  }, []);

  const isOwner = !!session?.is_owner ||
                  adminUser?.role === 'owner' ||
                  (!!adminUser?.email && OWNER_EMAILS.includes(adminUser.email.toLowerCase()));

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
    isAdmin: !!session,
    hasAccessTo,
    canEdit,
    hasHubAccess,
    isLoading: !!session && ((isLoadingUser && !adminUser) || (isLoadingSections && !accessibleSections && !isOwner)),
    session,
  };
};

export default useAdminAccess;
