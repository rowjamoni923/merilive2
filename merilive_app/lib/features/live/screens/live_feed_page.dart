import 'dart:async';

import 'package:auto_route/auto_route.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:share_plus/share_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/router/app_router.gr.dart';

/// LiveFeedPage — TikTok-style vertical swipe between active live streams.
///
/// Web-truth reference: `src/pages/LiveStreamFeed.tsx` + `src/pages/Live.tsx`.
/// Phase D-16/17/18 parity:
///   • Category chip row (All / Popular / New / Nearby).
///   • Country filter chip (flags derived from currently loaded streams).
///   • Per-tile share (native OS share sheet via `share_plus`) → deep link.
///   • Global speaker mute toggle (persisted; hook for feed audio autoplay).
///   • Instant-close realtime already present; polished ended-state overlay.
@RoutePage(name: 'LiveFeedRoute')
class LiveFeedPage extends StatefulWidget {
  const LiveFeedPage({super.key, @PathParam('streamId') this.streamId});

  final String? streamId;

  @override
  State<LiveFeedPage> createState() => _LiveFeedPageState();
}

enum _FeedCategory { all, popular, latest, nearby }

class _LiveFeedPageState extends State<LiveFeedPage> {
  final _client = Supabase.instance.client;
  final PageController _pageController = PageController();
  static const _mutePrefKey = 'live_feed_audio_muted_v1';

  List<_FeedStream> _all = const [];
  List<_FeedStream> _visible = const [];
  bool _loading = true;
  int _currentIndex = 0;
  RealtimeChannel? _channel;
  Timer? _debounce;
  Timer? _endedFlashTimer;

  _FeedCategory _category = _FeedCategory.all;
  String? _countryFilter; // country_code
  String? _myCountryCode;
  bool _muted = true;
  String? _lastEndedId;

  @override
  void initState() {
    super.initState();
    _loadPrefs();
    _loadMe();
    _load();
    _subscribe();
  }

  @override
  void dispose() {
    _pageController.dispose();
    _debounce?.cancel();
    _endedFlashTimer?.cancel();
    if (_channel != null) {
      _client.removeChannel(_channel!);
    }
    super.dispose();
  }

  Future<void> _loadPrefs() async {
    try {
      final p = await SharedPreferences.getInstance();
      final m = p.getBool(_mutePrefKey);
      if (m != null && mounted) setState(() => _muted = m);
    } catch (_) {}
  }

  Future<void> _loadMe() async {
    try {
      final uid = _client.auth.currentUser?.id;
      if (uid == null) return;
      final row = await _client
          .from('profiles_public')
          .select('country_code')
          .eq('id', uid)
          .maybeSingle();
      if (!mounted) return;
      final code = (row is Map ? row['country_code'] as String? : null);
      if (code != null && code.isNotEmpty) {
        setState(() => _myCountryCode = code);
        _applyFilter();
      }
    } catch (_) {}
  }

