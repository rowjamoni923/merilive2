import 'profile_model.dart';

/// MeriLive Agency-Host membership — `public.agency_hosts` table.
class AgencyHostModel {
  final String id;
  final String agencyId;
  final String hostId;
  final String status; // active | left
  final String? joinedVia; // referral_code | invite | direct
  final String? referralCode;
  final DateTime? joinedAt;
  final DateTime? leftAt;
  final ProfileModel? host;

  AgencyHostModel({
    required this.id,
    required this.agencyId,
    required this.hostId,
    this.status = 'active',
    this.joinedVia,
    this.referralCode,
    this.joinedAt,
    this.leftAt,
    this.host,
  });

  factory AgencyHostModel.fromJson(Map<String, dynamic> json) {
    return AgencyHostModel(
      id: json['id'] ?? '',
      agencyId: json['agency_id'] ?? '',
      hostId: json['host_id'] ?? '',
      status: json['status'] ?? 'active',
      joinedVia: json['joined_via'],
      referralCode: json['referral_code'],
      joinedAt: json['joined_at'] != null ? DateTime.tryParse(json['joined_at']) : null,
      leftAt: json['left_at'] != null ? DateTime.tryParse(json['left_at']) : null,
      host: json['host'] is Map ? ProfileModel.fromJson(Map<String, dynamic>.from(json['host'])) : null,
    );
  }
}
