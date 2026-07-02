import 'dart:async';

import 'entry_effects_repository.dart';
import 'native_entry_bridge.dart';
import 'room_join_events_bridge.dart';
import '../widgets/bigo_join_banner_overlay.dart';
import '../widgets/cinematic_join_banner_overlay.dart';
import '../widgets/entry_name_bar_overlay.dart';


/// A11 — Orchestrator that wires join events → per-user equipped effect
/// lookup → native VAP/Lottie/image renderer (Pkg438) with Flutter
/// `EntryNameBarQueue` / `BigoJoinQueue` / `CinematicJoinQueue` fallbacks.
///
/// Priority ladder (mirrors `useRoomEntryEffects` + `useUnifiedEntryDispatcher`
/// on web):
///   1. Noble subscription entrance   (priority 400)
///   2. Equipped vehicle animation    (priority 300)
///   3. Equipped entrance banner      (priority 300)
///   4. Level-based entrance          (priority = user_level, min 10)
///   5. Entry name bar                (priority = user_level, always shown
///                                     — native or Flutter gradient fallback)
class RoomEntryDispatcher {
  RoomEntryDispatcher._();
  static final RoomEntryDispatcher instance = RoomEntryDispatcher._();

  StreamSubscription<RoomJoinEvent>? _sub;

  // B7 — Noble ranks that ALWAYS trigger the cinematic overlay in
  // addition to any equipped native VAP animation. Matches web
  // `NOBLE_CINEMATIC_RANKS` (Chamet/Bigo Duke/King/Marquis tier).
  static const _cinematicNobleRanks = <String>{
    'duke',
    'king',
    'marquis',
    'emperor',
  };

  Future<void> attach({
    required RoomJoinSurface surface,
    required String roomId,
    String? selfUserId,
  }) async {
    await detach();
    await RoomJoinEventsBridge.instance.attach(surface: surface, roomId: roomId);
    _sub = RoomJoinEventsBridge.instance.events$.listen((event) {
      // Only skip self on the LIVE surface where the host is already visible
      // in the header. Party seats also self-animate.
      if (surface == RoomJoinSurface.live &&
          selfUserId != null &&
          event.userId == selfUserId) {
        return;
      }
      _dispatch(event);
    });
  }

  Future<void> detach() async {
    await _sub?.cancel();
    _sub = null;
    await RoomJoinEventsBridge.instance.detach();
    EntryNameBarQueue.instance.clear();
    CinematicJoinQueue.instance.clear();
    BigoJoinQueue.instance.clear();
  }


  Future<void> _dispatch(RoomJoinEvent event) async {
    final effects = await EntryEffectsRepository.instance.resolve(event.userId);

    // 1-4: Premium full-screen entrance (native VAP path).
    bool premiumNativeAccepted = false;
    if (effects.hasEntrance) {
      final priority = effects.nobleRankCode != null
          ? 400
          : (event.userLevel >= 40 ? 350 : (event.userLevel + 100));
      premiumNativeAccepted = await NativeEntryBridge.instance.enqueue(
        id: 'entrance_${event.userId}_${DateTime.now().microsecondsSinceEpoch}',
        url: effects.entranceUrl!,
        type: _kindFromUrl(effects.entranceUrl!),
        soundUrl: effects.entranceSoundUrl,
        priority: priority,
      );
    } else if (effects.hasVehicle) {
      premiumNativeAccepted = await NativeEntryBridge.instance.enqueue(
        id: 'vehicle_${event.userId}_${DateTime.now().microsecondsSinceEpoch}',
        url: effects.vehicleUrl!,
        type: _kindFromUrl(effects.vehicleUrl!),
        priority: 300,
      );
    }

    // B7 — Cinematic overlay branch.
    // Duke / King / Marquis / Emperor nobles ALWAYS get the cinematic
    // banner (even alongside the native VAP entrance) so their arrival
    // reads unambiguously to every viewer. All other premium joins
    // (equipped entrance/vehicle, Lv ≥ 20) fall back to it only when
    // the native VAP path didn't accept the payload.
    final nobleCode = effects.nobleRankCode?.toLowerCase();
    final isCinematicNoble =
        nobleCode != null && _cinematicNobleRanks.contains(nobleCode);
    final isPremiumJoin = effects.nobleRankCode != null ||
        effects.hasEntrance ||
        effects.hasVehicle ||
        event.userLevel >= 20;

    final shouldFireCinematic = isCinematicNoble ||
        (isPremiumJoin && !premiumNativeAccepted);
    if (shouldFireCinematic) {
      CinematicJoinQueue.instance.enqueue(CinematicJoinPayload(
        userName: event.displayName,
        userLevel: event.userLevel,
        avatarUrl: event.avatarUrl,
        nobleLabel: effects.nobleRankCode,
      ));
    }

    // B6 — Bigo compact join banner for non-premium joins that don't
    // qualify for the cinematic overlay. Coalesces dup join events for
    // the same user within a 500 ms window (handled inside BigoJoinQueue).
    if (!isPremiumJoin) {
      BigoJoinQueue.instance.enqueue(BigoJoinPayload(
        userId: event.userId,
        userName: event.displayName,
        userLevel: event.userLevel,
        avatarUrl: event.avatarUrl,
      ));
    }

    // 5: Entry name bar — try native (with animation URL), else Flutter banner.
    bool nativeAccepted = false;
    if (effects.hasNameBar) {
      nativeAccepted = await NativeEntryBridge.instance.enqueue(
        id: 'namebar_${event.userId}_${DateTime.now().microsecondsSinceEpoch}',
        url: effects.nameBarUrl!,
        type: _kindFromUrl(effects.nameBarUrl!),
        priority: event.userLevel,
        anchor: 'top',
      );
    }



    if (!nativeAccepted) {
      EntryNameBarQueue.instance.enqueue(EntryNameBarPayload(
        userName: event.displayName,
        userLevel: event.userLevel,
        avatarUrl: event.avatarUrl,
        animationUrl: effects.nameBarUrl,
      ));
    }
  }

  String _kindFromUrl(String url) {
    final u = url.toLowerCase();
    if (u.endsWith('.mp4') || u.contains('.vap')) return 'vap';
    if (u.endsWith('.json') || u.contains('lottie')) return 'lottie';
    return 'image';
  }
}

