import 'user_role.dart';

class ProfileModel {
  final String id;
  final String? username;
  final String? displayName;
  final String? bio;
  final String? avatarUrl;
  final String? coverUrl;
  final String countryCode;
  final String countryName;
  final String countryFlag;
  final int? age;
  final String? gender;
  final int coins;
  final int beans;
  final int diamonds;
  final bool isOnline;
  final bool isVerified;
  final bool isHost;
  final String? hostStatus;
  final String? hostAvailability;
  final int hostLevel;
  final int userLevel;
  final int totalEarnings;
  final int totalConsumption;
  final String? agencyId;
  final bool isAgencyOwner;
  final bool isBlocked;
  final String? appUid;
  final String? city;
  final bool isFaceVerified;
  final String? equippedFrameId;
  final String? equippedEntranceId;
  final String? equippedBubbleId;
  final String? equippedVehicleId;
  final String? equippedMedalId;
  final String? deviceId;
  final DateTime? createdAt;
  final DateTime? updatedAt;
  final String? language;
  final bool isTrader;
  final int traderLevel;
  final UserRole role;

  ProfileModel({
    required this.id,
    this.username,
    this.displayName,
    this.bio,
    this.avatarUrl,
    this.coverUrl,
    this.countryCode = 'BD',
    this.countryName = 'বাংলাদেশ',
    this.countryFlag = '🇧🇩',
    this.age,
    this.gender,
    this.coins = 0,
    this.beans = 0,
    this.diamonds = 0,
    this.isOnline = false,
    this.isVerified = false,
    this.isHost = false,
    this.hostStatus,
    this.hostAvailability,
    this.hostLevel = 1,
    this.userLevel = 0,
    this.totalEarnings = 0,
    this.totalConsumption = 0,
    this.agencyId,
    this.isAgencyOwner = false,
    this.isBlocked = false,
    this.appUid,
    this.city,
    this.isFaceVerified = false,
    this.equippedFrameId,
    this.equippedEntranceId,
    this.equippedBubbleId,
    this.equippedVehicleId,
    this.equippedMedalId,
    this.deviceId,
    this.createdAt,
    this.updatedAt,
    this.language = 'English',
    this.isTrader = false,
    this.traderLevel = 0,
    this.role = UserRole.user,
  });

  factory ProfileModel.fromJson(Map<String, dynamic> json) {
    return ProfileModel(
      id: json['id'] ?? '',
      username: json['username'],
      displayName: json['display_name'] ?? 'User ${json['app_uid'] ?? ''}',
      bio: json['bio'],
      avatarUrl: json['avatar_url'],
      coverUrl: json['cover_url'],
      countryCode: json['country_code'] ?? 'BD',
      countryName: json['country_name'] ?? 'বাংলাদেশ',
      countryFlag: json['country_flag'] ?? '🇧🇩',
      age: json['age'],
      gender: json['gender'],
      coins: json['coin_balance'] ?? json['coins'] ?? 0,
      beans: json['beans_balance'] ?? json['beans'] ?? 0,
      diamonds: json['diamond_balance'] ?? json['diamonds'] ?? 0,
      isOnline: json['is_online'] ?? false,
      isVerified: json['is_verified'] ?? false,
      isHost: json['is_host'] ?? false,
      hostStatus: json['host_status'],
      hostAvailability: json['host_availability'],
      hostLevel: json['host_level'] ?? 1,
      userLevel: json['user_level'] ?? json['level'] ?? 1,
      totalEarnings: (json['total_earnings'] as num?)?.toInt() ?? 0,
      totalConsumption: (json['total_consumption'] as num?)?.toInt() ?? 0,
      agencyId: json['agency_id'],
      isAgencyOwner: json['is_agency_owner'] ?? false,
      isBlocked: json['is_blocked'] ?? false,
      appUid: json['app_uid']?.toString(),
      city: json['city'],
      isFaceVerified: json['is_face_verified'] ?? false,
      equippedFrameId: json['equipped_frame_id'],
      equippedEntranceId: json['equipped_entrance_id'],
      equippedBubbleId: json['equipped_bubble_id'],
      equippedVehicleId: json['equipped_vehicle_id'],
      equippedMedalId: json['equipped_medal_id'],
      deviceId: json['device_id'],
      createdAt: json['created_at'] != null ? DateTime.parse(json['created_at']) : null,
      updatedAt: json['updated_at'] != null ? DateTime.parse(json['updated_at']) : null,
      language: json['language'] ?? 'English',
      isTrader: json['is_trader'] ?? false,
      traderLevel: json['trader_level'] ?? 0,
      role: _calculateRole(json),
    );
  }

  static UserRole _calculateRole(Map<String, dynamic> json) {
    if (json['is_agency_owner'] == true) return UserRole.agency;
    if (json['is_host'] == true && json['gender']?.toString().toLowerCase() == 'female') return UserRole.host;
    // Trader detection usually requires a separate check, but for now we'll check a flag if available
    if (json['is_trader'] == true) return UserRole.trader; 
    return UserRole.user;
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'username': username,
      'display_name': displayName,
      'bio': bio,
      'avatar_url': avatarUrl,
      'cover_url': coverUrl,
      'country_code': countryCode,
      'country_name': countryName,
      'country_flag': countryFlag,
      'age': age,
      'gender': gender,
      'coins': coins,
      'beans': beans,
      'diamonds': diamonds,
      'is_online': isOnline,
      'is_verified': isVerified,
      'is_host': isHost,
      'host_status': hostStatus,
      'host_availability': hostAvailability,
      'host_level': hostLevel,
      'user_level': userLevel,
      'total_earnings': totalEarnings,
      'total_consumption': totalConsumption,
      'agency_id': agencyId,
      'is_agency_owner': isAgencyOwner,
      'is_blocked': isBlocked,
      'app_uid': appUid,
      'city': city,
      'is_face_verified': isFaceVerified,
      'equipped_frame_id': equippedFrameId,
      'equipped_entrance_id': equippedEntranceId,
      'equipped_bubble_id': equippedBubbleId,
      'equipped_vehicle_id': equippedVehicleId,
      'equipped_medal_id': equippedMedalId,
      'device_id': deviceId,
      'language': language,
      'is_trader': isTrader,
      'trader_level': traderLevel,
    };
  }
}


