# Instant Logout/Login + Live & Party Realtime Hardening

## Goals

1. **Logout & Login instant** — কোনো spinner-block বা await-chain UI কে আটকে রাখবে না।
2. **Live viewers instant** — host এবং viewer উভয়েই join/leave সাথে সাথে দেখবে (count + list), কোনো polling নয়।
3. **Public chat (Live + Party)** — host ও viewer-এর message সবাই দেখবে; একই message দুইবার দেখাবে না (optimistic + realtime echo দুটো আলাদা bubble হয়ে আসছে এখন)।
4. **Party seat flow** — Apply → Host Accept/Remove instant, কোনো manual refresh ছাড়া সব participant-এর UI update হবে।

> Private message section আগের মতই 1-to-1 private থাকবে — শুধু live/party room-এর chat public।

---

## 1. Logout — instant (already partly done; remaining tighten)

- ✅ Settings, BannedScreen, BanPopupDialog, Profile (Go Offline + Reregister), ProfileDetail — সব এখন `flag → navigate → background signOut/cleanup` pattern এ গেছে (এই session-এ করা)।
- **নতুন:** `App.tsx` SIGNED_OUT handler-এ `clearNativeSession()` await না করে fire-and-forget করব যাতে state instant clear হয়।
- `meri_manual_logout` flag set হওয়ার পরে যদি কোনো in-flight Supabase query response আসে তখন stale invalidation না হয় তার জন্য একটা `bypass` check রাখব।

## 2. Login — instant

বর্তমান slow path: OTP verify → `verify-email-otp` edge → তারপর সিরিজে profile fetch / single-device register / FCM token / location consensus সব sequentially run করে navigate হয়।

পরিবর্তন:
- `Auth.tsx` সফল login হলেই **আগে navigate** (`/`), তারপর background-এ device register, FCM token, geo consensus।
- Profile creation/sync কে App-mount-এ `runLegacyProfileSync` ইতিমধ্যে cover করে — ডাবল-call সরাব।
- Native Google auth flow-ও একই pattern এ যাবে।
- "Signing in..." button-এর `disabled` শুধু verify call চলাকালীন, তারপর immediate navigate।

## 3. Live viewers — realtime instant

বর্তমানে viewer count fetch হয় বা ১-৫ sec refetch-এ। `useViewers.ts` ও `useRoomParticipants.ts` কে inspect করে:

- Supabase channel `live_viewers:<stream_id>` এ `postgres_changes` INSERT/DELETE subscribe।
- React Query key `['liveViewers', streamId]` কে event-এ instantly invalidate।
- `count` + `list` দুটোই একই channel থেকে drive হবে (এখন আলাদা hook থাকলে merge)।
- Optimistic join: viewer join-এর সাথে সাথে নিজের avatar list-এ push, server confirm এলে dedupe by user_id।
- channel cleanup on unmount.

## 4. Public chat dedupe (Live + Party)

`RoomChatOverlay` / `UnifiedPartyRoom` / `LiveStream` chat overlay দেখে:

- Send করার সময় একটা `client_msg_id` (uuid) attach করব।
- Optimistic bubble-এ ওই id রাখব।
- Realtime INSERT এ ওই id থাকলে `replace` করব, নতুন bubble add করব না।
- Host message ও user message একই table → একই subscription → সবাই same stream দেখবে। কোনো আলাদা "host-only" send path থাকলে remove।
- Sender-side suppression: কিছু কোডে নিজে পাঠালে subscription event ignore হচ্ছিল — সেটা সরিয়ে dedupe-by-id ব্যবহার করব।

## 5. Party seat — instant apply / accept / remove

- `party_room_seats` (বা equivalent) এ realtime subscribe per `room_id`।
- Apply (visitor): RPC call করার সাথে সাথে optimistic "Requested" badge; INSERT event এলে confirm।
- Host accept: `accept_seat_request` RPC; UPDATE event সব participant-কে seat populate দেখাবে।
- Host remove: `remove_from_seat` RPC; DELETE event সাথে সাথে seat empty।
- কোনো `refetchInterval` নেই — শুধু realtime + manual refresh।
- Channel naming Pkg policy অনুযায়ী suffix সহ।

---

## Technical Notes

- কোনো DB schema change নেই — শুধু client-side hook + edge-event handling।
- Realtime publication-এ `live_viewers`, `live_messages`/`stream_messages`, `party_room_seats`, `party_room_messages` already-added ধরে নিচ্ছি; missing হলে এক migration দিয়ে `ALTER PUBLICATION supabase_realtime ADD TABLE ...` করব।
- Pkg38 cost-guard মান্য — singleton channel per (table, room_id), 400ms client dedupe।
- কোনো polling / `refetchInterval` যোগ হবে না।
- English-only UI মেনে চলব; কোনো নতুন Bengali string নয়।

## Out of Scope (এই plan-এ নেই)

- LiveKit publish / camera pipeline পরিবর্তন।
- Private 1-to-1 message changes।
- Admin panel।
- নতুন seat UI redesign — শুধু sync behavior fix।

## Verification

- Two browsers: host + viewer → viewer join দেখা মাত্রই host-এ count++ এবং avatar list update।
- Send message host side → viewer side <1s দেখাবে, কোনো duplicate নেই।
- Party: visitor apply → host পক্ষে "request" badge instant; accept করলে visitor-এর UI-তে seat assigned instant।
- Logout button → preview <200ms-এ /auth-এ; reload করলে session ফিরে আসবে না।
- Login OTP verify → navigate <500ms; background tasks console-এ পরে log হবে।
