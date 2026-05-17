/**
 * Regression test for the Face Verification tab + Approve/Reject button
 * visibility flow. Mirrors the exact filter and visibility predicates used in
 *   - src/pages/admin/AdminFaceVerification.tsx
 *   - src/pages/admin/AdminUserManagement.tsx  (Face Verify tab)
 *
 * If any of these assertions break, the two admin pages will display
 * mismatched tabs, counts, or action buttons. Keep them in lock-step.
 */
import { describe, it, expect } from "vitest";
import {
  bucketOfStatus,
  countFaceReviewBuckets,
  isAutoFaceReview,
  isKnownStatus,
} from "./statusCounts";

type Row = {
  id: string;
  status: string | null;
  admin_notes?: string | null;
  is_auto_reviewed?: boolean | null;
  review_source?: string | null;
};

// Predicates copied verbatim from both admin pages.
const isApproved = (s: Row) => bucketOfStatus(s.status) === "approved";
const isRejected = (s: Row) => bucketOfStatus(s.status) === "rejected";
const isPending = (s: Row) => bucketOfStatus(s.status) === "pending";
const isAutoReviewed = (s: Row) =>
  Boolean(s.is_auto_reviewed) ||
  s.review_source === "auto" ||
  isAutoFaceReview(s.status, s.admin_notes);

function filterByTab(rows: Row[], tab: "pending" | "approved" | "rejected" | "all" | "auto_approved" | "auto_rejected"): Row[] {
  return rows.filter((sub) => {
    if (tab === "auto_approved") return isApproved(sub) && isAutoReviewed(sub);
    if (tab === "auto_rejected") return isRejected(sub) && isAutoReviewed(sub);
    if (tab === "pending") return isPending(sub);
    if (tab === "approved") return isApproved(sub);
    if (tab === "rejected") return isRejected(sub);
    if (tab === "all") return true;
    return false;
  });
}

// Approve/Reject buttons must ONLY render when the row is in the pending bucket.
const showsActionButtons = (s: Row) => isPending(s);

const FIXTURE: Row[] = [
  { id: "p1", status: "pending" },
  { id: "p2", status: "submitted" },
  { id: "p3", status: "under_review" },
  { id: "p4", status: "applied" },
  { id: "p5", status: null }, // null → pending bucket
  { id: "p6", status: "future_unknown" }, // unknown → pending bucket + warning
  { id: "a1", status: "approved" },
  { id: "a2", status: "auto_approved" },
  { id: "a3", status: "approved", admin_notes: "[auto] rekognition thresholds passed" },
  { id: "a4", status: "approved", is_auto_reviewed: true },
  { id: "r1", status: "rejected" },
  { id: "r2", status: "auto_rejected" },
  { id: "r3", status: "rejected", admin_notes: "auto-rejected by AI" },
];

describe("Face verification tab + button visibility regression", () => {
  it("Pending tab contains every non-approved/non-rejected row (no silent drops)", () => {
    const pending = filterByTab(FIXTURE, "pending");
    expect(pending.map((r) => r.id).sort()).toEqual(["p1", "p2", "p3", "p4", "p5", "p6"]);
  });

  it("Approved tab includes BOTH manual and auto-approved", () => {
    const approved = filterByTab(FIXTURE, "approved");
    expect(approved.map((r) => r.id).sort()).toEqual(["a1", "a2", "a3", "a4"]);
  });

  it("Rejected tab includes BOTH manual and auto-rejected", () => {
    const rejected = filterByTab(FIXTURE, "rejected");
    expect(rejected.map((r) => r.id).sort()).toEqual(["r1", "r2", "r3"]);
  });

  it("All tab contains every row", () => {
    expect(filterByTab(FIXTURE, "all")).toHaveLength(FIXTURE.length);
  });

  it("Tab counts always sum to total (no row disappears)", () => {
    const c = countFaceReviewBuckets(FIXTURE, (r) => r.status, (r) => r.admin_notes);
    expect(c.pending + c.approved + c.rejected).toBe(FIXTURE.length);
    expect(c.pending).toBe(6);
    expect(c.approved).toBe(4);
    expect(c.rejected).toBe(3);
  });

  it("Auto tabs are a strict subset of approved/rejected", () => {
    const autoA = filterByTab(FIXTURE, "auto_approved");
    const autoR = filterByTab(FIXTURE, "auto_rejected");
    expect(autoA.map((r) => r.id).sort()).toEqual(["a2", "a3", "a4"]);
    expect(autoR.map((r) => r.id).sort()).toEqual(["r2", "r3"]);
    // Every auto row must also appear in the parent approved/rejected tab.
    const approvedIds = new Set(filterByTab(FIXTURE, "approved").map((r) => r.id));
    const rejectedIds = new Set(filterByTab(FIXTURE, "rejected").map((r) => r.id));
    autoA.forEach((r) => expect(approvedIds.has(r.id)).toBe(true));
    autoR.forEach((r) => expect(rejectedIds.has(r.id)).toBe(true));
  });

  it("Approve/Reject buttons render ONLY for pending-bucket rows", () => {
    for (const row of FIXTURE) {
      const expected = isPending(row);
      expect(showsActionButtons(row)).toBe(expected);
    }
    // Spot-check: never on approved / rejected / auto rows.
    expect(showsActionButtons({ id: "x", status: "approved" })).toBe(false);
    expect(showsActionButtons({ id: "x", status: "auto_approved" })).toBe(false);
    expect(showsActionButtons({ id: "x", status: "rejected" })).toBe(false);
    expect(showsActionButtons({ id: "x", status: "auto_rejected" })).toBe(false);
  });

  it("Unknown statuses fall into pending bucket AND are flagged as unknown", () => {
    expect(isPending({ id: "u", status: "future_unknown" })).toBe(true);
    expect(isKnownStatus("future_unknown")).toBe(false);
    expect(isKnownStatus("pending")).toBe(true);
    expect(isKnownStatus("approved")).toBe(true);
    expect(isKnownStatus("auto_approved")).toBe(true);
    expect(isKnownStatus(null)).toBe(false);
  });

  it("Visible counts derive from the SAME pool as the visible list (search-safe)", () => {
    // Simulate search that only keeps ids starting with 'a' (approved rows).
    const visiblePool = FIXTURE.filter((r) => r.id.startsWith("a"));
    const counts = countFaceReviewBuckets(visiblePool, (r) => r.status, (r) => r.admin_notes);
    const listInApprovedTab = filterByTab(visiblePool, "approved");
    // Badge count MUST match the rendered list length.
    expect(counts.approved).toBe(listInApprovedTab.length);
    expect(counts.pending).toBe(filterByTab(visiblePool, "pending").length);
    expect(counts.rejected).toBe(filterByTab(visiblePool, "rejected").length);
  });
});
