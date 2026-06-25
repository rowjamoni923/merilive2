// Pure decision policy for face verification.
// Extracted so the exact outcome rules (hard reject / soft retry / manual review
// / auto approve) can be unit tested without AWS, Supabase or the network.
//
// Policy (locked 2026-06-26, updated per owner rules):
//   HARD AUTO-REJECT (no retry, user-visible) — ONLY these reasons:
//     1. banned_face        — face is on the ban list (previously banned account)
//     2. duplicate_face     — face already belongs to another APPROVED account
//        (role mismatch: existing host re-verifying as user, etc. is enforced
//         in index.ts before AWS and short-circuits here.)
//   SOFT RETRY (status=needs_retry, user can re-upload only failing items)
//     - All required evidence (profile photo, face video frame, and for hosts
//       intro video frame) was readable, but at least one CompareFaces score
//       against the live front scan is < SIMILARITY_THRESHOLD (85%), OR the
//       host gallery photos don't all match the live face.
//   MANUAL REVIEW (status stays pending/submitted)
//     - Liveness provider unavailable / unreachable
//     - Duplicate search did not complete
//     - Face indexing failed
//     - Pending duplicate candidate (not yet approved on the other account)
//     - Required evidence missing/unreadable
//   AUTO APPROVE
//     - Host: profile photo + face video + intro video all >= 85% to live scan.
//     - User: profile photo + face video all >= 85% to live scan.
//   Gender check is NO LONGER used for reject or manual review — owner rule.

export const SIMILARITY_THRESHOLD = 85;
export const HARD_GENDER_CONF = 90;

export type VerificationType = "host" | "user";

export type EvidenceCheck = {
  label: "profile_photo" | "face_video" | "intro_video";
  score: number | null;
  error: string | null;
};

export type DecisionInput = {
  verificationType: VerificationType;

  // Hard fraud signals
  isBannedFace: boolean;
  isDuplicateApproved: boolean;     // matches an already-APPROVED other account
  duplicateCandidatePending: boolean; // matches a pending/unapproved candidate

  // Gender
  expectedGender: "male" | "female" | null;
  detectedGender: "male" | "female" | "unknown";
  genderConf: number;               // 0..100
  genderDeclarationMismatch: boolean;
  genderConflict: boolean;          // signals across evidence disagree → don't treat as hard

  // Live face scan
  frontError: boolean;              // could not read/detect front face

  // Evidence vs live (CompareFaces results)
  evidenceChecks: EvidenceCheck[];  // profile_photo + face_video (+intro_video for hosts)

  // Host gallery (3 host photos)
  hostGalleryComplete: boolean;     // true for non-hosts, or all 3 scored
  hostPhotosMismatch: boolean;

  // Provider/infrastructure gates
  livenessProviderAvailable: boolean;
  livenessActuallyRan: boolean;
  duplicateSearchCompleted: boolean;
  faceIndexed: boolean;             // post-gate index succeeded (only required when not already duplicate)

  // Soft flags that block auto-approve but stay manual
  livenessFailed: boolean;
  replaySuspected: boolean;
  profileMismatch: boolean;
};

export type Decision =
  | { kind: "reject"; reason: "banned_face" | "duplicate_face" }
  | { kind: "needs_retry"; failedEvidence: string[] }
  | { kind: "manual_review"; reason: string }
  | { kind: "auto_approve" };

export function decideFaceVerificationOutcome(input: DecisionInput): Decision {
  // 1) HARD FRAUD — only banned face / duplicate of already-approved account.
  //    Gender mismatch is NOT a reject reason (owner policy 2026-06-26).
  if (input.isBannedFace) return { kind: "reject", reason: "banned_face" };
  if (input.isDuplicateApproved) return { kind: "reject", reason: "duplicate_face" };


  // 2) EVIDENCE COMPLETENESS — if anything required is missing/unreadable,
  //    we cannot fairly say "not the same person", so it's manual review.
  const required: Array<EvidenceCheck["label"]> = input.verificationType === "host"
    ? ["profile_photo", "face_video", "intro_video"]
    : ["profile_photo", "face_video"];
  const byLabel = new Map(input.evidenceChecks.map((c) => [c.label, c] as const));
  const allRequiredScored = required.every((lbl) => {
    const c = byLabel.get(lbl);
    return !!c && typeof c.score === "number" && c.error === null;
  });
  if (!allRequiredScored || input.frontError || !input.hostGalleryComplete) {
    return { kind: "manual_review", reason: "photo_video_live_evidence_missing" };
  }

  // 3) SOFT RETRY — three-way identity mismatch.
  const failed: string[] = [];
  for (const lbl of required) {
    const c = byLabel.get(lbl)!;
    if ((c.score as number) < SIMILARITY_THRESHOLD) failed.push(lbl);
  }
  if (input.verificationType === "host" && input.hostPhotosMismatch) {
    failed.push("host_gallery");
  }
  if (failed.length > 0) {
    return { kind: "needs_retry", failedEvidence: failed };
  }

  // 4) INFRASTRUCTURE / SOFT-FLAG GATES → manual review (NOT user-visible reject).
  if (input.duplicateCandidatePending) {
    return { kind: "manual_review", reason: "duplicate_candidate_manual_review" };
  }
  if (!input.livenessProviderAvailable) {
    return { kind: "manual_review", reason: "liveness_provider_missing" };
  }
  if (!input.livenessActuallyRan) {
    return { kind: "manual_review", reason: "liveness_provider_unreachable" };
  }
  if (!input.duplicateSearchCompleted) {
    return { kind: "manual_review", reason: "duplicate_search_unverified" };
  }
  if (!input.faceIndexed) {
    return { kind: "manual_review", reason: "face_index_failed" };
  }
  if (input.livenessFailed) {
    return { kind: "manual_review", reason: "liveness_failed_manual_review" };
  }
  if (input.replaySuspected) {
    return { kind: "manual_review", reason: "replay_suspected_manual_review" };
  }
  if (input.profileMismatch) {
    return { kind: "manual_review", reason: "profile_mismatch_manual_review" };
  }
  // Gender mismatch is intentionally NOT checked here (owner policy 2026-06-26).


  // 5) Everything green.
  return { kind: "auto_approve" };
}
