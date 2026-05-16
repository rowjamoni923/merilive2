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
};

export const EMPTY_STATUS_COUNTS: StatusCounts = {
  pending: 0,
  under_review: 0,
  approved: 0,
  rejected: 0,
};

/** Canonical status → bucket mapping. */
export function bucketOfStatus(status: string | null | undefined): StatusBucket {
  if (status === "approved") return "approved";
  if (status === "rejected") return "rejected";
  return "pending";
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
  rpc?: (fn: string) => Promise<{
    data:
      | { pending?: number; under_review?: number; approved?: number; rejected?: number }
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
};

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
    const { data, error } = await client.rpc(opts.globalStatsRpc);
    if (error) throw new Error(error.message);
    const s = data || {};
    return {
      pending: Number(s.pending || 0),
      under_review: 0,
      approved: Number(s.approved || 0),
      rejected: Number(s.rejected || 0),
    };
  }

  // No RPC fallback configured → run the same 3 filtered counts with empty q
  // (which becomes an `ilike '%%'` matching everything).
  return fetchFilteredStatusCounts(client, { ...opts, searchQuery: " " });
}
