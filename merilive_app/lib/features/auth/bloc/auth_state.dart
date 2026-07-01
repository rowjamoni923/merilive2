import 'package:equatable/equatable.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

enum AuthStatus { unknown, unauthenticated, authenticated, banned }

class AuthState extends Equatable {
  const AuthState({
    this.status = AuthStatus.unknown,
    this.session,
    this.banReason,
  });

  final AuthStatus status;
  final Session? session;
  final String? banReason;

  const AuthState.unknown() : this();
  const AuthState.unauthenticated()
      : this(status: AuthStatus.unauthenticated);

  AuthState.authenticated(Session s)
      : this(status: AuthStatus.authenticated, session: s);

  AuthState.banned(String reason)
      : this(status: AuthStatus.banned, banReason: reason);

  Map<String, dynamic> toJson() => {
        'status': status.name,
        'accessToken': session?.accessToken,
        'refreshToken': session?.refreshToken,
        'expiresAt': session?.expiresAt,
        'userId': session?.user.id,
        'banReason': banReason,
      };

  static AuthState? fromJson(Map<String, dynamic> json) {
    final name = json['status'] as String?;
    if (name == null) return null;
    // We don't rebuild full Session from JSON — Supabase auto-restores it.
    // We only remember the last status hint for splash decisions.
    return AuthState(
      status: AuthStatus.values.firstWhere(
        (e) => e.name == name,
        orElse: () => AuthStatus.unknown,
      ),
      banReason: json['banReason'] as String?,
    );
  }

  @override
  List<Object?> get props => [status, session?.accessToken, banReason];
}
