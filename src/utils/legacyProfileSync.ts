import { supabase } from "@/integrations/supabase/client";

type LegacyProfileSyncResult = {
  synced?: boolean;
  reason?: string;
  profileUpdated?: boolean;
  agencySynced?: boolean;
  helperSynced?: boolean;
  rolesSynced?: boolean;
  resolvedName?: string | null;
};

const inFlightSyncs = new Map<string, Promise<LegacyProfileSyncResult | null>>();

const getSessionSyncKey = (userId: string) => `legacy_synced_${userId}`;

export async function triggerLegacyProfileSync(userId?: string | null): Promise<LegacyProfileSyncResult | null> {
  if (!userId) return null;

  if (typeof window !== "undefined") {
    const syncState = window.sessionStorage.getItem(getSessionSyncKey(userId));
    if (syncState === "success" || syncState === "not_found_in_old") {
      return null;
    }
  }

  const existingRequest = inFlightSyncs.get(userId);
  if (existingRequest) {
    return existingRequest;
  }

  const request = (async () => {
    const { data, error } = await supabase.functions.invoke("sync-user-profile");
    if (error) throw error;

    const result = (data as LegacyProfileSyncResult | null) ?? null;

    if (typeof window !== "undefined") {
      if (result?.synced) {
        window.sessionStorage.setItem(getSessionSyncKey(userId), "success");
      } else if (result?.reason === "not_found_in_old") {
        window.sessionStorage.setItem(getSessionSyncKey(userId), "not_found_in_old");
      } else {
        window.sessionStorage.removeItem(getSessionSyncKey(userId));
      }
    }

    return result;
  })().finally(() => {
    inFlightSyncs.delete(userId);
  });

  inFlightSyncs.set(userId, request);
  return request;
}
