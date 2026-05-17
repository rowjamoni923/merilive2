/**
 * Shared status-bucket + counting logic used by admin pages that surface
 * Pending / Approved / Rejected badges next to a list (AdminHostApplications,
 * AdminFaceVerification, AdminUserManagement).
 *
 * Two cardinal rules these helpers enforce so the three pages stay consistent:
 *
 *   1. EVERY status maps to EXACTLY one of `pending | approved | rejected`.
 *      Anything that is not explicitly `approved` or `rejected` (`submitted`,
 *      `under_review`, `applied`, …) falls into `pending`. Nothing silently
 *      disappears from the visible totals.
 *
 *   2. Badges MUST be derived from the SAME filter scope as the visible list.
 *      Use `countStatusBuckets()` when you already have the rows in memory, or
 *      `fetchFilteredStatusCounts()` when you need a separate count query that
 *      must mirror the same `ilike` filter the list uses.
 */

export type StatusBucket = "pending" | "approved" | "rejected";

export type StatusCounts = {
  pending: number;
  under_review: number;
  approved: number;
  rejected: number;
  auto_approved?: number;
  auto_rejected?: number;
  manual_pending?: number;
  manual_approved?: number;
  manual_rejected?: number;
  manual_total?: number;
  total?: number;
};

export const EMPTY_STATUS_COUNTS: StatusCounts = {
  pending: 0,
  under_review: 0,
  approved: 0,
  rejected: 0,
};

/** Every status string the admin pages know how to bucket. */
export const KNOWN_STATUSES: ReadonlySet<string> = new Set([
  "approved", "auto_approved", "auto-approved", "auto_verified", "auto-verified",
  "rejected", "auto_rejected", "auto-rejected",
  "pending", "submitted", "under_review", "applied", "in_review", "reviewing",
]);

/** True when the raw status is a value the bucketing logic explicitly recognizes. */
export function isKnownStatus(status: string | null | undefined): boolean {
  const normalized = String(status || "").trim().toLowerCase();
  if (!normalized) return false;
  return KNOWN_STATUSES.has(normalized);
}

/** Canonical status → bucket mapping. */
export function bucketOfStatus(status: string | null | undefined): StatusBucket {
  const normalized = String(status || "").trim().toLowerCase();
  if (["approved", "auto_approved", "auto-approved", "auto_verified", "auto-verified"].includes(normalized)) return "approved";
  if (["rejected", "auto_rejected", "auto-rejected"].includes(normalized)) return "rejected";
  return "pending";
}

/**
 * Log (once per status value per session) when a row carries a status that
 * isn't in KNOWN_STATUSES. Such rows fall into the `pending` bucket by default,
 * which could silently hide approve/reject mismatches — surface them instead.
 */
const _warnedUnknownStatuses = new Set<string>();
export function warnUnknownStatus(
  source: string,
  status: string | null | undefined,
  context?: Record<string, unknown>,
): void {
  const raw = String(status ?? "");
  const key = `${source}::${raw.trim().toLowerCase()}`;
  if (_warnedUnknownStatuses.has(key)) return;
  _warnedUnknownStatuses.add(key);
  // eslint-disable-next-line no-console
  console.warn(`[admin/status-mismatch] ${source}: unrecognized status "${raw}" — defaulted to "pending" bucket.`, context || {});
}

export function isAutoFaceReview(status: string | null | undefined, adminNotes: string | null | undefined): boolean {
  const bucket = bucketOfStatus(status);
  const normalized = String(status || "").trim().toLowerCase();
  const notes = String(adminNotes || "").toLowerCase();
  if (["auto_approved", "auto-approved", "auto_verified", "auto-verified", "auto_rejected", "auto-rejected"].includes(normalized)) {
    return true;
  }
  if (bucket === "approved") {
    return notes.includes("[auto]")
      || notes.includes("auto-approved")
      || notes.includes("auto approved")
      || notes.includes("service_auto_finalize_face_verification")
      || notes.includes("rekognition thresholds passed");
  }
  if (bucket === "rejected") {
    return notes.includes("auto-rejected")
      || notes.includes("auto rejected")
      || notes.includes("auto-reject")
      || notes.includes("auto rejected by ai");
  }
  return false;
}

