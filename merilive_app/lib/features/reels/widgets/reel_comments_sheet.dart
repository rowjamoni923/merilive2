// R6 — Reels comments bottom sheet.
//
// Draggable modal presenting a reel's comments with realtime append, optimistic
// posting, reply prefill (@handle), and time-ago labels. Follows Chamet/TikTok
// pattern: opens over the paused reel, hosts inside its own scroll controller,
// keyboard-aware composer pinned to bottom via SafeArea.
//
// Data path:
//   • Initial fetch: ReelsRepository.fetchComments(reelId) — newest first.
//   • Realtime: single Supabase channel subscribed to INSERT/DELETE on
//     `public.reel_comments` filtered by reel_id. Rows are hydrated with
//     the joined user via a tiny follow-up select so the row shape matches
//     ReelComment.fromMap.
//   • Post: repo.postComment(...) returns the enriched row → inserted at head.
//     Cubit's `bumpComment(reelId, +1)` keeps the right-rail counter in sync.

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../bloc/reels_feed_cubit.dart';
import '../data/reels_models.dart';
import '../data/reels_repository.dart';

Future<void> showReelCommentsSheet({
  required BuildContext context,
  required Reel reel,
}) {
  final cubit = context.read<ReelsFeedCubit>();
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    barrierColor: Colors.black54,
    useSafeArea: true,
    builder: (sheetCtx) => BlocProvider.value(
      value: cubit,
      child: _ReelCommentsSheet(reel: reel),
    ),
  );
}

class _ReelCommentsSheet extends StatefulWidget {
  const _ReelCommentsSheet({required this.reel});
  final Reel reel;

  @override
  State<_ReelCommentsSheet> createState() => _ReelCommentsSheetState();
}

class _ReelCommentsSheetState extends State<_ReelCommentsSheet> {
  late final ReelsRepository _repo;
  late final SupabaseClient _client;
  RealtimeChannel? _channel;

  final _textCtrl = TextEditingController();
  final _inputFocus = FocusNode();
  final _scrollCtrl = ScrollController();

  List<ReelComment> _comments = const [];
  bool _loading = true;
  bool _sending = false;
  Object? _error;

  ReelComment? _replyTo;

  @override
  void initState() {
    super.initState();
    _client = Supabase.instance.client;
    _repo = ReelsRepository(_client);
    _load();
    _subscribe();
  }

