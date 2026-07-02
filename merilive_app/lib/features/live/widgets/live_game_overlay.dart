import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../../../core/env/env.dart';
import '../../party/data/party_games_bridge.dart';

/// M3 — Full-screen overlay that renders the SAME web live-room game inside
/// a WebView, matching the Party game overlay pattern.
///
/// Loads `<origin>/live-stream/<streamId>?game=<id>&embed=1` with the user's
/// Supabase session hydrated into localStorage so auth carries over.
/// No new games are added — list comes from admin-managed `game_settings`.
class LiveGameOverlay extends StatefulWidget {
  const LiveGameOverlay({
    super.key,
    required this.streamId,
    required this.game,
    this.onClose,
  });

  final String streamId;
  final PartyGame game;
  final VoidCallback? onClose;

  @override
  State<LiveGameOverlay> createState() => _LiveGameOverlayState();
}

class _LiveGameOverlayState extends State<LiveGameOverlay> {
  late final WebViewController _controller;
  bool _ready = false;

  String get _url =>
      '${Env.webAppOrigin}/live-stream/${widget.streamId}?game=${Uri.encodeComponent(widget.game.id)}&embed=1';

  String get _storageKey {
    final host = Uri.parse(Env.supabaseUrl).host;
    final ref = host.split('.').first;
    return 'sb-$ref-auth-token';
  }

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFF0D0015))
      ..setNavigationDelegate(NavigationDelegate(
        onPageStarted: (_) => _injectSession(),
        onPageFinished: (_) async {
          await _injectSession();
          if (mounted) setState(() => _ready = true);
        },
      ))
      ..loadRequest(Uri.parse(_url));
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
    return Material(
      color: const Color(0xFF0D0015),
      child: SafeArea(
        child: Column(
          children: [
            _header(),
            Expanded(
              child: Stack(
                children: [
                  WebViewWidget(controller: _controller),
                  if (!_ready)
                    const Center(
                      child: CircularProgressIndicator(color: Colors.white70),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _header() {
    return Container(
      height: 46,
      padding: const EdgeInsets.symmetric(horizontal: 8),
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [Color(0xFF4C1D95), Color(0xFF831843)],
        ),
      ),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(Icons.chevron_left_rounded,
                color: Colors.white, size: 26),
            onPressed:
                widget.onClose ?? () => Navigator.of(context).maybePop(),
          ),
          Text(widget.game.emoji,
              style: const TextStyle(fontSize: 18)),
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              widget.game.name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w700,
                  fontSize: 14),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.refresh_rounded,
                color: Colors.white70, size: 20),
            onPressed: () => _controller.reload(),
          ),
        ],
      ),
    );
  }
}
