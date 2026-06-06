---
name: Pkg431 WebSocket Bridge Plugin
description: Native Android OkHttp WebSocket bridge with WHATWG-shaped JS wrapper; future drop-in transport for Supabase Realtime; gated OFF by default.
type: feature
---

DONE 2026-06-06. **Goal:** native WebSocket transport that survives Android WebView doze on aggressive OEMs (Xiaomi/Vivo/Oppo), keeps Supabase Realtime + LiveKit signaling connected during background → accurate presence/chat/host counters when app re-foregrounds.

**Native (Android):** `WebSocketBridgePlugin.kt` registered in `MainActivity.java`. OkHttp 4.12.0 (explicitly pinned — transitive via `media3-datasource-okhttp` previously). Single shared `OkHttpClient` with `pingInterval=25s` (under 60–180s NAT recycle floor on cellular), `readTimeout=0` (never time out long-lived socket), `retryOnConnectionFailure=true`. Multi-socket: each `connect()` returns numeric `socketId`. Methods: `connect/send/sendBinary/close/isOpen/status`. Events: single `ws:event` listener payload `{socketId,type,data?,binary?,code?,reason?,message?,status?}`. Best-effort close-all on activity destroy. NO auto-reconnect — JS layer (Phoenix client) owns reconnect/backoff/heartbeat semantics.

**JS bridge:** `src/plugins/WebSocketBridge.ts` —
1. Raw `Native` plugin handle for callers that want full control.
2. `NativeWebSocket` class — WHATWG-shaped `WebSocket` polyfill (readyState constants, onopen/onmessage/onclose/onerror handlers, send/close). Compatible with Supabase Realtime's `transport` option for future drop-in. Single global `ws:event` listener fans out to per-instance `handleEvent` via `instances` map keyed by `socketId`. Text-only on the WHATWG surface (binary support sits on raw plugin via `sendBinary`).

**Kill switch:** `src/utils/socketNativeFlag.ts` — `isSocketNativeEnabled()` defaults **OFF** (returns true only when `localStorage 'socket:native'='on'` + plugin available). Wiring into the Supabase client is intentionally deferred to a follow-up Pkg.

**ZERO call sites wired today** — additive plugin. Web/iOS/older APKs keep using the in-WebView WebSocket. No changes to Supabase Realtime channels, LiveKit signaling, or any existing realtime subscription.

**Gradle:** added explicit `com.squareup.okhttp3:okhttp:4.12.0` to keep the WS API surface stable independent of media3 version bumps.

**Future Pkg integration sketch:** swap `createClient(url, key, { realtime: { transport: NativeWebSocket } })` when `isSocketNativeEnabled()` — but only after a multi-day soak test on the gated-on cohort. Phoenix heartbeat (Supabase default 30s) + our 25s OkHttp ping together keep both halves of the link warm.