  Future<void> _load() async {
    try {
      final rows = await _client
          .from('live_streams')
          .select(
              'id, title, host_id, viewer_count, thumbnail_url, created_at, live_privacy')
          .eq('is_active', true)
          // H4 — hide fully-private streams from public feed. Password-
          // protected streams stay visible with a padlock at the card level.
          .neq('live_privacy', 'private')
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
            .select('id, display_name, avatar_url, user_level, country_code, country_flag')
            .inFilter('id', hostIds);
        for (final h in (hosts as List).cast<Map<String, dynamic>>()) {
          hostMap[h['id'] as String] = h;
        }
      }

      final streams = list.map((r) {
        final host = hostMap[r['host_id']] ?? const <String, dynamic>{};
        DateTime? created;
        final c = r['created_at'];
        if (c is String) created = DateTime.tryParse(c);
        return _FeedStream(
          id: r['id'] as String,
          title: (r['title'] as String?) ?? '',
          hostId: (r['host_id'] as String?) ?? '',
          viewerCount: (r['viewer_count'] as int?) ?? 0,
          thumbnailUrl: r['thumbnail_url'] as String?,
          hostName: host['display_name'] as String?,
          hostAvatar: host['avatar_url'] as String?,
          hostLevel: (host['user_level'] as int?) ?? 1,
          countryCode: host['country_code'] as String?,
          countryFlag: host['country_flag'] as String?,
          createdAt: created,
        );
      }).toList(growable: false);

      if (!mounted) return;
      setState(() {
        _all = streams;
        _loading = false;
      });
      _applyFilter(preferStreamId: widget.streamId);
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _all = const [];
        _visible = const [];
        _loading = false;
      });
    }
  }

  void _applyFilter({String? preferStreamId}) {
    var list = List<_FeedStream>.from(_all);

    // Category
    switch (_category) {
      case _FeedCategory.all:
        list.sort((a, b) => b.viewerCount.compareTo(a.viewerCount));
        break;
      case _FeedCategory.popular:
        list = list.where((s) => s.viewerCount > 0).toList();
        list.sort((a, b) => b.viewerCount.compareTo(a.viewerCount));
        break;
      case _FeedCategory.latest:
        list.sort((a, b) {
          final da = a.createdAt ?? DateTime.fromMillisecondsSinceEpoch(0);
          final db = b.createdAt ?? DateTime.fromMillisecondsSinceEpoch(0);
          return db.compareTo(da);
        });
        break;
      case _FeedCategory.nearby:
        final my = _myCountryCode;
        if (my != null && my.isNotEmpty) {
          list = list.where((s) => (s.countryCode ?? '') == my).toList();
        }
        list.sort((a, b) => b.viewerCount.compareTo(a.viewerCount));
        break;
    }

    if (_countryFilter != null && _countryFilter!.isNotEmpty) {
      list = list.where((s) => (s.countryCode ?? '') == _countryFilter).toList();
    }

    int idx = 0;
    final want = preferStreamId;
    if (want != null && want.isNotEmpty) {
      final i = list.indexWhere((s) => s.id == want);
      if (i >= 0) idx = i;
    }
    setState(() {
      _visible = list;
      _currentIndex = list.isEmpty ? 0 : idx.clamp(0, list.length - 1);
    });
    if (list.isNotEmpty && _pageController.hasClients) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_pageController.hasClients && _pageController.page?.round() != _currentIndex) {
          _pageController.jumpToPage(_currentIndex);
        }
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
    // Remove from source
    _all = _all.where((s) => s.id != id).toList(growable: false);
    final idx = _visible.indexWhere((s) => s.id == id);
    if (idx < 0) return;

    final wasCurrent = idx == _currentIndex;
    final next = List<_FeedStream>.from(_visible)..removeAt(idx);
    var newIndex = _currentIndex;
    if (idx < _currentIndex) {
      newIndex = _currentIndex - 1;
    } else if (idx == _currentIndex && newIndex >= next.length) {
      newIndex = next.length - 1;
    }
    if (newIndex < 0) newIndex = 0;

    setState(() {
      _visible = next;
      _currentIndex = newIndex;
      if (wasCurrent) _lastEndedId = id;
    });

    if (wasCurrent) {
      _endedFlashTimer?.cancel();
      _endedFlashTimer = Timer(const Duration(milliseconds: 1600), () {
        if (mounted) setState(() => _lastEndedId = null);
      });
    }

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
    if (_currentIndex >= _visible.length - 1) return;
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

  Future<void> _toggleMute() async {
    HapticFeedback.selectionClick();
    setState(() => _muted = !_muted);
    try {
      final p = await SharedPreferences.getInstance();
      await p.setBool(_mutePrefKey, _muted);
    } catch (_) {}
  }

  Future<void> _share(_FeedStream s) async {
    HapticFeedback.selectionClick();
    final title = s.title.isEmpty ? '${s.displayName} is live' : s.title;
    final url = 'https://merilive.top/live-feed/${s.id}';
    try {
      await Share.share('$title\n$url', subject: title);
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not open share sheet')),
      );
    }
  }

  void _setCategory(_FeedCategory c) {
    if (_category == c) return;
    HapticFeedback.selectionClick();
    setState(() => _category = c);
    _applyFilter();
  }

  Future<void> _openCountryPicker() async {
    // Build country list from currently loaded streams
    final seen = <String, String>{}; // code -> flag
    for (final s in _all) {
      final code = s.countryCode;
      if (code == null || code.isEmpty) continue;
      seen.putIfAbsent(code, () => s.countryFlag ?? '🌍');
    }
    final entries = seen.entries.toList()..sort((a, b) => a.key.compareTo(b.key));

    HapticFeedback.selectionClick();
    final picked = await showModalBottomSheet<String?>(
      context: context,
      backgroundColor: const Color(0xFF10071A),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Container(
                  width: 40,
                  height: 4,
                  margin: const EdgeInsets.only(bottom: 12),
                  decoration: BoxDecoration(
                    color: Colors.white24,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
                const Text(
                  'Filter by country',
                  style: TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    _sheetChip(ctx, label: 'All countries', value: null),
                    for (final e in entries)
                      _sheetChip(ctx, label: '${e.value}  ${e.key}', value: e.key),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
    if (picked != _countryFilter) {
      setState(() => _countryFilter = picked);
      _applyFilter();
    }
  }

  Widget _sheetChip(BuildContext ctx, {required String label, required String? value}) {
    final selected = _countryFilter == value;
    return GestureDetector(
      onTap: () => Navigator.of(ctx).pop(value),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: selected ? const Color(0xFFE94560) : Colors.white.withOpacity(0.08),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: Colors.white.withOpacity(selected ? 0 : 0.15)),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: Colors.white,
            fontSize: 12.5,
            fontWeight: selected ? FontWeight.w700 : FontWeight.w600,
          ),
        ),
      ),
    );
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

    return Scaffold(
      backgroundColor: bg,
      body: Stack(
        children: [
          if (_visible.isEmpty)
            _EmptyState(
              onBack: () => Navigator.of(context).maybePop(),
              hasFilter: _category != _FeedCategory.all || _countryFilter != null,
              onClear: () {
                setState(() {
                  _category = _FeedCategory.all;
                  _countryFilter = null;
                });
                _applyFilter();
              },
            )
          else
            PageView.builder(
              controller: _pageController,
              scrollDirection: Axis.vertical,
              itemCount: _visible.length,
              onPageChanged: (i) {
                setState(() => _currentIndex = i);
                HapticFeedback.selectionClick();
              },
              itemBuilder: (context, i) {
                final s = _visible[i];
                return _FeedTile(stream: s, onEnter: () => _enter(s));
              },
            ),

          // Right side rail: prev, next, mute, share
          if (_visible.isNotEmpty)
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
                    const SizedBox(height: 10),
                    _CircleIconButton(
                      icon: Icons.keyboard_arrow_down,
                      disabled: _currentIndex >= _visible.length - 1,
                      onTap: _goNext,
                    ),
                    const SizedBox(height: 18),
                    _CircleIconButton(
                      icon: _muted ? Icons.volume_off : Icons.volume_up,
                      onTap: _toggleMute,
                    ),
                    const SizedBox(height: 10),
                    _CircleIconButton(
                      icon: Icons.ios_share,
                      onTap: () => _share(_visible[_currentIndex]),
                    ),
                  ],
                ),
              ),
            ),

          // Top back button
          Positioned(
            top: MediaQuery.of(context).padding.top + 8,
            left: 12,
            child: _CircleIconButton(
              icon: Icons.arrow_back,
              onTap: () => Navigator.of(context).maybePop(),
            ),
          ),

          // Position indicator
          if (_visible.isNotEmpty)
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
                  '${_currentIndex + 1} / ${_visible.length}',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),

          // Category + country filter row (under back button)
          Positioned(
            top: MediaQuery.of(context).padding.top + 60,
            left: 0,
            right: 0,
            child: _FilterRow(
              category: _category,
              onCategory: _setCategory,
              countryFilter: _countryFilter,
              countryFlag: _all
                  .firstWhere(
                    (s) => s.countryCode == _countryFilter,
                    orElse: () => const _FeedStream.empty(),
                  )
                  .countryFlag,
              onCountry: _openCountryPicker,
              hasNearby: _myCountryCode != null && _myCountryCode!.isNotEmpty,
            ),
          ),

          // Ended-state flash overlay
          if (_lastEndedId != null)
            const Positioned.fill(
              child: IgnorePointer(
                child: _EndedFlash(),
              ),
            ),
        ],
      ),
    );
  }
}

