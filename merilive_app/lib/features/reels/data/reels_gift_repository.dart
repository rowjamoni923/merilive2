// R7 — Reels gift bridge (Flutter side of GiftingService).
//
// Mirrors src/features/shared/gifting/GiftingService.ts so gifts sent from the
// reels feed hit the same atomic `gift-service` edge function, respect the
// admin-configured host/beans split, and land in `gift_transactions` with the
// `reel_id` scope set. Realtime consumers (leaderboard, wallet, dispatcher)
// stay untouched — we just publish through the exact same server contract.

import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

@immutable
class ReelGift {
  const ReelGift({
    required this.id,
    required this.name,
    required this.coins,
    required this.category,
    this.iconUrl,
    this.animationUrl,
    this.animationFormat,
  });

  final String id;
  final String name;
  final int coins;
  final String category;
  final String? iconUrl;
  final String? animationUrl;
  final String? animationFormat;

  factory ReelGift.fromMap(Map<String, dynamic> map) {
    return ReelGift(
      id: map['id'] as String,
      name: (map['name'] as String?) ?? 'Gift',
      coins: (map['coin_value'] as num?)?.toInt() ?? 0,
      category: (map['category'] as String?) ?? 'popular',
      iconUrl: map['icon_url'] as String?,
      animationUrl: map['animation_url'] as String?,
      animationFormat: map['animation_format'] as String?,
    );
  }
}

@immutable
class ReelGiftSendResult {
  const ReelGiftSendResult({
    required this.success,
    this.error,
    this.transactionId,
    this.coinsSpent,
    this.beansEarned,
    this.newBalance,
  });

  final bool success;
  final String? error;
  final String? transactionId;
  final int? coinsSpent;
  final int? beansEarned;
  final int? newBalance;
}

class ReelsGiftRepository {
  ReelsGiftRepository(this._client);

  final SupabaseClient _client;

  static const _cacheTtl = Duration(minutes: 5);
  DateTime? _cachedAt;
  List<ReelGift>? _cached;

  Future<List<ReelGift>> fetchGifts({bool forceRefresh = false}) async {
    final now = DateTime.now();
    if (!forceRefresh &&
        _cached != null &&
        _cachedAt != null &&
        now.difference(_cachedAt!) < _cacheTtl) {
      return _cached!;
    }
    final rows = await _client
        .from('gifts')
        .select('id,name,coin_value,category,icon_url,animation_url,animation_format,is_active')
        .eq('is_active', true)
        .order('coin_value', ascending: true);
    final list = (rows as List)
        .cast<Map<String, dynamic>>()
        .map(ReelGift.fromMap)
        .toList(growable: false);
    _cached = list;
    _cachedAt = now;
    return list;
  }

  Future<int> fetchBalance(String userId) async {
    final row = await _client
        .from('profiles')
        .select('coins,diamonds')
        .eq('id', userId)
        .maybeSingle();
    if (row == null) return 0;
    final coins = (row['coins'] as num?)?.toInt() ?? 0;
    final diamonds = (row['diamonds'] as num?)?.toInt() ?? 0;
    return coins > diamonds ? coins : diamonds;
  }

  Future<ReelGiftSendResult> sendGift({
    required String reelId,
    required String receiverId,
    required String giftId,
    required int quantity,
  }) async {
    try {
      final res = await _client.functions.invoke(
        'gift-service',
        body: {
          'receiverId': receiverId,
          'giftId': giftId,
          'quantity': quantity,
          'reelId': reelId,
        },
      );
      final data = res.data;
      if (data is! Map) {
        return const ReelGiftSendResult(success: false, error: 'Bad response');
      }
      final ok = data['success'] == true;
      if (!ok) {
        return ReelGiftSendResult(
          success: false,
          error: (data['error'] as String?) ?? 'Gift failed',
        );
      }
      return ReelGiftSendResult(
        success: true,
        transactionId: data['transaction_id'] as String?,
        coinsSpent: (data['coins_spent'] as num?)?.toInt() ??
            (data['total_cost'] as num?)?.toInt(),
        beansEarned: (data['beans_earned'] as num?)?.toInt() ??
            (data['beans_received'] as num?)?.toInt(),
        newBalance: (data['new_balance'] as num?)?.toInt() ??
            (data['new_sender_balance'] as num?)?.toInt(),
      );
    } catch (e) {
      return ReelGiftSendResult(success: false, error: e.toString());
    }
  }
}
