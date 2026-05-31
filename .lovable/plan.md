text
## Phase 1: Database Speed Optimization (Instant Loading)
The current Admin Panel delay is caused by sequential scans on large tables (profiles, verification, etc.) during sidebar badge calculation.
- Add GIN and B-Tree indexes on `status`, `is_read`, `is_active`, and `verification_type` columns across 15+ tables.
- Optimize the `admin_layout_counts()` PostgreSQL function to use these indexes, ensuring the sidebar badges load in milliseconds.
- Implement specialized partial indexes for 'pending' states to make dashboard queries near-instant.

## Phase 2: Comprehensive Phone Number Detector Fix
Currently, the system only logs host violations. We will expand this to cover every user.
- Update `detect-phone-number` Edge Function to trigger for both hosts and regular users.
- Modify the `process_contact_violation` RPC to accept non-host profiles.
- Ensure that when a regular user shares a phone number, it creates a entry in `chat_moderation_logs` so it appears in the Admin Alert Bell.
- Maintain the automated bean deduction ONLY for hosts, while ensuring users are flagged for admin review.

## Phase 3: Admin UI & Notification Reliability
- Optimize `AdminLayout.tsx` to pre-fetch counts more efficiently using the new optimized RPC.
- Fix the "Admin Alert Bell" to reliably show detected phone numbers for everyone (Users + Hosts).
- Ensure the "Secret Link" authentication flow remains secure but bypasses unnecessary weight during initial entry.

## Phase 4: Final Audit & Stress Test
- Conduct a "Honest Scan" of the top 5 most used admin pages (User Management, Withdrawals, Agency Hub).
- Verify that real-time notifications (Websockets) are firing correctly for every single violation.
- Confirm that the loading spinner for "Preparing admin console" disappears in less than 1-2 seconds.
