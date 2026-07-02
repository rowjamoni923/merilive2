import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../data/private_call_bridge.dart';
import '../widgets/call_quality_hud.dart';
import '../../../shared/widgets/room_top_bar.dart';
import '../../../shared/widgets/room_bottom_bar.dart';

/// C8 + C9 — Flutter Active Call surface (Chamet/Olamet-style 1-on-1).
///
/// Native LiveKit `SurfaceViewRenderer` sits BEHIND Flutter's transparent
/// scaffold; only the HUD is drawn by Flutter. Pushed via `Navigator.push`
/// (no auto_route regen required).
///
/// C9 adds:
///   • Realtime chat overlay bound to `call_chat_messages` filtered by
///     `call_id` — matches web `usePrivateCallChat` insert schema.
///   • Reconnect banner driven by `private_calls.status` transitions
///     (`reconnecting` → dimmed banner, `ended` → auto-close).
///   • Mic mute + camera flip + beauty toggle wired to the native plugin.
///   • Gift shortcut (opens quick-gift sheet — server-authoritative
///     `send_gift` RPC handled in `pkg gifts` layer, screen only launches).
///   • Rating sheet on end for random-match sessions →
///     `random_call_ratings` insert + `random-call-settle` edge fn.
class ActiveCallPage extends StatefulWidget {
  const ActiveCallPage({
    super.key,
    required this.bridge,
    required this.hostName,
    required this.hostId,
    this.hostAvatarUrl,
    this.matchSessionId,
  });

  final PrivateCallBridge bridge;
  final String hostName;
  final String hostId;
  final String? hostAvatarUrl;
  final String? matchSessionId;

  @override
  State<ActiveCallPage> createState() => _ActiveCallPageState();
}

class _ActiveCallPageState extends State<ActiveCallPage> {
  final _supabase = Supabase.instance.client;
  final _stopwatch = Stopwatch()..start();
  final _chatCtrl = TextEditingController();
  final _chatScroll = ScrollController();

  Timer? _tick;
  bool _muted = false;
  bool _beauty = true;
  bool _reconnecting = false;
  Duration _elapsed = Duration.zero;

  // M7 — billing HUD state (populated from `private_calls` UPDATE payloads
  // emitted after every `bill_call_minute` tick — no polling).
  int? _lastBilledMinute;
  int? _viewerRatePerMin;
  int? _remainingMinutes;

  RealtimeChannel? _chatChannel;
  RealtimeChannel? _statusChannel;
  final List<_ChatMsg> _messages = [];

