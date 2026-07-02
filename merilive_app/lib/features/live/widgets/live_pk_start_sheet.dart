import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../data/pk_start_bridge.dart';

/// Host-side PK Battle start sheet — Flutter parity with the web
/// `src/components/live/PKBattlePanel.tsx`.
///
/// Features (100% web parity):
///   • Fetches live female hosts (excludes self), ordered by viewer_count.
///   • Search box (name filter).
///   • Duration presets: 3 min / 5 min / 10 min (clamped 120–900s).
///   • Random Match — broadcasts via `pk-invite-deliver` (kind=random_invite).
///   • Direct invite — creates row via `start_pk_battle` RPC then FCM push.
///   • Never mutates `pk_battles` from client.
class LivePkStartSheet extends StatefulWidget {
  const LivePkStartSheet({
    super.key,
    required this.currentStreamId,
    required this.currentUserId,
    required this.currentUserName,
    required this.currentUserAvatar,
    required this.currentUserLevel,
    this.isRandomSearching = false,
    required this.onStartRandomMatch,
  });

  final String currentStreamId;
  final String currentUserId;
  final String currentUserName;
  final String currentUserAvatar;
  final int currentUserLevel;
  final bool isRandomSearching;

  /// Called with the picked duration when the host taps Random Match.
  /// Parent owns the search timeout + cancel flow (mirrors web R6a).
  final Future<void> Function(int durationSeconds) onStartRandomMatch;

  static Future<void> show(
    BuildContext context, {
    required String currentStreamId,
    required String currentUserId,
    required String currentUserName,
    required String currentUserAvatar,
    required int currentUserLevel,
    required bool isRandomSearching,
    required Future<void> Function(int durationSeconds) onStartRandomMatch,
  }) {
    return showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => LivePkStartSheet(
        currentStreamId: currentStreamId,
        currentUserId: currentUserId,
        currentUserName: currentUserName,
        currentUserAvatar: currentUserAvatar,
        currentUserLevel: currentUserLevel,
        isRandomSearching: isRandomSearching,
        onStartRandomMatch: onStartRandomMatch,
      ),
    );
  }

  @override
  State<LivePkStartSheet> createState() => _LivePkStartSheetState();
}

const _durations = [
  (180, '3 min'),
  (300, '5 min'),
  (600, '10 min'),
];

class _LivePkStartSheetState extends State<LivePkStartSheet> {
  final _searchCtrl = TextEditingController();
  List<PkLiveHost> _hosts = const [];
  bool _loading = true;
  String? _error;
  int _duration = 300;
  String? _sendingInviteFor;
  bool _sendingRandom = false;

