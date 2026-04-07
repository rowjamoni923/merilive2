import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";

interface FeatureRequirement {
  id: string;
  feature_key: string;
  feature_name: string;
  min_level_user: number;
  min_level_host: number;
  is_active: boolean;
}

interface CheckResult {
  canAccess: boolean;
  requiredLevel: number;
  currentLevel: number;
  isHost: boolean;
  featureName: string;
}

export const useFeatureLevelCheck = () => {
  const queryClient = useQueryClient();
  
  const { data: requirements, isLoading } = useQuery({
    queryKey: ["feature-level-requirements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feature_level_requirements")
        .select("*")
        .eq("is_active", true);

      if (error) throw error;
      console.log("[useFeatureLevelCheck] Loaded requirements:", data);
      return data as FeatureRequirement[];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - this data rarely changes
  });

  // Real-time subscription for instant updates
  useEffect(() => {
    const channelName = `feature-level-realtime-${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'feature_level_requirements' }, 
        () => {
          console.log("[useFeatureLevelCheck] Real-time update received");
          queryClient.invalidateQueries({ queryKey: ["feature-level-requirements"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const checkFeatureAccess = (
    featureKey: string,
    userLevel: number,
    isHost: boolean
  ): CheckResult => {
    // CRITICAL FIX: If requirements haven't loaded yet, DENY access by default
    // This prevents bypass during the loading window
    if (!requirements || requirements.length === 0) {
      console.log(`[useFeatureLevelCheck] ⚠️ Requirements not loaded yet - DENYING access for ${featureKey}`);
      return {
        canAccess: false,
        requiredLevel: 1,
        currentLevel: userLevel,
        isHost,
        featureName: featureKey,
      };
    }
    
    const requirement = requirements.find((r) => r.feature_key === featureKey);
    
    console.log(`[useFeatureLevelCheck] Checking ${featureKey}: userLevel=${userLevel}, isHost=${isHost}, requirement=`, requirement);

    if (!requirement) {
      // Feature not configured in admin panel - allow access
      return {
        canAccess: true,
        requiredLevel: 0,
        currentLevel: userLevel,
        isHost,
        featureName: featureKey,
      };
    }

    const requiredLevel = isHost ? requirement.min_level_host : requirement.min_level_user;
    const canAccess = userLevel >= requiredLevel;
    
    console.log(`[useFeatureLevelCheck] Result: requiredLevel=${requiredLevel}, canAccess=${canAccess}`);

    return {
      canAccess,
      requiredLevel,
      currentLevel: userLevel,
      isHost,
      featureName: requirement.feature_name,
    };
  };

  const getRequirement = (featureKey: string): FeatureRequirement | undefined => {
    return requirements?.find((r) => r.feature_key === featureKey);
  };

  return {
    requirements,
    checkFeatureAccess,
    getRequirement,
    isLoading,
  };
};

export default useFeatureLevelCheck;
