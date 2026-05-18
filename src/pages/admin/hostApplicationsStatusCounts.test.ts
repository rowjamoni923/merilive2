import { describe, it, expect, vi } from "vitest";
import { fetchHostApplicationStatusCounts } from "./hostApplicationsStatusCounts";

/**
 * End-to-end style test: simulate the same dataset that powers the visible
 * list and assert the stat-card counts the helper returns match the rows
 * the list would render for the same search query.
 */

type Row = { id: string; full_name: string; status: string };

const DATASET: Row[] = [
  { id: "1", full_name: "Alice Wonderland", status: "pending" },
  { id: "2", full_name: "Aliyah Khan", status: "pending" },
  { id: "3", full_name: "Alice Cooper", status: "approved" },
  { id: "4", full_name: "Alicia Keys", status: "rejected" },
  { id: "5", full_name: "Bob Marley", status: "pending" },
  { id: "6", full_name: "Bob Dylan", status: "approved" },
  { id: "7", full_name: "Charlie Chaplin", status: "under_review" },
];

function filteredList(q: string) {
  const needle = q.trim().toLowerCase();
  if (!needle) return DATASET;
  return DATASET.filter((r) => r.full_name.toLowerCase().includes(needle));
}

function buildMockClient(rows: Row[]) {
  const makeQuery = (current: Row[]) => {
    const api: any = {
      ilike: (_col: string, pattern: string) => {
        const needle = pattern.replace(/^%|%$/g, "").toLowerCase();
        const next = current.filter((r) =>
          r.full_name.toLowerCase().includes(needle),
        );
        return makeQuery(next);
      },
      eq: (_col: string, value: string) =>
        Promise.resolve({ count: current.filter((r) => r.status === value).length }),
      not: (_col: string, _op: string, value: string) => {
        const excluded = value.replace(/^\(|\)$/g, "").split(",");
        const count = current.filter((r) => !excluded.includes(r.status)).length;
        return Promise.resolve({ count });
      },
    };
    return api;
  };

  return {
    from: (_table: string) => ({
      select: (_cols: string, _opts: { count: "exact"; head: true }) =>
        makeQuery(rows),
    }),
    rpc: vi.fn(async () => ({
      data: {
        pending: rows.filter((r) => !["approved", "rejected"].includes(r.status))
          .length,
        approved: rows.filter((r) => r.status === "approved").length,
        rejected: rows.filter((r) => r.status === "rejected").length,
      },
      error: null,
    })),
  };
}

describe("AdminHostApplications status counts ↔ search filter", () => {
  it("with empty search → uses global RPC and badges equal full dataset", async () => {
    const client = buildMockClient(DATASET);
    const counts = await fetchHostApplicationStatusCounts(client as any, "");

    expect(client.rpc).toHaveBeenCalledWith("admin_face_verification_stats", { _search: null });
    expect(counts.pending).toBe(
      DATASET.filter((r) => !["approved", "rejected"].includes(r.status)).length,
    );
    expect(counts.approved).toBe(
      DATASET.filter((r) => r.status === "approved").length,
    );
    expect(counts.rejected).toBe(
      DATASET.filter((r) => r.status === "rejected").length,
    );
  });

  it("with active search → RPC receives search and badges equal the filtered list per status", async () => {
    const client = buildMockClient(DATASET);
    const query = "ali";

    const counts = await fetchHostApplicationStatusCounts(client as any, query);
    const visible = filteredList(query);

    expect(client.rpc).toHaveBeenCalledWith("admin_face_verification_stats", { _search: query });
    expect(counts.pending).toBe(
      visible.filter((r) => !["approved", "rejected"].includes(r.status)).length,
    );
    expect(counts.approved).toBe(
      visible.filter((r) => r.status === "approved").length,
    );
    expect(counts.rejected).toBe(
      visible.filter((r) => r.status === "rejected").length,
    );

    // Sanity: total of cards must equal total filtered rows (under_review goes
    // into pending bucket per current admin UI).
    const total = counts.pending + counts.approved + counts.rejected;
    expect(total).toBe(visible.length);
  });

  it("search with zero matches → all badges are zero", async () => {
    const client = buildMockClient(DATASET);
    const counts = await fetchHostApplicationStatusCounts(
      client as any,
      "zzz-no-match",
    );
    expect(counts).toMatchObject({
      pending: 0,
      under_review: 0,
      approved: 0,
      rejected: 0,
    });
  });
});
