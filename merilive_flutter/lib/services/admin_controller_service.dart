import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'dart:convert';
import 'package:merilive_app/utils/financial_math.dart';

/// AdminControllerService
/// 
/// This is the master controller for all logic within the Flutter app.
/// Instead of hardcoding feature flags, pricing, or rules, the app listens
/// to the 'app_settings' table in Supabase, which is managed by the Admin Panel.
class AdminControllerService extends ChangeNotifier {
  // Singleton pattern for easy global access
  static final AdminControllerService _instance = AdminControllerService._internal();
  factory AdminControllerService() => _instance;
  AdminControllerService._internal();

  // Internal state holding the latest remote config
  Map<String, dynamic> _appConfig = {};
  Map<String, dynamic> _branding = {
    'logo_text_primary': 'meri',
    'logo_text_secondary': 'LIVE',
    'tagline': 'Connect, Share, Live.',
    'background_url': '',
    'logo_url': '',
  };
  
  List<Map<String, dynamic>> _userTiers = [];
  List<Map<String, dynamic>> _hostTiers = [];
  List<Map<String, dynamic>> _vipTiers = [];
  List<Map<String, dynamic>> _shopItems = [];
  List<Map<String, dynamic>> _partyBackgrounds = [];
  List<Map<String, dynamic>> _gameSettings = [];

  bool _isLoading = true;
  bool get isLoading => _isLoading;

  Future<void> initializeSettingsSync() async {
    final supabase = Supabase.instance.client;

    try {
      // 1. Initial Fetch for Branding
      final brandingResp = await supabase
          .from('branding_settings')
          .select('*')
          .limit(1)
          .maybeSingle();
      
      if (brandingResp != null) {
        _updateBrandingFromData(brandingResp);
      }

      // 2. Initial Fetch for App Settings
      final settingsResp = await supabase
          .from('app_settings')
          .select('setting_key, setting_value');
      
      for (var setting in settingsResp) {
        final key = setting['setting_key'];
        final val = _parseValue(setting['setting_value']);
        _appConfig[key] = val;
        
        if (key == 'branding' || key == 'login_branding') {
          _updateBrandingFromData(val is Map<String, dynamic> ? val : {'setting_value': val});
        }
      }
      
      // Initialize FinancialMath parity
      _syncFinancialMath();

      // 5. Initial Fetch for Level Tiers
      final tierResp = await supabase.from('user_level_tiers').select('*').eq('is_active', true).order('level_number', ascending: true);
      _userTiers = (tierResp as List).where((t) => t['tier_type'] == 'user').map((e) => Map<String, dynamic>.from(e)).toList();
      _hostTiers = (tierResp as List).where((t) => t['tier_type'] == 'host').map((e) => Map<String, dynamic>.from(e)).toList();

      _isLoading = false;
      notifyListeners();

      // 6. Initial Fetch for VIP, Shop and Games
      _refreshVIPAndShop(supabase);
      _refreshGames(supabase);

      // 7. Realtime Listeners
      _setupRealtimeListeners(supabase);

    } catch (e) {
      debugPrint("Error initializing AdminController: $e");
      _isLoading = false;
      notifyListeners();
    }
  }

  void _syncFinancialMath() {
      FinancialMath.beansPerUsd = beansPerUsd;
      FinancialMath.defaultAgencyPercent = defaultAgencyPercent;
      FinancialMath.hostCallPercent = hostCallPercent;
      FinancialMath.hostGiftPercent = hostGiftPercent;
      FinancialMath.callGracePeriodSeconds = callGracePeriod;
      FinancialMath.exchangeFeePercent = exchangeFeePercent;
      FinancialMath.agencyCommissionTiers = agencyCommissionTiers;
  }

  void _setupRealtimeListeners(SupabaseClient supabase) {
      // Tiers
      supabase.channel('public:user_level_tiers')
          .onPostgresChanges(
            event: PostgresChangeEvent.all,
            schema: 'public',
            table: 'user_level_tiers',
            callback: (payload) => _refreshTiers(supabase),
          ).subscribe();

      // App Settings
      supabase.channel('public:app_settings')
          .onPostgresChanges(
            event: PostgresChangeEvent.all,
            schema: 'public',
            table: 'app_settings',
            callback: (payload) {
                final key = payload.newRecord['setting_key'];
                final val = _parseValue(payload.newRecord['setting_value']);
                _appConfig[key] = val;
                
                if (key == 'branding' || key == 'login_branding') {
                  _updateBrandingFromData(val is Map<String, dynamic> ? val : {'setting_value': val});
                }

                // Push updates to FinancialMath
                _syncFinancialMath();
                
                notifyListeners();
            },
          ).subscribe();

      // Branding
      supabase.channel('public:branding_settings')
          .onPostgresChanges(
            event: PostgresChangeEvent.all,
            schema: 'public',
            table: 'branding_settings',
            callback: (payload) {
              if (payload.newRecord.isNotEmpty) {
                _updateBrandingFromData(payload.newRecord);
                notifyListeners();
              }
            },
          ).subscribe();

      // VIP/Shop
      supabase.channel('public:vip_shop')
          .onPostgresChanges(event: PostgresChangeEvent.all, schema: 'public', table: 'vip_tiers', callback: (p) => _refreshVIPAndShop(supabase))
          .onPostgresChanges(event: PostgresChangeEvent.all, schema: 'public', table: 'shop_items', callback: (p) => _refreshVIPAndShop(supabase))
          .onPostgresChanges(event: PostgresChangeEvent.all, schema: 'public', table: 'party_room_backgrounds', callback: (p) => _refreshVIPAndShop(supabase))
          .subscribe();

      // Games
      supabase.channel('public:game_configs')
          .onPostgresChanges(event: PostgresChangeEvent.all, schema: 'public', table: 'game_configs', callback: (p) => _refreshGames(supabase))
          .subscribe();
  }

