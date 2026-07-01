import 'package:supabase_flutter/supabase_flutter.dart';

import '../env/env.dart';

/// Global Supabase accessor. Call [SupabaseBootstrap.init] once from `main()`.
class SupabaseBootstrap {
  const SupabaseBootstrap._();

  static Future<void> init() async {
    await Supabase.initialize(
      url: Env.supabaseUrl,
      anonKey: Env.supabaseAnonKey,
      authOptions: const FlutterAuthClientOptions(
        authFlowType: AuthFlowType.pkce,
        autoRefreshToken: true,
      ),
      realtimeClientOptions: const RealtimeClientOptions(
        logLevel: RealtimeLogLevel.error,
      ),
    );
  }

  /// Shorthand accessor used across feature repositories.
  static SupabaseClient get client => Supabase.instance.client;
}

/// Shorthand for `Supabase.instance.client`.
SupabaseClient get sb => Supabase.instance.client;
