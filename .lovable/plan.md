# Admin Save Failures + Rating Reward Workflow — Phased Plan

## Why a plan first

You're describing 138+ admin pages where Save button fails ("RPC fail" / "save fail"), 7 specific named pages, missing Task Center tasks, and a brand-new Rating Reward proof verification flow. I checked the database: the unified "Admin session full access" RLS policy is already present on 277 tables — so the failures are NOT a single global RLS problem. They are page-specific issues (wrong column names, missing triggers, broken RPCs, schema drift, or wrong data shape on insert/update). 

Touching 138 pages blindly will create more bugs than it fixes. I need to audit and fix in tight phases, each verified end-to-end before moving on.

---

## Phase 1 — Diagnose the 7 named failing pages (no code changes yet)

For each page below I will:
- Open the page, find every save / mutation call
- Run the exact same insert/update against the DB to capture the real Postgres error
- Confirm whether the failure is: (a) wrong column, (b) failing trigger, (c) missing RPC, (d) wrong RLS scope, (e) frontend payload shape

Pages:
1. AdminLevelPrivileges (Level progress)
2. AdminCallSettings (Call price)
3. AdminSupportTickets (Support ticket)
4. AdminPartyRooms — message section (Party room message)
5. AdminPartyRooms / AdminBanners — background section (Party room background)
6. AdminRewardClaimsHistory (Reward claim history)
7. AdminRatingRewards (Rating reward)

Output: one root-cause line per page so you can see exactly what's wrong before I fix it.

## Phase 2 — Fix the 7 pages

Each fix is its own migration + frontend patch. After each: re-test the save in the actual admin UI (preview), confirm a row writes, confirm the audit log captures it. No "looks fine, moving on."

## Phase 3 — Rating Reward — Task list parity with the main app

Right now `AdminRatingRewards` does not show the same task list users see in the main app's Task Center. I will:
- Locate the source of truth for the user-facing rating tasks (likely `tasks` / `daily_tasks` / `rating_tasks` table or an app_settings JSON)
- Make the admin page read from the SAME source so every task the user sees is editable here
- Add CRUD with proper admin RLS

## Phase 4 — Rating Reward — Proof upload + instant verify workflow

End-to-end flow:

```text
USER (main app)                  ADMIN (admin panel)
─────────────────                ───────────────────
Gives 5★ rating                  
   │                             
   ▼                             
Uploads proof screenshot ───────►  Appears INSTANTLY in
(stored in private bucket          AdminRatingRewards 
 rating-proofs/{userId}/...)       "Pending Verification" tab
   │                                      │
   ▼                                      ▼
Status: pending                    Admin clicks proof → opens preview
                                          │
                          ┌───────────────┴───────────────┐
                          ▼                               ▼
                       APPROVE                         REJECT
                          │                               │
        Female host → +beans (admin-set)    Task removed from user's
        Male user   → +diamonds (admin-set) Task Center permanently
        Task marked completed +              (status=rejected, hidden
        removed from Task Center forever      forever, no re-attempt)
        (status=approved, hidden forever)
```

What I'll build:
- **DB:** `rating_reward_submissions` table (user_id, task_id, rating, proof_url, status enum pending/approved/rejected, reviewed_by, reviewed_at, payout_diamonds, payout_beans). Audit log via existing `balance_audit_log`.
- **Storage:** private bucket `rating-proofs` with owner-scoped upload + admin read RLS.
- **RPC:** `submit_rating_proof(p_task_id, p_rating, p_proof_url)` and `admin_review_rating_proof(p_submission_id, p_decision)` — atomic credit + task hide.
- **Realtime:** insert into `rating_reward_submissions` triggers admin notification + the page's pending list updates instantly.
- **Task Center filter:** any task with an approved OR rejected submission for that user is filtered out — never shown again.
- **Admin UI:** Pending tab with image preview modal, Approve/Reject buttons, payout amount auto-shown from settings, audit history tab.

## Phase 5 — Bulk audit of remaining ~131 admin pages

Only after Phases 1–4 are confirmed working. I will:
- Script a static analysis: find every `.from(...).insert/.update/.upsert/.delete` and every `.rpc(...)` in `src/pages/admin/**`
- For each, verify the target table/RPC exists, the columns/params match the current schema, and the page imports `adminClient` not the user `supabase` client
- Produce a list of ALL pages with mismatches; fix in batches of ~10 with per-batch verification
- Add a single shared `adminMutate()` helper that wraps insert/update with consistent error toasts that show the actual Postgres error message (not a generic "Failed to save") so future failures are diagnosable in 1 second instead of needing forensics

## What I need from you to start Phase 1 fastest

If you have any of these, paste them — it cuts diagnosis time by 80%:
- A screenshot of the red error toast on ANY failing page
- The page URL where you clicked Save and it failed
- Open browser DevTools → Network tab → click Save → screenshot the failed request (red row)

If you don't have these, I'll start Phase 1 anyway by reproducing each of the 7 named pages in the preview and reading the real error from the network log.

## Out of scope (will not change in this plan)

- The financial commission system (Pkg23–Pkg34 logic stays exactly as-is)
- Live streaming / WebRTC / native Android code
- Combo gifting (just shipped in the previous turn)
- Memory rules around admin session, RLS policies, and audit logging — all preserved

Reply "go" to start Phase 1, or paste the error/network screenshot and I'll jump straight to Phase 2 on whichever page you show.
