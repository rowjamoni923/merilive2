# Host Live + Private Call Coexistence ("Back Soon" placeholder)

Industry pattern (Chamet, Bigo, Poppo): host live-এ থাকা অবস্থায় private call accept করলে live stream **end হয় না** — host-এর camera/mic temporarily private call-এ চলে যায়, viewers একটা "Host will be back soon" placeholder দেখে (profile video বা rotating photos)। Call শেষ হলে host দুটো option পায়: **Back to Live** (re-publish camera) বা **Back to Home** (end stream)।

---

## Phase 1 — Schema + state

`live_streams` table-এ field add:
- `host_on_call` boolean default false
- `host_on_call_started_at` timestamptz nullable

Realtime broadcast already enabled — viewers এই flag change instantly পাবে।

`profiles` ইতিমধ্যে আছে: `intro_video_url`, `photos` (array)। নতুন কিছু লাগবে না।

---

## Phase 2 — Host side (LiveStream.tsx)

Host call accept করলে:
1. LiveKit live room থেকে camera+mic track **unpublish** (room connection বহাল, viewer subscriptions বহাল)
2. `live_streams.host_on_call = true` set (server timestamp)
3. NativeLiveKitController-এ private call room join → camera ownership private call-এ
4. Heartbeat continue হবে (so hourly bonus minute count চলবে — call duration-ও live time হিসেবে গণ্য, industry standard)

Call end হলে:
1. Private call room leave + camera release
2. Show overlay: **"Call Ended"** + দুটো button:
   - **Back to Live** → camera re-publish to live room, `host_on_call = false`
   - **Back to Home** → existing `handleLeaveStream()` (live end)
3. 30s timeout → auto Back to Live (safety)

---

## Phase 3 — Viewer side (LiveStream.tsx)

`live_streams.host_on_call` realtime subscribe। `true` হলে LiveKitVideoPlayer-এর জায়গায় `HostAwayPlaceholder` component mount:

**Placeholder priority:**
1. যদি `profile.intro_video_url` থাকে → looping muted video
2. না থাকলে `profile.photos` array → 3s interval ক্রমে ক্রমে fade transition
3. কিছু না থাকলে avatar (large, soft blur background)

Overlay text: **"Host will be back soon"** + small pulsing dot। Chat/gift/viewer count সব active থাকবে — শুধু video feed swap।

`host_on_call = false` হলে instant LiveKitVideoPlayer-এ ফিরবে।

---

## Phase 4 — Edge cases

- Host call accept-এর আগে camera ownership conflict → NativeLiveKitController-এর existing serialize queue ব্যবহার
- Call mid-way disconnect (network drop) → server-side: `private_calls.status` change watcher → auto `host_on_call = false`
- Host app crash during call → live `last_heartbeat` 3min stale → existing cleanup live-ও end করবে (no orphan placeholder)
- New viewer join করলে placeholder দেখবে সরাসরি (initial fetch-এ `host_on_call` পাবে)

---

## Technical details

**Files to edit:**
- `supabase/migrations/...` — add 2 columns + update RLS
- `src/pages/LiveStream.tsx` — call accept hook, end overlay, viewer realtime
- `src/components/live/HostAwayPlaceholder.tsx` — NEW component
- `src/hooks/usePrivateCall.ts` — emit `onHostLiveTransition` callback

**Camera ownership:** existing `NativeLiveKitController` queue-serialized publish/unpublish handles it. APK-side `attachLocal/detachLocal` (Phase already done 2026-06-17) supports the transitions.

**APK rebuild:** Required (native camera switch path)।

**No design change:** শুধু conditional placeholder swap; existing LiveStream UI অপরিবর্তিত।
