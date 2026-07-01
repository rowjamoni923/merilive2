# Home Banners — Top Bonus + Promo Above Cards (Antigravity reference)

The home screen has TWO admin-driven banners stacked above the live-host grid:

1. **Top Bar Banner** — "Live 5 Hours = $5 Bonus" — host-incentive banner from `banners` table (`position=top` slot). Tapping opens the bonus details / live-host dashboard.
2. **Promo Banner (above 6 cards)** — admin promo banner displayed in the **middle** position, between the top stories/categories and the live-host grid (the "6 cards" the user refers to).

Web reference: `src/components/home/DynamicBanner.tsx` (used as `<DynamicBanner position="top" />` and `<DynamicBanner position="middle" />`).

---

## Single source: `banners` table

Both banners come from **one** table with **one** active query, then split by position based on `display_order`:

```dart
// All active banners, ordered ASC by display_order, filtered by date window
final rows = await Supabase.instance.client
    .from('banners')
    .select()
    .eq('is_active', true)
    .order('display_order', ascending: true);

final now = DateTime.now();
final all = (rows as List)
    .map((e) => BannerModel.fromJson(e))
    .where((b) =>
        (b.startDate == null || !b.startDate!.isAfter(now)) &&
        (b.endDate   == null || !b.endDate!.isBefore(now)))
    .toList();

// Web logic:  position == 'top'    => last banner only  (all.takeLast(1))
//             position == 'middle' => everything except the last
final topBanners    = all.isNotEmpty ? [all.last] : <BannerModel>[];
final middleBanners = all.length > 1 ? all.sublist(0, all.length - 1) : <BannerModel>[];
```

This split mirrors the React component (`activeBanners.slice(-1)` vs `slice(0, -1)`). Keep the rule **identical** so the admin's existing settings work without changes.

---

## Banner model (already in `merilive_flutter/lib/models/`)

If not yet created, add `lib/models/banner_model.dart`:

```dart
class BannerModel {
  final String id;
  final String title;
  final String? subtitle;
  final String? imageUrl;
  final String? linkUrl;
  final String? linkType;          // 'internal' | 'external' | 'popup' | 'fullscreen'
  final String? backgroundColor;
  final String? textColor;
  final String? accentColor;
  final bool isActive;
  final int? displayOrder;
  final DateTime? startDate;
  final DateTime? endDate;

  BannerModel({
    required this.id,
    required this.title,
    required this.isActive,
    this.subtitle,
    this.imageUrl,
    this.linkUrl,
    this.linkType,
    this.backgroundColor,
    this.textColor,
    this.accentColor,
    this.displayOrder,
    this.startDate,
    this.endDate,
  });

  factory BannerModel.fromJson(Map<String, dynamic> j) => BannerModel(
    id: j['id'],
    title: j['title'] ?? '',
    subtitle: j['subtitle'],
    imageUrl: j['image_url'],
    linkUrl: j['link_url'],
    linkType: j['link_type'] ?? j['click_action'] ?? 'external',
    backgroundColor: j['background_color'] ?? '#1a1a2e',
    textColor: j['text_color'] ?? '#ffffff',
    accentColor: j['accent_color'] ?? '#ff6b6b',
    isActive: j['is_active'] ?? false,
    displayOrder: j['display_order'],
    startDate: j['start_date'] == null ? null : DateTime.tryParse(j['start_date']),
    endDate:   j['end_date']   == null ? null : DateTime.tryParse(j['end_date']),
  );
}
```

---

## Top Banner widget

Renders above the search/filter bar. If `image_url` is set, show full-bleed image; else show coloured card with title/subtitle/CTA chevron.

```dart
class HomeTopBanner extends StatelessWidget {
  final BannerModel banner;
  const HomeTopBanner({super.key, required this.banner});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => BannerAction.handle(context, banner),
      child: Container(
        margin: const EdgeInsets.fromLTRB(12, 8, 12, 8),
        clipBehavior: Clip.hardEdge,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          color: _hex(banner.backgroundColor),
        ),
        child: banner.imageUrl != null && banner.imageUrl!.isNotEmpty
          ? AspectRatio(
              aspectRatio: 16 / 9,
              child: Image.network(banner.imageUrl!, fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => const SizedBox.shrink()),
            )
          : _TextCard(banner: banner),
      ),
    );
  }
}

class _TextCard extends StatelessWidget {
  final BannerModel banner;
  const _TextCard({required this.banner});
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Row(children: [
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(banner.title, style: TextStyle(
            color: _hex(banner.textColor),
            fontWeight: FontWeight.w800, fontSize: 18,
          )),
          if (banner.subtitle != null && banner.subtitle!.isNotEmpty)
            Text(banner.subtitle!, style: TextStyle(
              color: _hex(banner.textColor)?.withOpacity(0.85), fontSize: 13,
            )),
        ])),
        if (banner.linkUrl != null && banner.linkUrl!.isNotEmpty)
          Icon(Icons.chevron_right, color: _hex(banner.textColor)?.withOpacity(0.6)),
      ]),
    );
  }
}

Color? _hex(String? h) {
  if (h == null) return null;
  final hh = h.replaceFirst('#', '');
  return Color(int.parse('FF$hh', radix: 16));
}
```

