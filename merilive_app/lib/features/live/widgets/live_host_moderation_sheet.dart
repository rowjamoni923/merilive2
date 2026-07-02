import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../data/livekit_moderation_bridge.dart';

/// Host moderation sheet — Flutter parity with
/// `src/components/livekit/HostModerationSheet.tsx`.
///
/// All LiveKit-permission based; Supabase state stays untouched. Server
/// verifies caller owns the room (live_streams.host_id / party_rooms.host_id).
class LiveHostModerationSheet extends StatefulWidget {
  const LiveHostModerationSheet({
    super.key,
    required this.roomName,
    required this.identity,
    required this.displayName,
  });

  /// LiveKit room name — `live_{streamId}` for live streams.
  final String roomName;

  /// Target participant identity (= profiles.id).
  final String identity;

  final String displayName;

  static Future<void> show(
    BuildContext context, {
    required String roomName,
    required String identity,
    required String displayName,
  }) {
    return showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => LiveHostModerationSheet(
        roomName: roomName,
        identity: identity,
        displayName: displayName,
      ),
    );
  }

  @override
  State<LiveHostModerationSheet> createState() =>
      _LiveHostModerationSheetState();
}

enum _ModAction {
  promote,
  demote,
  muteMic,
  unmuteMic,
  lockMic,
  kick,
  muteAll,
  unmuteAll,
}

const _errorMap = <String, String>{
  'update_permission_disabled': 'Promote/demote is disabled by admin.',
  'moderation_disabled': 'Moderation is disabled by admin.',
  'not_room_host': 'You are not the host of this room.',
  'missing_required_fields': 'Missing room or participant id.',
};

class _LiveHostModerationSheetState extends State<LiveHostModerationSheet> {
  _ModAction? _busy;

  Future<void> _run(_ModAction a) async {
    HapticFeedback.selectionClick();
    setState(() => _busy = a);
    final bridge = LiveKitModerationBridge.instance;
    final reason = 'host_${a.name}';
    LiveKitModerationResult res;
    switch (a) {
      case _ModAction.promote:
        res = await bridge.promoteToSpeaker(
            roomName: widget.roomName,
            identity: widget.identity,
            reason: reason);
        break;
      case _ModAction.demote:
        res = await bridge.demoteToAudience(
            roomName: widget.roomName,
            identity: widget.identity,
            reason: reason);
        break;
      case _ModAction.lockMic:
        res = await bridge.lockMicrophone(
            roomName: widget.roomName,
            identity: widget.identity,
            reason: reason);
        break;
      case _ModAction.muteMic:
        res = await bridge.muteParticipantAudio(
            roomName: widget.roomName,
            identity: widget.identity,
            reason: reason);
        break;
      case _ModAction.unmuteMic:
        res = await bridge.unmuteParticipantAudio(
            roomName: widget.roomName,
            identity: widget.identity,
            reason: reason);
        break;
      case _ModAction.kick:
        res = await bridge.kickParticipant(
            roomName: widget.roomName,
            identity: widget.identity,
            reason: reason);
        break;
      case _ModAction.muteAll:
        res = await bridge.muteAllAudio(
            roomName: widget.roomName, reason: reason);
        break;
      case _ModAction.unmuteAll:
        res = await bridge.unmuteAllAudio(
            roomName: widget.roomName, reason: reason);
        break;
    }
    if (!mounted) return;
    setState(() => _busy = null);
    if (res.ok) {
      _toast(_successMsg(a));
      // Per-target actions close the sheet; room-wide actions keep it open.
      if (a != _ModAction.muteAll && a != _ModAction.unmuteAll) {
        Navigator.of(context).maybePop();
      }
    } else {
      final msg = _errorMap[res.error ?? ''] ?? res.error ?? 'Action failed.';
      _toast(msg, isError: true);
    }
  }

  String _successMsg(_ModAction a) {
    switch (a) {
      case _ModAction.promote:
        return 'Promoted to speaker';
      case _ModAction.demote:
        return 'Demoted to audience';
      case _ModAction.muteMic:
        return 'Microphone muted';
      case _ModAction.unmuteMic:
        return 'Microphone unmuted';
      case _ModAction.lockMic:
        return 'Microphone locked';
      case _ModAction.kick:
        return 'Participant kicked';
      case _ModAction.muteAll:
        return 'Muted everyone';
      case _ModAction.unmuteAll:
        return 'Unmuted everyone';
    }
  }