class _FilterRow extends StatelessWidget {
  const _FilterRow({
    required this.category,
    required this.onCategory,
    required this.countryFilter,
    required this.countryFlag,
    required this.onCountry,
    required this.hasNearby,
  });

  final _FeedCategory category;
  final ValueChanged<_FeedCategory> onCategory;
  final String? countryFilter;
  final String? countryFlag;
  final VoidCallback onCountry;
  final bool hasNearby;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: 66),
      child: Row(
        children: [
          _chip('All', _FeedCategory.all),
          const SizedBox(width: 6),
          _chip('Popular', _FeedCategory.popular),
          const SizedBox(width: 6),
          _chip('New', _FeedCategory.latest),
          if (hasNearby) ...[
            const SizedBox(width: 6),
            _chip('Nearby', _FeedCategory.nearby),
          ],
          const SizedBox(width: 10),
          _countryChip(),
        ],
      ),
    );
  }

  Widget _chip(String label, _FeedCategory c) {
    final selected = category == c;
    return GestureDetector(
      onTap: () => onCategory(c),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        decoration: BoxDecoration(
          color: selected ? const Color(0xFFE94560) : Colors.black.withOpacity(0.42),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: Colors.white.withOpacity(selected ? 0 : 0.18)),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: Colors.white,
            fontSize: 12,
            fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
            letterSpacing: 0.2,
          ),
        ),
      ),
    );
  }

  Widget _countryChip() {
    final active = countryFilter != null;
    return GestureDetector(
      onTap: onCountry,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        decoration: BoxDecoration(
          color: active ? const Color(0xFF9B2CFF) : Colors.black.withOpacity(0.42),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: Colors.white.withOpacity(active ? 0 : 0.18)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              active ? (countryFlag ?? '🌍') : '🌍',
              style: const TextStyle(fontSize: 13),
            ),
            const SizedBox(width: 6),
            Text(
              active ? (countryFilter ?? 'Country') : 'Country',
              style: TextStyle(
                color: Colors.white,
                fontSize: 12,
                fontWeight: active ? FontWeight.w800 : FontWeight.w600,
              ),
            ),
            const SizedBox(width: 4),
            const Icon(Icons.keyboard_arrow_down, size: 14, color: Colors.white70),
          ],
        ),
      ),
    );
  }
}

