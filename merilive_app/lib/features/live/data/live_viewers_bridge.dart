import 'dart:async';

import 'package:supabase_flutter/supabase_flutter.dart';

/// A4 — Viewer list snapshot loader.
///
/// Web-truth reference: `src/components/live/ViewerListPanel.tsx`.
/// Behaviour parity notes:
///   • REST snapshot on open (no `stream_viewers` Realtime subscription —
///     LiveKit is the in-room realtime path).
///   • Left-join `profiles` with the same columns the web panel reads.
///   • Filters `left_at IS NULL`, orders by `joined_at DESC`.
class LiveViewer {
  const LiveViewer({
    required this.id,
    required this.displayName,
    required this.avatarUrl,
    required this.userLevel,
    required this.diamonds,
    required this.joinedAt,
    required this.isVip,
  });

  final String id;
  final String displayName;
  final String? avatarUrl;
  final int userLevel;
  final int diamonds;
  final DateTime joinedAt;
  final bool isVip;
}

class LiveViewersBridge {
  LiveViewersBridge._();
  static final LiveViewersBridge instance = LiveViewersBridge._();

  final _client = Supabase.instance.client;

  Future<List<LiveViewer>> fetch(String streamId) async {
    final rows = await _client
        .from('stream_viewers')
        .select(
            'viewer_id, joined_at, left_at, profiles!stream_viewers_viewer_id_fkey(id, display_name, avatar_url, user_level, host_level, max_user_level, diamonds)')
        .eq('stream_id', streamId)
        .filter('left_at', 'is', null)
        .order('joined_at', ascending: false);

    return (rows as List).map<LiveViewer>((raw) {
      final sv = raw as Map<String, dynamic>;
      final p = (sv['profiles'] as Map?)?.cast<String, dynamic>();
      final diamonds = (p?['diamonds'] as num?)?.toInt() ?? 0;
      final level = _displayLevel(p);
      DateTime joined;
      try {
        joined = DateTime.parse(sv['joined_at'].toString()).toLocal();
      } catch (_) {
        joined = DateTime.now();
      }
      return LiveViewer(
        id: (p?['id'] ?? sv['viewer_id']).toString(),
        displayName: (p?['display_name'] ?? 'Anonymous').toString(),
        avatarUrl: p?['avatar_url']?.toString(),
        userLevel: level,
        diamonds: diamonds,
        joinedAt: joined,
        isVip: diamonds >= 10000,
      );
    }).toList();
  }

  /// Mirror of `getRequiredDisplayLevel` — prefer the highest of user/host
  /// tiers so power users show their real badge in the viewer list.
  int _displayLevel(Map<String, dynamic>? p) {
    if (p == null) return 1;
    final u = (p['user_level'] as num?)?.toInt() ?? 1;
    final h = (p['host_level'] as num?)?.toInt() ?? 0;
    final m = (p['max_user_level'] as num?)?.toInt() ?? 0;
    final best = [u, h, m].reduce((a, b) => a > b ? a : b);
    return best < 1 ? 1 : best;
  }
}
