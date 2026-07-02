// R1 — Reels data models.
//
// Mirrors the row shapes returned by `src/pages/Reels.tsx` supabase queries so
// the Flutter feed can consume the same joins without renaming columns.
//
// Schema references (verified via information_schema on 2026-07-02):
//   public.reels: id, user_id, video_url, thumbnail_url, caption, category_id,
//     music_id, duration_seconds, view_count, like_count, comment_count,
//     share_count, beans_earned, music_title, music_artist, sound_id,
//     sound_title, sound_artist, sound_audio_url, is_original_sound,
//     is_featured, is_public, is_active, is_approved, created_at
//   public.reel_categories: id, name, slug, icon_url, display_order, is_active
//   public.reel_comments: id, reel_id, user_id, content, parent_id,
//     likes_count, is_active, created_at
//   public.reel_likes, reel_shares(platform, share_type), reel_views(date-bucketed),
//   public.saved_reels, public.reel_reports(reason, description, status).

import 'package:flutter/foundation.dart';

/// User summary joined into every reel row via `profiles_public`.
@immutable
class ReelUser {
  const ReelUser({
    required this.id,
    this.appUid,
    this.displayName,
    this.avatarUrl,
    this.userLevel,
    this.hostLevel,
    this.maxUserLevel,
    this.gender,
    this.isVerified = false,
    this.isHost = false,
    this.frameId,
    this.equippedFrameId,
  });

  final String id;
  final String? appUid;
  final String? displayName;
  final String? avatarUrl;
  final int? userLevel;
  final int? hostLevel;
  final int? maxUserLevel;
  final String? gender;
  final bool isVerified;
  final bool isHost;
  final String? frameId;
  final String? equippedFrameId;

  factory ReelUser.fromMap(Map<String, dynamic> map) {
    return ReelUser(
      id: map['id'] as String,
      appUid: map['app_uid'] as String?,
      displayName: map['display_name'] as String?,
      avatarUrl: map['avatar_url'] as String?,
      userLevel: (map['user_level'] as num?)?.toInt(),
      hostLevel: (map['host_level'] as num?)?.toInt(),
      maxUserLevel: (map['max_user_level'] as num?)?.toInt(),
      gender: map['gender'] as String?,
      isVerified: map['is_verified'] == true,
      isHost: map['is_host'] == true,
      frameId: map['frame_id'] as String?,
      equippedFrameId: map['equipped_frame_id'] as String?,
    );
  }

  ReelUser copyWith({bool? isVerified, bool? isHost, String? displayName}) {
    return ReelUser(
      id: id,
      appUid: appUid,
      displayName: displayName ?? this.displayName,
      avatarUrl: avatarUrl,
      userLevel: userLevel,
      hostLevel: hostLevel,
      maxUserLevel: maxUserLevel,
      gender: gender,
      isVerified: isVerified ?? this.isVerified,
      isHost: isHost ?? this.isHost,
      frameId: frameId,
      equippedFrameId: equippedFrameId,
    );
  }
}

@immutable
class Reel {
  const Reel({
    required this.id,
    required this.userId,
    required this.videoUrl,
    this.thumbnailUrl,
    this.caption,
    this.categoryId,
    this.durationSeconds,
    this.viewCount = 0,
    this.likeCount = 0,
    this.commentCount = 0,
    this.shareCount = 0,
    this.beansEarned = 0,
    this.musicTitle,
    this.musicArtist,
    this.soundId,
    this.soundTitle,
    this.soundArtist,
    this.soundAudioUrl,
    this.isOriginalSound = false,
    this.isFeatured = false,
    required this.createdAt,
    this.user,
    this.isLiked = false,
    this.isFollowing = false,
    this.isSaved = false,
  });

  final String id;
  final String userId;
  final String videoUrl;
  final String? thumbnailUrl;
  final String? caption;
  final String? categoryId;
  final int? durationSeconds;
  final int viewCount;
  final int likeCount;
  final int commentCount;
  final int shareCount;
  final int beansEarned;
  final String? musicTitle;
  final String? musicArtist;
  final String? soundId;
  final String? soundTitle;
  final String? soundArtist;
  final String? soundAudioUrl;
  final bool isOriginalSound;
  final bool isFeatured;
  final DateTime createdAt;
  final ReelUser? user;
  final bool isLiked;
  final bool isFollowing;
  final bool isSaved;