---

## Promo Banner (middle, above 6 cards)

Same widget, just rendered in the home-screen layout between the categories row and the live-host grid:

```dart
// lib/screens/home/home_screen.dart (sketch)
return CustomScrollView(slivers: [
  const SliverToBoxAdapter(child: HomeHeader()),
  const SliverToBoxAdapter(child: StoriesRow()),
  const SliverToBoxAdapter(child: CategoryTabs()),

  // Top bonus banner (last item in admin-ordered list)
  if (topBanners.isNotEmpty)
    SliverToBoxAdapter(child: HomeTopBanner(banner: topBanners.first)),

  // Promo banners (everything except the last)
  SliverList(delegate: SliverChildBuilderDelegate(
    (ctx, i) => HomeTopBanner(banner: middleBanners[i]),
    childCount: middleBanners.length,
  )),

  // The "6 cards" — live host grid
  const LiveHostGrid(),
]);
```

> **Note**: User said "Top Bonus" should sit at the **very top** of the home page, and the second promo banner is **above the 6 cards** (the live host grid). The web component places the LAST entry on top and the rest above hosts; mirror this convention for full parity. If the user wants top↔middle swapped, just change which slice goes where (single line change).

---

## Click handling (`BannerAction`)

```dart
class BannerAction {
  static Future<void> handle(BuildContext ctx, BannerModel banner) async {
    final url = banner.linkUrl;
    if (url == null || url.isEmpty) return;

    final isInternal = url.startsWith('/') && !url.startsWith('//');
    final type = isInternal ? 'internal' : (banner.linkType ?? 'external');

    switch (type) {
      case 'internal':
        Navigator.of(ctx).pushNamed(url);   // e.g. '/recharge', '/host-dashboard'
        break;
      case 'popup':
        showDialog(context: ctx, builder: (_) => _PopupWebView(url: url, title: banner.title));
        break;
      case 'external':
        // ALWAYS in-app — never external browser (memory: strict-in-app-navigation-policy)
        await InAppBrowser.open(url);
        break;
      case 'fullscreen':
        Navigator.of(ctx).push(MaterialPageRoute(
          builder: (_) => _FullscreenWebView(url: url, title: banner.title)));
        break;
    }
  }
}
```

---

## "5 Hours Live = $5 Bonus" specifically

This is **just one entry** in the `banners` table that the admin has configured with:
- `title`: "Live 5 Hours = $5 Bonus" (English only)
- `image_url`: marketing creative
- `link_url`: `/host-dashboard?tab=bonus` (internal route)
- `link_type`: `internal`
- `display_order`: highest among active rows (so the slice-last logic puts it on top)

When tapped, it routes to **Host Dashboard → Bonus tab**, where the user sees the live `NewHostBonusCard` widget powered by:
- `get_host_live_bonus_state(_host_id)` — current state
- `record_host_live_minute(_host_id)` — heartbeat per minute while live
- `claim_host_live_hour_bonus(_host_id, _hour_number)` — claim bonus per hour

These RPCs already exist (see `src/components/live/NewHostBonusCard.tsx`).

---

## Realtime updates

Subscribe so admin edits reflect instantly without app restart:

```dart
Supabase.instance.client.channel('home:banners')
  .onPostgresChanges(
    event: PostgresChangeEvent.all,
    schema: 'public', table: 'banners',
    callback: (_) => refreshBanners(),
  ).subscribe();
```

---

## NEVER-DO

- ❌ Never hard-code banner content in Flutter — always read from `banners` table.
- ❌ Never open `link_url` in external browser — use in-app WebView.
- ❌ Never include English-only checks server-side — admin enforces English at insert time (memory: `global-english-standard`).
- ❌ Never bypass `start_date`/`end_date` filtering — campaigns must auto-expire.
- ❌ Never change the slice convention (`last → top`, `rest → middle`) without also updating admin docs.
