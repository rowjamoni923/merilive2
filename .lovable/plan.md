## Pkg367 — Zero-refresh + 30-min Auto-Offline + Hard Offline Mode

আপনার ৩টা requirement আলাদা করে বুঝে নিচ্ছি — তারপর একটাই migration + frontend patch দিয়ে সব শেষ।

---

### 1) Zero-refresh / Instant Data Load — **already 95% done**

Memory অনুযায়ী Pkg356 / Pkg359 / Pkg360 / Pkg361 / Pkg362 এ আপনার listed প্রতিটা section already Supabase Realtime দিয়ে instant update পাচ্ছে:

| Section | Realtime source | Pkg |
|---|---|---|
| Homepage / Discovery | profiles + live_streams + private_calls + party_rooms (400ms debounce) | Pkg330 / Pkg361 |
| Profile / Profile Details | profiles row UPDATE direct subscribe | Pkg361 |
| Agency / Earnings | agencies + agency_performance + gift_transactions | Pkg361 |
| Search | profiles_public realtime | Pkg315 |
| Leaderboard / Rankings | rankings 500ms debounce on agency_performance | Pkg361 |
| Live / Party (audio+video) | LiveKit room events + live_streams + party_room_participants | Pkg279 / Pkg280 |
| Private Call | private_calls filtered host_id | Pkg305 / Pkg307 |
| My Beans / My Diamond / Coins | profiles own row UPDATE push | Pkg360 |
| Trader Alert | coin_traders + trader_level_purchases | Pkg333 |
| Message / Chat | messages + conversations filtered to user | Pkg360 |
| VIP / Noble / Level | profiles + vip_subscriptions | Pkg311 |
| Call Price | app_settings broadcast + profile call_rate | Pkg337 |
| Host Application | host_applications + face_verification_submissions | Pkg341 |

→ **নতুন কাজ নাই এখানে।** শুধু verify করে confirm করব।

---

### 2) ৩০-মিনিট inactivity → auto-offline (visual + system)

**নতুন:**
- নতুন pg_cron job `auto_offline_inactive_users` প্রতি মিনিটে run করবে:
  - `UPDATE profiles SET is_online=false WHERE is_online=true AND last_seen_at < now() - interval '30 minutes'`
- Web client (`useUserPresence` hook) ৩০s heartbeat already করে last_seen_at update + is_online=true
- Native Android `PresenceService` already same কাজ করে (verified)
- App re-open → প্রথম heartbeat (≤৩০s) → instantly `is_online=true` → realtime push হোমপেজে সবাইকে notify

→ **এক migration + cron seed** যথেষ্ট।

---

### 3) Hard Offline Mode (manual "Offline" button)

**বর্তমান (Pkg336):** `host_availability='offline'` সেট হলে `start_private_call` RPC block করে — কিন্তু DM/messages still আসে এবং app থেকে বের হয় না।

**যোগ করব:**

**A. Block incoming DM when offline:**
- `messages` INSERT এ নতুন BEFORE trigger `tg_block_dm_to_offline_user`:
  - যদি receiver-এর `host_availability='offline'` AND sender ≠ admin → RAISE `recipient_offline`
- Chat UI তে friendly toast "এই user এখন offline আছে"

**B. Auto-exit Android app on offline toggle:**
- Profile/Settings এর "Offline" toggle handler-এ Capacitor side:
  - Web fallback: ProfileDetail/Profile কে home-এ redirect + toast
  - Android native: `App.exitApp()` call (Capacitor App plugin) — toggle ON হওয়ার ২s পর

**C. Re-open app → auto online:**
- App resume listener (already `useUserPresence`-এ আছে) → `host_availability='online'` automatic set + last_seen_at update
- যদি manually offline করে থাকে → resume হলেও offline থাকবে (user-intent respect); শুধু `is_online=true` (visual presence) update হবে। ✅ এটা আপনার spec match করে

**D. Push notifications (FCM) যখন app বাইরে কিন্তু offline button click করা নাই:**
- Pkg308 অনুযায়ী FCM already token-per-device — কোনো change লাগবে না, call/message push আসবে।

---

### Technical bits (for the technical reader)

```text
DB migration:
  - tg_block_dm_to_offline_user (BEFORE INSERT on messages)
  - auto_offline_inactive_users() SECDEF function
  - pg_cron 'auto-offline-inactive' every 1 min
  - REVOKE all + GRANT service_role on new fn

Frontend:
  - src/hooks/useUserPresence.ts → ensure 30s heartbeat + visibility resume
  - src/pages/Profile.tsx / ProfileDetail.tsx → on offline toggle:
      • DB update host_availability='offline'
      • toast + 2s delay → Capacitor App.exitApp() on native, navigate('/') on web
  - src/pages/Chat.tsx → catch 'recipient_offline' postgres error → friendly toast
  - src/hooks/usePrivateCall.ts → already handles 'host_offline' (Pkg336)
```

### Files touched (~6 files + 1 migration)

- `supabase/migrations/<new>.sql` (trigger + cron + fn)
- `src/hooks/useUserPresence.ts` (verify/strengthen heartbeat + resume)
- `src/pages/Profile.tsx` + `src/pages/ProfileDetail.tsx` (offline toggle → exitApp)
- `src/pages/Chat.tsx` (catch DM-blocked error)
- `src/integrations/supabase/client.ts` — no change
- Memory update: new Pkg367 entry

### Out of scope

- LiveKit ingress tuning — **DEFERRED** per VPS-deferred rule
- New realtime channels — সব existing infra reuse করছি
- Notification settings — Pkg308 unchanged

---

আপনি **OK** বললেই migration লিখে frontend patch শুরু করব। কোনো কিছু change করতে চান (যেমন inactivity ৩০ → ১৫ মিনিট, বা offline-এ DM block না করে শুধু "delivered later" করতে চান) — এখনই বলুন।
