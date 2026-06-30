// Pure duplicate-face evaluation policy.
//
// Extracted from index.ts so the rules can be regression-tested without
// AWS Rekognition, the face provider, or Supabase.
//
// Two non-negotiable rules (locked 2026-06-30):
//   R1. Re-submission by the SAME user must NEVER be treated as a duplicate.
//       Even if the provider returns this user's own indexed face as the top
//       match with 99% similarity, it gets filtered out before any decision.
//   R2. A face that matches a DIFFERENT account which is already APPROVED
//       (and similarity >= DUPLICATE_FACE_MIN_SIMILARITY) MUST be hard-rejected
//       as `duplicate_face`. Unapproved/pending candidates fall back to manual
//       review (`candidate_review`) instead of a user-visible reject.

export const DUPLICATE_FACE_MIN_SIMILARITY = 90;

export type ProviderMatch = {
  external_user_id: string | null;
  similarity: number;
  indexed_at?: string | null;
};

export type CandidateProfile = {
  user_id: string;
  display_name: string | null;
  app_uid: string | null;
  avatar_url: string | null;
  previously_approved: boolean;
};

export type DuplicateEvaluation =
  | { kind: "no_match" }
  | { kind: "self_resubmission"; filteredOut: number }
  | {
      kind: "duplicate";
      previous_user_id: string;
      previous_display_name: string | null;
      previous_app_uid: string | null;
      similarity: number;
      other_matches: number;
    }
  | {
      kind: "candidate_review";
      previous_user_id: string;
      previous_display_name: string | null;
      previous_app_uid: string | null;
      similarity: number;
      other_matches: number;
      reason: "not_previously_approved" | "below_hard_threshold";
    };

/**
 * Evaluate provider matches against the current user and the candidate's
 * approval state. Pure function — no I/O.
 */
export function evaluateDuplicateMatches(
  currentUserId: string,
  matches: ProviderMatch[],
  resolveCandidate: (userId: string) => CandidateProfile | null,
  minSimilarity: number = DUPLICATE_FACE_MIN_SIMILARITY,
): DuplicateEvaluation {
  if (!matches || matches.length === 0) return { kind: "no_match" };

  // R1: strip out the current user's own indexed faces. Any match without an
  // external_user_id is also dropped (we can't attribute it to an account).
  const others = matches.filter(
    (m) => !!m.external_user_id && m.external_user_id !== currentUserId,
  );
  const selfMatches = matches.filter((m) => m.external_user_id === currentUserId).length;
  if (others.length === 0) {
    return selfMatches > 0
      ? { kind: "self_resubmission", filteredOut: selfMatches }
      : { kind: "no_match" };
  }

  // Pick the highest-similarity other account.
  const top = [...others].sort((a, b) => b.similarity - a.similarity)[0];
  const candidate = resolveCandidate(top.external_user_id as string);
  const prevName = candidate?.display_name ?? null;
  const prevUid = candidate?.app_uid ?? null;
  const similarity = Number(top.similarity || 0);

  if (!candidate?.previously_approved) {
    return {
      kind: "candidate_review",
      previous_user_id: top.external_user_id as string,
      previous_display_name: prevName,
      previous_app_uid: prevUid,
      similarity,
      other_matches: others.length,
      reason: "not_previously_approved",
    };
  }

  if (similarity < minSimilarity) {
    return {
      kind: "candidate_review",
      previous_user_id: top.external_user_id as string,
      previous_display_name: prevName,
      previous_app_uid: prevUid,
      similarity,
      other_matches: others.length,
      reason: "below_hard_threshold",
    };
  }

  // R2: another approved account + similarity >= threshold → hard duplicate.
  return {
    kind: "duplicate",
    previous_user_id: top.external_user_id as string,
    previous_display_name: prevName,
    previous_app_uid: prevUid,
    similarity,
    other_matches: others.length,
  };
}
