## Phase G — Inline in-call gift sheet

### Goal
When the caller taps the Gift button inside the native PrivateCallActivity, the gift catalog should slide up as a bottom sheet **over the live video** (Chamet/Bigo pattern). Sending a gift must trigger the existing on-screen gift animation (Pkg438) and deduct coins via the existing `send_gift` RPC — without ending or backgrounding the call.

### Trade-off (one decision needed before I build)

I see two clean ways to ship this; only one needs your call:

**Option A — Pure WebView bring-to-front + auto-PIP (recommended)**
- In-call Gift tap → broadcast to JS → JS opens the existing `GiftSheet` component as a route/sheet in MainActivity's WebView
- Native side calls `enterPictureInPictureMode()` on PrivateCallActivity so the call shrinks into a floating PIP and the WebView surfaces with the gift sheet
- User picks gift → existing send flow runs → animation already plays inside the LiveKit video surface via Pkg438
- Closing the sheet → broadcast back → PrivateCallActivity expands out of PIP via `moveTaskToFront`
- **Pros:** zero duplicate UI; uses the real catalog, wallet check, VIP gating, and animations that already work; new Kotlin code stays under ~80 lines
- **Cons:** a 300ms shrink/expand transition; PIP must be supported (Android 8+ — we already declare it)

**Option B — Native BottomSheetDialog with a nested WebView**
- New compact React route `/embedded/call-gift-sheet?peerId=X&callId=Y` showing the catalog
- Native `BottomSheetDialog` hosts a WebView loading that route; sheet covers bottom 60% of the call screen
- `postMessage` bridge: `gift_sent` → dismiss sheet; `close` → dismiss
- **Pros:** call video stays full-screen behind the sheet (no PIP transition)
- **Cons:** second WebView instance (memory + JS cold-start), shared auth cookies need careful handling, two render pipelines maintained

### My recommendation: Option A
Reuses every existing path, ships in a single day, no nested WebView. The PIP transition is the same one users see when they press Home — it's familiar, not jarring.

### What I'll build (Option A)

1. **Native side** (`PrivateCallActivity.kt`)
   - Gift button now broadcasts `action="gift_inline"` (already wired in Phase E) AND calls a new helper that enters PIP + `moveTaskToFront` for MainActivity's task
   - On `ACTION_RESUME_PRIVATE_CALL` broadcast from JS → exit PIP, expand activity back to fullscreen

2. **NativeCallPlugin.kt**
   - New `@PluginMethod resumeInCallActivity()` → sends `ACTION_RESUME_PRIVATE_CALL` broadcast
   - Reuses existing `call-end-action` event (no new event type)

3. **JS bridge** (`NativeCall.ts`)
   - Add `resumeInCallActivity(): Promise<{ok:boolean}>` to the interface

4. **JS listener** (`useNativeCallBillingSync.ts`)
   - On `gift_inline` action: open the existing in-app `GiftSheet` modal (no route nav — just toggle a state via window event), pass `{peerId, callId, source:'native_call'}`
   - On sheet close OR after gift sent: call `NativeCall.resumeInCallActivity()` so the call exits PIP

5. **Existing GiftSheet wiring**
   - Listen for `window` event `open-call-gift-sheet` → open with peerId pre-selected
   - On close/sent → fire `close-call-gift-sheet` event

### Files

```
android/.../activity/PrivateCallActivity.kt        edit  (~30 lines: gift btn → enterPiP+moveTaskToFront, receiver for resume)
android/.../plugin/NativeCallPlugin.kt             edit  (~20 lines: resumeInCallActivity + ACTION_RESUME_PRIVATE_CALL)
src/plugins/NativeCall.ts                          edit  (~5 lines: type addition)
src/hooks/useNativeCallBillingSync.ts              edit  (~15 lines: gift_inline handler + post-close resume)
src/components/call/CallProvider.tsx OR
  the existing global GiftSheet host                edit  (~25 lines: listen for open-call-gift-sheet event)
```

No DB migration. No new edge function. No design changes — only call-flow plumbing.

### Test path
Owner account on rebuilt APK:
1. Start a private call → tap Gift → call shrinks to PIP corner, WebView surfaces with gift sheet
2. Send a gift → animation plays over the PIP video → sheet auto-closes → call expands back to fullscreen
3. Cancel sheet → call expands back without sending
4. Web/iOS/older APKs: `tryNative*` no-ops, existing `/profile/X?gift=1` nav path keeps working

### Out of scope (deferred to Phase H if you want them)
- Full native (Compose) gift catalog without any WebView
- Quick-gift bar (4 hot gifts as inline buttons above the action row)
- Combo gift counter
- Tip-jar style multi-tap

বল **"Go Option A"** = build it now; **"Option B"** = nested WebView path instead; **"Modify"** = টুইক করি।
