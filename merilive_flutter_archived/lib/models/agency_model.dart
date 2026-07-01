import 'profile_model.dart';

class AgencyModel {
  final String id;
  final String name;
  final String ownerId;
  final String agencyCode;
  final String level;
  final double commissionRate;
  final double walletBalance;
  final DateTime createdAt;
  final bool isActive;
  final int totalHosts;
  final int totalAgents;
  final bool isBlocked;
  final String? blockedReason;
  final String? logoUrl;
  final String? email;
  final String? whatsappNumber;
  final String? parentAgencyId;
  final ProfileModel? owner;
  final AgencyModel? parentAgency;

  AgencyModel({
    required this.id,
    required this.name,
    required this.ownerId,
    required this.agencyCode,
    required this.level,
    required this.commissionRate,
    required this.walletBalance,
    required this.createdAt,
    required this.isActive,
    this.totalHosts = 0,
    this.totalAgents = 0,
    this.isBlocked = false,
    this.blockedReason,
    this.logoUrl,
    this.email,
    this.whatsappNumber,
    this.parentAgencyId,
    this.owner,
    this.parentAgency,
  });

  factory AgencyModel.fromJson(Map<String, dynamic> json) {
    return AgencyModel(
      id: json['id'] ?? '',
      name: json['name'] ?? 'Meri Agency',
      ownerId: json['owner_id'] ?? '',
      agencyCode: json['agency_code'] ?? '',
      level: json['level'] ?? 'A1',
      commissionRate: (json['commission_rate'] as num?)?.toDouble() ?? 12.0,
      walletBalance: (json['wallet_balance'] as num?)?.toDouble() ?? 0.0,
      createdAt: json['created_at'] != null 
          ? DateTime.parse(json['created_at']) 
          : DateTime.now(),
      isActive: json['is_active'] ?? true,
      totalHosts: json['total_hosts'] ?? 0,
      totalAgents: json['total_agents'] ?? 0,
      isBlocked: json['is_blocked'] ?? false,
      blockedReason: json['blocked_reason'],
      logoUrl: json['logo_url'],
      email: json['email'],
      whatsappNumber: json['whatsapp_number'],
      parentAgencyId: json['parent_agency_id'],
      owner: json['owner'] != null ? ProfileModel.fromJson(json['owner']) : null,
      parentAgency: json['parent_agency'] != null ? AgencyModel.fromJson(json['parent_agency']) : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'owner_id': ownerId,
      'agency_code': agencyCode,
      'level': level,
      'commission_rate': commissionRate,
      'wallet_balance': walletBalance,
      'created_at': createdAt.toIso8601String(),
      'is_active': isActive,
      'total_hosts': totalHosts,
      'total_agents': totalAgents,
      'is_blocked': isBlocked,
      'blocked_reason': blockedReason,
      'logo_url': logoUrl,
      'email': email,
      'whatsapp_number': whatsappNumber,
      'parent_agency_id': parentAgencyId,
    };
  }
}


