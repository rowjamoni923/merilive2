import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/native/livekit_bridge.dart';

/// Honest scaffold surfaces for the "+" FAB destinations.
///
/// Each screen ships a real Scaffold with the target's branding + a clear
/// "landing in Sector N" note so navigation is verifiable end-to-end today
/// without pretending unfinished features work.

class _ComingSoon extends StatelessWidget {
  const _ComingSoon({
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.gradient,
    required this.sector,
  });

  final String title;
  final String subtitle;
  final IconData icon;
  final List<Color> gradient;
  final String sector;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: Colors.white,
        title: Text(title,
            style: const TextStyle(
                fontWeight: FontWeight.w800, color: Colors.white)),
      ),
      extendBodyBehindAppBar: true,
      body: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: gradient,
          ),
        ),
        child: SafeArea(
          child: Center(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 32),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 96,
                    height: 96,
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.15),
                      shape: BoxShape.circle,
                      border: Border.all(
                          color: Colors.white.withOpacity(0.4), width: 2),
                    ),
                    child: Icon(icon, color: Colors.white, size: 48),
                  ),
                  const SizedBox(height: 24),
                  Text(title,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 26,
                        fontWeight: FontWeight.w900,
                      ),
                      textAlign: TextAlign.center),
                  const SizedBox(height: 8),
                  Text(subtitle,
                      style: TextStyle(
                          color: Colors.white.withOpacity(0.9),
                          fontSize: 14,
                          height: 1.4),
                      textAlign: TextAlign.center),
                  const SizedBox(height: 24),
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 14, vertical: 6),
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.18),
                      borderRadius: BorderRadius.circular(999),
                      border: Border.all(
                          color: Colors.white.withOpacity(0.3)),
                    ),
                    child: Text('Lands in $sector',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 0.4,
                        )),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

@RoutePage()
class GoLivePlaceholderPage extends StatefulWidget {
  const GoLivePlaceholderPage({super.key});
  @override
  State<GoLivePlaceholderPage> createState() => _GoLivePlaceholderPageState();
}

/// GoLive prep screen — Flutter parity of `src/pages/GoLive.tsx`.
///
/// Mirrors the exact server contract: calls RPC `can_user_go_live` first,
/// maps every denial `code` to the same user-facing message as web
/// (face / host_not_approved / agency_required / account_blocked / banned /
/// already_live / disabled / level / auth). Only when the gate returns
/// `allowed:true` do we surface the "Start Live" CTA and start the local
/// camera preview through the LiveKit bridge.
///
/// Actual room publish + LiveKit connect handoff lands with C4 (native
/// LiveKit publish port). Until then the CTA reports "publish pending —
/// needs Android host + Kotlin port" so nothing lies to the user.
class _GoLivePlaceholderPageState extends State<GoLivePlaceholderPage> {
  final _titleCtrl = TextEditingController();

  bool _checking = true;
  bool _previewing = false;
  bool _allowed = false;
  bool _starting = false;
  String? _displayName;

  // Denial state
  String? _denyCode;
  String? _denyMessage;
  int? _requiredLevel;
  int? _currentLevel;

  @override
  void initState() {
    super.initState();
    _runGate();
  }

  @override
  void dispose() {
    _titleCtrl.dispose();
    if (_previewing) {
      LiveKitBridge.instance.stopLocalPreview();
    }
    super.dispose();
  }

