import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;

class ModerationService {
  // Supabase project ref — same as web client
  static const String _supabaseProjectRef = 'ayjdlvuurscxucatbbah';
  static const String _supabaseAnonKey =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF5amRsdnV1cnNjeHVjYXRiYmFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyNjQxMjMsImV4cCI6MjA5MDg0MDEyM30.5A53IMXcvGGnmXK9Dd96V7ceceh1JFuGmPom-hojWJc';

  static String get _moderateVideoEndpoint =>
      'https://$_supabaseProjectRef.supabase.co/functions/v1/moderate-video-sightengine';

  static final List<String> _prohibitedKeywords = [
    'sex', 'nude', 'naked', 'porn', 'adult', 'dating', 'hookup', 'casino',
    'gamble', 'betting', 'money-making', 'hack', 'cheat', 'drugs', 'violence',
    'blood', 'weapon', 'gun', 'kill', 'suicide', 'self-harm'
  ];

  /// Scans text (caption/metadata) for prohibited keywords.
  /// Returns null if safe, or a reason if flagged.
  static String? scanText(String text) {
    if (text.isEmpty) return null;

    final lowerText = text.toLowerCase();
    for (final word in _prohibitedKeywords) {
      if (lowerText.contains(word)) {
        return "Your content contains prohibited keywords: '$word'. Please remove them to comply with our community guidelines.";
      }
    }
    return null;
  }

  /// REAL server-side NSFW check via Sightengine (called through Supabase edge function).
  /// Pass the public video URL (after upload to storage). Optionally pass reelId/userId
  /// for moderation logging and auto-delete on unsafe content.
  static Future<ModerationResult> scanVideo({
    required String videoUrl,
    String? reelId,
    String? userId,
  }) async {
    try {
      final response = await http
          .post(
            Uri.parse(_moderateVideoEndpoint),
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer $_supabaseAnonKey',
              'apikey': _supabaseAnonKey,
            },
            body: jsonEncode({
              'videoUrl': videoUrl,
              if (reelId != null) 'reelId': reelId,
              if (userId != null) 'userId': userId,
            }),
          )
          .timeout(const Duration(seconds: 60));

      if (response.statusCode != 200) {
        // Fail-open: do not block uploads on moderation failure (logged server-side)
        return ModerationResult(isSafe: true, score: 0.0);
      }

      final data = jsonDecode(response.body) as Map<String, dynamic>;
      final isSafe = data['isSafe'] == true;
      final reason = data['reason'] as String?;
      final score = (data['score'] as num?)?.toDouble() ?? 0.0;

      return ModerationResult(isSafe: isSafe, reason: reason, score: score);
    } catch (e) {
      // Fail-open on network/timeout errors
      return ModerationResult(isSafe: true, score: 0.0);
    }
  }

  /// Backwards-compatible wrapper for legacy callers that pass a local file path.
  /// NOTE: For real moderation, callers should upload first and use [scanVideo] with a URL.
  @Deprecated('Use scanVideo({videoUrl}) with the uploaded public URL instead.')
  static Future<ModerationResult> scanVideoSimulated(String path) async {
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return scanVideo(videoUrl: path);
    }
    // No URL available — return safe so legacy callers don't break.
    return ModerationResult(isSafe: true, score: 0.0);
  }
}

class ModerationResult {
  final bool isSafe;
  final String? reason;
  final double score;

  ModerationResult({required this.isSafe, this.reason, required this.score});
}
