/**
 * AdminHostApplications stat-card counts.
 *
 * Thin wrapper around the shared `fetchFilteredStatusCounts` helper so the
 * Pending / Approved / Rejected badges always match the visible (search-
 * filtered) list. See `src/lib/admin/statusCounts.ts` for the canonical
 * bucketing rules used across all admin pages.
 */

import {
  fetchFilteredStatusCounts,
  type StatusCounts,
} from "@/lib/admin/statusCounts";

export type { StatusCounts } from "@/lib/admin/statusCounts";

export async function fetchHostApplicationStatusCounts(
  client: Parameters<typeof fetchFilteredStatusCounts>[0],
  searchQuery: string,
  forceRefresh = false,
): Promise<StatusCounts> {
  return fetchFilteredStatusCounts(client, {
    table: "face_verification_submissions",
    searchColumn: "full_name",
    searchQuery,
    globalStatsRpc: "admin_face_verification_stats",
    forceRefresh,
  });
}
