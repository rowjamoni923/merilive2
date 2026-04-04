import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";
import { hasOwnerAccessFlag } from "@/utils/adminAccessStorage";

// Owner emails - hardcoded for absolute certainty
const OWNER_EMAILS = ["smtv923@gmail.com", "sazzadshifa776@gmail.com"];

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

export const useAdminAccess = () => {
  const queryClient = useQueryClient();
  const ownerFlag = hasOwnerAccessFlag();

  // Get current admin user info - with longer cache time to prevent loading flash
  const { data: adminUser, isLoading: isLoadingUser, isFetching: isFetchingUser } = useQuery({
    queryKey: ["admin-user"],
    queryFn: async () => {
      const [{ data: { session } }, { data: userResult }] = await Promise.all([
        supabase.auth.getSession(),
        supabase.auth.getUser(),
      ]);
      const user = session?.user ?? userResult.user ?? null;
      if (!user) {
        console.log("[useAdminAccess] No auth user found");
        return null;
      }
      
      console.log("[useAdminAccess] Fetching admin user for:", user.id, user.email);

      // Try by user_id first
      let { data, error } = await supabase
        .from("admin_users")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .single();

      // Fallback: try by email if user_id not linked yet
      if (error && user.email) {
        console.log("[useAdminAccess] Trying email fallback:", user.email);
        const emailResult = await supabase
          .from("admin_users")
          .select("*")
          .eq("email", user.email.toLowerCase())
          .eq("is_active", true)
          .single();
        
        if (!emailResult.error && emailResult.data) {
          data = emailResult.data;
          error = null;
          // Auto-link user_id for future logins
          await supabase
            .from("admin_users")
            .update({ user_id: user.id })
            .eq("id", emailResult.data.id);
          console.log("[useAdminAccess] Auto-linked user_id for:", user.email);
        }
      }

      if (error || !data) {
        console.log("[useAdminAccess] No admin record found:", error?.message);
        return null;
      }
      
      console.log("[useAdminAccess] Admin user found:", data?.email, "Role:", data?.role);

      return data as AdminUser;
    },
    enabled: !ownerFlag,
    staleTime: 5 * 60 * 1000, // 5 minutes - prevent refetching on every page change
    gcTime: 10 * 60 * 1000, // 10 minutes cache
  });

  // Get accessible sections for current user - with caching
  const { data: accessibleSections, isLoading: isLoadingSections } = useQuery({
    queryKey: ["admin-accessible-sections"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .rpc("get_accessible_sections", { _user_id: user.id });

      if (error) {
        console.error("[useAdminAccess] Error fetching sections:", error);
        return [];
      }

      return data as AccessibleSection[];
    },
    enabled: !!adminUser && !ownerFlag,
    staleTime: 5 * 60 * 1000, // 5 minutes - prevent refetching on page navigation
    gcTime: 10 * 60 * 1000, // 10 minutes cache
  });

  // Real-time subscription for permission changes
  useEffect(() => {
    const channel = supabase
      .channel('admin-access-realtime')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'admin_users' }, 
        () => {
          queryClient.invalidateQueries({ queryKey: ["admin-user"] });
        }
      )
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'admin_section_permissions' }, 
        () => {
          queryClient.invalidateQueries({ queryKey: ["admin-accessible-sections"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);


  // Refetch admin access immediately when auth session restores after refresh
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        queryClient.invalidateQueries({ queryKey: ["admin-user"] });
        queryClient.invalidateQueries({ queryKey: ["admin-accessible-sections"] });
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [queryClient]);

  // Check if user is owner - local owner flag has highest priority for instant rendering
  const isOwner = ownerFlag || adminUser?.role === 'owner' || (!!adminUser?.email && OWNER_EMAILS.includes(adminUser.email));

  // Check if user has access to a specific section
  const hasAccessTo = (sectionKey: string): boolean => {
    if (isOwner) return true;
    return accessibleSections?.some(s => s.section_key === sectionKey) ?? false;
  };

  // Check if user can edit a specific section
  const canEdit = (sectionKey: string): boolean => {
    if (isOwner) return true;
    const section = accessibleSections?.find(s => s.section_key === sectionKey);
    return section?.can_edit ?? false;
  };

  // Check if user has access to a hub
  const hasHubAccess = (hubKey: string): boolean => {
    if (isOwner) return true;
    return accessibleSections?.some(s => s.hub_key === hubKey) ?? false;
  };

  // Get all accessible hub keys
  const accessibleHubs = isOwner 
    ? ['user-hub', 'agency-hub', 'level-hub', 'vip-hub', 'visual-hub', 'trader-hub', 'finance-hub', 'game-hub', 'party-hub', 'content-hub', 'shop-hub', 'settings-hub', 'moderation-hub']
    : [...new Set(accessibleSections?.map(s => s.hub_key) ?? [])];

  return {
    adminUser,
    accessibleSections,
    accessibleHubs,
    isOwner,
    isSubAdmin: adminUser?.role === 'sub_admin',
    isAdmin: ownerFlag || !!adminUser,
    hasAccessTo,
    canEdit,
    hasHubAccess,
    // Owner flag path never blocks UI
    isLoading: ownerFlag ? false : ((isLoadingUser && !adminUser) || (isLoadingSections && !accessibleSections)),
  };
};

export default useAdminAccess;
