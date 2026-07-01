import 'package:flutter/material.dart';
import 'package:livekit_client/livekit_client.dart';
import 'dart:async';

enum LiveKitRoomType { video, party }

class LiveKitService extends ChangeNotifier {
  Room? _room;
  LocalVideoTrack? _localVideoTrack;
  LocalAudioTrack? _localAudioTrack;
  final Map<String, RemoteParticipant> _remoteParticipants = {};

  Room? get room => _room;
  LocalVideoTrack? get localVideoTrack => _localVideoTrack;
  LocalAudioTrack? get localAudioTrack => _localAudioTrack;
  Map<String, RemoteParticipant> get remoteParticipants => _remoteParticipants;

  // ========== PRO CAMERA CONFIGURATION (Android Optimized) ==========

  Future<void> createPreviewTracks({required bool isAudioOnly}) async {
    await stopTracks();

    if (!isAudioOnly) {
      // High-Quality Video Settings for Professional Look
      _localVideoTrack = await LocalVideoTrack.createCameraTrack(
        const CameraCaptureOptions(
          cameraFacing: CameraFacing.front,
          maxFrameRate: 30,
          params: VideoParameters(
            dimensions: VideoDimensions(width: 1280, height: 720),
            encoding: VideoEncoding(
              maxBitrate: 2500000, // 2.5 Mbps for smooth HD
              maxFramerate: 30,
            ),
          ),
        ),
      );
    }

    _localAudioTrack = await LocalAudioTrack.createAudioTrack(
      const AudioCaptureOptions(
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      ),
    );
    notifyListeners();
  }

  Future<bool> joinRoom({
    required String roomName,
    required String participantName,
    required LiveKitRoomType type,
  }) async {
    try {
      _room = Room();
      
      final listener = _room!.createListener();
      
      listener.on<ParticipantConnectedEvent>((event) {
        _remoteParticipants[event.participant.sid] = event.participant;
        notifyListeners();
      });

      listener.on<ParticipantDisconnectedEvent>((event) {
        _remoteParticipants.remove(event.participant.sid);
        notifyListeners();
      });

      listener.on<TrackSubscribedEvent>((event) {
        notifyListeners();
      });

      // Join with pre-created tracks
      await _room!.connect(
        'wss://ami-tomar-jonno-livekit.example.com', // Replace with real URL
        'YOUR_TOKEN', // Token should come from LiveService
        roomOptions: const RoomOptions(
          adaptiveStream: true,
          dynacast: true,
        ),
      );

      if (_localVideoTrack != null) {
        await _room!.localParticipant.publishVideoTrack(_localVideoTrack!);
      }
      if (_localAudioTrack != null) {
        await _room!.localParticipant.publishAudioTrack(_localAudioTrack!);
      }

      return true;
    } catch (e) {
      debugPrint('[LiveKit] Join error: $e');
      return false;
    }
  }

  RemoteVideoTrack? getRemoteVideoTrack() {
    if (_remoteParticipants.isEmpty) return null;
    
    for (var p in _remoteParticipants.values) {
      final track = p.videoTracks.firstOrNull;
      if (track != null && track.track is RemoteVideoTrack) {
        return track.track as RemoteVideoTrack;
      }
    }
    return null;
  }

  Future<void> stopTracks() async {
    await _localVideoTrack?.stop();
    await _localAudioTrack?.stop();
    _localVideoTrack = null;
    _localAudioTrack = null;
    notifyListeners();
  }

  Future<void> leaveRoom() async {
    await stopTracks();
    await _room?.disconnect();
    _room = null;
    _remoteParticipants.clear();
    notifyListeners();
  }
}