  Future<void> _refreshTiers(SupabaseClient supabase) async {
    final tierResp = await supabase.from('user_level_tiers').select('*').eq('is_active', true).order('level_number', ascending: true);
    _userTiers = (tierResp as List).where((t) => t['tier_type'] == 'user').map((e) => Map<String, dynamic>.from(e)).toList();
    _hostTiers = (tierResp as List).where((t) => t['tier_type'] == 'host').map((e) => Map<String, dynamic>.from(e)).toList();
    notifyListeners();
  }

  Future<void> _refreshVIPAndShop(SupabaseClient supabase) async {
    try {
      final vipResp = await supabase.from('vip_tiers').select('*').eq('is_active', true).order('display_order', ascending: true);
      _vipTiers = List<Map<String, dynamic>>.from(vipResp);

      final shopResp = await supabase.from('shop_items').select('*').eq('is_active', true).order('display_order', ascending: true);
      _shopItems = List<Map<String, dynamic>>.from(shopResp);

      final bgResp = await supabase.from('party_room_backgrounds').select('*').eq('is_active', true).eq('is_premium', true).order('display_order', ascending: true);
      _partyBackgrounds = List<Map<String, dynamic>>.from(bgResp).map((bg) {
        bg['category'] = 'party_background'; 
        return bg;
      }).toList();
      
      notifyListeners();
    } catch (e) {
      debugPrint("Error refreshing VIP/Shop: $e");
    }
  }

  Future<void> _refreshGames(SupabaseClient supabase) async {
    try {
      final resp = await supabase.from('game_configs').select('*').order('game_id', ascending: true);
      _gameSettings = List<Map<String, dynamic>>.from(resp);
      notifyListeners();
    } catch (e) {
      debugPrint("Error refreshing Game Configs: $e");
    }
  }

  String _normalizeUrl(String? url) {
    if (url == null || url.isEmpty) return '';
    if (url.startsWith('http')) return url;
    const String storageBase = 'https://ayjdlvuurscxucatbbah.supabase.co/storage/v1/object/public';
    if (url.startsWith('/')) return '$storageBase$url';
    return '$storageBase/branding/$url';
  }

  void _updateBrandingFromData(Map<String, dynamic> data) {
    if (data['setting_value'] != null) {
      final parsed = data['setting_value'] is String ? json.decode(data['setting_value']) : data['setting_value'];
      _branding['logo_text_primary'] = parsed['logo_text_primary'] ?? _branding['logo_text_primary'];
      _branding['logo_text_secondary'] = parsed['logo_text_secondary'] ?? _branding['logo_text_secondary'];
      _branding['tagline'] = parsed['tagline'] ?? _branding['tagline'];
      _branding['logo_url'] = _normalizeUrl(parsed['logo_url'] ?? parsed['app_logo']);
      _branding['background_url'] = _normalizeUrl(parsed['background_url'] ?? parsed['background_image'] ?? parsed['login_bg']);
    } else {
      _branding['logo_text_primary'] = data['logo_text_primary'] ?? _branding['logo_text_primary'];
      _branding['logo_text_secondary'] = data['logo_text_secondary'] ?? _branding['logo_text_secondary'];
      _branding['tagline'] = data['tagline'] ?? _branding['tagline'];
      _branding['logo_url'] = _normalizeUrl(data['logo_url'] ?? data['app_logo']);
      final rawBg = data['background_url'] ?? data['background_image'] ?? data['login_bg'];
      _branding['background_url'] = _normalizeUrl(rawBg ?? _branding['background_url']);
    }
    notifyListeners();
  }

  dynamic _parseValue(dynamic val) {
    if (val is String) {
      try {
        return json.decode(val);
      } catch (_) {
        return val;
      }
    }
    return val;
  }

  // --- Convenience Getters ---
  bool get isMaintenanceMode => _appConfig['maintenance_mode'] == true;
  bool get areGamesEnabled => _appConfig['enable_games'] == true;
  bool get arePartyRoomsEnabled => _appConfig['enable_party_rooms'] == true;
  Map<String, dynamic> get branding => _branding;

