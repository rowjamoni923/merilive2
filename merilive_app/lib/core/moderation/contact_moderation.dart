import 'package:supabase_flutter/supabase_flutter.dart';

import 'contact_detection.dart';

/// P0 #2 — Server-side violation pipeline wrapper.
///
/// Web-truth: `detectAndProcessViolation()` in `src/utils/contactDetection.ts`.
///
/// Rule (owner-locked, mirrored from web):
///   Violation pipeline fires ONLY when the SENDER is a real verified host
///   (profiles.is_host = true, NOT an agency owner, NOT a verified top-up
///   helper). Everyone else's messages flow through unmasked. On host
///   sender + detection, the server RPC `process_contact_violation` handles
///   the progressive beans deduction + ban escalation.
class ContactModeration {
  ContactModeration._();
  static final ContactModeration instance = ContactModeration._();

  final _client = Supabase.instance.client;

  /// Cache the sender's role lookup so repeated messages in the same
  /// session don't re-query. 5-min TTL — long enough for a live session,
  /// short enough that a role change (agency assignment) picks up.
  final Map<String, _RoleCache> _roleCache = {};
  static const _cacheTtl = Duration(minutes: 5);

  /// Result of running a message through moderation.
  Future<ModerationOutcome> check({
    required String senderId,
    required String message,
    required ViolationSource source,
    String? sourceId,
  }) async {
    final detection = detectContactInfo(message);
    if (!detection.hasViolation) return ModerationOutcome.clean;

    final isHost = await _isRestrictedHost(senderId);
    if (!isHost) {
      // Non-host (viewer / agency owner / helper) — allowed, no server hit.
      return ModerationOutcome.clean;
    }

    // Host sender: server-side beans deduction + ban escalation.
    try {
      final res = await _client.rpc(
        'process_contact_violation',
        params: {
          'p_host_id': senderId,
          'p_detected_content': detection.detectedContent,
          'p_detected_pattern': detection.pattern,
          'p_source_type': source.name,
          'p_source_id': sourceId,
        },
      );
      final data = res as Map?;
      return ModerationOutcome.blocked(
        detection: detection,
        violationNumber: (data?['violation_number'] as num?)?.toInt() ?? 1,
        beansDeducted:
            (data?['beans_deducted'] as num?)?.toInt() ?? 0,
        isBanned: data?['is_banned'] == true,
      );
    } catch (_) {
      // Even if the server call fails, we still block the send so peers
      // never see the contact info. Server side will catch up next time.
      return ModerationOutcome.blocked(detection: detection);
    }
  }

  Future<bool> _isRestrictedHost(String userId) async {
    final now = DateTime.now();
    final cached = _roleCache[userId];
    if (cached != null && now.difference(cached.at) < _cacheTtl) {
      return cached.isRestricted;
    }
    var restricted = false;
    try {
      final profile = await _client
          .from('profiles')
          .select('is_host, is_agency_owner')
          .eq('id', userId)
          .maybeSingle();
      final helper = await _client
          .from('topup_helpers')
          .select('id')
          .eq('user_id', userId)
          .eq('is_active', true)
          .eq('is_verified', true)
          .maybeSingle();
      final isHost = profile?['is_host'] == true;
      final isAgency = profile?['is_agency_owner'] == true;
      final isHelper = helper != null;
      restricted = isHost && !isAgency && !isHelper;
    } catch (_) {
      restricted = false;
    }
    _roleCache[userId] = _RoleCache(at: now, isRestricted: restricted);
    return restricted;
  }
}

enum ViolationSource { chat, live_stream, private_call, private_message }

class ModerationOutcome {
  final bool blocked;
  final DetectionResult? detection;
  final int violationNumber;
  final int beansDeducted;
  final bool isBanned;

  const ModerationOutcome._({
    required this.blocked,
    this.detection,
    this.violationNumber = 0,
    this.beansDeducted = 0,
    this.isBanned = false,
  });

  static const clean = ModerationOutcome._(blocked: false);

  factory ModerationOutcome.blocked({
    required DetectionResult detection,
    int violationNumber = 0,
    int beansDeducted = 0,
    bool isBanned = false,
  }) =>
      ModerationOutcome._(
        blocked: true,
        detection: detection,
        violationNumber: violationNumber,
        beansDeducted: beansDeducted,
        isBanned: isBanned,
      );
}

class _RoleCache {
  final DateTime at;
  final bool isRestricted;
  const _RoleCache({required this.at, required this.isRestricted});
}
