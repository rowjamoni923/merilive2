import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'api_service.dart';

class Gift {
  final String id;
  final String name;
  final String? iconUrl;
  final String? animationUrl;
  final String? animationType;
  final int coinValue;
  final String? soundUrl;
  final int? soundDurationMs;

  Gift({
    required this.id,
    required this.name,
    this.iconUrl,
    this.animationUrl,
    this.animationType,
    required this.coinValue,
    this.soundUrl,
    this.soundDurationMs,
  });
}

class GiftingService extends ChangeNotifier {
  final _supabase = Supabase.instance.client;
  List<Gift> _availableGifts = [];
  List<Gift> get availableGifts => _availableGifts;

  Future<void> fetchGifts() async {
    final gifts = await getGifts();
    _availableGifts = gifts;
    notifyListeners();
  }

  Future<List<Gift>> getGifts() async {
    try {
      final res = await _supabase.from('gifts').select('*').eq('is_active', true).order('coin_value', ascending: true);
      return (res as List).map((g) => Gift(
        id: g['id'].toString(),
        name: g['name'],
        iconUrl: g['icon_url'],
        animationUrl: g['animation_url'],
        animationType: g['animation_type'],
        coinValue: g['coin_value'],
        soundUrl: g['sound_url'],
        soundDurationMs: g['sound_duration_ms'],
      )).toList();
    } catch (e) {
      debugPrint('Error fetching gifts: $e');
      return [];
    }
  }

  Future<bool> sendGift({
    required String roomId,
    required String hostId,
    required Gift gift,
  }) async {
    try {
      final user = _supabase.auth.currentUser;
      if (user == null) return false;

      final api = ApiService();
      final txRes = await api.sendGiftTransaction(
        hostId: hostId,
        giftId: gift.id,
        amount: gift.coinValue,
      );

      if (!(txRes['success'] ?? false)) return false;

      final channel = _supabase.channel('room:$roomId');
      
      // Use dynamic type to avoid compilation error if enum is missing/moved
      dynamic broadcastType = "broadcast";
      try {
        await channel.send(
          type: broadcastType, 
          event: 'gift_sent',
          payload: {
            'gift_id': gift.id,
            'gift_name': gift.name,
            'sender_id': user.id,
          },
        );
      } catch (e) {
        debugPrint('Realtime send error: $e');
      }

      return true;
    } catch (e) {
      debugPrint('Error sending gift: $e');
      return false;
    }
  }
}


