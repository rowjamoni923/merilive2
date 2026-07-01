import 'package:equatable/equatable.dart';

enum BrandingBgType { gradient, image, gif, video }

BrandingBgType _parseBgType(String? raw) {
  switch (raw) {
    case 'image':
      return BrandingBgType.image;
    case 'gif':
      return BrandingBgType.gif;
    case 'video':
      return BrandingBgType.video;
    default:
      return BrandingBgType.gradient;
  }
}

/// Mirrors the web `useBrandingRealtime` selection over `branding_settings`.
class Branding extends Equatable {
  const Branding({
    required this.logoTextPrimary,
    required this.logoTextSecondary,
    required this.tagline,
    required this.backgroundType,
    required this.backgroundUrl,
    required this.logoImageUrl,
  });

  final String logoTextPrimary;
  final String logoTextSecondary;
  final String tagline;
  final BrandingBgType backgroundType;
  final String backgroundUrl;
  final String? logoImageUrl;

  static const Branding fallback = Branding(
    logoTextPrimary: 'meri',
    logoTextSecondary: 'LIVE',
    tagline: 'Connect • Chat • Share',
    backgroundType: BrandingBgType.gradient,
    backgroundUrl: '',
    logoImageUrl: null,
  );

  factory Branding.fromRow(Map<String, dynamic> row) => Branding(
        logoTextPrimary: (row['logo_text_primary'] as String?) ?? 'meri',
        logoTextSecondary: (row['logo_text_secondary'] as String?) ?? 'LIVE',
        tagline: (row['tagline'] as String?) ?? 'Connect • Chat • Share',
        backgroundType: _parseBgType(row['background_type'] as String?),
        backgroundUrl: (row['background_url'] as String?) ?? '',
        logoImageUrl: row['logo_image_url'] as String?,
      );

  @override
  List<Object?> get props => [
        logoTextPrimary,
        logoTextSecondary,
        tagline,
        backgroundType,
        backgroundUrl,
        logoImageUrl,
      ];
}
