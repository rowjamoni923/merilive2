import 'dart:async';

import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/moderation/contact_moderation.dart';

/// A2 — Chat + Gift + System-notice feed for a live stream.
///
/// Web-truth reference: `src/pages/LiveStream.tsx`.
///   • `stream_chat` — persistent chat rows (INSERT is source of truth
///     for moderation; realtime fanout is safety-net when LiveKit
///     DataPacket path isn't wired yet on Flutter).
///   • `gift_transactions` — gift feed ticker.
/// Auth-required for inserts (RLS).
class LiveChatMessage {
  LiveChatMessage({
    required this.id,
    required this.userId,
    required this.displayName,
    required this.avatarUrl,
    required this.level,
    required this.message,
    required this.type,
    required this.createdAt,
  });

  final String id;
  final String? userId;
  final String displayName;
  final String? avatarUrl;
  final int level;
  final String message;
  final String type; // text | system | gift | welcome
  final DateTime createdAt;

  factory LiveChatMessage.fromRow(
    Map<String, dynamic> row,
    Map<String, dynamic>? profile,
  ) {
    return LiveChatMessage(
      id: row['id']?.toString() ?? DateTime.now().microsecondsSinceEpoch.toString(),
      userId: row['user_id']?.toString(),
      displayName: profile?['display_name']?.toString() ??
          profile?['name']?.toString() ??
          'User',
      avatarUrl: profile?['avatar_url']?.toString(),
      level: (profile?['user_level'] as int?) ?? (profile?['level'] as int?) ?? 1,
      message: row['message']?.toString() ?? '',
      type: row['message_type']?.toString() ?? 'text',
      createdAt:
          DateTime.tryParse(row['created_at']?.toString() ?? '') ?? DateTime.now(),
    );
  }

  factory LiveChatMessage.system(String text) => LiveChatMessage(
        id: 'sys_${DateTime.now().microsecondsSinceEpoch}',
        userId: null,
        displayName: 'System',
        avatarUrl: null,
        level: 0,
        message: text,
        type: 'system',
        createdAt: DateTime.now(),
      );
}

class LiveGiftEvent {
  LiveGiftEvent({
    required this.id,
    required this.giftId,
    required this.senderId,
    required this.senderName,
    required this.senderAvatar,
    required this.receiverId,
    required this.giftName,
    required this.giftIcon,
    required this.animationUrl,
    required this.animationType,
    required this.coinAmount,
    required this.perUnitCoins,
    required this.quantity,
    required this.createdAt,
  });

  final String id;
  final String? giftId;
  final String? senderId;
  final String senderName;
  final String? senderAvatar;
  final String? receiverId;
  final String giftName;
  final String? giftIcon;
  final String? animationUrl;
  final String? animationType;
  final int coinAmount;
  final int perUnitCoins;
  final int quantity;
  final DateTime createdAt;
}

class LiveChatBridge {
  LiveChatBridge._();
  static final LiveChatBridge instance = LiveChatBridge._();

  final _client = Supabase.instance.client;

  final _messagesCtrl = StreamController<List<LiveChatMessage>>.broadcast();
  final _giftsCtrl = StreamController<LiveGiftEvent>.broadcast();

  final List<LiveChatMessage> _messages = [];
  static const int _maxMessages = 120;

  RealtimeChannel? _chatChannel;
  RealtimeChannel? _giftChannel;
  String? _streamId;

  Stream<List<LiveChatMessage>> get messages$ => _messagesCtrl.stream;
  Stream<LiveGiftEvent> get gifts$ => _giftsCtrl.stream;
  List<LiveChatMessage> get snapshot => List.unmodifiable(_messages);

  Future<void> attach(String streamId) async {
    if (_streamId == streamId && _chatChannel != null) return;
    await detach();
    _streamId = streamId;

    await _loadHistory(streamId);

    _chatChannel = _client
        .channel('flutter_stream_chat_$streamId')
        .onPostgresChanges(
          event: PostgresChangeEvent.insert,
          schema: 'public',
          table: 'stream_chat',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'stream_id',
            value: streamId,
          ),
          callback: (payload) => _onChatInsert(payload.newRecord),
        )
        .subscribe();

