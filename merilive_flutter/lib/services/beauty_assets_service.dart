import 'package:supabase_flutter/supabase_flutter.dart';

/// Fetches dynamic beauty filters and AR stickers from Supabase.
/// Mirrors slugs used in [BeautyEffectService] (none, natural, bright, rosy, fresh).
/// Calls the `get_active_beauty_assets` RPC which returns:
///   { filters: [...], stickers: [...] }
class BeautyAssetsService {
  static final BeautyAssetsService _instance = BeautyAssetsService._internal();
  factory BeautyAssetsService() => _instance;
  BeautyAssetsService._internal();

  List<Map<String, dynamic>> filters = [];
  List<Map<String, dynamic>> stickers = [];
  DateTime? _lastFetched;
  static const _cacheTtl = Duration(minutes: 5);

  Future<void> loadAssets({bool force = false}) async {
    if (!force && _lastFetched != null &&
        DateTime.now().difference(_lastFetched!) < _cacheTtl) {
      return;
    }

    try {
      final response = await Supabase.instance.client
          .rpc('get_active_beauty_assets');

      if (response is Map) {
        filters = List<Map<String, dynamic>>.from(response['filters'] ?? []);
        stickers = List<Map<String, dynamic>>.from(response['stickers'] ?? []);
        _lastFetched = DateTime.now();
      }
    } catch (e) {
      // Fall back silently — BeautyEffectService has built-in defaults
    }
  }

  /// Look up a filter's color matrix by slug. Returns null if not found.
  List<double>? matrixForSlug(String slug) {
    final f = filters.firstWhere(
      (e) => e['slug'] == slug,
      orElse: () => {},
    );
    final raw = f['matrix'];
    if (raw is List) {
      return raw.map((v) => (v as num).toDouble()).toList();
    }
    return null;
  }
}