export function countFaceReviewBuckets<T>(
  rows: readonly T[],
  getStatus: (row: T) => string | null | undefined,
  getAdminNotes: (row: T) => string | null | undefined,
): Required<StatusCounts> {
  const out: Required<StatusCounts> = {
    ...EMPTY_STATUS_COUNTS,
    auto_approved: 0,
    auto_rejected: 0,
    manual_pending: 0,
    manual_approved: 0,
    manual_rejected: 0,
    manual_total: 0,
    total: rows.length,
  };

  for (const row of rows) {
    const status = getStatus(row);
    const bucket = bucketOfStatus(status);
    const explicitAuto = typeof row === "object" && row !== null
      ? Boolean((row as { is_auto_reviewed?: boolean | null }).is_auto_reviewed)
        || String((row as { review_source?: string | null }).review_source || "").toLowerCase() === "auto"
        || String((row as { verification_method?: string | null }).verification_method || "").toLowerCase().startsWith("auto")
      : false;
    const auto = explicitAuto || isAutoFaceReview(status, getAdminNotes(row));
    out[bucket]++;
    if (bucket === "pending") out.manual_pending++;
    else if (bucket === "approved" && auto) out.auto_approved++;
    else if (bucket === "approved") out.manual_approved++;
    else if (bucket === "rejected" && auto) out.auto_rejected++;
    else if (bucket === "rejected") out.manual_rejected++;
  }

  out.manual_total = out.manual_pending + out.manual_approved + out.manual_rejected;
  return out;
}