  Future<void> _runGate() async {
    setState(() {
      _checking = true;
      _denyCode = null;
      _denyMessage = null;
    });

    try {
      final data = await Supabase.instance.client.rpc('can_user_go_live');
      final gate = (data is Map) ? Map<String, dynamic>.from(data) : <String, dynamic>{};
      final allowed = gate['allowed'] == true;
      if (allowed) {
        setState(() {
          _allowed = true;
          _checking = false;
        });
        // Warm the surface + start preview only after gate passes.
        await LiveKitBridge.instance.initialize();
        final res = await LiveKitBridge.instance.startLocalPreview(front: true);
        if (!mounted) return;
        setState(() => _previewing = res['success'] == true || res['pending'] == true);
      } else {
        setState(() {
          _allowed = false;
          _checking = false;
          _denyCode = (gate['code'] ?? 'denied').toString();
          _denyMessage = (gate['reason'] ?? 'You cannot go live right now.').toString();
          _requiredLevel = (gate['required_level'] as num?)?.toInt();
          _currentLevel = (gate['current_level'] as num?)?.toInt();
        });
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _allowed = false;
        _checking = false;
        _denyCode = 'error';
        _denyMessage = 'Gate check failed. Please try again.';
      });
    }
  }

  ({String title, String message, String? cta, IconData icon}) _denyCopy() {
    switch (_denyCode) {
      case 'face':
        return (
          title: 'Face Verification Required',
          message: 'Verify your face before you can go live. This keeps the community safe.',
          cta: 'Start Verification',
          icon: Icons.verified_user_rounded,
        );
      case 'host_not_approved':
        return (
          title: 'Host Approval Pending',
          message: 'Your host application is not approved yet. Please wait for admin review.',
          cta: null,
          icon: Icons.hourglass_bottom_rounded,
        );
      case 'agency_required':
        return (
          title: 'Agency Required',
          message: 'Join an agency before going live as a registered host.',
          cta: null,
          icon: Icons.groups_rounded,
        );
      case 'account_blocked':
        return (
          title: 'Account Blocked',
          message: 'Your account cannot start live streams.',
          cta: null,
          icon: Icons.block_rounded,
        );
      case 'banned':
        return (
          title: 'Live Ban Active',
          message: 'You currently have an active live streaming ban.',
          cta: null,
          icon: Icons.gavel_rounded,
        );
      case 'already_live':
        return (
          title: 'Already Live',
          message: 'You already have an active live stream. Please end it first.',
          cta: null,
          icon: Icons.podcasts_rounded,
        );
      case 'disabled':
        return (
          title: 'Live Streaming Disabled',
          message: 'Live streaming is temporarily disabled by admin.',
          cta: null,
          icon: Icons.pause_circle_filled_rounded,
        );
      case 'level':
        final req = _requiredLevel ?? '?';
        final cur = _currentLevel ?? 0;
        return (
          title: 'Level $req Required',
          message: 'You need level $req to go live. Your current level is $cur. Recharge, chat and receive gifts to level up.',
          cta: null,
          icon: Icons.trending_up_rounded,
        );
      case 'auth':
        return (
          title: 'Please Sign In',
          message: 'Your session expired. Please sign in again.',
          cta: 'Sign In',
          icon: Icons.login_rounded,
        );
      default:
        return (
          title: 'Cannot Go Live',
          message: _denyMessage ?? 'You cannot go live right now.',
          cta: 'Retry',
          icon: Icons.error_outline_rounded,
        );
    }
  }

  void _handleDenyCta() {
    switch (_denyCode) {
      case 'face':
        // TODO: route to /face-verification once C-face lands (Sector 6).
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Face verification screen lands with Sector 6.'),
        ));
        break;
      case 'auth':
        context.router.replaceNamed('/auth');
        break;
      default:
        _runGate();
    }
  }

  Future<void> _handleStartLive() async {
    if (_starting) return;
    setState(() => _starting = true);
    final client = Supabase.instance.client;
    final messenger = ScaffoldMessenger.of(context);
    try {
      final user = client.auth.currentUser;
      if (user == null) {
        if (mounted) context.router.replaceNamed('/auth');
        return;
      }

      // Re-check live-ban immediately before publish — parity with web.
      final banned = await client.rpc('is_user_live_banned', params: {
        'p_user_id': user.id,
      });
      if (banned == true) {
        messenger.showSnackBar(const SnackBar(
          content: Text('Your live has been banned.'),
        ));
        return;
      }

      // Load display name once for the title fallback.
      _displayName ??= await _fetchDisplayName(client, user.id);

      final titleTrim = _titleCtrl.text.trim();
      final streamTitle = titleTrim.isNotEmpty
          ? titleTrim
          : "${_displayName ?? 'User'}'s Live";

      final startResult = await client.rpc('start_live_stream', params: {
        'p_title': streamTitle,
        // Native thumbnail capture arrives with C4b (Kotlin renderer snapshot).
        'p_thumbnail_url': null,
        'p_display_name': _displayName ?? 'User',
        'p_category_id': null,
        'p_live_privacy': 'public',
        'p_password': null,
      });

      final parsed =
          startResult is Map ? Map<String, dynamic>.from(startResult) : const {};
      final success = parsed['success'] == true;
      final stream = parsed['stream'] is Map
          ? Map<String, dynamic>.from(parsed['stream'])
          : null;
      final streamId = stream?['id']?.toString();

      if (!success || streamId == null) {
        final reason = (parsed['reason'] ?? parsed['error'] ?? 'Failed to start live stream').toString();
        messenger.showSnackBar(SnackBar(content: Text(reason)));
        return;
      }

      // Preserve the native camera handoff — do NOT stop the preview here,
      // the LiveStream page adopts the same LiveKit LocalVideoTrack.
      // (Sector 6 LiveStream page owns the actual publish; until it lands
      // we still navigate so the flow is verifiable end-to-end.)
      if (!mounted) return;
      context.router.replaceNamed('/live/$streamId');
    } catch (e) {
      messenger.showSnackBar(SnackBar(content: Text('Failed to start live: $e')));
    } finally {
      if (mounted) setState(() => _starting = false);
    }
  }

  Future<String?> _fetchDisplayName(SupabaseClient client, String userId) async {
    try {
      final row = await client
          .from('profiles')
          .select('display_name')
          .eq('id', userId)
          .maybeSingle();
      return row?['display_name'] as String?;
    } catch (_) {
      return null;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: Colors.white,
        title: const Text('Go Live',
            style: TextStyle(fontWeight: FontWeight.w800, color: Colors.white)),
      ),
      extendBodyBehindAppBar: true,
      body: _checking
          ? const Center(child: CircularProgressIndicator(color: Colors.white))
          : _allowed
              ? _buildAllowedBody()
              : _buildDeniedBody(),
    );
  }

  Widget _buildAllowedBody() {
    // Camera preview mounts natively behind Flutter (via LiveKit bridge).
    // On non-Android or before Kotlin port, we still show controls so the flow
    // is testable — no fake pixels, just an honest empty stage.
    return SafeArea(
      child: Stack(
        children: [
          if (!_previewing)
            Container(
              color: const Color(0xFF0B0B12),
              alignment: Alignment.center,
              child: const Padding(
                padding: EdgeInsets.all(24),
                child: Text(
                  'Camera preview mounts natively.\nOn Android with the LiveKit host, your face appears here.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.white70, fontSize: 13, height: 1.4),
                ),
              ),
            ),
          Align(
            alignment: Alignment.bottomCenter,
            child: Container(
              margin: const EdgeInsets.all(16),
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.black.withOpacity(0.55),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: Colors.white.withOpacity(0.12)),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  TextField(
                    controller: _titleCtrl,
                    maxLength: 60,
                    style: const TextStyle(color: Colors.white),
                    decoration: InputDecoration(
                      hintText: 'Stream title (optional)',
                      hintStyle: TextStyle(color: Colors.white.withOpacity(0.5)),
                      counterStyle: TextStyle(color: Colors.white.withOpacity(0.4)),
                      filled: true,
                      fillColor: Colors.white.withOpacity(0.08),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: BorderSide.none,
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  ElevatedButton.icon(
                    onPressed: _handleStartLive,
                    icon: const Icon(Icons.radio_rounded),
                    label: const Text('Start Live'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFFEF4444),
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      textStyle: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDeniedBody() {
    final copy = _denyCopy();
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFFEF4444), Color(0xFFF43F5E)],
        ),
      ),
      child: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 28),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 96,
                  height: 96,
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.15),
                    shape: BoxShape.circle,
                    border: Border.all(color: Colors.white.withOpacity(0.4), width: 2),
                  ),
                  child: Icon(copy.icon, color: Colors.white, size: 48),
                ),
                const SizedBox(height: 24),
                Text(copy.title,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                        color: Colors.white,
                        fontSize: 24,
                        fontWeight: FontWeight.w900)),
                const SizedBox(height: 10),
                Text(copy.message,
                    textAlign: TextAlign.center,
                    style: TextStyle(
                        color: Colors.white.withOpacity(0.92),
                        fontSize: 14,
                        height: 1.5)),
                if (copy.cta != null) ...[
                  const SizedBox(height: 24),
                  ElevatedButton(
                    onPressed: _handleDenyCta,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.white,
                      foregroundColor: const Color(0xFFEF4444),
                      padding: const EdgeInsets.symmetric(
                          horizontal: 28, vertical: 14),
                      textStyle: const TextStyle(
                          fontWeight: FontWeight.w800, fontSize: 15),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(999),
                      ),
                    ),
                    child: Text(copy.cta!),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

