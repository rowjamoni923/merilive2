import 'dart:async';

import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/native/livekit_bridge.dart';
import '../../entry_effects/data/room_entry_dispatcher.dart';
import '../../entry_effects/data/room_join_events_bridge.dart';
import '../../entry_effects/widgets/entry_name_bar_overlay.dart';
import '../../entry_effects/widgets/level_up_celebration_overlay.dart';

import '../../gifting/data/gift_animation_config.dart';
import '../../gifting/data/native_gift_bridge.dart';
import '../../gifting/widgets/full_screen_gift_overlay.dart';
import '../../gifting/widgets/unified_gift_sheet.dart';
import '../data/live_chat_bridge.dart';
import '../data/live_follow_bridge.dart';
import '../data/live_host_bridge.dart';
import '../data/live_viewer_bridge.dart';
import '../data/pk_battle_bridge.dart';
import '../data/pk_start_bridge.dart';
import '../widgets/live_action_bar.dart';
import '../widgets/live_beauty_panel.dart';
import '../widgets/live_chat_composer.dart';
import '../widgets/live_chat_overlay.dart';
import '../widgets/live_game_overlay.dart';
import '../widgets/live_gift_feed.dart';
import '../widgets/live_host_moderation_sheet.dart';
import '../widgets/live_multi_guest_sheet.dart';
import '../widgets/live_pk_start_sheet.dart';
import '../widgets/live_report_block_sheet.dart';
import '../widgets/live_viewers_sheet.dart';
import '../widgets/pk_battle_overlay.dart';
import '../../party/widgets/party_game_selection_sheet.dart';
import '../../../shared/widgets/room_top_bar.dart';

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
  StreamSubscription<LiveGiftEvent>? _giftSub;

  // A3 — host quick-action state (mirrors LiveHostBridge; native side is
  // the source of truth, this is UI-only until the native toggle lands).
  bool _isMicMuted = false;
  bool _isCamOff = false;

  // A4 — follow-from-header state.
  bool _isFollowingHost = false;
  bool _followBusy = false;

  // A6 — PK Battle overlay state.
  PkBattleSnapshot? _pkBattle;
  StreamSubscription<PkBattleSnapshot?>? _pkSub;

  // R6a — challenger-side random-match search state (lifted from panel so
  // the search survives closing the sheet). Mirrors LiveStream.tsx.
  String? _randomPkSessionId;
  Timer? _randomPkTimeout;

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
      // A5 — realtime gift stream drives full-screen animations for
      // every viewer + host, native-first with Flutter overlay fallback.
      _giftSub = LiveChatBridge.instance.gifts$.listen(_onGiftEvent);
      _chatMessages = LiveChatBridge.instance.snapshot;
      final welcome = (host?['name']?.toString() ?? 'the host');
      LiveChatBridge.instance
          .pushSystemNotice('Welcome to $welcome\'s live room — be respectful ✨');

      // A6 — subscribe to server-authoritative PK battle state for this stream.
      _pkSub = PkBattleBridge.instance.watch(widget.streamId).listen((snap) {
        if (mounted) setState(() => _pkBattle = snap);
      });

      // A11 — Level-up entry animations: bind join events to native
      // VAP/Lottie renderer with Flutter EntryNameBarOverlay fallback.
      await RoomEntryDispatcher.instance.attach(
        surface: RoomJoinSurface.live,
        roomId: widget.streamId,
        selfUserId: _client.auth.currentUser?.id,
      );

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
    _giftSub?.cancel();
    _pkSub?.cancel();
    PkBattleBridge.instance.dispose();
    LiveChatBridge.instance.detach();
    NativeGiftBridge.instance.stopAll();
    RoomEntryDispatcher.instance.detach();
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

  /// A5 — Enqueue full-screen animation for premium gifts. Native VAP
  /// renderer is tried first (Pkg438 plugin on Android); when the
  /// channel is missing or fails, the Flutter `FullScreenGiftQueue`
  /// takes over so Flutter surfaces never render nothing.
  Future<void> _onGiftEvent(LiveGiftEvent e) async {
    if (!GiftAnimationConfig.instance.shouldPlayFullScreen(e.perUnitCoins)) {
      return;
    }
    final receiverLabel =
        (_host?['name']?.toString() ?? _host?['display_name']?.toString()) ??
            'Host';
    final payload = {
      'id': e.id,
      'kind': (e.animationType ?? '').toLowerCase().isNotEmpty
          ? e.animationType!.toLowerCase()
          : 'image',
      'url': e.animationUrl ?? e.giftIcon ?? '',
      'fallbackImage': e.giftIcon ?? '',
      'durationMs': 3500,
      'priority': e.perUnitCoins,
      'senderName': e.senderName,
      'receiverName': receiverLabel,
      'giftName': e.giftName,
      'quantity': e.quantity,
      'coinValue': e.perUnitCoins,
      'surface': 'live',
    };
    final acceptedByNative = await NativeGiftBridge.instance.dispatch(payload);
    if (acceptedByNative) return;

    FullScreenGiftQueue.instance.enqueue(FullScreenGiftPayload(
      id: e.id,
      giftName: e.giftName,
      senderName: e.senderName,
      receiverName: receiverLabel,
      quantity: e.quantity,
      imageUrl: e.giftIcon,
      animationUrl: e.animationUrl,
      animationType: e.animationType,
    ));
  }

  void _openGiftPanel() {
    final hostId = _stream?['host_id']?.toString();
    if (hostId == null) {
      _snack('Host unavailable');
      return;
    }
    if (_isHost) {
      _snack("You can't send gifts to yourself");
      return;
    }
    showUnifiedGiftSheet(
      context,
      surface: GiftSurface.live,
      contextId: widget.streamId,
      recipients: [
        GiftRecipient(
          id: hostId,
          label: (_host?['name']?.toString() ??
              _host?['display_name']?.toString() ??
              'Host'),
          avatarUrl: _host?['avatar_url']?.toString(),
          badge: 'Host',
        ),
      ],
      initialRecipientId: hostId,
    );
  }

  void _snack(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(msg), duration: const Duration(seconds: 1)),
    );
  }

  // A4 — open viewers bottom sheet. Host gets long-press → moderation.
  void _openViewersSheet() {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => LiveViewersSheet(
        streamId: widget.streamId,
        viewerCount: _viewerCount,
        onModerate: _isHost ? _openModerationForViewer : null,
      ),
    );
  }

  void _openModerationForViewer(String viewerId, String viewerName) {
    LiveHostModerationSheet.show(
      context,
      roomName: 'live_${widget.streamId}',
      identity: viewerId,
      displayName: viewerName,
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
      case 'games':
        _openGamesSheet();
        break;
      case 'multiguest':
        LiveMultiGuestSheet.show(
          context,
          streamId: widget.streamId,
          isHost: _isHost,
        );
        break;
      case 'report':
        final hostId = _stream?['host_id']?.toString();
        if (hostId == null) return;
        LiveReportBlockSheet.show(
          context,
          targetUserId: hostId,
          targetName:
              _host?['name']?.toString() ?? 'Host',
          streamId: widget.streamId,
        );
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
    }
  }

  Future<void> _openGamesSheet() async {
    final picked = await PartyGameSelectionSheet.show(context);
    if (picked == null || !mounted) return;
    await Navigator.of(context).push(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) => LiveGameOverlay(
          streamId: widget.streamId,
          game: picked,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      resizeToAvoidBottomInset: true,
      // A5 — GlobalGiftOverlay wraps the whole surface so premium
      // gifts render above chat, action bar, sheets and the LiveKit
      // renderer. Native VAP (Pkg438) runs above WebView on Android;
      // this Flutter overlay is the fallback + Flutter-only surfaces.
      body: GlobalGiftOverlay(child: Stack(
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
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              child: Container(
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [Color(0xB3000000), Color(0x00000000)],
                  ),
                ),
                padding: const EdgeInsets.only(bottom: 12),
                child: RoomTopBar(
                  hostAvatarUrl: _host?['avatar_url']?.toString(),
                  hostName: _host?['name']?.toString() ?? 'Host',
                  subtitle: 'LIVE',
                  hostLevel: (_host?['host_level'] ?? _host?['level']) as int?,
                  isFollowing: _isFollowingHost,
                  showFollow: !_isHost,
                  onFollow: _followBusy ? null : _handleFollowHost,
                  viewerCount: _viewerCount,
                  onOpenViewers: _openViewersSheet,
                  onClose: () => context.router.maybePop(),
                ),
              ),
            ),
            // A2 — gift ticker just below the top header.
            Positioned(
              top: MediaQuery.of(context).padding.top + 78,
              left: 12,
              right: 80,
              child: LiveGiftFeed(stream: LiveChatBridge.instance.gifts$),
            ),
            // A11 — Flying entry name-bar overlay (Flutter fallback when
            // NativeEntryAnimationPlugin is unavailable).
            const EntryNameBarOverlay(),
            // M9 — Self level-up confetti + Lv chip celebration.
            const LevelUpCelebrationOverlay(),

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
            // A6 — PK Battle scoreboard + punishment overlay (server-authoritative).
            if (_pkBattle != null)
              PkBattleOverlay(
                snapshot: _pkBattle!,
                currentUserId: _client.auth.currentUser?.id,
                currentStreamId: widget.streamId,
                onEnded: () {
                  if (mounted) setState(() => _pkBattle = null);
                },
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
                onGift: _openGiftPanel,
                onShare: () => _onMoreSelected('share'),
                onLike: () => _onMoreSelected('like'),
                onMore: _openMoreSheet,
                onEndOrLeave: _handleLeaveOrEnd,
                onToggleMic: () {
                  final next = !_isMicMuted;
                  setState(() => _isMicMuted = next);
                  LiveKitBridge.instance.setMicEnabled(!next);
                  _snack(next ? 'Mic muted' : 'Mic on');
                },
                onToggleCam: () {
                  final next = !_isCamOff;
                  setState(() => _isCamOff = next);
                  LiveKitBridge.instance.setVideoVisible(!next);
                  _snack(next ? 'Camera off' : 'Camera on');
                },
                onFlipCam: () {
                  LiveKitBridge.instance.switchCamera();
                  _snack('Camera flipped');
                },
                onBeauty: () => LiveBeautyPanel.show(context),
              ),
            ),
          ],
        ],
      )),
    );
  }
}

