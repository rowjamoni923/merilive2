import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'dart:async';

class GameService extends ChangeNotifier {
  final SupabaseClient _supabase = Supabase.instance.client;
  List<Map<String, dynamic>> _activeGames = [];
  bool _isLoading = false;

  List<Map<String, dynamic>> get activeGames => _activeGames;
  bool get isLoading => _isLoading;

  Future<void> fetchGames() async {
    _isLoading = true;
    notifyListeners();

    try {
      final response = await _supabase
          .from('game_settings')
          .select()
          .eq('is_active', true)
          .order('display_order', { 'ascending': true });

      _activeGames = List<Map<String, dynamic>>.from(response);
    } catch (e) {
      debugPrint('[GameService] Fetch Error: $e');
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  // ========== GAMEPLAY LOGIC (Master Copy) ==========

  Future<void> placeBet({
    required String gameId,
    required String optionId,
    required int amount,
  }) async {
    final user = _supabase.auth.currentUser;
    if (user == null) return;

    try {
      // Call Edge Function for atomic bet transaction
      await _supabase.functions.invoke('game-service', body: {
        'action': 'place_bet',
        'gameId': gameId,
        'optionId': optionId,
        'amount': amount,
        'userId': user.id,
      });
      
      notifyListeners();
    } catch (e) {
      debugPrint('[GameService] Bet Error: $e');
    }
  }
}