    _giftChannel = _client
        .channel('flutter_stream_gifts_$streamId')
        .onPostgresChanges(
          event: PostgresChangeEvent.insert,
          schema: 'public',
          table: 'gift_transactions',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'stream_id',
            value: streamId,
          ),
          callback: (payload) => _onGiftInsert(payload.newRecord),
        )
        .subscribe();
  }

  Future<void> detach() async {
    _streamId = null;
    try {
      if (_chatChannel != null) await _client.removeChannel(_chatChannel!);
    } catch (_) {}
    try {
      if (_giftChannel != null) await _client.removeChannel(_giftChannel!);
    } catch (_) {}
    _chatChannel = null;
    _giftChannel = null;
    _messages.clear();
    _messagesCtrl.add(const []);
  }

  void pushSystemNotice(String text) {
    _append(LiveChatMessage.system(text));
  }

  Future<void> sendMessage(String text) async {
    final content = text.trim();
    final streamId = _streamId;
    final uid = _client.auth.currentUser?.id;
    if (content.isEmpty || streamId == null || uid == null) return;

    // P0 #2 — Contact-sharing moderation (web-truth: `detectAndProcessViolation`).
    // Non-host senders pass through unmasked. Verified-host senders get
    // server-side beans deduction + ban escalation via `process_contact_violation`
    // RPC. On any violation we BLOCK the send so peers never see the contact.
    final outcome = await ContactModeration.instance.check(
      senderId: uid,
      message: content,
      source: ViolationSource.live_stream,
      sourceId: streamId,
    );
    if (outcome.blocked) {
      throw const ContactViolationException();
    }

    // Optimistic append
    final temp = LiveChatMessage(
      id: 'temp_${DateTime.now().microsecondsSinceEpoch}',
      userId: uid,
      displayName: _client.auth.currentUser?.userMetadata?['name']?.toString() ??
          'You',
      avatarUrl: _client.auth.currentUser?.userMetadata?['avatar_url']?.toString(),
      level: 1,
      message: content,
      type: 'text',
      createdAt: DateTime.now(),
    );
    _append(temp);

    try {
      await _client.from('stream_chat').insert({
        'stream_id': streamId,
        'user_id': uid,
        'message': content,
      });
    } catch (_) {
      // Leave the optimistic row; upstream UI can toast on failure via error hook.
      rethrow;
    }
  }


  Future<void> _loadHistory(String streamId) async {
    try {
      final rows = await _client
          .from('stream_chat')
          .select('id, message, message_type, created_at, user_id')
          .eq('stream_id', streamId)
          .order('created_at', ascending: true)
          .limit(50);

      final list = (rows as List).cast<Map<String, dynamic>>();
      final userIds = list
          .map((r) => r['user_id']?.toString())
          .whereType<String>()
          .toSet()
          .toList();

      Map<String, Map<String, dynamic>> profiles = {};
      if (userIds.isNotEmpty) {
        final profRows = await _client
            .from('profiles_public')
            .select('id, display_name, user_level, avatar_url')
            .inFilter('id', userIds);
        for (final p in (profRows as List).cast<Map<String, dynamic>>()) {
          profiles[p['id'].toString()] = p;
        }
      }

      _messages.clear();
      for (final r in list) {
        _messages
            .add(LiveChatMessage.fromRow(r, profiles[r['user_id']?.toString()]));
      }
      _emit();
    } catch (_) {
      // silent — overlay will just start empty
    }
  }

  Future<void> _onChatInsert(Map<String, dynamic> row) async {
    if (row['message_type']?.toString() == 'system_join') return;
    // Dedup: skip if we already have a temp row with same content from same user
    final uid = row['user_id']?.toString();
    final msg = row['message']?.toString() ?? '';
    final tempIdx = _messages.indexWhere((m) =>
        m.id.startsWith('temp_') && m.userId == uid && m.message == msg);
    Map<String, dynamic>? profile;
    if (uid != null) {
      try {
        profile = await _client
            .from('profiles_public')
            .select('id, display_name, user_level, avatar_url')
            .eq('id', uid)
            .maybeSingle();
      } catch (_) {}
    }
    final message = LiveChatMessage.fromRow(row, profile);
    if (tempIdx >= 0) {
      _messages[tempIdx] = message;
      _emit();
    } else {
      _append(message);
    }
  }

  Future<void> _onGiftInsert(Map<String, dynamic> row) async {
    try {
      final senderId = row['sender_id']?.toString();
      final giftId = row['gift_id']?.toString();

      Map<String, dynamic>? sender;
      Map<String, dynamic>? gift;
      if (senderId != null) {
        sender = await _client
            .from('profiles_public')
            .select('id, display_name, avatar_url')
            .eq('id', senderId)
            .maybeSingle();
      }
      if (giftId != null) {
        gift = await _client
            .from('gifts')
            .select(
                'id, name, icon_url, image_url, animation_url, animation_type, coin_cost, coin_price')
            .eq('id', giftId)
            .maybeSingle();
      }

      final quantity = (row['quantity'] as int?) ?? 1;
      final coinAmount = (row['coin_amount'] as int?) ?? 0;
      final perUnitFromGift = (gift?['coin_price'] as num?)?.toInt() ??
          (gift?['coin_cost'] as num?)?.toInt();
      final perUnit = perUnitFromGift ??
          (quantity > 0 ? (coinAmount / quantity).round() : coinAmount);

      final event = LiveGiftEvent(
        id: row['id']?.toString() ??
            DateTime.now().microsecondsSinceEpoch.toString(),
        giftId: giftId,
        senderId: senderId,
        senderName: sender?['display_name']?.toString() ?? 'Someone',
        senderAvatar: sender?['avatar_url']?.toString(),
        receiverId: row['receiver_id']?.toString(),
        giftName: gift?['name']?.toString() ?? 'Gift',
        giftIcon: gift?['icon_url']?.toString() ??
            gift?['image_url']?.toString(),
        animationUrl: gift?['animation_url']?.toString(),
        animationType: gift?['animation_type']?.toString(),
        coinAmount: coinAmount,
        perUnitCoins: perUnit,
        quantity: quantity,
        createdAt:
            DateTime.tryParse(row['created_at']?.toString() ?? '') ?? DateTime.now(),
      );
      _giftsCtrl.add(event);

      // Also inject a compact chat line so the feed reflects the gift.
      _append(LiveChatMessage(
        id: 'gift_${event.id}',
        userId: senderId,
        displayName: event.senderName,
        avatarUrl: event.senderAvatar,
        level: 1,
        message: 'sent ${event.giftName} x${event.quantity}',
        type: 'gift',
        createdAt: event.createdAt,
      ));
    } catch (_) {}
  }

  void _append(LiveChatMessage m) {
    _messages.add(m);
    if (_messages.length > _maxMessages) {
      _messages.removeRange(0, _messages.length - _maxMessages);
    }
    _emit();
  }

  void _emit() {
    _messagesCtrl.add(List.unmodifiable(_messages));
  }
}

/// Thrown by `LiveChatBridge.sendMessage` when contact-sharing moderation
/// blocks the message. UI catches this to show the warning dialog and
/// suppress the generic error toast.
class ContactViolationException implements Exception {
  const ContactViolationException();
  @override
  String toString() => 'ContactViolationException';
}

