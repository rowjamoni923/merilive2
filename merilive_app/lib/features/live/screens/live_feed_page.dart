import 'dart:async';

import 'package:auto_route/auto_route.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/router/app_router.gr.dart';

/// LiveFeedPage — TikTok-style vertical swipe between active live streams.
///
/// Web-truth reference: `src/pages/LiveStreamFeed.tsx`. Full parity:
///   • Fetch top 50 active streams (ordered by viewer_count desc).
///   • Enrich hosts from `profiles_public`.
///   • Vertical PageView with snap swipe + prev/next arrows.
///   • Realtime subscription on `live_streams` — instant-close on host end
///     or `is_active=false`, refetch on inserts.
///   • Tap thumbnail or "Enter Live" CTA → `/live/:streamId` (viewer page).
///   • Deep-link via `/live-feed/:streamId` opens on the matching index.
///
/// Route: `/live-feed` (browse) and `/live-feed/:streamId` (deep link).
@RoutePage(name: 'LiveFeedRoute')
class LiveFeedPage extends StatefulWidget {
  const LiveFeedPage({super.key, @PathParam('streamId') this.streamId});

  final String? streamId;

  @override
  State<LiveFeedPage> createState() => _LiveFeedPageState();
}

class _LiveFeedPageState extends State<LiveFeedPage> {
  final _client = Supabase.instance.client;
  final PageController _pageController = PageController();

  List<_FeedStream> _streams = const [];
  bool _loading = true;
  int _currentIndex = 0;
  RealtimeChannel? _channel;
  Timer? _debounce;

  @override
  void initState() {
    super.initState();
    _load();
    _subscribe();
  }

