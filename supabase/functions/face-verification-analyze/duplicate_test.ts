// Regression tests for the duplicate-face evaluation policy.
//
// These guard the two locked rules:
//   R1. Same-user re-submission must NOT be blocked as a duplicate.
//   R2. Same face on a different APPROVED account must be hard-rejected.
//
// Pure unit tests — no AWS / Supabase / network.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  evaluateDuplicateMatches,
  DUPLICATE_FACE_MIN_SIMILARITY,
  type CandidateProfile,
  type ProviderMatch,
} from "./duplicate.ts";
import {
  decideFaceVerificationOutcome,
  type DecisionInput,
  type EvidenceCheck,
} from "./decision.ts";

const SELF = "user-self-uuid-aaaa";
const OTHER_A = "user-other-aaaa-uuid";
const OTHER_B = "user-other-bbbb-uuid";

function profile(
  user_id: string,
  previously_approved: boolean,
  overrides: Partial<CandidateProfile> = {},
): CandidateProfile {
  return {
    user_id,
    display_name: `Acct ${user_id.slice(-4)}`,
    app_uid: `UID-${user_id.slice(-4)}`,
    avatar_url: null,
    previously_approved,
    ...overrides,
  };
}

function resolverFor(map: Record<string, CandidateProfile>) {
  return (uid: string) => map[uid] ?? null;
}

// ──────────────────────────────────────────────────────────────────────
// R1 — same-user re-submission must NOT be flagged as duplicate
// ──────────────────────────────────────────────────────────────────────
Deno.test("R1: provider returns ONLY the current user's own face → self_resubmission", () => {
  const matches: ProviderMatch[] = [
    { external_user_id: SELF, similarity: 99.4 },
    { external_user_id: SELF, similarity: 97.1 },
  ];
  const r = evaluateDuplicateMatches(SELF, matches, resolverFor({}));
  assertEquals(r, { kind: "self_resubmission", filteredOut: 2 });
});

Deno.test("R1: high-similarity self match alongside a low non-approved other → still not a duplicate", () => {
  const matches: ProviderMatch[] = [
    { external_user_id: SELF, similarity: 99 },
    { external_user_id: OTHER_A, similarity: 60 },
  ];
  const r = evaluateDuplicateMatches(
    SELF,
    matches,
    resolverFor({ [OTHER_A]: profile(OTHER_A, false) }),
  );
  // OTHER_A is not approved → candidate review, NOT hard reject.
  assertEquals(r.kind, "candidate_review");
  if (r.kind === "candidate_review") {
    assertEquals(r.previous_user_id, OTHER_A);
    assertEquals(r.reason, "not_previously_approved");
  }
});

Deno.test("R1: empty match list → no_match", () => {
  assertEquals(
    evaluateDuplicateMatches(SELF, [], resolverFor({})),
    { kind: "no_match" },
  );
});

Deno.test("R1: integration — self resubmit feeding decision policy must NOT hard-reject", () => {
  // Simulate what index.ts wires into the decision policy after a self-only match.
  const ev: EvidenceCheck[] = [
    { label: "profile_photo", score: 92, error: null },
    { label: "face_video", score: 90, error: null },
    { label: "intro_video", score: 88, error: null },
  ];
  const input: DecisionInput = {
    verificationType: "host",
    isBannedFace: false,
    isDuplicateApproved: false, // ← evaluateDuplicateMatches said self_resubmission
    duplicateCandidatePending: false,
    expectedGender: "female",
    detectedGender: "female",
    genderConf: 99,
    genderDeclarationMismatch: false,
    genderConflict: false,
    frontError: false,
    evidenceChecks: ev,
    hostGalleryComplete: true,
    hostPhotosMismatch: false,
    livenessProviderAvailable: true,
    livenessActuallyRan: true,
    duplicateSearchCompleted: true,
    faceIndexed: true,
    livenessFailed: false,
    replaySuspected: false,
    profileMismatch: false,
  };
  assertEquals(decideFaceVerificationOutcome(input).kind, "auto_approve");
});

