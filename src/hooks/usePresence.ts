import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export const usePresence = (userId: string | null) => {
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!userId) return;

    const setOwnPresenceInDb = async (isOnline: boolean) => {
      try {
        await supabase
          .from("profiles")
          .update({ is_online: isOnline, last_seen_at: new Date().toISOString() })
          .eq("id", userId);
      } catch {
        // Ignore aborted requests / transient network issues
      }
    };

    const presenceChannel = supabase.channel(`online-users-${userId}`, {
      config: {
        presence: {
          key: userId,
        },
      },
    });

    presenceChannel
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState();
        const userIds = new Set<string>();

        Object.keys(state).forEach((key) => {
          userIds.add(key);
        });

        setOnlineUsers(userIds);
      })
      .on("presence", { event: "join" }, ({ key }) => {
        // Local state only - do NOT write other users' presence to DB
        setOnlineUsers((prev) => new Set([...prev, key]));
      })
      .on("presence", { event: "leave" }, ({ key }) => {
        // Local state only - do NOT write other users' presence to DB
        setOnlineUsers((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await presenceChannel.track({
            id: userId,
            online_at: new Date().toISOString(),
          });

          void setOwnPresenceInDb(true);
        }
      });

    return () => {
      void setOwnPresenceInDb(false);
      supabase.removeChannel(presenceChannel);
    };
  }, [userId]);

  const isUserOnline = (id: string) => onlineUsers.has(id);

  return { onlineUsers, isUserOnline };
};
