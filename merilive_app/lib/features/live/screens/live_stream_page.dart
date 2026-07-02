import 'dart:async';

import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';


import '../../../core/native/livekit_bridge.dart';
import '../services/audio_focus_auto_mute.dart';
import '../services/live_face_detection.dart';
import '../services/live_voice_monitor.dart';
import '../data/pk_opponent_room_bridge.dart';
import '../widgets/pk_punishment_overlay.dart';
import '../widgets/live_overlay_stack.dart';
import '../widgets/connection_quality_indicator.dart'
    show LiveConnectionQuality, ConnectionQualityIndicator;
import '../widgets/pk_battle_active.dart' show PKBattleActiveState;
import '../widgets/premium_flying_gift_banner.dart' show PremiumFlyingGift;
import '../widgets/premium_join_chat_overlay.dart' show PremiumJoinChatEntry;
import '../widgets/gift_combo_tracker.dart' show GiftComboTrackerEntry;
import '../../entry_effects/data/room_entry_dispatcher.dart';
import '../../entry_effects/data/room_join_events_bridge.dart';
import '../../entry_effects/widgets/bigo_join_banner_overlay.dart';
import '../../entry_effects/widgets/cinematic_join_banner_overlay.dart';
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
import '../widgets/live_gift_combo_bar.dart';
import '../widgets/flying_gift_capsule.dart';
import '../widgets/floating_reactions_overlay.dart';
import '../widgets/live_host_moderation_sheet.dart';