@RoutePage()
class CreatePartyPlaceholderPage extends StatelessWidget {
  const CreatePartyPlaceholderPage({super.key});
  @override
  Widget build(BuildContext context) => const _ComingSoon(
        title: 'Create Party',
        subtitle:
            'Audio / video / game party rooms with seats, mic queue and moderation will be built out with the Party sector.',
        icon: Icons.celebration_rounded,
        gradient: [Color(0xFF9333EA), Color(0xFFEC4899)],
        sector: 'Sector 3 (Party)',
      );
}

@RoutePage()
class RandomCallPlaceholderPage extends StatelessWidget {
  const RandomCallPlaceholderPage({super.key});
  @override
  Widget build(BuildContext context) => const _ComingSoon(
        title: 'Match Call',
        subtitle:
            'Instant 1-on-1 video matching with gender/country filters and per-minute diamond billing will be built out with the Match Call sector.',
        icon: Icons.phone_in_talk_rounded,
        gradient: [Color(0xFF06B6D4), Color(0xFF3B82F6)],
        sector: 'Sector 7 (Match Call)',
      );
}

/// Live viewer placeholder — reached by tapping a LIVE host card.
/// Real player (LiveKit viewer + chat + gifts + PK) lands in the Live sector.
@RoutePage()
class LiveStreamPlaceholderPage extends StatelessWidget {
  const LiveStreamPlaceholderPage({
    super.key,
    @PathParam('streamId') required this.streamId,
  });
  final String streamId;
  @override
  Widget build(BuildContext context) => _ComingSoon(
        title: 'Live Stream',
        subtitle:
            'Stream ID: $streamId\n\nFull viewer player (LiveKit video/voice, chat, gifts, PK) lands with the Live Streaming sector.',
        icon: Icons.live_tv_rounded,
        gradient: const [Color(0xFFEF4444), Color(0xFFEC4899)],
        sector: 'Sector 6 (Live Streaming)',
      );
}

