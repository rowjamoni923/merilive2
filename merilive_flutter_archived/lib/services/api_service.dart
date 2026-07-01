import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/trader_model.dart';
import '../models/payment_gateway_model.dart';
import '../models/package_model.dart';
import '../models/profile_model.dart';

class ApiService extends ChangeNotifier {
  static final ApiService _instance = ApiService._internal();
  factory ApiService() => _instance;
  ApiService._internal();

  final _supabase = Supabase.instance.client;
  SupabaseClient getSupabase() => _supabase;

  // Owner emails (parity with web AdminLayout.tsx)
  static const List<String> OWNER_EMAILS = [
    "smtv923@gmail.com",
    "sazzadshifa776@gmail.com",
  ];

  bool get isOwner {
    final email = _supabase.auth.currentUser?.email;
    return email != null && OWNER_EMAILS.contains(email.toLowerCase());
  }

  Future<bool> get isAdmin async {
    if (isOwner) return true;
    final profile = await getMyProfile();
    // In our system, sub-admins are also considered admins for dashboard entry
    return profile?['is_admin'] == true || profile?['role'] == 'admin' || profile?['role'] == 'sub_admin';
  }

  /// Fetches accessible sections/hubs for sub-admins
  Future<List<String>> getAccessibleHubs() async {
    if (isOwner) {
      return [
        'user-hub', 'agency-hub', 'level-hub', 'vip-hub', 'visual-hub', 
        'trader-hub', 'finance-hub', 'game-hub', 'party-hub', 'content-hub', 
        'shop-hub', 'settings-hub', 'moderation-hub'
      ];
    }
    
    try {
      final res = await _supabase.rpc('get_accessible_sections', params: {
        '_user_id': currentUserId,
      });
      
      final List<dynamic> data = res ?? [];
      final hubs = data.map((e) => e['hub_key'].toString()).toSet().toList();
      return hubs;
    } catch (e) {
      debugPrint("Error fetching accessible hubs: $e");
      return [];
    }
  }

  /// Checks if current user has access to a specific hub
  Future<bool> hasHubAccess(String hubKey) async {
    if (isOwner) return true;
    final hubs = await getAccessibleHubs();
    return hubs.contains(hubKey);
  }

  /// Resolves a path from Supabase storage into a full public URL for parity
  String resolveAssetUrl(String? path, {String bucket = 'banners'}) {
    if (path == null || path.isEmpty) return '';
    if (path.startsWith('http')) return path;

    // Smart Bucket Detection if not provided
    String targetBucket = bucket;
    if (bucket == 'banners') {
      if (path.contains('frame')) targetBucket = 'avatar_frames';
      else if (path.contains('gift')) targetBucket = 'gifts';
      else if (path.contains('avatar')) targetBucket = 'avatars';
      else if (path.contains('entry') || path.contains('animation')) targetBucket = 'animations';
      else if (path.contains('bg') || path.contains('back')) targetBucket = 'backgrounds';
    }

    return _supabase.storage.from(targetBucket).getPublicUrl(path);
  }

  /// Fetches all active banners ordered by display_order
  /// Parity with web Index.tsx: Includes both inline and popup banners
  Future<List<Map<String, dynamic>>> getActiveBanners({String? position}) async {
    try {
      var query = _supabase.from('banners')
          .select('*')
          .eq('is_active', true)
          .order('display_order', ascending: true);
      
      if (position != null) {
        query = query.eq('position', position);
      }

      final res = await query;
      final List<Map<String, dynamic>> banners = List<Map<String, dynamic>>.from(res);
      
      // Filter by date if applicable
      final now = DateTime.now();
      return banners.where((b) {
        if (b['start_date'] != null && DateTime.parse(b['start_date']).isAfter(now)) return false;
        if (b['end_date'] != null && DateTime.parse(b['end_date']).isBefore(now)) return false;
        return true;
      }).toList();
    } catch (e) {
      debugPrint("Error fetching banners: $e");
      return [];
    }
  }

  /// Fetches entry popup banners (Parity with EventPopupBanner.dart)
  Future<Map<String, dynamic>?> getEntryPopupBanner() async {
    try {
      final now = DateTime.now().toIso8601String();
      final res = await _supabase
          .from('popup_event_banners')
          .select('*')
          .eq('is_active', true)
          .gte('end_date', now)
          .order('display_order')
          .limit(1)
          .maybeSingle();
      return res;
    } catch (e) {
      debugPrint("Error fetching popup banner: $e");
      return null;
    }
  }

  Future<List<Map<String, dynamic>>> getLiveRooms() async {
    final res = await _supabase.from('live_streams').select('*, host:profiles(*)').eq('is_active', true);
    return List<Map<String, dynamic>>.from(res);
  }

  Future<Map<String, dynamic>> getGameConfig(String gameId) async {
    final res = await _supabase.from('game_configs').select().eq('game_id', gameId).maybeSingle();
    return res ?? {};
  }


  Future<List<String>> getGamesWinnerTicker() async {
    return ["User1 won 5000 💎", "User2 won 12000 💎", "User3 won 2000 💎"];
  }

  Future<void> updateLikeCount(String reelId, String newCount) async {
    await _supabase.from('reels').update({'likes_count': int.parse(newCount)}).eq('id', reelId);
  }

  String? get currentUserId => _supabase.auth.currentUser?.id;

  Map<String, dynamic>? get currentUserProfile => _supabase.auth.currentUser?.userMetadata;
  
  String generateConversationId(String otherUserId) {
    final myId = currentUserId ?? '';
    final ids = [myId, otherUserId]..sort();
    return ids.join('_');
  }

  Future<int> resolveUserLevel(String userId) async {
    final p = await getProfile(userId);
    return (p?['user_level'] ?? 1);
  }

  Future<int> resolveHostLevel(String userId) async {
    final p = await getProfile(userId);
    return (p?['host_level'] ?? 1);
  }

  Future<void> logout() async {
    await _supabase.auth.signOut();
  }

  String formatNumber(dynamic value) {
    if (value == null) return "0";
    final num n = (value is String) ? (double.tryParse(value) ?? 0) : value;
    if (n >= 1000000) return "${(n / 1000000).toStringAsFixed(1)}M";
    if (n >= 1000) return "${(n / 1000).toStringAsFixed(1)}K";
    return n.toString();
  }

  Future<Map<String, dynamic>?> getProfile(String userId) async {
    final id = userId.isEmpty ? _supabase.auth.currentUser?.id : userId;
    if (id == null) return null;
    return await _supabase.from('profiles').select('*').eq('id', id).maybeSingle();
  }

  Future<Map<String, dynamic>?> getMyProfile() async {
    return await getProfile('');
  }

  Future<ProfileModel?> getProfileModel(String userId) async {
    final data = await getProfile(userId);
    if (data == null) return null;
    
    // Check if trader
    final traderRes = await _supabase.from('topup_helpers').select('id, trader_level').eq('user_id', data['id']).eq('is_verified', true).maybeSingle();
    final isTrader = traderRes != null;
    
    data['is_trader'] = isTrader;
    if (isTrader) {
      data['trader_level'] = traderRes['trader_level'];
    }
    
    return ProfileModel.fromJson(data);
  }

  Future<int> resolveUserBalance([String? userId]) async {
    final id = userId ?? _supabase.auth.currentUser?.id;
    if (id == null) return 0;
    final p = await getProfile(id);
    return (p?['coins'] ?? p?['diamond_balance'] ?? 0);
  }

  /// Fetches combined trader wallet balance (Helper Wallet + Agency Diamonds)
  /// Parity with Web Profile.tsx: (traderWallet + agencyData.diamond_balance)
  Future<Map<String, dynamic>> getCombinedTraderWallet() async {
    final userId = currentUserId;
    if (userId == null) return {'total': 0, 'helper': 0, 'agency': 0};

    try {
      final results = await Future.wait([
        _supabase.from('topup_helpers').select('wallet_balance').eq('user_id', userId).eq('is_verified', true).maybeSingle(),
        _supabase.from('agencies').select('diamond_balance').eq('owner_id', userId).eq('is_active', true).maybeSingle(),
      ]);

      final double helperBalance = (results[0]?['wallet_balance']?.toDouble() ?? 0.0);
      final int agencyDiamonds = (results[1]?['diamond_balance'] ?? 0);

      return {
        'total': helperBalance + agencyDiamonds,
        'helper': helperBalance,
        'agency': agencyDiamonds,
      };
    } catch (e) {
      debugPrint("Error fetching combined wallet: $e");
      return {'total': 0, 'helper': 0, 'agency': 0};
    }
  }

  /// Fetches financial settings (beans_to_usd_rate, etc.) from app_settings
  Future<Map<String, dynamic>> getFinanceSettings() async {
    try {
      final results = await Future.wait([
        _supabase.from('app_settings').select('setting_value').eq('setting_key', 'beans_to_usd_rate').maybeSingle(),
        _supabase.from('app_settings').select('setting_value').eq('setting_key', 'call_rates').maybeSingle(),
        _supabase.from('app_settings').select('setting_value').eq('setting_key', 'withdrawal_fees').maybeSingle(),
      ]);

      final beansRate = results[0]?['setting_value'];
      final callRates = results[1]?['setting_value'];
      final fees = results[2]?['setting_value'];

      return {
        'beans_per_usd': (beansRate is Map ? beansRate['rate'] : null) ?? 9000,
        'call_rates': callRates ?? {},
        'withdrawal_fees': fees ?? {},
      };
    } catch (e) {
      debugPrint("Error fetching finance settings: $e");
      return {'beans_per_usd': 9000};
    }
  }

  /// Fetches country-specific configuration for withdrawals
  Future<Map<String, dynamic>?> getCountryConfig(String countryCode) async {
    try {
      final res = await _supabase.from('currency_rates')
          .select('*')
          .eq('country_code', countryCode)
          .eq('is_active', true)
          .maybeSingle();
      return res;
    } catch (e) {
      return null;
    }
  }

  Future<Map<String, dynamic>> sendGiftTransaction({
    required String hostId,
    required String giftId,
    required int amount,
  }) async {
    try {
      final response = await _supabase.rpc('send_gift_v2', params: { 'p_host_id': hostId, 'p_gift_id': giftId, 'p_amount': amount });
      return Map<String, dynamic>.from(response);
    } catch (e) { return {'success': false, 'error': e.toString()}; }
  }

  Future<Map<String, dynamic>> processCallMinuteBilling({
    required String hostId,
    int? ratePerMinute,
    String? callSessionId,
  }) async {
    try {
      final response = await _supabase.rpc('bill_call_minute', params: { 'p_host_id': hostId, 'p_amount': ratePerMinute ?? 50, 'p_session_id': callSessionId });
      return Map<String, dynamic>.from(response);
    } catch (e) { return {'success': false, 'error': e.toString()}; }
  }

  Stream<List<Map<String, dynamic>>> getNotificationsStream() {
    final userId = _supabase.auth.currentUser?.id;
    if (userId == null) return Stream.value([]);
    return _supabase.from('notifications').stream(primaryKey: ['id']).eq('user_id', userId).order('created_at', ascending: false).map((data) => List<Map<String, dynamic>>.from(data));
  }

  Stream<List<Map<String, dynamic>>> getConversationsStream() {
    final userId = _supabase.auth.currentUser?.id;
    if (userId == null) return Stream.value([]);

    return _supabase.from('conversations')
        .stream(primaryKey: ['id'])
        .order('last_message_at', ascending: false)
        .asyncMap((data) async {
          final List<Map<String, dynamic>> enriched = [];
          for (var conv in data) {
            if (conv['user1_id'] == userId || conv['user2_id'] == userId) {
              final otherId = conv['user1_id'] == userId ? conv['user2_id'] : conv['user1_id'];
              // Fetch other user profile if not present or stale
              final otherProfile = await getProfile(otherId);
              
              // Count unread messages
              final unreadRes = await _supabase.from('messages')
                  .select('id', const CountOption.exact())
                  .eq('conversation_id', conv['id'])
                  .eq('is_read', false)
                  .neq('sender_id', userId);
              
              enriched.add({
                ...conv,
                'other_user': otherProfile,
                'unread_count': unreadRes.count ?? 0,
              });
            }
          }
          return enriched;
        });
  }

  Future<void> markMessagesAsRead(String conversationId) async {
    try {
      final userId = _supabase.auth.currentUser?.id;
      if (userId == null) return;
      await _supabase.from('messages')
          .update({'is_read': true})
          .eq('conversation_id', conversationId)
          .neq('sender_id', userId);
    } catch (e) {
      debugPrint("Error marking messages as read: $e");
    }
  }

  Future<List<Map<String, dynamic>>> getGiftTransactionsList(String userId) async {
    try {
      final res = await _supabase.from('gift_transactions')
          .select('gift_id, coin_amount, sender_id, created_at, gifts(name, icon_url), sender:profiles!gift_transactions_sender_id_fkey(display_name, avatar_url, app_uid)')
          .eq('receiver_id', userId)
          .order('created_at', ascending: false)
          .limit(20);
      return List<Map<String, dynamic>>.from(res);
    } catch (e) {
      return [];
    }
  }

  Future<List<Map<String, dynamic>>> getGiftsSentList(String userId) async {
    try {
      final res = await _supabase.from('gift_transactions')
          .select('gift_id, coin_amount, receiver_id, created_at, gifts(name, icon_url), receiver:profiles!gift_transactions_receiver_id_fkey(display_name, avatar_url, app_uid)')
          .eq('sender_id', userId)
          .order('created_at', ascending: false)
          .limit(20);
      return List<Map<String, dynamic>>.from(res);
    } catch (e) {
      return [];
    }
  }

  Future<List<Map<String, dynamic>>> getUserGroups(String userId) async {
    try {
      final res = await _supabase.from('group_members')
          .select('group_id, groups(*)')
          .eq('user_id', userId)
          .limit(10);
      return (res as List).map((m) => Map<String, dynamic>.from(m['groups'])).toList();
    } catch (e) {
      return [];
    }
  }

  Future<List<Map<String, dynamic>>> getPosterImages(String userId) async {
    try {
      final res = await _supabase.from('poster_images')
          .select('image_url, video_url, display_order')
          .eq('user_id', userId)
          .order('display_order', ascending: true);
      return List<Map<String, dynamic>>.from(res);
    } catch (e) {
      return [];
    }
  }

  Stream<List<Map<String, dynamic>>> getOfficialNoticesStream() {
    return _supabase.from('notifications')
        .stream(primaryKey: ['id'])
        .eq('type', 'official')
        .order('created_at', ascending: false)
        .map((data) => List<Map<String, dynamic>>.from(data));
  }

  Future<List<Map<String, dynamic>>> getChatGifts() async {
    try {
      final res = await _supabase.from('gifts')
          .select('*')
          .eq('is_active', true)
          .order('coins', ascending: true);
      return List<Map<String, dynamic>>.from(res);
    } catch (e) {
      return [];
    }
  }

  Future<void> sendMessage(String conversationId, String content, {String type = 'text'}) async {
    final userId = _supabase.auth.currentUser?.id;
    if (userId == null) return;

    await _supabase.from('messages').insert({
      'conversation_id': conversationId,
      'sender_id': userId,
      'content': content,
      'message_type': type,
    });

    // Update conversation last message
    await _supabase.from('conversations').update({
      'last_message': type == 'gift' ? 'Sent a gift 🎁' : (type == 'audio' ? 'Sent a voice message 🎙️' : content),
      'last_message_at': DateTime.now().toIso8601String(),
    }).eq('id', conversationId);
  }

  Future<Map<String, dynamic>> sendChatGift({
    required String conversationId,
    required String giftId,
    required String receiverId,
  }) async {
    try {
      final res = await _supabase.functions.invoke('process-chat-gift', body: {
        'conversationId': conversationId,
        'giftId': giftId,
        'receiverId': receiverId,
      });
      return Map<String, dynamic>.from(res.data ?? {});
    } catch (e) {
      debugPrint("sendChatGift error: $e");
      return {'success': false, 'error': e.toString()};
    }
  }

  Future<String?> uploadChatMedia(String filePath, String bucket) async {
    try {
      final file = File(filePath);
      final fileName = '${DateTime.now().millisecondsSinceEpoch}_${filePath.split('/').last}';
      await _supabase.storage.from(bucket).upload(fileName, file);
      return _supabase.storage.from(bucket).getPublicUrl(fileName);
    } catch (e) {
      return null;
    }
  }

  Future<Map<String, dynamic>> getAgencySummary(String agencyId) async {
    try {
      final results = await Future.wait([
        _supabase.from('agencies').select('*').eq('id', agencyId).maybeSingle(),
        _supabase.from('agency_hosts').select('id', const CountOption.exact()).eq('agency_id', agencyId).eq('status', 'active'),
        _supabase.from('agency_hosts').select('id', const CountOption.exact()).eq('agency_id', agencyId).eq('status', 'active').eq('profiles(is_online)', true),
      ]);

      final agency = results[0] as Map<String, dynamic>?;
      if (agency == null) return {};

      return {
        ...agency,
        'hosts_count': (results[1] as PostgrestResponse).count ?? 0,
        'online_hosts': (results[2] as PostgrestResponse).count ?? 0,
      };
    } catch (e) {
      return {};
    }
  }

  Future<List<Map<String, dynamic>>> getAgencyHosts(String agencyId, String status) async {
    final res = await _supabase.from('agency_hosts').select('*, profile:profiles(*)').eq('agency_id', agencyId).eq('status', status);
    return List<Map<String, dynamic>>.from(res);
  }

  Future<bool> manageHostRequest({required String requestId, required String action, String? agencyId}) async {
    try {
      final res = await _supabase.rpc('manage_agency_host', params: { 'p_request_id': requestId, 'p_action': action, 'p_agency_id': agencyId });
      return res != null;
    } catch (e) { return false; }
  }

  Future<bool> joinAgency(String agencyId) async {
    try {
      await _supabase.from('agency_requests').insert({ 'agency_id': agencyId, 'user_id': _supabase.auth.currentUser?.id, 'status': 'pending' });
      return true;
    } catch (e) { return false; }
  }

  Future<bool> cancelAgencyRequest(String requestId) async {
    try {
      await _supabase.from('agency_requests').delete().eq('id', requestId);
      return true;
    } catch (e) { return false; }
  }

  Future<List<Map<String, dynamic>>> getMyPrivileges() async {
    final userId = _supabase.auth.currentUser?.id;
    if (userId == null) return [];
    return getUserPrivileges(userId);
  }

