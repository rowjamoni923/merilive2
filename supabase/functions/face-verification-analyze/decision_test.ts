// Pure decision-policy tests for face verification.
// Verifies the LOCKED policy (2026-06-26) end-to-end across every branch
// without touching AWS Rekognition, Supabase, or the network.
//
// Run via the supabase test runner.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  decideFaceVerificationOutcome,
  type DecisionInput,
  type EvidenceCheck,
  SIMILARITY_THRESHOLD,
} from "./decision.ts";

function ev(label: EvidenceCheck["label"], score: number | null, error: string | null = null): EvidenceCheck {
  return { label, score, error };
}

function baseHost(overrides: Partial<DecisionInput> = {}): DecisionInput {
  return {
    verificationType: "host",
    isBannedFace: false,
    isDuplicateApproved: false,
    duplicateCandidatePending: false,
    expectedGender: "female",
    detectedGender: "female",
    genderConf: 99,
    genderDeclarationMismatch: false,
    genderConflict: false,
    frontError: false,
    evidenceChecks: [ev("profile_photo", 95), ev("face_video", 93), ev("intro_video", 91)],
    hostGalleryComplete: true,
    hostPhotosMismatch: false,
    livenessProviderAvailable: true,
    livenessActuallyRan: true,
    duplicateSearchCompleted: true,
    faceIndexed: true,
    livenessFailed: false,
    replaySuspected: false,
    profileMismatch: false,
    ...overrides,
  };
}

function baseUser(overrides: Partial<DecisionInput> = {}): DecisionInput {
  return baseHost({
    verificationType: "user",
    expectedGender: "male",
    detectedGender: "male",
    evidenceChecks: [ev("profile_photo", 95), ev("face_video", 93)],
    ...overrides,
  });
}

// ──────────────────────────────────────────────────────────────────────
// HAPPY PATH
// ──────────────────────────────────────────────────────────────────────
Deno.test("auto_approve: host with all evidence >=55% and clean gates", () => {
  assertEquals(decideFaceVerificationOutcome(baseHost()).kind, "auto_approve");
});

Deno.test("auto_approve: user with two-evidence >=55%", () => {
  assertEquals(decideFaceVerificationOutcome(baseUser()).kind, "auto_approve");
});

Deno.test("auto_approve: scores exactly at threshold", () => {
  const d = decideFaceVerificationOutcome(baseHost({
    evidenceChecks: [
      ev("profile_photo", SIMILARITY_THRESHOLD),
      ev("face_video", SIMILARITY_THRESHOLD),
      ev("intro_video", SIMILARITY_THRESHOLD),
    ],
  }));
  assertEquals(d.kind, "auto_approve");
});

// ──────────────────────────────────────────────────────────────────────
// HARD REJECT — banned / duplicate only
// ──────────────────────────────────────────────────────────────────────
Deno.test("reject: banned face wins over everything", () => {
  const d = decideFaceVerificationOutcome(baseHost({
    isBannedFace: true,
    isDuplicateApproved: true,
    evidenceChecks: [ev("profile_photo", 10), ev("face_video", 10), ev("intro_video", 10)],
  }));
  assertEquals(d, { kind: "reject", reason: "banned_face" });
});

Deno.test("reject: duplicate APPROVED face is hard reject", () => {
  const d = decideFaceVerificationOutcome(baseHost({ isDuplicateApproved: true }));
  assertEquals(d, { kind: "reject", reason: "duplicate_face" });
});

Deno.test("auto_approve: gender mismatch alone is not a reject", () => {
  const d = decideFaceVerificationOutcome(baseHost({
    expectedGender: "female", detectedGender: "male", genderConf: 99,
  }));
  assertEquals(d.kind, "auto_approve");
});

Deno.test("auto_approve: male user account + detected female stays clean if all gates pass", () => {
  const d = decideFaceVerificationOutcome(baseUser({
    expectedGender: "male", detectedGender: "female", genderConf: 95,
  }));
  assertEquals(d.kind, "auto_approve");
});

Deno.test("auto_approve: gender mismatch only 80% confident is ignored", () => {
  const d = decideFaceVerificationOutcome(baseHost({
    expectedGender: "female", detectedGender: "male", genderConf: 80,
  }));
  assertEquals(d.kind, "auto_approve");
});

Deno.test("manual_review: gender conflict across evidence at 95% → not hard reject", () => {
  const d = decideFaceVerificationOutcome(baseHost({
    expectedGender: "female", detectedGender: "male", genderConf: 95, genderConflict: true,
  }));
  // genderConflict suppresses hard reject; falls through to soft gates.
  // Everything else is clean here, so auto_approve.
  assertEquals(d.kind, "auto_approve");
});

Deno.test("auto_approve: explicit declaration mismatch flag is ignored by owner policy", () => {
  const d = decideFaceVerificationOutcome(baseHost({ genderDeclarationMismatch: true }));
  assertEquals(d.kind, "auto_approve");
});

// ──────────────────────────────────────────────────────────────────────
// SOFT RETRY — three-way identity mismatch
// ──────────────────────────────────────────────────────────────────────
Deno.test("needs_retry: profile_photo below threshold (host)", () => {
  const d = decideFaceVerificationOutcome(baseHost({
    evidenceChecks: [ev("profile_photo", 40), ev("face_video", 95), ev("intro_video", 95)],
  }));
  assertEquals(d, { kind: "needs_retry", failedEvidence: ["profile_photo"] });
});

Deno.test("needs_retry: face_video below threshold (user)", () => {
  const d = decideFaceVerificationOutcome(baseUser({
    evidenceChecks: [ev("profile_photo", 95), ev("face_video", 50)],
  }));
  assertEquals(d, { kind: "needs_retry", failedEvidence: ["face_video"] });
});

