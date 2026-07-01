import 'dart:async';

import 'package:hydrated_bloc/hydrated_bloc.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/supabase/supabase_client.dart';
import 'auth_event.dart';
import 'auth_state.dart';

/// Global auth source-of-truth. Mirrors the web app's App.tsx onAuthStateChange.
class AuthBloc extends HydratedBloc<AuthEvent, AuthState> {
  AuthBloc() : super(const AuthState.unknown()) {
    on<AppStarted>(_onAppStarted);
    on<AuthStreamChanged>(_onStreamChanged);
    on<SignedOut>(_onSignedOut);
    on<BanDetected>(_onBanDetected);

    // Subscribe to Supabase auth changes — single source of truth.
    _sub = sb.auth.onAuthStateChange.listen((data) {
      add(AuthStreamChanged(data.event, data.session));
    });
  }

  late final StreamSubscription<AuthState0> _sub;

  Future<void> _onAppStarted(AppStarted e, Emitter<AuthState> emit) async {
    final session = sb.auth.currentSession;
    if (session != null) {
      emit(AuthState.authenticated(session));
    } else {
      emit(const AuthState.unauthenticated());
    }
  }

  void _onStreamChanged(AuthStreamChanged e, Emitter<AuthState> emit) {
    switch (e.event) {
      case AuthChangeEvent.signedIn:
      case AuthChangeEvent.tokenRefreshed:
      case AuthChangeEvent.userUpdated:
      case AuthChangeEvent.initialSession:
        if (e.session != null) {
          emit(AuthState.authenticated(e.session!));
        } else {
          emit(const AuthState.unauthenticated());
        }
        break;
      case AuthChangeEvent.signedOut:
      case AuthChangeEvent.userDeleted:
        emit(const AuthState.unauthenticated());
        break;
      case AuthChangeEvent.passwordRecovery:
        // handled by ResetPassword route (Step F)
        break;
      case AuthChangeEvent.mfaChallengeVerified:
        break;
    }
  }

  Future<void> _onSignedOut(SignedOut e, Emitter<AuthState> emit) async {
    await sb.auth.signOut();
    emit(const AuthState.unauthenticated());
  }

  void _onBanDetected(BanDetected e, Emitter<AuthState> emit) {
    emit(AuthState.banned(e.reason));
  }

  @override
  Future<void> close() {
    _sub.cancel();
    return super.close();
  }

  @override
  AuthState? fromJson(Map<String, dynamic> json) => AuthState.fromJson(json);

  @override
  Map<String, dynamic>? toJson(AuthState state) => state.toJson();
}

/// Alias to avoid clashing with our own AuthState.
typedef AuthState0 = AuthState;