  factory Reel.fromMap(Map<String, dynamic> map) {
    final userMap = map['user'];
    return Reel(
      id: map['id'] as String,
      userId: map['user_id'] as String,
      videoUrl: map['video_url'] as String,
      thumbnailUrl: map['thumbnail_url'] as String?,
      caption: map['caption'] as String?,
      categoryId: map['category_id'] as String?,
      durationSeconds: (map['duration_seconds'] as num?)?.toInt(),
      viewCount: (map['view_count'] as num?)?.toInt() ?? 0,
      likeCount: (map['like_count'] as num?)?.toInt() ?? 0,
      commentCount: (map['comment_count'] as num?)?.toInt() ?? 0,
      shareCount: (map['share_count'] as num?)?.toInt() ?? 0,
      beansEarned: (map['beans_earned'] as num?)?.toInt() ?? 0,
      musicTitle: map['music_title'] as String?,
      musicArtist: map['music_artist'] as String?,
      soundId: map['sound_id'] as String?,
      soundTitle: map['sound_title'] as String?,
      soundArtist: map['sound_artist'] as String?,
      soundAudioUrl: map['sound_audio_url'] as String?,
      isOriginalSound: map['is_original_sound'] == true,
      isFeatured: map['is_featured'] == true,
      createdAt: DateTime.parse(map['created_at'] as String),
      user: userMap is Map<String, dynamic> ? ReelUser.fromMap(userMap) : null,
    );
  }

  Reel copyWith({
    int? likeCount,
    int? commentCount,
    int? shareCount,
    bool? isLiked,
    bool? isFollowing,
    bool? isSaved,
  }) {
    return Reel(
      id: id,
      userId: userId,
      videoUrl: videoUrl,
      thumbnailUrl: thumbnailUrl,
      caption: caption,
      categoryId: categoryId,
      durationSeconds: durationSeconds,
      viewCount: viewCount,
      likeCount: likeCount ?? this.likeCount,
      commentCount: commentCount ?? this.commentCount,
      shareCount: shareCount ?? this.shareCount,
      beansEarned: beansEarned,
      musicTitle: musicTitle,
      musicArtist: musicArtist,
      soundId: soundId,
      soundTitle: soundTitle,
      soundArtist: soundArtist,
      soundAudioUrl: soundAudioUrl,
      isOriginalSound: isOriginalSound,
      isFeatured: isFeatured,
      createdAt: createdAt,
      user: user,
      isLiked: isLiked ?? this.isLiked,
      isFollowing: isFollowing ?? this.isFollowing,
      isSaved: isSaved ?? this.isSaved,
    );
  }
}

@immutable
class ReelCategory {
  const ReelCategory({
    required this.id,
    required this.name,
    required this.slug,
    this.iconUrl,
    this.displayOrder = 0,
  });

  final String id;
  final String name;
  final String slug;
  final String? iconUrl;
  final int displayOrder;

  /// Sentinel "All" chip prepended to the category strip.
  static const ReelCategory all = ReelCategory(
    id: '__all__',
    name: 'All',
    slug: 'all',
    displayOrder: -1,
  );

  factory ReelCategory.fromMap(Map<String, dynamic> map) {
    return ReelCategory(
      id: map['id'] as String,
      name: map['name'] as String,
      slug: map['slug'] as String,
      iconUrl: map['icon_url'] as String?,
      displayOrder: (map['display_order'] as num?)?.toInt() ?? 0,
    );
  }
}

@immutable
class ReelComment {
  const ReelComment({
    required this.id,
    required this.reelId,
    required this.userId,
    required this.content,
    this.parentId,
    this.likesCount = 0,
    required this.createdAt,
    this.user,
  });

  final String id;
  final String reelId;
  final String userId;
  final String content;
  final String? parentId;
  final int likesCount;
  final DateTime createdAt;
  final ReelUser? user;

  factory ReelComment.fromMap(Map<String, dynamic> map) {
    final userMap = map['user'];
    return ReelComment(
      id: map['id'] as String,
      reelId: map['reel_id'] as String,
      userId: map['user_id'] as String,
      content: map['content'] as String,
      parentId: map['parent_id'] as String?,
      likesCount: (map['likes_count'] as num?)?.toInt() ?? 0,
      createdAt: DateTime.parse(map['created_at'] as String),
      user: userMap is Map<String, dynamic> ? ReelUser.fromMap(userMap) : null,
    );
  }
}
