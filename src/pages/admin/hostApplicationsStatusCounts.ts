/**
 * Helper used by AdminHostApplications to compute the
 * Pending / Approved / Rejected stat-card numbers.
 *
 * When a search query is active we MUST count only rows that match the same
 * `ilike(full_name, %q%)` filter the visible list uses — otherwise the badges
 * show global totals and drift out of sync with what the admin is looking at.
 *
 * Exported as a pure function so it can be unit-tested end-to-end without
 * mounting the whole admin page.
 */

export type StatusCounts = {
  pending: number;
  under_review: number;
  approved: number;
  rejected: number;
};

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
  rpc: (
    fn: string,
  ) => Promise<{
    data:
      | { pending?: number; under_review?: number; approved?: number; rejected?: number }
      | null;
    error: { message: string } | null;
  }>;
};

export async function fetchHostApplicationStatusCounts(
  client: StatsClient,
  searchQuery: string,
): Promise<StatusCounts> {
  const q = (searchQuery || "").trim();

  if (q) {
    const base = () =>
      client
        .from("face_verification_submissions")
        .select("id", { count: "exact", head: true })
        .ilike("full_name", `%${q}%`);

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

  const { data, error } = await client.rpc("admin_face_verification_stats");
  if (error) throw new Error(error.message);
  const s = data || {};
  return {
    pending: Number(s.pending || 0),
    under_review: 0,
    approved: Number(s.approved || 0),
    rejected: Number(s.rejected || 0),
  };
}
