# MeriLive — Flutter App (Native shell)

Chamet-class live streaming app. Flutter UI + Native Kotlin/Swift performance layers.
Backend unchanged: Supabase project `ayjdlvuurscxucatbbah` — all existing RPCs and edge functions reused.

## First-time local setup (one-time, on your machine)

Lovable sandbox cannot compile Flutter — you build APKs locally.

```bash
# 1) Install Flutter SDK ≥ 3.24 (https://docs.flutter.dev/get-started/install)
flutter --version

# 2) From project root
cd merilive_app

# 3) Generate native platform folders (android/ + ios/) — one-time
flutter create . --org com.merilive --project-name merilive_app --platforms=android,ios

# 4) Install dependencies
flutter pub get

# 5) Generate auto_route + hydrated_bloc code
flutter pub run build_runner build --delete-conflicting-outputs

# 6) Run on connected device / emulator
flutter run

# 7) Release APK
flutter build apk --release --split-per-abi
```

## Project structure

```
lib/
  main.dart                        — entry point, HydratedBloc bootstrap, Supabase init
  core/
    env/env.dart                   — Supabase URL + anon key + build config
    theme/
      design_tokens.dart           — colors, gradients, radii, sizes (Section 1 spec §4)
      app_theme.dart               — MaterialApp theme
    supabase/
      supabase_client.dart         — global Supabase client accessor
    router/
      app_router.dart              — auto_route config (14 auth routes)
      guards.dart                  — AuthGuard, BanGuard
    storage/
      hydrated_storage.dart        — HydratedBloc storage bootstrap
  features/
    splash/
      splash_page.dart             — silent session restore (no fake loading UI)
    auth/
      bloc/
        auth_bloc.dart             — global auth state (BLoC + hydrated)
        auth_event.dart
        auth_state.dart
      screens/                     — filled in Step B-F
        onboarding_page.dart       (stub)
        auth_landing_page.dart     (stub)
        ... etc
```

## Migration plan

See `.lovable/plan.md` and `.lovable/flutter-migration/section-1-auth.md` for the full spec.
Section 1 (Auth) is being built in 6 steps: **A) Foundation → B) Onboarding + Landing → C) Start flow → D) Email → E) Phone → F) Callbacks + Guards + Modals**, then G) Device QA.

**Status:** Step A complete (this drop). Awaiting device QA before Step B.
