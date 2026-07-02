import 'package:equatable/equatable.dart';

/// Live seat occupant inside a party room.
class PartySeat extends Equatable {
  const PartySeat({
    required this.seatNumber,
    required this.participantId,
    required this.userId,
    required this.role,
    required this.isMuted,
    required this.mutedByHost,
    required this.displayName,
    required this.avatarUrl,
    required this.userLevel,
    required this.gender,
    required this.isLocked,
    required this.forbidAudio,
    required this.forbidVideo,
  });

  final int seatNumber;
  final String? participantId;
  final String? userId;
  final String role; // host | co-host | member | viewer
  final bool isMuted;
  final bool mutedByHost;
  final String? displayName;
  final String? avatarUrl;
  final int userLevel;
  final String? gender;
  final bool isLocked;
  final bool forbidAudio;
  final bool forbidVideo;

  bool get isEmpty => userId == null || userId!.isEmpty;
  bool get isHost => role == 'host';

  PartySeat copyWith({
    String? participantId,
    String? userId,
    String? role,
    bool? isMuted,
    bool? mutedByHost,
    String? displayName,
    String? avatarUrl,
    int? userLevel,
    String? gender,
    bool? isLocked,
    bool? forbidAudio,
    bool? forbidVideo,
  }) =>
      PartySeat(
        seatNumber: seatNumber,
        participantId: participantId ?? this.participantId,
        userId: userId ?? this.userId,
        role: role ?? this.role,
        isMuted: isMuted ?? this.isMuted,
        mutedByHost: mutedByHost ?? this.mutedByHost,
        displayName: displayName ?? this.displayName,
        avatarUrl: avatarUrl ?? this.avatarUrl,
        userLevel: userLevel ?? this.userLevel,
        gender: gender ?? this.gender,
        isLocked: isLocked ?? this.isLocked,
        forbidAudio: forbidAudio ?? this.forbidAudio,
        forbidVideo: forbidVideo ?? this.forbidVideo,
      );

  factory PartySeat.empty(int n) => PartySeat(
        seatNumber: n,
        participantId: null,
        userId: null,
        role: 'viewer',
        isMuted: false,
        mutedByHost: false,
        displayName: null,
        avatarUrl: null,
        userLevel: 0,
        gender: null,
        isLocked: false,
        forbidAudio: false,
        forbidVideo: false,
      );

  @override
  List<Object?> get props => [
        seatNumber,
        userId,
        role,
        isMuted,
        mutedByHost,
        isLocked,
        forbidAudio,
        forbidVideo,
        displayName,
        avatarUrl,
        userLevel,
      ];
}

/// Chat message inside a party room.
class PartyChatMessage extends Equatable {
  const PartyChatMessage({
    required this.id,
    required this.userId,
    required this.content,
    required this.messageType,
    required this.createdAt,
    required this.displayName,
    required this.avatarUrl,
    required this.userLevel,
    required this.giftData,
  });

  final String id;
  final String userId;
  final String content;
  final String messageType; // text | system | gift | join | leave
  final DateTime createdAt;
  final String? displayName;
  final String? avatarUrl;
  final int userLevel;
  final Map<String, dynamic>? giftData;

  bool get isSystem => messageType == 'system' ||
      messageType == 'join' ||
      messageType == 'leave';

  factory PartyChatMessage.fromRow(
    Map<String, dynamic> row, {
    String? displayName,
    String? avatarUrl,
    int userLevel = 0,
  }) =>
      PartyChatMessage(
        id: row['id']?.toString() ?? '',
        userId: row['user_id']?.toString() ?? '',
        content: (row['content'] as String?) ?? '',
        messageType: (row['message_type'] as String?) ?? 'text',
        createdAt: DateTime.tryParse(row['created_at']?.toString() ?? '') ??
            DateTime.now(),
        displayName: displayName,
        avatarUrl: avatarUrl,
        userLevel: userLevel,
        giftData: (row['gift_data'] as Map?)?.cast<String, dynamic>(),
      );

  @override
  List<Object?> get props => [id, content, messageType, createdAt];
}
