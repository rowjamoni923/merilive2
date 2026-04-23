import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'device_service.dart';
import 'api_service.dart';

class AuthService extends ChangeNotifier {
  static final AuthService _instance = AuthService._internal();
  factory AuthService() => _instance;
  

  final _supabase = Supabase.instance.client;
  User? get currentUser => _supabase.auth.currentUser;
  bool get isAuthenticated => currentUser != null;

  bool _isBanned = false;
  bool _isDeviceBanned = false;
  String? _banReason;
  String? _bannedUntil;
  RealtimeChannel? _banSubscription;

  bool get isBanned => _isBanned;
  bool get isDeviceBanned => _isDeviceBanned;
  bool get isLockedOut => _isBanned || _isDeviceBanned;
  String? get banReason => _banReason;
  String? get bannedUntil => _bannedUntil;

  AuthService._internal() {
    _initDeviceBanCheck();

    // Start listening for auth changes to manage ban subscription
    _supabase.auth.onAuthStateChange.listen((data) {
      final user = data.session?.user;
      if (user != null) {
        startBanStatusListener(user.id);
      } else {
        stopBanStatusListener();
      }
    });

    // Initial check if someone is already logged in
    if (currentUser != null) {
      startBanStatusListener(currentUser!.id);
    }
  }

  Future<void> _initDeviceBanCheck() async {
    try {
      final deviceId = await DeviceService().getPersistentDeviceId();
      final response = await _supabase
          .from('banned_devices')
          .select('is_active')
          .eq('device_id', deviceId)
          .eq('is_active', true)
          .maybeSingle();

      if (response != null) {
        _isDeviceBanned = true;
        notifyListeners();
      }
    } catch (e) {
      debugPrint("Device ban check error: $e");
    }
  }

  void startBanStatusListener(String userId) {
    if (_banSubscription != null) return;

    _banSubscription = _supabase
        .channel('public:profiles:id=eq.$userId')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'profiles',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'id',
            value: userId,
          ),
          callback: (payload) {
            final data = payload.newRecord;
            if (data != null) {
              _updateBanStatus(
                (data['is_banned'] == true || data['is_blocked'] == true),
                data['blocked_reason'],
                data['blocked_until'] ?? data['banned_until'],
              );
            }
          },
        )
        .subscribe();

    // Also fetch current state once
    _fetchInitialBanStatus(userId);
  }

  void stopBanStatusListener() {
    _banSubscription?.unsubscribe();
    _banSubscription = null;
    _isBanned = false;
    _banReason = null;
    _bannedUntil = null;
  }

  Future<void> _fetchInitialBanStatus(String userId) async {
    try {
      final data = await _supabase
          .from('profiles')
          .select('is_banned, is_blocked, blocked_reason, blocked_until, banned_until')
          .eq('id', userId)
          .maybeSingle();

      if (data != null) {
        _updateBanStatus(
          (data['is_banned'] == true || data['is_blocked'] == true),
          data['blocked_reason'],
          data['blocked_until'] ?? data['banned_until'],
        );
      }
    } catch (e) {
      debugPrint("Error fetching ban status: $e");
    }
  }

  void _updateBanStatus(bool banned, String? reason, String? until) {
    if (_isBanned == banned && _banReason == reason && _bannedUntil == until) return;
    
    _isBanned = banned;
    _banReason = reason;
    _bannedUntil = until;
    notifyListeners();
  }

  Future<bool> checkProfileExistsByEmail(String email) async {
    try {
      final response = await _supabase
          .from('profiles')
          .select('id')
          .eq('email', email)
          .maybeSingle();
      return response != null;
    } catch (e) {
      debugPrint("Error checking profile existence: $e");
      return false;
    }
  }

  /// Implements the deterministic guest login logic from React (Auth.tsx)
  Future<bool> checkDeviceAccountExists() async {
    try {
      final deviceId = await DeviceService().getPersistentDeviceId();
      final recovery = await _supabase.rpc('recover_session_by_device', params: {'p_device_id': deviceId});
      return recovery != null && (recovery as List).isNotEmpty;
    } catch (_) {
      return false;
    }
  }

  Future<bool> signInWithEmail(String email, String password) async {
    try {
      final response = await _supabase.auth.signInWithPassword(email: email, password: password);
      if (response.session != null) {
        await ApiService().syncLocationAndDevice();
        notifyListeners();
        return true;
      }
      return false;
    } catch (e) {
      debugPrint("Email login error: $e");
      rethrow;
    }
  }

  Future<bool> loginWithDevice() async {
    try {
      final deviceId = await DeviceService().getPersistentDeviceId();
      
      // 1. Try to recover existing account via RPC first (Matches Auth.tsx logic)
      final recovery = await _supabase.rpc('recover_session_by_device', params: {
        'p_device_id': deviceId
      });

      String email;
      String password;

      if (recovery != null && recovery.isNotEmpty) {
        final account = (recovery as List).first;
        email = account['recovery_email'];
        password = account['recovery_password'];
        debugPrint('Found existing account for device via RPC');
      } else {
        // Fallback to deterministic credentials for new accounts
        email = 'guest_$deviceId@meri.local';
        password = 'meri_${deviceId}_secure';
      }

      // 2. Try to sign in
      try {
        final response = await _supabase.auth.signInWithPassword(
          email: email, 
          password: password,
        );
        if (response.session != null) {
          // Sync location and device info after login
          await ApiService().syncLocationAndDevice();
          notifyListeners();
          return true;
        }
      } on AuthException catch (e) {
        if (e.message.contains('Invalid login credentials')) {
          // 3. User doesn't exist, we must sign them up
          final response = await _supabase.auth.signUp(
            email: email,
            password: password,
          );
          if (response.session != null) {
            // Sync location and device info after signup
            await ApiService().syncLocationAndDevice();
            
            // [NEW] Track referral attribution immediately after account creation
            await ApiService().trackReferral();
            
            notifyListeners();
            return true;
          }
        }
      }
      return false;
    } catch (e) {
      debugPrint("Auth Error: $e");
      return false;
    }
  }

  Future<void> signOut() async {
    await _supabase.auth.signOut();
    notifyListeners();
  }
}


