import { supabase } from '@/integrations/supabase/client';

type DetectedCountry = {
  countryCode?: string;
  city?: string;
  region?: string;
  ip?: string;
};

const CACHE_KEY = 'meri_country_detect_v1';
const TTL_MS = 30 * 60_000;
let inFlight: Promise<DetectedCountry | null> | null = null;

const readCachedCountry = (): DetectedCountry | null => {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; data: DetectedCountry };
    if (parsed?.data && Date.now() - Number(parsed.at || 0) < TTL_MS) return parsed.data;
  } catch {
    // cache is best-effort
  }
  return null;
};

const writeCachedCountry = (data: DetectedCountry) => {
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data })); }
  catch { /* ignore */ }
};

export async function getDetectedCountry(): Promise<DetectedCountry | null> {
  const cached = readCachedCountry();
  if (cached) return cached;
  if (inFlight) return inFlight;

  inFlight = supabase.functions.invoke('detect-country')
    .then(({ data, error }) => {
      if (error || !data) return null;
      const result = data as DetectedCountry;
      if (result.countryCode || result.ip) writeCachedCountry(result);
      return result;
    })
    .catch(() => null)
    .finally(() => { inFlight = null; });

  return inFlight;
}