  @override
  void initState() {
    super.initState();
    _fetch();
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _fetch() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final list = await PkStartBridge.instance
          .fetchLiveHosts(selfUserId: widget.currentUserId);
      if (!mounted) return;
      setState(() {
        _hosts = list;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = 'Failed to load live hosts';
        _loading = false;
      });
    }
  }

  Future<void> _sendInvite(PkLiveHost host) async {
    HapticFeedback.selectionClick();
    setState(() => _sendingInviteFor = host.id);
    final res = await PkStartBridge.instance.sendDirectInvite(
      opponent: host,
      challengerStreamId: widget.currentStreamId,
      challengerUserId: widget.currentUserId,
      challengerName: widget.currentUserName,
      challengerAvatar: widget.currentUserAvatar,
      challengerLevel: widget.currentUserLevel,
      durationSeconds: _duration,
    );
    if (!mounted) return;
    setState(() => _sendingInviteFor = null);
    if (res.ok) {
      _toast('PK request sent to ${host.displayName}');
      Navigator.of(context).maybePop();
    } else {
      _toast(res.error ?? 'Failed to send PK request', isError: true);
    }
  }

  Future<void> _handleRandom() async {
    if (widget.isRandomSearching || _sendingRandom) return;
    HapticFeedback.mediumImpact();
    setState(() => _sendingRandom = true);
    try {
      await widget.onStartRandomMatch(_duration);
      if (mounted) Navigator.of(context).maybePop();
    } finally {
      if (mounted) setState(() => _sendingRandom = false);
    }
  }

  void _toast(String msg, {bool isError = false}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(msg),
        backgroundColor:
            isError ? const Color(0xFFDC2626) : const Color(0xFF16A34A),
        duration: const Duration(seconds: 2),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final q = _searchCtrl.text.trim().toLowerCase();
    final filtered = q.isEmpty
        ? _hosts
        : _hosts
            .where((h) => h.displayName.toLowerCase().contains(q))
            .toList(growable: false);
    final maxHeight = MediaQuery.of(context).size.height * 0.78;

    return SafeArea(
      top: false,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: maxHeight),
        child: Container(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Color(0xF2140F23), Color(0xF00C0818)],
            ),
            borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
            border: Border(
              top: BorderSide(color: Color(0x33FFFFFF), width: 1),
            ),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 8),
              Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: Colors.white24,
                  borderRadius: BorderRadius.circular(4),
                ),
              ),
              const SizedBox(height: 10),
              _buildHeader(),
              const SizedBox(height: 10),
              _buildSearch(),
              const SizedBox(height: 10),
              _buildDurationRow(),
              const SizedBox(height: 8),
              Flexible(child: _buildList(filtered)),
              _buildRandomBar(),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Row(
        children: [
          const Icon(Icons.flash_on_rounded, color: Color(0xFFFBBF24), size: 22),
          const SizedBox(width: 8),
          const Expanded(
            child: Text(
              'PK Battle',
              style: TextStyle(
                color: Colors.white,
                fontSize: 18,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.4,
              ),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.close_rounded,
                color: Colors.white70, size: 20),
            onPressed: () => Navigator.of(context).maybePop(),
          ),
        ],
      ),
    );
  }

  Widget _buildSearch() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: TextField(
        controller: _searchCtrl,
        onChanged: (_) => setState(() {}),
        style: const TextStyle(color: Colors.white, fontSize: 13),
        decoration: InputDecoration(
          isDense: true,
          prefixIcon: const Icon(Icons.search_rounded,
              color: Colors.white54, size: 18),
          hintText: 'Search hosts...',
          hintStyle: const TextStyle(color: Colors.white38, fontSize: 13),
          filled: true,
          fillColor: Colors.white.withOpacity(0.06),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(999),
            borderSide: BorderSide(color: Colors.white.withOpacity(0.1)),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(999),
            borderSide: BorderSide(color: Colors.white.withOpacity(0.1)),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(999),
            borderSide: const BorderSide(color: Color(0xFFEC4899), width: 1.2),
          ),
        ),
      ),
    );
  }

  Widget _buildDurationRow() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Text('Duration',
              style: TextStyle(
                  color: Colors.white54,
                  fontSize: 11,
                  fontWeight: FontWeight.w600)),
          const SizedBox(width: 10),
          Container(
            padding: const EdgeInsets.all(4),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.06),
              borderRadius: BorderRadius.circular(999),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: _durations.map((d) {
                final active = _duration == d.$1;
                return GestureDetector(
                  onTap: () {
                    HapticFeedback.selectionClick();
                    setState(() => _duration = d.$1);
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 14, vertical: 6),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(999),
                      gradient: active
                          ? const LinearGradient(colors: [
                              Color(0xFFFBBF24),
                              Color(0xFFF59E0B),
                            ])
                          : null,
                    ),
                    child: Text(
                      d.$2,
                      style: TextStyle(
                        color: active ? Colors.black : Colors.white70,
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                );
              }).toList(),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildList(List<PkLiveHost> filtered) {
    if (_loading) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 40),
        child: Center(child: CircularProgressIndicator(color: Colors.white70)),
      );
    }
    if (_error != null) {
      return Padding(
        padding: const EdgeInsets.all(24),
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(_error!,
                  style:
                      const TextStyle(color: Colors.white70, fontSize: 12)),
              const SizedBox(height: 10),
              TextButton(
                onPressed: _fetch,
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
      );
    }
    if (filtered.isEmpty) {
      return Padding(
        padding: const EdgeInsets.all(24),
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 56,
                height: 56,
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.06),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: Colors.white.withOpacity(0.08)),
                ),
                child: const Icon(Icons.people_alt_rounded,
                    color: Colors.white30, size: 28),
              ),
              const SizedBox(height: 10),
              const Text('No live hosts found',
                  style:
                      TextStyle(color: Colors.white70, fontSize: 12.5)),
              const SizedBox(height: 4),
              const Text('Try Random Match below',
                  style: TextStyle(color: Colors.white38, fontSize: 11)),
            ],
          ),
        ),
      );
    }
    return ListView.separated(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      itemCount: filtered.length,
      separatorBuilder: (_, __) => const SizedBox(height: 8),
      itemBuilder: (context, i) {
        final h = filtered[i];
        final sending = _sendingInviteFor == h.id;
        return _HostTile(
          host: h,
          sending: sending,
          disabled: _sendingInviteFor != null && !sending,
          onInvite: () => _sendInvite(h),
        );
      },
    );
  }

  Widget _buildRandomBar() {
    final searching = widget.isRandomSearching || _sendingRandom;
    return Padding(
      padding: EdgeInsets.fromLTRB(
        16,
        8,
        16,
        MediaQuery.of(context).viewInsets.bottom + 12,
      ),
      child: SizedBox(
        width: double.infinity,
        height: 48,
        child: DecoratedBox(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(999),
            gradient: const LinearGradient(
              colors: [Color(0xFFEC4899), Color(0xFFA855F7)],
            ),
            boxShadow: [
              BoxShadow(
                color: const Color(0xFFEC4899).withOpacity(0.35),
                blurRadius: 18,
                offset: const Offset(0, 6),
              ),
            ],
          ),
          child: Material(
            color: Colors.transparent,
            child: InkWell(
              borderRadius: BorderRadius.circular(999),
              onTap: searching ? null : _handleRandom,
              child: Center(
                child: searching
                    ? const Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              valueColor:
                                  AlwaysStoppedAnimation(Colors.white),
                            ),
                          ),
                          SizedBox(width: 10),
                          Text(
                            'Searching…',
                            style: TextStyle(
                                color: Colors.white,
                                fontSize: 14,
                                fontWeight: FontWeight.w800),
                          ),
                        ],
                      )
                    : const Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.shuffle_rounded,
                              color: Colors.white, size: 18),
                          SizedBox(width: 8),
                          Text(
                            'Random Match',
                            style: TextStyle(
                                color: Colors.white,
                                fontSize: 14,
                                fontWeight: FontWeight.w800,
                                letterSpacing: 0.3),
                          ),
                        ],
                      ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _HostTile extends StatelessWidget {
  const _HostTile({
    required this.host,
    required this.sending,
    required this.disabled,
    required this.onInvite,
  });

  final PkLiveHost host;
  final bool sending;
  final bool disabled;
  final VoidCallback onInvite;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.04),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Colors.white.withOpacity(0.06)),
      ),
      child: Row(
        children: [
          Container(
            width: 46,
            height: 46,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(color: const Color(0xFFEC4899), width: 1.6),
              boxShadow: [
                BoxShadow(
                  color: const Color(0xFFEC4899).withOpacity(0.35),
                  blurRadius: 10,
                ),
              ],
            ),
            child: ClipOval(
              child: host.avatarUrl.isNotEmpty
                  ? Image.network(
                      host.avatarUrl,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => _fallback(host.displayName),
                    )
                  : _fallback(host.displayName),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        host.displayName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 13.5,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    const SizedBox(width: 6),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 5, vertical: 1.5),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(6),
                        gradient: const LinearGradient(
                          colors: [Color(0xFFFBBF24), Color(0xFFF59E0B)],
                        ),
                      ),
                      child: Text(
                        'Lv${host.userLevel}',
                        style: const TextStyle(
                          color: Colors.black,
                          fontSize: 9,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 2),
                Row(
                  children: [
                    const Icon(Icons.remove_red_eye,
                        size: 11, color: Colors.white54),
                    const SizedBox(width: 3),
                    Text(
                      '${host.viewerCount} viewers',
                      style: const TextStyle(
                          color: Colors.white54, fontSize: 10.5),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          SizedBox(
            height: 34,
            child: FilledButton(
              onPressed: disabled ? null : onInvite,
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFFEC4899),
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(horizontal: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(999),
                ),
                textStyle: const TextStyle(
                    fontSize: 12, fontWeight: FontWeight.w800),
              ),
              child: sending
                  ? const SizedBox(
                      width: 14,
                      height: 14,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        valueColor:
                            AlwaysStoppedAnimation(Colors.white),
                      ),
                    )
                  : const Text('Invite'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _fallback(String name) => Container(
        color: const Color(0xFF3B2A5A),
        alignment: Alignment.center,
        child: Text(
          name.isNotEmpty ? name.characters.first.toUpperCase() : 'H',
          style: const TextStyle(
              color: Colors.white, fontWeight: FontWeight.w700),
        ),
      );
}
