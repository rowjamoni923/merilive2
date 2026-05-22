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
const FAILURE_RETRY_MS = 30_000;

const getSessionSyncKey = (userId: string) => `legacy_synced_${userId}`;

type LegacySyncCacheState = {
  status: "success" | "not_found_in_old";
  at: number;
};

const readSyncCacheState = (userId: string): LegacySyncCacheState | null => {
  if (typeof window === "undefined") return null;

  const rawValue = window.sessionStorage.getItem(getSessionSyncKey(userId));
  if (!rawValue) return null;

  if (rawValue === "success") {
    return { status: "success", at: Date.now() };
  }

  if (rawValue === "not_found_in_old") {
    return { status: "not_found_in_old", at: 0 };
  }

  try {
    const parsed = JSON.parse(rawValue) as LegacySyncCacheState;
    if (parsed?.status === "success" || parsed?.status === "not_found_in_old") {
      return parsed;
    }
  } catch {
    window.sessionStorage.removeItem(getSessionSyncKey(userId));
  }

  return null;
};

type TriggerLegacyProfileSyncOptions = {
  force?: boolean;
};

export async function triggerLegacyProfileSync(
  userId?: string | null,
  options: TriggerLegacyProfileSyncOptions = {}
): Promise<LegacyProfileSyncResult | null> {
  if (!userId) return null;

  const { force = false } = options;

  if (typeof window !== "undefined" && !force) {
    const syncState = readSyncCacheState(userId);
    if (syncState?.status === "success") {
      return null;
    }

    if (syncState?.status === "not_found_in_old") {
      const isRecentFailure = syncState.at > 0 && Date.now() - syncState.at < FAILURE_RETRY_MS;
      if (isRecentFailure) {
        return null;
      }

      window.sessionStorage.removeItem(getSessionSyncKey(userId));
    }
  }

  if (typeof window !== "undefined" && force) {
    window.sessionStorage.removeItem(getSessionSyncKey(userId));
  }

  const existingRequest = inFlightSyncs.get(userId);
  if (existingRequest) {
    return existingRequest;
  }

  const request = (async () => {
    // Guard: only call edge function when we have a valid user session token.
    // Without it the function returns 401 and surfaces as a runtime error.
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token || session.user?.id !== userId) {
      return null;
    }
    const { data, error } = await supabase.functions.invoke("sync-user-profile");
    if (error) {
      // 401 / stale session — non-fatal; profile sync can be retried later.
      const msg = (error as any)?.message || "";
      if (/401|unauthor/i.test(msg)) return null;
      throw error;
    }


    const result = (data as LegacyProfileSyncResult | null) ?? null;

    if (typeof window !== "undefined") {
      if (result?.synced) {
        window.sessionStorage.setItem(
          getSessionSyncKey(userId),
          JSON.stringify({ status: "success", at: Date.now() } satisfies LegacySyncCacheState)
        );
      } else if (result?.reason === "not_found_in_old") {
        window.sessionStorage.setItem(
          getSessionSyncKey(userId),
          JSON.stringify({ status: "not_found_in_old", at: Date.now() } satisfies LegacySyncCacheState)
        );
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
