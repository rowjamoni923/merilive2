import 'dart:async';

import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// G5 — Party Room welcome banner.
///
/// Reads the newest active row from `room_welcome_messages` for the room and
/// shows a dismissible compact system-notice card. Auto-hides after 10s.
/// No animation frames on the hot path; single query on mount.
class PartyWelcomeBanner extends StatefulWidget {
  const PartyWelcomeBanner({super.key, required this.roomId});
  final String roomId;

  @override
  State<PartyWelcomeBanner> createState() => _PartyWelcomeBannerState();
}

class _PartyWelcomeBannerState extends State<PartyWelcomeBanner> {
  String? _text;
  bool _dismissed = false;
  Timer? _autoHide;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load() async {
    try {
      final row = await Supabase.instance.client
          .from('room_welcome_messages')
          .select('message_text, is_active')
          .eq('room_id', widget.roomId)
          .eq('is_active', true)
          .order('updated_at', ascending: false)
          .limit(1)
          .maybeSingle();
      final txt = (row?['message_text'] as String?)?.trim();
      if (!mounted || txt == null || txt.isEmpty) return;
      setState(() => _text = txt);
      _autoHide = Timer(const Duration(seconds: 10), () {
        if (mounted) setState(() => _dismissed = true);
      });
    } catch (_) {}
  }

  @override
  void dispose() {
    _autoHide?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_dismissed || _text == null) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 6, 12, 0),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: Colors.white24, width: 0.6),
        ),
        child: Row(
          children: [
            const Icon(Icons.campaign_rounded,
                size: 15, color: Color(0xFFFACC15)),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                _text!,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                    color: Colors.white, fontSize: 12, height: 1.25),
              ),
            ),
            InkResponse(
              onTap: () => setState(() => _dismissed = true),
              radius: 14,
              child: const Icon(Icons.close_rounded,
                  size: 15, color: Colors.white54),
            ),
          ],
        ),
      ),
    );
  }
}
