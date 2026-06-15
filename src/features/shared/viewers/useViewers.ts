import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Viewer } from "./types";
import { getRequiredDisplayLevel } from "@/utils/stableLevel";

interface UseViewersOptions {
  streamId?: string;
  roomId?: string;
  enabled?: boolean;
}

/**
 * Viewer list snapshot + LiveKit event patching.
 * - Uses `profiles_public` view for the initial/late-join snapshot only.
 * - NO Supabase Realtime channels / postgres_changes subscriptions.
 * - Live updates come from existing LiveKit window events emitted by the room.
 */
export const useViewers = ({ streamId, roomId, enabled = true }: UseViewersOptions) => {
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);
  const activeKeyRef = useRef('');

  const hydrateProfiles = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return new Map<string, any>();
    const map = new Map<string, any>();
    const { data, error } = await supabase
      .from("profiles_public" as any)
      .select("id, app_uid, display_name, avatar_url, user_level, host_level, max_user_level, gender, is_host")
      .in("id", ids);
    if (error) {
      console.warn("[useViewers] profiles_public fetch error:", error.message);
    }
    (data as any[] | null)?.forEach((p) => map.set(p.id, p));
    return map;
  }, []);

  const buildViewer = (id: string, joined_at: string, profile: any | undefined): Viewer => ({
    id: profile?.id || id,
    app_uid: profile?.app_uid || null,
    display_name: profile?.display_name || "Anonymous",
    avatar_url: profile?.avatar_url || null,
    user_level: getRequiredDisplayLevel(profile),
    is_vip: getRequiredDisplayLevel(profile) >= 5,
    joined_at,
  });

  const fetchStreamViewers = useCallback(async (sid: string, requestKey = `stream:${sid}`) => {
    const { data: sv, error } = await supabase
      .from("stream_viewers")
      .select("viewer_id, joined_at")
      .eq("stream_id", sid)
      .is("left_at", null)
      .order("joined_at", { ascending: false });
    if (error) return console.error("[useViewers] stream_viewers error:", error);
    const ids = (sv || []).map((r: any) => r.viewer_id).filter(Boolean);
    const profiles = await hydrateProfiles(ids);
    if (!mountedRef.current || activeKeyRef.current !== requestKey) return;
    setViewers((sv || []).map((r: any) => buildViewer(r.viewer_id, r.joined_at, profiles.get(r.viewer_id))));
  }, [hydrateProfiles]);

  const fetchPartyViewers = useCallback(async (rid: string, requestKey = `party:${rid}`) => {
    const { data: pv, error } = await supabase
      .from("party_room_participants")
      .select("user_id, joined_at")
      .eq("room_id", rid)
      .is("left_at", null)
      .order("joined_at", { ascending: false });
    if (error) return console.error("[useViewers] party_room_participants error:", error);
    const ids = (pv || []).map((r: any) => r.user_id).filter(Boolean);
    const profiles = await hydrateProfiles(ids);
    if (!mountedRef.current || activeKeyRef.current !== requestKey) return;
    setViewers((pv || []).map((r: any) => buildViewer(r.user_id, r.joined_at, profiles.get(r.user_id))));
  }, [hydrateProfiles]);

  // Incremental insert — push viewer instantly, hydrate profile in background
  const insertViewer = useCallback(async (id: string, joined_at: string) => {
    if (!id) return;
    setViewers((curr) => {
      if (curr.some((v) => v.id === id)) return curr; // dedupe
      return [buildViewer(id, joined_at, undefined), ...curr];
    });
    const profiles = await hydrateProfiles([id]);
    const p = profiles.get(id);
    if (!p || !mountedRef.current) return;
    setViewers((curr) => curr.map((v) => (v.id === id ? buildViewer(id, v.joined_at, p) : v)));
  }, [hydrateProfiles]);

  const removeViewer = useCallback((id: string) => {
    if (!id) return;
    setViewers((curr) => curr.filter((v) => v.id !== id));
  }, []);

  const upsertViewerFromPacket = useCallback((viewer: Viewer) => {
    if (!viewer.id) return;
    setViewers((curr) => [viewer, ...curr.filter((v) => v.id !== viewer.id)]);
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    if (!enabled || (!streamId && !roomId)) {
      setLoading(false);
      return () => { mountedRef.current = false; };
    }

    const isStream = !!streamId;
    const id = (streamId || roomId) as string;
    const requestKey = `${isStream ? 'stream' : 'party'}:${id}`;
    activeKeyRef.current = requestKey;

    setLoading(true);
    (isStream ? fetchStreamViewers(id, requestKey) : fetchPartyViewers(id, requestKey)).finally(() => {
      if (mountedRef.current && activeKeyRef.current === requestKey) setLoading(false);
    });

    const handleLiveEvent = (evt: Event) => {
      if (!isStream) return;
      const detail = (evt as CustomEvent).detail;
      const payload = detail?.payload;
      if (!payload || payload.streamId !== id) return;
      if (payload.type === 'viewer_left') {
        removeViewer(payload.userId);
        return;
      }
      if (payload.type === 'viewer_joined') {
        upsertViewerFromPacket({
          id: payload.userId,
          app_uid: payload.appUid || null,
          display_name: payload.userName || 'User',
          avatar_url: payload.userAvatar || null,
          user_level: payload.userLevel ?? 1,
          is_vip: (payload.userLevel ?? 1) >= 5,
          joined_at: new Date(payload.timestamp || Date.now()).toISOString(),
        });
      }
    };

    const handlePartyEvent = (evt: Event) => {
      if (isStream) return;
      const detail = (evt as CustomEvent).detail;
      const payload = detail?.payload;
      if (!payload || payload.roomId !== id) return;
      if (payload.type === 'participant_left') {
        removeViewer(payload.userId);
        return;
      }
      if (payload.type === 'participant_joined') {
        upsertViewerFromPacket({
          id: payload.userId,
          display_name: payload.userName || 'User',
          avatar_url: payload.userAvatar || null,
          user_level: payload.userLevel ?? 1,
          is_vip: (payload.userLevel ?? 1) >= 5,
          joined_at: new Date(payload.timestamp || Date.now()).toISOString(),
        });
      }
    };

    window.addEventListener('livekit-live-event', handleLiveEvent);
    window.addEventListener('livekit-party-event', handlePartyEvent);

    return () => {
      mountedRef.current = false;
      if (activeKeyRef.current === requestKey) activeKeyRef.current = '';
      window.removeEventListener('livekit-live-event', handleLiveEvent);
      window.removeEventListener('livekit-party-event', handlePartyEvent);
    };
  }, [streamId, roomId, enabled, fetchStreamViewers, fetchPartyViewers, removeViewer, upsertViewerFromPacket]);

  const refetch = useCallback(() => {
    if (streamId) return fetchStreamViewers(streamId);
    if (roomId) return fetchPartyViewers(roomId);
    return Promise.resolve();
  }, [streamId, roomId, fetchStreamViewers, fetchPartyViewers]);

  return { viewers, loading, refetch };
};
