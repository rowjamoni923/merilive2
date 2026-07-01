import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'dart:async';

class GiftData {
  final String id;
  final String name;
  final int coins;
  final String category;
  final String? iconUrl;
  final String? animationUrl;
  final String? animationType;

  GiftData({
    required this.id,
    required this.name,
    required this.coins,
    required this.category,
    this.iconUrl,
    this.animationUrl,
    this.animationType,
  });

  factory GiftData.fromMap(Map<String, dynamic> map) {
    return GiftData(
      id: map['id'].toString(),
      name: map['name'] ?? '',
      coins: (map['coin_value'] ?? 0) as int,
      category: map['category'] ?? 'wall',
      iconUrl: map['icon_url'],
      animationUrl: map['animation_url'],
      animationType: _getAnimationType((map['coin_value'] ?? 0) as int),
    );
  }

  static String _getAnimationType(int coinValue) {
    if (coinValue >= 10000) return 'legendary';
    if (coinValue >= 1000) return 'luxury';
    if (coinValue >= 100) return 'premium';
    return 'basic';
  }
}

class GiftService extends ChangeNotifier {
  final SupabaseClient _supabase = Supabase.instance.client;
  List<GiftData> _allGifts = [];
  bool _isLoading = false;

  List<GiftData> get allGifts => _allGifts;
  bool get isLoading => _isLoading;

  Future<void> fetchGifts() async {
    _isLoading = true;
    notifyListeners();

    try {
      final response = await _supabase
          .from('gifts')
          .select()
          .order('coin_value', ascending: true);

      _allGifts = (response as List)
          .map((item) => GiftData.fromMap(item as Map<String, dynamic>))
          .toList();
      
      debugPrint('[GiftService] Loaded ${_allGifts.length} gifts from DB');
    } catch (e) {
      debugPrint('[GiftService] Error fetching gifts: $e');
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  List<String> getCategories() {
    final categories = _allGifts.map((g) => g.category).toSet().toList();
    if (!categories.contains('all')) categories.insert(0, 'all');
    return categories;
  }

  List<GiftData> getGiftsByCategory(String category) {
    if (category == 'all') return _allGifts;
    return _allGifts.where((g) => g.category == category).toList();
  }
}
