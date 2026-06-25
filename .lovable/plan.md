
## Goal

Fix Face Verification professionalism regressions and lock the final policy: auto-approve/auto-reject must be deterministic, and user-visible auto-reject is allowed only for a previous-account duplicate face or a confident account-gender mismatch.

## Research + verified signal

- KYC / identity-verification best practice is workflow-based: unclear model/provider signals should become manual review, not immediate user-visible rejection. Source: https://secured.vision/identity-verification-workflow-best-practices-for-saas-onboarding
- False positives usually come from combining signals/thresholds too aggressively; reduce false positives by separating hard fraud from review-needed cases. Source: https://validator.cloud/reduce-false-positives-in-identity-verification-workflows
- Manual identity verification is still required when automation cannot confidently decide. Source: https://www.signzy.com/blogs/manual-identity-verification
- Current code root cause verified: a previous emergency passive-scan guard changed `duplicate_face` and `gender_mismatch` into manual-review reasons for `scan_mode='passive_photo_video_live'`, so the two fraud cases the owner expects to reject could remain Pending instead of Rejected.
- Current live DB signal verified: last 7 days show 5 approved and 5 rejected submissions; rejection samples include gender mismatch and duplicate-face cases, so the pipeline exists, but the edge policy had split behavior between passive and non-passive paths.
- Current UI root cause verified: user Step 1 computed completion live from `fullName + age + language`, so selecting language immediately unmounted Step 1 and mounted Step 2 while the Select was still closing, causing visible jumping.
- Policy correction locked: duplicate previous account and confident gender/account mismatch are hard fraud decisions; liveness/replay/photo/profile/gallery/quality problems are manual-review blockers for auto-approve, not instant user-visible rejects.

## What changed

- User Face Verification Step 1 now advances only after explicit **Next** tap (`userInfoStepComplete`), so selecting language no longer causes auto-unmount/jump.
- Passive photo/video/live scans now hard-reject only duplicate previous account and confident gender/account mismatch, matching the owner requirement.
- Soft-risk passive cases (liveness/replay/photo/profile/gallery/quality) block auto-approve and stay Pending for admin review, so safety is preserved without false rejects.

---

## Previous Goal

Make `src/pages/FaceVerification.tsx` 100% professional and tamper-proof end-to-end:

1. Steps 1 / 2 / 3 (hosts) and Info / Photo / Face (users) get real, premium, KYC-grade customization.
2. The instant Submit is tapped → camera is killed, status flips to `under_review` in the same tick, and a clean "Under Review" screen takes over. The camera surface can never reappear on this page again until admin acts.
3. After submit, re-entering the page (Profile button, deep link, back-nav) shows only the locked "Under Review" surface — no Start button, no camera mount path.
4. AI detector finalises automatically:
   - User submitting as host → `rejected: role_mismatch`
   - Host submitting as user → `rejected: role_mismatch`
   - Same face on a second profile → `rejected: duplicate_face`
5. Repeat phone-number sharers (10 share strikes → account ban) cannot open a new ID. Their face hash + device + IP are blocklisted and new face-verification submissions are auto-rejected at the edge function before any AI cost.

## What I'll change

### A. Post-submit hard lock (`src/pages/FaceVerification.tsx`)

- Hoist the `submitInProgress || verificationStatus === 'submitted' | 'verified' | 'rejected'` short-circuit to the very top of the component render — above every other return, above any hook that mounts a `<video>` / native camera surface.
- In both submit handlers (user path ~L1944, host path ~L2215):
  1. `setSubmitInProgress(true)` + `setVerificationStatus('submitted')` synchronously, before any `await`.
  2. `document.body.classList.remove('native-face-camera-active')` + call `NativeCall`/`nativeFaceCam.stop()` immediately.
  3. THEN run uploads + RPC insert.
- Add `postSubmitLockedRef` check at the top of `startFaceCamera`, `startVerification`, every "Next" / "Start scan" button handler — so even a racing click can't relaunch the camera.
- On unmount, do NOT clear `postSubmitLockedRef` if a row exists in `face_verification_submissions` with status in (`pending`,`submitted`,`under_review`,`verified`).

### B. Cold-load gating

- Initial fetch already sets `verificationStatus='submitted'` when a pending row exists (L590). Extend it to also set `postSubmitLockedRef.current = true` so the page is read-only on every re-entry until admin/AI moves the row to `rejected` or `unverified`.
- Wire a tiny `useEffect` realtime subscription on `face_verification_submissions` filtered by `user_id` — on any status change, re-evaluate the lock (already partially there, just consolidate).

### C. Steps customization (presentation only — no logic change)

For **hosts** (3 steps already labeled Basic Info / Photos & Video / Live Face Scan) and **users** (Info / Photo / Face) I'll bring them to KYC-grade:

- Pull the 3-step indicator into a shared `<FaceVerificationStepper steps={...} current={...} />` component (`src/components/face/FaceVerificationStepper.tsx`). Pro look: numbered pill → checked emerald → muted, segmented connector with animated fill, step label + sub-label, sticky to top with backdrop blur.
- Replace each step card header with a uniform `<StepCard icon title subtitle requirements={[]} />` (`src/components/face/StepCard.tsx`) that lists the exact requirements (e.g. "Real-time selfie • 18+ • Government-style face crop") so the user knows what's being checked.
- Step 2 photo grid: drag-reorder removed, but each tile now shows a quality badge (sharp / blurry / dark) from the existing `assessCameraFrameQuality` helper before allowing "Next".
- Step 3 (live scan): full-bleed camera frame with a glass overlay carrying the current instruction, a thin progress ring around the face oval, and an explicit "Verifying with AI…" state after capture so the user sees motion until submit-screen takes over.
- All new visuals use semantic tokens (`--background`, `--card`, `--primary`, etc.) — no hardcoded `bg-white`/`text-black`.

### D. AI detector guarantees (`supabase/functions/face-verification-analyze/index.ts`)

Already runs on `under_review`. Confirm + extend:

- `role_mismatch` rejection:
  - If the submission's `intended_role = 'host'` and Rekognition gender ≠ `Female` (or admin-configured host gender) → reject with `rejection_reason='role_mismatch_host_gender'`.
  - If `intended_role = 'user'` and the same `user_id` already has an approved `host_applications` row or `profiles.is_host = true` → reject with `role_mismatch_existing_host` (prevents host downgrading via fake user submission to dodge bans).
- `duplicate_face` (already wired) — keep current AWS Rekognition `SearchFacesByImage` against `rekognition_shards`, but ALSO compare the resulting `external_image_id` against `face_records.user_id`; if it maps to a different `user_id` whose profile is banned/deleted/contact-violation-locked → reject with `duplicate_face_banned_owner` (this is the "old banned ID trying to come back" guard).

### E. Contact-violation lifetime ban (10-strike rule)

DB:
- Add view/function `is_user_contact_banned(uid uuid) returns boolean` reading `user_contact_violations` count + `profiles.banned_for_contact_sharing` (or whichever existing flag — verify in `host_contact_violations` & `user_contact_violations`).
- Trigger on `user_contact_violations` / `host_contact_violations` insert: when running count for a `user_id` reaches the admin-configured threshold (default 10, **read from admin settings, never hardcoded**), insert the user's latest verified `face_hash` into `banned_face_hashes` with `reason='contact_violation_threshold'` and the user's last-known device fingerprint into `banned_devices`.

Edge function `face-verification-analyze`:
- Before any Rekognition spend, look up the submitter's `face_hash`, `device_id`, `ip` against `banned_face_hashes` / `banned_devices` / `banned_ips`. Any hit → instant `rejected: banned_identity_reuse` and write `admin_logs` row.

Client (`FaceVerification.tsx`):
- On page mount, call a lightweight RPC `check_face_verification_eligibility()` that returns `{ eligible, reason }`. If `eligible=false`, render a permanent block screen ("Your account is permanently restricted from identity verification due to repeated policy violations") — no camera, no steps, no retry button.

### F. Admin visibility

- Surface the new rejection reasons (`role_mismatch_*`, `duplicate_face_banned_owner`, `banned_identity_reuse`) in `AdminFaceVerification.tsx`'s status badge map so support can see why the auto-reject fired.
- Admin panel for the 10-strike threshold (already covered by admin-panel-single-source-of-truth core rule — will read from `app_settings` row `contact_violation_ban_threshold`).

## Files touched

```text
src/pages/FaceVerification.tsx                          (lock hoist, mount-gate, stepper extract)
src/components/face/FaceVerificationStepper.tsx         NEW
src/components/face/StepCard.tsx                        NEW
supabase/functions/face-verification-analyze/index.ts   (role_mismatch + banned-identity gates)
supabase/migrations/<new>                               (is_user_contact_banned RPC, ban-propagation trigger, check_face_verification_eligibility RPC)
src/pages/admin/AdminFaceVerification.tsx               (new rejection-reason labels)
```

## Out of scope

- No changes to LiveKit / camera ownership / Camera2 native plugin (sacred path).
- No changes to existing AWS Rekognition shard sharding logic.
- Pricing / commission untouched — the contact-violation threshold is read from admin settings, not hardcoded.

## Verification (Lovable preview, owner account)

1. As host candidate male → submit → expect instant Under Review → wait ≤30 s → status flips to `rejected: role_mismatch_host_gender`.
2. As user → submit twice in a row → second attempt blocked at mount with "Already under review".
3. After submit, force-back + re-open Face Verification from Profile → only Under Review surface, no camera.
4. Simulate 10 contact-violation rows for a test profile via SQL → that user's next face-verification submission is auto-rejected `banned_identity_reuse` without any AWS call (verified in edge-function logs).
5. Create second profile with same face → `duplicate_face` reject within one analyzer cycle.
