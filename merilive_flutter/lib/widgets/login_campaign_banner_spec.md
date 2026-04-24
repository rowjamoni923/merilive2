# Login Campaign Banner (Full-Screen) — Antigravity reference

> When a user **finishes login/signup**, a full-screen campaign popup may appear once per app entry (session). It rotates between admin-managed banners. Tapping the banner opens its target route or external popup.
>
> Mirrors `src/components/home/FullScreenPromoBanners.tsx`.

---

## Triggering rule

Show **at most one** campaign banner per app session, and only if:

1. `Supabase.instance.client.auth.currentSession != null` (user is logged in)
2. `sessionStorage('promo_banner_shown_this_entry')` is **not set** (use `SharedPreferences` per-session flag in Flutter — clear on `signedOut`)
3. The user is on the `home` route (don't pop on top of other screens)
4. There exists at least one **eligible** banner from `app_campaign_banners` (admin table, see schema below)

---

## Database source

Use the existing `banners` table (managed in admin panel) for full-screen campaign banners. Filter by `display_zone = 'fullscreen_login'` if column exists; otherwise reuse `banners` and check `link_type = 'fullscreen'`.

> If a dedicated `app_campaign_banners` table is preferred, request migration. For now, the spec uses the **existing `banners` table** with these conventions:
> - `display_order` controls rotation order
> - `start_date` / `end_date` enforce campaign window
> - `link_url` and `link_type` define the click target
> - `image_url` is the full-screen image (1080×1920 portrait recommended)

```sql
-- Read query
SELECT * FROM banners
WHERE is_active = true
  AND (start_date IS NULL OR start_date <= now())
  AND (end_date   IS NULL OR end_date   >= now())
  AND (link_type  IS NULL OR link_type IN ('fullscreen','popup','internal','external'))
ORDER BY display_order ASC;
```

---

## Behaviour spec (from web parity)

| Constant | Value |
|---|---|
| `SKIP_DELAY_MS` | 3 000 ms (Skip button enabled after 3s) |
| `AUTO_CLOSE_MS` | 10 000 ms (auto-dismiss if user does nothing) |
| `SESSION_KEY` | `'promo_banner_shown_this_entry'` |
| `ROTATION_KEY` | `'promo_banner_rotation_index'` |

Rotation: persistent index in `SharedPreferences`, advances **after** banner is dismissed. Each app entry shows the next banner in the cycle (memory: `banner-rotation-and-rating-flow`).

Click handling (same as `DynamicBanner`):
- `link_type == 'internal'` (or url starts with `/`) → `Navigator.pushNamed(context, banner.linkUrl!)` and dismiss
- `link_type == 'popup'` → open in-app WebView modal at `banner.linkUrl`
- `link_type == 'external'` → open in **in-app** browser (NEVER external — see memory `strict-in-app-navigation-policy`)
- `link_type == 'fullscreen'` → already full-screen, treat as no-op or external popup

---

## Flutter implementation

```dart
// lib/widgets/login_campaign_banner.dart

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

const _sessionKey = 'promo_banner_shown_this_entry';
const _rotationKey = 'promo_banner_rotation_index';
const _skipDelayMs = 3000;
const _autoCloseMs = 10000;

class LoginCampaignBannerHost extends StatefulWidget {
  final Widget child;
  const LoginCampaignBannerHost({super.key, required this.child});
  @override
  State<LoginCampaignBannerHost> createState() => _LoginCampaignBannerHostState();
}

class _LoginCampaignBannerHostState extends State<LoginCampaignBannerHost> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _maybeShow());
  }

  Future<void> _maybeShow() async {
    final prefs = await SharedPreferences.getInstance();
    if (prefs.getBool(_sessionKey) == true) return;

    final session = Supabase.instance.client.auth.currentSession;
    if (session == null) return;

    final banners = await _fetchEligibleBanners();
    if (banners.isEmpty) return;

    final startIdx = prefs.getInt(_rotationKey) ?? 0;
    final banner = banners[startIdx % banners.length];

    await prefs.setBool(_sessionKey, true);
    await prefs.setInt(_rotationKey, (startIdx + 1) % banners.length);

    if (!mounted) return;
    showDialog(
      context: context,
      barrierColor: Colors.black87,
      barrierDismissible: false,
      builder: (_) => _CampaignBannerDialog(banner: banner),
    );
  }

  Future<List<BannerModel>> _fetchEligibleBanners() async {
    final res = await Supabase.instance.client
        .from('banners')
        .select()
        .eq('is_active', true)
        .order('display_order', ascending: true);
    final now = DateTime.now();
    return (res as List)
        .map((e) => BannerModel.fromJson(e as Map<String, dynamic>))
        .where((b) {
      if (b.startDate != null && b.startDate!.isAfter(now)) return false;
      if (b.endDate != null && b.endDate!.isBefore(now)) return false;
      return b.imageUrl != null && b.imageUrl!.isNotEmpty;
    }).toList();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}

class _CampaignBannerDialog extends StatefulWidget {
  final BannerModel banner;
  const _CampaignBannerDialog({required this.banner});
  @override
  State<_CampaignBannerDialog> createState() => _CampaignBannerDialogState();
}

class _CampaignBannerDialogState extends State<_CampaignBannerDialog> {
  bool _canSkip = false;
  int _countdown = 3;

  @override
  void initState() {
    super.initState();
    _startTimers();
  }

  void _startTimers() async {
    for (var s = 3; s > 0; s--) {
      await Future.delayed(const Duration(seconds: 1));
      if (!mounted) return;
      setState(() => _countdown = s - 1);
    }
    if (mounted) setState(() => _canSkip = true);

    await Future.delayed(const Duration(milliseconds: _autoCloseMs - _skipDelayMs));
    if (mounted) Navigator.of(context).maybePop();
  }

  void _handleClick() {
    final url = widget.banner.linkUrl;
    Navigator.of(context).pop();
    if (url == null || url.isEmpty) return;

    final isInternal = url.startsWith('/') && !url.startsWith('//');
    if (isInternal) {
      Navigator.of(context).pushNamed(url);
    } else {
      // open in-app browser (custom tabs / WKWebView)
      InAppBrowser.open(url);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Dialog.fullscreen(
      backgroundColor: Colors.black,
      child: Stack(children: [
        // Tappable banner image
        Positioned.fill(
          child: GestureDetector(
            onTap: _handleClick,
            child: Image.network(
              widget.banner.imageUrl!,
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => const SizedBox.shrink(),
            ),
          ),
        ),
        // Skip button (top right, after 3s)
        Positioned(
          top: MediaQuery.of(context).padding.top + 12,
          right: 12,
          child: AnimatedOpacity(
            duration: const Duration(milliseconds: 200),
            opacity: _canSkip ? 1.0 : 0.6,
            child: TextButton(
              style: TextButton.styleFrom(
                backgroundColor: Colors.black54,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
              ),
              onPressed: _canSkip ? () => Navigator.of(context).pop() : null,
              child: Text(_canSkip ? 'Skip ✕' : 'Skip in $_countdown'),
            ),
          ),
        ),
      ]),
    );
  }
}
```

Wrap home like this:

```dart
// in router for '/home'
LoginCampaignBannerHost(child: HomeScreen())
```

---

## Reset on sign-out

```dart
Supabase.instance.client.auth.onAuthStateChange.listen((data) async {
  if (data.event == AuthChangeEvent.signedOut) {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_sessionKey);   // allow next user's banner to show
  }
});
```

---

## NEVER-DO

- ❌ Never use `launchUrl(mode: LaunchMode.externalApplication)` — always in-app.
- ❌ Never show before `currentSession != null`.
- ❌ Never persist `_sessionKey` across sessions — use a key that resets on sign-out.
- ❌ Never block back-press; user must always be able to skip after 3s.
