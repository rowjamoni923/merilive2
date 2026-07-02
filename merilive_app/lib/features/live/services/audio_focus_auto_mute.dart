import 'dart:async';

import '../../../core/native/livekit_bridge.dart';

/// Phase E-21 — Auto-mute mic on transient audio-focus loss.
///
/// Dart port of `src/hooks/useAudioFocusAutoMute.ts`. Listens to the
/// native `AudioFocusEvents` broadcast stream (Android AudioManager);
/// on transient loss (incoming call / alarm / assistant) it snapshots
/// the current mic state and force-mutes via [LiveKitBridge.setMicEnabled].
/// On gain it restores the snapshotted state — only if we were the ones
/// who muted. Any manual mic toggle in the interim drops the snapshot so
/// we never fight the user's explicit choice.
///
/// Safe on: web / iOS / older APKs (event stream is empty → dormant).
class AudioFocusAutoMute {
  AudioFocusAutoMute({
    required bool Function() isMicEnabled,
    required Future<void> Function(bool enabled) setMicEnabled,
  })  : _isMicEnabled = isMicEnabled,
        _setMicEnabled = setMicEnabled;

  final bool Function() _isMicEnabled;
  final Future<void> Function(bool enabled) _setMicEnabled;

  StreamSubscription<String>? _sub;
  bool? _restoreTo;
  bool _lastKnownMic = true;

  void start() {
    _sub?.cancel();
    _sub = AudioFocusEvents.instance.events().listen(_onChange);
  }

  /// Call whenever the user manually toggles the mic — drops any pending
  /// restore so we don't override their explicit choice on next gain.
  void noteManualMicChange() {
    _restoreTo = null;
    _lastKnownMic = _isMicEnabled();
  }

  Future<void> _onChange(String change) async {
    if (change == 'gain') {
      final restore = _restoreTo;
      _restoreTo = null;
      if (restore == true && _isMicEnabled() == false) {
        try {
          await _setMicEnabled(true);
        } catch (_) {}
      }
      return;
    }
    final isLoss = change == 'loss' ||
        change == 'loss_transient' ||
        change == 'loss_transient_can_duck';
    if (!isLoss) return;
    if (_restoreTo != null) return; // already handling a loss window
    _restoreTo = _isMicEnabled();
    _lastKnownMic = _restoreTo!;
    if (_restoreTo == true) {
      try {
        await _setMicEnabled(false);
      } catch (_) {}
    }
  }

  Future<void> dispose() async {
    await _sub?.cancel();
    _sub = null;
    _restoreTo = null;
  }
}
