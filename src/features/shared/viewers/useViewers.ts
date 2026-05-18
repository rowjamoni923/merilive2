import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Viewer } from "./types";

interface UseViewersOptions {
  streamId?: string;
  roomId?: string;
  enabled?: boolean;
}

/**
 * INSTANT viewer list — single source of truth from realtime postgres_changes.
 * - Uses `profiles_public` view (profiles has no public SELECT policy).
 * - No polling — realtime + incremental delta merges keep it sub-second fresh.
 * - Initial fetch primes the list; INSERT/UPDATE/DELETE events mutate it directly
 *   so the UI updates the instant a viewer joins or leaves, without a refetch round-trip.
 */
export const useViewers = ({ streamId, roomId, enabled = true }: UseViewersOptions) => {
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  const hydrateProfiles = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return new Map<string, any>();
    const map = new Map<string, any>();
    const { data, error } = await supabase
      .from("profiles_public" as any)
      .select("id, app_uid, display_name, avatar_url, user_level, coins")
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
    user_level: profile?.user_level || 1,
    coins: profile?.coins || 0,
    is_vip: (profile?.coins || 0) >= 10000,
    joined_at,
  });

  const fetchStreamViewers = useCallback(async (sid: string) => {
    const { data: sv, error } = await supabase
      .from("stream_viewers")
      .select("viewer_id, joined_at")
      .eq("stream_id", sid)
      .is("left_at", null)
      .order("joined_at", { ascending: false });
    if (error) return console.error("[useViewers] stream_viewers error:", error);
    const ids = (sv || []).map((r: any) => r.viewer_id).filter(Boolean);
    const profiles = await hydrateProfiles(ids);
    if (!mountedRef.current) return;
    setViewers((sv || []).map((r: any) => buildViewer(r.viewer_id, r.joined_at, profiles.get(r.viewer_id))));
  }, [hydrateProfiles]);

  const fetchPartyViewers = useCallback(async (rid: string) => {
    const { data: pv, error } = await supabase
      .from("party_room_participants")
      .select("user_id, joined_at")
      .eq("room_id", rid)
      .is("left_at", null)
      .order("joined_at", { ascending: false });
    if (error) return console.error("[useViewers] party_room_participants error:", error);
    const ids = (pv || []).map((r: any) => r.user_id).filter(Boolean);
    const profiles = await hydrateProfiles(ids);
    if (!mountedRef.current) return;
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

  useEffect(() => {
    mountedRef.current = true;

    if (!enabled || (!streamId && !roomId)) {
      setLoading(false);
      return () => { mountedRef.current = false; };
    }

    const isStream = !!streamId;
    const id = (streamId || roomId) as string;
    const table = isStream ? "stream_viewers" : "party_room_participants";
    const idCol = isStream ? "stream_id" : "room_id";
    const userCol = isStream ? "viewer_id" : "user_id";

    setLoading(true);
    (isStream ? fetchStreamViewers(id) : fetchPartyViewers(id)).finally(() => {
      if (mountedRef.current) setLoading(false);
    });

    const channel = supabase
      .channel(`viewers:${table}:${id}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table, filter: `${idCol}=eq.${id}` },
        (payload: any) => {
          const row = payload.new;
          if (!row || row.left_at) return;
          void insertViewer(row[userCol], row.joined_at);
        }
      )
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table, filter: `${idCol}=eq.${id}` },
        (payload: any) => {
          const row = payload.new;
          if (!row) return;
          if (row.left_at) removeViewer(row[userCol]);
          else void insertViewer(row[userCol], row.joined_at);
        }
      )
      .on("postgres_changes",
        { event: "DELETE", schema: "public", table, filter: `${idCol}=eq.${id}` },
        (payload: any) => {
          const row = payload.old;
          if (row) removeViewer(row[userCol]);
        }
      )
      .subscribe();

    return () => {
      mountedRef.current = false;
      supabase.removeChannel(channel);
    };
  }, [streamId, roomId, enabled, fetchStreamViewers, fetchPartyViewers, insertViewer, removeViewer]);

  const refetch = useCallback(() => {
    if (streamId) return fetchStreamViewers(streamId);
    if (roomId) return fetchPartyViewers(roomId);
    return Promise.resolve();
  }, [streamId, roomId, fetchStreamViewers, fetchPartyViewers]);

  return { viewers, loading, refetch };
};
