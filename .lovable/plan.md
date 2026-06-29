# App Update Prompt Repeat Guard

## Goal
Prevent the app-update modal from appearing incorrectly after a user has already updated, opened Play Store, or dismissed an optional prompt.

## Research notes
- Google Play in-app updates rely on update availability, staleness, and priority; apps should re-check state when returning from the store instead of blindly showing stale prompts: https://developer.android.com/guide/playcore/in-app-updates
- Capawesome exposes native Play Store update state through `getAppUpdateInfo()` and store launch helpers, but app-side version/admin comparison still needs deterministic local suppression: https://capawesome.io/docs/plugins/app-update/

## Fix plan
1. Normalize device, server, and minimum versions through the same comparable scale.
2. Store prompt memory with target version + installed version at action time, not only a raw versionCode.
3. Clear prompt memory automatically when installed version is now equal/newer than server target.
4. Suppress same-target optional prompts after dismiss and same-target store-open prompts during the install-return window.
5. On native app resume from Play Store, refresh native version info and force a fresh update check.
6. Test-mode override must respect store-open suppression on reload, but still allow manual retrigger from Admin Test Mode.
