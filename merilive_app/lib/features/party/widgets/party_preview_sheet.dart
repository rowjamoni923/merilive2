import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../data/party_models.dart';

/// Preview-before-enter modal — parity with `entryPreview` dialog in
/// `src/pages/Discover.tsx`. Chamet/Bigo pattern: user taps a card, sees a
/// preview with host + room meta, then confirms "Enter Room".
class PartyPreviewSheet extends StatelessWidget {
  const PartyPreviewSheet({super.key, required this.room, required this.onEnter});

  final PartyRoom room;
  final VoidCallback onEnter;

  static const _videoGradient = [Color(0xFF10B981), Color(0xFF059669)];
  static const _audioGradient = [Color(0xFF3B82F6), Color(0xFF2563EB)];
  static const _gameGradient = [Color(0xFF6366F1), Color(0xFFA855F7)];

  List<Color> get _typeGradient => switch (room.roomType) {
        PartyRoomType.video => _videoGradient,
        PartyRoomType.audio => _audioGradient,
        PartyRoomType.game => _gameGradient,
        _ => const [Color(0xFF64748B), Color(0xFF334155)],
      };

  @override
  Widget build(BuildContext context) {
    final host = room.host;
    return SafeArea(
      top: false,
      child: Container(
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(26)),
        ),
        child: Padding(
          padding: EdgeInsets.only(
            left: 20,
            right: 20,
            top: 14,
            bottom: 20 + MediaQuery.of(context).viewInsets.bottom,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 44,
                  height: 4,
                  decoration: BoxDecoration(
                    color: const Color(0xFFE2E8F0),
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              // Host row
              Row(
                children: [
                  Container(
                    width: 62,
                    height: 62,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: LinearGradient(colors: _typeGradient),
                    ),
                    padding: const EdgeInsets.all(2.5),
                    child: ClipOval(
                      child: (host?.avatarUrl ?? '').isEmpty
                          ? Container(
                              color: const Color(0xFFF1F5F9),
                              alignment: Alignment.center,
                              child: const Icon(Icons.person_rounded,
                                  color: Color(0xFF94A3B8)),
                            )
                          : CachedNetworkImage(
                              imageUrl: host!.avatarUrl!,
                              fit: BoxFit.cover,
                              errorWidget: (_, __, ___) => Container(
                                color: const Color(0xFFF1F5F9),
                              ),
                            ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            if ((host?.countryFlag ?? '').isNotEmpty)
                              Padding(
                                padding: const EdgeInsets.only(right: 6),
                                child: Text(host!.countryFlag!,
                                    style: const TextStyle(fontSize: 15)),
                              ),
                            Expanded(
                              child: Text(
                                host?.displayName ?? 'Party Host',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.w800,
                                  color: Color(0xFF0F172A),
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Row(
                          children: [
                            _levelChip(host?.displayLevel ?? 0),
                            const SizedBox(width: 6),
                            _typeChip(),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              // Room name
              Text(
                room.name,
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  color: Color(0xFF0F172A),
                ),
              ),
              if ((room.description ?? '').isNotEmpty) ...[
                const SizedBox(height: 6),
                Text(
                  room.description!,
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 13,
                    color: Color(0xFF475569),
                    height: 1.35,
                  ),
                ),
              ],
              const SizedBox(height: 14),
              // Meta grid
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  _metaTile(Icons.people_alt_rounded,
                      '${room.currentParticipants}/${room.maxParticipants} in room'),
                  if (room.entryFee > 0)
                    _metaTile(Icons.diamond_rounded, '${room.entryFee} entry',
                        color: const Color(0xFF0EA5E9)),
                  if (room.minLevel > 0)
                    _metaTile(Icons.trending_up_rounded,
                        'Min Lv ${room.minLevel}'),
                  if (room.isPrivate)
                    _metaTile(Icons.lock_rounded, 'Private room',
                        color: const Color(0xFFD97706)),
                  if ((room.roomCode ?? '').isNotEmpty)
                    _metaTile(Icons.tag_rounded, 'Code ${room.roomCode}'),
                ],
              ),
              if ((room.welcomeMessage ?? '').isNotEmpty) ...[
                const SizedBox(height: 14),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF8FAFC),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: const Color(0xFFE2E8F0)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Welcome message',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: Color(0xFF64748B),
                          letterSpacing: 0.4,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        room.welcomeMessage!,
                        style: const TextStyle(
                          fontSize: 13,
                          color: Color(0xFF0F172A),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
              const SizedBox(height: 18),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => Navigator.of(context).maybePop(),
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size.fromHeight(48),
                        side: const BorderSide(color: Color(0xFFE2E8F0)),
                        foregroundColor: const Color(0xFF334155),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                      ),
                      child: const Text('Cancel'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    flex: 2,
                    child: ElevatedButton(
                      onPressed: () {
                        Navigator.of(context).maybePop();
                        onEnter();
                      },
                      style: ElevatedButton.styleFrom(
                        minimumSize: const Size.fromHeight(48),
                        padding: EdgeInsets.zero,
                        elevation: 0,
                        backgroundColor: Colors.transparent,
                        shadowColor: Colors.transparent,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                      ),
                      child: Ink(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(colors: _typeGradient),
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: const Center(
                          child: Text(
                            'Enter Room',
                            style: TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w800,
                              fontSize: 15,
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _levelChip(int level) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        gradient: LinearGradient(colors: _typeGradient),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        'Lv $level',
        style: const TextStyle(
          color: Colors.white,
          fontSize: 11,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }

  Widget _typeChip() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: const Color(0xFFF1F5F9),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        room.roomType.label.toUpperCase(),
        style: const TextStyle(
          color: Color(0xFF475569),
          fontSize: 10.5,
          fontWeight: FontWeight.w800,
          letterSpacing: 0.5,
        ),
      ),
    );
  }

  Widget _metaTile(IconData icon, String label, {Color? color}) {
    final c = color ?? const Color(0xFF64748B);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color: c.withOpacity(0.10),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: c.withOpacity(0.22)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13, color: c),
          const SizedBox(width: 5),
          Text(
            label,
            style: TextStyle(
              color: c,
              fontSize: 11.5,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}
