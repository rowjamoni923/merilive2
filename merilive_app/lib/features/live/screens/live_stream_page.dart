import 'dart:async';

import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../data/live_chat_bridge.dart';
import '../data/live_follow_bridge.dart';
import '../data/live_host_bridge.dart';
import '../data/live_viewer_bridge.dart';
import '../widgets/live_action_bar.dart';
import '../widgets/live_chat_composer.dart';
import '../widgets/live_chat_overlay.dart';
import '../widgets/live_gift_feed.dart';
import '../widgets/live_viewers_sheet.dart';

/// A1 — LiveStreamPage shell (Full-Parity Sprint).
///
/// Web-truth reference: `src/pages/LiveStream.tsx`.
/// This shell delivers ONLY the transport + core HUD:
///   • Fetch `live_streams` row + host profile
///   • Host: reuse `LiveHostBridge` already publishing from GoLive
///     (zero-gap Camera2 handoff — never re-init camera).
///   • Viewer: connect `LiveViewerBridge` (subscribe-only) + heartbeat.
///   • Realtime subscription on the `live_streams` row for viewer_count
///     and status (auto-navigate back when host ends).
///   • Top header: back button, host avatar+name, LIVE badge, viewer count.
///   • Bottom bar: single Leave (viewer) / End (host) CTA.
///
/// A2 (chat + gifts feed), A3 (bottom action row), A4+ (viewer list, PK,
/// games, level anims) land in follow-up steps and mount ABOVE this shell.
@RoutePage(name: 'LiveStreamRoute')
class LiveStreamPage extends StatefulWidget {
  const LiveStreamPage({
    super.key,
    @PathParam('streamId') required this.streamId,
  });

  final String streamId;

  @override
  State<LiveStreamPage> createState() => _LiveStreamPageState();
}

class _LiveStreamPageState extends State<LiveStreamPage> {
  final _client = Supabase.instance.client;

  bool _loading = true;
  bool _leaving = false;
  String? _error;

  Map<String, dynamic>? _stream;
  Map<String, dynamic>? _host;
  int _viewerCount = 0;
  RealtimeChannel? _channel;
  List<LiveChatMessage> _chatMessages = const [];
  StreamSubscription<List<LiveChatMessage>>? _chatSub;

  // A3 — host quick-action state (mirrors LiveHostBridge; native side is
  // the source of truth, this is UI-only until the native toggle lands).
  bool _isMicMuted = false;
  bool _isCamOff = false;

  // A4 — follow-from-header state.
  bool _isFollowingHost = false;
  bool _followBusy = false;

  bool get _isHost {
    final uid = _client.auth.currentUser?.id;
    return uid != null && uid == _stream?['host_id'];
  }

