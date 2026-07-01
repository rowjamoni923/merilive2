/// In-memory once-per-session coordinator for full-screen promo interstitials.
///
/// Mirrors the web session flags used by `EventPopupBanner.tsx` and
/// `FullScreenPromoBanners.tsx`:
///   • popup_banner_shown         → Event popup already displayed this launch
///   • promo_banner_shown_this_entry → Rating promo already displayed this launch
///   • event_popup_active         → An event popup is currently on-screen;
///                                   rating promo must wait until it dismisses.
///
/// Kept as a top-level singleton (no persistence) so state resets on cold
/// start, exactly like `sessionStorage` on web.
class PromoCoordinator {
  PromoCoordinator._();
  static final PromoCoordinator instance = PromoCoordinator._();

  bool eventPopupShown = false;
  bool ratingPromoShown = false;
  bool _eventPopupActive = false;

  bool get eventPopupActive => _eventPopupActive;

  final _eventDismissWaiters = <void Function()>[];

  void markEventPopupActive() {
    _eventPopupActive = true;
  }

  void markEventPopupDismissed() {
    _eventPopupActive = false;
    final waiters = List<void Function()>.from(_eventDismissWaiters);
    _eventDismissWaiters.clear();
    for (final w in waiters) {
      try {
        w();
      } catch (_) {/* ignore */}
    }
  }

  /// Register a callback to run the moment the currently-active event popup
  /// dismisses. If none is active, callback fires immediately.
  void whenEventPopupClear(void Function() cb) {
    if (!_eventPopupActive) {
      cb();
      return;
    }
    _eventDismissWaiters.add(cb);
  }
}
