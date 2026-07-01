/// Shared models for the promo interstitials (Full-Screen Event Popup +
/// Full-Screen Rating Promo). Kept 1:1 with the web `PopupBanner` /
/// `PromoBanner` shapes used in `EventPopupBanner.tsx` and
/// `FullScreenPromoBanners.tsx`.
library;

class EventPopupBannerRow {
  const EventPopupBannerRow({
    required this.id,
    required this.title,
    required this.imageUrl,
    required this.skipDelaySeconds,
    required this.autoDismissSeconds,
  });

  final String id;
  final String title;
  final String imageUrl;
  final int skipDelaySeconds;
  final int autoDismissSeconds;

  bool get isVideo => RegExp(r'\.(mp4|webm|mov|m4v)(?:$|[?#])',
          caseSensitive: false)
      .hasMatch(imageUrl);

  factory EventPopupBannerRow.fromRow(Map<String, dynamic> row) =>
      EventPopupBannerRow(
        id: (row['id'] ?? '').toString(),
        title: (row['title'] ?? '').toString(),
        imageUrl: (row['image_url'] ?? '').toString(),
        skipDelaySeconds: (row['skip_delay_seconds'] as num?)?.toInt() ?? 3,
        autoDismissSeconds:
            (row['auto_dismiss_seconds'] as num?)?.toInt() ?? 10,
      );
}

class RatingBannerRow {
  const RatingBannerRow({required this.imageUrl});
  final String imageUrl;
}
