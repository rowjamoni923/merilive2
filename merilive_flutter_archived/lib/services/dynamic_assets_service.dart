import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'api_service.dart';

class FrameData {
  final String id;
  final String name;
  final String frameUrl;
  final String? frameType;
  final int minLevel;

  FrameData({
    required this.id,
    required this.name,
    required this.frameUrl,
    this.frameType,
    required this.minLevel,
  });

  factory FrameData.fromMap(Map<String, dynamic> map) {
    final rawUrl = map['frame_url'] ?? '';
    final resolvedUrl = ApiService().resolveAssetUrl(rawUrl, bucket: 'avatar_frames');
    
    return FrameData(
      id: map['id'],
      name: map['name'] ?? '',
      frameUrl: resolvedUrl,
      frameType: _detectType(resolvedUrl, map['frame_type']),
      minLevel: map['min_level'] ?? 0,
    );
  }

  static String _detectType(String url, String? explicitType) {
    final lower = url.toLowerCase();
    if (lower.endsWith('.svga')) return 'svga';
    if (lower.endsWith('.json')) return 'lottie';
    if (lower.endsWith('.gif')) return 'gif';
    if (lower.endsWith('.webp')) return 'webp';
    return explicitType ?? 'static';
  }
}

class DynamicAssetsService extends ChangeNotifier {
  static final DynamicAssetsService _instance = DynamicAssetsService._internal();
  factory DynamicAssetsService() => _instance;
  DynamicAssetsService._internal();

  final _supabase = Supabase.instance.client;

  // Caches
  final Map<String, FrameData?> _frameCache = {};
  final Map<int, FrameData?> _levelFrameCache = {};
  final Map<String, Map<String, dynamic>?> _animationCache = {};

  /// Fetches a frame by its specific ID
  Future<FrameData?> getFrameById(String frameId) async {
    if (_frameCache.containsKey(frameId)) return _frameCache[frameId];

    try {
      final response = await _supabase
          .from('avatar_frames')
          .select('*')
          .eq('id', frameId)
          .eq('is_active', true)
          .maybeSingle();

      if (response != null) {
        final frame = FrameData.fromMap(response);
        _frameCache[frameId] = frame;
        return frame;
      }
      _frameCache[frameId] = null;
    } catch (e) {
      debugPrint('Error fetching frame \$frameId: \$e');
    }
    return null;
  }

  /// Fetches the best frame for a given level if no specific frame is assigned
  Future<FrameData?> getFrameByLevel(int level, bool isHost) async {
    final cacheKey = level * (isHost ? -1 : 1); // simple unique key for host/user levels
    if (_levelFrameCache.containsKey(cacheKey)) return _levelFrameCache[cacheKey];

    try {
      final response = await _supabase
          .from('avatar_frames')
          .select('*')
          .eq('is_active', true)
          .lte('min_level', level)
          .order('min_level', ascending: false)
          .limit(1)
          .maybeSingle();

      if (response != null) {
        final frame = FrameData.fromMap(response);
        _levelFrameCache[cacheKey] = frame;
        return frame;
      }
      _levelFrameCache[cacheKey] = null;
    } catch (e) {
      debugPrint('Error fetching frame for level \$level: \$e');
    }
    return null;
  }

  /// Fetches entry animations for a specific user based on their equipped items or level
  Future<Map<String, dynamic>?> getUserEntryAssets({
    String? entranceId,
    String? nameBarId,
    int? level,
  }) async {
    final cacheKey = '\$entranceId-\$nameBarId-\$level';
    if (_animationCache.containsKey(cacheKey)) return _animationCache[cacheKey];

    try {
      Map<String, dynamic> assets = {};

      if (entranceId != null) {
        final resp = await _supabase.from('entry_banners').select('animation_url, sound_url').eq('id', entranceId).maybeSingle();
        if (resp != null) {
          assets['entrance_url'] = ApiService().resolveAssetUrl(resp['animation_url'], bucket: 'animations');
          assets['entrance_sound'] = ApiService().resolveAssetUrl(resp['sound_url'], bucket: 'sounds');
        }
      }

      if (nameBarId != null) {
        final resp = await _supabase.from('entry_name_bars').select('animation_url').eq('id', nameBarId).maybeSingle();
        if (resp != null) {
          assets['name_bar_url'] = ApiService().resolveAssetUrl(resp['animation_url'], bucket: 'animations');
        }
      }

      // Fallback to level-based assets if equipped ones are missing
      if (level != null && level >= 1) {
        if (assets['name_bar_url'] == null) {
          final resp = await _supabase.from('entry_name_bars')
              .select('animation_url')
              .lte('min_level', level)
              .order('min_level', ascending: false)
              .limit(1)
              .maybeSingle();
          if (resp != null) assets['name_bar_url'] = ApiService().resolveAssetUrl(resp['animation_url'], bucket: 'animations');
        }
        
        if (assets['entrance_url'] == null) {
          final resp = await _supabase.from('entry_banners')
              .select('animation_url')
              .lte('min_level', level)
              .order('min_level', ascending: false)
              .limit(1)
              .maybeSingle();
          if (resp != null) assets['entrance_url'] = ApiService().resolveAssetUrl(resp['animation_url'], bucket: 'animations');
        }
      }

      _animationCache[cacheKey] = assets;
      return assets;
    } catch (e) {
      debugPrint('Error fetching entry assets: \$e');
    }
    return null;
  }
}


