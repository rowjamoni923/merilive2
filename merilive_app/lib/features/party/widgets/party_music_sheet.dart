import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../bloc/party_room_cubit.dart';

/// PD7 — Host-only music panel.
///
/// Lists tracks from `admin_music_library` and lets the host announce the
/// current track through the room chat channel (message_type = 'music').
/// Actual audio playback is delegated to the native LiveKit publish path
/// in a later phase; this widget is the source of truth for track choice.
Future<void> showPartyMusicSheet(BuildContext context) async {
  final cubit = context.read<PartyRoomCubit>();
  if (!cubit.isHost) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Only the host can control music'),
        duration: Duration(seconds: 2),
      ),
    );
    return;
  }
  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: const Color(0xFF1F1B3A),
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (_) => BlocProvider.value(
      value: cubit,
      child: const _PartyMusicSheet(),
    ),
  );
}

class _PartyMusicSheet extends StatefulWidget {
  const _PartyMusicSheet();
  @override
  State<_PartyMusicSheet> createState() => _PartyMusicSheetState();
}

class _PartyMusicSheetState extends State<_PartyMusicSheet> {
  late Future<List<Map<String, dynamic>>> _future;
  String? _playingId;
  String _query = '';

  @override
  void initState() {
    super.initState();
    _future = context.read<PartyRoomCubit>().repository.loadMusicTracks();
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: FractionallySizedBox(
        heightFactor: 0.8,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Music Panel',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 10),
              TextField(
                onChanged: (v) => setState(() => _query = v.trim().toLowerCase()),
                style: const TextStyle(color: Colors.white),
                decoration: InputDecoration(
                  hintText: 'Search tracks…',
                  hintStyle:
                      TextStyle(color: Colors.white.withValues(alpha: 0.4)),
                  filled: true,
                  fillColor: Colors.white.withValues(alpha: 0.06),
                  prefixIcon: const Icon(Icons.search, color: Colors.white54),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide.none,
                  ),
                  contentPadding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                ),
              ),
              const SizedBox(height: 10),
              Expanded(
                child: FutureBuilder<List<Map<String, dynamic>>>(
                  future: _future,
                  builder: (context, snap) {
                    if (!snap.hasData) {
                      return const Center(
                        child: CircularProgressIndicator(color: Colors.white),
                      );
                    }
                    final tracks = snap.data!.where((t) {
                      if (_query.isEmpty) return true;
                      final title = (t['title'] as String?)?.toLowerCase() ?? '';
                      final artist =
                          (t['artist'] as String?)?.toLowerCase() ?? '';
                      return title.contains(_query) || artist.contains(_query);
                    }).toList();
                    if (tracks.isEmpty) {
                      return const Center(
                        child: Text(
                          'No tracks configured by admin',
                          style: TextStyle(color: Colors.white70),
                        ),
                      );
                    }
                    return ListView.separated(
                      itemCount: tracks.length,
                      separatorBuilder: (_, __) => Divider(
                        color: Colors.white.withValues(alpha: 0.06),
                        height: 1,
                      ),
                      itemBuilder: (_, i) {
                        final t = tracks[i];
                        final id = t['id'].toString();
                        final playing = id == _playingId;
                        final cover = t['cover_image_url'] as String?;
                        final dur =
                            (t['duration_seconds'] as num?)?.toInt() ?? 0;
                        return ListTile(
                          contentPadding: EdgeInsets.zero,
                          leading: ClipRRect(
                            borderRadius: BorderRadius.circular(6),
                            child: (cover != null && cover.isNotEmpty)
                                ? Image.network(
                                    cover,
                                    width: 44,
                                    height: 44,
                                    fit: BoxFit.cover,
                                    errorBuilder: (_, __, ___) => Container(
                                      width: 44,
                                      height: 44,
                                      color: Colors.white
                                          .withValues(alpha: 0.08),
                                      child: const Icon(Icons.music_note,
                                          color: Colors.white54),
                                    ),
                                  )
                                : Container(
                                    width: 44,
                                    height: 44,
                                    color:
                                        Colors.white.withValues(alpha: 0.08),
                                    child: const Icon(Icons.music_note,
                                        color: Colors.white54),
                                  ),
                          ),
                          title: Text(
                            (t['title'] as String?) ?? 'Untitled',
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          subtitle: Text(
                            '${(t['artist'] as String?) ?? 'Unknown'} · ${_fmt(dur)}',
                            style: const TextStyle(
                              color: Colors.white54,
                              fontSize: 11,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          trailing: IconButton(
                            icon: Icon(
                              playing
                                  ? Icons.stop_circle
                                  : Icons.play_circle_fill,
                              color: playing
                                  ? Colors.redAccent
                                  : const Color(0xFF10B981),
                              size: 30,
                            ),
                            onPressed: () => _toggle(t, playing),
                          ),
                        );
                      },
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _fmt(int s) {
    if (s <= 0) return '--:--';
    final m = s ~/ 60;
    final r = s % 60;
    return '$m:${r.toString().padLeft(2, '0')}';
  }

  Future<void> _toggle(Map<String, dynamic> t, bool wasPlaying) async {
    final cubit = context.read<PartyRoomCubit>();
    final me = Supabase.instance.client.auth.currentUser?.id;
    if (me == null) return;
    final id = t['id'].toString();
    setState(() => _playingId = wasPlaying ? null : id);
    try {
      if (wasPlaying) {
        await cubit.repository.announceMusic(
          roomId: cubit.roomId,
          hostId: me,
          trackTitle: 'Music stopped',
        );
      } else {
        await cubit.repository.announceMusic(
          roomId: cubit.roomId,
          hostId: me,
          trackTitle: (t['title'] as String?) ?? 'Untitled',
          artist: t['artist'] as String?,
        );
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Music action failed: $e')),
      );
    }
  }
}
