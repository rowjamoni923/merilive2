import 'package:flutter/material.dart';

import '../data/live_viewers_bridge.dart';

/// A4 — Viewer list bottom sheet.
///
/// Mirrors the web `ViewerListPanel` layout: rank badge, avatar, name +
/// level badge, join-time subline, VIP crown. Snapshot on open, manual
/// refresh — matches the "no Realtime on stream_viewers" web policy.
class LiveViewersSheet extends StatefulWidget {
  const LiveViewersSheet({
    super.key,
    required this.streamId,
    required this.viewerCount,
  });

  final String streamId;
  final int viewerCount;

  @override
  State<LiveViewersSheet> createState() => _LiveViewersSheetState();
}

class _LiveViewersSheetState extends State<LiveViewersSheet> {
  bool _loading = true;
  String? _error;
  List<LiveViewer> _viewers = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final list = await LiveViewersBridge.instance.fetch(widget.streamId);
      if (!mounted) return;
      setState(() {
        _viewers = list;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = 'Could not load viewers';
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    final maxHeight = media.size.height * 0.72;
    final vipCount = _viewers.where((v) => v.isVip).length;

    return SafeArea(
      top: false,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: maxHeight),
        child: Container(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Color(0xFF1A1035), Color(0xFF0F0820)],
            ),
            borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
            border: Border(
              top: BorderSide(color: Color(0x33A855F7), width: 1),
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
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 10, 8, 6),
                child: Row(
                  children: [
                    const Icon(Icons.people_alt_rounded,
                        size: 16, color: Color(0xFFC084FC)),
                    const SizedBox(width: 6),
                    const Text('Viewers',
                        style: TextStyle(
                            color: Colors.white,
                            fontSize: 14,
                            fontWeight: FontWeight.w700)),
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: const Color(0x33A855F7),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        '${widget.viewerCount}',
                        style: const TextStyle(
                          color: Color(0xFFD8B4FE),
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    const Spacer(),
                    IconButton(
                      tooltip: 'Refresh',
                      icon: const Icon(Icons.refresh_rounded,
                          size: 18, color: Colors.white70),
                      onPressed: _loading ? null : _load,
                    ),
                    IconButton(
                      tooltip: 'Close',
                      icon: const Icon(Icons.close_rounded,
                          size: 18, color: Colors.white70),
                      onPressed: () => Navigator.of(context).maybePop(),
                    ),
                  ],
                ),
              ),
              Container(
                width: double.infinity,
                color: Colors.black.withOpacity(0.25),
                padding: const EdgeInsets.symmetric(
                    horizontal: 16, vertical: 8),
                child: Row(
                  children: [
                    const Icon(Icons.visibility_rounded,
                        size: 13, color: Color(0xFF4ADE80)),
                    const SizedBox(width: 4),
                    Text('Live: ${_viewers.length}',
                        style: const TextStyle(
                            color: Colors.white70, fontSize: 11)),
                    const SizedBox(width: 16),
                    const Icon(Icons.workspace_premium_rounded,
                        size: 13, color: Color(0xFFFBBF24)),
                    const SizedBox(width: 4),
                    Text('VIP: $vipCount',
                        style: const TextStyle(
                            color: Colors.white70, fontSize: 11)),
                  ],
                ),
              ),
              Flexible(child: _body()),
            ],
          ),
        ),
      ),
    );
  }

  Widget _body() {
    if (_loading) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 40),
        child: Center(
            child: CircularProgressIndicator(color: Colors.white70)),
      );
    }
    if (_error != null) {
      return Padding(
        padding: const EdgeInsets.all(24),
        child: Center(
          child: Text(_error!,
              style: const TextStyle(color: Colors.white70, fontSize: 12)),
        ),
      );
    }
    if (_viewers.isEmpty) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 40),
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.people_outline_rounded,
                  color: Colors.white24, size: 44),
              SizedBox(height: 6),
              Text('No viewers yet',
                  style: TextStyle(color: Colors.white54, fontSize: 12)),
            ],
          ),
        ),
      );
    }
    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      itemCount: _viewers.length,
      itemBuilder: (context, i) => _ViewerTile(viewer: _viewers[i], rank: i),
    );
  }
}

class _ViewerTile extends StatelessWidget {
  const _ViewerTile({required this.viewer, required this.rank});

  final LiveViewer viewer;
  final int rank;

  @override
  Widget build(BuildContext context) {
    final levelColors = _levelColors(viewer.userLevel);
    final rankLabel = rank < 3
        ? ['🥇', '🥈', '🥉'][rank]
        : '${rank + 1}';

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3, horizontal: 4),
      child: Row(
        children: [
          SizedBox(
            width: 22,
            child: Text(
              rankLabel,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: rank < 3 ? 14 : 10,
                color: rank < 3 ? Colors.white : Colors.white60,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          const SizedBox(width: 6),
          CircleAvatar(
            radius: 16,
            backgroundColor: Colors.white24,
            backgroundImage: (viewer.avatarUrl != null &&
                    viewer.avatarUrl!.isNotEmpty)
                ? NetworkImage(viewer.avatarUrl!)
                : null,
            child: (viewer.avatarUrl == null || viewer.avatarUrl!.isEmpty)
                ? const Icon(Icons.person,
                    size: 16, color: Colors.white70)
                : null,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        viewer.displayName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    const SizedBox(width: 6),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 5, vertical: 1),
                      decoration: BoxDecoration(
                        gradient: LinearGradient(colors: levelColors),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        'Lv${viewer.userLevel}',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 8,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  _formatJoin(viewer.joinedAt),
                  style: const TextStyle(
                      color: Colors.white54, fontSize: 10),
                ),
              ],
            ),
          ),
          if (viewer.isVip)
            const Padding(
              padding: EdgeInsets.only(left: 6),
              child: Icon(Icons.workspace_premium_rounded,
                  size: 14, color: Color(0xFFFBBF24)),
            ),
        ],
      ),
    );
  }

  List<Color> _levelColors(int lvl) {
    if (lvl >= 50) {
      return const [Color(0xFFFBBF24), Color(0xFFD97706)];
    }
    if (lvl >= 30) {
      return const [Color(0xFFC084FC), Color(0xFF9333EA)];
    }
    if (lvl >= 10) {
      return const [Color(0xFF60A5FA), Color(0xFF2563EB)];
    }
    return const [Color(0xFF9CA3AF), Color(0xFF4B5563)];
  }

  String _formatJoin(DateTime joined) {
    final diff = DateTime.now().difference(joined);
    if (diff.inMinutes < 1) return 'Just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    return '${diff.inDays}d ago';
  }
}
