---
name: Pkg430 Native Storage Plugin
description: Android SQLite key/value offline cache (namespace + TTL + batch) backing useNativeStorage hook; falls back to localStorage everywhere else.
type: feature
---

DONE 2026-06-06. **Goal:** offline-first cache for profiles/feed/messages/conversations without WebView localStorage limits (5–10MB quota, sync IO, no TTL).

**Native (Android):** `NativeStoragePlugin.kt` registered in `MainActivity.java`. Pure `SQLiteOpenHelper` (no Room annotation processor → no kapt, no APK bloat). Single table `kv(namespace,key,value,updated,expires)` composite PK, WAL on, indexes on namespace + partial index on expires>0. All ops on dedicated `NativeStorage-IO` single-thread executor (StrictMode-safe Pkg239). Methods: `set/get/remove/clearNamespace/batchSet/batchGet/evictExpired/stats/clearAll`. TTL=0 means never expires. Lazy-evict on read. `CONFLICT_REPLACE` for upsert.

**JS bridge:** `src/plugins/NativeStorage.ts` — typed wrappers `nsSet/nsGet/nsSetJSON/nsGetJSON/nsRemove/nsClearNamespace/nsBatchSet/nsBatchGet/nsEvictExpired/nsStats/nsClearAll`. ALL safe on every platform — return null/empty on web/iOS/missing plugin so no caller needs platform branches.

**Kill switch:** `src/utils/storageNativeFlag.ts` — `localStorage 'storage:native'='off'` to force off.

**Hook:** `src/hooks/useNativeStorage.ts` — `{value,set,clear}`. On native uses SQLite (async get on mount). On web/gated-off uses localStorage with TTL envelope `{v,e}` under `merilive-ns:<ns>:<key>` prefix — gives Pkg420/421 instant-data behaviour for free.

**ZERO call sites wired yet** — additive plugin. Future Pkgs (chat/feed/profile caches) will adopt `useNativeStorage` or `nsGetJSON/nsSetJSON` directly. Pkg420 `usePersistedCache` (localStorage) remains primary for now; can migrate page-by-page.

**No new gradle deps.** Uses framework `android.database.sqlite.SQLiteOpenHelper` only.
