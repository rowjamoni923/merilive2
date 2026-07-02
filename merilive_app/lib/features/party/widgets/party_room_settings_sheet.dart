import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../bloc/party_room_cubit.dart';
import '../data/party_models.dart';

/// M4 — Host-only Party Room settings sheet.
///
/// Web-truth reference: `src/components/party/PartyRoomSettings.tsx`.
/// Edits: name, welcome message, announcement, background URL, lock.
class PartyRoomSettingsSheet extends StatefulWidget {
  const PartyRoomSettingsSheet({super.key, required this.room});
  final PartyRoom room;

  static Future<void> show(BuildContext context, PartyRoom room) {
    final cubit = context.read<PartyRoomCubit>();
    return showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => BlocProvider.value(
        value: cubit,
        child: PartyRoomSettingsSheet(room: room),
      ),
    );
  }

  @override
  State<PartyRoomSettingsSheet> createState() => _PartyRoomSettingsSheetState();
}

class _PartyRoomSettingsSheetState extends State<PartyRoomSettingsSheet> {
  late final TextEditingController _name;
  late final TextEditingController _welcome;
  late final TextEditingController _announce;
  late final TextEditingController _bg;
  late bool _locked;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _name = TextEditingController(text: widget.room.name);
    _welcome = TextEditingController(text: widget.room.welcomeMessage ?? '');
    _announce = TextEditingController(text: '');
    _bg = TextEditingController(text: widget.room.backgroundUrl ?? '');
    _locked = widget.room.isPrivate;
  }

  @override
  void dispose() {
    _name.dispose();
    _welcome.dispose();
    _announce.dispose();
    _bg.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await context.read<PartyRoomCubit>().updateRoomSettings(
            name: _name.text.trim().isEmpty ? null : _name.text.trim(),
            welcomeMessage: _welcome.text.trim(),
            announcement: _announce.text.trim(),
            backgroundUrl: _bg.text.trim(),
            isLocked: _locked,
          );
      if (!mounted) return;
      Navigator.of(context).pop();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Room settings saved')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Failed: $e')));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.85,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      expand: false,
      builder: (_, scroll) => Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFF1E1B4B), Color(0xFF0F172A)],
          ),
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        padding: EdgeInsets.only(
          left: 20,
          right: 20,
          top: 12,
          bottom: MediaQuery.of(context).viewInsets.bottom + 20,
        ),
        child: ListView(
          controller: scroll,
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
            const SizedBox(height: 14),
            Row(children: const [
              Icon(Icons.settings_rounded,
                  color: Color(0xFFA855F7), size: 20),
              SizedBox(width: 8),
              Text('Room Settings',
                  style: TextStyle(
                      color: Colors.white,
                      fontSize: 16,
                      fontWeight: FontWeight.w700)),
            ]),
            const SizedBox(height: 16),
            _field('Room name', _name, hint: 'My party room'),
            _field('Welcome message', _welcome,
                hint: 'Greet new joiners', maxLines: 2),
            _field('Announcement', _announce,
                hint: 'Pinned announcement in room', maxLines: 3),
            _field('Background image URL', _bg,
                hint: 'https://...', maxLines: 1),
            const SizedBox(height: 6),
            SwitchListTile.adaptive(
              contentPadding: EdgeInsets.zero,
              value: _locked,
              onChanged: (v) => setState(() => _locked = v),
              activeColor: const Color(0xFFA855F7),
              title: const Text('Lock room',
                  style: TextStyle(
                      color: Colors.white, fontWeight: FontWeight.w600)),
              subtitle: const Text('Requires password / invite to join',
                  style: TextStyle(color: Colors.white54, fontSize: 12)),
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _busy ? null : _save,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFFA855F7),
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12)),
                ),
                child: _busy
                    ? const SizedBox(
                        width: 20, height: 20,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Colors.white))
                    : const Text('Save changes',
                        style: TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w700)),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _field(String label, TextEditingController c,
      {String? hint, int maxLines = 1}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label,
              style: const TextStyle(
                  color: Colors.white70,
                  fontSize: 12,
                  fontWeight: FontWeight.w600)),
          const SizedBox(height: 6),
          TextField(
            controller: c,
            minLines: 1,
            maxLines: maxLines,
            style: const TextStyle(color: Colors.white, fontSize: 13),
            decoration: InputDecoration(
              hintText: hint,
              hintStyle: const TextStyle(color: Colors.white38),
              filled: true,
              fillColor: Colors.white10,
              contentPadding: const EdgeInsets.symmetric(
                  horizontal: 12, vertical: 10),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide: BorderSide.none,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
