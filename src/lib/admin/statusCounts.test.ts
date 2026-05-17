import { describe, it, expect } from "vitest";
import {
  bucketOfStatus,
  countStatusBuckets,
  fetchFilteredStatusCounts,
} from "./statusCounts";

describe("admin/statusCounts shared module", () => {
  it("bucketOfStatus maps every status into exactly one bucket", () => {
    expect(bucketOfStatus("approved")).toBe("approved");
    expect(bucketOfStatus("rejected")).toBe("rejected");
    expect(bucketOfStatus("pending")).toBe("pending");
    expect(bucketOfStatus("submitted")).toBe("pending");
    expect(bucketOfStatus("under_review")).toBe("pending");
    expect(bucketOfStatus("applied")).toBe("pending");
    expect(bucketOfStatus(null)).toBe("pending");
    expect(bucketOfStatus(undefined)).toBe("pending");
    expect(bucketOfStatus("future_unknown_status")).toBe("pending");
  });

  it("countStatusBuckets totals always equal row count (no silent drops)", () => {
    const rows = [
      { status: "approved" },
      { status: "rejected" },
      { status: "pending" },
      { status: "submitted" },
      { status: "under_review" },
      { status: null },
      { status: "weird_new_status" },
    ];
    const counts = countStatusBuckets(rows, (r) => r.status);
    expect(counts.approved).toBe(1);
    expect(counts.rejected).toBe(1);
    expect(counts.pending).toBe(5);
    expect(counts.approved + counts.rejected + counts.pending).toBe(rows.length);
  });

  it("fetchFilteredStatusCounts uses RPC when search is empty", async () => {
    let rpcCalled = false;
    const counts = await fetchFilteredStatusCounts(
      {
        from: () => ({ select: () => ({ ilike: () => ({}) as any }) }),
        rpc: async () => {
          rpcCalled = true;
          return {
            data: { pending: 7, approved: 3, rejected: 2 },
            error: null,
          };
        },
      } as any,
      {
        table: "face_verification_submissions",
        searchColumn: "full_name",
        searchQuery: "",
        globalStatsRpc: "admin_face_verification_stats",
      },
    );
    expect(rpcCalled).toBe(true);
    expect(counts).toMatchObject({ pending: 7, under_review: 0, approved: 3, rejected: 2 });
  });

  it("fetchFilteredStatusCounts runs filtered counts when search is active", async () => {
    let rpcCalled = false;
    const rows = [
      { status: "approved", full_name: "Alice" },
      { status: "approved", full_name: "Aliyah" },
      { status: "rejected", full_name: "Alice" },
      { status: "pending", full_name: "Bob" }, // excluded by search
    ];

    const makeQ = (current: any[]): any => ({
      ilike: (_c: string, p: string) => {
        const needle = p.replace(/^%|%$/g, "").toLowerCase();
        return makeQ(current.filter((r) => r.full_name.toLowerCase().includes(needle)));
      },
      eq: (_c: string, v: string) =>
        Promise.resolve({ count: current.filter((r) => r.status === v).length }),
      not: (_c: string, _op: string, v: string) => {
        const excluded = v.replace(/^\(|\)$/g, "").split(",");
        return Promise.resolve({
          count: current.filter((r) => !excluded.includes(r.status)).length,
        });
      },
    });

    const counts = await fetchFilteredStatusCounts(
      {
        from: () => ({ select: () => makeQ(rows) }),
        rpc: async () => {
          rpcCalled = true;
          return { data: { pending: 999 }, error: null };
        },
      } as any,
      {
        table: "face_verification_submissions",
        searchColumn: "full_name",
        searchQuery: "ali",
        globalStatsRpc: "admin_face_verification_stats",
      },
    );

    expect(rpcCalled).toBe(false);
    expect(counts).toEqual({ pending: 0, under_review: 0, approved: 2, rejected: 1 });
  });
});