  @override
  void dispose() {
    final ch = _channel;
    if (ch != null) unawaited(_client.removeChannel(ch));
    _textCtrl.dispose();
    _inputFocus.dispose();
    _scrollCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final rows = await _repo.fetchComments(widget.reel.id);
      if (!mounted) return;
      setState(() {
        _comments = rows;
        _loading = false;
        _error = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e;
      });
    }
  }

  void _subscribe() {
    final ch = _client.channel('reel-comments-${widget.reel.id}');
    ch.onPostgresChanges(
      event: PostgresChangeEvent.insert,
      schema: 'public',
      table: 'reel_comments',
      filter: PostgresChangeFilter(
        type: PostgresChangeFilterType.eq,
        column: 'reel_id',
        value: widget.reel.id,
      ),
      callback: (payload) => unawaited(_onRealtimeInsert(payload.newRecord)),
    );
    ch.onPostgresChanges(
      event: PostgresChangeEvent.delete,
      schema: 'public',
      table: 'reel_comments',
      filter: PostgresChangeFilter(
        type: PostgresChangeFilterType.eq,
        column: 'reel_id',
        value: widget.reel.id,
      ),
      callback: (payload) => _onRealtimeDelete(payload.oldRecord),
    );
    ch.subscribe();
    _channel = ch;
  }

  Future<void> _onRealtimeInsert(Map<String, dynamic> row) async {
    final id = row['id']?.toString();
    if (id == null) return;
    if (_comments.any((c) => c.id == id)) return;
    // Hydrate with joined user (realtime payload has raw row only).
    try {
      final enriched = await _client
          .from('reel_comments')
          .select(
            'id, reel_id, user_id, content, parent_id, likes_count, created_at, '
            'user:profiles_public!reel_comments_user_id_fkey(id, app_uid, '
            'display_name, avatar_url, user_level, host_level, max_user_level, '
            'gender, is_verified, is_host, frame_id, equipped_frame_id)',
          )
          .eq('id', id)
          .maybeSingle();
      if (enriched == null || !mounted) return;
      final c = ReelComment.fromMap(Map<String, dynamic>.from(enriched));
      if (_comments.any((x) => x.id == c.id)) return;
      setState(() => _comments = [c, ..._comments]);
      context.read<ReelsFeedCubit>().bumpComment(widget.reel.id, 1);
    } catch (_) {
      // Realtime enrichment is best-effort; skip on failure.
    }
  }

  void _onRealtimeDelete(Map<String, dynamic> row) {
    final id = row['id']?.toString();
    if (id == null) return;
    final before = _comments.length;
    final next = _comments.where((c) => c.id != id).toList(growable: false);
    if (next.length == before) return;
    if (!mounted) return;
    setState(() => _comments = next);
    context.read<ReelsFeedCubit>().bumpComment(widget.reel.id, -1);
  }

  Future<void> _submit() async {
    final raw = _textCtrl.text.trim();
    if (raw.isEmpty || _sending) return;
    final uid = _client.auth.currentUser?.id;
    if (uid == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please sign in to comment')),
      );
      return;
    }
    setState(() => _sending = true);
    try {
      final posted = await _repo.postComment(
        reelId: widget.reel.id,
        userId: uid,
        content: raw,
        parentId: _replyTo?.id,
      );
      if (!mounted) return;
      // Optimistic prepend (realtime dedupes by id).
      if (!_comments.any((c) => c.id == posted.id)) {
        setState(() => _comments = [posted, ..._comments]);
        context.read<ReelsFeedCubit>().bumpComment(widget.reel.id, 1);
      }
      _textCtrl.clear();
      setState(() => _replyTo = null);
      if (_scrollCtrl.hasClients) {
        _scrollCtrl.animateTo(
          0,
          duration: const Duration(milliseconds: 220),
          curve: Curves.easeOut,
        );
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not post comment: $e')),
      );
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  void _setReplyTo(ReelComment c) {
    setState(() => _replyTo = c);
    final handle = c.user?.displayName ?? 'user';
    final prefix = '@$handle ';
    if (!_textCtrl.text.startsWith(prefix)) {
      _textCtrl.text = prefix;
      _textCtrl.selection = TextSelection.collapsed(offset: prefix.length);
    }
    _inputFocus.requestFocus();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return DraggableScrollableSheet(
      initialChildSize: 0.72,
      minChildSize: 0.4,
      maxChildSize: 0.94,
      expand: false,
      builder: (ctx, sheetScroll) {
        return Container(
          decoration: BoxDecoration(
            color: theme.colorScheme.surface,
            borderRadius: const BorderRadius.vertical(
              top: Radius.circular(18),
            ),
          ),
          child: Column(
            children: [
              _grabber(theme),
              _header(theme),
              const Divider(height: 1),
              Expanded(child: _body(theme, sheetScroll)),
              if (_replyTo != null) _replyChip(theme),
              _composer(theme),
            ],
          ),
        );
      },
    );
  }

  Widget _grabber(ThemeData theme) => Padding(
        padding: const EdgeInsets.only(top: 8, bottom: 6),
        child: Container(
          width: 42,
          height: 4,
          decoration: BoxDecoration(
            color: theme.dividerColor,
            borderRadius: BorderRadius.circular(2),
          ),
        ),
      );

  Widget _header(ThemeData theme) {
    final count = _comments.length;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 8, 10),
      child: Row(
        children: [
          Text(
            count == 0 ? 'Comments' : '$count comments',
            style: theme.textTheme.titleMedium
                ?.copyWith(fontWeight: FontWeight.w600),
          ),
          const Spacer(),
          IconButton(
            icon: const Icon(Icons.close),
            onPressed: () => Navigator.of(context).maybePop(),
            tooltip: 'Close',
          ),
        ],
      ),
    );
  }

  Widget _body(ThemeData theme, ScrollController sheetScroll) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null && _comments.isEmpty) {
      return _emptyOrError(
        icon: Icons.error_outline,
        title: 'Could not load comments',
        subtitle: 'Pull to retry',
        action: _load,
      );
    }
    if (_comments.isEmpty) {
      return _emptyOrError(
        icon: Icons.mode_comment_outlined,
        title: 'No comments yet',
        subtitle: 'Be the first to comment',
      );
    }
    // We keep the sheet's own drag controller as the outer scroll so drag-down
    // dismisses when the list is at top, and a nested list scrolls otherwise.
    return NotificationListener<OverscrollIndicatorNotification>(
      onNotification: (n) {
        n.disallowIndicator();
        return false;
      },
      child: RefreshIndicator(
        onRefresh: _load,
        child: ListView.builder(
          controller: _scrollCtrl,
          padding: const EdgeInsets.symmetric(vertical: 4),
          physics: const AlwaysScrollableScrollPhysics(),
          itemCount: _comments.length,
          itemBuilder: (ctx, i) => _CommentTile(
            comment: _comments[i],
            onReply: () => _setReplyTo(_comments[i]),
          ),
        ),
      ),
    );
  }

  Widget _emptyOrError({
    required IconData icon,
    required String title,
    required String subtitle,
    VoidCallback? action,
  }) {
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      children: [
        const SizedBox(height: 80),
        Icon(icon, size: 44, color: Colors.grey),
        const SizedBox(height: 12),
        Center(
          child: Text(title,
              style: const TextStyle(fontWeight: FontWeight.w600)),
        ),
        const SizedBox(height: 4),
        Center(
          child: Text(subtitle,
              style: const TextStyle(color: Colors.grey, fontSize: 12)),
        ),
        if (action != null) ...[
          const SizedBox(height: 12),
          Center(
            child: TextButton(onPressed: action, child: const Text('Retry')),
          ),
        ],
      ],
    );
  }

  Widget _replyChip(ThemeData theme) {
    final handle = _replyTo?.user?.displayName ?? 'user';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      color: theme.colorScheme.surfaceContainerHighest.withOpacity(0.6),
      child: Row(
        children: [
          const Icon(Icons.reply, size: 14),
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              'Replying to @$handle',
              style: theme.textTheme.bodySmall,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          InkWell(
            onTap: () => setState(() => _replyTo = null),
            child: const Padding(
              padding: EdgeInsets.all(4),
              child: Icon(Icons.close, size: 14),
            ),
          ),
        ],
      ),
    );
  }

  Widget _composer(ThemeData theme) {
    final signedIn = _client.auth.currentUser != null;
    return SafeArea(
      top: false,
      child: Padding(
        padding: EdgeInsets.only(
          left: 12,
          right: 8,
          top: 8,
          bottom: 8 + MediaQuery.of(context).viewInsets.bottom,
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Expanded(
              child: TextField(
                controller: _textCtrl,
                focusNode: _inputFocus,
                enabled: signedIn && !_sending,
                minLines: 1,
                maxLines: 4,
                textInputAction: TextInputAction.send,
                onSubmitted: (_) => _submit(),
                decoration: InputDecoration(
                  hintText: signedIn
                      ? 'Add a comment…'
                      : 'Sign in to comment',
                  filled: true,
                  fillColor:
                      theme.colorScheme.surfaceContainerHighest.withOpacity(0.5),
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 10,
                  ),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(22),
                    borderSide: BorderSide.none,
                  ),
                ),
              ),
            ),
            IconButton(
              onPressed: signedIn && !_sending ? _submit : null,
              icon: _sending
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.send_rounded),
              color: theme.colorScheme.primary,
              tooltip: 'Send',
            ),
          ],
        ),
      ),
    );
  }
}

