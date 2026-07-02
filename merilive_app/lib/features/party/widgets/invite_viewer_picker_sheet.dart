import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Phase A P0 #2 — Viewer picker for the host "Invite to seat" flow.
///
/// Lists room participants that are currently in the room but NOT holding a
/// seat (seat_number IS NULL), so the host can pick one to invite.
class InviteViewerPickerSheet extends StatefulWidget {
  const InviteViewerPickerSheet({super.key, required this.roomId});
  final String roomId;

  /// Returns the selected viewer as `{id, displayName}` or `null`.
  static Future<({String id, String displayName})?> show(
    BuildContext context, {
    required String roomId,
  }) {
    return showModalBottomSheet<({String id, String displayName})>(
      context: context,
      backgroundColor: const Color(0xFF1F1B36),
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => InviteViewerPickerSheet(roomId: roomId),
    );
  }

  @override
  State<InviteViewerPickerSheet> createState() =>
      _InviteViewerPickerSheetState();
}

class _InviteViewerPickerSheetState extends State<InviteViewerPickerSheet> {
  List<Map<String, dynamic>> _viewers = const [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final supabase = Supabase.instance.client;
      final rows = await supabase
          .from('party_room_participants')
          .select('user_id')
          .eq('room_id', widget.roomId)
          .isFilter('left_at', null)
          .isFilter('seat_number', null);
      final ids = <String>{
        for (final r in (rows as List).cast<Map>())
          if (r['user_id'] != null) r['user_id'].toString(),
      };
      if (ids.isEmpty) {
        if (mounted) setState(() { _viewers = const []; _loading = false; });
        return;
      }
      final profs = await supabase
          .from('profiles_public')
          .select('id, display_name, avatar_url, user_level')
          .inFilter('id', ids.toList())
          .limit(100);
      if (!mounted) return;
      setState(() {
        _viewers = [
          for (final p in (profs as List).cast<Map>())
            p.cast<String, dynamic>(),
        ];
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.of(context).size.height * 0.6,
        ),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Pick a viewer to invite',
                style: TextStyle(
                    color: Colors.white,
                    fontSize: 15,
                    fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 12),
              Flexible(
                child: _loading
                    ? const Padding(
                        padding: EdgeInsets.symmetric(vertical: 32),
                        child: Center(
                          child: CircularProgressIndicator(
                              color: Color(0xFFF59E0B), strokeWidth: 2.5),
                        ),
                      )
                    : _error != null
                        ? Padding(
                            padding: const EdgeInsets.symmetric(vertical: 24),
                            child: Text(_error!,
                                style: const TextStyle(
                                    color: Colors.redAccent, fontSize: 12)),
                          )
                        : _viewers.isEmpty
                            ? const Padding(
                                padding: EdgeInsets.symmetric(vertical: 24),
                                child: Center(
                                  child: Text(
                                    'No free viewers in this room.',
                                    style: TextStyle(
                                        color: Colors.white54, fontSize: 13),
                                  ),
                                ),
                              )
                            : ListView.separated(
                                shrinkWrap: true,
                                itemCount: _viewers.length,
                                separatorBuilder: (_, __) =>
                                    const SizedBox(height: 4),
                                itemBuilder: (_, i) {
                                  final v = _viewers[i];
                                  final name =
                                      (v['display_name'] as String?) ?? 'Guest';
                                  final avatar = v['avatar_url'] as String?;
                                  return ListTile(
                                    dense: true,
                                    contentPadding: EdgeInsets.zero,
                                    leading: CircleAvatar(
                                      radius: 18,
                                      backgroundColor: const Color(0xFF6D28D9),
                                      backgroundImage: (avatar != null &&
                                              avatar.isNotEmpty)
                                          ? NetworkImage(avatar)
                                          : null,
                                      child: (avatar == null || avatar.isEmpty)
                                          ? const Icon(Icons.person,
                                              color: Colors.white70, size: 18)
                                          : null,
                                    ),
                                    title: Text(name,
                                        style: const TextStyle(
                                            color: Colors.white,
                                            fontSize: 13,
                                            fontWeight: FontWeight.w600)),
                                    trailing: const Icon(
                                        Icons.arrow_forward_ios_rounded,
                                        color: Colors.white38,
                                        size: 14),
                                    onTap: () => Navigator.of(context).pop((
                                      id: v['id'].toString(),
                                      displayName: name,
                                    )),
                                  );
                                },
                              ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
