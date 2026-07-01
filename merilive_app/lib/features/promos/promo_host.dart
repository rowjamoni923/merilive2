import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'data/event_popup_repository.dart';
import 'data/promo_models.dart';
import 'data/rating_reward_repository.dart';
import 'promo_coordinator.dart';
import 'widgets/event_popup_overlay.dart';
import 'widgets/rating_reward_overlay.dart';

/// App-wide host that decides which full-screen promo (if any) to render.
///
/// Priority order — identical to the web coordinator:
///   1. Event popup (`popup_event_banners`) — shows first if a row is active.
///      Rating promo waits for its dismissal.
///   2. Rating reward promo (`rating_banners`) — shows after a 20–40s delay
///      once the user is authenticated and has no existing claim row.
///
/// Mount this inside a [Stack] near the top of the app shell. It renders
/// nothing until data resolves, then overlays a full-screen [Positioned.fill].
class PromoHost extends StatefulWidget {
  const PromoHost({super.key});

  @override
  State<PromoHost> createState() => _PromoHostState();
}

class _PromoHostState extends State<PromoHost> {
  final _client = Supabase.instance.client;
  late final _eventRepo = EventPopupRepository(_client);
  late final _ratingRepo = RatingRewardRepository(_client);

  EventPopupBannerRow? _activeEvent;
  String? _activeRatingImage;
  StreamSubscription<AuthState>? _authSub;
  Timer? _ratingDelayTimer;

  @override
  void initState() {
    super.initState();
    _bootstrap();
    _authSub = _client.auth.onAuthStateChange.listen((s) {
      if (s.event == AuthChangeEvent.signedIn) _bootstrap();
    });
  }

  Future<void> _bootstrap() async {
    // Only run if a user session exists — web behavior.
    final session = _client.auth.currentSession;
    if (session == null) return;
    await _tryShowEventPopup();
    _scheduleRatingPromo();
  }

  Future<void> _tryShowEventPopup() async {
    if (PromoCoordinator.instance.eventPopupShown) return;
    try {
      final banner = await _eventRepo.fetchActive();
      if (banner == null || !mounted) return;
      PromoCoordinator.instance.eventPopupShown = true;
      setState(() => _activeEvent = banner);
    } catch (_) {/* silent — matches web try/catch */}
  }

  void _scheduleRatingPromo() {
    if (PromoCoordinator.instance.ratingPromoShown) return;
    _ratingDelayTimer?.cancel();
    // 20–40s random delay so new users actually see it before closing.
    final delayMs = 20000 + Random().nextInt(20001);
    _ratingDelayTimer = Timer(Duration(milliseconds: delayMs), () async {
      if (!mounted) return;
      PromoCoordinator.instance.whenEventPopupClear(_maybeShowRatingPromo);
    });
  }

  Future<void> _maybeShowRatingPromo() async {
    if (!mounted || PromoCoordinator.instance.ratingPromoShown) return;
    final user = _client.auth.currentUser;
    if (user == null) return;
    final enabled = await _ratingRepo.isEnabled();
    if (!enabled || !mounted) return;
    if (await _ratingRepo.hasClaim(user.id)) return;
    if (!mounted) return;
    final banners = await _ratingRepo.loadActiveBanners();
    if (banners.isEmpty || !mounted) return;
    final picked = banners[Random().nextInt(banners.length)];
    PromoCoordinator.instance.ratingPromoShown = true;
    setState(() => _activeRatingImage = picked.imageUrl);
  }

  @override
  void dispose() {
    _authSub?.cancel();
    _ratingDelayTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_activeEvent != null) {
      return Positioned.fill(
        child: EventPopupOverlay(
          banner: _activeEvent!,
          onDismissed: () {
            setState(() => _activeEvent = null);
            // If a rating promo was queued while the event was up, this
            // triggers the queued callback via markEventPopupDismissed.
          },
        ),
      );
    }
    if (_activeRatingImage != null) {
      return Positioned.fill(
        child: RatingRewardOverlay(
          imageUrl: _activeRatingImage!,
          onDismissed: () => setState(() => _activeRatingImage = null),
          onOpenStore: () async {
            await RatingReturnFlag.openPlayStoreAndMark();
            if (mounted) setState(() => _activeRatingImage = null);
          },
        ),
      );
    }
    return const SizedBox.shrink();
  }
}