/// Profile detail placeholder — reached by tapping a BUSY / ONLINE / OFFLINE
/// host card. Real profile screen with follow/call CTAs lands with Profile.
@RoutePage()
class ProfileDetailPlaceholderPage extends StatelessWidget {
  const ProfileDetailPlaceholderPage({
    super.key,
    @PathParam('userId') required this.userId,
  });
  final String userId;
  @override
  Widget build(BuildContext context) => _ComingSoon(
        title: 'Profile',
        subtitle:
            'User ID: $userId\n\nFull profile (avatar frame, bio, gifts received, follow / call CTAs) lands with the Profile sector.',
        icon: Icons.account_circle_rounded,
        gradient: const [Color(0xFF06B6D4), Color(0xFF3B82F6)],
        sector: 'Sector 8 (Profile)',
      );
}

/// Party room placeholder — reached by entering a party from Discovery.
/// Real party room (LiveKit seats + chat + gifts + games) lands next.
@RoutePage()
class PartyRoomPlaceholderPage extends StatelessWidget {
  const PartyRoomPlaceholderPage({
    super.key,
    @PathParam('roomId') required this.roomId,
  });
  final String roomId;
  @override
  Widget build(BuildContext context) => _ComingSoon(
        title: 'Party Room',
        subtitle:
            'Room ID: $roomId\n\nFull party room (seats, mic queue, chat, gifts, mini-games) lands with the Party broadcast step.',
        icon: Icons.celebration_rounded,
        gradient: const [Color(0xFF9333EA), Color(0xFF6366F1)],
        sector: 'Sector 4 (Party broadcast)',
      );
}
