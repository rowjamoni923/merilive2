import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/foundation.dart';

class SoundService {
  static final SoundService _instance = SoundService._internal();
  factory SoundService() => _instance;
  SoundService._internal();

  final AudioPlayer _audioPlayer = AudioPlayer();
  final AudioPlayer _ringtonePlayer = AudioPlayer();
  bool _isPlayingRingtone = false;

  Future<void> playNotification() async {
    await _audioPlayer.play(AssetSource('sounds/notification.mp3'));
  }

  Future<void> playMessage() async {
    await _audioPlayer.play(AssetSource('sounds/message.mp3'));
  }

  Future<void> playCoin() async {
    await _audioPlayer.play(AssetSource('sounds/coin.mp3'));
  }

  Future<void> playGift() async {
    await _audioPlayer.play(AssetSource('sounds/gift.mp3'));
  }

  Future<void> playCallConnect() async {
    await _audioPlayer.play(AssetSource('sounds/call_connect.mp3'));
  }

  Future<void> playCallEnd() async {
    await _audioPlayer.play(AssetSource('sounds/call_end.mp3'));
  }

  Future<void> startRingtone() async {
    if (_isPlayingRingtone) return;
    _isPlayingRingtone = true;
    await _ringtonePlayer.setReleaseMode(ReleaseMode.loop);
    await _ringtonePlayer.play(AssetSource('sounds/ringtone.mp3'));
  }

  Future<void> stopRingtone() async {
    _isPlayingRingtone = false;
    await _ringtonePlayer.stop();
  }

  void dispose() {
    _audioPlayer.dispose();
    _ringtonePlayer.dispose();
  }
}