class _TopHeader extends StatelessWidget {
  const _TopHeader({
    required this.host,
    required this.viewerCount,
    required this.onClose,
    required this.onOpenViewers,
    required this.showFollow,
    required this.isFollowing,
    required this.followBusy,
    required this.onFollow,
  });

  final Map<String, dynamic>? host;
  final int viewerCount;
  final VoidCallback onClose;
  final VoidCallback onOpenViewers;
  final bool showFollow;
  final bool isFollowing;
  final bool followBusy;
  final VoidCallback onFollow;

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
                    if (showFollow) ...[
                      const SizedBox(width: 8),
                      _FollowPill(
                        isFollowing: isFollowing,
                        busy: followBusy,
                        onTap: onFollow,
                      ),
                    ],
                  ],
                ),
              ),
            ),
            const SizedBox(width: 8),
            // Viewer count chip — tap opens the viewer list sheet.
            InkResponse(
              onTap: onOpenViewers,
              radius: 24,
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
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

/// A4 — Compact Follow / Following pill for the top header.
class _FollowPill extends StatelessWidget {
  const _FollowPill({
    required this.isFollowing,
    required this.busy,
    required this.onTap,
  });

  final bool isFollowing;
  final bool busy;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final gradient = isFollowing
        ? const [Color(0x33FFFFFF), Color(0x22FFFFFF)]
        : const [Color(0xFFEC4899), Color(0xFFA855F7)];
    return InkResponse(
      onTap: busy ? null : onTap,
      radius: 26,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          gradient: LinearGradient(colors: gradient),
          borderRadius: BorderRadius.circular(999),
          boxShadow: isFollowing
              ? const []
              : const [
                  BoxShadow(
                    color: Color(0x66EC4899),
                    blurRadius: 8,
                    offset: Offset(0, 2),
                  ),
                ],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (busy)
              const SizedBox(
                width: 10,
                height: 10,
                child: CircularProgressIndicator(
                  strokeWidth: 1.6,
                  valueColor:
                      AlwaysStoppedAnimation<Color>(Colors.white),
                ),
              )
            else
              Icon(
                isFollowing
                    ? Icons.check_rounded
                    : Icons.add_rounded,
                size: 12,
                color: Colors.white,
              ),
            const SizedBox(width: 3),
            Text(
              isFollowing ? 'Following' : 'Follow',
              style: const TextStyle(
                color: Colors.white,
                fontSize: 10,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

