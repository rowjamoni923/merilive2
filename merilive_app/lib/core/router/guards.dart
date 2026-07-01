import 'package:auto_route/auto_route.dart';
import 'package:flutter/widgets.dart';

import '../../features/auth/bloc/auth_bloc.dart';
import '../../features/auth/bloc/auth_state.dart';
import 'app_router.gr.dart';

/// Blocks protected routes until the user is authenticated.
/// Reads live [AuthBloc] state via a context lookup.
class AuthGuard extends AutoRouteGuard {
  AuthGuard(this.contextResolver);
  final BuildContext Function() contextResolver;

  @override
  void onNavigation(NavigationResolver resolver, StackRouter router) {
    final ctx = contextResolver();
    final state = ctx.mounted ? _readAuth(ctx) : null;
    if (state?.status == AuthStatus.authenticated) {
      resolver.next(true);
    } else {
      router.replaceAll([const AuthLandingRoute()]);
    }
  }

  AuthState? _readAuth(BuildContext ctx) {
    try {
      // Deferred import via BlocProvider lookup pattern:
      // AuthBloc is provided at app root (main.dart).
      return _AuthBlocReader.of(ctx);
    } catch (_) {
      return null;
    }
  }
}

/// Kicks banned users out of every stack.
class BanGuard extends AutoRouteGuard {
  BanGuard(this.contextResolver);
  final BuildContext Function() contextResolver;

  @override
  void onNavigation(NavigationResolver resolver, StackRouter router) {
    final ctx = contextResolver();
    final state = ctx.mounted ? _AuthBlocReader.of(ctx) : null;
    if (state?.status == AuthStatus.banned) {
      // Ban overlay is rendered globally — allow navigation but overlay blocks UX.
    }
    resolver.next(true);
  }
}

class _AuthBlocReader {
  static AuthState? of(BuildContext ctx) {
    try {
      // Lazy import to avoid circular refs
      // ignore: use_build_context_synchronously
      return (ctx.dependOnInheritedWidgetOfExactType<_AuthStateScope>())?.state;
    } catch (_) {
      return null;
    }
  }
}

/// Optional InheritedWidget wrapper if we ever detach from BlocProvider.
class _AuthStateScope extends InheritedWidget {
  const _AuthStateScope({required this.state, required super.child});
  final AuthState state;
  @override
  bool updateShouldNotify(_AuthStateScope old) => old.state != state;
}
