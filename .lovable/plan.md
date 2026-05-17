# Real Admin Face Verification — End-to-End Parity Test (Option A)

Replace the static harness with a Playwright spec that drives the real `/admin/face-verification` page, against the real Supabase backend, with a dedicated seed of `face_verification_submissions` rows. Verifies badge counts on Pending/Approved/Rejected/All tabs equal the number of visible submission cards rendered by the live component.

## What gets added

```text
tests/e2e-admin/
  ├── face-verification-parity.spec.ts   ← the real-page spec
  ├── fixtures/
  │   └── seed.ts                        ← idempotent seed: insert 3+2+2 rows
  └── helpers/
      ├── adminSession.ts                ← inject x-admin-token + access flag into localStorage
      └── supabaseAdmin.ts               ← service-role REST client (Node, test-only)
playwright.e2e-admin.config.ts           ← separate project; only runs when env present
package.json                              ← script: "test:e2e:admin"
```

The existing `tests/e2e/` harness specs stay untouched — they remain fast smoke coverage. The new suite is opt-in (skipped when env not present) so CI without secrets is unaffected.

## Required secrets / environment

The spec is **skipped** unless ALL of these are present:

- `E2E_ADMIN_TOKEN` — a real `admin_sessions.session_token` (7-day, issued by `admin_authenticate`) belonging to a test owner/sub-admin
- `E2E_ADMIN_ACCESS_TOKEN` — the matching `gala-…` secret link token (so `/admin/*` route guards don't redirect)
- `SUPABASE_SERVICE_ROLE_KEY` — used **only** in Node test-runner code to seed/cleanup rows; never shipped to the browser
- `E2E_BASE_URL` — defaults to `http://localhost:5173`; in CI points at preview URL

You (the user) will need to add `E2E_ADMIN_TOKEN`, `E2E_ADMIN_ACCESS_TOKEN`, and `SUPABASE_SERVICE_ROLE_KEY` to Build Secrets / CI secrets. I'll prompt for each via `add_secret` once the plan is approved.

## Seed contract

`fixtures/seed.ts` (run in Playwright `globalSetup`):

1. Picks (or creates) 7 disposable `profiles` rows with `email LIKE 'e2e-face-%@test.local'`.
2. Upserts 7 `face_verification_submissions` rows:
   - 3 pending: `status IN ('pending','submitted', NULL→treated pending)`
   - 2 approved: `status='approved'`, `status='auto_approved'`
   - 2 rejected: `status='rejected'`, `status='auto_rejected'`
3. `globalTeardown` deletes those rows by the same email tag so subsequent runs stay clean.

This matches the `bucketOfStatus` rules already covered by the static harness so we're comparing apples to apples.

## Spec assertions

`face-verification-parity.spec.ts`:

1. Inject admin session into `localStorage` before navigation via `addInitScript` (keys: `merilive-admin-session`, `merilive-admin-access`).
2. `page.goto('/admin/face-verification?search=e2e-face-')` — scoping by search keeps unrelated production-shape rows out of the visible pool.
3. Wait for `[data-testid="submission-card"]` to appear OR `[data-testid="empty-state"]`.
4. For each tab in `['pending','approved','rejected','all']`:
   - Read badge count from the `TabsTrigger` Badge node.
   - Click the tab; wait for tab content stable.
   - Count visible `[data-testid="submission-card"]`.
   - Assert `badge === cardCount`.
5. Assert `pending + approved + rejected === all`.
6. After Approve on one pending row → re-read all 4 badges → still equal to rendered counts (1/3/2/6 instead of 2/2/2/6 etc., adjusted for whichever row was acted on).

## Source-code changes inside the app

Minor, additive only — no behavior change:

- Add `data-testid="submission-card"` to the rendered card root inside `AdminFaceVerification.tsx` (currently only on the mock harness).
- Add `data-testid="tab-count-{value}"` to each `TabsTrigger`'s count Badge in `AdminFaceVerification.tsx`.
- Add `data-testid="empty-state"` to the "No submissions" placeholder.

These mirror the selectors the parity harness already uses, so the existing unit/static tests don't change.

## CI

New GitHub workflow `.github/workflows/admin-e2e.yml` runs `npm run test:e2e:admin` only when the three secrets are configured on the repo. Locally, `npm run test:e2e:admin` works once you `export` the three vars.

## Out of scope

- Does NOT touch business logic, RLS, RPC, or auto-approval flow.
- Does NOT modify the existing static harness or its 5 specs.
- Does NOT add a test-only login backdoor — uses a real session token issued by the normal admin auth path.

## Approval gate

Confirm and I'll:
1. Prompt for the three secrets via `add_secret`.
2. Add the testids to `AdminFaceVerification.tsx`.
3. Create the new Playwright project + spec + seed + workflow.
