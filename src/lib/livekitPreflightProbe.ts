// Pkg157 — Pre-join connection warmup probe.
//
// Runs a single lightweight RTT probe before navigating into LiveStream/Call/Party
// so the host sees a brief "Checking connection…" state instead of a blank screen
// while LiveKit handshakes happen behind the scenes. Mirrors what Chamet/Bigo do
// in their pre-join screen.
//
// Budget: hard 1500ms cap — even on poor networks we don't block "Go Live" more
// than that. Returns a quality bucket that the caller can use to warn the user.
//
// Zero new Supabase channels, zero polls. One HEAD fetch only. $1400-rule safe.

const SUPABASE_HEALTH = 'https://ayjdlvuurscxucatbbah.supabase.co/rest/v1/';
const PROBE_BUDGET_MS = 1500;

export type PreflightQuality = 'excellent' | 'good' | 'poor' | 'unknown';

export interface PreflightResult {
  rttMs: number | null;
  quality: PreflightQuality;
  effectiveType?: string;
  timedOut: boolean;
}

function bucketize(rtt: number | null): PreflightQuality {
  if (rtt == null) return 'unknown';
  if (rtt < 200) return 'excellent';
  if (rtt < 600) return 'good';
  return 'poor';
}

export async function runPreflightProbe(): Promise<PreflightResult> {
  const conn = (navigator as any).connection;
  const effectiveType: string | undefined = conn?.effectiveType;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PROBE_BUDGET_MS);
  const t0 = performance.now();

  try {
    // Cheap unauthenticated HEAD — Supabase REST root returns quickly.
    // We don't care about the response body, only the round-trip latency.
    await fetch(SUPABASE_HEALTH, {
      method: 'HEAD',
      cache: 'no-store',
      signal: controller.signal,
    }).catch(() => {/* network error treated as timeout below */});

    clearTimeout(timeoutId);
    const rttMs = Math.round(performance.now() - t0);
    return {
      rttMs,
      quality: bucketize(rttMs),
      effectiveType,
      timedOut: false,
    };
  } catch {
    clearTimeout(timeoutId);
    return {
      rttMs: null,
      effectiveType,
    };
  }
}
