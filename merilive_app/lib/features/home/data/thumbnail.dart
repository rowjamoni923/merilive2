/// Port of `src/utils/enhanceThumbnail.ts` — routes remote images through the
/// free images.weserv.nl CDN for a crisp, magazine-cover finish without any
/// per-view AI cost or latency.
library;

const _weserv = 'https://images.weserv.nl/';
const _placeholders = {'', '/placeholder.svg', 'placeholder.svg'};

/// Returns an enhanced (WebP, retina-sharp) URL for [url].
///
/// Falls back to the original URL for data:/blob:/relative paths, and to
/// null for empty/placeholder inputs (so callers can show an avatar/fallback).
String? enhanceThumbnail(
  String? url, {
  int width = 800,
  int quality = 88,
  double sharpen = 1.2,
}) {
  if (url == null) return null;
  final trimmed = url.trim();
  if (_placeholders.contains(trimmed)) return null;
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return trimmed;
  if (!RegExp(r'^https?://', caseSensitive: false).hasMatch(trimmed)) {
    return trimmed;
  }
  final stripped = trimmed.replaceFirst(RegExp(r'^https?://', caseSensitive: false), '');
  final params = <String, String>{
    'url': stripped,
    'w': '${width * 2}', // 2x for retina sharpness
    'q': '$quality',
    'output': 'webp',
    'sharp': '$sharpen',
    'af': '',
    'we': '',
  };
  final q = params.entries
      .map((e) => '${Uri.encodeQueryComponent(e.key)}=${Uri.encodeQueryComponent(e.value)}')
      .join('&');
  return '$_weserv?$q';
}