import '../widgets/live_multi_guest_sheet.dart';
import '../widgets/live_music_sheet.dart';
import '../widgets/live_noise_cancel_sheet.dart';
import '../widgets/live_pk_start_sheet.dart';
import '../widgets/live_report_block_sheet.dart';
import '../widgets/live_sticker_sheet.dart';
import '../widgets/live_viewers_sheet.dart';
import '../widgets/live_raise_hand_queue_sheet.dart';
import '../data/live_raise_hand_bridge.dart';
import '../data/live_stream_swipe_controller.dart';
import '../widgets/live_virtual_bg_sheet.dart';
import '../widgets/pk_battle_overlay.dart';
import '../widgets/reactions_picker_sheet.dart';
import '../data/live_reactions_bus.dart';
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
  StreamSubscription<RoomJoinEvent>? _joinSub;

  // R6a — challenger-side random-match search state (lifted from panel so
  // the search survives closing the sheet). Mirrors LiveStream.tsx.
  String? _randomPkSessionId;
  Timer? _randomPkTimeout;

  // Phase E — content safety + call-focus (host-only, mounted after
  // stream resolves so we know who the host is).
  LiveFaceDetection? _faceDetection;
  LiveVoiceMonitor? _voiceMonitor;
  AudioFocusAutoMute? _audioFocusMute;

  // Phase I11 — unified overlay controller (viewer count, HUD, gift combos,
  // premium banners, captions, audio unlock, top gifters, PK HUD).
  final LiveOverlayController _overlay = LiveOverlayController();
  // Phase I14 — session-scope running totals per gifter (host-side leaderboard).
  final Map<String, _GifterTotal> _gifterTotals = {};
  // Phase I15 — 1s ticker that polls native getStats() for connection
  // quality and re-emits PK remaining-seconds between realtime snapshots.
  Timer? _overlayTicker;

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
      _overlay.setViewerCount(_viewerCount);

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
      // G-25 — floating reactions bus (broadcast channel per stream).
      await LiveReactionsBus.instance.attach(widget.streamId);
      // Re-apply persisted noise cancellation from last session.
      await LiveNoiseCancelSheet.applyOnStart();
      final welcome = (host?['name']?.toString() ?? 'the host');
      LiveChatBridge.instance
          .pushSystemNotice('Welcome to $welcome\'s live room — be respectful ✨');

      // A6 — subscribe to server-authoritative PK battle state for this stream.
      _pkSub = PkBattleBridge.instance.watch(widget.streamId).listen((snap) {
        if (mounted) setState(() => _pkBattle = snap);
        // Phase I12 — surface PK HUD via unified overlay controller.
        _overlay.setPKState(_pkActiveStateFrom(snap));
        // Phase F-24 — cross-room opponent audio bridge. During an active
        // PK, subscribe (audio auto-plays); on end/idle, tear down.
        final isLive = snap != null &&
            (snap.status == 'active' || snap.status == 'punishment');
        PkOpponentRoomBridge.instance.connect(
          opponentStreamId: isLive ? _opponentStreamIdFor(snap!) : null,
          participantName: _client.auth.currentUser?.userMetadata?['name']
                  ?.toString() ??
              'viewer',
        );
      });

      // Phase I12/I16 — mirror room join events into the NEW overlay
      // controllers. Deduped against the legacy `RoomEntryDispatcher` fan-out
      // so nothing renders twice:
      //   • all joins → stacking join notifications (no legacy equivalent)
      //   • Lv10-39   → premium mid-tier chat strip (no legacy equivalent)
      //   • Lv40+     → SKIPPED here — `BigoJoinBannerOverlay` at line ~982
      //                 already consumes the same event via `BigoJoinQueue`.
      _joinSub = RoomJoinEventsBridge.instance.events$.listen((ev) {
        _overlay.joinNotifications.add(
          userId: ev.userId,
          userName: ev.userName,
          userLevel: ev.userLevel,
          userAvatar: ev.userAvatar,
        );
        if (ev.userLevel >= 10 && ev.userLevel < 40) {
          _overlay.premiumJoinChat.push(PremiumJoinChatEntry(
            id: '${ev.userId}_${DateTime.now().microsecondsSinceEpoch}',
            userName: ev.userName,
            level: ev.userLevel,
            avatarUrl: ev.userAvatar,
          ));
        }
      });

      // Phase I15 — start the overlay ticker (connection quality + PK clock).
      _startOverlayTicker();

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

      // H5 P0 #1 — viewer-only vertical-swipe attach (idempotent, shared
      // singleton). Skipped for the host since they cannot leave their own
      // broadcast by swiping.
      if (!_isHost) {
        // Fire-and-forget — never block the join path on the neighbours fetch.
        // ignore: discarded_futures
        LiveStreamSwipeController.instance.attach();
      }

      // Phase E — host-only content-safety + call-focus.
      if (_isHost) {
        final uid = _client.auth.currentUser?.id ?? '';
        _faceDetection = LiveFaceDetection(
          streamId: widget.streamId,
          hostId: uid,
          onAutoClose: () {
            if (!mounted) return;
            _handleLeaveOrEnd();
          },
        )..start();
        _voiceMonitor = LiveVoiceMonitor(
          streamId: widget.streamId,
          userId: uid,
        )..start();
        _audioFocusMute = AudioFocusAutoMute(
          isMicEnabled: () => !_isMicMuted,
          setMicEnabled: (on) async {
            if (!mounted) return;
            setState(() => _isMicMuted = !on);
            await LiveKitBridge.instance.setMicEnabled(on);
          },
        )..start();
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
            _overlay.setViewerCount(_viewerCount);
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
    _joinSub?.cancel();
    _randomPkTimeout?.cancel();
    _overlayTicker?.cancel();
    PkBattleBridge.instance.dispose();
    LiveChatBridge.instance.detach();
    LiveReactionsBus.instance.detach();
    NativeGiftBridge.instance.stopAll();
    RoomEntryDispatcher.instance.detach();
    _faceDetection?.dispose();
    PkOpponentRoomBridge.instance.disconnect();
    _voiceMonitor?.dispose();
    _audioFocusMute?.dispose();
    // Best-effort viewer cleanup on route pop without pressing Leave
    // (e.g. Android system back). Host teardown is handled by the End
    // button and the GoLive handoff — never here.
    if (!_isHost && LiveViewerBridge.instance.isActive) {
      // Fire-and-forget; page is being disposed anyway.
      LiveViewerBridge.instance.leave();
    }
    _overlay.dispose();
    super.dispose();
  }

  Future<void> _sendChat(String text) async {
    try {
      await LiveChatBridge.instance.sendMessage(text);
    } on ContactViolationException {
      // P0 #2 — host attempted to share contact info: server has already
      // logged the offence and deducted beans; surface the warning UI.
      if (!mounted) return;
      NumberSharingWarningDialog.showGeneric(context);
    } catch (_) {
      if (!mounted) return;
      _snack('Failed to send message');
    }
  }

  /// Which stream id represents "the opponent" from this tile's POV?
  /// If we're viewing/hosting the challenger side, opponent is the opponent's stream;
  /// otherwise it's the challenger's stream.
  String? _opponentStreamIdFor(PkBattleSnapshot snap) {
    final my = widget.streamId;
    if (snap.challengerStreamId == my) return snap.opponentStreamId;
    if (snap.opponentStreamId == my) return snap.challengerStreamId;
    return snap.opponentStreamId;
  }

  /// Phase I12 — map server PK snapshot → presentation state consumed by
  /// the unified overlay stack. From this tile's POV, "host" is the local
  /// stream's side (challenger if streamId matches, else opponent).
  PKBattleActiveState? _pkActiveStateFrom(PkBattleSnapshot? snap) {
    if (snap == null) return null;
    if (snap.status != 'active' && snap.status != 'punishment') return null;
    final localIsChallenger = snap.challengerStreamId == widget.streamId;
    final hostName =
        localIsChallenger ? snap.challengerName : snap.opponentName;
    final hostAvatar =
        localIsChallenger ? snap.challengerAvatar : snap.opponentAvatar;
    final hostScore =
        localIsChallenger ? snap.challengerScore : snap.opponentScore;
    final oppName =
        localIsChallenger ? snap.opponentName : snap.challengerName;
    final oppAvatar =
        localIsChallenger ? snap.opponentAvatar : snap.challengerAvatar;
    final oppScore =
        localIsChallenger ? snap.opponentScore : snap.challengerScore;
    int remaining = snap.durationSeconds;
    final started = snap.startedAt;
    if (started != null) {
      final elapsed = DateTime.now().difference(started).inSeconds;
      remaining = (snap.durationSeconds - elapsed).clamp(0, 1 << 30);
    }
    return PKBattleActiveState(
      hostName: hostName,
      hostAvatarUrl: hostAvatar.isNotEmpty ? hostAvatar : null,
      hostScore: hostScore,
      opponentName: oppName,
      opponentAvatarUrl: oppAvatar.isNotEmpty ? oppAvatar : null,
      opponentScore: oppScore,
      remainingSeconds: remaining,
      punishmentPhase: snap.status == 'punishment' || snap.inPunishment,
    );
  }

  /// Phase I15 — periodic HUD refresh:
  ///   • Every 2s, ask the native LiveKit plugin for a WebRTC stats
  ///     snapshot and translate `quality` into `LiveConnectionQuality`.
  ///   • Every 1s, recompute the PK HUD from the last snapshot so the
  ///     countdown ticks smoothly between realtime score updates.
  /// Safe on web/iOS/older APKs — `getStats()` no-ops with
  /// `success:false` and we leave the quality at `unknown`.
  void _startOverlayTicker() {
    _overlayTicker?.cancel();
    var statsTick = 0;
    _overlayTicker = Timer.periodic(const Duration(seconds: 1), (_) async {
      if (!mounted) return;
      // PK clock refresh — cheap, purely local.
      if (_pkBattle != null) {
        _overlay.setPKState(_pkActiveStateFrom(_pkBattle));
      }
      // Connection quality — every 2s to keep the RPC quiet.
      statsTick = (statsTick + 1) % 2;
      if (statsTick != 0) return;
      try {
        final res = await LiveKitBridge.instance.getStats();
        if (res['success'] == false) return;
        _overlay.setConnectionQuality(
          _mapConnectionQuality(res['quality']?.toString()),
        );
      } catch (_) {
        /* leave quality untouched */
      }
    });
  }

  LiveConnectionQuality _mapConnectionQuality(String? q) {
    switch (q) {
      case 'excellent':
        return LiveConnectionQuality.excellent;
      case 'good':
        return LiveConnectionQuality.good;
      case 'poor':
      case 'lost':
        return LiveConnectionQuality.poor;
      default:
        return LiveConnectionQuality.unknown;
    }
  }

  /// Phase I14 — accumulate per-sender coin totals for this session and
  /// push the top-5 into the overlay's `topGifters` list. Runs on every
  /// gift event (host + viewer tiles both see the same leaderboard).
  void _accrueTopGifter(LiveGiftEvent e) {
    final uid = e.senderId;
    if (uid == null || uid.isEmpty) return;
    final delta = e.perUnitCoins * e.quantity;
    if (delta <= 0) return;
    final existing = _gifterTotals[uid];
    _gifterTotals[uid] = _GifterTotal(
      userId: uid,
      name: e.senderName,
      avatarUrl: e.senderAvatar,
      totalCoins: (existing?.totalCoins ?? 0) + delta,
      lastAt: DateTime.now(),
    );
    final sorted = _gifterTotals.values.toList()
      ..sort((a, b) => b.totalCoins.compareTo(a.totalCoins));
    _overlay.setTopGifters(sorted
        .take(5)
        .map((g) => GiftComboTrackerEntry(
              userId: g.userId,
              name: g.name,
              avatarUrl: g.avatarUrl,
              totalCoins: g.totalCoins,
              lastAt: g.lastAt,
            ))
        .toList());
  }

  /// A5 — Enqueue full-screen animation for premium gifts. Native VAP
  /// renderer is tried first (Pkg438 plugin on Android); when the
  /// channel is missing or fails, the Flutter `FullScreenGiftQueue`
  /// takes over so Flutter surfaces never render nothing.
  Future<void> _onGiftEvent(LiveGiftEvent e) async {
    // Phase I12 — every gift feeds the overlay combo tracker + premium
    // flying banner. Runs regardless of full-screen threshold.
    _overlay.giftCombos.increment(
      senderId: e.senderId ?? 'anon',
      giftId: e.giftId ?? e.giftName,
      senderName: e.senderName,
      senderAvatarUrl: e.senderAvatar,
      giftName: e.giftName,
      giftImageUrl: e.giftIcon,
      by: e.quantity,
    );
    if (e.perUnitCoins >= 100) {
      _overlay.premiumFlyingGifts.push(PremiumFlyingGift(
        senderName: e.senderName,
        senderAvatarUrl: e.senderAvatar,
        giftName: e.giftName,
        giftImageUrl: e.giftIcon,
        giftValue: e.perUnitCoins,
        count: e.quantity,
      ));
    }
    // Phase I14 — session leaderboard (host tile shows top 5 gifters).
    _accrueTopGifter(e);

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
        _shareStream();
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
        _openExternal('https://merilive.top/tasks');
        break;
      case 'topup':
        _openExternal('https://merilive.top/topup');
        break;
      case 'music':
        LiveMusicSheet.show(context);
        break;
      case 'react':
        ReactionsPickerSheet.show(context);
        break;
      case 'pk':
        _openPkStartSheet();
        break;
      case 'moderate_all':
        if (_isHost) {
          LiveHostModerationSheet.show(
            context,
            roomName: 'live_${widget.streamId}',
            identity: _client.auth.currentUser?.id ?? '',
            displayName: 'Room',
          );
        }
        break;
      case 'sticker':
        LiveStickerSheet.show(
          context,
          activeStickerId: null,
          onChanged: (_) {},
        );
        break;
      case 'vbg':
        LiveVirtualBgSheet.show(context);
        break;
      case 'noise':
        LiveNoiseCancelSheet.show(context);
        break;
      case 'raise_hand':
        _toggleRaiseHand();
        break;
      case 'raise_queue':
        if (_isHost) {
          LiveRaiseHandQueueSheet.show(context, widget.streamId);
        }
        break;
    }
  }

  Future<void> _toggleRaiseHand() async {
    final b = LiveRaiseHandBridge.instance;
    final raised = await b.isRaised(streamId: widget.streamId);
    final ok = raised
        ? await b.lower(streamId: widget.streamId)
        : await b.raise(streamId: widget.streamId);
    if (!mounted) return;
    if (ok) _snack(raised ? 'Hand lowered' : '✋ Hand raised');
  }

  Future<void> _shareStream() async {
    final hostName =
        _host?['name']?.toString() ?? _host?['display_name']?.toString();
    final title = hostName != null
        ? '$hostName is live on MeriLive 🎥'
        : 'Live on MeriLive 🎥';
    final url = 'https://merilive.top/live-feed/${widget.streamId}';
    try {
      await Share.share('$title\n$url', subject: title);
    } catch (_) {
      if (mounted) _snack('Could not open share sheet');
    }
  }

  Future<void> _openExternal(String url) async {
    final uri = Uri.tryParse(url);
    if (uri == null) return;
    try {
      final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (!ok && mounted) _snack('Could not open link');
    } catch (_) {
      if (mounted) _snack('Could not open link');
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

  // Host-side PK Battle start sheet (parity with web PKBattlePanel).
  Future<void> _openPkStartSheet() async {
    if (!_isHost) {
      _snack('Only the host can start a PK Battle');
      return;
    }
    final me = _client.auth.currentUser;
    if (me == null) return;
    final name = (_host?['name']?.toString() ??
            _host?['display_name']?.toString() ??
            me.userMetadata?['name']?.toString() ??
            'Host');
    final avatar = _host?['avatar_url']?.toString() ?? '';
    final level = ((_host?['host_level'] ?? _host?['level']) as num?)?.toInt() ?? 1;
    await LivePkStartSheet.show(
      context,
      currentStreamId: widget.streamId,
      currentUserId: me.id,
      currentUserName: name,
      currentUserAvatar: avatar,
      currentUserLevel: level,
      isRandomSearching: _randomPkSessionId != null,
      onStartRandomMatch: (durationSeconds) => _startRandomPkSearch(
        duration: durationSeconds,
        name: name,
        avatar: avatar,
        level: level,
      ),
    );
  }

  Future<void> _startRandomPkSearch({
    required int duration,
    required String name,
    required String avatar,
    required int level,
  }) async {
    if (_randomPkSessionId != null) return;
    final me = _client.auth.currentUser;
    if (me == null) return;
    final res = await PkStartBridge.instance.startRandomMatch(
      challengerUserId: me.id,
      challengerName: name,
      challengerAvatar: avatar,
      challengerLevel: level,
      challengerStreamId: widget.streamId,
      durationSeconds: duration,
    );
    if (!mounted) return;
    if (!res.ok) {
      _snack(res.error ?? 'No eligible live hosts available right now');
      return;
    }
    setState(() => _randomPkSessionId = res.sessionId);
    _snack('Random PK request sent to ${res.delivered} host${(res.delivered ?? 0) > 1 ? 's' : ''}');
    _randomPkTimeout?.cancel();
    _randomPkTimeout = Timer(const Duration(seconds: 25), () {
      final sid = _randomPkSessionId;
      if (sid == null || !mounted) return;
      PkStartBridge.instance.cancelRandomMatch(
        challengerUserId: me.id,
        challengerName: name,
        inviteSessionId: sid,
      );
      setState(() => _randomPkSessionId = null);
      _snack('No host accepted — try again');
    });
  }

  // ── H5 P0 #1 — TikTok-style vertical swipe between live streams ────
  //
  // Web-truth: `src/hooks/useLiveStreamSwipe.ts` (80 px min, 300 ms fast
  // window, 150 px slow-swipe fallback, `navigate(..., { replace: true })`).
  // Hosts are excluded — they cannot swipe away from their own broadcast.
  // While a sheet or gift/entry animation is capturing gestures the
  // GestureDetector's `HitTestBehavior.translucent` still lets the child
  // widgets win via their own recognizers (Sheets/InkResponses).
  bool _swipeNavigating = false;
  double _swipeAccumDy = 0; // + = swiped UP overall
  int _swipeStartMs = 0;

  Widget _wrapWithSwipe(Widget child) {
    if (_isHost) return child;
    return GestureDetector(
      behavior: HitTestBehavior.translucent,
      onVerticalDragStart: (_) {
        _swipeAccumDy = 0;
        _swipeStartMs = DateTime.now().millisecondsSinceEpoch;
      },
      onVerticalDragUpdate: (d) {
        // primaryDelta is +ve when finger moves DOWN in Flutter's coord
        // system. We want +ve to mean "swipe UP" (matching web `deltaY`
        // sign convention), so subtract.
        _swipeAccumDy -= d.primaryDelta ?? 0;
      },
      onVerticalDragEnd: (d) {
        final dy = _swipeAccumDy;
        final dt = DateTime.now().millisecondsSinceEpoch - _swipeStartMs;
        const minDist = 80.0;
        const maxFastMs = 300;
        if (dy.abs() < minDist) return;
        if (dt > maxFastMs && dy.abs() < 150) return;
        if (dy > 0) {
          _swipeToNeighbour(next: true);
        } else {
          _swipeToNeighbour(next: false);
        }
      },
      child: child,
    );
  }


  Future<void> _swipeToNeighbour({required bool next}) async {
    if (_swipeNavigating) return;
    final ctrl = LiveStreamSwipeController.instance;
    final targetId =
        next ? ctrl.next(widget.streamId) : ctrl.prev(widget.streamId);
    if (targetId == null) {
      _snack(next ? 'You\'re at the last live stream' : 'You\'re at the top');
      return;
    }
    _swipeNavigating = true;
    try {
      // Replace so the browser/back-stack behaves like a feed swipe, not a
      // deep push. `replaceNamed` is available on both AutoRoute stacks and
      // maps to `context.router.replace(...)` internally.
      await context.router.replaceNamed('/live/$targetId');
    } catch (_) {
      _swipeNavigating = false;
    }
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
      body: GlobalGiftOverlay(child: _wrapWithSwipe(Stack(
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
                  // Phase I18 — surface real-time connection quality inside
                  // the canonical header (RoomTopBar) so we don't lose the
                  // signal indicator after Phase I17 hid the overlay chip.
                  trailing: AnimatedBuilder(
                    animation: _overlay,
                    builder: (_, __) => Padding(
                      padding: const EdgeInsets.only(right: 4),
                      child: ConnectionQualityIndicator(
                        quality: _overlay.connectionQuality,
                      ),
                    ),
                  ),
                ),
              ),
            ),
            // B3 — Host earnings / room-coin chip (top-left below header).
            Positioned(
              top: MediaQuery.of(context).padding.top + 74,
              left: 12,
              child: _CoinChip(
                coins: (_stream?['total_coins'] as num?)?.toInt() ??
                    (_stream?['coin_count'] as num?)?.toInt() ??
                    0,
              ),
            ),
            // A2 + B5 — Flying gift capsule stack (top-left below coin chip).
            // Bigo/Chamet-style tier-gradient capsule stack (≤3 visible,
            // 44px offset, count-up on combo merge, 3.5s dismiss window).
            Positioned(
              top: MediaQuery.of(context).padding.top + 112,
              left: 12,
              right: 80,
              child: FlyingGiftCapsuleStack(stream: LiveChatBridge.instance.gifts$),
            ),

            // A11 — Flying entry name-bar overlay (Flutter fallback when
            // NativeEntryAnimationPlugin is unavailable).
            const EntryNameBarOverlay(),
            // B7 — Cinematic full-width join banner for premium joins
            // when the native VAP path isn't available.
            const CinematicJoinBannerOverlay(),
            // B6 — Bigo compact join banner (non-premium joins,
            // one-at-a-time, 500 ms welcome coalescer).
            const BigoJoinBannerOverlay(),
            // M9 — Self level-up confetti + Lv chip celebration.
            const LevelUpCelebrationOverlay(),
            // G-25 — Floating emoji reactions column (pointer-events-none).
            const Positioned.fill(child: FloatingReactionsOverlay()),

            // B4 — Right-anchored combo bar (real-time xN stacker).
            Positioned(
              right: 10,
              bottom: MediaQuery.of(context).padding.bottom + 210,
              child: LiveGiftComboBar(stream: LiveChatBridge.instance.gifts$),
            ),

            // A2 — chat overlay + composer, docked above the bottom bar.
            // B1 — Chat composer is available to the host too now; the
            // web version lets hosts chat with viewers in-room.
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
                  LiveChatComposer(onSend: _sendChat),
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

            // F-23 — Server-anchored PK Punishment overlay for the loser tile.
            if (_pkBattle != null && _pkBattle!.punishmentEndTs != null)
              Positioned.fill(
                child: PkPunishmentOverlay(
                  battleId: _pkBattle!.battleId,
                  currentUserId: _client.auth.currentUser?.id ?? '',
                  winnerUserId: _pkBattle!.winnerUserId,
                  finalStatus: _pkBattle!.finalStatus,
                  punishmentEndTs: _pkBattle!.punishmentEndTs,
                  onComplete: () {
                    if (mounted) setState(() => _pkBattle = null);
                  },
                ),
              ),
            // Phase I11 — unified overlay layer. Additive; contributes viewer
            // count HUD, gift combos, premium flying gift banners, premium
            // join-chat mid-tier, top gifters column, captions, audio unlock,
            // and PK HUD. Sits above chat + below action bar / modals.
            Positioned.fill(
              child: IgnorePointer(
                ignoring: !_overlay.audioUnlockNeeded,
                child: LiveOverlayStack(
                  controller: _overlay,
                  showTopCountChip: false,
                ),
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
                onGift: _openGiftPanel,
                onShare: () => _onMoreSelected('share'),
                onLike: () => _onMoreSelected('like'),
                onMore: _openMoreSheet,
                onEndOrLeave: _handleLeaveOrEnd,
                onToggleMic: () {
                  final next = !_isMicMuted;
                  setState(() => _isMicMuted = next);
                  LiveKitBridge.instance.setMicEnabled(!next);
                  _voiceMonitor?.micEnabled = !next;
                  _audioFocusMute?.noteManualMicChange();
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
      ))),
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

/// B3 — Compact host-earnings chip. Reads `total_coins` off the live_streams
/// row (which is kept fresh by realtime updates), formats compactly and
/// animates on value change so a big gift feels earned.
class _CoinChip extends StatelessWidget {
  const _CoinChip({required this.coins});
  final int coins;

  String _fmt(int n) {
    if (n < 1000) return '$n';
    if (n < 1000000) {
      return '${(n / 1000).toStringAsFixed(n % 1000 == 0 ? 0 : 1)}K';
    }
    return '${(n / 1000000).toStringAsFixed(1)}M';
  }

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      key: ValueKey(coins),
      tween: Tween(begin: 0.92, end: 1.0),
      duration: const Duration(milliseconds: 260),
      curve: Curves.easeOutBack,
      builder: (context, scale, child) =>
          Transform.scale(scale: scale, child: child),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          gradient: const LinearGradient(colors: [
            Color(0xCC0F172A),
            Color(0xCC1F2937),
          ]),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: const Color(0x66F59E0B), width: 1),
          boxShadow: const [
            BoxShadow(
              color: Color(0x33F59E0B),
              blurRadius: 10,
              offset: Offset(0, 2),
            ),
          ],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.monetization_on_rounded,
                size: 14, color: Color(0xFFFBBF24)),
            const SizedBox(width: 4),
            Text(
              _fmt(coins),
              style: const TextStyle(
                color: Colors.white,
                fontSize: 12,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.2,
              ),
            ),
          ],
        ),
      ),
    );
  }
}



/// Phase I14 — internal record for per-sender session totals feeding
/// `LiveOverlayController.topGifters`. Not exported — the overlay consumes
/// `GiftComboTrackerEntry` directly.
class _GifterTotal {
  final String userId;
  final String name;
  final String? avatarUrl;
  final int totalCoins;
  final DateTime lastAt;
  const _GifterTotal({
    required this.userId,
    required this.name,
    required this.totalCoins,
    required this.lastAt,
    this.avatarUrl,
  });
}