  void _toast(String msg, {bool isError = false}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(msg),
        backgroundColor:
            isError ? const Color(0xFFDC2626) : const Color(0xFF16A34A),
        duration: const Duration(seconds: 2),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xF2140F23), Color(0xF00C0818)],
          ),
          borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
          border: Border(top: BorderSide(color: Color(0x33FFFFFF))),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 8),
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.white24,
                borderRadius: BorderRadius.circular(4),
              ),
            ),
            const SizedBox(height: 12),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Row(
                children: [
                  const Icon(Icons.shield_rounded,
                      color: Color(0xFFEC4899), size: 20),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Moderate ${widget.displayName}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close_rounded,
                        color: Colors.white70, size: 20),
                    onPressed: () => Navigator.of(context).maybePop(),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 6),
            // Room-wide quick actions
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 4),
              child: Row(
                children: [
                  Expanded(
                    child: _RoomWideBtn(
                      icon: Icons.volume_off_rounded,
                      color: const Color(0xFFF59E0B),
                      label: 'Mute All',
                      busy: _busy == _ModAction.muteAll,
                      disabled: _busy != null && _busy != _ModAction.muteAll,
                      onTap: () => _run(_ModAction.muteAll),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _RoomWideBtn(
                      icon: Icons.volume_up_rounded,
                      color: const Color(0xFF10B981),
                      label: 'Unmute All',
                      busy: _busy == _ModAction.unmuteAll,
                      disabled:
                          _busy != null && _busy != _ModAction.unmuteAll,
                      onTap: () => _run(_ModAction.unmuteAll),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
              child: Column(
                children: [
                  _Item(
                    kind: _ModAction.promote,
                    icon: Icons.arrow_circle_up_rounded,
                    iconColor: const Color(0xFF10B981),
                    label: 'Promote to Speaker',
                    sub: 'Allow camera, mic and screen-share',
                    busy: _busy,
                    onTap: _run,
                  ),
                  _Item(
                    kind: _ModAction.demote,
                    icon: Icons.arrow_circle_down_rounded,
                    iconColor: const Color(0xFF3B82F6),
                    label: 'Demote to Audience',
                    sub: 'Listen & chat only — no publishing',
                    busy: _busy,
                    onTap: _run,
                  ),
                  _Item(
                    kind: _ModAction.muteMic,
                    icon: Icons.mic_off_rounded,
                    iconColor: const Color(0xFFF59E0B),
                    label: 'Mute Microphone',
                    sub: 'Mute their mic — they can self-unmute',
                    busy: _busy,
                    onTap: _run,
                  ),
                  _Item(
                    kind: _ModAction.unmuteMic,
                    icon: Icons.mic_rounded,
                    iconColor: const Color(0xFF10B981),
                    label: 'Unmute Microphone',
                    sub: 'Re-enable their mic',
                    busy: _busy,
                    onTap: _run,
                  ),
                  _Item(
                    kind: _ModAction.lockMic,
                    icon: Icons.lock_rounded,
                    iconColor: const Color(0xFFEA580C),
                    label: 'Lock Microphone',
                    sub: 'Keep on stage but block their mic',
                    busy: _busy,
                    onTap: _run,
                  ),
                  _Item(
                    kind: _ModAction.kick,
                    icon: Icons.person_remove_rounded,
                    iconColor: const Color(0xFFEF4444),
                    label: 'Kick from Room',
                    sub: 'Disconnect them from this room',
                    danger: true,
                    busy: _busy,
                    onTap: _run,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _RoomWideBtn extends StatelessWidget {
  const _RoomWideBtn({
    required this.icon,
    required this.color,
    required this.label,
    required this.busy,
    required this.disabled,
    required this.onTap,
  });

  final IconData icon;
  final Color color;
  final String label;
  final bool busy;
  final bool disabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return OutlinedButton.icon(
      onPressed: disabled ? null : onTap,
      icon: busy
          ? const SizedBox(
              width: 16,
              height: 16,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                valueColor: AlwaysStoppedAnimation(Colors.white),
              ),
            )
          : Icon(icon, color: color, size: 18),
      label: Text(
        label,
        style: const TextStyle(
          color: Colors.white,
          fontSize: 12.5,
          fontWeight: FontWeight.w700,
        ),
      ),
      style: OutlinedButton.styleFrom(
        padding: const EdgeInsets.symmetric(vertical: 12),
        side: BorderSide(color: Colors.white.withOpacity(0.15)),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
        ),
      ),
    );
  }
}

class _Item extends StatelessWidget {
  const _Item({
    required this.kind,
    required this.icon,
    required this.iconColor,
    required this.label,
    required this.sub,
    required this.busy,
    required this.onTap,
    this.danger = false,
  });

  final _ModAction kind;
  final IconData icon;
  final Color iconColor;
  final String label;
  final String sub;
  final _ModAction? busy;
  final ValueChanged<_ModAction> onTap;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    final disabled = busy != null && busy != kind;
    final isBusy = busy == kind;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: danger
            ? const Color(0xFFEF4444).withOpacity(0.12)
            : Colors.white.withOpacity(0.05),
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: disabled ? null : () => onTap(kind),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            child: Row(
              children: [
                SizedBox(
                  width: 22,
                  height: 22,
                  child: isBusy
                      ? const CircularProgressIndicator(
                          strokeWidth: 2,
                          valueColor: AlwaysStoppedAnimation(Colors.white),
                        )
                      : Icon(icon, color: iconColor, size: 22),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        label,
                        style: TextStyle(
                          color:
                              danger ? const Color(0xFFFCA5A5) : Colors.white,
                          fontSize: 13.5,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        sub,
                        style: const TextStyle(
                          color: Colors.white54,
                          fontSize: 11,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