  @override
  void initState() {
    super.initState();
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() => _elapsed = _stopwatch.elapsed);
    });
    // Beauty ON by default to match web `usePrivateCall.ts` prejoin.
    widget.bridge.setBeauty(true);
    _subscribeChat();
    _subscribeStatus();
  }

  @override
  void dispose() {
    _tick?.cancel();
    _stopwatch.stop();
    _chatCtrl.dispose();
    _chatScroll.dispose();
    if (_chatChannel != null) _supabase.removeChannel(_chatChannel!);
    if (_statusChannel != null) _supabase.removeChannel(_statusChannel!);
    super.dispose();
  }

  // ── Realtime ──────────────────────────────────────────────────────────

  void _subscribeChat() {
    final cid = widget.bridge.callId;
    if (cid == null) return;
    _chatChannel = _supabase
        .channel('call_chat_$cid')
        .onPostgresChanges(
          event: PostgresChangeEvent.insert,
          schema: 'public',
          table: 'call_chat_messages',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'call_id',
            value: cid,
          ),
          callback: (payload) {
            final row = payload.newRecord;
            if (!mounted) return;
            setState(() {
              _messages.add(_ChatMsg(
                id: row['id'] as String? ?? '',
                senderId: row['sender_id'] as String? ?? '',
                text: (row['message'] ?? row['content'] ?? '') as String,
              ));
            });
            _scrollChatToEnd();
          },
        )
        .subscribe();
  }

  void _subscribeStatus() {
    final cid = widget.bridge.callId;
    if (cid == null) return;
    _statusChannel = _supabase
        .channel('call_status_$cid')
        .onPostgresChanges(
          event: PostgresChangeEvent.update,
          schema: 'public',
          table: 'private_calls',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'id',
            value: cid,
          ),
          callback: (payload) {
            final status = payload.newRecord['status'] as String?;
            if (!mounted) return;
            if (status == 'ended' || status == 'cancelled') {
              _closeWithSettle(reason: 'peer_ended', showRating: true);
            } else {
              setState(() => _reconnecting = status == 'reconnecting');
            }
          },
        )
        .subscribe();
  }

  void _scrollChatToEnd() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_chatScroll.hasClients) return;
      _chatScroll.animateTo(
        _chatScroll.position.maxScrollExtent,
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeOut,
      );
    });
  }

  // ── Actions ───────────────────────────────────────────────────────────

  Future<void> _sendChat() async {
    final text = _chatCtrl.text.trim();
    final cid = widget.bridge.callId;
    final uid = _supabase.auth.currentUser?.id;
    if (text.isEmpty || cid == null || uid == null) return;
    _chatCtrl.clear();
    try {
      await _supabase.from('call_chat_messages').insert({
        'call_id': cid,
        'sender_id': uid,
        'message': text,
      });
    } catch (_) {}
  }

  Future<void> _toggleMute() async {
    HapticFeedback.selectionClick();
    setState(() => _muted = !_muted);
    await widget.bridge.setMuted(_muted);
  }

  Future<void> _flipCamera() async {
    HapticFeedback.selectionClick();
    await widget.bridge.flipCamera();
  }

  Future<void> _toggleBeauty() async {
    HapticFeedback.selectionClick();
    setState(() => _beauty = !_beauty);
    await widget.bridge.setBeauty(_beauty);
  }

  Future<void> _openGiftSheet() async {
    HapticFeedback.mediumImpact();
    // Placeholder — the shared native gift sheet ships in the Gifts sector.
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF0B1220),
      builder: (_) => const _GiftSheetPlaceholder(),
    );
  }

  Future<void> _hangUp() async {
    HapticFeedback.mediumImpact();
    await _closeWithSettle(reason: 'caller_hangup', showRating: true);
  }

  Future<void> _closeWithSettle({
    required String reason,
    required bool showRating,
  }) async {
    final duration = _stopwatch.elapsed.inSeconds;
    await widget.bridge.hangUp(reason: reason);
    if (widget.matchSessionId != null) {
      try {
        await _supabase.functions.invoke('random-call-settle', body: {
          'session_id': widget.matchSessionId,
          'duration_seconds': duration,
          'ended_by': reason == 'caller_hangup' ? 'caller' : 'peer',
        });
      } catch (_) {}
    }
    if (!mounted) return;
    if (showRating && widget.matchSessionId != null) {
      await _showRatingSheet();
    }
    if (!mounted) return;
    Navigator.of(context).maybePop();
  }

  Future<void> _showRatingSheet() async {
    int stars = 5;
    final comment = TextEditingController();
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF0B1220),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocal) => Padding(
          padding: EdgeInsets.only(
            left: 20,
            right: 20,
            top: 20,
            bottom: MediaQuery.of(ctx).viewInsets.bottom + 20,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text(
                'Rate your call',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 14),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(5, (i) {
                  final active = i < stars;
                  return IconButton(
                    onPressed: () => setLocal(() => stars = i + 1),
                    icon: Icon(
                      active ? Icons.star_rounded : Icons.star_outline_rounded,
                      color: active ? const Color(0xFFFBBF24) : Colors.white38,
                      size: 34,
                    ),
                  );
                }),
              ),
              TextField(
                controller: comment,
                maxLines: 2,
                style: const TextStyle(color: Colors.white),
                decoration: InputDecoration(
                  hintText: 'Add a note (optional)',
                  hintStyle: TextStyle(color: Colors.white.withOpacity(0.5)),
                  filled: true,
                  fillColor: Colors.white.withOpacity(0.06),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide.none,
                  ),
                ),
              ),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: () async {
                    Navigator.of(ctx).pop();
                    try {
                      await _supabase.from('random_call_ratings').insert({
                        'session_id': widget.matchSessionId,
                        'rater_id': _supabase.auth.currentUser?.id,
                        'rated_id': widget.hostId,
                        'stars': stars,
                        'comment':
                            comment.text.trim().isEmpty ? null : comment.text.trim(),
                      });
                    } catch (_) {}
                  },
                  style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xFF06B6D4),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                  child: const Text('Submit',
                      style: TextStyle(fontWeight: FontWeight.w800)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _fmt(Duration d) {
    final m = d.inMinutes.toString().padLeft(2, '0');
    final s = (d.inSeconds % 60).toString().padLeft(2, '0');
    return '$m:$s';
  }

  // ── UI ────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      resizeToAvoidBottomInset: true,
      body: Stack(
        fit: StackFit.expand,
        children: [
          IgnorePointer(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Colors.black.withOpacity(0.45),
                    Colors.transparent,
                    Colors.black.withOpacity(0.65),
                  ],
                  stops: const [0, 0.35, 1],
                ),
              ),
            ),
          ),
          if (_reconnecting) const _ReconnectBanner(),
          SafeArea(
            child: Column(
              children: [
                RoomTopBar(
                  hostAvatarUrl: widget.hostAvatarUrl,
                  hostName: widget.hostName,
                  subtitle: _fmt(_elapsed),
                  showFollow: false,
                  onClose: _hangUp,
                ),
                const Padding(
                  padding: EdgeInsets.only(top: 4, right: 12),
                  child: Align(
                    alignment: Alignment.centerRight,
                    child: CallQualityHud(),
                  ),
                ),
                const Spacer(),
                _ChatOverlay(
                  scroll: _chatScroll,
                  messages: _messages,
                  selfId: _supabase.auth.currentUser?.id,
                ),
                _ChatInput(
                  controller: _chatCtrl,
                  onSend: _sendChat,
                  onGift: _openGiftSheet,
                ),
                const SizedBox(height: 6),
                RoomBottomBar(
                  variant: RoomBarVariant.call,
                  slots: [
                    RoomBarSlot(
                      id: 'mute',
                      icon: _muted ? Icons.mic_off_rounded : Icons.mic_rounded,
                      label: _muted ? 'Muted' : 'Mic',
                      onTap: _toggleMute,
                    ),
                    RoomBarSlot(
                      id: 'beauty',
                      icon: _beauty ? Icons.auto_awesome_rounded : Icons.auto_awesome_outlined,
                      label: 'Beauty',
                      onTap: _toggleBeauty,
                    ),
                    RoomBarSlot(
                      id: 'gift',
                      icon: Icons.card_giftcard_rounded,
                      label: 'Gift',
                      hero: true,
                      onTap: _openGiftSheet,
                    ),
                    RoomBarSlot(
                      id: 'flip',
                      icon: Icons.cameraswitch_rounded,
                      label: 'Flip',
                      onTap: _flipCamera,
                    ),
                    RoomBarSlot(
                      id: 'end',
                      icon: Icons.call_end_rounded,
                      label: 'End',
                      destructive: true,
                      onTap: _hangUp,
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ChatMsg {
  const _ChatMsg({required this.id, required this.senderId, required this.text});
  final String id;
  final String senderId;
  final String text;
}

class _ReconnectBanner extends StatelessWidget {
  const _ReconnectBanner();
  @override
  Widget build(BuildContext context) {
    return Positioned(
      top: 0,
      left: 0,
      right: 0,
      child: Container(
        color: Colors.black.withOpacity(0.55),
        padding: const EdgeInsets.only(top: 44, bottom: 10),
        child: const Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            SizedBox(
              width: 14,
              height: 14,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: Color(0xFFFBBF24),
              ),
            ),
            SizedBox(width: 10),
            Text(
              'Reconnecting…',
              style: TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w700,
                fontSize: 13,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CallHeader extends StatelessWidget {
  const _CallHeader({
    required this.name,
    required this.avatarUrl,
    required this.elapsed,
  });
  final String name;
  final String? avatarUrl;
  final String elapsed;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(color: const Color(0xFF06B6D4), width: 2),
              image: avatarUrl != null
                  ? DecorationImage(
                      image: NetworkImage(avatarUrl!),
                      fit: BoxFit.cover,
                    )
                  : null,
              color: const Color(0xFF1F2937),
            ),
            child: avatarUrl == null
                ? const Icon(Icons.person, color: Colors.white70)
                : null,
          ),
          const SizedBox(width: 12),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                name,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 15,
                  fontWeight: FontWeight.w800,
                ),
              ),
              Text(
                elapsed,
                style: TextStyle(
                  color: Colors.white.withOpacity(0.8),
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 0.5,
                ),
              ),
            ],
          ),
          const Spacer(),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: Colors.black.withOpacity(0.45),
              borderRadius: BorderRadius.circular(999),
              border: Border.all(color: Colors.white.withOpacity(0.15)),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: const [
                Icon(Icons.diamond_rounded,
                    color: Color(0xFF06B6D4), size: 14),
                SizedBox(width: 4),
                Text(
                  'HD',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.8,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ChatOverlay extends StatelessWidget {
  const _ChatOverlay({
    required this.scroll,
    required this.messages,
    required this.selfId,
  });
  final ScrollController scroll;
  final List<_ChatMsg> messages;
  final String? selfId;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 160,
      margin: const EdgeInsets.symmetric(horizontal: 12),
      child: ListView.builder(
        controller: scroll,
        padding: const EdgeInsets.symmetric(vertical: 4),
        itemCount: messages.length,
        itemBuilder: (_, i) {
          final m = messages[i];
          final self = m.senderId == selfId;
          return Align(
            alignment: self ? Alignment.centerRight : Alignment.centerLeft,
            child: Container(
              margin: const EdgeInsets.symmetric(vertical: 3),
              padding:
                  const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
              constraints: BoxConstraints(
                maxWidth: MediaQuery.of(context).size.width * 0.7,
              ),
              decoration: BoxDecoration(
                color: self
                    ? const Color(0xFF06B6D4).withOpacity(0.85)
                    : Colors.black.withOpacity(0.55),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Text(
                m.text,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

class _ChatInput extends StatelessWidget {
  const _ChatInput({
    required this.controller,
    required this.onSend,
    required this.onGift,
  });
  final TextEditingController controller;
  final VoidCallback onSend;
  final VoidCallback onGift;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      child: Row(
        children: [
          Expanded(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14),
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.12),
                borderRadius: BorderRadius.circular(24),
                border: Border.all(color: Colors.white.withOpacity(0.14)),
              ),
              child: TextField(
                controller: controller,
                textInputAction: TextInputAction.send,
                onSubmitted: (_) => onSend(),
                style: const TextStyle(color: Colors.white, fontSize: 14),
                decoration: InputDecoration(
                  hintText: 'Say something…',
                  hintStyle: TextStyle(color: Colors.white.withOpacity(0.55)),
                  border: InputBorder.none,
                ),
              ),
            ),
          ),
          const SizedBox(width: 8),
          GestureDetector(
            onTap: onGift,
            child: Container(
              width: 44,
              height: 44,
              decoration: const BoxDecoration(
                shape: BoxShape.circle,
                gradient: LinearGradient(
                  colors: [Color(0xFFEC4899), Color(0xFFF43F5E)],
                ),
              ),
              child: const Icon(Icons.card_giftcard_rounded,
                  color: Colors.white, size: 22),
            ),
          ),
          const SizedBox(width: 6),
          GestureDetector(
            onTap: onSend,
            child: Container(
              width: 44,
              height: 44,
              decoration: const BoxDecoration(
                shape: BoxShape.circle,
                gradient: LinearGradient(
                  colors: [Color(0xFF06B6D4), Color(0xFF3B82F6)],
                ),
              ),
              child: const Icon(Icons.send_rounded,
                  color: Colors.white, size: 20),
            ),
          ),
        ],
      ),
    );
  }
}

class _CallControls extends StatelessWidget {
  const _CallControls({
    required this.muted,
    required this.beauty,
    required this.onMute,
    required this.onBeauty,
    required this.onFlip,
    required this.onHangUp,
  });
  final bool muted;
  final bool beauty;
  final VoidCallback onMute;
  final VoidCallback onBeauty;
  final VoidCallback onFlip;
  final VoidCallback onHangUp;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
      children: [
        _Orb(
          icon: muted ? Icons.mic_off_rounded : Icons.mic_rounded,
          background: Colors.white.withOpacity(0.14),
          onTap: onMute,
        ),
        _Orb(
          icon: beauty ? Icons.auto_awesome_rounded : Icons.auto_awesome_outlined,
          background: Colors.white.withOpacity(0.14),
          onTap: onBeauty,
        ),
        _Orb(
          icon: Icons.call_end_rounded,
          background: const Color(0xFFEF4444),
          size: 72,
          onTap: onHangUp,
        ),
        _Orb(
          icon: Icons.cameraswitch_rounded,
          background: Colors.white.withOpacity(0.14),
          onTap: onFlip,
        ),
      ],
    );
  }
}

class _Orb extends StatelessWidget {
  const _Orb({
    required this.icon,
    required this.background,
    required this.onTap,
    this.size = 60,
  });
  final IconData icon;
  final Color background;
  final VoidCallback onTap;
  final double size;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: background,
          boxShadow: [
            BoxShadow(
              color: background.withOpacity(0.5),
              blurRadius: 18,
              offset: const Offset(0, 8),
            ),
          ],
        ),
        child: Icon(icon, color: Colors.white, size: size * 0.42),
      ),
    );
  }
}

class _GiftSheetPlaceholder extends StatelessWidget {
  const _GiftSheetPlaceholder();
  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.card_giftcard_rounded,
                color: Color(0xFFEC4899), size: 40),
            const SizedBox(height: 10),
            const Text(
              'Gift Panel',
              style: TextStyle(
                color: Colors.white,
                fontSize: 16,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'Shared native gift sheet lands in the Gifts sector.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Colors.white.withOpacity(0.7),
                fontSize: 12,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
