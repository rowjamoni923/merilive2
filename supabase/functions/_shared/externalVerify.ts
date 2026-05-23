/**
 * External Verification Provider client.
 *
 * Thin wrapper around the upstream face/phone/video verification provider.
 * All calls are best-effort: if the provider is unreachable or returns a
 * non-2xx response, the wrapper returns null/undefined so callers can fall
 * back to existing logic without breaking the user flow.
 *
 * Provider base URL is configurable via VERIFY_BASE_URL secret.
 * Default: https://verify.merilive.com  (custom domain of the provider).
 */

const DEFAULT_BASE_URL = "https://verify.merilive.com";
// Hard fallback if the custom domain is unreachable (no DNS / SSL).
const ORIGIN_FALLBACK = "https://faceid-genius.lovable.app";

export interface ProviderOpts {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
}

export interface VerifyFaceResult {
  status: string;          // approved | needs_review | no_face | multiple_faces | liveness_failed | engine_error | underage_rejected
  message: string;
  gender: "male" | "female" | "unknown" | null;
  gender_confidence: number;
  age?: { low: number | null; high: number | null; estimated: number | null; passed: boolean | null };
}

export interface SearchFaceMatch {
  face_id: string;
  external_user_id: string | null;
  similarity: number;
  indexed_at: string | null;
}
export interface SearchFaceResult {
  status: "matches_found" | "no_match";
  matches: SearchFaceMatch[];
}

export interface MonitorFrameResult {
  face_present: boolean;
  face_count: number;
  eyes_open?: boolean | null;
  looking_forward?: boolean;
  yaw?: number;
  pitch?: number;
  sharpness?: number;
  alerts: string[]; // face_lost | multiple_faces | sleeping | looking_away | low_quality | moderation:nudity ...
  nsfw_score?: number;
  violence_score?: number;
  weapons_detected?: boolean;
  drugs_detected?: boolean;
}

export interface ScanContentResult {
  flagged: boolean;
  phones: string[];
  emails: string[];
  urls: string[];
  handles: string[];
  socials: string[];
  keywords: string[];
  moderation?: { flagged: boolean; severity?: string; reasons?: string[] };
  transcript?: string;
  source_text?: string;
}

async function postWithFallback(
  path: string,
  body: unknown,
  apiKey: string,
  baseUrl: string,
  timeoutMs: number,
): Promise<Response | null> {
  const tryBases = [baseUrl, ORIGIN_FALLBACK].filter((v, i, a) => a.indexOf(v) === i);
  for (const base of tryBases) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${base}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (res.ok || (res.status >= 400 && res.status < 500)) return res; // bubble 4xx up
      // 5xx → try next base
    } catch (_e) {
      clearTimeout(t);
      // network/DNS/timeout → try next base
    }
  }
  return null;
}

export function getProviderConfig(keyEnv: string): ProviderOpts | null {
  const apiKey = Deno.env.get(keyEnv);
  if (!apiKey) return null;
  const baseUrl = Deno.env.get("VERIFY_BASE_URL") || DEFAULT_BASE_URL;
  return { apiKey, baseUrl };
}

/** POST /api/public/v1/verify-face */
export async function providerVerifyFace(
  opts: ProviderOpts,
  body: { external_user_id: string; image_base64: string; min_age_override?: number },
): Promise<VerifyFaceResult | null> {
  try {
    const res = await postWithFallback(
      "/api/public/v1/verify-face",
      body,
      opts.apiKey,
      opts.baseUrl ?? DEFAULT_BASE_URL,
      opts.timeoutMs ?? 20_000,
    );
    if (!res || !res.ok) return null;
    return (await res.json()) as VerifyFaceResult;
  } catch (e) {
    console.warn("[externalVerify] verify-face failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** POST /api/public/v1/search-face */
export async function providerSearchFace(
  opts: ProviderOpts,
  body: { image_base64: string; threshold?: number; max_matches?: number },
): Promise<SearchFaceResult | null> {
  try {
    const res = await postWithFallback(
      "/api/public/v1/search-face",
      body,
      opts.apiKey,
      opts.baseUrl ?? DEFAULT_BASE_URL,
      opts.timeoutMs ?? 15_000,
    );
    if (!res || !res.ok) return null;
    return (await res.json()) as SearchFaceResult;
  } catch (e) {
    console.warn("[externalVerify] search-face failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** POST /api/public/v1/index-face */
export async function providerIndexFace(
  opts: ProviderOpts,
  body: { external_user_id: string; image_base64: string; metadata?: Record<string, unknown> },
): Promise<boolean> {
  try {
    const res = await postWithFallback(
      "/api/public/v1/index-face",
      body,
      opts.apiKey,
      opts.baseUrl ?? DEFAULT_BASE_URL,
      opts.timeoutMs ?? 15_000,
    );
    return Boolean(res && res.ok);
  } catch (e) {
    console.warn("[externalVerify] index-face failed:", e instanceof Error ? e.message : e);
    return false;
  }
}

/** POST /api/public/v1/monitor-frame */
export async function providerMonitorFrame(
  opts: ProviderOpts,
  body: { external_user_id: string; image_base64: string },
): Promise<MonitorFrameResult | null> {
  try {
    const res = await postWithFallback(
      "/api/public/v1/monitor-frame",
      body,
      opts.apiKey,
      opts.baseUrl ?? DEFAULT_BASE_URL,
      opts.timeoutMs ?? 12_000,
    );
    if (!res || !res.ok) return null;
    return (await res.json()) as MonitorFrameResult;
  } catch (e) {
    console.warn("[externalVerify] monitor-frame failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** POST /api/public/v1/scan-content (text / image OCR / audio transcription) */
export async function providerScanContent(
  opts: ProviderOpts,
  body: {
    external_user_id: string;
    mode: "text" | "image" | "audio";
    text?: string;
    image_base64?: string;
    audio_base64?: string;
    audio_mime?: "audio/webm" | "audio/mp3" | "audio/mpeg" | "audio/wav" | "audio/ogg" | "audio/m4a";
    audio_language?: string;
    extra_keywords?: string[];
  },
): Promise<ScanContentResult | null> {
  try {
    const res = await postWithFallback(
      "/api/public/v1/scan-content",
      body,
      opts.apiKey,
      opts.baseUrl ?? DEFAULT_BASE_URL,
      opts.timeoutMs ?? 20_000,
    );
    if (!res || !res.ok) return null;
    return (await res.json()) as ScanContentResult;
  } catch (e) {
    console.warn("[externalVerify] scan-content failed:", e instanceof Error ? e.message : e);
    return null;
  }
}
