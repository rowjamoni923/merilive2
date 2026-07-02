import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../../core/env/env.dart';

/// M11 — Generic embedded web page for non-room surfaces (wallet, profile,
/// followers, notifications, help, agency, noble, VIP, shop, leaderboards,
/// events, daily tasks, face verification, settings, 1:1 DM chat).
///
/// Mirrors the [LiveGameOverlay] session-hydration pattern: loads
/// `<Env.webAppOrigin><path>?embed=1` inside a WebView with the current
/// Supabase session written to localStorage so auth carries over.
///
/// Design contract:
/// - This is the M11 stop-gap: gives instant parity with every existing
///   web page while native Flutter rewrites land incrementally.
/// - Admin panel remains single source of truth (web page reads the same
///   Supabase tables the eventual native screen will read).
/// - No fake loading / skeleton — a slim `LinearProgressIndicator` on top
///   of the WebView while the page paints, then removed.
/// - English-only chrome; the embedded page itself renders whatever the
///   user's app locale is.
class EmbeddedWebPage extends StatefulWidget {
  const EmbeddedWebPage({
    super.key,
    required this.path,
    required this.title,
    this.query = const {},
  });

  /// Root-relative path on `Env.webAppOrigin` — e.g. `/wallet`, `/profile/<id>`.
  final String path;

  /// AppBar title (English only).
  final String title;

  /// Extra query params merged on top of the default `embed=1`.
  final Map<String, String> query;

  static Route<void> route({
    required String path,
    required String title,
    Map<String, String> query = const {},
  }) =>
      MaterialPageRoute(
        builder: (_) => EmbeddedWebPage(
          path: path,
          title: title,
          query: query,
        ),
      );

  @override
  State<EmbeddedWebPage> createState() => _EmbeddedWebPageState();
}

class _EmbeddedWebPageState extends State<EmbeddedWebPage> {
  late final WebViewController _controller;
  int _loading = 0;

  String get _storageKey {
    final host = Uri.parse(Env.supabaseUrl).host;
    final ref = host.split('.').first;
    return 'sb-$ref-auth-token';
  }

  Uri get _uri {
    final q = <String, String>{'embed': '1', ...widget.query};
    return Uri.parse('${Env.webAppOrigin}${widget.path}')
        .replace(queryParameters: q);
  }

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFF0B1220))
      ..setNavigationDelegate(NavigationDelegate(
        onPageStarted: (_) {
          if (mounted) setState(() => _loading = 1);
          _injectSession();
        },
        onProgress: (p) {
          if (mounted) setState(() => _loading = p);
        },
        onPageFinished: (_) async {
          await _injectSession();
          if (mounted) setState(() => _loading = 100);
        },
      ))
      ..loadRequest(_uri);
  }

  Future<void> _injectSession() async {
    final session = Supabase.instance.client.auth.currentSession;
    if (session == null) return;
    final payload = {
      'access_token': session.accessToken,
      'refresh_token': session.refreshToken,
      'expires_at': session.expiresAt,
      'expires_in': session.expiresIn,
      'token_type': session.tokenType,
      'user': session.user.toJson(),
    };
    final encoded = jsonEncode(jsonEncode(payload));
    final key = jsonEncode(_storageKey);
    try {
      await _controller.runJavaScript(
        'try { window.localStorage.setItem($key, $encoded); } catch(e) {}',
      );
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0B1220),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0B1220),
        foregroundColor: Colors.white,
        elevation: 0,
        title: Text(
          widget.title,
          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded, size: 20),
            onPressed: () => _controller.reload(),
          ),
        ],
      ),
      body: Stack(
        children: [
          WebViewWidget(controller: _controller),
          if (_loading > 0 && _loading < 100)
            LinearProgressIndicator(
              value: _loading / 100.0,
              minHeight: 2,
              backgroundColor: Colors.transparent,
              valueColor:
                  const AlwaysStoppedAnimation<Color>(Color(0xFF60A5FA)),
            ),
        ],
      ),
    );
  }
}

/// M11 — Central registry so every surface uses the same title + web path.
/// Paths verified against `src/App.tsx` during M12 QA sweep — only entries
/// that actually exist on the web are exposed. When a native Flutter screen
/// replaces one of these, swap the helper body to push the native page
/// instead — call sites don't need to change.
class M11Routes {
  M11Routes._();

  // Wallet / money
  static Future<void> openWallet(BuildContext c) =>
      _push(c, '/agent-wallet', 'Wallet');
  static Future<void> openRecharge(BuildContext c) =>
      _push(c, '/recharge', 'Recharge');

  // Identity
  static Future<void> openMyProfile(BuildContext c) =>
      _push(c, '/profile', 'My Profile');
  static Future<void> openProfile(BuildContext c, String userId) =>
      _push(c, '/profile/$userId', 'Profile');
  static Future<void> openProfileEdit(BuildContext c) =>
      _push(c, '/edit-profile', 'Edit Profile');
  static Future<void> openFollowing(BuildContext c) =>
      _push(c, '/following', 'Following');
  static Future<void> openBlocked(BuildContext c) =>
      _push(c, '/settings/blacklist', 'Blocked Users');

  // Inbox
  static Future<void> openChatList(BuildContext c) =>
      _push(c, '/chat', 'Messages');
  static Future<void> openNotificationPrefs(BuildContext c) =>
      _push(c, '/settings/notifications', 'Notification Preferences');

  // Programs
  static Future<void> openAgencyPortal(BuildContext c) =>
      _push(c, '/agency', 'Agency Portal');
  static Future<void> openVip(BuildContext c) => _push(c, '/vip', 'VIP');
  static Future<void> openShop(BuildContext c) => _push(c, '/shop', 'Shop');
  static Future<void> openInvitation(BuildContext c) =>
      _push(c, '/invitation', 'Invitations');

  // Discovery
  static Future<void> openLeaderboards(BuildContext c) =>
      _push(c, '/leaderboard', 'Leaderboards');
  static Future<void> openDailyRewards(BuildContext c) =>
      _push(c, '/rewards', 'Daily Rewards');
  static Future<void> openTasks(BuildContext c) =>
      _push(c, '/tasks', 'Daily Tasks');
  static Future<void> openLevel(BuildContext c) =>
      _push(c, '/level', 'Level & Privileges');

  // Compliance + settings
  static Future<void> openFaceVerification(BuildContext c) =>
      _push(c, '/face-verification', 'Face Verification');
  static Future<void> openSupport(BuildContext c) =>
      _push(c, '/support', 'Contact Support');
  static Future<void> openSettings(BuildContext c) =>
      _push(c, '/settings', 'Settings');

  static Future<void> _push(BuildContext c, String path, String title) {
    return Navigator.of(c).push(
      EmbeddedWebPage.route(path: path, title: title),
    );
  }
}

