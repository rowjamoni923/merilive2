I have performed an honest, deep scan of the codebase without editing files. I have found **two critical technical issues** that directly explain the "Camera Stuck" and "Connection Problem" symptoms you described.

### 1. The "Camera Conflict" Bug (Found in Scan)

In both **Live Streaming** and **Private Calls**, the app performs a "Media Preparation" step where it starts a standard camera (Web API) to show a preview. 

- **The Issue**: When the Android app then switches to the **Native Beauty Camera** (which you asked about), it **fails to stop** the standard camera.
- **The Result**: Two different camera systems fight for the hardware. This causes the "stuck camera icon," black screens, or one camera staying "on" even after leaving the room.
- **Affects**: `useLiveKitClient.ts` and `useLiveKitCall.ts`.

### 2. Host "Escape" Leak

- **The Issue**: In `LiveStream.tsx`, there is logic that explicitly **prevents** cleaning up the camera if a host leaves the page (to avoid accidental disconnects during minor glitches).
- **The Result**: If a host uses the Android **system Back button** instead of the "X" button, the native camera stays active behind the app, making the homepage look transparent or "broken."

### 3. Your Question: "Two types of cameras?"

**Yes, you are right.** There are actually **three** camera paths in the app:

1. **Native Beauty Camera** (Android-only, for high performance and filters).
2. **Native Face Camera** (Only for Face Verification selfies).
3. **Web Standard Camera** (For iOS, Web browsers, and as a safety fallback).

The conflict happens during the hand-off between #3 and #1.

---

### Implementation Plan

**Step 1: Fix Camera Hand-off (Conflict Prevention)**
I will modify `useLiveKitClient.ts` and `useLiveKitCall.ts` to explicitly **kill and stop** the standard camera tracks the moment the Native Beauty Camera starts. This ensures only ONE camera is ever active.

**Step 2: Intelligent Host Cleanup**
I will update the cleanup logic in `LiveStream.tsx` to detect if the host is truly leaving (via navigation) and force a camera shutdown, while still protecting against momentary "re-renders" or glitches.

**Step 3: Private Call Cleanup**
I will ensure that when a Private Call is "Declined" or "Missed," the Native camera surface is torn down instantly so it doesn't stay stuck on the screen.

**Technical Details for Scan Verification:**

- Checked `Index.tsx` (Homepage tabs): RPC logic is hardened and cache is solid. No bugs found.
- Checked `NativeLiveKitController.ts`: Disconnect logic exists but depends on being called correctly by the hooks.
- Checked `preparedCallMedia.ts`: Found that tracks are not stopped when switching to Native path.

**I am ready to implement these fixes once you approve.**