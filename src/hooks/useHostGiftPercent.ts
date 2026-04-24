/**
 * useHostGiftPercent
 *
 * Returns the admin-configured host commission percentage applied to gifts.
 * Result is cached in-memory and refreshed in background to keep the value fresh
 * across the app without re-fetching on every render.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

let cachedPercent: number | null = null;
let inflight: Promise<number> | null = null;

const DEFAULT_PERCENT = 50; // safe fallback if settings are unavailable

async function fetchPercent(): Promise<number> {
  try {
    // Prefer the canonical RPC if available
    const { data, error } = await supabase.rpc("get_effective_host_percent");
    if (!error && typeof data === "number" && data >= 0 && data <= 100) {
      cachedPercent = data;
      return data;
    }
  } catch {
    /* fall through to settings table */
  }

  try {
    const { data } = await supabase
      .from("app_settings")
      .select("setting_value")
      .eq("setting_key", "gift_commission")
      .maybeSingle();
    const parsed = data?.setting_value ? parseFloat(data.setting_value) : NaN;
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 100) {
      cachedPercent = parsed;
      return parsed;
    }
  } catch {
    /* ignore */
  }

  cachedPercent = DEFAULT_PERCENT;
  return DEFAULT_PERCENT;
}

export function getCachedHostGiftPercent(): number {
  return cachedPercent ?? DEFAULT_PERCENT;
}

export function ensureHostGiftPercentLoaded(): Promise<number> {
  if (cachedPercent !== null) return Promise.resolve(cachedPercent);
  if (!inflight) inflight = fetchPercent().finally(() => { inflight = null; });
  return inflight;
}

export function useHostGiftPercent(): number {
  const [percent, setPercent] = useState<number>(cachedPercent ?? DEFAULT_PERCENT);
  useEffect(() => {
    let mounted = true;
    ensureHostGiftPercentLoaded().then((p) => {
      if (mounted) setPercent(p);
    });
    return () => { mounted = false; };
  }, []);
  return percent;
}