  @override
  void dispose() {
    _pageController.dispose();
    _debounce?.cancel();
    if (_channel != null) {
      _client.removeChannel(_channel!);
    }
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final rows = await _client
          .from('live_streams')
          .select('id, title, host_id, viewer_count, thumbnail_url')
          .eq('is_active', true)
          .order('viewer_count', ascending: false)
          .limit(50);

      final list = (rows as List).cast<Map<String, dynamic>>();
      final hostIds = list
          .map((r) => r['host_id'] as String?)
          .where((v) => v != null && v.isNotEmpty)
          .cast<String>()
          .toSet()
          .toList();

      final Map<String, Map<String, dynamic>> hostMap = {};
      if (hostIds.isNotEmpty) {
        final hosts = await _client
            .from('profiles_public')
            .select('id, display_name, avatar_url, user_level')
            .inFilter('id', hostIds);
        for (final h in (hosts as List).cast<Map<String, dynamic>>()) {
          hostMap[h['id'] as String] = h;
        }
      }

      final streams = list.map((r) {
        final host = hostMap[r['host_id']] ?? const <String, dynamic>{};
        return _FeedStream(
          id: r['id'] as String,
          title: (r['title'] as String?) ?? '',
          hostId: (r['host_id'] as String?) ?? '',
          viewerCount: (r['viewer_count'] as int?) ?? 0,
          thumbnailUrl: r['thumbnail_url'] as String?,
          hostName: host['display_name'] as String?,
          hostAvatar: host['avatar_url'] as String?,
          hostLevel: (host['user_level'] as int?) ?? 1,
        );
      }).toList(growable: false);

      if (!mounted) return;
      int idx = 0;
      final want = widget.streamId;
      if (want != null && want.isNotEmpty) {
        final i = streams.indexWhere((s) => s.id == want);
        if (i >= 0) idx = i;
      }
      setState(() {
        _streams = streams;
        _currentIndex = idx;
        _loading = false;
      });
      if (idx > 0 && _pageController.hasClients) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (_pageController.hasClients) {
            _pageController.jumpToPage(idx);
          }
        });
      }
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _streams = const [];
        _loading = false;
      });
    }
  }

  void _subscribe() {
    _channel = _client
        .channel('live-feed-${DateTime.now().microsecondsSinceEpoch}')
        .onPostgresChanges(
          event: PostgresChangeEvent.update,
          schema: 'public',
          table: 'live_streams',
          callback: (payload) {
            final row = payload.newRecord;
            final id = row['id'] as String?;
            final active = row['is_active'] as bool?;
            final status = row['status'] as String?;
            final endedAt = row['ended_at'];
            if (id == null) return;
            if (active == false || status == 'ended' || endedAt != null) {
              _dropStream(id);
            } else {
              _scheduleReload();
            }
          },
        )
        .onPostgresChanges(
          event: PostgresChangeEvent.insert,
          schema: 'public',
          table: 'live_streams',
          callback: (_) => _scheduleReload(),
        )
        .subscribe();
  }

  void _scheduleReload() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 600), () {
      if (mounted) _load();
    });
  }

  void _dropStream(String id) {
    if (!mounted) return;
    final idx = _streams.indexWhere((s) => s.id == id);
    if (idx < 0) return;
    final next = List<_FeedStream>.from(_streams)..removeAt(idx);
    var newIndex = _currentIndex;
    if (idx < _currentIndex) {
      newIndex = _currentIndex - 1;
    } else if (idx == _currentIndex && newIndex >= next.length) {
      newIndex = next.length - 1;
    }
    if (newIndex < 0) newIndex = 0;
    setState(() {
      _streams = next;
      _currentIndex = newIndex;
    });
    if (next.isNotEmpty && _pageController.hasClients) {
      _pageController.jumpToPage(newIndex);
    }
  }

  void _goPrev() {
    if (_currentIndex <= 0) return;
    HapticFeedback.selectionClick();
    _pageController.animateToPage(
      _currentIndex - 1,
      duration: const Duration(milliseconds: 320),
      curve: Curves.easeOutCubic,
    );
  }

  void _goNext() {
    if (_currentIndex >= _streams.length - 1) return;
    HapticFeedback.selectionClick();
    _pageController.animateToPage(
      _currentIndex + 1,
      duration: const Duration(milliseconds: 320),
      curve: Curves.easeOutCubic,
    );
  }

  void _enter(_FeedStream s) {
    HapticFeedback.mediumImpact();
    context.router.push(LiveStreamRoute(streamId: s.id));
  }

  @override
  Widget build(BuildContext context) {
    const bg = Color(0xFF050208);
    if (_loading) {
      return const Scaffold(
        backgroundColor: bg,
        body: Center(
          child: SizedBox(
            width: 32,
            height: 32,
            child: CircularProgressIndicator(
              strokeWidth: 2.4,
              valueColor: AlwaysStoppedAnimation(Colors.white70),
            ),
          ),
        ),
      );
    }

    if (_streams.isEmpty) {
      return Scaffold(
        backgroundColor: bg,
        body: SafeArea(
          child: Stack(
            children: [
              Positioned(
                top: 8,
                left: 8,
                child: _CircleIconButton(
                  icon: Icons.arrow_back,
                  onTap: () => Navigator.of(context).maybePop(),
                ),
              ),
              Center(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 24),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        width: 64,
                        height: 64,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: Colors.white.withOpacity(0.08),
                          border: Border.all(color: Colors.white.withOpacity(0.15)),
                        ),
                        child: const Icon(Icons.wifi_tethering, color: Colors.white70, size: 30),
                      ),
                      const SizedBox(height: 16),
                      const Text(
                        'No Live Streams',
                        style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w700),
                      ),
                      const SizedBox(height: 6),
                      const Text(
                        'Live hosts will appear here as soon as they start streaming.',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: Colors.white70, fontSize: 13, height: 1.4),
                      ),
                      const SizedBox(height: 20),
                      FilledButton(
                        onPressed: () => Navigator.of(context).maybePop(),
                        child: const Text('Back Home'),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      );
    }

    return Scaffold(
      backgroundColor: bg,
      body: Stack(
        children: [
          PageView.builder(
            controller: _pageController,
            scrollDirection: Axis.vertical,
            itemCount: _streams.length,
            onPageChanged: (i) {
              setState(() => _currentIndex = i);
              HapticFeedback.selectionClick();
            },
            itemBuilder: (context, i) {
              final s = _streams[i];
              return _FeedTile(
                stream: s,
                onEnter: () => _enter(s),
              );
            },
          ),
          // Prev / Next side rail
          Positioned(
            right: 12,
            top: 0,
            bottom: 0,
            child: Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  _CircleIconButton(
                    icon: Icons.keyboard_arrow_up,
                    disabled: _currentIndex <= 0,
                    onTap: _goPrev,
                  ),
                  const SizedBox(height: 12),
                  _CircleIconButton(
                    icon: Icons.keyboard_arrow_down,
                    disabled: _currentIndex >= _streams.length - 1,
                    onTap: _goNext,
                  ),
                ],
              ),
            ),
          ),
          // Top back
          Positioned(
            top: MediaQuery.of(context).padding.top + 8,
            left: 12,
            child: _CircleIconButton(
              icon: Icons.arrow_back,
              onTap: () => Navigator.of(context).maybePop(),
            ),
          ),
          // Position indicator
          Positioned(
            top: MediaQuery.of(context).padding.top + 12,
            right: 16,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                color: Colors.black.withOpacity(0.45),
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: Colors.white.withOpacity(0.18)),
              ),
              child: Text(
                '${_currentIndex + 1} / ${_streams.length}',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _FeedStream {
  const _FeedStream({
    required this.id,
    required this.title,
    required this.hostId,
    required this.viewerCount,
    required this.thumbnailUrl,
    required this.hostName,
    required this.hostAvatar,
    required this.hostLevel,
  });

  final String id;
  final String title;
  final String hostId;
  final int viewerCount;
  final String? thumbnailUrl;
  final String? hostName;
  final String? hostAvatar;
  final int hostLevel;

  String get displayName {
    final n = hostName?.trim();
    if (n != null && n.isNotEmpty) return n;
    return 'Live Host';
  }
}

class _FeedTile extends StatelessWidget {
  const _FeedTile({required this.stream, required this.onEnter});

  final _FeedStream stream;
  final VoidCallback onEnter;

  @override
  Widget build(BuildContext context) {
    final img = _pickImage(stream);
    return GestureDetector(
      onTap: onEnter,
      child: Stack(
        fit: StackFit.expand,
        children: [
          if (img != null)
            CachedNetworkImage(
              imageUrl: img,
              fit: BoxFit.cover,
              fadeInDuration: const Duration(milliseconds: 180),
              placeholder: (_, __) => Container(color: const Color(0xFF0A0510)),
              errorWidget: (_, __, ___) => Container(color: const Color(0xFF0A0510)),
            )
          else
            Container(color: const Color(0xFF0A0510)),
          // Dark scrim for legibility
          const DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  Color(0x66000000),
                  Color(0x22000000),
                  Color(0xCC000000),
                ],
                stops: [0.0, 0.5, 1.0],
              ),
            ),
          ),
          // LIVE + viewers badge (top-left, under back button)
          Positioned(
            top: MediaQuery.of(context).padding.top + 60,
            left: 16,
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: const Color(0xFFE94560),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: const Text(
                    'LIVE',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.6,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: Colors.black.withOpacity(0.45),
                    borderRadius: BorderRadius.circular(6),
                    border: Border.all(color: Colors.white.withOpacity(0.15)),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.remove_red_eye, size: 12, color: Colors.white),
                      const SizedBox(width: 4),
                      Text(
                        _fmtCount(stream.viewerCount),
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          // Bottom info card
          Positioned(
            left: 16,
            right: 80,
            bottom: MediaQuery.of(context).padding.bottom + 24,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    _HostAvatar(url: stream.hostAvatar, name: stream.displayName),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            stream.displayName,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 15,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            'Lv ${stream.hostLevel}',
                            style: const TextStyle(
                              color: Colors.white70,
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                if (stream.title.isNotEmpty)
                  Text(
                    stream.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      height: 1.3,
                    ),
                  ),
                const SizedBox(height: 14),
                _EnterLiveButton(onTap: onEnter),
              ],
            ),
          ),
        ],
      ),
    );
  }

  String? _pickImage(_FeedStream s) {
    final t = s.thumbnailUrl?.trim();
    if (t != null && t.isNotEmpty) return t;
    final a = s.hostAvatar?.trim();
    if (a != null && a.isNotEmpty) return a;
    return null;
  }

  String _fmtCount(int n) {
    if (n >= 1000000) return '${(n / 1000000).toStringAsFixed(1)}M';
    if (n >= 1000) return '${(n / 1000).toStringAsFixed(1)}K';
    return '$n';
  }
}

