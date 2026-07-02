import 'dart:async';

import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'core/notifications/firebase_bootstrap.dart';
import 'core/notifications/incoming_call_listener.dart';
import 'core/router/app_router.dart';
import 'core/storage/hydrated_storage.dart';
import 'core/supabase/supabase_client.dart';
import 'features/gifting/data/gift_animation_config.dart';
import 'features/gifting/widgets/full_screen_gift_overlay.dart';
import 'core/theme/app_theme.dart';
import 'features/auth/bloc/auth_bloc.dart';
import 'features/auth/bloc/auth_event.dart';
import 'features/auth/bloc/auth_state.dart' as auth_state;
import 'features/branding/branding_cubit.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Portrait-only (matches web app + Chamet parity).
  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
  ]);
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: Brightness.light,
  ));

  await HydratedStorageBootstrap.init();
  await SupabaseBootstrap.init();

  // M13 — Firebase + FCM background handler must init BEFORE runApp so
  // the background isolate can pick up onBackgroundMessage on cold-start.
  await FirebaseBootstrap.init();

  // Preload live-tunable gift animation config (non-blocking failures OK).
  unawaited(GiftAnimationConfig.instance.initialize());

  runApp(const MeriLiveApp());
}

class MeriLiveApp extends StatefulWidget {
  const MeriLiveApp({super.key});

  @override
  State<MeriLiveApp> createState() => _MeriLiveAppState();
}

class _MeriLiveAppState extends State<MeriLiveApp> {
  final _router = AppRouter();

  @override
  Widget build(BuildContext context) {
    return MultiBlocProvider(
      providers: [
        BlocProvider<AuthBloc>(
          create: (_) => AuthBloc()..add(const AppStarted()),
        ),
        BlocProvider<BrandingCubit>(create: (_) => BrandingCubit()),
      ],
      child: MaterialApp.router(
        title: 'MeriLive',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.dark,
        routerConfig: _router.config(),
        builder: (context, child) {
          // M13 — attach/detach the incoming-call listener whenever auth
          // state transitions. Runs inside MaterialApp.router so the
          // AutoRoute StackRouter is available.
          return BlocListener<AuthBloc, auth_state.AuthState>(
            listenWhen: (prev, next) =>
                prev.runtimeType != next.runtimeType ||
                _uidOf(prev) != _uidOf(next),
            listener: (ctx, state) {
              final uid = _uidOf(state);
              if (uid != null) {
                IncomingCallListener.instance.attach(
                  router: _router,
                  userId: uid,
                );
              } else {
                IncomingCallListener.instance.detach();
              }
            },
            child: GlobalGiftOverlay(child: child ?? const SizedBox.shrink()),
          );
        },
      ),
    );
  }

  String? _uidOf(auth_state.AuthState s) {
    return s.maybeWhen(
      authenticated: (Session session) => session.user.id,
      orElse: () => null,
    );
  }
}
