/// Centralized build configuration.
///
/// Values are safe to hardcode:
///   * Supabase URL — public.
///   * Anon key — publishable (RLS enforces all access).
///
/// Do NOT put service_role keys or secrets here.
class Env {
  const Env._();

  static const String supabaseUrl =
      'https://ayjdlvuurscxucatbbah.supabase.co';

  static const String supabaseAnonKey =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF5amRsdnV1cnNjeHVjYXRiYmFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyNjQxMjMsImV4cCI6MjA5MDg0MDEyM30.5A53IMXcvGGnmXK9Dd96V7ceceh1JFuGmPom-hojWJc';

  /// Deep-link scheme used for OAuth callback + password reset.
  static const String deepLinkScheme = 'merilive';
  static const String deepLinkHost = 'auth';

  /// OAuth 2.0 Web Client ID from Google Cloud Console.
  /// Required by `google_sign_in` on Android to mint an ID token that
  /// Supabase's `signInWithIdToken(provider: google)` will accept.
  /// Same ID that Supabase Dashboard → Auth → Google provider uses.
  /// (Same as web app's Firebase project — safe to hardcode, it's public.)
  static const String googleServerClientId =
      String.fromEnvironment('GOOGLE_SERVER_CLIENT_ID', defaultValue: '');
}
