import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Viewer } from "./types";

interface UseViewersOptions {
  streamId?: string;
  roomId?: string;
  enabled?: boolean;
}

export const useViewers = ({ streamId, roomId, enabled = true }: UseViewersOptions) => {
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  const fetchStreamViewers = useCallback(async (sid: string) => {
    if (!sid) return;

    const { data: streamViewers, error } = await supabase
      .from("stream_viewers")
      .select("viewer_id, joined_at")
      .eq("stream_id", sid)
      .is("left_at", null)
      .order("joined_at", { ascending: false });

    if (error) {
      console.error('[useViewers] Error fetching viewers:', error);
      return;
    }

    const viewerIds = (streamViewers || [])
      .map((sv: any) => sv.viewer_id)
      .filter(Boolean);

    const profileMap = new Map<string, any>();

    if (viewerIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, app_uid, display_name, avatar_url, user_level, coins")
        .in("id", viewerIds);

      if (profilesError) {
        console.error('[useViewers] Error fetching viewer profiles:', profilesError);
      }

      profiles?.forEach((profile: any) => {
        profileMap.set(profile.id, profile);
      });
    }

    if (streamViewers && mountedRef.current) {
      const viewerList: Viewer[] = streamViewers.map((sv: any) => {
        const profile = profileMap.get(sv.viewer_id);

        return {
          id: profile?.id || sv.viewer_id,
          app_uid: profile?.app_uid || null,
          display_name: profile?.display_name || "Anonymous",
          avatar_url: profile?.avatar_url || null,
          user_level: profile?.user_level || 1,
          coins: profile?.coins || 0,
          is_vip: (profile?.coins || 0) >= 10000,
          joined_at: sv.joined_at,
        };
      });

      setViewers(viewerList);
      console.log('[useViewers] ✅ Fetched', viewerList.length, 'stream viewers');
    }
  }, []);

  const fetchPartyViewers = useCallback(async (rid: string) => {
    if (!rid) return;

    const { data: partyViewers, error } = await supabase
      .from("party_room_participants")
      .select("user_id, joined_at")
      .eq("room_id", rid)
      .is("left_at", null)
      .order("joined_at", { ascending: false });

    if (error) {
      console.error('[useViewers] Error fetching party viewers:', error);
      return;
    }

    const viewerIds = (partyViewers || [])
      .map((pv: any) => pv.user_id)
      .filter(Boolean);

    const profileMap = new Map<string, any>();

    if (viewerIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, app_uid, display_name, avatar_url, user_level, coins")
        .in("id", viewerIds);

      if (profilesError) {
        console.error('[useViewers] Error fetching party viewer profiles:', profilesError);
      }

      profiles?.forEach((profile: any) => {
        profileMap.set(profile.id, profile);
      });
    }

    if (partyViewers && mountedRef.current) {
      const viewerList: Viewer[] = partyViewers.map((pv: any) => {
        const profile = profileMap.get(pv.user_id);

        return {
          id: profile?.id || pv.user_id,
          app_uid: profile?.app_uid || null,
          display_name: profile?.display_name || "Anonymous",
          avatar_url: profile?.avatar_url || null,
          user_level: profile?.user_level || 1,
          coins: profile?.coins || 0,
          is_vip: (profile?.coins || 0) >= 10000,
          joined_at: pv.joined_at,
        };
      });

      setViewers(viewerList);
      console.log('[useViewers] ✅ Fetched', viewerList.length, 'party viewers');
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    
    if (!enabled) {
      setLoading(false);
      return;
    }

    if (streamId) {
      setLoading(true);
      fetchStreamViewers(streamId).finally(() => {
        if (mountedRef.current) setLoading(false);
      });
      
      // Unique channel name to avoid conflicts with other subscriptions
      const channelName = `unified-panel-stream-viewers-${streamId}-${Date.now()}`;
      const channel = supabase
        .channel(channelName)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "stream_viewers",
          },
          (payload: any) => {
            const changedStreamId = payload.new?.stream_id ?? payload.old?.stream_id;
            if (changedStreamId !== streamId) return;

            console.log('[useViewers] 📡 Real-time stream viewer update');
            fetchStreamViewers(streamId);
          }
        )
        .subscribe();

      // Polling fallback for unstable networks / missed realtime packets
      const pollInterval = setInterval(() => {
        void fetchStreamViewers(streamId);
      }, 3000);

      return () => {
        mountedRef.current = false;
        clearInterval(pollInterval);
        supabase.removeChannel(channel);
      };
    }
    
    if (roomId) {
      setLoading(true);
      fetchPartyViewers(roomId).finally(() => {
        if (mountedRef.current) setLoading(false);
      });
      
      const channelName = `unified-panel-party-viewers-${roomId}-${Date.now()}`;
      const channel = supabase
        .channel(channelName)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "party_room_participants",
          },
          (payload: any) => {
            const changedRoomId = payload.new?.room_id ?? payload.old?.room_id;
            if (changedRoomId !== roomId) return;

            console.log('[useViewers] 📡 Real-time party viewer update');
            fetchPartyViewers(roomId);
          }
        )
        .subscribe();

      // Polling fallback for native apps
      const pollInterval = setInterval(() => {
        fetchPartyViewers(roomId);
      }, 3000);

      return () => {
        mountedRef.current = false;
        clearInterval(pollInterval);
        supabase.removeChannel(channel);
      };
    }
    
    setLoading(false);
    return () => {
      mountedRef.current = false;
    };
  }, [streamId, roomId, enabled, fetchStreamViewers, fetchPartyViewers]);

  const refetch = useCallback(() => {
    if (streamId) return fetchStreamViewers(streamId);
    if (roomId) return fetchPartyViewers(roomId);
    return Promise.resolve();
  }, [streamId, roomId, fetchStreamViewers, fetchPartyViewers]);

  return { viewers, loading, refetch };
};
