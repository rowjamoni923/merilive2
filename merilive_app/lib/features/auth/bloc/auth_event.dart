import 'package:equatable/equatable.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

abstract class AuthEvent extends Equatable {
  const AuthEvent();
  @override
  List<Object?> get props => const [];
}

/// Fired once from main() to restore last known session.
class AppStarted extends AuthEvent {
  const AppStarted();
}

/// Emitted by Supabase auth-state stream on any change.
class AuthStreamChanged extends AuthEvent {
  const AuthStreamChanged(this.event, this.session);
  final AuthChangeEvent event;
  final Session? session;

  @override
  List<Object?> get props => [event, session?.accessToken];
}

class SignedOut extends AuthEvent {
  const SignedOut();
}

class BanDetected extends AuthEvent {
  const BanDetected(this.reason);
  final String reason;
  @override
  List<Object?> get props => [reason];
}