class _CommentTile extends StatelessWidget {
  const _CommentTile({required this.comment, required this.onReply});
  final ReelComment comment;
  final VoidCallback onReply;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final u = comment.user;
    final name = u?.displayName?.trim().isNotEmpty == true
        ? u!.displayName!
        : (u?.appUid ?? 'User');
    final avatar = u?.avatarUrl;
    final isReply = comment.parentId != null;
    return Padding(
      padding: EdgeInsets.fromLTRB(isReply ? 44 : 12, 8, 12, 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          CircleAvatar(
            radius: isReply ? 14 : 18,
            backgroundColor: theme.colorScheme.surfaceContainerHighest,
            backgroundImage: (avatar != null && avatar.isNotEmpty)
                ? NetworkImage(avatar)
                : null,
            child: (avatar == null || avatar.isEmpty)
                ? Text(name.characters.first.toUpperCase(),
                    style: const TextStyle(fontWeight: FontWeight.w600))
                : null,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        name,
                        style: theme.textTheme.labelLarge?.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    if (u?.isVerified == true) ...[
                      const SizedBox(width: 4),
                      const Icon(Icons.verified, size: 14, color: Colors.blue),
                    ],
                    const SizedBox(width: 6),
                    Text(
                      _timeAgo(comment.createdAt),
                      style: theme.textTheme.bodySmall
                          ?.copyWith(color: Colors.grey),
                    ),
                  ],
                ),
                const SizedBox(height: 2),
                Text(comment.content, style: theme.textTheme.bodyMedium),
                const SizedBox(height: 4),
                InkWell(
                  onTap: onReply,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 2),
                    child: Text(
                      'Reply',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: Colors.grey,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  static String _timeAgo(DateTime dt) {
    final diff = DateTime.now().toUtc().difference(dt.toUtc());
    if (diff.inSeconds < 45) return 'now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m';
    if (diff.inHours < 24) return '${diff.inHours}h';
    if (diff.inDays < 7) return '${diff.inDays}d';
    if (diff.inDays < 365) return '${(diff.inDays / 7).floor()}w';
    return '${(diff.inDays / 365).floor()}y';
  }
}
