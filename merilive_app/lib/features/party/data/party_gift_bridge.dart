import 'dart:async';

import 'package:supabase_flutter/supabase_flutter.dart';

import '../../live/data/live_chat_bridge.dart' show LiveGiftEvent;

/// A9 — Party gift realtime bridge.
///
/// Web-truth reference: `src/pages/PartyRoom.tsx` — subscribes to
/// `gift_transactions` INSERTs filtered by `party_room_id`, enriches
/// each row with sender + gift metadata, and emits a [LiveGiftEvent]
/// so the party page can dispatch through `NativeGiftBridge` (VAP /
/// SVGA / Lottie) with a Flutter fallback overlay.
class PartyGiftBridge {
  PartyGiftBridge._();
  static final PartyGiftBridge instance = PartyGiftBridge._();

  final _client = Supabase.instance.client;
  final _giftsCtrl = StreamController<LiveGiftEvent>.broadcast();
  final Set<String> _seenIds = <String>{};

  RealtimeChannel? _channel;
  String? _roomId;

  Stream<LiveGiftEvent> get gifts$ => _giftsCtrl.stream;

  Future<void> attach(String roomId) async {
    if (_roomId == roomId && _channel != null) return;
    await detach();
    _roomId = roomId;

    _channel = _client
        .channel('flutter_party_gifts_$roomId')
        .onPostgresChanges(
          event: PostgresChangeEvent.insert,
          schema: 'public',
          table: 'gift_transactions',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'party_room_id',
            value: roomId,
          ),
          callback: (payload) => _onInsert(payload.newRecord),
        )
        .subscribe();
  }

  Future<void> detach() async {
    _roomId = null;
    _seenIds.clear();
    final ch = _channel;
    _channel = null;
    if (ch != null) {
      try {
        await _client.removeChannel(ch);
      } catch (_) {}
    }
  }

  Future<void> _onInsert(Map<String, dynamic> row) async {
    final id = row['id']?.toString();
    if (id == null || _seenIds.contains(id)) return;
    _seenIds.add(id);
    if (_seenIds.length > 500) _seenIds.remove(_seenIds.first);

    try {
      final senderId = row['sender_id']?.toString();
      final giftId = row['gift_id']?.toString();

      Map<String, dynamic>? sender;
      Map<String, dynamic>? gift;
      if (senderId != null) {
        sender = await _client
            .from('profiles_public')
            .select('id, display_name, avatar_url')
            .eq('id', senderId)
            .maybeSingle();
      }
      if (giftId != null) {
        gift = await _client
            .from('gifts')
            .select(
                'id, name, icon_url, image_url, animation_url, animation_type, diamond_cost, diamond_price')
            .eq('id', giftId)
            .maybeSingle();
      }

      final quantity = (row['quantity'] as int?) ?? 1;
      final diamondAmount = (row['diamond_amount'] as int?) ??
          (row['total_diamonds'] as int?) ??
          0;
      final perUnitFromGift = (gift?['diamond_price'] as num?)?.toInt() ??
          (gift?['diamond_cost'] as num?)?.toInt();
      final perUnit = perUnitFromGift ??
          (quantity > 0 ? (diamondAmount / quantity).round() : diamondAmount);

      _giftsCtrl.add(LiveGiftEvent(
        id: id,
        giftId: giftId,
        senderId: senderId,
        senderName: sender?['display_name']?.toString() ?? 'Someone',
        senderAvatar: sender?['avatar_url']?.toString(),
        receiverId: row['receiver_id']?.toString(),
        giftName: gift?['name']?.toString() ?? 'Gift',
        giftIcon: gift?['icon_url']?.toString() ??
            gift?['image_url']?.toString(),
        animationUrl: gift?['animation_url']?.toString(),
        animationType: gift?['animation_type']?.toString(),
        diamondAmount: diamondAmount,
        perUnitDiamonds: perUnit,
        quantity: quantity,
        createdAt:
            DateTime.tryParse(row['created_at']?.toString() ?? '') ??
                DateTime.now(),
      ));
    } catch (_) {
      // Non-fatal — safety-net bridge only.
    }
  }
}
