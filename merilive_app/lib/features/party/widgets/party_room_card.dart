import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../data/party_models.dart';

/// 2-col party room card — pixel parity with `Discover.tsx` room card.
class PartyRoomCard extends StatelessWidget {
  const PartyRoomCard({super.key, required this.room, required this.onTap});

  final PartyRoom room;
  final VoidCallback onTap;

  static const _videoGradient = [Color(0xFF10B981), Color(0xFF059669)];
  static const _audioGradient = [Color(0xFF3B82F6), Color(0xFF2563EB)];
  static const _gameGradient = [Color(0xFF6366F1), Color(0xFFA855F7)];
  static const _neutralGradient = [Color(0xFF94A3B8), Color(0xFF64748B)];

  List<Color> get _typeGradient => switch (room.roomType) {
        PartyRoomType.video => _videoGradient,
        PartyRoomType.audio => _audioGradient,
        PartyRoomType.game => _gameGradient,
        _ => _neutralGradient,
      };

  IconData get _typeIcon => switch (room.roomType) {
        PartyRoomType.video => Icons.videocam_rounded,
        PartyRoomType.audio => Icons.mic_rounded,
        PartyRoomType.game => Icons.sports_esports_rounded,
        _ => Icons.mic_rounded,
      };

  String? get _gameEmoji {
    if (room.gameMode == null) return null;
    return switch (room.gameMode!.toLowerCase()) {
      'ludo' || 'lucky28' || 'dice' => '🎲',
      'spin' || 'wheel' => '🎡',
      'quiz' => '🧠',
      'music' => '🎵',
      'love' => '❤️',
      'lucky' => '⭐',
      'truth_dare' => '🎯',
      'karaoke' => '🎤',
      'crash' => '🚀',
      'toss_match' => '💎',
      'mines' => '💎',
      'hilo' => '🂡',
      'slots' => '🎰',
      'poker' => '🃏',
      _ => '🎮',
    };
  }

  BoxShadow get _tierShadow {
    final level = room.host?.displayLevel ?? 0;
    if (level >= 40) {
      return BoxShadow(
        color: const Color(0xFFF43F5E).withOpacity(0.35),
        blurRadius: 22,
        offset: const Offset(0, 10),
      );
    }
    if (level >= 20) {
      return BoxShadow(
        color: const Color(0xFFF59E0B).withOpacity(0.35),
        blurRadius: 20,
        offset: const Offset(0, 10),
      );
    }
    return BoxShadow(
      color: const Color(0xFF0F172A).withOpacity(0.18),
      blurRadius: 14,
      offset: const Offset(0, 6),
    );
  }

  @override
  Widget build(BuildContext context) {
    final avatar = room.host?.avatarUrl;
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(18),
        child: Ink(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(18),
            boxShadow: [_tierShadow],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // ── Thumbnail ────────────────────────────────────────────
              ClipRRect(
                borderRadius: const BorderRadius.vertical(
                  top: Radius.circular(18),
                ),
                child: AspectRatio(
                  aspectRatio: 1.55,
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      if (avatar != null && avatar.isNotEmpty)
                        CachedNetworkImage(
                          imageUrl: avatar,
                          fit: BoxFit.cover,
                          placeholder: (_, __) =>
                              _typeFallback(showIcon: false),
                          errorWidget: (_, __, ___) => _typeFallback(),
                        )
                      else
                        _typeFallback(),
                      // Dark bottom gradient for chip legibility.
                      Container(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.topCenter,
                            end: Alignment.bottomCenter,
                            colors: [
                              Colors.transparent,
                              Colors.black.withOpacity(0.55),
                            ],
                          ),
                        ),
                      ),
                      // Type badge (top-left).
                      Positioned(
                        top: 6,
                        left: 6,
                        child: _pillBadge(
                          background: LinearGradient(colors: _typeGradient),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(_typeIcon, size: 11, color: Colors.white),
                              const SizedBox(width: 3),
                              Text(
                                room.roomType.label,
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 10,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                      // Participant count (top-right).
                      Positioned(
                        top: 6,
                        right: 6,
                        child: _pillBadge(
                          color: Colors.white.withOpacity(0.94),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(Icons.people_alt_rounded,
                                  size: 11, color: Color(0xFF0F172A)),
                              const SizedBox(width: 3),
                              Text(
                                '${room.currentParticipants}',
                                style: const TextStyle(
                                  color: Color(0xFF0F172A),
                                  fontSize: 10,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                      // Game emoji chip (bottom-left).
                      if (_gameEmoji != null)
                        Positioned(
                          bottom: 6,
                          left: 6,
                          child: Container(
                            width: 32,
                            height: 32,
                            decoration: BoxDecoration(
                              gradient: LinearGradient(colors: _gameGradient),
                              borderRadius: BorderRadius.circular(10),
                              boxShadow: [
                                BoxShadow(
                                  color: Colors.black.withOpacity(0.35),
                                  blurRadius: 8,
                                  offset: const Offset(0, 3),
                                ),
                              ],
                            ),
                            alignment: Alignment.center,
                            child: Text(
                              _gameEmoji!,
                              style: const TextStyle(fontSize: 17),
                            ),
                          ),
                        ),
                      // Party rooms are always public — no lock badge.
                    ],
                  ),
                ),
              ),

              // ── Info row ─────────────────────────────────────────────
              Padding(
                padding: const EdgeInsets.fromLTRB(9, 8, 9, 10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      room.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w800,
                        color: Color(0xFF0F172A),
                      ),
                    ),
                    const SizedBox(height: 3),
                    Row(
                      children: [
                        if ((room.host?.countryFlag ?? '').isNotEmpty)
                          Padding(
                            padding: const EdgeInsets.only(right: 4),
                            child: Text(room.host!.countryFlag!,
                                style: const TextStyle(fontSize: 12)),
                          ),
                        Expanded(
                          child: Text(
                            room.host?.displayName ?? 'Party Host',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 11,
                              color: Color(0xFF64748B),
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 5, vertical: 1),
                          decoration: BoxDecoration(
                            gradient: LinearGradient(colors: _typeGradient),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            'Lv ${room.host?.displayLevel ?? 0}',
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 9.5,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _typeFallback({bool showIcon = true}) {
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: _typeGradient,
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      alignment: Alignment.center,
      child: showIcon
          ? Icon(_typeIcon, size: 34, color: Colors.white.withOpacity(0.85))
          : null,
    );
  }

  Widget _pillBadge({
    Color? color,
    Gradient? background,
    required Widget child,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
        color: color,
        gradient: background,
        borderRadius: BorderRadius.circular(999),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.3),
            blurRadius: 6,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: child,
    );
  }
}
