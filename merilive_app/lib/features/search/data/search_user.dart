/// Row shape returned by `profiles_public` for the search results list.
/// Mirrors `UserProfile` in `src/pages/SearchUsers.tsx`.
class SearchUser {
  const SearchUser({
    required this.id,
    this.displayName,
    this.username,
    this.avatarUrl,
    this.isOnline,
    this.isVerified,
    this.isHost,
    this.countryFlag,
    this.bio,
    this.tags,
    this.appUid,
    this.userLevel,
    this.hostLevel,
  });

  final String id;
  final String? displayName;
  final String? username;
  final String? avatarUrl;
  final bool? isOnline;
  final bool? isVerified;
  final bool? isHost;
  final String? countryFlag;
  final String? bio;
  final List<String>? tags;
  final String? appUid;
  final int? userLevel;
  final int? hostLevel;

  String get bestName {
    final n = (displayName ?? '').trim();
    if (n.isNotEmpty) return n;
    final u = (username ?? '').trim();
    if (u.isNotEmpty) return u;
    return 'User';
  }

  factory SearchUser.fromRow(Map<String, dynamic> row) {
    List<String>? tagsList;
    final rawTags = row['tags'];
    if (rawTags is List) {
      tagsList = rawTags.map((e) => e.toString()).toList(growable: false);
    }
    return SearchUser(
      id: row['id'] as String,
      displayName: row['display_name'] as String?,
      username: row['username'] as String?,
      avatarUrl: row['avatar_url'] as String?,
      isOnline: row['is_online'] as bool?,
      isVerified: row['is_verified'] as bool?,
      isHost: row['is_host'] as bool?,
      countryFlag: row['country_flag'] as String?,
      bio: row['bio'] as String?,
      tags: tagsList,
      appUid: row['app_uid'] as String?,
      userLevel: (row['user_level'] as num?)?.toInt(),
      hostLevel: (row['host_level'] as num?)?.toInt(),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'display_name': displayName,
        'username': username,
        'avatar_url': avatarUrl,
        'is_online': isOnline,
        'is_verified': isVerified,
        'is_host': isHost,
        'country_flag': countryFlag,
        'bio': bio,
        'tags': tags,
        'app_uid': appUid,
        'user_level': userLevel,
        'host_level': hostLevel,
      };

  factory SearchUser.fromJson(Map<String, dynamic> j) => SearchUser.fromRow(j);
}