  Future<List<Map<String, dynamic>>> getUserPrivilegesUnified(String userId) async {
    try {
      // 1. Fetch from Multiple Sources
      final results = await Future.wait([
        _supabase.from('user_purchases').select('*, shop_items(*)').eq('user_id', userId).eq('is_active', true),
        _supabase.from('avatar_frames').select('*').eq('is_active', true),
        _supabase.from('level_privileges').select('*').eq('is_active', true),
        _supabase.from('entry_name_bars').select('*').eq('is_active', true),
        _supabase.from('entry_banners').select('*').eq('is_active', true),
        _supabase.from('vehicle_entrances').select('*').eq('is_active', true),
        _supabase.from('user_role_frames').select('*, role_frames(*)').eq('user_id', userId),
      ]);

      final List<Map<String, dynamic>> allPrivileges = [];
      final profile = await getProfile(userId);
      final int userLevel = profile?['user_level'] ?? 1;

      // Map results to unified structure
      // (Simplified logic for now, matching web's filtering)
      
      // Shop Purchases
      final purchases = List<Map<String, dynamic>>.from(results[0] as List);
      for (var p in purchases) {
        final item = p['shop_items'];
        if (item == null) continue;
        allPrivileges.add({
          'id': p['id'],
          'item_id': item['id'],
          'name': item['name'],
          'category': item['category'],
          'preview_url': resolveAssetUrl(item['preview_url']),
          'animation_url': resolveAssetUrl(item['animation_url'] ?? item['animation_file_url']),
          'is_equipped': p['is_equipped'] ?? false,
          'expires_at': p['expires_at'],
          'source': 'shop',
        });
      }

      // Level Unlocks
      final frames = List<Map<String, dynamic>>.from(results[1] as List);
      for (var f in frames) {
        if ((f['min_level'] ?? 1) <= userLevel) {
          allPrivileges.add({
            'id': 'frame_${f['id']}',
            'item_id': f['id'],
            'name': f['name'],
            'category': 'frame',
            'preview_url': resolveAssetUrl(f['preview_url']),
            'animation_url': resolveAssetUrl(f['frame_url']),
            'is_equipped': profile?['equipped_frame_id'] == f['id'],
            'source': 'level',
            'unlock_level': f['min_level'],
          });
        }
      }

      // Level Unlocks: Entry Name Bars
      final entryNameBars = List<Map<String, dynamic>>.from(results[3] as List);
      for (var bar in entryNameBars) {
        if ((bar['level_required'] ?? 1) <= userLevel) {
          allPrivileges.add({
            'id': 'enb_${bar['id']}',
            'item_id': bar['id'],
            'name': bar['name'],
            'category': 'entry_name_bar',
            'preview_url': resolveAssetUrl(bar['image_url']),
            'animation_url': resolveAssetUrl(bar['animation_url'] ?? bar['image_url']),
            'is_equipped': profile?['equipped_entry_name_bar_id'] == bar['id'],
            'source': 'level',
            'unlock_level': bar['level_required'],
          });
        }
      }

      // Level Unlocks: Entry Banners (Entrance)
      final entryBanners = List<Map<String, dynamic>>.from(results[4] as List);
      for (var banner in entryBanners) {
        if ((banner['level_required'] ?? 1) <= userLevel) {
          allPrivileges.add({
            'id': 'eb_${banner['id']}',
            'item_id': banner['id'],
            'name': banner['name'],
            'category': 'entrance',
            'preview_url': resolveAssetUrl(banner['image_url']),
            'animation_url': resolveAssetUrl(banner['animation_url'] ?? banner['image_url']),
            'is_equipped': profile?['equipped_entrance_id'] == banner['id'],
            'source': 'level',
            'unlock_level': banner['level_required'],
          });
        }
      }

      // Vehicles
      final vehicles = List<Map<String, dynamic>>.from(results[5] as List);
      for (var v in vehicles) {
        if ((v['level_required'] ?? 1) <= userLevel) {
          allPrivileges.add({
            'id': 'v_${v['id']}',
            'item_id': v['id'],
            'name': v['name'],
            'category': 'vehicle',
            'preview_url': resolveAssetUrl(v['image_url']),
            'animation_url': resolveAssetUrl(v['animation_url'] ?? v['image_url']),
            'is_equipped': profile?['equipped_vehicle_id'] == v['id'],
            'source': 'level',
            'unlock_level': v['level_required'],
          });
        }
      }

      return allPrivileges;
    } catch (e) {
      debugPrint("Error fetching unified privileges: $e");
      return [];
    }
  }

  Future<List<Map<String, dynamic>>> getUserReels(String userId) async {
    try {
      final res = await _supabase.from('reels')
          .select('*')
          .eq('user_id', userId)
          .eq('is_active', true)
          .eq('is_approved', true)
          .order('created_at', ascending: false);
      return List<Map<String, dynamic>>.from(res);
    } catch (e) {
      return [];
    }
  }

  Future<List<Map<String, dynamic>>> getUserGroups(String userId) async {
    try {
      final res = await _supabase.from('group_members')
          .select('group_id, groups(id, name, avatar_url, member_count, description)')
          .eq('user_id', userId)
          .limit(10);
      return (res as List).map((m) => Map<String, dynamic>.from(m['groups'])).toList();
    } catch (e) {
      return [];
    }
  }

  Future<List<Map<String, dynamic>>> getVIPTiers() async {
    final res = await _supabase.from('vip_tiers').select('*').eq('is_active', true).order('display_order');
    return List<Map<String, dynamic>>.from(res);
  }

  Future<Map<String, dynamic>?> getUserVIPSubscription() async {
    final userId = currentUserId;
    if (userId == null) return null;
    final res = await _supabase
        .from("user_vip_subscriptions")
        .select("vip_tier_id, vip_tiers(tier_level, tier_name), expires_at")
        .eq("user_id", userId)
        .eq("is_active", true)
        .gte("expires_at", DateTime.now().toIso8601String())
        .order("created_at", ascending: false)
        .limit(1)
        .maybeSingle();
    return res;
  }

  Future<Map<String, dynamic>?> purchaseVIPTier({
    required String tierId,
    required int price,
    required int tierLevel,
    required int durationDays,
    Map<String, dynamic>? equipUpdates,
  }) async {
    try {
      final userId = _supabase.auth.currentUser?.id;
      if (userId == null) return {'success': false, 'error': 'Not logged in'};
      
      final res = await _supabase.rpc('purchase_vip_tier', params: {
        'p_user_id': userId,
        'p_tier_id': tierId,
        'p_price_diamonds': price,
        'p_tier_level': tierLevel,
        'p_duration_days': durationDays,
        'p_equip_updates': equipUpdates ?? {},
      });
      return {'success': true, 'data': res};
    } catch (e) {
      return {'success': false, 'error': e.toString()};
    }
  }

  Future<List<Map<String, dynamic>>> getShopItems() async {
    final shopRes = await _supabase.from('shop_items').select('*').eq('is_active', true).order('display_order');
    final bgRes = await _supabase.from('party_room_backgrounds').select('*').eq('is_active', true).eq('is_premium', true).order('display_order');
    
    final List<Map<String, dynamic>> items = List<Map<String, dynamic>>.from(shopRes);
    final List<Map<String, dynamic>> backgrounds = List<Map<String, dynamic>>.from(bgRes).map((b) {
      b['category'] = 'party_background';
      return b;
    }).toList();
    
    return [...items, ...backgrounds];
  }

  Future<Map<String, dynamic>> purchaseShopItem(Map<String, dynamic> item) async {
    try {
      final userId = _supabase.auth.currentUser?.id;
      if (userId == null) return {'success': false, 'error': 'Not logged in'};

      // 1. Deduct coins
      final deductRes = await _supabase.rpc('deduct_coins', params: {
        'p_user_id': userId,
        'p_amount': item['price_diamonds'],
      });
      
      if (deductRes['success'] != true) throw Exception(deductRes['error'] ?? 'Insufficient diamonds');

      // 2. Insert purchase
      final expiresAt = item['duration_days'] != null 
          ? DateTime.now().add(Duration(days: item['duration_days'])).toIso8601String() 
          : null;

      final category = item['category'];
      final itemId = item['id'];

      await _supabase.from('user_purchases').insert({
        'user_id': userId,
        'item_id': itemId,
        'item_type': category,
        'price_paid': item['price_diamonds'],
        'expires_at': expiresAt,
        'is_equipped': true,
      });

      // 3. Equip the item in profiles table
      await equipItem(itemId, category ?? 'shop_item');
      
      return {'success': true};
    } catch (e) {
      return {'success': false, 'error': e.toString()};
    }
  }

  Future<void> equipItem(String itemId, String category) async {
    final userId = _supabase.auth.currentUser?.id;
    if (userId == null) return;

    String? field;
    if (category == 'frame' || category == 'portrait_frame') field = 'equipped_frame_id';
    else if (category == 'entrance' || category == 'entrance_effect') field = 'equipped_entrance_id';
    else if (category == 'entry_bar') field = 'equipped_entry_name_bar_id';
    else if (category == 'bubble') field = 'equipped_bubble_id';
    else if (category == 'vehicle') field = 'equipped_vehicle_id';
    else if (category == 'medal') field = 'equipped_medal_id';
    else if (category == 'noble_card') field = 'equipped_noble_card_id';
    else if (category == 'entry_banner') field = 'equipped_entry_banner_id';
    else if (category == 'room_theme') field = 'equipped_room_theme_id';
    else if (category == 'badge') field = 'equipped_badge_id';

    // 1. Unset existing same-category shop items
    await _supabase.from('user_purchases')
        .update({'is_equipped': false})
        .eq('user_id', userId)
        .eq('item_type', category);

    // 2. Set new icon as equipped
    await _supabase.from('user_purchases')
        .update({'is_equipped': true})
        .eq('user_id', userId)
        .eq('item_id', itemId);

    // 3. Update main profile slot if field identified
    if (field != null) {
      await _supabase.from('profiles').update({field: itemId}).eq('id', userId);
    }
  }

  Future<List<Map<String, dynamic>>> getUserPurchases() async {
    final userId = _supabase.auth.currentUser?.id;
    if (userId == null) return [];
    final res = await _supabase.from('user_purchases').select('*, shop_items(*)').eq('user_id', userId).eq('is_active', true);
    return List<Map<String, dynamic>>.from(res);
  }

  Future<List<Map<String, dynamic>>> getUserLevelTiers() async {
    final res = await _supabase.from('user_level_tiers').select('*').order('level_number', ascending: true);
    return List<Map<String, dynamic>>.from(res);
  }

  Future<List<Map<String, dynamic>>> getHostLevelTiers() async {
    final res = await _supabase.from('host_level_tiers').select('*').order('level_number', ascending: true);
    return List<Map<String, dynamic>>.from(res);
  }

  Future<Map<String, dynamic>> submitFaceVerification({List<String>? imageUrls, String? imagePath}) async {
    try { return {'success': true}; } catch (e) { return {'success': false, 'error': e.toString()}; }
  }

  Future<bool> updateCallPrice(int price) async {
    try {
      final userId = _supabase.auth.currentUser?.id;
      if (userId == null) return false;
      await _supabase.from('profiles').update({'call_price_per_minute': price}).eq('id', userId);
      return true;
    } catch (e) { return false; }
  }

  Future<List<Map<String, dynamic>>> getLevelPrivileges() async {
    final res = await _supabase.from('level_privileges').select('*');
    return List<Map<String, dynamic>>.from(res);
  }

  Future<int> resolveEffectiveHostEarnings(String userId) async {
    final res = await _supabase.from('profiles').select('total_earned_beans').eq('id', userId).maybeSingle();
    return (res?['total_earned_beans'] ?? 0);
  }

  Future<int> resolveEffectiveRechargeTotal(String userId) async {
    final res = await _supabase.from('profiles').select('total_recharge_diamonds').eq('id', userId).maybeSingle();
    return (res?['total_recharge_diamonds'] ?? 0);
  }

  Future<Map<String, dynamic>> getInvitationSummary() async {
    final userId = _supabase.auth.currentUser?.id;
    if (userId == null) return {'total_invites': 0, 'total_rewards': 0.0};
    final res = await _supabase.from('invitation_stats').select('*').eq('user_id', userId).maybeSingle();
    return res ?? {'total_invites': 0, 'total_rewards': 0.0};
  }

  Future<List<Map<String, dynamic>>> getInvitationLeaderboard() async {
    final res = await _supabase.from('invitation_stats')
        .select('*, profile:profiles(display_name, avatar_url, country_flag)')
        .order('total_invites', ascending: false)
        .limit(100);
    return List<Map<String, dynamic>>.from(res);
  }

