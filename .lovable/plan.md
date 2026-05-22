়## Chamet/Olamet-Level Professional Polish Plan

User wants Live + Party + Private Call to match Chamet/Olamet quality across 4 axes: **video smoothness, UI/UX polish, gift/entry animations, audio quality/echo**. Below is a sequenced, ship-one-at-a-time plan. Each step is independent, $1400-rule safe, and verifiable.

---

### Phase A — Video Smoothness (Pkg155–157)

**Pkg155 — Adaptive Stream + Dynacast hard-enable**
Force LiveKit `adaptiveStream:true` + `dynacast:true` in every Room (call/live/party) on web + native bridge. Viewer auto-receives only the simulcast layer that fits visible video element size + connection quality. Stops Chamet-style "host crisp, viewers blurry" lag.

**Pkg156 — VP9/AV1 codec preference + smart fallback**
Default `videoCodec:'vp9'` (Chamet uses VP9). Native Android plugin already supports it. Fallback chain VP9 → VP8 → H264. ~30% better quality at same bitrate.

**Pkg157 — Pre-join camera warmup**
Capture camera + run 2s "checking connection…" with Pkg101 quality probe BEFORE LiveKit connect. Lets ultra-tier 1080p commit only when bandwidth allows; otherwise auto-tier-down. Matches Chamet's smooth join.

---

### Phase B — UI/UX Polish (Pkg158–160) — design-directions flow

**Pkg158 — Live page bottom action bar redesign**
Chamet-style: gradient pill, glass-morphism, haptic-feel scale on tap, icon+label hierarchy, gift button centered & enlarged. Will use `design--create_directions` with current Live screen screenshot → user picks → implement.

**Pkg159 — Top-bar redesign (host info + viewers + close)**
Single-line glass strip: avatar + name + follow + viewer count + close (X). Currently scattered.

**Pkg160 — In-room chat overlay polish**
Bubble depth, soft drop-shadow, smooth enter animation, faster scroll-to-bottom, name color by level (Chamet/Bigo standard).

---

### Phase C — Gift / Entry Animations (Pkg161–162)

**Pkg161 — Gift animation queue smoothing**
Already SVGA — gaps: (1) animations stack/overlap on rapid send → queue with 80ms stagger, (2) full-screen gifts (T4/T5) preempt smaller, (3) pre-warm SVGA decoder on Room join to kill first-gift lag.

**Pkg162 — Entry banner polish**
Vehicle SVGA + name-bar already wired (Pkg82a envelope). Polish: smoother slide-in curve, parallax depth, fade-out instead of cut. Honor user's noble/VIP tier with reserved lane.

---

### Phase D — Audio Quality / Echo (Pkg163–164)

**Pkg163 — Force Krisp ON by default + AEC3**
Pkg123 noise-cancellation default is OFF. Flip kill-switch ON globally (`app_settings.livekit_signaling_enabled.noise_cancellation = true`). Native Android: confirm WebRTC AEC3 + AGC enabled in plugin.

**Pkg164 — Audio bitrate + Opus DTX**
Stereo 64kbps → mono 32kbps + DTX (silence suppression). Chamet/Bigo standard for voice. Halves audio bandwidth, sharper voice (less echo room for stale packets).

---

### Suggested Order

A1 (Pkg155) → A2 (Pkg156) → D1 (Pkg163) → C1 (Pkg161) → B1 (Pkg158) → … one at a time, test on real device, then memory update.

---

### Recommendation

Start with **Pkg155 (Adaptive Stream + Dynacast)** — biggest visible win for "video lag" complaint, zero UI risk, 10-min ship. Then Pkg163 (Krisp ON) for echo, then we move to UI polish via design-directions.

Confirm and I'll ship Pkg155 immediately.