class _EndedFlash extends StatelessWidget {
  const _EndedFlash();

  @override
  Widget build(BuildContext context) {
    return Container(
      color: Colors.black.withOpacity(0.55),
      alignment: Alignment.center,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.08),
              borderRadius: BorderRadius.circular(999),
              border: Border.all(color: Colors.white.withOpacity(0.18)),
            ),
            child: const Text(
              'This live has ended',
              style: TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w700),
            ),
          ),
        ],
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.onBack, required this.hasFilter, required this.onClear});
  final VoidCallback onBack;
  final bool hasFilter;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Center(
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
              Text(
                hasFilter ? 'No streams match' : 'No Live Streams',
                style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 6),
              Text(
                hasFilter
                    ? 'Try a different category or clear your country filter.'
                    : 'Live hosts will appear here as soon as they start streaming.',
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.white70, fontSize: 13, height: 1.4),
              ),
              const SizedBox(height: 20),
              if (hasFilter)
                FilledButton(onPressed: onClear, child: const Text('Clear filters'))
              else
                FilledButton(onPressed: onBack, child: const Text('Back Home')),
            ],
          ),
        ),
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
    required this.countryCode,
    required this.countryFlag,
    required this.createdAt,
  });

  const _FeedStream.empty()
      : id = '',
        title = '',
        hostId = '',
        viewerCount = 0,
        thumbnailUrl = null,
        hostName = null,
        hostAvatar = null,
        hostLevel = 1,
        countryCode = null,
        countryFlag = null,
        createdAt = null;

  final String id;
  final String title;
  final String hostId;
  final int viewerCount;
  final String? thumbnailUrl;
  final String? hostName;
  final String? hostAvatar;
  final int hostLevel;
  final String? countryCode;
  final String? countryFlag;
  final DateTime? createdAt;

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
          // LIVE + viewers badge (top-left, well below chip row)
          Positioned(
            top: MediaQuery.of(context).padding.top + 108,
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
                if ((stream.countryFlag ?? '').isNotEmpty) ...[
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
                    decoration: BoxDecoration(
                      color: Colors.black.withOpacity(0.45),
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(color: Colors.white.withOpacity(0.15)),
                    ),
                    child: Text(stream.countryFlag!, style: const TextStyle(fontSize: 13)),
                  ),
                ],
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
          child: Icon(icon, color: Colors.white, size: 22),
        ),
      ),
    );
  }
}