  bool get _hostSessionOwned =>
      LiveHostBridge.instance.isActive &&
      LiveHostBridge.instance.streamId == widget.streamId;

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    try {
      final stream = await _client
          .from('live_streams')
          .select(
              'id, host_id, title, status, viewer_count, total_coins, coin_count')
          .eq('id', widget.streamId)
          .maybeSingle();

      if (stream == null) {
        setState(() {
          _loading = false;
          _error = 'This stream is no longer available.';
        });
        return;
      }

      Map<String, dynamic>? host;
      if (stream['host_id'] != null) {
        host = await _client
            .from('profiles')
            .select('id, name, avatar_url, level, host_level')
            .eq('id', stream['host_id'])
            .maybeSingle();
      }

      setState(() {
        _stream = stream;
        _host = host;
        _viewerCount = (stream['viewer_count'] as int?) ?? 0;
        _loading = false;
      });

      _subscribeRealtime();

      // A2 — attach chat/gift feed for both host and viewer.
      await LiveChatBridge.instance.attach(widget.streamId);
      _chatSub = LiveChatBridge.instance.messages$.listen((m) {
        if (mounted) setState(() => _chatMessages = m);
      });
      _chatMessages = LiveChatBridge.instance.snapshot;
      final welcome = (host?['name']?.toString() ?? 'the host');
      LiveChatBridge.instance
          .pushSystemNotice('Welcome to $welcome\'s live room — be respectful ✨');

      // Viewer join — host is already publishing via LiveHostBridge from
      // the GoLive handoff, so we only need to connect the viewer bridge.
      if (!_isHost) {
        final name =
            _client.auth.currentUser?.userMetadata?['name']?.toString() ??
                'viewer';
        try {
          await LiveViewerBridge.instance.joinAsViewer(
            streamId: widget.streamId,
            participantName: name,
          );
        } catch (e) {
          if (mounted) {
            setState(() => _error = 'Unable to join stream: $e');
          }
        }
      }
      // A4 — resolve initial follow state for viewers (skip for host).
      if (!_isHost && stream['host_id'] != null) {
        try {
          final following = await LiveFollowBridge.instance
              .isFollowing(stream['host_id'].toString());
          if (mounted) setState(() => _isFollowingHost = following);
        } catch (_) {}
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = 'Failed to load stream: $e';
        });
      }
    }
  }

  void _subscribeRealtime() {
    _channel?.unsubscribe();
    _channel = _client
        .channel('live_stream_${widget.streamId}')
        .onPostgresChanges(
          event: PostgresChangeEvent.update,
          schema: 'public',
          table: 'live_streams',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'id',
            value: widget.streamId,
          ),
          callback: (payload) {
            final row = payload.newRecord;
            if (!mounted) return;
            final status = row['status']?.toString();
            setState(() {
              _viewerCount = (row['viewer_count'] as int?) ?? _viewerCount;
              _stream = {...?_stream, ...row};
            });
            if (status == 'ended' && !_isHost) {
              _autoLeaveOnEnded();
            }
          },
        )
        .subscribe();
  }

  Future<void> _autoLeaveOnEnded() async {
    if (_leaving) return;
    _leaving = true;
    try {
      await LiveViewerBridge.instance.leave();
    } catch (_) {}
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Stream ended')),
    );
    context.router.maybePop();
  }

  Future<void> _handleLeaveOrEnd() async {
    if (_leaving) return;
    setState(() => _leaving = true);

    if (_isHost) {
      // Host ends the stream — server-authoritative teardown, native
      // camera/publisher torn down by LiveHostBridge.stop().
      try {
        await _client.rpc('end_live_stream', params: {
          'p_stream_id': widget.streamId,
        });
      } catch (_) {}
      if (_hostSessionOwned) {
        try {
          await LiveHostBridge.instance.stop();
        } catch (_) {}
      }
    } else {
      try {
        await LiveViewerBridge.instance.leave();
      } catch (_) {}
    }

    if (!mounted) return;
    context.router.maybePop();
  }

  @override
  void dispose() {
    _channel?.unsubscribe();
    _chatSub?.cancel();
    LiveChatBridge.instance.detach();
    // Best-effort viewer cleanup on route pop without pressing Leave
    // (e.g. Android system back). Host teardown is handled by the End
    // button and the GoLive handoff — never here.
    if (!_isHost && LiveViewerBridge.instance.isActive) {
      // Fire-and-forget; page is being disposed anyway.
      LiveViewerBridge.instance.leave();
    }
    super.dispose();
  }

  Future<void> _sendChat(String text) => LiveChatBridge.instance.sendMessage(text);

  void _snack(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(msg), duration: const Duration(seconds: 1)),
    );
  }

  // A4 — open viewers bottom sheet.
  void _openViewersSheet() {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => LiveViewersSheet(
        streamId: widget.streamId,
        viewerCount: _viewerCount,
      ),
    );
  }

  // A4 — follow/unfollow host from the header CTA.
  Future<void> _handleFollowHost() async {
    final hostId = _stream?['host_id']?.toString();
    if (hostId == null || _followBusy) return;
    if (_client.auth.currentUser == null) {
      _snack('Please sign in to follow');
      return;
    }
    setState(() => _followBusy = true);
    try {
      final now = await LiveFollowBridge.instance.toggle(hostId);
      if (!mounted) return;
      setState(() => _isFollowingHost = now);
      _snack(now ? 'Following ❤️' : 'Unfollowed');
    } catch (_) {
      _snack('Could not update follow');
    } finally {
      if (mounted) setState(() => _followBusy = false);
    }
  }

  void _openMoreSheet() {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xF01F2937),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (_) => LiveMoreSheet(isHost: _isHost, onSelect: _onMoreSelected),
    );
  }

  void _onMoreSelected(String id) {
    switch (id) {
      case 'like':
        _snack('❤️ Sent love');
        break;
      case 'share':
        _snack('Share sheet coming soon');
        break;
      case 'tasks':
        _snack('Tasks — opening');
        break;
      case 'topup':
        _snack('Top Up — opening');
        break;
      case 'music':
        _snack('Music player coming soon');
        break;
      case 'react':
        _snack('Reactions coming soon');
        break;
      case 'raisehand':
        _snack('Hand raised');
        break;
      case 'pk':
        _snack('PK Battle panel coming soon');
        break;
      case 'sticker':
        _snack('Stickers coming soon');
        break;
      case 'vbg':
        _snack('Virtual background coming soon');
        break;
      case 'noise':
        _snack('Noise cancellation coming soon');
        break;
      case 'raisedhands':
        _snack('Raised hands queue coming soon');
        break;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      resizeToAvoidBottomInset: true,
      body: Stack(
        fit: StackFit.expand,
        children: [
          // Transparent surface — native LiveKit SurfaceViewRenderer
          // (host preview or first remote track) sits behind Flutter.
          const SizedBox.expand(),

          if (_loading)
            const Center(
              child: CircularProgressIndicator(color: Colors.white),
            )
          else if (_error != null)
            _ErrorState(message: _error!, onClose: () => context.router.maybePop())
          else ...[
            _TopHeader(
              host: _host,
              viewerCount: _viewerCount,
              showFollow: !_isHost,
              isFollowing: _isFollowingHost,
              followBusy: _followBusy,
              onFollow: _handleFollowHost,
              onOpenViewers: _openViewersSheet,
              onClose: () => context.router.maybePop(),
            ),
            // A2 — gift ticker just below the top header.
            Positioned(
              top: MediaQuery.of(context).padding.top + 78,
              left: 12,
              right: 80,
              child: LiveGiftFeed(stream: LiveChatBridge.instance.gifts$),
            ),
            // A2 — chat overlay + composer, docked above the bottom bar.
            Positioned(
              left: 12,
              right: 12,
              bottom: MediaQuery.of(context).padding.bottom + 148,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  LiveChatOverlay(messages: _chatMessages),
                  const SizedBox(height: 8),
                  if (!_isHost) LiveChatComposer(onSend: _sendChat),
                ],
              ),
            ),
            // A3 — full action bar with host quick-actions.
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              child: LiveActionBar(
                isHost: _isHost,
                busy: _leaving,
                isMicMuted: _isMicMuted,
                isCamOff: _isCamOff,
                onGift: () => _snack('Gift panel coming soon'),
                onShare: () => _onMoreSelected('share'),
                onLike: () => _onMoreSelected('like'),
                onMore: _openMoreSheet,
                onEndOrLeave: _handleLeaveOrEnd,
                onToggleMic: () {
                  setState(() => _isMicMuted = !_isMicMuted);
                  _snack(_isMicMuted ? 'Mic muted' : 'Mic on');
                },
                onToggleCam: () {
                  setState(() => _isCamOff = !_isCamOff);
                  _snack(_isCamOff ? 'Camera off' : 'Camera on');
                },
                onFlipCam: () => _snack('Flip camera'),
                onBeauty: () => _snack('Beauty panel coming soon'),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _TopHeader extends StatelessWidget {
  const _TopHeader({
    required this.host,
    required this.viewerCount,
    required this.onClose,
  });

  final Map<String, dynamic>? host;
  final int viewerCount;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    final name = host?['name']?.toString() ?? 'Host';
    final avatar = host?['avatar_url']?.toString();
    final level = host?['host_level'] ?? host?['level'];

    return Positioned(
      top: 0,
      left: 0,
      right: 0,
      child: Container(
        padding: EdgeInsets.fromLTRB(
          12,
          MediaQuery.of(context).padding.top + 8,
          12,
          16,
        ),
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xB3000000), Color(0x00000000)],
          ),
        ),
        child: Row(
          children: [
            // Host chip
            Expanded(
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                decoration: BoxDecoration(
                  color: Colors.black.withOpacity(0.4),
                  borderRadius: BorderRadius.circular(24),
                ),
                child: Row(
                  children: [
                    CircleAvatar(
                      radius: 18,
                      backgroundColor: Colors.white24,
                      backgroundImage: (avatar != null && avatar.isNotEmpty)
                          ? NetworkImage(avatar)
                          : null,
                      child: (avatar == null || avatar.isEmpty)
                          ? const Icon(Icons.person,
                              size: 20, color: Colors.white70)
                          : null,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          Row(
                            children: [
                              Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 6, vertical: 1),
                                decoration: BoxDecoration(
                                  gradient: const LinearGradient(colors: [
                                    Color(0xFFEF4444),
                                    Color(0xFFEC4899),
                                  ]),
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: const Text(
                                  'LIVE',
                                  style: TextStyle(
                                    color: Colors.white,
                                    fontSize: 9,
                                    fontWeight: FontWeight.w800,
                                    letterSpacing: 0.6,
                                  ),
                                ),
                              ),
                              if (level != null) ...[
                                const SizedBox(width: 6),
                                Text(
                                  'Lv.$level',
                                  style: const TextStyle(
                                    color: Colors.white70,
                                    fontSize: 10,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ],
                            ],
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(width: 8),
            // Viewer count chip
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: Colors.black.withOpacity(0.5),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.visibility_rounded,
                      size: 14, color: Colors.white),
                  const SizedBox(width: 4),
                  Text(
                    _formatCount(viewerCount),
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 6),
            InkResponse(
              onTap: onClose,
              radius: 22,
              child: Container(
                padding: const EdgeInsets.all(6),
                decoration: BoxDecoration(
                  color: Colors.black.withOpacity(0.5),
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.close_rounded,
                    size: 18, color: Colors.white),
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _formatCount(int n) {
    if (n < 1000) return '$n';
    if (n < 1000000) return '${(n / 1000).toStringAsFixed(n % 1000 == 0 ? 0 : 1)}K';
    return '${(n / 1000000).toStringAsFixed(1)}M';
  }
}


class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message, required this.onClose});
  final String message;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline,
                color: Colors.white70, size: 48),
            const SizedBox(height: 12),
            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.white, fontSize: 14),
            ),
            const SizedBox(height: 16),
            TextButton(
              onPressed: onClose,
              child: const Text('Close',
                  style: TextStyle(color: Colors.white)),
            ),
          ],
        ),
      ),
    );
  }
}
