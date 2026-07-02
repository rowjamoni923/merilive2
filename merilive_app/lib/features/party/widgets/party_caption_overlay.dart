import 'dart:async';

import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// G24 — Caption overlay.
///
/// Subscribes to `transcription_segments` INSERTs for the current room and
/// renders the most recent 2 lines as a subtitle band at the bottom. Auto
/// hides after 8s of silence. Accessibility feature — off by default,
/// enable via `visible = true`.
class PartyCaptionOverlay extends StatefulWidget {
  const PartyCaptionOverlay({
    super.key,
    required this.roomId,
    this.visible = false,
  });

  final String roomId;
  final bool visible;

  @override
  State<PartyCaptionOverlay> createState() => _PartyCaptionOverlayState();
}

class _PartyCaptionOverlayState extends State<PartyCaptionOverlay> {
  RealtimeChannel? _channel;
  final _lines = <String>[];
  Timer? _hide;
  bool _showing = false;

  @override
  void initState() {
    super.initState();
    if (widget.visible) _subscribe();
  }

  @override
  void didUpdateWidget(covariant PartyCaptionOverlay old) {
    super.didUpdateWidget(old);
    if (old.visible != widget.visible) {
      widget.visible ? _subscribe() : _unsubscribe();
    }
  }

  void _subscribe() {
    _channel?.unsubscribe();
    _channel = Supabase.instance.client
        .channel('party_captions_${widget.roomId}')
        .onPostgresChanges(
          event: PostgresChangeEvent.insert,
          schema: 'public',
          table: 'transcription_segments',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'room_id',
            value: widget.roomId,
          ),
          callback: (payload) {
            final txt = payload.newRecord['text']?.toString().trim() ?? '';
            if (txt.isEmpty) return;
            if (!mounted) return;
            setState(() {
              _lines.add(txt);
              if (_lines.length > 2) _lines.removeAt(0);
              _showing = true;
            });
            _hide?.cancel();
            _hide = Timer(const Duration(seconds: 8), () {
              if (mounted) setState(() => _showing = false);
            });
          },
        )
        .subscribe();
  }

  Future<void> _unsubscribe() async {
    final ch = _channel;
    _channel = null;
    if (ch != null) {
      try {
        await Supabase.instance.client.removeChannel(ch);
      } catch (_) {}
    }
    if (mounted) setState(() {
      _lines.clear();
      _showing = false;
    });
  }

  @override
  void dispose() {
    _hide?.cancel();
    _unsubscribe();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.visible || !_showing || _lines.isEmpty) {
      return const SizedBox.shrink();
    }
    return Align(
      alignment: Alignment.bottomCenter,
      child: Padding(
        padding: const EdgeInsets.only(bottom: 160, left: 20, right: 20),
        child: Container(
          padding:
              const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            color: Colors.black.withValues(alpha: 0.65),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (final l in _lines)
                Text(l,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                        color: Colors.white,
                        fontSize: 13,
                        fontWeight: FontWeight.w500)),
            ],
          ),
        ),
      ),
    );
  }
}