Deno.test("needs_retry: intro_video below threshold (host only)", () => {
  const d = decideFaceVerificationOutcome(baseHost({
    evidenceChecks: [ev("profile_photo", 95), ev("face_video", 95), ev("intro_video", 40)],
  }));
  assertEquals(d, { kind: "needs_retry", failedEvidence: ["intro_video"] });
});

Deno.test("needs_retry: multiple evidence sources below threshold", () => {
  const d = decideFaceVerificationOutcome(baseHost({
    evidenceChecks: [ev("profile_photo", 20), ev("face_video", 30), ev("intro_video", 95)],
  }));
  assertEquals(d, { kind: "needs_retry", failedEvidence: ["profile_photo", "face_video"] });
});

Deno.test("needs_retry: host gallery mismatch is flagged", () => {
  const d = decideFaceVerificationOutcome(baseHost({ hostPhotosMismatch: true }));
  assertEquals(d, { kind: "needs_retry", failedEvidence: ["host_gallery"] });
});

Deno.test("needs_retry: gallery mismatch + evidence mismatch combined", () => {
  const d = decideFaceVerificationOutcome(baseHost({
    hostPhotosMismatch: true,
    evidenceChecks: [ev("profile_photo", 20), ev("face_video", 95), ev("intro_video", 95)],
  }));
  assertEquals(d, { kind: "needs_retry", failedEvidence: ["profile_photo", "host_gallery"] });
});

Deno.test("needs_retry does NOT fire when account is hard-rejected (duplicate beats retry)", () => {
  const d = decideFaceVerificationOutcome(baseHost({
    isDuplicateApproved: true,
    evidenceChecks: [ev("profile_photo", 20), ev("face_video", 20), ev("intro_video", 20)],
  }));
  assertEquals(d, { kind: "reject", reason: "duplicate_face" });
});

// ──────────────────────────────────────────────────────────────────────
// MANUAL REVIEW — evidence missing / infra gates / soft flags
// ──────────────────────────────────────────────────────────────────────
Deno.test("manual_review: front face couldn't be read", () => {
  const d = decideFaceVerificationOutcome(baseHost({ frontError: true }));
  assertEquals(d.kind, "manual_review");
});

Deno.test("manual_review: face_video evidence has error → not retry, manual", () => {
  const d = decideFaceVerificationOutcome(baseHost({
    evidenceChecks: [ev("profile_photo", 95), ev("face_video", null, "no_face"), ev("intro_video", 95)],
  }));
  // Cannot fairly say "different person", so it must be manual review, not needs_retry.
  assertEquals(d.kind, "manual_review");
});

Deno.test("manual_review: host gallery incomplete (only some scored)", () => {
  const d = decideFaceVerificationOutcome(baseHost({ hostGalleryComplete: false }));
  assertEquals(d.kind, "manual_review");
});

Deno.test("manual_review: pending duplicate candidate", () => {
  const d = decideFaceVerificationOutcome(baseHost({ duplicateCandidatePending: true }));
  assertEquals(d, { kind: "manual_review", reason: "duplicate_candidate_manual_review" });
});

Deno.test("manual_review: liveness provider unavailable", () => {
  const d = decideFaceVerificationOutcome(baseHost({ livenessProviderAvailable: false }));
  assertEquals(d, { kind: "manual_review", reason: "liveness_provider_missing" });
});

Deno.test("manual_review: liveness provider didn't return a status", () => {
  const d = decideFaceVerificationOutcome(baseHost({ livenessActuallyRan: false }));
  assertEquals(d, { kind: "manual_review", reason: "liveness_provider_unreachable" });
});

Deno.test("manual_review: duplicate search didn't complete", () => {
  const d = decideFaceVerificationOutcome(baseHost({ duplicateSearchCompleted: false }));
  assertEquals(d, { kind: "manual_review", reason: "duplicate_search_unverified" });
});

Deno.test("manual_review: face indexing failed (so future dup detection unsafe)", () => {
  const d = decideFaceVerificationOutcome(baseHost({ faceIndexed: false }));
  assertEquals(d, { kind: "manual_review", reason: "face_index_failed" });
});

Deno.test("manual_review: liveness failed soft flag", () => {
  const d = decideFaceVerificationOutcome(baseHost({ livenessFailed: true }));
  assertEquals(d.kind, "manual_review");
});

Deno.test("manual_review: replay suspected", () => {
  const d = decideFaceVerificationOutcome(baseHost({ replaySuspected: true }));
  assertEquals(d.kind, "manual_review");
});

Deno.test("manual_review: profile mismatch soft flag", () => {
  const d = decideFaceVerificationOutcome(baseHost({ profileMismatch: true }));
  assertEquals(d.kind, "manual_review");
});

// ──────────────────────────────────────────────────────────────────────
// PRIORITY ORDERING
// ──────────────────────────────────────────────────────────────────────
Deno.test("priority: hard reject beats needs_retry beats manual_review", () => {
  // banned > duplicate > retry > manual
  assertEquals(decideFaceVerificationOutcome(baseHost({
    isBannedFace: true, isDuplicateApproved: true, genderDeclarationMismatch: true,
    hostPhotosMismatch: true, livenessProviderAvailable: false,
  })).kind, "reject");
  assertEquals(decideFaceVerificationOutcome(baseHost({
    isDuplicateApproved: true, genderDeclarationMismatch: true, hostPhotosMismatch: true,
  })), { kind: "reject", reason: "duplicate_face" });
  // No hard, but retry conditions present → retry beats manual gates.
  assertEquals(decideFaceVerificationOutcome(baseHost({
  })).kind, "needs_retry");
});
