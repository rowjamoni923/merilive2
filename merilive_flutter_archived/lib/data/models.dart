import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class Agency {
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
  final Map<String, dynamic>? owner;
  final Map<String, dynamic>? parentAgency; // New field from web join

  Agency({
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

  factory Agency.fromJson(Map<String, dynamic> json) {
    return Agency(
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
      owner: json['owner'],
      parentAgency: json['parent_agency'],
    );
  }
}

class AgencyHost {
  final String id;
  final String userId;
  final String agencyId;
  final String status;
  final double commissionRate;
  final DateTime joinedAt;
  final Map<String, dynamic>? profile;

  AgencyHost({
    required this.id,
    required this.userId,
    required this.agencyId,
    required this.status,
    required this.commissionRate,
    required this.joinedAt,
    this.profile,
  });

  factory AgencyHost.fromJson(Map<String, dynamic> json) {
    return AgencyHost(
      id: json['id'] ?? '',
      userId: json['user_id'] ?? '',
      agencyId: json['agency_id'] ?? '',
      status: json['status'] ?? 'pending',
      commissionRate: (json['commission_rate'] as num?)?.toDouble() ?? 12.0,
      joinedAt: json['joined_at'] != null 
          ? DateTime.parse(json['joined_at']) 
          : DateTime.now(),
      profile: json['profile'],
    );
  }
}

class AgencyWithdrawal {
  final String id;
  final String agencyId;
  final double amount;
  final String status;
  final String method;
  final String? accountInfo;
  final DateTime createdAt;

  AgencyWithdrawal({
    required this.id,
    required this.agencyId,
    required this.amount,
    required this.status,
    required this.method,
    this.accountInfo,
    required this.createdAt,
  });

  factory AgencyWithdrawal.fromJson(Map<String, dynamic> json) {
    return AgencyWithdrawal(
      id: json['id'] ?? '',
      agencyId: json['agency_id'] ?? '',
      amount: (json['amount'] as num?)?.toDouble() ?? 0.0,
      status: json['status'] ?? 'pending',
      method: json['method'] ?? 'bank',
      accountInfo: json['account_info'],
      createdAt: json['created_at'] != null 
          ? DateTime.parse(json['created_at']) 
          : DateTime.now(),
    );
  }
}


