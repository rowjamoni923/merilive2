/**
 * Pkg67 — Shared referral / agency code parser.
 *
 * Single source of truth for extracting an inviter UID and/or agency code
 * from any of the many Play Store / deep-link / smart-link payload shapes
 * we have ever shipped or that partners build manually. Used by:
 *   - src/utils/installReferrer.ts   (Play Install Referrer string)
 *   - src/components/common/DeepLinkHandler.tsx  (merilive://, /smart-link, /link)
 *   - src/pages/DebugReferrer.tsx    (dev preview)
 *
 * Why so many aliases: partners and agencies hand-build Play Store links
 * with inconsistent keys (`agency`, `agencyCode`, `agency_code`, `code`,
 * even `utm_content=AG42`). We accept any of them — last-resort wins so a
 * later, more specific key can override an early generic one.
 */
export interface ParsedReferral {
  /** Inviter app_uid (drives My Invitations). */
  ref: string | null;
  /** Agency code (drives JoinAgency auto-fill). */
  agencyCode: string | null;
  /** Parent agency code for sub-agent flow. */
  parent: string | null;
  /** Direct host profile id. */
  host: string | null;
  /** Optional explicit in-app navigation target. */
  target: string | null;
  /** All parsed params flattened — useful for the debug page. */
  all: Record<string, string>;
}

// Accepted aliases (lowercased). Order matters for tie-breaking — earlier
// aliases yield to later more-specific keys when both are present.
const REF_ALIASES = [
  "ref",
  "r",
  "uid",
  "invite",
  "invitation",
  "invitation_ref",
  "inviter",
  "inviter_uid",
  "inviter_id",
  "referrer_uid",
  "referrer_id",
] as const;

const AGENCY_ALIASES = [
  "a",
  "ag",
  "agent",
  "agent_code",
  "agentcode",
  "code",
  "agency",
  "agency_code",
  "agencycode",
  "agency_id",
  "agencyid",
] as const;

const PARENT_ALIASES = ["parent", "parent_code", "parentcode", "parent_agency"] as const;
const HOST_ALIASES = ["host", "host_id", "hostid", "profile"] as const;
const TARGET_ALIASES = ["target", "to", "go"] as const;

const UTM_CARRIERS = ["utm_content", "utm_term", "utm_campaign"] as const;

/** Best-effort double-decode (Play sometimes double-encodes the value). */
function safeDecode(s: string): string {
  let out = s;
  for (let i = 0; i < 2; i++) {
    try {
      const next = decodeURIComponent(out);
      if (next === out) break;
      out = next;
    } catch {
      break;
    }
  }
  return out;
}

/**
 * Flatten a query string (or `key=val&key2=val2` blob) into a lowercase
 * map. If a value itself looks like a nested query string (`a=b&c=d` or
 * encoded), recursively flatten it so `referrer=agencyCode%3DAG42` works.
 */
function flatten(raw: string, depth = 0): Record<string, string> {
  if (!raw || depth > 3) return {};
  const decoded = safeDecode(raw);

  // Strip a leading `?` if present.
  const body = decoded.startsWith("?") ? decoded.slice(1) : decoded;

  // Nothing parseable.
  if (!body.includes("=")) return {};

  const out: Record<string, string> = {};
  const params = new URLSearchParams(body);
  params.forEach((value, key) => {
    const k = key.trim().toLowerCase();
    const v = value.trim();
    if (!k || !v) return;

    // Recurse if the value itself looks like a nested query string.
    if (v.includes("=") && /[&=]/.test(v)) {
      const nested = flatten(v, depth + 1);
      for (const [nk, nv] of Object.entries(nested)) {
        out[nk] = nv;
      }
    }
    out[k] = v;
  });
  return out;
}

function pick(map: Record<string, string>, aliases: readonly string[]): string | null {
  // Last alias wins → more specific keys override generic ones when both
  // are present (e.g. `agency_code` over `code`).
  let value: string | null = null;
  for (const alias of aliases) {
    const v = map[alias];
    if (v) value = v;
  }
  return value;
}

/** Parse a raw referral payload (any shape we've ever shipped). */
export function parseReferralPayload(raw: string): ParsedReferral {
  const map = flatten(raw);

  // Some Play links pack the real value inside utm_content / utm_term.
  for (const carrier of UTM_CARRIERS) {
    const v = map[carrier];
    if (v && v.includes("=")) {
      const nested = flatten(v);
      for (const [nk, nv] of Object.entries(nested)) {
        if (!map[nk]) map[nk] = nv;
      }
    }
  }

  // `referrer` is overloaded: sometimes it's an inviter UID, sometimes it
  // wraps the entire nested payload. flatten() already recursed for the
  // nested case. Treat a bare `referrer` (no `=`) as an inviter UID alias.
  if (map["referrer"] && !map["referrer"].includes("=")) {
    if (!pick(map, REF_ALIASES)) map["ref"] = map["referrer"];
  }

  return {
    ref: pick(map, REF_ALIASES),
    agencyCode: pick(map, AGENCY_ALIASES),
    parent: pick(map, PARENT_ALIASES),
    host: pick(map, HOST_ALIASES),
    target: pick(map, TARGET_ALIASES),
    all: map,
  };
}