  int get goLiveMinLevel => _appConfig['go_live_min_level'] is int ? _appConfig['go_live_min_level'] as int : 5;
  int get defaultCallPrice => _appConfig['default_call_price'] is int ? _appConfig['default_call_price'] as int : 50;
  int get minLevelForCustomPrice => _appConfig['min_level_for_custom_price'] is int ? _appConfig['min_level_for_custom_price'] as int : 5;

  dynamic getSetting(String key, {dynamic defaultValue}) {
    return _appConfig.containsKey(key) ? _appConfig[key] : defaultValue;
  }

  int get beansPerUsd {
    final withdrawal = getSetting('withdrawal_settings');
    if (withdrawal != null && withdrawal is Map && withdrawal.containsKey('coins_to_dollar_rate')) {
      final rate = withdrawal['coins_to_dollar_rate'];
      return (rate as num).toInt();
    }
    return 1000; // Default
  }

  double get hostGiftPercent {
    final giftCfg = getSetting('gift_commission');
    if (giftCfg != null && giftCfg is Map && giftCfg.containsKey('host_percent')) {
      return (giftCfg['host_percent'] as num) / 100.0;
    }
    return 0.40;
  }

  double get hostCallPercent {
    final callCfg = getSetting('call_commission');
    if (callCfg != null && callCfg is Map && callCfg.containsKey('host_percent')) {
      return (callCfg['host_percent'] as num) / 100.0;
    }
    return 0.40;
  }

  int get callGracePeriod => (getSetting('call_commission', defaultValue: {})['grace_period'] as num? ?? 21).toInt();

  List<Map<String, dynamic>> get agencyCommissionTiers {
    final agencyCfg = getSetting('agency_commission');
    if (agencyCfg != null && agencyCfg is Map && agencyCfg.containsKey('tiers')) {
      return List<Map<String, dynamic>>.from(agencyCfg['tiers']);
    }
    return [{'min_usd': 0, 'percent': 3}];
  }

  List<Map<String, dynamic>> get userTiers => _userTiers;
  List<Map<String, dynamic>> get hostTiers => _hostTiers;
  List<Map<String, dynamic>> get vipTiers => _vipTiers;
  List<Map<String, dynamic>> get shopItems => [..._shopItems, ..._partyBackgrounds];
  List<Map<String, dynamic>> get gameSettings => _gameSettings;

  int resolveLevel(int points, String type) {
    final tiers = type == 'host' ? _hostTiers : _userTiers;
    final key = type == 'host' ? 'min_earning_amount' : 'min_topup_amount';
    int level = 0;
    for (var tier in tiers) {
      if (points >= (tier[key] ?? 0)) {
        level = tier['level_number'] ?? 0;
      } else {
        break;
      }
    }
    return level;
  }

  double calculateProgress(int points, String type) {
    final tiers = type == 'host' ? _hostTiers : _userTiers;
    if (tiers.isEmpty) return 0.0;
    final key = type == 'host' ? 'min_earning_amount' : 'min_topup_amount';
    int currentLevel = resolveLevel(points, type);
    Map<String, dynamic>? currentTier;
    Map<String, dynamic>? nextTier;
    for (int i = 0; i < tiers.length; i++) {
        if (tiers[i]['level_number'] == currentLevel) {
            currentTier = tiers[i];
            if (i + 1 < tiers.length) nextTier = tiers[i + 1];
            break;
        }
    }
    if (currentTier == null) currentTier = tiers.first;
    if (nextTier == null) return 1.0;
    final min = (currentTier[key] ?? 0) as num;
    final max = (nextTier[key] ?? 1) as num;
    if (max == min) return 1.0;
    return ((points - min) / (max - min)).clamp(0.0, 1.0).toDouble();
  }

  double get exchangeFeePercent => (getSetting('exchange_fee_percent', defaultValue: 5) as num).toDouble() / 100.0;
  double get defaultAgencyPercent => (getSetting('default_agency_percent', defaultValue: 2) as num).toDouble() / 100.0;

  FeatureAccessResult canAccessFeature(String featureKey, int level, bool isHost) {
    final Map<String, dynamic> requirements = getSetting('feature_level_requirements', defaultValue: {});
    final int requiredLevel = (requirements[featureKey] as num? ?? (featureKey == 'go_live' ? 5 : featureKey == 'create_party' ? 10 : 0)).toInt();
    if (level >= requiredLevel || (isHost && (featureKey == 'go_live' || featureKey == 'create_party'))) {
      return FeatureAccessResult(canAccess: true, requiredLevel: requiredLevel, currentLevel: level);
    }
    return FeatureAccessResult(canAccess: false, requiredLevel: requiredLevel, currentLevel: level);
  }
}

class FeatureAccessResult {
  final bool canAccess;
  final int requiredLevel;
  final int currentLevel;
  FeatureAccessResult({required this.canAccess, required this.requiredLevel, required this.currentLevel});
}
