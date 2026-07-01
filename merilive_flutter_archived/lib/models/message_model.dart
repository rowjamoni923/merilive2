/// MeriLive direct message — `public.messages` table.
/// Realtime-enabled. Encrypted via per-conversation symmetric key (`conversation_encryption_keys`).
class MessageModel {
  final String id;
  final String conversationId;
  final String senderId;
  final String content;
  final String messageType; // text | image | video | audio | gift | system
  final bool isRead;
  final bool isEncrypted;
  final int encryptionVersion;
  final String? mediaUrl;
  final String? replyToId;
  final bool isDeleted;
  final bool isAiReply;
  final String status; // sent | delivered | read | failed
  final DateTime? deliveredAt;
  final DateTime? readAt;
  final DateTime createdAt;

  MessageModel({
    required this.id,
    required this.conversationId,
    required this.senderId,
    required this.content,
    this.messageType = 'text',
    this.isRead = false,
    this.isEncrypted = false,
    this.encryptionVersion = 1,
    this.mediaUrl,
    this.replyToId,
    this.isDeleted = false,
    this.isAiReply = false,
    this.status = 'sent',
    this.deliveredAt,
    this.readAt,
    required this.createdAt,
  });

  factory MessageModel.fromJson(Map<String, dynamic> json) {
    return MessageModel(
      id: json['id'] ?? '',
      conversationId: json['conversation_id'] ?? '',
      senderId: json['sender_id'] ?? '',
      content: json['content'] ?? '',
      messageType: json['message_type'] ?? 'text',
      isRead: json['is_read'] ?? false,
      isEncrypted: json['is_encrypted'] ?? false,
      encryptionVersion: json['encryption_version'] ?? 1,
      mediaUrl: json['media_url'],
      replyToId: json['reply_to_id'],
      isDeleted: json['is_deleted'] ?? false,
      isAiReply: json['is_ai_reply'] ?? false,
      status: json['status'] ?? 'sent',
      deliveredAt: json['delivered_at'] != null ? DateTime.tryParse(json['delivered_at']) : null,
      readAt: json['read_at'] != null ? DateTime.tryParse(json['read_at']) : null,
      createdAt: json['created_at'] != null ? DateTime.parse(json['created_at']) : DateTime.now(),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'conversation_id': conversationId,
        'sender_id': senderId,
        'content': content,
        'message_type': messageType,
        'is_read': isRead,
        'is_encrypted': isEncrypted,
        'encryption_version': encryptionVersion,
        'media_url': mediaUrl,
        'reply_to_id': replyToId,
        'is_deleted': isDeleted,
        'is_ai_reply': isAiReply,
        'status': status,
        'delivered_at': deliveredAt?.toIso8601String(),
        'read_at': readAt?.toIso8601String(),
        'created_at': createdAt.toIso8601String(),
      };
}

/// `public.conversations`
class ConversationModel {
  final String id;
  final String participant1Id;
  final String participant2Id;
  final String? lastMessage;
  final DateTime? lastMessageAt;
  final bool isEncrypted;
  final DateTime createdAt;

  ConversationModel({
    required this.id,
    required this.participant1Id,
    required this.participant2Id,
    this.lastMessage,
    this.lastMessageAt,
    this.isEncrypted = false,
    required this.createdAt,
  });

  factory ConversationModel.fromJson(Map<String, dynamic> json) {
    return ConversationModel(
      id: json['id'] ?? '',
      participant1Id: json['participant1_id'] ?? '',
      participant2Id: json['participant2_id'] ?? '',
      lastMessage: json['last_message'],
      lastMessageAt: json['last_message_at'] != null ? DateTime.tryParse(json['last_message_at']) : null,
      isEncrypted: json['is_encrypted'] ?? false,
      createdAt: json['created_at'] != null ? DateTime.parse(json['created_at']) : DateTime.now(),
    );
  }

  String otherParticipantId(String myId) =>
      participant1Id == myId ? participant2Id : participant1Id;
}