class _HostAvatar extends StatelessWidget {
  const _HostAvatar({required this.url, required this.name});
  final String? url;
  final String name;

  @override
  Widget build(BuildContext context) {
    final initial = name.isNotEmpty ? name.characters.first.toUpperCase() : 'L';
    return Container(
      width: 40,
      height: 40,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(color: Colors.white.withOpacity(0.85), width: 1.4),
      ),
      child: ClipOval(
        child: (url != null && url!.isNotEmpty)
            ? CachedNetworkImage(
                imageUrl: url!,
                fit: BoxFit.cover,
                errorWidget: (_, __, ___) => _fallback(initial),
              )
            : _fallback(initial),
      ),
    );
  }

  Widget _fallback(String initial) => Container(
        color: const Color(0xFF3B2A5A),
        alignment: Alignment.center,
        child: Text(
          initial,
          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700),
        ),
      );
}

class _EnterLiveButton extends StatelessWidget {
  const _EnterLiveButton({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(999),
          gradient: const LinearGradient(
            colors: [Color(0xFFE94560), Color(0xFF9B2CFF)],
          ),
          boxShadow: [
            BoxShadow(
              color: const Color(0xFFE94560).withOpacity(0.35),
              blurRadius: 18,
              offset: const Offset(0, 6),
            ),
          ],
        ),
        child: const Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.play_arrow_rounded, color: Colors.white, size: 20),
            SizedBox(width: 6),
            Text(
              'Enter Live',
              style: TextStyle(
                color: Colors.white,
                fontSize: 14,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.2,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CircleIconButton extends StatelessWidget {
  const _CircleIconButton({
    required this.icon,
    required this.onTap,
    this.disabled = false,
  });

  final IconData icon;
  final VoidCallback onTap;
  final bool disabled;

  @override
  Widget build(BuildContext context) {
    return Opacity(
      opacity: disabled ? 0.4 : 1,
      child: GestureDetector(
        onTap: disabled ? null : onTap,
        child: Container(
          width: 44,
          height: 44,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: Colors.black.withOpacity(0.45),
            border: Border.all(color: Colors.white.withOpacity(0.18)),
          ),
          child: Icon(icon, color: Colors.white, size: 24),
        ),
      ),
    );
  }
}
