## লক্ষ্য

৪০০+ page-এ যে সমস্যাগুলো বারবার আসছে (slow entry, blank screen, 401 unauthorized, session expire, edge function fail, network hiccup) — সেগুলো **প্রতি page-এ আলাদা ভাবে fix করা হবে না**। ৫টি central layer-এ fix → সব page automatic পাবে। এটাই professional standard (Chamet/Bigo/Olamet সবাই এভাবে করে)।

---

## ৫টি Central Layer (সব fix এখানেই হবে)

### Layer 1 — Global Auth Guard (`src/providers/AuthProvider.tsx` + `src/lib/authGuard.ts` NEW)
সব page-এ একই behavior:
- Session expire detect হলে silent refresh
- Refresh fail হলে → `/auth` redirect + toast "Session expired, please sign in again"
- কোনো page-এ blank screen না, কোনো জায়গায় custom auth handling না
- React Query global `onError` hook → 401 হলে এই guard fire করে

### Layer 2 — Universal API Wrapper (`src/lib/apiClient.ts` NEW)
সব Supabase call, edge function invoke, fetch — এই wrapper দিয়ে যাবে:
- Auto-retry (exponential backoff, max 2 retry) on network/5xx
- Auto session refresh on 401 → retry once → তারপর Layer 1 trigger
- Timeout (default 15s) + AbortController
- Unified error type (`ApiError` with `kind: 'network' | 'auth' | 'server' | 'timeout' | 'validation'`)
- Quiet errors (auth/session) → console-only, no toast spam

### Layer 3 — Global ErrorBoundary + Suspense Shell (`src/components/system/AppShell.tsx` NEW)
`App.tsx`-এ একবার wrap → সব route এর নিচে আসবে:
- ErrorBoundary → blank screen এর জায়গায় friendly "Something went wrong, retry" UI
- Suspense fallback → unified skeleton (per-page custom skeleton-ও override করতে পারবে)
- Route-level error reset on navigation

### Layer 4 — Global Loading & Connectivity Indicator (`src/components/system/ConnectionStatus.tsx` NEW)
- Network offline detect → top banner "You're offline, reconnecting…"
- Supabase realtime disconnect detect → একই banner
- সব page-এ automatic, কোনো manual wiring না

### Layer 5 — Performance Pre-warm (already done in Phase 1–5, just verify coverage)
- Token cache, connection pool, DNS prewarm — `main.tsx` থেকে boot হয়, সব page benefit পায়
- শুধু verify করব কোনো page bypass করছে কিনা

---

## Rollout Order (Phase-by-Phase, ছোট ছোট merge)

| Phase | কাজ | Risk | Verification |
|------|------|------|--------------|
| **A** | Layer 2 (apiClient) তৈরি, কিন্তু কেউ ব্যবহার করছে না | Zero | unit test |
| **B** | Layer 1 (AuthGuard) তৈরি + AuthProvider-এ wire | Low | owner login test, force-expire test |
| **C** | Layer 3 (ErrorBoundary + Suspense) → App.tsx-এ wrap | Low | force-throw test on 3 random pages |
| **D** | Layer 4 (ConnectionStatus) → App.tsx-এ mount | Zero | offline simulate |
| **E** | React Query global config → Layer 2-এ route করা | Medium | smoke test top 10 pages |
| **F** | Top 20 high-traffic page audit → কেউ direct `supabase.from()` / `fetch()` call করলে wrapper-এ migrate (optional, gradual) | Low | per-page test |

**Phase A–E শেষ হলেই ৪০০+ page automatic সব benefit পাবে।** Phase F শুধু future-proofing।

---

## Owner Account Verification (প্রতি phase শেষে)

প্রতি phase শেষে আমি নিজে preview-এ owner account দিয়ে login করে test করব:
- Home, Live, Call, Party, Profile, Wallet, Agency — এই ৭টা core flow
- Force session expire → recover হয় কিনা
- Network throttle → graceful degrade হয় কিনা
- Console error count → কমেছে কিনা

---

## যা **করব না** (constraints honored)

- Android native code touch করব না (LiveKit, camera, gift animation — সব সংরক্ষিত)
- কোনো design change না — শুধু underlying plumbing
- UI string সব English
- কোনো polling/visibility-refresh না
- ৪০০ page individually edit না — central layer only

---

## Confirm করো

1. এই 5-layer approach OK? নাকি অন্য কিছু চাও?
2. Phase A থেকে শুরু করি?
3. প্রতি phase-এর পরে তোমাকে report দিব + owner account verification screenshot — OK?

Approve করলেই Phase A শুরু।