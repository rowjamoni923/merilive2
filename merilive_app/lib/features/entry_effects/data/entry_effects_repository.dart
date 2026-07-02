import 'package:supabase_flutter/supabase_flutter.dart';

/// A11 — Fetches a user's equipped entry effects (entrance, name-bar,
/// vehicle) from the same tables the web version reads. Parity ref:
/// `src/utils/fetchEntryAnimation.ts` + `src/hooks/useRoomEntryEffects.ts`.
///
/// Lookup order per slot mirrors the web util:
///   entrance   → entry_banners → shop_items → level_privileges
///                (fallback: level_privileges 'entrance*' + entry_banners
///                 by min_level; noble subscription wins if active)
///   name-bar   → entry_name_bars → entry_banners → level_privileges
///                (fallback: entry_name_bars/level_privileges by min_level)
///   vehicle    → shop_items → level_privileges (vehicle_entrance)
///                (fallback: level_privileges by unlock_level)
class EntryEffectsResult {
  const EntryEffectsResult({
    this.entranceUrl,
    this.entranceSoundUrl,
    this.nameBarUrl,
    this.vehicleUrl,
    this.nobleRankCode,
  });

  final String? entranceUrl;
  final String? entranceSoundUrl;
  final String? nameBarUrl;
  final String? vehicleUrl;
  final String? nobleRankCode;

  bool get hasEntrance => _valid(entranceUrl);
  bool get hasNameBar => _valid(nameBarUrl);
  bool get hasVehicle => _valid(vehicleUrl);

  static bool _valid(String? url) {
    if (url == null) return false;
    final t = url.trim();
    return t.isNotEmpty && (t.startsWith('http') || t.startsWith('/'));
  }
}

class _CacheEntry<T> {
  _CacheEntry(this.value) : timestamp = DateTime.now();
  final T value;
  final DateTime timestamp;
  bool get expired =>
      DateTime.now().difference(timestamp) > const Duration(minutes: 5);
}

class EntryEffectsRepository {
  EntryEffectsRepository._();
  static final EntryEffectsRepository instance = EntryEffectsRepository._();

  final _client = Supabase.instance.client;
  final Map<String, _CacheEntry<EntryEffectsResult>> _userCache = {};
  static const int _maxCache = 200;

  /// Resolve equipped + level-based entry effects for a user.
  Future<EntryEffectsResult> resolve(String userId) async {
    final cached = _userCache[userId];
    if (cached != null && !cached.expired) return cached.value;

    try {
      final profile = await _client
          .from('profiles')
          .select(
              'equipped_entrance_id, equipped_entry_name_bar_id, equipped_vehicle_id, user_level')
          .eq('id', userId)
          .maybeSingle();

      if (profile == null) return const EntryEffectsResult();

      final equippedEntrance = profile['equipped_entrance_id']?.toString();
      final equippedNameBar = profile['equipped_entry_name_bar_id']?.toString();
      final equippedVehicle = profile['equipped_vehicle_id']?.toString();
      final level = (profile['user_level'] as num?)?.toInt() ?? 1;

      final results = await Future.wait([
        _resolveEntrance(equippedEntrance, level, userId),
        _resolveNameBar(equippedNameBar, level),
        _resolveVehicle(equippedVehicle, level),
        _resolveNoble(userId),
      ]);

      final entranceMap = results[0] as Map<String, String?>;
      final nameBarUrl = results[1] as String?;
      final vehicleUrl = results[2] as String?;
      final noble = results[3] as Map<String, String?>;

      // Noble wins over level-based fallback for entrance URL.
      final finalEntrance =
          entranceMap['url'] ?? noble['url']; // equipped > level > noble
      // But if user has active noble AND nothing equipped, noble wins.
      final usingNoble =
          equippedEntrance == null && noble['url'] != null;
      final resolvedEntrance = usingNoble ? noble['url'] : finalEntrance;

      final result = EntryEffectsResult(
        entranceUrl: resolvedEntrance,
        entranceSoundUrl: entranceMap['sound'],
        nameBarUrl: nameBarUrl,
        vehicleUrl: vehicleUrl,
        // Only expose the noble rank code when the noble entrance is
        // actually being rendered — otherwise priority ladder would
        // wrongly promote a non-noble entrance to priority 400.
        nobleRankCode: usingNoble ? noble['rankCode'] : null,
      );


      _put(userId, result);
      return result;
    } catch (_) {
      return const EntryEffectsResult();
    }
  }

  void _put(String key, EntryEffectsResult value) {
    if (_userCache.length >= _maxCache) {
      _userCache.remove(_userCache.keys.first);
    }
    _userCache[key] = _CacheEntry(value);
  }

