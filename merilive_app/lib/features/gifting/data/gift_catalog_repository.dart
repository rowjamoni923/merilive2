import 'package:supabase_flutter/supabase_flutter.dart';

/// One catalog reader for every gift surface (party, live, call, chat,
/// profile, reels). Reads directly from the admin-managed `gifts` table so
/// prices/animations always match the panel the web app renders.
class GiftCatalogRepository {
  GiftCatalogRepository({SupabaseClient? client})
      : _client = client ?? Supabase.instance.client;

  final SupabaseClient _client;

  /// Fetch the active gift catalog. Sorted by category then coin price so
  /// the grid looks identical on every surface.
  Future<List<Map<String, dynamic>>> loadGifts() async {
    final rows = await _client
        .from('gifts')
        .select(
          'id,name,icon_url,image_url,animation_url,animation_type,sound_url,'
          'coin_price,coin_value,receiver_beans,category,is_active',
        )
        .eq('is_active', true)
        .order('category', ascending: true)
        .order('coin_price', ascending: true)
        .limit(500);
    return List<Map<String, dynamic>>.from(rows as List);
  }

  /// Insert a `gift_transactions` row. Server-side triggers handle coin
  /// debit, bean credit, animation broadcast, and (on Android) the native
  /// full-screen VAP/SVGA playback via NativeGiftAnimationPlugin.
  Future<void> sendGift({
    required String senderId,
    required String receiverId,
    required String giftId,
    required int coinCost,
    required int receiverBeans,
    required int quantity,
    required GiftSurface surface,
    String? contextId,
  }) async {
    await _client.from('gift_transactions').insert({
      'sender_id': senderId,
      'receiver_id': receiverId,
      'gift_id': giftId,
      'coin_cost': coinCost,
      'receiver_beans': receiverBeans,
      'quantity': quantity,
      'source': surface.name,
      'context_id': contextId,
    });
  }
}

/// Every gift-capable surface in the app. Used as the `source` column on
/// `gift_transactions` so admin analytics can attribute revenue correctly.
enum GiftSurface {
  live,
  partyVideo,
  partyAudio,
  partyGame,
  privateCall,
  chat,
  profile,
  reels,
}
