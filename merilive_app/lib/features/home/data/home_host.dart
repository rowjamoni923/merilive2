import 'package:equatable/equatable.dart';

/// Server-derived presence status for a host card.
///
/// Web parity (`src/pages/Index.tsx`):
///   • LIVE   — has an active live_stream_id (top of feed).
///   • BUSY   — verified female host + online + not live/party + is_in_call.
///   • ONLINE — verified female host + last_seen_at ≥ now-5m + not live/busy.
///   • OFFLINE— everyone else (still shown at the bottom of Popular).
enum HostStatus { live, busy, online, offline }

class HomeHost extends Equatable {
  const HomeHost({
    required this.id,
    required this.displayName,
    required this.username,
    required this.avatarUrl,
    required this.countryCode,
    required this.countryFlag,
    required this.userLevel,
    required this.hostLevel,
    required this.isLive,
    required this.isInCall,
    required this.isOnline,
    required this.isInParty,
    required this.isFaceVerified,
    required this.callRatePerMinute,
    required this.liveStreamId,
    required this.liveThumbnailUrl,
    required this.liveViewerCount,
    required this.liveStartedAt,
    required this.activePartyRoomId,
    required this.lastSeenAt,
    required this.status,
  });

  final String id;
  final String displayName;
  final String? username;
  final String? avatarUrl;
  final String? countryCode;
  final String? countryFlag;
  final int userLevel;
  final int hostLevel;
  final bool isLive;
  final bool isInCall;
  final bool isOnline;
  final bool isInParty;
  final bool isFaceVerified;
  final int? callRatePerMinute;
  final String? liveStreamId;
  final String? liveThumbnailUrl;
  final int liveViewerCount;
  final DateTime? liveStartedAt;
  final String? activePartyRoomId;
  final DateTime? lastSeenAt;
  final HostStatus status;

  static DateTime? _parseDate(dynamic v) {
    if (v == null) return null;
    if (v is String && v.isEmpty) return null;
    return DateTime.tryParse(v.toString());
  }

  factory HomeHost.fromRow(Map<String, dynamic> row) {
    final isLive = row['live_stream_id'] != null;
    final isInCall = row['is_in_call'] == true;
    final isOnline = row['is_online'] == true;
    final isInParty = row['is_in_party'] == true;

    HostStatus status;
    if (isLive) {
      status = HostStatus.live;
    } else if (isInCall) {
      status = HostStatus.busy;
    } else if (isOnline || isInParty) {
      status = HostStatus.online;
    } else {
      status = HostStatus.offline;
    }

    return HomeHost(
      id: row['id'].toString(),
      displayName: (row['display_name'] as String?) ??
          (row['username'] as String?) ??
          'Host',
      username: row['username'] as String?,
      avatarUrl: row['avatar_url'] as String?,
      countryCode: row['country_code'] as String?,
      countryFlag: row['country_flag'] as String?,
      userLevel: (row['user_level'] as num?)?.toInt() ?? 0,
      hostLevel: (row['host_level'] as num?)?.toInt() ?? 0,
      isLive: isLive,
      isInCall: isInCall,
      isOnline: isOnline,
      isInParty: isInParty,
      isFaceVerified: row['is_face_verified'] == true,
      callRatePerMinute: (row['call_rate_per_minute'] as num?)?.toInt(),
      liveStreamId: row['live_stream_id']?.toString(),
      liveThumbnailUrl: row['live_thumbnail_url'] as String?,
      liveViewerCount: (row['live_viewer_count'] as num?)?.toInt() ?? 0,
      liveStartedAt: _parseDate(row['live_started_at']),
      activePartyRoomId: row['active_party_room_id']?.toString(),
      lastSeenAt: _parseDate(row['last_seen_at']),
      status: status,
    );
  }

  @override
  List<Object?> get props => [
        id,
        status,
        isLive,
        isInCall,
        isOnline,
        isInParty,
        liveStreamId,
        liveViewerCount,
        activePartyRoomId,
        lastSeenAt,
      ];
}
