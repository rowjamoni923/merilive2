---
name: Pkg431 Phase-12 Realtime transport wire-up
description: Optionally swap Supabase Realtime's WebSocket transport for the native OkHttp NativeWebSocket on Android when socket:native flag is ON.
type: feature
---

DONE 2026-06-06. Phase-12 follow-up to Pkg431. `src/integrations/supabase/client.ts` now reads `isSocketNativeEnabled()` at module load and, when ON (Android + plugin available + `localStorage 'socket:native'='on'` or nativeFlags 'webSocketBridge'), passes `NativeWebSocket` (WHATWG-shaped) as `realtime.transport`. Default OFF — web/iOS/older APKs and gated-off Android keep the WebView WebSocket byte-for-byte. Phoenix client keeps full ownership of heartbeat (30s) + reconnect/backoff. OkHttp ping (25s) + Phoenix heartbeat together keep both halves warm through Android doze / cellular NAT recycle on Xiaomi/Vivo/Oppo. Zero call-site changes elsewhere — all `supabase.channel(...)` subscriptions inherit the new transport transparently. Kill switch unchanged: `localStorage.setItem('socket:native','off')` reverts on next reload.
