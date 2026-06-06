---
name: pkg434-native-router-shell
description: Native Android top app-bar + bottom tab-bar overlay rendered on decorView. WebView still owns route content; React Router still drives nav. Additive, OFF by default.
type: feature
---

# Pkg434 NativeRouterShell

Additive native chrome (top app-bar + bottom tab-bar) drawn on the activity decorView above the WebView. Goal: 60fps tab switching, native ripple, edge-to-edge insets, badge counts that survive WebView reloads.

## Components
- **NativeRouterShellPlugin.kt** — FrameLayout overlay, top LinearLayout (title), bottom LinearLayout (tabs with icon dot + label + optional badge). Methods: `open`, `close`, `setTitle`, `setActiveTab`, `setBadge`, `setTabs`. Emits `router:tab`.
- **src/plugins/NativeRouterShell.ts** — typed bridge, no-op shim on web/iOS.
- **src/hooks/useNativeRouterShell.ts** — opens shell, syncs title/tabs/active, ref-stable tab listener, returns `{ active }`.
- **src/utils/routerShellNativeFlag.ts** — `localStorage 'routerShell:native'='on'` opt-in.
- **MainActivity.java** — plugin registered.

## Guarantees
- Default OFF. No existing screen wires the hook, zero behavioural change.
- WebView remains the content surface; React Router untouched.
- Hook caller handles `onTabChange` → `navigate(path)` mapping.

## Not done (deferred)
- Real tab icons (currently dot placeholders — pass icon resource names later).
- Drawer / FAB / dark theme tokens.
- iOS counterpart.
