import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../core/router/app_router.gr.dart';
import '../../core/theme/design_tokens.dart';
import '../auth/bloc/auth_bloc.dart';
import '../auth/bloc/auth_state.dart';

/// Silent session-restore surface.
///
/// Per project memory rule "no fake loading UI" — this page does NOT show a
/// spinner/skeleton. It just holds the real gradient background for at most
/// a couple frames while HydratedBloc replays the last known auth state and
/// Supabase restores the session, then routes to /auth or /home.
@RoutePage()
class SplashPage extends StatefulWidget {
  const SplashPage({super.key});

  @override
  State<SplashPage> createState() => _SplashPageState();
}

class _SplashPageState extends State<SplashPage> {
  @override
  Widget build(BuildContext context) {
    return BlocListener<AuthBloc, AuthState>(
      listenWhen: (prev, next) => next.status != AuthStatus.unknown,
      listener: (context, state) {
        if (!mounted) return;
        switch (state.status) {
          case AuthStatus.authenticated:
            // Section 2 will introduce /home. For Section 1, land on /auth.
            context.router.replaceAll([const AuthLandingRoute()]);
            break;
          case AuthStatus.banned:
          case AuthStatus.unauthenticated:
          case AuthStatus.unknown:
            context.router.replaceAll([const AuthLandingRoute()]);
            break;
        }
      },
      child: const Scaffold(
        body: DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: DT.authBgGradient,
            ),
          ),
          child: SizedBox.expand(),
        ),
      ),
    );
  }
}