// ──────────────────────────────────────────────────────────────────────
// R2 — same face on a different APPROVED account → hard duplicate
// ──────────────────────────────────────────────────────────────────────
Deno.test("R2: single approved-other match at threshold → duplicate", () => {
  const matches: ProviderMatch[] = [
    { external_user_id: OTHER_A, similarity: DUPLICATE_FACE_MIN_SIMILARITY },
  ];
  const r = evaluateDuplicateMatches(
    SELF,
    matches,
    resolverFor({ [OTHER_A]: profile(OTHER_A, true) }),
  );
  assertEquals(r.kind, "duplicate");
  if (r.kind === "duplicate") {
    assertEquals(r.previous_user_id, OTHER_A);
    assertEquals(r.similarity, DUPLICATE_FACE_MIN_SIMILARITY);
    assertEquals(r.other_matches, 1);
  }
});

Deno.test("R2: multi-account match picks highest-similarity approved account", () => {
  const matches: ProviderMatch[] = [
    { external_user_id: OTHER_A, similarity: 91 },
    { external_user_id: OTHER_B, similarity: 97.3 },
    { external_user_id: SELF, similarity: 99.9 }, // own face — must be ignored
  ];
  const r = evaluateDuplicateMatches(
    SELF,
    matches,
    resolverFor({
      [OTHER_A]: profile(OTHER_A, true),
      [OTHER_B]: profile(OTHER_B, true),
    }),
  );
  assertEquals(r.kind, "duplicate");
  if (r.kind === "duplicate") {
    assertEquals(r.previous_user_id, OTHER_B);
    assertEquals(r.similarity, 97.3);
    assertEquals(r.other_matches, 2);
  }
});

Deno.test("R2: candidate exists but NOT approved → candidate_review, not hard reject", () => {
  const matches: ProviderMatch[] = [
    { external_user_id: OTHER_A, similarity: 99 },
  ];
  const r = evaluateDuplicateMatches(
    SELF,
    matches,
    resolverFor({ [OTHER_A]: profile(OTHER_A, false) }),
  );
  assertEquals(r.kind, "candidate_review");
  if (r.kind === "candidate_review") {
    assertEquals(r.reason, "not_previously_approved");
  }
});

Deno.test("R2: approved candidate but similarity below threshold → candidate_review", () => {
  const matches: ProviderMatch[] = [
    { external_user_id: OTHER_A, similarity: DUPLICATE_FACE_MIN_SIMILARITY - 0.1 },
  ];
  const r = evaluateDuplicateMatches(
    SELF,
    matches,
    resolverFor({ [OTHER_A]: profile(OTHER_A, true) }),
  );
  assertEquals(r.kind, "candidate_review");
  if (r.kind === "candidate_review") {
    assertEquals(r.reason, "below_hard_threshold");
  }
});

Deno.test("R2: unresolved candidate (profile missing) → candidate_review, never hard reject", () => {
  const matches: ProviderMatch[] = [
    { external_user_id: OTHER_A, similarity: 99 },
  ];
  // Resolver returns null — we can't confirm approval, so we must not hard-reject.
  const r = evaluateDuplicateMatches(SELF, matches, resolverFor({}));
  assertEquals(r.kind, "candidate_review");
});

Deno.test("R2: matches with missing external_user_id are dropped", () => {
  const matches: ProviderMatch[] = [
    { external_user_id: null, similarity: 99 },
    { external_user_id: "", similarity: 98 },
  ];
  const r = evaluateDuplicateMatches(SELF, matches, resolverFor({}));
  assertEquals(r, { kind: "no_match" });
});

Deno.test("R2: integration — duplicate result feeds decision policy as hard reject", () => {
  const dup = evaluateDuplicateMatches(
    SELF,
    [{ external_user_id: OTHER_A, similarity: 96 }],
    resolverFor({ [OTHER_A]: profile(OTHER_A, true) }),
  );
  const isDuplicateApproved = dup.kind === "duplicate";
  const input: DecisionInput = {
    verificationType: "user",
    isBannedFace: false,
    isDuplicateApproved,
    duplicateCandidatePending: false,
    expectedGender: "male",
    detectedGender: "male",
    genderConf: 99,
    genderDeclarationMismatch: false,
    genderConflict: false,
    frontError: false,
    evidenceChecks: [
      { label: "profile_photo", score: 95, error: null },
      { label: "face_video", score: 93, error: null },
    ],
    hostGalleryComplete: true,
    hostPhotosMismatch: false,
    livenessProviderAvailable: true,
    livenessActuallyRan: true,
    duplicateSearchCompleted: true,
    faceIndexed: true,
    livenessFailed: false,
    replaySuspected: false,
    profileMismatch: false,
  };
  assertEquals(decideFaceVerificationOutcome(input), {
    kind: "reject",
    reason: "duplicate_face",
  });
});
