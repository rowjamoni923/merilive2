import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// G22 — Active-game notifier shared across the party room UI so overlays
/// (audio-mode game strip, host end-game pill) can react without an
/// additional cubit hop.
final ValueNotifier<PartyGame?> activePartyGameNotifier =
    ValueNotifier<PartyGame?>(null);

/// Represents one admin-managed game row. Mirrors the web `game_settings`
/// query used by `src/components/party/GameSelectionModal.tsx` and
/// `src/components/games/LiveGameBoard.tsx` — SAME games, no additions.
class PartyGame {
  const PartyGame({
    required this.id,
    required this.name,
    required this.emoji,
    required this.color,
    required this.description,
    this.logoUrl,
    this.gameUrl,
    this.gameType,
    this.category,
  });

  final String id;
  final String name;
  final String emoji;
  final String color;
  final String description;
  final String? logoUrl;
  final String? gameUrl;
  final String? gameType;
  final String? category;

  factory PartyGame.fromRow(Map<String, dynamic> row) {
    final gameId = (row['game_id'] as String?)?.trim();
    return PartyGame(
      id: (gameId != null && gameId.isNotEmpty)
          ? gameId
          : (row['id'] as String),
      name: (row['game_name'] as String?) ?? 'Game',
      emoji: (row['game_emoji'] as String?) ?? '🎮',
      color: (row['game_color'] as String?) ?? 'from-purple-500 to-pink-500',
      description:
          (row['description'] as String?)?.trim().isNotEmpty == true
              ? row['description'] as String
              : 'Play & win!',
      logoUrl: row['logo_url'] as String?,
      gameUrl: row['game_url'] as String?,
      gameType: row['game_type'] as String?,
      category: row['category'] as String?,
    );
  }
}

class PartyGamesBridge {
  PartyGamesBridge._();
  static final PartyGamesBridge instance = PartyGamesBridge._();

  final SupabaseClient _sb = Supabase.instance.client;

  /// Fetch the exact same active game list the web renders in the party room
  /// game selector. Ordered by admin-controlled `display_order`.
  Future<List<PartyGame>> fetchActiveGames() async {
    final rows = await _sb
        .from('game_settings')
        .select(
          'id, game_id, game_name, game_emoji, game_color, description, '
          'logo_url, game_url, game_type, category, display_order, is_active',
        )
        .eq('is_active', true)
        .order('display_order', ascending: true);

    return (rows as List)
        .whereType<Map<String, dynamic>>()
        .map(PartyGame.fromRow)
        .toList(growable: false);
  }
}
