import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'supabase_realtime_service.dart';
import 'sound_service.dart';

class WalletService with ChangeNotifier {
  static final WalletService _instance = WalletService._internal();
  factory WalletService() => _instance;
  WalletService._internal();

  final _supabase = Supabase.instance.client;
  final _realtime = SupabaseRealtimeService();
  final _sound = SoundService();

  double _coins = 0;
  double _diamonds = 0;
  List<Map<String, dynamic>> _transactions = [];
  bool _loading = true;

  double get coins => _coins;
  double get diamonds => _diamonds;
  List<Map<String, dynamic>> get transactions => _transactions;
  bool get loading => _loading;

  void init(String userId) {
    _fetchBalance(userId);
    _fetchTransactions(userId);

    _realtime.subscribe(
      subscriberId: 'wallet-service-$userId',
      tables: ['profiles', 'coin_transactions', 'gift_transactions'],
      callback: (table, event, payload) {
        if (table == 'profiles' && payload['id'] == userId) {
          final oldCoins = _coins;
          _coins = (payload['coins'] ?? 0).toDouble();
          _diamonds = (payload['diamonds'] ?? 0).toDouble();
          
          if (_coins > oldCoins && event == 'UPDATE') {
            _sound.playCoin();
          }
          notifyListeners();
        } else if (table == 'coin_transactions' || table == 'gift_transactions') {
          _fetchTransactions(userId);
        }
      },
    );
  }

  Future<void> _fetchBalance(String userId) async {
    try {
      final res = await _supabase.from('profiles').select('coins, diamonds').eq('id', userId).single();
      _coins = (res['coins'] ?? 0).toDouble();
      _diamonds = (res['diamonds'] ?? 0).toDouble();
      notifyListeners();
    } catch (e) {
      debugPrint('[Wallet] Balance error: $e');
    }
  }

  Future<void> _fetchTransactions(String userId) async {
    try {
      final res = await _supabase
          .from('coin_transactions')
          .select()
          .eq('user_id', userId)
          .order('created_at', ascending: false)
          .limit(50);
      
      _transactions = List<Map<String, dynamic>>.from(res);
      _loading = false;
      notifyListeners();
    } catch (e) {
      debugPrint('[Wallet] Transactions error: $e');
    }
  }

  Future<bool> buyCoins(String userId, double amount, String method) async {
    try {
      // Logic for processing purchase via Edge Functions
      final res = await _supabase.functions.invoke('process-recharge', body: {
        'userId': userId,
        'amount': amount,
        'method': method,
      });
      
      if (res.status == 200) {
        _sound.playCoin();
        return true;
      }
      return false;
    } catch (e) {
      debugPrint('[Wallet] Recharge error: $e');
      return false;
    }
  }

  void disposeWallet(String userId) {
    _realtime.unsubscribe('wallet-service-$userId');
    _coins = 0;
    _diamonds = 0;
    _transactions = [];
    _loading = true;
  }
}