  /// Fetches the invitation campaign banner from app settings
  Future<String?> fetchInvitationBanner() async {
    try {
      final res = await _supabase
          .from('app_settings')
          .select('setting_value')
          .eq('setting_key', 'invitation_banner_url')
          .maybeSingle();
      if (res != null) {
        final val = res['setting_value'];
        if (val is String) return val;
        if (val is Map) return val['url'];
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  /// Fetches the list of verified users invited by the current user
  Future<List<Map<String, dynamic>>> getMyInvitedUsers() async {
    try {
      final userId = _supabase.auth.currentUser?.id;
      if (userId == null) return [];
      
      final res = await _supabase
          .from('user_invitations')
          .select('id, invitee_id, created_at, invitee:profiles!invitee_id(display_name, avatar_url)')
          .eq('inviter_id', userId)
          .eq('status', 'verified')
          .order('created_at', ascending: false);
          
      return List<Map<String, dynamic>>.from(res);
    } catch (e) {
      return [];
    }
  }

  Future<Map<String, dynamic>> claimInvitationReward(String tierId) async {
    try {
      final res = await _supabase.rpc('claim_invitation_reward', params: { '_tier_id': tierId });
      return Map<String, dynamic>.from(res);
    } catch (e) {
      return {'success': false, 'error': e.toString()};
    }
  }

  Future<List<Map<String, dynamic>>> getInvitationTiers() async {
    final res = await _supabase.from('invitation_reward_tiers')
        .select('*')
        .eq('is_active', true)
        .order('display_order', ascending: true);
    return List<Map<String, dynamic>>.from(res);
  }

  Future<Map<String, dynamic>> getInvitationRules() async { return {'reward_percent': 5}; }

  Future<List<Map<String, dynamic>>> getDailyTasks() async {
    final res = await _supabase.from('daily_tasks')
        .select('*')
        .eq('is_active', true)
        .order('display_order');
    return List<Map<String, dynamic>>.from(res);
  }

  Future<Map<String, dynamic>> getUserTaskProgress() async {
    final userId = _supabase.auth.currentUser?.id;
    if (userId == null) return {};
    final res = await _supabase.from('user_task_progress').select('*').eq('user_id', userId);
    final map = <String, dynamic>{};
    for (var row in res) { map[row['task_id'].toString()] = row; }
    return map;
  }

  Future<Map<String, dynamic>> claimTaskReward(String taskId) async {
    try {
      final res = await _supabase.rpc('claim_task_reward', params: { 
        '_user_id': _supabase.auth.currentUser?.id,
        '_task_id': taskId 
      });
      return Map<String, dynamic>.from(res);
    } catch (e) { return {'success': false, 'error': e.toString()}; }
  }

  /// Fetches Host Bonus settings and today's progress
  Future<Map<String, dynamic>> fetchHostBonusData() async {
    try {
      final userId = _supabase.auth.currentUser?.id;
      if (userId == null) return {};

      final settings = await _supabase
          .from('new_host_live_bonus_settings')
          .select('*')
          .eq('is_active', true)
          .maybeSingle();
      
      if (settings == null) return {};

      // Get today's progress
      final now = DateTime.now();
      final dateStr = "${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}";
      
      final progress = await _supabase
          .from('new_host_live_bonus_progress')
          .select('*')
          .eq('user_id', userId)
          .eq('bonus_date', dateStr)
          .maybeSingle();

      return {
        'settings': settings,
        'progress': progress,
        'is_eligible': true, // Eligibility check usually handled via profiles.created_at on web
      };
    } catch (e) {
      return {};
    }
  }

  /// Fetches the live bonus state for a specific host (eligibility, progress, claims)
  Future<Map<String, dynamic>> getHostLiveBonusState(String hostId) async {
    try {
      final res = await _supabase.rpc("get_host_live_bonus_state", params: { '_host_id': hostId });
      return Map<String, dynamic>.from(res);
    } catch (e) {
      return {'eligible': false, 'error': e.toString()};
    }
  }

  /// Records a single minute of live streaming for host bonus tracking
  Future<Map<String, dynamic>> recordHostLiveMinute(String hostId) async {
    try {
      final res = await _supabase.rpc("record_host_live_minute", params: { '_host_id': hostId });
      return Map<String, dynamic>.from(res ?? {});
    } catch (e) {
      return {'error': e.toString()};
    }
  }

  /// Claims the reward for a completed live streaming hour
  Future<Map<String, dynamic>> claimHostLiveHourBonus(String hostId, int hourNumber) async {
    try {
      final res = await _supabase.rpc("claim_host_live_hour_bonus", params: {
        '_host_id': hostId,
        '_hour_number': hourNumber,
      });
      return {'success': true, ...Map<String, dynamic>.from(res ?? {})};
    } catch (e) {
      return {'success': false, 'error': e.toString()};
    }
  }

  Future<String?> uploadTaskScreenshot(String taskId, String imagePath) async {
    try {
      final userId = _supabase.auth.currentUser?.id;
      if (userId == null) return null;
      final file = File(imagePath);
      final ext = imagePath.split('.').last;
      final fileName = 'task_${taskId}_${userId}_${DateTime.now().millisecondsSinceEpoch}.$ext';
      await _supabase.storage.from('task_verifications').upload(fileName, file);
      return _supabase.storage.from('task_verifications').getPublicUrl(fileName);
    } catch (e) {
      return null;
    }
  }

  Future<void> submitRatingTask(String taskId, String screenshotUrl) async {
    await _supabase.from('user_task_progress').upsert({
      'user_id': _supabase.auth.currentUser?.id,
      'task_id': taskId,
      'verification_url': screenshotUrl,
      'status': 'pending_review'
    });
  }

  Future<Map<String, dynamic>?> getActiveRechargeCampaign() async {
    return (await _supabase.from('recharge_campaigns').select('*').eq('is_active', true).maybeSingle());
  }

  Future<List<Map<String, dynamic>>> getAdminPaymentMethods(String countryCode) async {
    final res = await _supabase.from('payment_methods').select('*').eq('is_active', true).eq('method_type', 'admin');
    return List<Map<String, dynamic>>.from(res);
  }

  Future<List<Map<String, dynamic>>> getHelperPaymentMethods(String countryCode) async {
    final res = await _supabase.from('payment_methods').select('*, helper:profiles(*)').eq('is_active', true).eq('method_type', 'helper');
    return List<Map<String, dynamic>>.from(res);
  }

  Stream<List<Map<String, dynamic>>> getCurrencyRatesStream() {
    return _supabase.from('currency_rates').stream(primaryKey: ['id']).map((data) => List<Map<String, dynamic>>.from(data));
  }

  Stream<List<Map<String, dynamic>>> getDiamondPackagesStream() {
    return _supabase.from('coin_packages').stream(primaryKey: ['id']).map((data) => List<Map<String, dynamic>>.from(data));
  }

  Future<List<Map<String, dynamic>>> getDiamondPackages() async {
    final res = await _supabase.from('coin_packages').select('*').order('display_order', ascending: true);
    // Map coins_amount to diamonds for RechargeScreen compatibility if needed, 
    // but better to keep it flexible as the screen handles the mapping
    return List<Map<String, dynamic>>.from(res);
  }

  Future<Map<String, dynamic>> transferCoins({required String targetId, required int amount}) async {
    try {
      final res = await _supabase.rpc('transfer_coins', params: { 'p_target_id': targetId, 'p_amount': amount });
      return {'success': true, 'data': res};
    } catch (e) { return {'success': false, 'message': e.toString()}; }
  }

  Future<Map<String, dynamic>> transferDiamondsToAgency({required String agencyId, required int amount}) async {
    try {
      final res = await _supabase.rpc('transfer_to_agency', params: { 'p_agency_id': agencyId, 'p_amount': amount });
      return {'success': true, 'data': res};
    } catch (e) { return {'success': false, 'message': e.toString()}; }
  }

  Future<Map<String, dynamic>> transferDiamondsToSelf({required int amount}) async {
    try {
      final res = await _supabase.rpc('transfer_to_self', params: { 'p_amount': amount });
      return {'success': true, 'data': res};
    } catch (e) { return {'success': false, 'message': e.toString()}; }
  }

  Future<Map<String, dynamic>> exchangeBeans({required int amount}) async {
    try {
      final res = await _supabase.rpc('exchange_beans', params: { 'p_amount': amount });
      return {'success': true, 'data': res};
    } catch (e) { return {'success': false, 'message': e.toString()}; }
  }

  Future<List<Map<String, dynamic>>> getLeaderboard({required String type, required String period}) async {
    final res = await _supabase.from('leaderboards').select('*, profile:profiles(*)').eq('type', type).eq('period', period).order('rank', ascending: true).limit(10);
    return List<Map<String, dynamic>>.from(res);
  }

  Future<Map<String, dynamic>?> getMyRank({required String type, required String period}) async {
    final userId = _supabase.auth.currentUser?.id;
    if (userId == null) return null;
    return await _supabase.from('leaderboards').select('*').eq('user_id', userId).eq('type', type).eq('period', period).maybeSingle();
  }

  Future<int> getPartyRoomBeans(String roomId) async {
    final res = await _supabase.from('party_rooms').select('beans_total').eq('id', roomId).maybeSingle();
    return (res?['beans_total'] ?? 0);
  }

  Future<void> sendSeatRequest(String roomId, int seatIdx) async {
    await _supabase.from('party_room_requests').insert({'room_id': roomId, 'seat_index': seatIdx, 'user_id': _supabase.auth.currentUser?.id});
  }

  Future<void> manageSeatRequest(String requestId, String action) async {
    await _supabase.rpc('manage_seat_request', params: { 'p_request_id': requestId, 'p_action': action });
  }

  Future<List<Map<String, dynamic>>> searchUsers(String query) async {
    final res = await _supabase.from('profiles').select('*').or('display_name.ilike.%$query%,username.ilike.%$query%').limit(20);
    return List<Map<String, dynamic>>.from(res);
  }

  Future<void> toggleReelLike(String reelId, bool liked) async {
    final userId = _supabase.auth.currentUser?.id;
    if (userId == null) return;
    if (liked) { await _supabase.from('reel_likes').insert({'reel_id': reelId, 'user_id': userId}); }
    else { await _supabase.from('reel_likes').delete().eq('reel_id', reelId).eq('user_id', userId); }
  }

  Future<Map<String, dynamic>> startLiveStream({required String title, required String coverUrl, required List<String> tags}) async {
    final res = await _supabase.from('live_streams').insert({'title': title, 'cover_url': coverUrl, 'tags': tags, 'host_id': _supabase.auth.currentUser?.id}).select().single();
    return Map<String, dynamic>.from(res);
  }

  Future<int> getCurrentUserLevel() async { return (await resolveUserBalance()) ~/ 100; }
  Future<dynamic> getAppSetting(String key) async { return (await _supabase.from('app_settings').select('setting_value').eq('setting_key', key).maybeSingle())?['setting_value']; }
  Future<Map<String, dynamic>> createPartyRoom({required String title, String? roomType, String? gameMode}) async {
    final res = await _supabase.from('party_rooms').insert({
      'title': title,
      'room_type': roomType,
      'game_mode': gameMode,
      'host_id': _supabase.auth.currentUser?.id
    }).select().single();
    return Map<String, dynamic>.from(res);
  }

  Future<Map<String, dynamic>> createLiveRoom({required String title, String? coverUrl, String? categoryId}) async {
    final res = await _supabase.from('live_streams').insert({
      'title': title,
      'cover_url': coverUrl,
      'category_id': categoryId,
      'host_id': _supabase.auth.currentUser?.id
    }).select().single();
    return Map<String, dynamic>.from(res);
  }

  Future<List<Map<String, dynamic>>> getPartyParticipants(String roomId) async {
    try {
      final res = await _supabase.from('party_room_participants')
          .select('*, profile:profiles(*)')
          .eq('room_id', roomId)
          .isFilter('left_at', null);
      return List<Map<String, dynamic>>.from(res);
    } catch (e) {
      return [];
    }
  }

  Future<Map<String, dynamic>?> getLiveRoomStatus(String roomId) async {
     try {
       return await _supabase.from('live_streams').select('*').eq('id', roomId).maybeSingle();
     } catch (e) {
       return null;
     }
  }

  Future<List<Map<String, dynamic>>> getBanners(String position) async {
    final res = await _supabase.from('banners').select('*').eq('position', position).eq('is_active', true);
    return List<Map<String, dynamic>>.from(res);
  }

  Future<List<Map<String, dynamic>>> getHostCountries() async {
    final res = await _supabase.from('countries').select('*');
    return List<Map<String, dynamic>>.from(res);
  }

  Future<List<Map<String, dynamic>>> getHosts({String? countryCode, String? category}) async {
    var query = _supabase.from('profiles').select('*').eq('is_host', true);
    if (countryCode != null) query = query.eq('country_code', countryCode);
    final res = await query.limit(20);
    return List<Map<String, dynamic>>.from(res);
  }

  Future<List<Map<String, dynamic>>> getHomeHosts({
    required String activeTab,
    required String selectedCountry,
  }) async {
    final now = DateTime.now();
    final sixtyMinutesAgo = now.subtract(const Duration(minutes: 60)).toIso8601String();
    
    // 1. Fetch active live + party data
    final results = await Future.wait([
      _supabase.from('live_streams').select('id, host_id, title, viewer_count, thumbnail_url, started_at').eq('is_active', true),
      _supabase.from('party_rooms').select('id, host_id, name, room_type, game_mode').eq('is_active', true),
    ]);

    final liveRes = results[0] as List;
    final partyRes = results[1] as List;

    final liveMap = { for (var s in liveRes) s['host_id'].toString(): s };
    final liveHostIds = liveMap.keys.toList();

    final partyMap = { for (var p in partyRes) p['host_id'].toString(): p };
    final partyHostIds = partyMap.keys.toList();

    // 2. Fetch profiles based on Tab
    List<Map<String, dynamic>> profiles = [];
    const String hostFields = 'id, display_name, username, avatar_url, country_code, country_flag, user_level, host_level, is_online, is_in_call, is_host, gender, frame_id, last_seen_at, host_status, host_availability, created_at, is_verified, is_face_verified';

    if (activeTab == 'live') {
      if (liveHostIds.isNotEmpty) {
         var q = _supabase.from('profiles').select(hostFields).inFilter('id', liveHostIds);
         if (selectedCountry != 'all') q = q.eq('country_code', selectedCountry);
         final pRes = await q;
         profiles = List<Map<String,dynamic>>.from(pRes);
      }
    } else {
      var baseQuery = _supabase.from('profiles').select(hostFields)
          .eq('is_host', true)
          .eq('gender', 'female')
          .eq('is_online', true)
          .eq('host_status', 'approved')
          .eq('is_face_verified', true)
          .gte('last_seen_at', sixtyMinutesAgo)
          .not('avatar_url', 'is', null);
          
      if (selectedCountry != 'all') baseQuery = baseQuery.eq('country_code', selectedCountry);
      
      if (activeTab == 'new') {
         final sevenDaysAgo = now.subtract(const Duration(days: 7)).toIso8601String();
         baseQuery = baseQuery.gte('created_at', sevenDaysAgo);
      } else if (activeTab == 'follow') {
         final me = _supabase.auth.currentUser?.id;
         if (me != null) {
            final fwRes = await _supabase.from('followers').select('following_id').eq('follower_id', me);
            final ids = fwRes.map((e) => e['following_id']).toList();
            if (ids.isNotEmpty) baseQuery = baseQuery.inFilter('id', ids);
            else baseQuery = baseQuery.eq('id', 'NONE_DUMMY');
         }
      }
      
      final baseRes = await baseQuery.order('last_seen_at', ascending: false).limit(100);
      profiles = List<Map<String,dynamic>>.from(baseRes);

      // Web Parity: Include missing live hosts
      final profileIds = profiles.map((p) => p['id'].toString()).toSet();
      final missingLiveIds = liveHostIds.where((l) => !profileIds.contains(l)).toList();
      if (missingLiveIds.isNotEmpty) {
         var mq = _supabase.from('profiles').select(hostFields).inFilter('id', missingLiveIds);
         if (selectedCountry != 'all') mq = mq.eq('country_code', selectedCountry);
         final mRes = await mq;
         profiles.addAll(List<Map<String,dynamic>>.from(mRes));
      }
    }

    // 3. Resolve active calls (Ringing, Connected, Pending)
    Set<String> activeBusyIds = {};
    final candidateIds = profiles.map((p) => p['id'].toString()).toList();
    if (candidateIds.isNotEmpty) {
       final cRes = await _supabase.from('private_calls').select('host_id')
          .inFilter('host_id', candidateIds.take(36).toList()) // Above fold fast path parity
          .inFilter('status', ['pending', 'ringing', 'connected'])
          .isFilter('ended_at', null);
       activeBusyIds = cRes.map((c) => c['host_id'].toString()).toSet();
    }

    // 4. Map & Sort (Parity with web Index.tsx)
    List<Map<String,dynamic>> hostsWithStatus = profiles.map((p) {
      final id = p['id'].toString();
      final isBusy = activeBusyIds.contains(id) || (p['is_in_call'] == true);
      final lData = liveMap[id];
      final pData = partyMap[id];
      return {
        ...p,
        'isLive': lData != null,
        'liveStreamId': lData?['id'],
        'viewerCount': lData?['viewer_count'] ?? 0,
        'liveThumbnailUrl': lData?['thumbnail_url'],
        'started_at_dt': lData?['started_at'] ?? '',
        'actuallyBusy': isBusy,
        'inParty': pData != null,
        'partyRoom': pData,
      };
    }).toList();

    hostsWithStatus.sort((a,b) {
       // Priority 1: LIVE first, PARTY next, ONLINE last
       int pA = (a['isLive'] == true) ? 0 : (a['inParty'] == true ? 1 : 2);
       int pB = (b['isLive'] == true) ? 0 : (b['inParty'] == true ? 1 : 2);
       if (pA != pB) return pA.compareTo(pB);

       // Priority 2: Within LIVE, longest streaming first (earliest started_at)
       if (a['isLive'] == true && b['isLive'] == true) {
          return (a['started_at_dt'] as String).compareTo(b['started_at_dt'] as String);
       }
       // Priority 3: Within ONLINE, longest online first (earliest last_seen_at)
       String lA = a['last_seen_at'] ?? '';
       String lB = b['last_seen_at'] ?? '';
       return lA.compareTo(lB);
    });

    return hostsWithStatus;
  }

  Future<List<Map<String, dynamic>>> getPartyRooms({
    String? roomType,
    String? countryCode,
    String? searchQuery,
  }) async {
    try {
      final now = DateTime.now();
      final twoHoursAgo = now.subtract(const Duration(hours: 2)).toIso8601String();
      
      // 1. Fetch active rooms with host info
      var query = _supabase.from('party_rooms')
          .select('*, host:profiles!party_rooms_host_id_fkey(id, display_name, avatar_url, user_level, host_level, country_flag, country_code, is_host, gender, frame_id)')
          .eq('is_active', true)
          .gte('created_at', twoHoursAgo);

      if (roomType != null && roomType != 'all') {
        query = query.eq('room_type', roomType);
      }

      if (searchQuery != null && searchQuery.isNotEmpty) {
        query = query.ilike('name', '%$searchQuery%');
      }

      final roomsRes = await query;
      List<Map<String, dynamic>> rooms = List<Map<String, dynamic>>.from(roomsRes);

      if (countryCode != null && countryCode != 'all') {
        rooms = rooms.where((r) => r['host']?['country_code'] == countryCode).toList();
      }

      if (rooms.isEmpty) return [];

      // 2. Fetch participant counts
      final roomIds = rooms.map((r) => r['id'].toString()).toList();
      final participantsRes = await _supabase
          .from('party_room_participants')
          .select('room_id')
          .inFilter('room_id', roomIds)
          .isFilter('left_at', null);

      final Map<String, int> counts = {};
      for (var p in participantsRes) {
        final rid = p['room_id'].toString();
        counts[rid] = (counts[rid] ?? 0) + 1;
      }

      // 3. Map counts and Sort
      final List<Map<String, dynamic>> enriched = rooms.map((r) {
        final id = r['id'].toString();
        return {
          ...r,
          'current_participants': counts[id] ?? 1,
        };
      }).toList();

      enriched.sort((a, b) => (b['current_participants'] as int).compareTo(a['current_participants'] as int));
      return enriched;
    } catch (e) {
      debugPrint("Error fetching party rooms: $e");
      return [];
    }
  }
  }
  Future<Map<String, dynamic>> getProfileStats([String? userId]) async {
    final id = userId ?? _supabase.auth.currentUser?.id;
    if (id == null) return {'followers': 0, 'following': 0, 'friends': 0, 'reels': 0};

    try {
      final responses = await Future.wait<dynamic>([
        _supabase.from('followers').select('id').eq('following_id', id).count(CountOption.exact),
        _supabase.from('followers').select('id').eq('follower_id', id).count(CountOption.exact),
        _supabase.from('followers').select('follower_id').eq('following_id', id),
        _supabase.from('followers').select('following_id').eq('follower_id', id),
        _supabase.from('reels').select('id').eq('user_id', id).eq('is_active', true).eq('is_approved', true).count(CountOption.exact),
      ]);

      final followersCount = (responses[0] as PostgrestResponse).count ?? 0;
      final followingCount = (responses[1] as PostgrestResponse).count ?? 0;
      final reelsCount = (responses[4] as PostgrestResponse).count ?? 0;
      
      final Set<String> followerIds = (responses[2] as List).map((f) => f['follower_id'].toString()).toSet();
      final Set<String> followingIds = (responses[3] as List).map((f) => f['following_id'].toString()).toSet();
      final friendsCount = followingIds.where((fid) => followerIds.contains(fid)).length;

      return {
        'followers': followersCount,
        'following': followingCount,
        'friends': friendsCount,
        'reels': reelsCount,
      };
    } catch (e) {
      debugPrint("Error fetching profile stats: $e");
      return {'followers': 0, 'following': 0, 'friends': 0, 'reels': 0};
    }
  }

  Future<List<Map<String, dynamic>>> getFollowingWithProfiles([String? userId]) async {
    final id = userId ?? _supabase.auth.currentUser?.id;
    if (id == null) return [];
    try {
      final res = await _supabase.from('followers')
          .select('id, created_at, following_id')
          .eq('follower_id', id)
          .order('created_at', ascending: false);
      
      final List<dynamic> followingData = res;
      if (followingData.isEmpty) return [];

      final followingIds = followingData.map((f) => f['following_id'].toString()).toList();
      final profilesRes = await _supabase.from('profiles')
          .select('id, display_name, avatar_url, is_online, is_verified, is_host, country_flag')
          .in('id', followingIds);
      
      final profilesMap = {for (var p in profilesRes) p['id']: p};

      return List<Map<String, dynamic>>.from(followingData.map((f) => {
        'id': f['id'],
        'created_at': f['created_at'],
        'profile': profilesMap[f['following_id']]
      }).filter((item) => item['profile'] != null));
    } catch (e) {
      debugPrint("getFollowingWithProfiles error: $e");
      return [];
    }
  }

  Future<List<Map<String, dynamic>>> getFollowersWithProfiles([String? userId]) async {
    final id = userId ?? _supabase.auth.currentUser?.id;
    if (id == null) return [];
    try {
      final res = await _supabase.from('followers')
          .select('id, created_at, follower_id')
          .eq('following_id', id)
          .order('created_at', ascending: false);
      
      final List<dynamic> followersData = res;
      if (followersData.isEmpty) return [];

      final followerIds = followersData.map((f) => f['follower_id'].toString()).toList();
      final profilesRes = await _supabase.from('profiles')
          .select('id, display_name, avatar_url, is_online, is_verified, is_host, country_flag')
          .in('id', followerIds);
      
      final profilesMap = {for (var p in profilesRes) p['id']: p};

      return List<Map<String, dynamic>>.from(followersData.map((f) => {
        'id': f['id'],
        'created_at': f['created_at'],
        'profile': profilesMap[f['follower_id']]
      }).filter((item) => item['profile'] != null));
    } catch (e) {
      debugPrint("getFollowersWithProfiles error: $e");
      return [];
    }
  }

  Future<List<Map<String, dynamic>>> getFriendsWithProfiles([String? userId]) async {
    final id = userId ?? _supabase.auth.currentUser?.id;
    if (id == null) return [];
    try {
      final following = await _supabase.from('followers').select('following_id').eq('follower_id', id);
      final followers = await _supabase.from('followers').select('follower_id').eq('following_id', id);
      
      final followingIds = following.map((f) => f['following_id'].toString()).toSet();
      final followerIds = followers.map((f) => f['follower_id'].toString()).toSet();
      final friendIds = followingIds.intersection(followerIds).toList();
      
      if (friendIds.isEmpty) return [];
      
      final profiles = await _supabase.from('profiles')
          .select('id, display_name, avatar_url, is_online, is_verified, is_host, country_flag')
          .in('id', friendIds);
          
      return List<Map<String, dynamic>>.from(profiles.map((p) => {
        'id': p['id'],
        'profile': p
      }));
    } catch (e) {
      debugPrint("getFriendsWithProfiles error: $e");
      return [];
    }
  }

  Future<bool> followUser(String targetId) async {
    final myId = currentUserId;
    if (myId == null || myId == targetId) return false;
    try {
      await _supabase.from('followers').insert({
        'follower_id': myId,
        'following_id': targetId
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  Future<bool> unfollowUser(String targetId) async {
    final myId = currentUserId;
    if (myId == null) return false;
    try {
      await _supabase.from('followers').delete().eq('follower_id', myId).eq('following_id', targetId);
      return true;
    } catch (e) {
      return false;
    }
  }

  Future<bool> toggleAvailability(String currentAvailability) async {
    final userId = currentUserId;
    if (userId == null) return false;
    try {
      final newStatus = currentAvailability == 'online' ? 'offline' : 'online';
      await _supabase.from('profiles').update({
        'host_availability': newStatus,
        'is_online': newStatus == 'online'
      }).eq('id', userId);
      return true;
    } catch (e) {
      debugPrint("Error toggling availability: $e");
      return false;
    }
  }

  Future<String?> uploadPaymentProof(File imageFile) async {
    try {
      final userId = currentUserId;
      if (userId == null) return null;
      final fileName = 'proof_${userId}_${DateTime.now().millisecondsSinceEpoch}.jpg';
      await _supabase.storage.from('media').upload('recharge_proofs/$fileName', imageFile);
      return _supabase.storage.from('media').getPublicUrl('recharge_proofs/$fileName');
    } catch (e) {
      debugPrint("uploadPaymentProof error: $e");
      return null;
    }
  }

  Future<bool> submitRechargeRequest({
    required String packageId,
    required String transactionId,
    String? helperId,
    String? paymentProofUrl,
    String? gateway,
    int? amount,
    String? senderNumber,
  }) async {
    try {
      final userId = currentUserId;
      if (userId == null) return false;

      // If amount/gateway are missing, fetch them from the package for robustness
      int finalAmount = amount ?? 0;
      String finalGateway = gateway ?? "Local";
      
      if (amount == null || gateway == null) {
        final pkg = await _supabase.from('diamond_packages').select('*').eq('id', packageId).maybeSingle();
        if (pkg != null) {
          finalAmount = pkg['coins_amount'] + (pkg['bonus_coins'] ?? 0);
        }
      }
      
      await _supabase.from('recharge_requests').insert({
        'user_id': userId,
        'package_id': packageId,
        'amount': finalAmount,
        'gateway': finalGateway,
        'transaction_id': transactionId,
        'sender_number': senderNumber ?? 'Mobile App',
        'proof_url': paymentProofUrl,
        'helper_id': helperId,
        'status': 'pending',
      });
      return true;
    } catch (e) {
      debugPrint("submitRechargeRequest error: $e");
      return false;
    }
  }

  Future<bool> updateProfile(Map<String, dynamic> data) async {
    try {
      final userId = _supabase.auth.currentUser?.id;
      if (userId == null) return false;
      
      final updates = Map<String, dynamic>.from(data);
      if (updates.containsKey('age') && updates['age'] is String) {
        updates['age'] = int.tryParse(updates['age']);
      }

      await _supabase.from('profiles').update(updates).eq('id', userId);
      return true;
    } catch (e) {
      debugPrint("Update profile error: $e");
      return false;
    }
  }

  Future<Map<String, dynamic>> lockGender(String gender) async {
    final userId = _supabase.auth.currentUser?.id;
    if (userId == null) return {'success': false, 'error': 'Not logged in'};

    try {
      final profile = await getProfile(userId);
      if (profile != null && profile['gender'] != null) {
        return {'success': false, 'error': 'Gender is already set and locked'};
      }

      final updates = {'gender': gender};
      if (gender == 'female') {
        updates['is_host'] = 'true'; 
      }

      await _supabase.from('profiles').update(updates).eq('id', userId);
      return {'success': true};
    } catch (e) {
      return {'success': false, 'error': e.toString()};
    }
  }


  Future<void> completeOnboarding({required String gender}) async {
    final userId = _supabase.auth.currentUser?.id;
    if (userId == null) return;
    await _supabase.from('profiles').update({'gender': gender, 'onboarding_completed': true}).eq('id', userId);
  }

  Future<void> trackReferral() async {
    try {
      final userId = currentUserId;
      if (userId == null) return;
      
      // In mobile, we check for a locally stored referral code (e.g. from deep links)
      // For now, we hit the track-invitation RPC if we have context
      // final prefs = await SharedPreferences.getInstance();
      // final ref = prefs.getString('meri_pending_invitation_ref');
      // if (ref != null) await _supabase.rpc('track_user_invitation', params: { 'p_user_id': userId, 'p_code': ref });
    } catch (e) {
      debugPrint("trackReferral error: $e");
    }
  }

  Future<void> syncLocationAndDevice() async {
    try {
      final userId = currentUserId;
      if (userId == null) return;
      
      final deviceId = await DeviceService().getPersistentDeviceId();
      
      // Web Parity: Update device and login timestamp
      await _supabase.from('profiles').update({
        'last_device_id': deviceId,
        'last_login_at': DateTime.now().toIso8601String(),
        'is_online': true,
      }).eq('id', userId);

      // Trigger location detection via Edge Function (Matches Auth.tsx detectAndSaveLocation)
      await _supabase.functions.invoke('detect-user-location', body: { 'user_id': userId });
    } catch (e) {
      debugPrint("syncLocationAndDevice error: $e");
    }
  }

  Future<void> trackReferral() async {
    try {
      final userId = currentUserId;
      if (userId == null) return;
      
      // In mobile, we check for a locally stored referral code (e.g. from deep links)
      // For now, we hit the track-invitation RPC if we have context
      // final prefs = await SharedPreferences.getInstance();
      // final ref = prefs.getString('meri_pending_invitation_ref');
      // if (ref != null) await _supabase.rpc('track_user_invitation', params: { 'p_user_id': userId, 'p_code': ref });
    } catch (e) {
      debugPrint("trackReferral error: $e");
    }
  }

  Future<List<Map<String, dynamic>>> getAgencyPolicySettings() async {
    final res = await _supabase.from('app_settings').select('*').eq('section', 'agency_policy');
    return List<Map<String, dynamic>>.from(res);
  }
  
  Future<List<Map<String, dynamic>>> getCurrencyRates() async {
    final res = await _supabase.from('currency_rates').select('*').eq('is_active', true);
    return List<Map<String, dynamic>>.from(res);
  }

  Future<List<Map<String, dynamic>>> getAgencyFinanceHistory(String agencyId) async {
    final res = await _supabase.from('agency_transactions').select('*').eq('agency_id', agencyId);
    return List<Map<String, dynamic>>.from(res);
  }

  Future<List<Map<String, dynamic>>> getGlobalAgencyRankings() async {
    final res = await _supabase.from('agencies').select('name, total_revenue').order('total_revenue', ascending: false).limit(10);
    return List<Map<String, dynamic>>.from(res);
  }

  Future<List<Map<String, dynamic>>> getAgencyWeeklyTransfers(String agencyId) async { return []; }

  Future<List<Map<String, dynamic>>> getBlockedUsers() async {
    final userId = _supabase.auth.currentUser?.id;
    if (userId == null) return [];
    final res = await _supabase.from('blocked_users').select('*, profile:profiles(*)').eq('blocker_id', userId);
    return List<Map<String, dynamic>>.from(res);
  }

  Future<bool> toggleBlockUser(String targetId, bool block) async { return true; }



  Future<Map<String, dynamic>> getFinanceSettings() async {
    try {
      final res = await _supabase.from('app_settings').select('setting_key, setting_value').filter('setting_key', 'in', ['beans_to_diamonds_rate', 'exchange_fee_percent', 'agency_exchange_rate', 'min_exchange_amount']);
      final Map<String, dynamic> settings = {};
      for (var s in res) {
        settings[s['setting_key']] = s['setting_value'];
      }
      return settings;
    } catch (e) {
      return {'beans_to_diamonds_rate': 1, 'exchange_fee_percent': 25, 'min_exchange_amount': 100000};
    }
  }

  Future<Map<String, dynamic>> exchangeBeansToDiamonds(int amount) async {
    try {
      final userId = currentUserId;
      if (userId == null) return {'success': false, 'error': 'Not logged in'};

      // Parity with Web: Use exchange_user_beans_to_diamonds RPC
      final res = await _supabase.rpc('exchange_user_beans_to_diamonds', params: {
        '_user_id': userId,
        '_beans_amount': amount,
        '_diamonds_reward': 0, // Backend calculates if 0, or pass calculated value
        '_tier_id': null
      });
      
      return Map<String, dynamic>.from(res);
    } catch (e) {
      debugPrint("Exchange error: $e");
      return {'success': false, 'error': e.toString()};
    }
  }

  Future<Map<String, dynamic>> exchangeBeansToTrader(int amount) async {
    try {
      final userId = currentUserId;
      if (userId == null) return {'success': false, 'error': 'Not logged in'};

      final res = await _supabase.rpc('exchange_agency_beans', params: {
        'amount': amount
      });
      return {'success': true, 'data': res};
    } catch (e) {
      return {'success': false, 'error': e.toString()};
    }
  }

  Future<Map<String, dynamic>> requestAgencyWithdrawal({
    required String agencyId,
    required double amountUsd,
    required int beansAmount,
    required double feeUsd,
    required double netUsd,
    required String method,
    required String details,
  }) async {
    try {
      final res = await _supabase.from('agency_withdrawals').insert({
        'agency_id': agencyId,
        'amount_beans': beansAmount,
        'amount_usd': amountUsd,
        'fee_usd': feeUsd,
        'net_usd': netUsd,
        'payment_method': method,
        'payment_details': details,
        'status': 'pending'
      }).select().single();
      
      // Deduct beans from agency balance
      await _supabase.rpc('deduct_agency_beans', params: {
        'p_agency_id': agencyId,
        'p_amount': beansAmount
      });

      return {'success': true, 'data': res};
    } catch (e) {
      return {'success': false, 'error': e.toString()};
    }
  }

  Future<Map<String, dynamic>?> getCountryConfig(String countryCode) async {
    try {
      final res = await _supabase.from('country_configs')
          .select('*')
          .eq('country_code', countryCode)
          .maybeSingle();
      return res;
    } catch (e) {
      return null;
    }
  }

  Future<Map<String, dynamic>?> getAgencySummary(String agencyId) async {
    try {
      // 1. Fetch Basic Agency Info
      final agency = await _supabase.from('agencies').select('*, owner:profiles(display_name, avatar_url, app_uid)').eq('id', agencyId).maybeSingle();
      if (agency == null) return null;

      // 2. Fetch Counts (Parity with Web)
      final hostsRes = await _supabase.from('agency_hosts').select('id').eq('agency_id', agencyId).eq('status', 'active').count(CountOption.exact);
      final onlineRes = await _supabase.from('profiles').select('id').eq('agency_id', agencyId).eq('is_online', true).count(CountOption.exact);

      return {
        ...Map<String, dynamic>.from(agency),
        'hosts_count': hostsRes.count ?? 0,
        'online_hosts': onlineRes.count ?? 0,
        'total_revenue': agency['wallet_balance'] ?? 0, // In web app, total_revenue often maps to current wallet for display
      };
    } catch (e) {
      debugPrint("getAgencySummary error: $e");
      return null;
    }
  }

  Future<int> getOnlineHostsCount(String agencyId) async {
    try {
      final count = await _supabase.from('profiles')
          .count(CountOption.exact)
          .eq('agency_id', agencyId)
          .eq('is_online', true);
      return count;
    } catch (e) {
      return 0;
    }
  }

  Future<Map<String, dynamic>?> getParentAgency(String parentId) async {
    if (parentId.isEmpty) return null;
    try {
      return await _supabase.from('agencies')
          .select('*, owner_profile:profiles(*)')
          .eq('id', parentId)
          .maybeSingle();
    } catch (e) {
      return null;
    }
  }

  Future<List<Map<String, dynamic>>> getSubAgents(String agencyId) async {
    try {
      final res = await _supabase.from('agencies').select('*, owner:profiles(*)').eq('parent_id', agencyId);
      return List<Map<String, dynamic>>.from(res);
    } catch (e) {
      return [];
    }
  }

  Future<void> updateAgencyHostStatus(String requestId, String status) async {
    await _supabase.from('agency_hosts').update({'status': status}).eq('id', requestId);
    
    // Auto-update profile is_host if approved
    if (status == 'active') {
      final hostRow = await _supabase.from('agency_hosts').select('host_id').eq('id', requestId).maybeSingle();
      if (hostRow != null) {
        await _supabase.from('profiles').update({'is_host': 'true'}).eq('id', hostRow['host_id']);
      }
    }
  }


  Future<List<Map<String, dynamic>>> getAgencyWithdrawalHistory(String agencyId) async {
    try {
      final res = await _supabase.from('agency_withdrawals')
          .select('*')
          .eq('agency_id', agencyId)
          .order('requested_at', ascending: false);
      return List<Map<String, dynamic>>.from(res);
    } catch (e) {
      return [];
    }
  }

  Future<Map<String, dynamic>> getAgencyLevelInfo(String levelCode) async {
    try {
      final res = await _supabase.from('agency_level_tiers')
          .select('*')
          .eq('level_code', levelCode)
          .maybeSingle();
      return res ?? {'level_name': 'Silver Agent', 'commission_rate': 10};
    } catch (e) {
      return {'level_name': 'Silver Agent', 'commission_rate': 10};
    }
  }

  Future<Map<String, dynamic>?> searchUserByAppUid(String uid) async {
    try {
      final res = await _supabase.rpc('search_user_by_app_uid', params: {
        '_app_uid': uid.trim().toUpperCase()
      });
      if (res != null && (res as List).isNotEmpty) {
        return Map<String, dynamic>.from(res[0]);
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  Future<bool> sendOtpToApp(String userId, String code) async {
    try {
      await _supabase.functions.invoke('send-app-notification', body: {
        'userId': userId,
        'templateKey': 'agency_verification_code',
        'variables': {
          'code': code,
          'agency_name': 'Host Application'
        },
        'type': 'host_verification'
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  Future<bool> sendOtpToEmail(String email, String code, String agencyName) async {
    try {
      await _supabase.functions.invoke('send-verification-email', body: {
        'email': email,
        'code': code,
        'agencyName': agencyName,
        'type': 'email'
      });
      return true;
    } catch (e) {
      return false;
    }
  }



  Future<dynamic> uploadReel({required String videoPath, required String thumbnailUrl, required String caption, String? categoryId, int? duration}) async {
    try {
      final userId = _supabase.auth.currentUser?.id;
      if (userId == null) return false;

      final videoFile = File(videoPath);
      final thumbFile = File(thumbnailUrl);
      
      final timestamp = DateTime.now().millisecondsSinceEpoch;
      final videoName = 'reel_video_${userId}_$timestamp.mp4';
      final thumbName = 'reel_thumb_${userId}_$timestamp.jpg';

      // 1. Upload Video
      await _supabase.storage.from('media').upload('reels/$videoName', videoFile);
      final videoUrl = _supabase.storage.from('media').getPublicUrl('reels/$videoName');

      // 2. Upload Thumbnail
      await _supabase.storage.from('media').upload('reels/$thumbName', thumbFile);
      final thumbPublicUrl = _supabase.storage.from('media').getPublicUrl('reels/$thumbName');

      // 3. Insert Database Record
      await _supabase.from('reels').insert({
        'user_id': userId,
        'video_url': videoUrl,
        'thumbnail_url': thumbPublicUrl,
        'caption': caption,
        'category_id': categoryId,
        'duration': duration ?? 0,
        'is_approved': false, // Admin review required
        'is_active': true,
      });

      return true;
    } catch (e) {
      debugPrint("Upload error: $e");
      return false;
    }
  }

  Future<List<Map<String, dynamic>>> getReels({String? categoryId, int limit = 20}) async {
    try {
      final myId = currentUserId;
      List<String> followingIds = [];
      
      if (myId != null) {
        final followingRes = await _supabase.from('followers').select('following_id').eq('follower_id', myId);
        followingIds = (followingRes as List).map((f) => f['following_id'].toString()).toList();
      }

      var query = _supabase.from('reels').select('*, user:profiles(id, display_name, avatar_url, user_level, is_verified, is_host)');
      
      query = query.eq('is_active', true).eq('is_approved', true);
      
      if (categoryId != null && categoryId != 'all') {
        query = query.eq('category_id', categoryId);
      }
      
      final res = await query.order('created_at', ascending: false).limit(limit);
      var reels = List<Map<String, dynamic>>.from(res);

      if (followingIds.isNotEmpty) {
        // Advanced Sorting: Following First
        reels.sort((a, b) {
          final aIsFollowing = followingIds.contains(a['user_id']);
          final bIsFollowing = followingIds.contains(b['user_id']);
          
          if (aIsFollowing && !bIsFollowing) return -1;
          if (!aIsFollowing && bIsFollowing) return 1;
          return 0; // Maintain temporal order within groups
        });
      }

      return reels;
    } catch (e) {
      debugPrint("Error fetching reels: $e");
      return [];
    }
  }

  Future<List<Map<String, dynamic>>> getReelCategories() async {
    try {
      final res = await _supabase.from('reel_categories').select('*').eq('is_active', true).order('display_order', ascending: true);
      return List<Map<String, dynamic>>.from(res);
    } catch (e) {
      debugPrint("Error fetching reel categories: $e");
      return [];
    }
  }

  Stream<List<Map<String, dynamic>>> getMessagesStream(String convId) {
    // We order by created_at descending so the stream matches the UI's 'reverse: true' logic
    return _supabase.from('messages')
        .stream(primaryKey: ['id'])
        .eq('conversation_id', convId)
        .order('created_at', ascending: false)
        .map((data) => List<Map<String, dynamic>>.from(data));
  }

  /// Fetches historical messages (Last 50) for parity restoration
  Future<List<Map<String, dynamic>>> getMessages(String convId, {int limit = 50}) async {
    try {
      final res = await _supabase.from('messages')
          .select('*')
          .eq('conversation_id', convId)
          .order('created_at', ascending: false)
          .limit(limit);
      return List<Map<String, dynamic>>.from(res);
    } catch (e) {
      debugPrint("Error fetching messages: $e");
      return [];
    }
  }



  Future<bool> requestAccountDeletion(String userId) async {
    try {
      final res = await _supabase.rpc('request_account_deletion', params: {
        'user_id_param': userId,
      });
      return true; // We assume true if no error is thrown
    } catch (e) {
      debugPrint("requestAccountDeletion error: $e");
      return false;
    }
  }

  Future<void> sendDirectMessage(String receiverId, String text) async {
    // Note: In a real app, you'd resolve the conversation_id first
    await _supabase.from('messages').insert({'content': text, 'sender_id': _supabase.auth.currentUser?.id});
  }

  Future<String?> createLiveChatTicket(String initialMessage) async {
    final userId = currentUserId;
    if (userId == null) return null;
    
    try {
      final email = _supabase.auth.currentUser?.email;
      final res = await _supabase.from('support_tickets').insert({
        'user_id': userId,
        'subject': 'Live Chat - General',
        'category': 'live_chat',
        'user_email': email,
      }).select('id').single();
      
      final ticketId = res['id'];
      
      await _supabase.from('support_messages').insert({
        'ticket_id': ticketId,
        'sender_id': userId,
        'sender_type': 'user',
        'content': initialMessage,
      });
      return ticketId;
    } catch (e) {
      debugPrint("createLiveChatTicket error: $e");
      return null;
    }
  }

  Future<void> sendSupportMessage(String ticketId, String content) async {
    final userId = currentUserId;
    if (userId == null) return;
    try {
      await _supabase.from('support_messages').insert({
        'ticket_id': ticketId,
        'sender_id': userId,
        'sender_type': 'user',
        'content': content,
      });
      await _supabase.from('support_tickets')
          .update({'status': 'open', 'updated_at': DateTime.now().toIso8601String()})
          .eq('id', ticketId);
    } catch (e) {
      debugPrint("sendSupportMessage error: $e");
    }
  }

  Stream<List<Map<String, dynamic>>> streamSupportMessages(String ticketId) {
    return _supabase.from('support_messages')
      .stream(primaryKey: ['id'])
      .eq('ticket_id', ticketId)
      .order('created_at', ascending: true);
  }



  // --- 100% NIKHUT TRADER & FINANCE LOGIC ---

  /// Fetches Level 5 Traders for the 'Recommended' tab with 300k threshold logic
  Future<List<Map<String, dynamic>>> getRecommendedTraders(String countryCode) async {
    try {
      // 1. Fetch ALL helper payment methods for this country
      final res = await _supabase.from('helper_country_payment_methods')
          .select('*, helper:topup_helpers(*, user:profiles(*))')
          .eq('country_code', countryCode)
          .eq('is_active', true);

      final methods = List<Map<String, dynamic>>.from(res);
      
      // 2. Parallel fetch for agency diamond balances to calculate combined balance
      final userIds = methods
          .where((m) => m['helper'] != null && m['helper']['user_id'] != null)
          .map((m) => m['helper']['user_id'].toString())
          .toSet()
          .toList();

      final Map<String, int> agencyBalances = {};
      if (userIds.isNotEmpty) {
        final balanceResults = await Future.wait(
          userIds.map((uid) => _supabase.rpc('get_agency_diamond_balance', params: {'owner_user_id': uid}))
        );
        for (int i = 0; i < userIds.length; i++) {
          agencyBalances[userIds[i]] = (balanceResults[i] as int? ?? 0);
        }
      }

      // 3. Filter by Level 5, Verified, Active, and 300k Combined Balance
      final filtered = methods.where((m) {
        final helper = m['helper'];
        if (helper == null) return false;
        
        final walletBalance = (helper['wallet_balance'] as int? ?? 0);
        final agencyBalance = agencyBalances[helper['user_id']] ?? 0;
        final combinedBalance = walletBalance + agencyBalance;
        
        final isLevel5 = helper['trader_level'] == 5 && helper['payroll_enabled'] == true;
        final isVerified = helper['is_verified'] == true;
        final isActive = helper['is_active'] == true;
        final hasThreshold = combinedBalance >= 300000;

        return isLevel5 && isVerified && isActive && hasThreshold;
      }).toList();

      // 4. Transform to unified format and Shuffle (Round-robin parity)
      final transformed = filtered.map((m) {
        final helper = m['helper'];
        final profile = helper['user'];
        return {
          'id': m['id'],
          'helper_id': m['helper_id'],
          'method_name': m['payment_method_name'],
          'account_name': m['account_name'] ?? profile['display_name'],
          'account_number': m['account_number'],
          'logo_url': m['logo_url'] ?? m['icon_url'],
          'instructions': m['instructions'],
          'additional_info': m['additional_info'],
          'helper_data': {
            'display_name': profile['display_name'],
            'avatar_url': profile['avatar_url'],
            'app_uid': profile['app_uid'],
            'is_online': profile['is_online'],
          }
        };
      }).toList();

      transformed.shuffle();
      return transformed;
    } catch (e) {
      debugPrint("Error fetching L5 traders: $e");
      return [];
    }
  }

  /// Fetches Level 1-4 Traders for the 'Helper' tab
  Future<List<Map<String, dynamic>>> getStandardTraders(String countryCode) async {
    try {
      final res = await _supabase.from('topup_helpers')
          .select('*, user:profiles(*)')
          .eq('country_code', countryCode)
          .eq('is_active', true)
          .eq('is_verified', true)
          .neq('trader_level', 5)
          .gte('wallet_balance', 100000)
          .order('total_sold', ascending: false);

      return List<Map<String, dynamic>>.from(res);
    } catch (e) {
      debugPrint("Error fetching standard traders: $e");
      return [];
    }
  }

  /// Fetches integrated payment gateways for a country (or GLOBAL)
  Future<List<PaymentGateway>> getCountryPaymentGateways(String? countryCode) async {
    try {
      var query = _supabase.from('payment_gateways').select('*').eq('is_active', true).order('display_order');
      final res = await query;
      
      final all = (res as List).map((g) => PaymentGateway.fromJson(g)).toList();
      
      if (countryCode == null) return all;
      
      return all.where((g) => 
        g.countryCodes.contains(countryCode) || g.countryCodes.contains('GLOBAL')
      ).toList();
    } catch (e) {
      debugPrint("Error fetching gateways: $e");
      return [];
    }
  }

  /// Fetches IDs of gateways a helper has accepted
  Future<Set<String>> getHelperAcceptedGatewayIds(String helperId) async {
    try {
      final res = await _supabase.from('helper_accepted_payment_methods')
          .select('gateway_id')
          .eq('helper_id', helperId)
          .eq('is_enabled', true);
      return (res as List).map((r) => r['gateway_id'].toString()).toSet();
    } catch (e) {
      return {};
    }
  }

  /// Updates helper accepted payment methods (Checkbox parity)
  Future<bool> updateHelperAcceptedMethod(String helperId, String gatewayId, bool enabled) async {
    try {
      if (!enabled) {
        await _supabase.from('helper_accepted_payment_methods')
            .delete()
            .eq('helper_id', helperId)
            .eq('gateway_id', gatewayId);
      } else {
        await _supabase.from('helper_accepted_payment_methods').upsert({
          'helper_id': helperId,
          'gateway_id': gatewayId,
          'is_enabled': true
        });
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  /// Fetches all 5 trader tiers from the database (Bronze to Diamond)
  Future<List<Map<String, dynamic>>> getTraderLevelTiers() async {
    try {
      final res = await _supabase.from('trader_level_tiers').select('*').order('level_number');
      return List<Map<String, dynamic>>.from(res);
    } catch (e) {
      // Fallback to defaults provided by user
      return [
        {'name': 'Bronze Trader', 'upgrade_cost_usd': 100, 'commission_rate': 0.0},
        {'name': 'Silver Trader', 'upgrade_cost_usd': 500, 'commission_rate': 1.5},
        {'name': 'Gold Trader', 'upgrade_cost_usd': 1000, 'commission_rate': 2.5},
        {'name': 'Platinum Trader', 'upgrade_cost_usd': 1500, 'commission_rate': 5.0},
        {'name': 'Diamond Trader', 'upgrade_cost_usd': 2500, 'commission_rate': 7.0},
      ];
    }
  }

  /// Claims an agency withdrawal with 30s lock for L5 Helpers
  Future<Map<String, dynamic>> claimAgencyWithdrawal(String withdrawalId) async {
    try {
       final res = await _supabase.rpc('claim_agency_withdrawal', params: {
         '_withdrawal_id': withdrawalId,
         '_lock_seconds': 30
       });
       return {'success': res['success'] ?? false, 'message': res['message']};
    } catch (e) {
      return {'success': false, 'error': e.toString()};
    }
  }

  /// Processes or completes an agency withdrawal by a helper
  Future<Map<String, dynamic>> helperProcessAgencyWithdrawal({
    required String withdrawalId,
    required String screenshotUrl,
    String? notes,
  }) async {
    try {
       final res = await _supabase.rpc('helper_process_agency_withdrawal', params: {
         '_withdrawal_id': withdrawalId,
         '_screenshot_url': screenshotUrl,
         '_notes': notes ?? ''
       });
       return {'success': res['success'] ?? false, 'message': res['message']};
    } catch (e) {
      return {'success': false, 'error': e.toString()};
    }
  }

  /// Releases a claimed agency withdrawal if the helper decides not to process it
  Future<bool> releaseAgencyWithdrawalClaim(String withdrawalId) async {
    try {
      await _supabase.rpc('release_agency_withdrawal_claim', params: {
        '_withdrawal_id': withdrawalId
      });
      return true;
    } catch (e) {
      debugPrint("releaseAgencyWithdrawalClaim error: $e");
      return false;
    }
  }

  /// Fetches the queue of pending agency withdrawals for Level 5 Helpers
  Future<List<Map<String, dynamic>>> getAgencyWithdrawalsQueue(String countryCode) async {
    try {
      final res = await _supabase.from('agency_withdrawals')
          .select('*, agency:agencies(name, agency_code, owner:profiles(display_name, avatar_url, app_uid)), claimed_by_profile:profiles!claimed_by(display_name)')
          .eq('country_code', countryCode)
          .inFilter('status', ['pending', 'processing'])
          .order('created_at', ascending: true);
      return List<Map<String, dynamic>>.from(res);
    } catch (e) {
      debugPrint("getAgencyWithdrawalsQueue error: $e");
      return [];
    }
  }

  /// Fetches support messages for helpers (Admin Inbox parity)
  Future<List<Map<String, dynamic>>> getHelperAdminMessages() async {
    try {
      final userId = currentUserId;
      if (userId == null) return [];
      final res = await _supabase.from('helper_admin_messages')
          .select('*, admin:profiles!admin_id(display_name, avatar_url)')
          .eq('helper_id', userId)
          .order('created_at', ascending: false);
      return List<Map<String, dynamic>>.from(res);
    } catch (e) {
      return [];
    }
  }

  /// Sends a reply to an admin message
  Future<bool> sendHelperAdminMessageReply(String messageId, String reply) async {
    try {
      await _supabase.from('helper_admin_messages').update({
        'helper_reply': reply,
        'replied_at': DateTime.now().toIso8601String(),
        'status': 'replied'
      }).eq('id', messageId);
      return true;
    } catch (e) {
      return false;
    }
  }

  /// Submits a manual P2P order from user to helper
  Future<Map<String, dynamic>> submitHelperOrder(Map<String, dynamic> data) async {
    try {
      final res = await _supabase.from('helper_orders').insert(data).select().single();
      return {'success': true, 'data': res};
    } catch (e) {
      return {'success': false, 'error': e.toString()};
    }
  }

  /// Fetches Helper Orders for dashboard
  Stream<List<Map<String, dynamic>>> getHelperOrdersStream() {
    final userId = _supabase.auth.currentUser?.id;
    if (userId == null) return Stream.value([]);
    return _supabase.from('helper_orders')
        .stream(primaryKey: ['id'])
        .eq('helper_id', userId)
        .order('created_at', ascending: false)
        .map((data) => List<Map<String, dynamic>>.from(data));
  }

  /// Searches for an agency by its code (e.g. AR123)
  Future<Map<String, dynamic>?> searchAgencyByCode(String code) async {
    try {
      final res = await _supabase.from('agencies')
          .select('*, owner:profiles(display_name, avatar_url)')
          .eq('agency_code', code.trim().toUpperCase())
          .maybeSingle();
      return res;
    } catch (e) {
      return null;
    }
  }

  /// Performs diamond transfer (Trader to User, Trader to Agency, or Self)
  Future<Map<String, dynamic>> performDiamondTransfer(Map<String, dynamic> params) async {
    try {
      final res = await _supabase.rpc('perform_diamond_transfer', params: params);
      return {'success': res['success'] ?? false, 'message': res['message']};
    } catch (e) {
      return {'success': false, 'error': e.toString()};
    }
  }

  /// Fetches agency performance history for charts (Parity with recharts)
  Future<List<Map<String, dynamic>>> getAgencyPerformanceHistory(String agencyId) async {
    try {
      final res = await _supabase.from('agency_performance')
          .select('*')
          .eq('agency_id', agencyId)
          .eq('period_type', 'daily')
          .order('period_start', ascending: true)
          .limit(7);
      return List<Map<String, dynamic>>.from(res);
    } catch (e) {
      return [];
    }
  }

  /// Fetches detailed agency earnings from transfers (gifts/calls)
  Future<List<Map<String, dynamic>>> getAgencyEarningsHistory(String agencyId) async {
    try {
      final res = await _supabase.from('agency_earnings_transfers')
          .select('*')
          .eq('agency_id', agencyId);
      return List<Map<String, dynamic>>.from(res);
    } catch (e) {
      debugPrint("getAgencyEarningsHistory error: $e");
      return [];
    }
  }

  /// Fetches summary for agency dashboard in one go (Parity with web batch 1)
  Future<Map<String, dynamic>> getAgencyDashboardStats(String agencyId) async {
    final userId = currentUserId;
    if (userId == null) return {};

    try {
      final results = await Future.wait([
        _supabase.from('agencies').select('*, owner:profiles(*)').eq('id', agencyId).maybeSingle(),
        _supabase.from('agency_hosts').select('id', count: CountOption.exact).eq('agency_id', agencyId).eq('status', 'active'),
        _supabase.from('agency_hosts').select('*, host:profiles(*)').eq('agency_id', agencyId).eq('status', 'pending'),
        _supabase.from('topup_helpers').select('*').eq('user_id', userId).maybeSingle(),
        _supabase.from('agency_performance').select('*').eq('agency_id', agencyId).eq('period_type', 'daily').order('period_start', ascending: false).limit(7),
        _supabase.from('agency_withdrawals').select('*').eq('agency_id', agencyId).order('created_at', ascending: false).limit(10),
        _supabase.from('agencies').select('id', count: CountOption.exact).eq('parent_id', agencyId).eq('is_active', true),
        _supabase.from('sub_agents').select('id', count: CountOption.exact).eq('agency_id', agencyId).eq('status', 'active'),
      ]);

      return {
        'agency': results[0],
        'host_count': results[1].count,
        'pending_hosts': results[2].data,
        'helper': results[3],
        'performance_history': results[4].data,
        'recent_withdrawals': results[5].data,
        'sub_agency_count': results[6].count,
        'sub_agent_count': results[7].count,
      };
    } catch (e) {
      debugPrint("getAgencyDashboardStats error: $e");
      return {};
    }
  }

  /// Sends diamonds from agency balance to a user (Parity with agency_send_diamonds_to_user RPC)
  Future<Map<String, dynamic>> agencySendDiamondsToUser({
    required String agencyId,
    required String receiverId,
    required int amount,
  }) async {
    try {
      final res = await _supabase.rpc('agency_send_diamonds_to_user', params: {
        '_agency_id': agencyId,
        '_receiver_id': receiverId,
        '_amount': amount,
      });
      return Map<String, dynamic>.from(res);
    } catch (e) {
      return {'success': false, 'error': e.toString()};
    }
  }

  /// Sends diamonds from agency balance to another agency (Parity with agency_send_diamonds_to_agency RPC)
  Future<Map<String, dynamic>> agencySendDiamondsToAgency({
    required String senderAgencyId,
    required String targetAgencyId,
    required int amount,
  }) async {
    try {
      final res = await _supabase.rpc('agency_send_diamonds_to_agency', params: {
        '_sender_agency_id': senderAgencyId,
        '_target_agency_id': targetAgencyId,
        '_amount': amount,
      });
      return Map<String, dynamic>.from(res);
    } catch (e) {
      return {'success': false, 'error': e.toString()};
    }
  }

  /// Fetches agency diamond transaction history
  Future<List<Map<String, dynamic>>> getAgencyDiamondTransactions(String agencyId) async {
    try {
      final res = await _supabase
          .from('agency_diamond_transactions')
          .select('*, profiles:user_id(display_name, avatar_url, app_uid)')
          .eq('agency_id', agencyId)
          .order('created_at', ascending: false)
          .limit(20);
      return List<Map<String, dynamic>>.from(res);
    } catch (e) {
      return [];
    }
  }

  /// Syncs agency metadata (host/agent counts) if out of sync
  Future<void> syncAgencyMetadata(String agencyId, {int? hostCount, int? agentCount}) async {
    final updates = <String, dynamic>{};
    if (hostCount != null) updates['total_hosts'] = hostCount;
    if (agentCount != null) updates['total_agents'] = agentCount;
    if (updates.isNotEmpty) {
      await _supabase.from('agencies').update(updates).eq('id', agencyId);
    }
  }

  /// Fetches detailed helper status including Level 5 / Payroll info
  Future<Map<String, dynamic>?> getHelperStatus(String userId) async {
    try {
      return await _supabase.from('topup_helpers')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();
    } catch (e) {
      return null;
    }
  }

  /// Searches for a user by their unique App UID


  /// Sends an OTP notification directly to the user's app


  /// Sends an OTP to the user's email via Edge Function
  Future<Map<String, dynamic>> sendEmailOtp(String email) async {
    try {
      final response = await _supabase.functions.invoke('send-email-otp', body: {
        'email': email.trim().toLowerCase(),
        'purpose': 'verify'
      });
      return Map<String, dynamic>.from(response.data);
    } catch (e) {
      return {'success': false, 'error': e.toString()};
    }
  }

  /// Verifies the Email OTP
  Future<Map<String, dynamic>> verifyEmailOtp(String email, String otp) async {
    try {
      final response = await _supabase.functions.invoke('verify-email-otp', body: {
        'email': email.trim().toLowerCase(),
        'otp': otp,
        'purpose': 'verify'
      });
      return Map<String, dynamic>.from(response.data);
    } catch (e) {
      return {'success': false, 'error': e.toString()};
    }
  }

  /// Uploads multiple host media files (photos/video) to storage
  Future<List<String>> uploadHostMedia(List<String> filePaths) async {
    try {
      final userId = currentUserId;
      if (userId == null) return [];
      
      List<String> uploadedUrls = [];
      for (var path in filePaths) {
        final file = File(path);
        final ext = path.split('.').last;
        final folder = (ext == 'mp4' || ext == 'mov' || ext == 'webm') ? 'videos' : 'photos';
        final fileName = '$userId/$folder/${DateTime.now().millisecondsSinceEpoch}.$ext';
        
        await _supabase.storage.from('host-verification').upload(fileName, file);
        final publicUrl = _supabase.storage.from('host-verification').getPublicUrl(fileName);
        uploadedUrls.add(publicUrl);
      }
      return uploadedUrls;
    } catch (e) {
      debugPrint("uploadHostMedia error: $e");
      return [];
    }
  }



  /// Joins an agency via RPC (matches web's join_agency logic)
  Future<Map<String, dynamic>> joinAgencyV2({
    required String hostId,
    required String agencyCode,
    String joinedVia = 'host_registration',
  }) async {
    try {
      final res = await _supabase.rpc('join_agency', params: {
        '_host_id': hostId,
        '_agency_code': agencyCode.trim().toUpperCase(),
        '_joined_via': joinedVia,
      });
      return {'success': true, 'data': res};
    } catch (e) {
      return {'success': false, 'error': e.toString()};
    }
  }

  /// Checks for pending/active agency requests for a host
  Future<Map<String, dynamic>?> getHostAgencyRequest(String hostId) async {
    try {
      final res = await _supabase.rpc('get_host_agency_request', params: {
        '_host_id': hostId,
      });
      if (res != null && (res as List).isNotEmpty) {
        return Map<String, dynamic>.from(res[0]);
      }
      return null;
    } catch (e) {
      debugPrint("getHostAgencyRequest error: $e");
      return null;
    }
  }

  /// Cancels a pending agency request via RPC
  Future<bool> cancelAgencyRequestV2(String hostId) async {
    try {
      await _supabase.rpc('cancel_agency_request', params: {
        '_host_id': hostId,
      });
      return true;
    } catch (e) {
      debugPrint("cancelAgencyRequestV2 error: $e");
      return false;
    }
  }

  /// Finalizes Host Onboarding Step 1 & 2 (Saves to host_applications)
  Future<Map<String, dynamic>> submitHostApplication({
    required String fullName,
    required int age,
    required String language,
    required String photoUrl,
    required List<String> portfolioUrls,
    required String videoUrl,
    String? agencyCode,
  }) async {
    try {
      final userId = currentUserId;
      if (userId == null) throw Exception("Not logged in");

      final res = await _supabase.from('host_applications').upsert({
        'user_id': userId,
        'full_name': fullName,
        'age': age,
        'language': language,
        'photo_url': photoUrl,
        'host_photos': portfolioUrls,
        'video_url': videoUrl,
        'status': 'pending',
        'current_step': 3, // Ready for face verification
        'is_complete': false,
      }).select().single();

      return {'success': true, 'data': res};
    } catch (e) {
      return {'success': false, 'error': e.toString()};
    }
  }

  /// Calls the auto-face-verify edge function (Amazon Rekognition integration)
  Future<Map<String, dynamic>> callAutoFaceVerify({
    required String imageBase64,
    String? submissionId,
    int? introVideoDuration,
    int? faceVideoDuration,
  }) async {
    try {
      final response = await _supabase.functions.invoke('auto-face-verify', body: {
        'imageBase64': imageBase64,
        'submissionId': submissionId,
        'introVideoDurationSeconds': introVideoDuration,
        'faceVideoDurationSeconds': faceVideoDuration,
      });
      return Map<String, dynamic>.from(response.data);
    } catch (e) {
      return {'success': false, 'error': e.toString()};
    }
  }

  /// Calls the face-check edge function for real-time pose validation
  Future<Map<String, dynamic>?> callFaceCheck(String imageBase64) async {
    try {
      final response = await _supabase.functions.invoke('face-check', body: {
        'imageBase64': imageBase64,
        'streamId': 'face-verification-flutter',
      });
      if (response.data == null) return null;
      return Map<String, dynamic>.from(response.data);
    } catch (e) {
      debugPrint("callFaceCheck error: $e");
      return null;
    }
  }

  /// Checks for duplicate face registrations (Parity with web)
  Future<Map<String, dynamic>?> findAccountByFace(String faceHash) async {
    try {
      final res = await _supabase.rpc('find_account_by_face', params: {
        'face_hash_param': faceHash,
      });
      return res;
    } catch (e) {
      debugPrint("findAccountByFace error: $e");
      return null;
    }
  }

  /// Permanently bans a user for duplicate face attempt (Master Parity)
  Future<void> enforceDuplicateFaceBan({
    required String duplicateUserId,
    String? duplicateUid,
  }) async {
    try {
      final userId = currentUserId;
      if (userId == null) return;
      
      await _supabase.rpc('ban_duplicate_face_attempt', params: {
        '_user_id': userId,
        '_duplicate_user_id': duplicateUserId,
        '_duplicate_uid': duplicateUid ?? duplicateUserId,
      });
      
      // Logout after ban
      await logout();
    } catch (e) {
      debugPrint("enforceDuplicateFaceBan error: $e");
    }
  }

  /// Submits a comprehensive face verification request (Master Parity)
  Future<Map<String, dynamic>> createFaceVerificationSubmission({
    required String verificationType, // 'user' or 'host'
    required String fullName,
    required int age,
    required String language,
    required String profilePhotoUrl,
    required String faceVideoUrl,
    String? introVideoUrl,
    List<String>? hostPhotos,
    String? faceHash,
    bool isDuplicateFace = false,
    String? duplicateFaceUserId,
    String? duplicateFaceName,
  }) async {
    try {
      final userId = currentUserId;
      if (userId == null) throw "Unauthorized";

      final payload = {
        'user_id': userId,
        'verification_type': verificationType,
        'status': 'pending',
        'full_name': fullName,
        'age': age,
        'language': language,
        'profile_photo_url': profilePhotoUrl,
        'face_image_url': faceVideoUrl,
        'video_url': introVideoUrl,
        'host_photos': hostPhotos,
        'face_hash': faceHash,
        'is_duplicate_face': isDuplicateFace,
        'duplicate_face_user_id': duplicateFaceUserId,
        'duplicate_face_name': duplicateFaceName,
      };

      final res = await _supabase.from('face_verification_submissions').insert(payload).select().single();
      return {'success': true, 'data': res};
    } catch (e) {
      debugPrint("createFaceVerificationSubmission error: $e");
      return {'success': false, 'error': e.toString()};
    }
  }


  /// Creates a new agency (Agency Signup parity)
  Future<Map<String, dynamic>> createAgencyForUser({
    required String ownerId,
    required String name,
    required String agencyCode,
    String? email,
    String? whatsapp,
    String level = 'A1',
    double commissionRate = 3.0,
  }) async {
    try {
      final res = await _supabase.rpc('create_agency_for_user', params: {
        '_owner_id': ownerId,
        '_name': name,
        '_agency_code': agencyCode,
        '_level': level,
        '_commission_rate': commissionRate,
        '_email': email,
        '_whatsapp': whatsapp,
      });
      
      return Map<String, dynamic>.from(res);
    } catch (e) {
      return {'success': false, 'error': e.toString()};
    }
  }

  /// Submits an actual agency withdrawal request to the DB
  Future<Map<String, dynamic>> requestAgencyWithdrawal({
    required String agencyId,
    required double amountUsd,
    required int beansAmount,
    required String method,
    required String details,
  }) async {
    try {
      await _supabase.rpc('request_agency_withdrawal', params: {
        '_agency_id': agencyId,
        '_amount_usd': amountUsd,
        '_beans_amount': beansAmount,
        '_method': method,
        '_payment_details': details,
      });
      return {'success': true, 'message': 'Withdrawal request submitted'};
    } catch (e) {
      return {'success': false, 'error': e.toString()};
    }
  }

  /// Checks if the current user owns an agency
  Future<Map<String, dynamic>?> getOwnedAgency() async {
    try {
      final userId = currentUserId;
      if (userId == null) return null;
      return await _supabase.from('agencies').select('*').eq('owner_id', userId).maybeSingle();
    } catch (e) {
      debugPrint("getOwnedAgency error: $e");
      return null;
    }
  }

  /// Checks if the current user is a host in any agency (active status)
  Future<Map<String, dynamic>?> getActiveAgencyHost() async {
    try {
      final userId = currentUserId;
      if (userId == null) return null;
      return await _supabase.from('agency_hosts')
          .select('*, agency:agencies(*)')
          .eq('host_id', userId)
          .eq('status', 'active')
          .maybeSingle();
    } catch (e) {
      debugPrint("getActiveAgencyHost error: $e");
      return null;
    }
  }

  /// Checks if the current user has Admin or Owner privileges
  Future<Map<String, dynamic>> checkAdminStatus() async {
    try {
      final user = _supabase.auth.currentUser;
      if (user == null) return {'isAdmin': false};

      // Owner check via hardcoded emails (Parity with web useAdminAccess)
      const ownerEmails = ["smtv923@gmail.com", "sazzadshifa776@gmail.com"];
      bool isHardcodedOwner = user.email != null && ownerEmails.contains(user.email);

      // Self-heal linkage if needed
      if (isHardcodedOwner) {
        await ensureAdminLinkage(user.id, user.email!);
      }

      final res = await _supabase.from('admin_users')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .maybeSingle();
      
      return {
        'isAdmin': res != null || isHardcodedOwner,
        'role': res?['role'] ?? (isHardcodedOwner ? 'owner' : 'user'),
        'data': res
      };
    } catch (e) {
      return {'isAdmin': false, 'error': e.toString()};
    }
  }

  /// Ensures a user with a specific email is linked to an admin_users record by user_id
  Future<void> ensureAdminLinkage(String userId, String email) async {
    try {
      // 1. Check if user_id is already linked
      final existingById = await _supabase.from('admin_users').select('id').eq('user_id', userId).maybeSingle();
      if (existingById != null) return;

      // 2. Check if there is an orphan record with this email but no user_id
      final existingByEmail = await _supabase.from('admin_users').select('id').eq('email', email.toLowerCase()).isFilter('user_id', null).maybeSingle();
      
      if (existingByEmail != null) {
        // Link it
        await _supabase.from('admin_users').update({'user_id': userId, 'is_active': true}).eq('id', existingByEmail['id']);
      } else {
        // Create it if they are an owner
        const ownerEmails = ["smtv923@gmail.com", "sazzadshifa776@gmail.com"];
        if (ownerEmails.contains(email.toLowerCase())) {
           await _supabase.from('admin_users').upsert({
            'user_id': userId,
            'email': email.toLowerCase(),
            'role': 'owner',
            'is_active': true,
            'display_name': 'Owner',
            'accepted_at': DateTime.now().toIso8601String(),
          }, onConflict: 'email');
        }
      }
    } catch (e) {
      debugPrint("ensureAdminLinkage error: $e");
    }
  }

  /// Admin: Fetches list of users for management
  Future<List<Map<String, dynamic>>> getAdminUsers({String? query, String? status}) async {
    try {
      var request = _supabase.from('profiles').select('*');
      if (query != null && query.isNotEmpty) {
        request = request.or('display_name.ilike.%$query%,app_uid.ilike.%$query%');
      }
      if (status != null) {
        if (status == 'banned') request = request.eq('is_blocked', true);
        if (status == 'active') request = request.eq('is_blocked', false);
      }
      return List<Map<String, dynamic>>.from(await request.order('created_at', ascending: false).limit(50));
    } catch (e) {
      return [];
    }
  }

  Future<bool> updateAdminUserStatus(String userId, bool isBlocked) async {
    try {
      await _supabase.rpc("admin_block_user", params: {
        '_user_id': userId,
        '_block': isBlocked,
        '_reason': isBlocked ? "Blocked from app admin panel" : null
      });
      return true;
    } catch (e) {
      debugPrint("Block User error: $e");
      return false;
    }
  }

  /// Admin: Fetches all agencies for hub management


  /// Admin: Fetches pending host applications globally
  Future<List<Map<String, dynamic>>> getAdminHostApplications() async {
    try {
      final res = await _supabase.from('host_applications')
          .select('*, user:profiles(display_name, avatar_url, app_uid, email, agency_id)')
          .eq('status', 'pending')
          .order('created_at', ascending: false);
          
      final List<Map<String, dynamic>> apps = List<Map<String, dynamic>>.from(res);
      final Set<String> agencyIds = {};
      for (var a in apps) {
        final profile = a['user'];
        if (profile != null && profile['agency_id'] != null) {
          agencyIds.add(profile['agency_id'].toString());
        }
      }

      if (agencyIds.isNotEmpty) {
        final agencies = await _supabase.from('agencies').select('id, name, agency_code').inFilter('id', agencyIds.toList());
        final Map<String, dynamic> agencyMap = { for (var item in agencies as List) item['id'].toString() : item };
        for (var a in apps) {
          final profile = a['user'];
          if (profile != null && profile['agency_id'] != null) {
             a['agency'] = agencyMap[profile['agency_id'].toString()];
          }
        }
      }

      return apps;
    } catch (e) {
      debugPrint("getAdminHostApplications error: $e");
      return [];
    }
  }

  Future<bool> adminUpdateHostApplicationStatus(String applicationId, String userId, String status) async {
    try {
      await _supabase.from('host_applications').update({
        'status': status,
        'reviewed_at': DateTime.now().toIso8601String()
      }).eq('id', applicationId);

      if (status == 'approved') {
        await _supabase.rpc('admin_update_user_gender', params: {
          '_user_id': userId,
          '_gender': 'female',
        });
        await _supabase.rpc('admin_toggle_face_verification', params: {
          '_user_id': userId,
          '_verified': true,
        });
      } else {
        await _supabase.rpc('admin_update_user_gender', params: {
          '_user_id': userId,
          '_gender': 'male',
        });
      }

      return true;
    } catch (e) {
      debugPrint("Host application status update error: $e");
      return false;
    }
  }

  /// Admin: Fetches global withdrawal requests (Parity with AdminWithdrawals.tsx)
  Future<List<Map<String, dynamic>>> getAdminWithdrawals() async {
    try {
      final res = await _supabase.from('agency_withdrawals')
          .select('*, agency:agencies(name, agency_code, owner:profiles(display_name))')
          .order('requested_at', ascending: false);
      return List<Map<String, dynamic>>.from(res);
    } catch (e) {
      return [];
    }
  }

  /// Admin: Approves or Rejects a withdrawal
  Future<bool> processAdminWithdrawal(String withdrawalId, String status) async {
    try {
      await _supabase.from('agency_withdrawals').update({
        'status': status,
        'helper_processed_at': DateTime.now().toIso8601String()
      }).eq('id', withdrawalId);
      return true;
    } catch (e) {
      return false;
    }
  }

  /// Admin: Fetches global app settings for hub management
  Future<List<Map<String, dynamic>>> getAdminAppSettings() async {
    try {
      final res = await _supabase.from('app_settings').select('*').order('setting_key');
      return List<Map<String, dynamic>>.from(res);
    } catch (e) {
      return [];
    }
  }

  /// Helper: Submits a manual diamond stock purchase request (Manual Top-up parity)
  Future<Map<String, dynamic>> submitHelperTopupRequest({
    required String helperId,
    required double amountUsd,
    required int coinAmount,
    required String paymentMethod,
    required String screenshotUrl,
    String? transactionId,
    String? notes,
  }) async {
    try {
      final res = await _supabase.from('helper_topup_requests').insert({
        'helper_id': helperId,
        'user_id': _supabase.auth.currentUser?.id,
        'amount_usd': amountUsd,
        'coin_amount': coinAmount,
        'payment_method': paymentMethod,
        'payment_proof_url': screenshotUrl,
        'transaction_id': transactionId,
        'notes': notes,
        'status': 'pending'
      }).select().single();
      return {'success': true, 'data': res};
    } catch (e) {
      return {'success': false, 'error': e.toString()};
    }
  }

  /// Admin: Fetches manual topup requests
  Future<List<Map<String, dynamic>>> getAdminTopupRequests() async {
    try {
      final res = await _supabase.from('helper_topup_requests')
          .select('*, user:profiles(display_name, avatar_url, app_uid)')
          .order('created_at', ascending: false);
      return List<Map<String, dynamic>>.from(res);
    } catch (e) {
      return [];
    }
  }

  /// Admin: Processes a topup request
  Future<bool> adminProcessTopup(String requestId, String status) async {
    try {
      await _supabase.from('helper_topup_requests').update({
        'status': status,
        'processed_at': DateTime.now().toIso8601String()
      }).eq('id', requestId);
      return true;
    } catch (e) {
      return false;
    }
  }

  /// Helper: Saves WhatsApp number to public contact info
  Future<bool> saveHelperWhatsapp(String helperId, String whatsapp) async {
    try {
      final helper = await _supabase.from('topup_helpers').select('contact_info').eq('id', helperId).maybeSingle();
      final Map<String, dynamic> existing = Map<String, dynamic>.from(helper?['contact_info'] ?? {});
      existing['whatsapp'] = whatsapp;
      
      await _supabase.from('topup_helpers').update({
        'contact_info': existing,
        'order_notification_phone': whatsapp // Sync for notification parity
      }).eq('id', helperId);
      return true;
    } catch (e) {
      return false;
    }
  }

  /// Agency: Fetches dynamic policy settings (Tabbed display parity)
  Future<List<Map<String, dynamic>>> fetchPolicySettings() async {
    try {
      final res = await _supabase.from('agency_policy_settings')
          .select('*')
          .eq('is_active', true)
          .order('display_order');
      return List<Map<String, dynamic>>.from(res);
    } catch (e) {
      return [];
    }
  }

  /// Admin: Fetches support tickets (A to Z management)
  Future<List<Map<String, dynamic>>> getAdminSupportTickets() async {
    try {
      final res = await _supabase.from('support_tickets')
          .select('*, user:profiles(display_name, avatar_url, app_uid)')
          .order('created_at', ascending: false);
      return List<Map<String, dynamic>>.from(res);
    } catch (e) {
      return [];
    }
  }

  /// Admin: Updates support ticket status/response
  Future<bool> updateSupportTicket(String ticketId, {required String status, String? adminNote}) async {
    try {
      await _supabase.from('support_tickets').update({
        'status': status,
        'admin_note': adminNote,
        'closed_at': status == 'closed' ? DateTime.now().toIso8601String() : null
      }).eq('id', ticketId);
      return true;
    } catch (e) {
      return false;
    }
  }

  /// Admin: Fetches system banners for CMS management
  Future<List<Map<String, dynamic>>> getAdminSystemBanners() async {
    try {
      return List<Map<String, dynamic>>.from(await _supabase.from('banners').select('*').order('created_at'));
    } catch (e) { return []; }
  }

  /// Admin: Toggles or updates banner
  Future<bool> updateAdminBanner(String bannerId, Map<String, dynamic> data) async {
    try {
      await _supabase.from('banners').update(data).eq('id', bannerId);
      return true;
    } catch (e) { return false; }
  }

  /// Admin: Fetches gift list for price/asset management
  Future<List<Map<String, dynamic>>> getAdminGifts() async {
    try {
       return List<Map<String, dynamic>>.from(await _supabase.from('gifts').select('*').order('price_diamonds'));
    } catch (e) { return []; }
  }

  /// Admin: Updates gift metadata
  Future<bool> updateAdminGift(String giftId, Map<String, dynamic> data) async {
    try {
      await _supabase.from('gifts').update(data).eq('id', giftId);
      return true;
    } catch (e) { return false; }
  }

  /// Helper: Powerful UID search (A-Z Sync parity)


  /// Helper: Performs diamond transfer (Trader Inventory Sync)


  /// Admin: Fetches all agencies with owner details (Enterprise parity)
  Future<List<Map<String, dynamic>>> getAdminAgencies() async {
    try {
      final res = await _supabase.from('agencies')
          .select('*, owner:profiles(*)')
          .order('name');
      return List<Map<String, dynamic>>.from(res);
    } catch (e) {
      return [];
    }
  }

  /// Admin: Advanced Host Search with Agency check (Functional parity)
  Future<Map<String, dynamic>?> adminSearchHost(String appUid) async {
    try {
      final profile = await _supabase.from('profiles')
          .select('*, agency:agencies(*)')
          .eq('app_uid', appUid.toUpperCase())
          .maybeSingle();
      return profile;
    } catch (e) {
      return null;
    }
  }

  /// Admin: Fetches Face Verification Submissions (Parity with AdminFaceVerification.tsx)
  Future<List<Map<String, dynamic>>> getAdminFaceVerificationSubmissions() async {
    try {
      final res = await _supabase.from('face_verification_submissions')
          .select('*, user:profiles(id, display_name, avatar_url, app_uid, gender, is_host, is_face_verified)')
          .order('created_at', ascending: false);
      
      final List<Map<String, dynamic>> submissions = List<Map<String, dynamic>>.from(res);
      
      // Fetch Agency info for Host-type submissions
      final hostIds = submissions.where((s) => s['verification_type'] == 'host').map((s) => s['user_id']).toList();
      if (hostIds.isNotEmpty) {
        final agencyHosts = await _supabase.from('agency_hosts')
            .select('host_id, agency:agencies(name, agency_code)')
            .inFilter('host_id', hostIds)
            .eq('status', 'active');
        
        final Map<String, dynamic> agencyMap = { for (var item in agencyHosts as List) item['host_id'].toString() : item['agency'] };
        for (var s in submissions) {
          if (s['verification_type'] == 'host') {
            s['agency_info'] = agencyMap[s['user_id'].toString()];
          }
        }
      }
      
      return submissions;
    } catch (e) {
      return [];
    }
  }

  /// Admin: Unified Face Verification Processor (Approved/Rejected logic)
  Future<bool> adminProcessFaceVerification({
    required String submissionId,
    required String action,
    String? reason,
    String? approveAs,
    String? setGender,
  }) async {
    try {
      await _supabase.rpc('admin_process_face_verification', params: {
        '_submission_id': submissionId,
        '_action': action,
        '_reason': reason,
        '_approve_as': approveAs ?? 'user',
        '_set_gender': setGender ?? 'male',
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  /// Admin: Removes existing verification to allow re-submission (Debug parity)
  Future<bool> adminRemoveFaceVerification(String userId) async {
    try {
      await _supabase.rpc('admin_remove_face_verification', params: { '_user_id': userId });
      return true;
    } catch (e) {
      return false;
    }
  }

  /// Admin: Fetches Real-time Global Dashboard Stats (100% Sync Parity)
  Future<Map<String, dynamic>> getAdminDashboardStats() async {
    try {
      // Primary Source: RPC (Optimized)
      final res = await _supabase.rpc('get_admin_dashboard_stats');
      if (res != null) return Map<String, dynamic>.from(res);
      throw Exception("RPC returned null");
    } catch (e) {
      debugPrint("getAdminDashboardStats RPC failed, using manual fallback: $e");
      
      // Secondary Source: Manual Parallel Counts (Parity Fallback)
      try {
        final results = await Future.wait<dynamic>([
          _supabase.from('profiles').select('id').count(CountOption.exact),
          _supabase.from('profiles').select('id').eq('is_host', true).count(CountOption.exact),
          _supabase.from('agencies').select('id').count(CountOption.exact),
          _supabase.from('live_streams').select('id').eq('is_active', true).count(CountOption.exact),
          _supabase.from('profiles').select('id').eq('is_online', true).count(CountOption.exact),
          _supabase.from('agency_withdrawals').select('id').inFilter('status', ['pending', 'processing']).count(CountOption.exact),
          _supabase.from('host_applications').select('id').eq('status', 'pending').count(CountOption.exact),
        ]);

        return {
          'total_users': results[0].count ?? 0,
          'total_hosts': results[1].count ?? 0,
          'total_agencies': results[2].count ?? 0,
          'active_streams': results[3].count ?? 0,
          'online_users': results[4].count ?? 0,
          'pending_withdrawals': results[5].count ?? 0,
          'pending_host_applications': results[6].count ?? 0,
          'active_party_rooms': 0, // Fallback
          'total_gifts_today': 0,
          'total_calls_today': 0,
          'blocked_users': 0,
          'today_revenue': 0.0,
        };
      } catch (innerE) {
        debugPrint("Critical: Admin stats manual fallback also failed: $innerE");
        return {
          'total_users': 0, 'total_hosts': 0, 'total_agencies': 0, 
          'active_streams': 0, 'online_users': 0, 'pending_withdrawals': 0
        };
      }
    }
  }

  /// Admin: Fetches all sub-admins (Supervisors) from the admin_users table
  Future<List<Map<String, dynamic>>> getAdminSubAdmins() async {
    try {
      final res = await _supabase.from('admin_users')
          .select('*, user:profiles(display_name, avatar_url, app_uid, email)')
          .eq('is_active', true)
          .order('role');
      return List<Map<String, dynamic>>.from(res);
    } catch (e) {
      debugPrint("getAdminSubAdmins error: $e");
      return [];
    }
  }

  /// Atomic game transaction: Places a bet
  Future<Map<String, dynamic>> placeGameBet({required String gameId, required int amount}) async {
    try {
      final res = await _supabase.rpc('atomic_place_game_bet', params: {
        '_game_id': gameId,
        '_amount': amount,
      });
      return Map<String, dynamic>.from(res);
    } catch (e) {
      return {'success': false, 'error': e.toString()};
    }
  }

  /// Atomic game transaction: Concludes game and updates balance
  Future<Map<String, dynamic>> concludeGame({required String gameId, required int winAmount}) async {
    try {
      final res = await _supabase.rpc('atomic_conclude_game', params: {
        '_game_id': gameId,
        '_win_amount': winAmount,
      });
      return Map<String, dynamic>.from(res);
    } catch (e) {
      return {'success': false, 'error': e.toString()};
    }
  }

  /// [NEW] Secure Game Play using Server-Side RNG (A-Z Parity)
  Future<Map<String, dynamic>> playSecureGame({required String gameId, required int amount}) async {
    try {
      final res = await _supabase.rpc('secure_play_native_game', params: {
        'p_game_id': gameId,
        'p_bet_amount': amount,
      });
      return Map<String, dynamic>.from(res);
    } catch (e) {
      return {'success': false, 'error': e.toString()};
    }
  }

  /// [NEW] Admin: Update Game Config
  Future<bool> updateGameConfig(String gameId, Map<String, dynamic> updates) async {
    try {
      await _supabase.from('game_configs').update(updates).eq('game_id', gameId);
      return true;
    } catch (e) {
      debugPrint("Error updating game config: $e");
      return false;
    }
  }

  /// Fetches a dynamic setting from the app_settings table (Sync Parity)
  Future<dynamic> getAppSettingsValue(String key, {dynamic defaultValue}) async {
    try {
      final res = await _supabase.from('app_settings').select('setting_value').eq('setting_key', key).maybeSingle();
      return res?['setting_value'] ?? defaultValue;
    } catch (e) {
      return defaultValue;
    }
  }

  /// Agency: Transfers coins to another user (Trader workflow)
  Future<bool> traderTransfer({
    required String helperId,
    required String recipientId,
    required String recipientType,
    required int amount,
  }) async {
    try {
      await _supabase.rpc('trader_transfer_coins', params: {
        '_helper_id': helperId,
        '_recipient_id': recipientId,
        '_recipient_type': recipientType,
        '_amount': amount,
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  /// Trader: Aggregates all sources (Exchange, L1-L4) for consolidated balance display
  Future<Map<String, dynamic>> getTraderWalletStats(String helperId) async {
    try {
      final res = await _supabase.from('topup_helpers').select().eq('id', helperId).maybeSingle();
      if (res == null) return {'total_balance': 0};
      
      final int exchange = res['exchange_balance'] ?? 0;
      final int l1 = res['level1_balance'] ?? 0;
      final int l2 = res['level2_balance'] ?? 0;
      final int l3 = res['level3_balance'] ?? 0;
      final int l4 = res['level4_balance'] ?? 0;
      final int wallet = res['wallet_balance'] ?? 0; // Legacy or primary buffer
      
      return {
        'total_balance': (exchange + l1 + l2 + l3 + l4 + wallet),
        'exchange': exchange,
        'l1': l1,
        'l2': l2,
        'l3': l3,
        'l4': l4,
        'wallet': wallet,
      };
    } catch (e) {
      debugPrint("getTraderWalletStats error: $e");
      return {'total_balance': 0};
    }
  }


  /// Trader: Fetches transfer history for a helper
  Future<List<Map<String, dynamic>>> getTraderTransferHistory(String helperId) async {
    try {
      final res = await _supabase.from('coin_trader_history').select('*, recipient:profiles!inner(*)').eq('helper_id', helperId).order('created_at', ascending: false);
      return List<Map<String, dynamic>>.from(res);
    } catch (e) {
      return [];
    }
  }

  /// Admin: Fetches all trader wallets for overview
  Future<List<Map<String, dynamic>>> getAdminTraderWallets() async {
    try {
      final res = await _supabase.from('coin_trader_stock')
          .select('*, helper:topup_helpers(*, user:profiles(display_name, avatar_url, app_uid))')
          .order('wallet_balance', ascending: false);
      return List<Map<String, dynamic>>.from(res);
    } catch (e) {
      debugPrint("getAdminTraderWallets error: $e");
      return [];
    }
  }

  /// Fetches a user profile by their App UID (Sync Parity)
  Future<Map<String, dynamic>?> getUserProfileByUid(String uid) async {
    try {
      return await _supabase.from('profiles').select('*').eq('app_uid', uid).maybeSingle();
    } catch (e) {
      return null;
    }
  }

  /// Quick access to current Supabase user
  /// Quick access to current Supabase user
  User? get currentUser => _supabase.auth.currentUser;

  // --- VIP & PRIVILEGES ---
  Future<List<Map<String, dynamic>>> getVipPackages() async {
    final res = await _supabase.from('vip_packages').select('*').eq('is_active', true).order('level');
    return List<Map<String, dynamic>>.from(res);
  }

  Future<List<Map<String, dynamic>>> getUserActiveVips() async {
    final uid = currentUserId;
    if (uid == null) return [];
    final res = await _supabase.from('user_vips').select('*, package:vip_packages(*)').eq('user_id', uid).gt('expires_at', DateTime.now().toIso8601String());
    return List<Map<String, dynamic>>.from(res);
  }

  Future<Map<String, dynamic>> purchaseVipPackage(String packageId) async {
    try {
      final res = await _supabase.rpc('purchase_vip_package', params: {'p_package_id': packageId});
      return {'success': true, 'data': res};
    } catch (e) {
      return {'success': false, 'error': e.toString()};
    }
  }

  // --- PROFILE & STATS ---









  // --- CHAT & CONVERSATIONS ---
  Future<String?> getOrCreateConversation(String targetUserId) async {
    try {
      final myId = currentUserId;
      if (myId == null) return null;
      
      final convId = generateConversationId(targetUserId);
      
      // Try to find existing
      final existing = await _supabase.from('conversations').select('id').eq('id', convId).maybeSingle();
      if (existing != null) return existing['id'];
      
      // Create new
      await _supabase.from('conversations').insert({
        'id': convId,
        'user1_id': myId.compareTo(targetUserId) < 0 ? myId : targetUserId,
        'user2_id': myId.compareTo(targetUserId) < 0 ? targetUserId : myId,
      });
      return convId;
    } catch (e) {
      return null;
    }
  }

  // --- VIP & NOBLE (Sync Parity) ---
  Future<List<Map<String, dynamic>>> getNoblePackages() async {
    try {
      final res = await _supabase.from('noble_cards').select('*').eq('is_active', true).order('level');
      return List<Map<String, dynamic>>.from(res);
    } catch (e) {
      debugPrint("getNoblePackages error: $e");
      return [];
    }
  }

  Future<Map<String, dynamic>> activateNoble(String nobleId) async {
    try {
      final res = await _supabase.rpc('activate_noble_membership', params: {'p_noble_id': nobleId});
      return {'success': true, 'data': res};
    } catch (e) {
      return {'success': false, 'error': e.toString()};
    }
  }

  // --- RECHARGE & PAYMENTS (Sync Parity) ---
  Future<Map<String, dynamic>> submitRechargeProof({
    required String packageId,
    required String methodId,
    required String transactionId,
    required String senderNumber,
    String? proofUrl,
  }) async {
    try {
      final uid = currentUserId;
      if (uid == null) throw "Unauthorized";

      final res = await _supabase.from('helper_orders').insert({
        'user_id': uid,
        'package_id': packageId,
        'helper_method_id': methodId,
        'transaction_id': transactionId,
        'sender_number': senderNumber,
        'proof_image_url': proofUrl,
        'status': 'pending',
      }).select().single();

      return {'success': true, 'data': res};
    } catch (e) {
      debugPrint("submitRechargeProof error: $e");
      return {'success': false, 'error': e.toString()};
    }
  }

  // --- AGENCY MANAGEMENT (Sync Parity) ---
  Future<Map<String, dynamic>> requestAgencyWithdrawal({
    required String agencyId,
    required int beansAmount,
    required double amountUsd,
    required double feeUsd,
    required double netUsd,
    required String method,
    required String details,
  }) async {
    try {
      final res = await _supabase.rpc('request_agency_withdrawal_v2', params: {
        'p_agency_id': agencyId,
        'p_beans_amount': beansAmount,
        'p_usd_amount': amountUsd,
        'p_fee_usd': feeUsd,
        'p_net_usd': netUsd,
        'p_payment_method': method,
        'p_payment_details': details,
      });
      return {'success': true, 'data': res};
    } catch (e) {
      return {'success': false, 'error': e.toString()};
    }
  }

  Future<List<Map<String, dynamic>>> getAgencyWithdrawalHistory(String agencyId) async {
    try {
      final res = await _supabase
          .from('agency_withdrawals')
          .select('*')
          .eq('agency_id', agencyId)
          .order('created_at', ascending: false)
          .limit(50);
      return List<Map<String, dynamic>>.from(res);
    } catch (e) {
      return [];
    }
  }

  // --- LEVEL SYSTEM (Accurate XP Sync) ---
  /// Replaces hardcoded logic with precise paginated transaction sums (Parity with Level.tsx)
  Future<int> resolveEffectiveXP(String userId, String type) async {
    try {
      int total = 0;
      const int pageSize = 1000;
      bool hasMore = true;
      int page = 0;

      if (type == 'user') {
        // Sum coin_transactions (recharge/topup)
        while (hasMore) {
          final res = await _supabase
              .from('coin_transactions')
              .select('coins_amount')
              .eq('user_id', userId)
              .eq('status', 'completed')
              .inFilter('transaction_type', ['recharge', 'self_recharge'])
               .range(page * pageSize, (page + 1) * pageSize - 1);
          
          if (res.isEmpty) { hasMore = false; break; }
          total += res.fold<int>(0, (sum, item) => sum + (item['coins_amount'] as int? ?? 0));
          if (res.length < pageSize) hasMore = false;
          page++;
        }

        // Sum payment_transactions (Google/Stripe)
        hasMore = true;
        page = 0;
        while (hasMore) {
          final res = await _supabase
              .from('payment_transactions')
              .select('diamonds_amount')
              .eq('user_id', userId)
              .eq('status', 'completed')
              .range(page * pageSize, (page + 1) * pageSize - 1);
          
          if (res.isEmpty) { hasMore = false; break; }
          total += res.fold(0, (sum, item) => sum + (item['diamonds_amount'] as int? ?? 0));
          if (res.length < pageSize) hasMore = false;
          page++;
        }
      } else {
        // Sum gift earnings for hosts
        while (hasMore) {
          final res = await _supabase
              .from('gift_transactions')
              .select('receiver_beans')
              .eq('receiver_id', userId)
              .range(page * pageSize, (page + 1) * pageSize - 1);
          
          if (res.isEmpty) { hasMore = false; break; }
          total += res.fold<int>(0, (sum, item) => sum + (item['receiver_beans'] as int? ?? 0));
          if (res.length < pageSize) hasMore = false;
          page++;
        }
      }

      return total;
    } catch (e) {
      debugPrint("resolveEffectiveXP error: $e");
      return 0;
    }
  }



  // --- Helper Application Management (Admin) ---

  Future<List<Map<String, dynamic>>> getHelperApplications() async {
    try {
      final res = await _supabase
          .from('helper_applications')
          .select('*, user:profiles(*)')
          .eq('status', 'pending')
          .order('created_at', ascending: false);
      return List<Map<String, dynamic>>.from(res);
    } catch (e) {
      debugPrint("getHelperApplications error: $e");
      return [];
    }
  }

  Future<Map<String, dynamic>> updateHelperApplicationStatus(String id, String status, String userId) async {
    try {
      // 1. Update application status
      await _supabase.from('helper_applications').update({'status': status}).eq('id', id);

      if (status == 'approved') {
        // 2. Upgrade user to Level 5 Helper in topup_helpers table
        // First check if they exist
        final existing = await _supabase.from('topup_helpers').select().eq('user_id', userId).maybeSingle();
        
        if (existing == null) {
          await _supabase.from('topup_helpers').insert({
            'user_id': userId,
            'trader_level': 5,
            'payroll_enabled': true,
            'is_active': true,
            'is_verified': true,
            'joined_at': DateTime.now().toIso8601String(),
          });
        } else {
          await _supabase.from('topup_helpers').update({
            'trader_level': 5,
            'payroll_enabled': true,
            'is_active': true,
            'is_verified': true,
          }).eq('user_id', userId);
        }

        // 3. Update profile to show as host/helper if needed
        await _supabase.from('profiles').update({'trader_level': 5}).eq('id', userId);
      }

      return {'success': true};
    } catch (e) {
      debugPrint("updateHelperApplicationStatus error: $e");
      return {'success': false, 'error': e.toString()};
    }
  }


  // --- Recharge Helpers (Web Parity Logic) ---

  Future<List<Map<String, dynamic>>> getRechargeHelpers(String countryCode) async { try { final methods = await _supabase.from('helper_country_payment_methods').select('*, helper:topup_helpers(*, user:profiles(display_name, avatar_url, app_uid))').eq('country_code', countryCode).eq('is_active', true); final List<Map<String, dynamic>> rawList = List<Map<String, dynamic>>.from(methods); final List<Map<String, dynamic>> filtered = []; for (var m in rawList) { final helper = m['helper']; if (helper == null) continue; final agencyRes = await _supabase.from('agencies').select('diamond_balance').eq('owner_id', helper['user_id']).eq('is_active', true).maybeSingle(); final int walletBal = helper['wallet_balance'] ?? 0; final int agencyBal = agencyRes?['diamond_balance'] ?? 0; final int combined = walletBal + agencyBal; if (helper['trader_level'] == 5 && helper['payroll_enabled'] == true && helper['is_verified'] == true && combined >= 300000) { filtered.add({ ...m, 'combined_balance': combined }); } } return filtered; } catch (e) { return []; } }

  Future<Map<String, dynamic>?> getTraderStockBalance(String userId) async { try { return await _supabase.from('topup_helpers').select().eq('user_id', userId).maybeSingle(); } catch (e) { return null; } }

  Future<List<Map<String, dynamic>>> getAdminLogs({int limit = 10}) async {
    try {
      final res = await _supabase.from('admin_logs').select('*').order('created_at', ascending: false).limit(limit);
      return List<Map<String, dynamic>>.from(res);
    } catch (e) {
      return [];
    }
  }

  Future<List<Map<String, dynamic>>> getCountryStats() async {
    try {
      final res = await _supabase.from('profiles').select('country_name, country_code, country_flag').not('country_name', 'is', null);
      final List<Map<String, dynamic>> data = List<Map<String, dynamic>>.from(res);
      
      final Map<String, Map<String, dynamic>> grouped = {};
      for (var p in data) {
        final key = p['country_code'] ?? p['country_name'] ?? 'Unknown';
        if (grouped.containsKey(key)) {
          grouped[key]!['count'] = (grouped[key]!['count'] as int) + 1;
        } else {
          grouped[key] = {
            'country_name': p['country_name'],
            'country_code': p['country_code'],
            'country_flag': p['country_flag'],
            'count': 1,
          };
        }
      }
      
      final list = grouped.values.toList();
      list.sort((a, b) => (b['count'] as int).compareTo(a['count'] as int));
      return list;
    } catch (e) {
      return [];
    }
  }
  // --- INVITATION SYSTEM ---

  Future<List<Map<String, dynamic>>> getInvitationTiers() async {
    try {
      final res = await _supabase.from('invitation_reward_tiers').select('*').eq('is_active', true).order('display_order');
      return List<Map<String, dynamic>>.from(res);
    } catch (e) {
      return [];
    }
  }

  Future<List<Map<String, dynamic>>> getInvitationLeaderboard() async {
    try {
      final res = await _supabase.from('user_invitations').select('inviter_id').eq('status', 'verified');
      final Map<String, int> stats = {};
      for (var inv in res) {
        final id = inv['inviter_id'];
        stats[id] = (stats[id] ?? 0) + 1;
      }

      final ids = stats.keys.toList();
      if (ids.isEmpty) return [];

      final profiles = await _supabase.from('profiles').select('id, display_name, avatar_url, app_uid').inFilter('id', ids);
      final List<Map<String, dynamic>> leaderboard = [];
      for (var p in profiles) {
        leaderboard.add({
          'user_id': p['id'],
          'display_name': p['display_name'],
          'avatar_url': p['avatar_url'],
          'app_uid': p['app_uid'],
          'total_invites': stats[p['id']] ?? 0,
        });
      }
      leaderboard.sort((a, b) => (b['total_invites'] as int).compareTo(a['total_invites'] as int));
      return leaderboard;
    } catch (e) {
      return [];
    }
  }

  Future<List<Map<String, dynamic>>> getMyInvitedUsers() async {
    try {
      final uid = currentUserId;
      if (uid == null) return [];
      final res = await _supabase.from('user_invitations').select('invitee_id, created_at, invitee:profiles!user_invitations_invitee_id_fkey(display_name, avatar_url, app_uid)').eq('inviter_id', uid).eq('status', 'verified').order('created_at', ascending: false);
      return List<Map<String, dynamic>>.from(res);
    } catch (e) {
      return [];
    }
  }

  Future<Map<String, dynamic>> claimInvitationReward(String tierId) async {
    try {
      final res = await _supabase.rpc('claim_invitation_reward', params: {'_tier_id': tierId});
      return Map<String, dynamic>.from(res);
    } catch (e) {
      return {'success': false, 'error': e.toString()};
    }
  }

  // --- TASK SYSTEM ---

  Future<List<Map<String, dynamic>>> getDailyTasks() async {
    try {
      final res = await _supabase.from('daily_tasks').select('*').eq('is_active', true).order('display_order');
      return List<Map<String, dynamic>>.from(res);
    } catch (e) {
      return [];
    }
  }

  Future<List<Map<String, dynamic>>> getUserTaskProgress() async {
    try {
      final uid = currentUserId;
      if (uid == null) return [];
      // Use standard task date utility logic (reset at 12:30 AM)
      final now = DateTime.now();
      final resetTime = DateTime(now.year, now.month, now.day, 0, 30);
      final taskDate = now.isBefore(resetTime) ? now.subtract(const Duration(days: 1)) : now;
      final dateStr = "${taskDate.year}-${taskDate.month.toString().padLeft(2, '0')}-${taskDate.day.toString().padLeft(2, '0')}";
      
      final res = await _supabase.from('user_task_progress').select('*').eq('user_id', uid).eq('reset_date', dateStr);
      return List<Map<String, dynamic>>.from(res);
    } catch (e) {
      return [];
    }
  }

  Future<Map<String, dynamic>> claimTaskReward(String taskId) async {
    try {
      final uid = currentUserId;
      if (uid == null) throw "Unauthorized";
      final res = await _supabase.rpc('claim_task_reward', params: {'_user_id': uid, '_task_id': taskId});
      return Map<String, dynamic>.from(res);
    } catch (e) {
      return {'success': false, 'error': e.toString()};
    }
  }

  Future<Map<String, dynamic>> submitRatingClaim(String screenshotUrl) async {
    try {
      final uid = currentUserId;
      if (uid == null) throw "Unauthorized";
      final res = await _supabase.from('rating_reward_claims').insert({'user_id': uid, 'screenshot_url': screenshotUrl}).select().single();
      return {'success': true, 'data': res};
    } catch (e) {
      return {'success': false, 'error': e.toString()};
    }
  }

  Future<Map<String, dynamic>?> getNewHostBonusSettings() async {
    try {
      return await _supabase.from('new_host_live_bonus_settings').select('*').eq('is_active', true).limit(1).maybeSingle();
    } catch (e) {
      return null;
    }
  }

  Future<Map<String, dynamic>?> getNewHostBonusProgress() async {
    try {
      final uid = currentUserId;
      if (uid == null) return null;
      final now = DateTime.now();
      final dateStr = "${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}";
      return await _supabase.from('new_host_live_bonus_progress').select('*').eq('user_id', uid).eq('bonus_date', dateStr).maybeSingle();
    } catch (e) {
      return null;
    }
  }

  // --- PROFILE UPDATE ---
  Future<void> updateProfile(Map<String, dynamic> data) async {
    final uid = currentUserId;
    if (uid == null) return;
    await _supabase.from('profiles').update(data).eq('id', uid);
  }

  Future<void> updatePassword(String newPassword) async {
    await _supabase.auth.updateUser(UserAttributes(password: newPassword));
  }

  Future<void> updateEmail(String newEmail) async {
    await _supabase.auth.updateUser(UserAttributes(email: newEmail));
  }

  Future<List<Map<String, dynamic>>> getDailyTasks() async {
    try {
      final res = await _supabase.from('daily_tasks').select('*').eq('is_active', true).order('display_order');
      return List<Map<String, dynamic>>.from(res);
    } catch (e) {
      return [];
    }
  }

  Future<List<Map<String, dynamic>>> getUserTaskProgress() async {
    try {
      final uid = currentUserId;
      if (uid == null) return [];
      final now = DateTime.now();
      final dateStr = "${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}";
      final res = await _supabase.from('user_task_progress').select('*').eq('user_id', uid).eq('reset_date', dateStr);
      return List<Map<String, dynamic>>.from(res);
    } catch (e) {
      return [];
    }
  }

  Future<Map<String, dynamic>> claimTaskReward(String taskId) async {
    try {
      final uid = currentUserId;
      if (uid == null) return {'success': false, 'error': 'Not logged in'};
      final res = await _supabase.rpc('claim_task_reward', params: {
        '_user_id': uid,
        '_task_id': taskId,
      });
      return Map<String, dynamic>.from(res);
    } catch (e) {
      return {'success': false, 'error': e.toString()};
    }
  }

  Future<List<Map<String, dynamic>>> getInvitationTiers() async {
    try {
      final res = await _supabase.from('invitation_reward_tiers').select('*').eq('is_active', true).order('display_order');
      return List<Map<String, dynamic>>.from(res);
    } catch (e) {
      return [];
    }
  }

  Future<List<Map<String, dynamic>>> getInvitationLeaderboard() async {
    try {
      final res = await _supabase.rpc('get_invitation_leaderboard');
      return List<Map<String, dynamic>>.from(res);
    } catch (e) {
      return [];
    }
  }

  Future<List<Map<String, dynamic>>> getMyInvitedUsers() async {
    try {
      final uid = currentUserId;
      if (uid == null) return [];
      final res = await _supabase.from('user_invitations').select('*, invitee:profiles(*)').eq('inviter_id', uid).eq('status', 'verified').order('created_at', ascending: false);
      return List<Map<String, dynamic>>.from(res);
    } catch (e) {
      return [];
    }
  }

  Future<Map<String, dynamic>> getInvitationSummary() async {
    try {
      final uid = currentUserId;
      if (uid == null) return {'total_invites': 0, 'total_rewards': 0};
      final res = await _supabase.rpc('get_invitation_summary', params: {'_user_id': uid});
      return Map<String, dynamic>.from(res);
    } catch (e) {
      return {'total_invites': 0, 'total_rewards': 0};
    }
  }

  Future<Map<String, dynamic>> claimInvitationReward(String tierId) async {
    try {
      final uid = currentUserId;
      if (uid == null) return {'success': false, 'error': 'Not logged in'};
      final res = await _supabase.rpc('claim_invitation_reward', params: {
        '_tier_id': tierId,
      });
      return Map<String, dynamic>.from(res);
    } catch (e) {
      return {'success': false, 'error': e.toString()};
    }
  }

  Future<String?> getAppSetting(String key) async {
    try {
      final res = await _supabase.from('app_settings').select('setting_value').eq('setting_key', key).maybeSingle();
      if (res != null) {
        final val = res['setting_value'];
        if (val is Map) return val['url'];
        return val.toString();
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  // --- ACCOUNT DELETION ---
  Future<Map<String, dynamic>> requestAccountDeletion() async {
    try {
      final uid = currentUserId;
      if (uid == null) return {'success': false, 'error': 'Not logged in'};
      final res = await _supabase.rpc('request_account_deletion', params: {'user_id_param': uid});
      return {'success': true, 'data': res};
    } catch (e) {
      return {'success': false, 'error': e.toString()};
    }
  }

  Future<Map<String, dynamic>> cancelAccountDeletion() async {
    try {
      final uid = currentUserId;
      if (uid == null) return {'success': false, 'error': 'Not logged in'};
      final res = await _supabase.rpc('cancel_account_deletion', params: {'user_id_param': uid});
      return {'success': true, 'data': res};
    } catch (e) {
      return {'success': false, 'error': e.toString()};
    }
  }

  // --- SUPPORT ---
  Future<List<Map<String, dynamic>>> getSupportTickets() async {
    try {
      final uid = currentUserId;
      if (uid == null) return [];
      final res = await _supabase.from('support_tickets').select('*').eq('user_id', uid).order('created_at', ascending: false);
      return List<Map<String, dynamic>>.from(res);
    } catch (e) {
      return [];
    }
  }

  Future<Map<String, dynamic>> createSupportTicket(String subject, String category) async {
    try {
      final uid = currentUserId;
      if (uid == null) return {'success': false, 'error': 'Not logged in'};
      final res = await _supabase.from('support_tickets').insert({
        'user_id': uid,
        'subject': subject,
        'category': category,
        'status': 'open',
      }).select().single();
      return {'success': true, 'data': res};
    } catch (e) {
      return {'success': false, 'error': e.toString()};
    }
  }

  Future<List<Map<String, dynamic>>> getSupportMessages(String ticketId) async {
    try {
      final res = await _supabase.from('support_messages')
          .select('*')
          .eq('ticket_id', ticketId)
          .order('created_at', ascending: true);
      return List<Map<String, dynamic>>.from(res);
    } catch (e) {
      return [];
    }
  }

  Future<Map<String, dynamic>> sendSupportMessage({
    required String ticketId,
    required String content,
    String? attachmentUrl,
    String? attachmentType,
    String? voiceTranscript,
    String? translatedContent,
  }) async {
    try {
      final uid = currentUserId;
      if (uid == null) return {'success': false, 'error': 'Not logged in'};
      
      final Map<String, dynamic> data = {
        'ticket_id': ticketId,
        'sender_id': uid,
        'sender_type': 'user',
        'content': content,
        'attachment_url': attachmentUrl,
        'attachment_type': attachmentType,
        'voice_transcript': voiceTranscript,
        'translated_content': translatedContent,
        'is_read': false,
      };
      
      final res = await _supabase.from('support_messages').insert(data).select().single();
      
      // Update ticket status to open
      await _supabase.from('support_tickets').update({'status': 'open', 'updated_at': DateTime.now().toIso8601String()}).eq('id', ticketId);
      
      return {'success': true, 'data': res};
    } catch (e) {
      return {'success': false, 'error': e.toString()};
    }
  }
  /// Support & Account Management methods ... (existing)

  // --- Profile & Host Specific Methods ---

  Future<bool> updateOfflineMessage(String message) async {
    try {
      final res = await _supabase.from('profiles').update({
        'offline_message': message,
        'updated_at': DateTime.now().toIso8601String(),
      }).eq('id', currentUserId!);
      return true;
    } catch (e) {
      debugPrint("Error updating offline message: $e");
      return false;
    }
  }

  Future<bool> setProfileVisibility(bool hideLocation) async {
    try {
      await _supabase.from('profiles').update({
        'hide_location': hideLocation,
        'updated_at': DateTime.now().toIso8601String(),
      }).eq('id', currentUserId!);
      return true;
    } catch (e) {
      debugPrint("Error setting profile visibility: $e");
      return false;
    }
  }
  Future<Map<String, dynamic>> getCombinedTraderWallet() async {
    try {
      final uid = currentUserId;
      if (uid == null) return {'helper': 0.0, 'agency': 0};

      final results = await Future.wait([
        _supabase.from('topup_helpers').select('wallet_balance').eq('user_id', uid).eq('is_active', true).maybeSingle(),
        _supabase.from('agencies').select('diamond_balance').eq('owner_id', uid).eq('is_active', true).maybeSingle(),
      ]);

      final helperData = results[0] as Map<String, dynamic>?;
      final agencyData = results[1] as Map<String, dynamic>?;

      return {
        'helper': (helperData?['wallet_balance'] ?? 0.0).toDouble(),
        'agency': (agencyData?['diamond_balance'] ?? 0) as int,
      };
    } catch (e) {
      debugPrint("Error fetching combined wallet: $e");
      return {'helper': 0.0, 'agency': 0};
    }
  }

  Future<Map<String, dynamic>> checkAdminStatus() async {
    try {
      final uid = currentUserId;
      if (uid == null) return {'isAdmin': false};
      
      final res = await _supabase.from('admin_users').select('id').eq('user_id', uid).maybeSingle();
      return {'isAdmin': res != null};
    } catch (e) {
      return {'isAdmin': false};
    }
  }
}

