/// Home banner — 1:1 with web `Banner` type read from `public.banners`.
///
/// Fields kept intentionally identical to `src/hooks/useAdminSettingsRealtime.ts`
/// so admin changes reflect in Flutter without any per-field translation layer.
library;

class HomeBanner {
  const HomeBanner({
    required this.id,
    required this.title,
    required this.imageUrl,
    required this.linkUrl,
    required this.linkType,
    required this.displayOrder,
    required this.startDate,
    required this.endDate,
  });

  final String id;
  final String title;
  final String? imageUrl;
  final String? linkUrl;
  final String linkType; // 'internal' | 'external' | 'popup'
  final int displayOrder;
  final DateTime? startDate;
  final DateTime? endDate;

  bool get isActiveNow {
    final now = DateTime.now();
    if (startDate != null && startDate!.isAfter(now)) return false;
    if (endDate != null && endDate!.isBefore(now)) return false;
    return true;
  }

  factory HomeBanner.fromRow(Map<String, dynamic> row) {
    DateTime? parse(dynamic v) {
      if (v == null) return null;
      final s = v.toString();
      if (s.isEmpty) return null;
      return DateTime.tryParse(s);
    }

    final rawLinkType =
        (row['link_type'] ?? row['click_action'] ?? 'external').toString();
    return HomeBanner(
      id: (row['id'] ?? '').toString(),
      title: (row['title'] ?? '').toString(),
      imageUrl: (row['image_url'] as String?)?.trim().isEmpty ?? true
          ? null
          : row['image_url'] as String,
      linkUrl: (row['link_url'] as String?)?.trim().isEmpty ?? true
          ? null
          : row['link_url'] as String,
      linkType: rawLinkType,
      displayOrder: (row['display_order'] as num?)?.toInt() ?? 0,
      startDate: parse(row['start_date']),
      endDate: parse(row['end_date']),
    );
  }
}
