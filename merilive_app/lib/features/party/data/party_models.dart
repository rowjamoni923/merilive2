import 'package:equatable/equatable.dart';

/// Party room type — mirrors `party_rooms.room_type` (video / audio / game).
enum PartyRoomType { video, audio, game, other }

extension PartyRoomTypeX on PartyRoomType {
  String get label => switch (this) {
        PartyRoomType.video => 'video',
        PartyRoomType.audio => 'audio',
        PartyRoomType.game => 'game',
        PartyRoomType.other => 'party',
      };

  static PartyRoomType parse(String? raw) {
    switch ((raw ?? '').toLowerCase()) {
      case 'video':
        return PartyRoomType.video;
      case 'audio':
        return PartyRoomType.audio;
      case 'game':
        return PartyRoomType.game;
      default:
        return PartyRoomType.other;
    }
  }
}

class PartyHost extends Equatable {
  const PartyHost({
    required this.id,
    required this.displayName,
    required this.avatarUrl,
    required this.userLevel,
    required this.hostLevel,
    required this.countryCode,
    required this.countryFlag,
    required this.gender,
    required this.isOnline,
    required this.isHost,
  });

  final String id;
  final String? displayName;
  final String? avatarUrl;
  final int userLevel;
  final int? hostLevel;
  final String? countryCode;
  final String? countryFlag;
  final String? gender;
  final bool isOnline;
  final bool isHost;

  int get displayLevel {
    final h = hostLevel ?? 0;
    return h > userLevel ? h : userLevel;
  }

  factory PartyHost.fromRow(Map<String, dynamic> row) => PartyHost(
        id: row['id']?.toString() ?? '',
        displayName: row['display_name'] as String?,
        avatarUrl: row['avatar_url'] as String?,
        userLevel: (row['user_level'] as num?)?.toInt() ?? 0,
        hostLevel: (row['host_level'] as num?)?.toInt(),
        countryCode: row['country_code'] as String?,
        countryFlag: row['country_flag'] as String?,
        gender: row['gender'] as String?,
        isOnline: row['is_online'] == true,
        isHost: row['is_host'] == true,
      );

  @override
  List<Object?> get props =>
      [id, displayName, avatarUrl, userLevel, hostLevel, countryCode];
}

class PartyRoom extends Equatable {
  const PartyRoom({
    required this.id,
    required this.name,
    required this.roomType,
    required this.gameMode,
    required this.backgroundUrl,
    required this.entryFee,
    required this.minLevel,
    required this.maxParticipants,
    required this.currentParticipants,
    required this.isPrivate,
    required this.hasPassword,
    required this.roomCode,
    required this.mood,
    required this.description,
    required this.welcomeMessage,
    required this.host,
  });

  final String id;
  final String name;
  final PartyRoomType roomType;
  final String? gameMode;
  final String? backgroundUrl;
  final int entryFee;
  final int minLevel;
  final int maxParticipants;
  final int currentParticipants;
  /// Kept for back-compat; true only when the room requires a password.
  final bool isPrivate;
  /// H4 — `party_rooms.password_hash IS NOT NULL`. Renders a padlock badge
  /// and forces the join flow to prompt for a password.
  final bool hasPassword;
  final String? roomCode;
  final String? mood;
  final String? description;
  final String? welcomeMessage;
  final PartyHost? host;

  PartyRoom copyWith({int? currentParticipants, PartyHost? host}) => PartyRoom(
        id: id,
        name: name,
        roomType: roomType,
        gameMode: gameMode,
        backgroundUrl: backgroundUrl,
        entryFee: entryFee,
        minLevel: minLevel,
        maxParticipants: maxParticipants,
        currentParticipants: currentParticipants ?? this.currentParticipants,
        isPrivate: isPrivate,
        hasPassword: hasPassword,
        roomCode: roomCode,
        mood: mood,
        description: description,
        welcomeMessage: welcomeMessage,
        host: host ?? this.host,
      );

  factory PartyRoom.fromRow(Map<String, dynamic> row, {PartyHost? host}) {
    final pwd = row['password_hash'];
    final hasPwd = pwd != null && pwd.toString().isNotEmpty;
    return PartyRoom(
      id: row['id']?.toString() ?? '',
      name: (row['name'] as String?) ?? 'Party Room',
      roomType: PartyRoomTypeX.parse(row['room_type'] as String?),
      gameMode: row['game_mode'] as String?,
      backgroundUrl: row['background_url'] as String?,
      entryFee: (row['entry_fee'] as num?)?.toInt() ?? 0,
      minLevel: (row['min_level'] as num?)?.toInt() ?? 0,
      maxParticipants: (row['max_participants'] as num?)?.toInt() ?? 0,
      currentParticipants: (row['current_participants'] as num?)?.toInt() ?? 0,
      // Web-truth: party has no "private-hidden" tri-state — password_hash
      // is the sole privacy signal. Keep isPrivate as an alias.
      isPrivate: hasPwd,
      hasPassword: hasPwd,
      roomCode: row['room_code'] as String?,
      mood: row['mood'] as String?,
      description: row['description'] as String?,
      welcomeMessage: row['welcome_message'] as String?,
      host: host,
    );
  }

  @override
  List<Object?> get props =>
      [id, currentParticipants, roomType, hasPassword, host];
}

/// Party discovery country strip — mirrors web `partyCountries` in `Discover.tsx`.
class PartyCountry {
  const PartyCountry(this.code, this.name, this.flag);
  final String code;
  final String name;
  final String flag;
}

const kPartyCountries = <PartyCountry>[
  PartyCountry('all', 'All', '🌍'),
  PartyCountry('BD', 'Bangladesh', '🇧🇩'),
  PartyCountry('IN', 'India', '🇮🇳'),
  PartyCountry('PK', 'Pakistan', '🇵🇰'),
  PartyCountry('NP', 'Nepal', '🇳🇵'),
  PartyCountry('PH', 'Philippines', '🇵🇭'),
  PartyCountry('ID', 'Indonesia', '🇮🇩'),
];

/// Segmented tab identity (All / Video / Audio / Game).
enum PartyRoomTab { all, video, audio, game }