  Future<Map<String, String?>> _resolveEntrance(
      String? id, int level, String userId) async {
    if (id != null && id.isNotEmpty) {
      try {
        final r = await Future.wait([
          _client
              .from('entry_banners')
              .select('animation_url, sound_url')
              .eq('id', id)
              .maybeSingle(),
          _client
              .from('shop_items')
              .select('animation_url, animation_file_url, sound_url')
              .eq('id', id)
              .maybeSingle(),
          _client
              .from('level_privileges')
              .select('animation_url, sound_url')
              .eq('id', id)
              .maybeSingle(),
        ]);
        final b = r[0] as Map<String, dynamic>?;
        final s = r[1] as Map<String, dynamic>?;
        final l = r[2] as Map<String, dynamic>?;
        final url = (b?['animation_url']) ??
            (s?['animation_url'] ?? s?['animation_file_url']) ??
            l?['animation_url'];
        final sound = b?['sound_url'] ?? s?['sound_url'] ?? l?['sound_url'];
        if (url != null) {
          return {'url': url.toString(), 'sound': sound?.toString()};
        }
      } catch (_) {}
    }
    // Level-based fallback
    try {
      final r = await Future.wait([
        _client
            .from('level_privileges')
            .select('animation_url, unlock_level, sound_url')
            .eq('is_active', true)
            .inFilter('privilege_type', ['entrance', 'entrance_effect'])
            .lte('unlock_level', level)
            .order('unlock_level', ascending: false)
            .limit(1)
            .maybeSingle(),
        _client
            .from('entry_banners')
            .select('animation_url, min_level, sound_url')
            .eq('is_active', true)
            .lte('min_level', level)
            .order('min_level', ascending: false)
            .limit(1)
            .maybeSingle(),
      ]);
      final p = r[0] as Map<String, dynamic>?;
      final b = r[1] as Map<String, dynamic>?;
      final pLvl = (p?['unlock_level'] as num?)?.toInt() ?? 0;
      final bLvl = (b?['min_level'] as num?)?.toInt() ?? 0;
      if (pLvl >= bLvl && p?['animation_url'] != null) {
        return {'url': p!['animation_url'].toString(), 'sound': p['sound_url']?.toString()};
      }
      if (b?['animation_url'] != null) {
        return {'url': b!['animation_url'].toString(), 'sound': b['sound_url']?.toString()};
      }
    } catch (_) {}
    return {'url': null, 'sound': null};
  }

  Future<String?> _resolveNameBar(String? id, int level) async {
    if (id != null && id.isNotEmpty) {
      try {
        final r = await Future.wait([
          _client
              .from('entry_name_bars')
              .select('animation_url, image_url, preview_url')
              .eq('id', id)
              .maybeSingle(),
          _client
              .from('entry_banners')
              .select('animation_url')
              .eq('id', id)
              .maybeSingle(),
          _client
              .from('level_privileges')
              .select('animation_url')
              .eq('id', id)
              .maybeSingle(),
        ]);
        final n = r[0] as Map<String, dynamic>?;
        final b = r[1] as Map<String, dynamic>?;
        final l = r[2] as Map<String, dynamic>?;
        final url = (n?['animation_url'] ?? n?['image_url'] ?? n?['preview_url']) ??
            b?['animation_url'] ??
            l?['animation_url'];
        if (url != null) return url.toString();
      } catch (_) {}
    }
    // Level-based fallback
    try {
      final r = await Future.wait([
        _client
            .from('entry_name_bars')
            .select('animation_url, image_url, preview_url, min_level')
            .eq('is_active', true)
            .lte('min_level', level)
            .order('min_level', ascending: false)
            .limit(1)
            .maybeSingle(),
        _client
            .from('level_privileges')
            .select('animation_url, unlock_level')
            .eq('is_active', true)
            .eq('privilege_type', 'entry_bar')
            .lte('unlock_level', level)
            .order('unlock_level', ascending: false)
            .limit(1)
            .maybeSingle(),
      ]);
      final n = r[0] as Map<String, dynamic>?;
      final l = r[1] as Map<String, dynamic>?;
      final nLvl = (n?['min_level'] as num?)?.toInt() ?? 0;
      final lLvl = (l?['unlock_level'] as num?)?.toInt() ?? 0;
      if (lLvl >= nLvl && l?['animation_url'] != null) {
        return l!['animation_url'].toString();
      }
      final nb = n?['animation_url'] ?? n?['image_url'] ?? n?['preview_url'];
      if (nb != null) return nb.toString();
    } catch (_) {}
    return null;
  }

  Future<String?> _resolveVehicle(String? id, int level) async {
    if (id != null && id.isNotEmpty) {
      try {
        final r = await Future.wait([
          _client
              .from('shop_items')
              .select('animation_url, animation_file_url')
              .eq('id', id)
              .maybeSingle(),
          _client
              .from('level_privileges')
              .select('animation_url')
              .eq('id', id)
              .maybeSingle(),
        ]);
        final s = r[0] as Map<String, dynamic>?;
        final l = r[1] as Map<String, dynamic>?;
        final url = (s?['animation_file_url'] ?? s?['animation_url']) ??
            l?['animation_url'];
        if (url != null) return url.toString();
      } catch (_) {}
    }
    // Level-based fallback (vehicle_entrance)
    try {
      final r = await _client
          .from('level_privileges')
          .select('animation_url, unlock_level')
          .eq('is_active', true)
          .eq('privilege_type', 'vehicle_entrance')
          .lte('unlock_level', level)
          .order('unlock_level', ascending: false)
          .limit(1)
          .maybeSingle();
      if (r?['animation_url'] != null) return r!['animation_url'].toString();
    } catch (_) {}
    return null;
  }

  Future<Map<String, String?>> _resolveNoble(String userId) async {
    try {
      final r = await _client
          .from('user_noble_subscriptions')
          .select('noble_cards:noble_card_id(entrance_animation_url, rank_code)')
          .eq('user_id', userId)
          .eq('is_active', true)
          .gt('expires_at', DateTime.now().toIso8601String())
          .order('expires_at', ascending: false)
          .limit(1)
          .maybeSingle();
      final card = (r?['noble_cards'] as Map?)?.cast<String, dynamic>();
      return {
        'url': card?['entrance_animation_url']?.toString(),
        'rankCode': card?['rank_code']?.toString(),
      };
    } catch (_) {
      return {'url': null, 'rankCode': null};
    }
  }
}