/** Count status buckets for an in-memory list of rows. */
export function countStatusBuckets<T>(
  rows: readonly T[],
  getStatus: (row: T) => string | null | undefined,
): StatusCounts {
  const out: StatusCounts = { ...EMPTY_STATUS_COUNTS };
  for (const row of rows) {
    out[bucketOfStatus(getStatus(row))]++;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Separate-count-query path (for pages whose list and stats are different
// queries, e.g. AdminHostApplications).
// ─────────────────────────────────────────────────────────────────────────────

type CountResponse = { count: number | null };
type CountQueryBuilder = {
  ilike: (column: string, pattern: string) => CountQueryBuilder;
  eq: (column: string, value: string) => Promise<CountResponse>;
  not: (column: string, op: string, value: string) => Promise<CountResponse>;
};
type StatsClient = {
  from: (table: string) => {
    select: (
      cols: string,
      opts: { count: "exact"; head: true },
    ) => CountQueryBuilder;
  };
  rpc?: (fn: string, args?: Record<string, unknown>) => Promise<{
    data:
      | StatusCounts
      | null;
    error: { message: string } | null;
  }>;
};

export type FilteredCountOptions = {
  table: string;
  /** Column to apply the `ilike %query%` filter on. */
  searchColumn: string;
  searchQuery: string;
  /**
   * Optional global-stats RPC used ONLY when `searchQuery` is empty (fast
   * single roundtrip). Omit to always run the 3 filtered counts.
   */
  globalStatsRpc?: string;
  /**
   * Cache TTL in ms. Subsequent calls with the same (table, column, query)
   * within this window return the cached counts instead of hitting the DB.
   * Default: 15 seconds. Pass 0 to disable caching.
   */
  cacheTtlMs?: number;
  /** Force a fresh fetch and overwrite any cached entry. */
  forceRefresh?: boolean;
};

// ─────────────────────────────────────────────────────────────────────────────
// In-memory TTL cache + in-flight dedupe so rapid keystrokes (even when the
// caller forgets to debounce) collapse into a single network request.
// ─────────────────────────────────────────────────────────────────────────────

type CacheEntry = { at: number; value: StatusCounts };
const COUNT_CACHE = new Map<string, CacheEntry>();
const IN_FLIGHT = new Map<string, Promise<StatusCounts>>();
const DEFAULT_TTL_MS = 15_000;

function cacheKey(opts: FilteredCountOptions): string {
  return `${opts.table}::${opts.searchColumn}::${(opts.searchQuery || "").trim().toLowerCase()}::${opts.globalStatsRpc || ""}`;
}

/** Invalidate all cached status-count entries (e.g. after a mutation). */
export function invalidateStatusCountsCache(table?: string): void {
  if (!table) {
    COUNT_CACHE.clear();
    return;
  }
  for (const key of COUNT_CACHE.keys()) {
    if (key.startsWith(`${table}::`)) COUNT_CACHE.delete(key);
  }
}

/**
 * Fetch Pending / Approved / Rejected counts that are guaranteed to match the
 * visible list when a search query is active.
 *
 * When `searchQuery` is non-empty: 3 parallel `head: true` count queries with
 * the same `ilike(searchColumn, %q%)` filter the list uses.
 *
 * When `searchQuery` is empty AND `globalStatsRpc` is provided: 1 RPC roundtrip.
 */
export async function fetchFilteredStatusCounts(
  client: StatsClient,
  opts: FilteredCountOptions,
): Promise<StatusCounts> {
  const q = (opts.searchQuery || "").trim();
  const ttl = opts.cacheTtlMs ?? DEFAULT_TTL_MS;
  const key = cacheKey(opts);

  if (!opts.forceRefresh && ttl > 0) {
    const hit = COUNT_CACHE.get(key);
    if (hit && Date.now() - hit.at < ttl) return hit.value;
  }
  const pending = IN_FLIGHT.get(key);
  if (pending && !opts.forceRefresh) return pending;

  const run = (async (): Promise<StatusCounts> => {
    const result = await doFetch();
    if (ttl > 0) COUNT_CACHE.set(key, { at: Date.now(), value: result });
    return result;
  })();
  IN_FLIGHT.set(key, run);
  try {
    return await run;
  } finally {
    IN_FLIGHT.delete(key);
  }

  async function doFetch(): Promise<StatusCounts> {
  if (q) {
    const base = () =>
      client
        .from(opts.table)
        .select("id", { count: "exact", head: true })
        .ilike(opts.searchColumn, `%${q}%`);

    const [pendingRes, approvedRes, rejectedRes] = await Promise.all([
      base().not("status", "in", "(approved,rejected)"),
      base().eq("status", "approved"),
      base().eq("status", "rejected"),
    ]);

    return {
      pending: pendingRes.count || 0,
      under_review: 0,
      approved: approvedRes.count || 0,
      rejected: rejectedRes.count || 0,
    };
  }

  if (opts.globalStatsRpc && client.rpc) {
    // Always pass the explicit text argument. Older deployments had both
    // admin_face_verification_stats() and admin_face_verification_stats(text DEFAULT NULL),
    // which makes a no-arg RPC call ambiguous in PostgREST.
    const { data, error } = await client.rpc(opts.globalStatsRpc, { _search: null });
    if (error) throw new Error(error.message);
    const s = (data || {}) as StatusCounts;
    return {
      pending: Number(s.pending || 0),
      under_review: Number(s.under_review || 0),
      approved: Number(s.approved || 0),
      rejected: Number(s.rejected || 0),
      auto_approved: Number(s.auto_approved || 0),
      auto_rejected: Number(s.auto_rejected || 0),
      manual_pending: Number(s.manual_pending || s.pending || 0),
      manual_approved: Number(s.manual_approved || 0),
      manual_rejected: Number(s.manual_rejected || 0),
      manual_total: Number(s.manual_total || 0),
      total: Number(s.total || 0),
    };
  }

  // No RPC fallback configured → run the same 3 filtered counts with empty q
  // (which becomes an `ilike '%%'` matching everything).
  return fetchFilteredStatusCounts(client, { ...opts, searchQuery: " ", forceRefresh: true });
  }
}

