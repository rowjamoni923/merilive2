import { upsertRows, deleteRows } from "../helpers/supabaseAdmin";

/** Unique tag prefix — all seeded rows carry this in `full_name` so the page
 *  search input scopes the visible pool to ONLY our rows. */
export const FACE_E2E_TAG = "e2e-face-test";

type SeedRow = {
  user_id: string;
  selfie_url: string;
  status: string;
  full_name: string;
  verification_type: "face";
};

/** Deterministic UUIDs per slot so re-runs upsert in place. */
function uid(slot: string): string {
  // RFC 4122 v4-ish, deterministic suffix
  return `e2e0face-0000-4000-8000-${slot.padStart(12, "0")}`;
}

export const SEED_ROWS: SeedRow[] = [
  // 3 pending
  { user_id: uid("100000000001"), selfie_url: "https://example.invalid/p1.png", status: "pending",        full_name: `${FACE_E2E_TAG}-p1`, verification_type: "face" },
  { user_id: uid("100000000002"), selfie_url: "https://example.invalid/p2.png", status: "submitted",      full_name: `${FACE_E2E_TAG}-p2`, verification_type: "face" },
  { user_id: uid("100000000003"), selfie_url: "https://example.invalid/p3.png", status: "future_unknown",full_name: `${FACE_E2E_TAG}-p3`, verification_type: "face" },
  // 2 approved
  { user_id: uid("200000000001"), selfie_url: "https://example.invalid/a1.png", status: "approved",       full_name: `${FACE_E2E_TAG}-a1`, verification_type: "face" },
  { user_id: uid("200000000002"), selfie_url: "https://example.invalid/a2.png", status: "auto_approved",  full_name: `${FACE_E2E_TAG}-a2`, verification_type: "face" },
  // 2 rejected
  { user_id: uid("300000000001"), selfie_url: "https://example.invalid/r1.png", status: "rejected",       full_name: `${FACE_E2E_TAG}-r1`, verification_type: "face" },
  { user_id: uid("300000000002"), selfie_url: "https://example.invalid/r2.png", status: "auto_rejected",  full_name: `${FACE_E2E_TAG}-r2`, verification_type: "face" },
];

export const EXPECTED = {
  pending: 3,
  approved: 2,
  rejected: 2,
  all: 7,
};

export async function seedFaceRows(): Promise<void> {
  // upsert by user_id (unique-ish per seed). face_verification_submissions has
  // no natural unique key on user_id, so we delete-then-insert to stay idempotent.
  await deleteFaceRows();
  await upsertRows("face_verification_submissions", SEED_ROWS, "user_id");
}

export async function deleteFaceRows(): Promise<void> {
  await deleteRows(
    "face_verification_submissions",
    `full_name=like.${encodeURIComponent(FACE_E2E_TAG)}-%`,
  );
}
