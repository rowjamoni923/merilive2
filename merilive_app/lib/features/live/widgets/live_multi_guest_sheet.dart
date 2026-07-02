import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// M3 — Multi-guest management sheet.
///
/// Web-truth reference: `src/components/live/MultiGuestPanel.tsx`.
///
/// Host view: lists pending `seat_requests` for this stream, approve/deny.
/// Viewer view: single "Request to join guests" CTA that inserts a row.
class LiveMultiGuestSheet extends StatefulWidget {
  const LiveMultiGuestSheet({
    super.key,
    required this.streamId,
    required this.isHost,
  });

  final String streamId;
  final bool isHost;

  static Future<void> show(
    BuildContext context, {
    required String streamId,
    required bool isHost,
  }) {
    return showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => LiveMultiGuestSheet(streamId: streamId, isHost: isHost),
    );
  }

  @override
  State<LiveMultiGuestSheet> createState() => _LiveMultiGuestSheetState();
}

class _LiveMultiGuestSheetState extends State<LiveMultiGuestSheet> {
  final _sb = Supabase.instance.client;
  List<Map<String, dynamic>> _rows = const [];
  bool _loading = true;
  bool _sending = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final data = await _sb
          .from('seat_requests')
          .select(
              'id, requester_id, user_id, seat_position, seat_number, status, created_at, profiles!seat_requests_user_id_fkey(name, avatar_url)')
          .eq('room_id', widget.streamId)
          .eq('status', 'pending')
          .order('created_at');
      setState(() {
        _rows = List<Map<String, dynamic>>.from(data);
        _loading = false;
      });
    } catch (_) {
      // Fallback query without join if FK name differs.
      try {
        final data = await _sb
            .from('seat_requests')
            .select()
            .eq('room_id', widget.streamId)
            .eq('status', 'pending')
            .order('created_at');
        setState(() {
          _rows = List<Map<String, dynamic>>.from(data);
          _loading = false;
        });
      } catch (_) {
        if (mounted) setState(() => _loading = false);
      }
    }
  }

  Future<void> _respond(String id, String status) async {
    try {
      await _sb.from('seat_requests').update({
        'status': status,
        'responded_at': DateTime.now().toIso8601String(),
      }).eq('id', id);
      await _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Failed: $e')));
    }
  }

  Future<void> _request() async {
    final me = _sb.auth.currentUser;
    if (me == null || _sending) return;
    setState(() => _sending = true);
    try {
      await _sb.from('seat_requests').insert({
        'room_id': widget.streamId,
        'user_id': me.id,
        'requester_id': me.id,
        'status': 'pending',
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Request sent to host ✋')),
      );
      Navigator.of(context).pop();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Request failed: $e')));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: widget.isHost ? 0.7 : 0.35,
      minChildSize: 0.3,
      maxChildSize: 0.9,
      expand: false,
      builder: (_, scroll) => Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xF01F2937), Color(0xF00F172A)],
          ),
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 40, height: 4,
                decoration: BoxDecoration(
                  color: Colors.white24,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                const Icon(Icons.groups_2_rounded,
                    color: Color(0xFFA855F7), size: 20),
                const SizedBox(width: 8),
                Text(
                  widget.isHost ? 'Guest requests' : 'Join as guest',
                  style: const TextStyle(
                      color: Colors.white,
                      fontSize: 16,
                      fontWeight: FontWeight.w700),
                ),
                const Spacer(),
                if (widget.isHost)
                  IconButton(
                    onPressed: _load,
                    icon: const Icon(Icons.refresh_rounded,
                        color: Colors.white70, size: 20),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            Expanded(
              child: widget.isHost
                  ? _hostList(scroll)
                  : _viewerCta(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _viewerCta() {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        const Icon(Icons.pan_tool_alt_rounded,
            color: Colors.white70, size: 48),
        const SizedBox(height: 12),
        const Text('Ask the host to invite you on screen.',
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.white70, fontSize: 13)),
        const SizedBox(height: 20),
        SizedBox(
          width: double.infinity,
          child: ElevatedButton(
            onPressed: _sending ? null : _request,
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFA855F7),
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12)),
            ),
            child: _sending
                ? const SizedBox(
                    width: 20, height: 20,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: Colors.white))
                : const Text('Request to join',
                    style: TextStyle(
                        color: Colors.white, fontWeight: FontWeight.w700)),
          ),
        ),
      ],
    );
  }

  Widget _hostList(ScrollController scroll) {
    if (_loading) {
      return const Center(
          child: CircularProgressIndicator(color: Colors.white70));
    }
    if (_rows.isEmpty) {
      return const Center(
        child: Text('No pending requests',
            style: TextStyle(color: Colors.white54, fontSize: 13)),
      );
    }
    return ListView.separated(
      controller: scroll,
      itemCount: _rows.length,
      separatorBuilder: (_, __) => const SizedBox(height: 8),
      itemBuilder: (_, i) {
        final r = _rows[i];
        final profile = r['profiles'] as Map<String, dynamic>?;
        final name = profile?['name']?.toString() ?? 'User';
        final avatar = profile?['avatar_url']?.toString();
        return Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          decoration: BoxDecoration(
            color: Colors.white10,
            borderRadius: BorderRadius.circular(12),
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
                        size: 18, color: Colors.white70)
                    : null,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(name,
                    style: const TextStyle(
                        color: Colors.white,
                        fontSize: 13,
                        fontWeight: FontWeight.w600)),
              ),
              TextButton(
                onPressed: () => _respond(r['id'].toString(), 'denied'),
                child: const Text('Deny',
                    style: TextStyle(color: Colors.white54)),
              ),
              const SizedBox(width: 4),
              ElevatedButton(
                onPressed: () => _respond(r['id'].toString(), 'approved'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFFA855F7),
                  padding: const EdgeInsets.symmetric(
                      horizontal: 12, vertical: 6),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(999)),
                ),
                child: const Text('Accept',
                    style: TextStyle(
                        color: Colors.white,
                        fontSize: 12,
                        fontWeight: FontWeight.w700)),
              ),
            ],
          ),
        );
      },
    );
  }
}
