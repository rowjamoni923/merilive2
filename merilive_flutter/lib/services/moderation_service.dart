import 'dart:async';

class ModerationService {
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

  /// High-fidelity simulated visual analysis.
  /// In a production environment, this would call a Cloud Vision/Moderation API.
  static Future<ModerationResult> scanVideoSimulated(String path) async {
    // Stage 1: File size & Frame optimization
    await Future.delayed(const Duration(milliseconds: 1200));
    
    // Stage 2: Feature extraction (Simulated)
    await Future.delayed(const Duration(milliseconds: 1500));
    
    // Stage 3: Classifying visual attributes
    await Future.delayed(const Duration(milliseconds: 1000));

    // For parity demo, we return safe unless the filename contains "unsafe"
    if (path.toLowerCase().contains('unsafe')) {
       return ModerationResult(
         isSafe: false,
         reason: "Potential 18+ or prohibited visual content detected. Please ensure your video follows our strict community safety guidelines.",
         score: 0.95,
       );
    }

    return ModerationResult(isSafe: true, score: 0.01);
  }
}

class ModerationResult {
  final bool isSafe;
  final String? reason;
  final double score;

  ModerationResult({required this.isSafe, this.reason, required this.score});
}


