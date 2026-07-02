// R1 — Reels realtime channels.
//
// Mirrors the web `subscribeToTables('reels-feed-<slug>', ...)` behavior from
// `src/pages/Reels.tsx`. Emits patch events the cubit applies to the loaded
// feed so like/comment/share counters tick without a refetch.
//
// One channel per (category slug × user) tuple. Cleanly disposed on close.

import 'dart:async';

import 'package:supabase_flutter/supabase_flutter.dart';

enum ReelPatchKind { likeAdd, likeRemove, commentAdd, commentRemove, shareAdd, reelUpsert }

class ReelPatch {
  const ReelPatch(this.kind, this.reelId, {this.actorUserId});
  final ReelPatchKind kind;
  final String reelId;
  final String? actorUserId;
}

class ReelsRealtime {
  ReelsRealtime(this._client);

  final SupabaseClient _client;
  RealtimeChannel? _channel;
  final _controller = StreamController<ReelPatch>.broadcast();

  Stream<ReelPatch> get stream => _controller.stream;

  Future<void> subscribe(String categorySlug) async {
    await unsubscribe();
    final ch = _client.channel('reels-feed-$categorySlug');

    void bind(String table, ReelPatchKind add, ReelPatchKind? remove) {
      ch.onPostgresChanges(
        event: PostgresChangeEvent.insert,
        schema: 'public',
        table: table,
        callback: (payload) {
          final row = payload.newRecord;
          final id = row['reel_id']?.toString() ?? row['id']?.toString();
          if (id == null) return;
          _controller.add(ReelPatch(add, id, actorUserId: row['user_id']?.toString()));
        },
      );
      if (remove != null) {
        ch.onPostgresChanges(
          event: PostgresChangeEvent.delete,
          schema: 'public',
          table: table,
          callback: (payload) {
            final row = payload.oldRecord;
            final id = row['reel_id']?.toString() ?? row['id']?.toString();
            if (id == null) return;
            _controller.add(ReelPatch(remove, id, actorUserId: row['user_id']?.toString()));
          },
        );
      }
    }

    bind('reel_likes', ReelPatchKind.likeAdd, ReelPatchKind.likeRemove);
    bind('reel_comments', ReelPatchKind.commentAdd, ReelPatchKind.commentRemove);
    bind('reel_shares', ReelPatchKind.shareAdd, null);

    // `reels` upserts (new upload / approval flip / delete) trigger a
    // debounced full-list refetch handled by the cubit — we just relay the
    // event with the reel id so it can decide.
    ch.onPostgresChanges(
      event: PostgresChangeEvent.all,
      schema: 'public',
      table: 'reels',
      callback: (payload) {
        final row = payload.newRecord.isNotEmpty
            ? payload.newRecord
            : payload.oldRecord;
        final id = row['id']?.toString();
        if (id == null) return;
        _controller.add(ReelPatch(ReelPatchKind.reelUpsert, id));
      },
    );

    ch.subscribe();
    _channel = ch;
  }

  Future<void> unsubscribe() async {
    final ch = _channel;
    if (ch != null) {
      await _client.removeChannel(ch);
      _channel = null;
    }
  }

  Future<void> dispose() async {
    await unsubscribe();
    await _controller.close();
  }
}
