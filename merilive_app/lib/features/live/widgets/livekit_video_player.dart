import 'package:flutter/material.dart';

/// Flutter counterpart of `LiveKitVideoPlayer.tsx`. In Android production, the
/// actual host video is rendered by native `SurfaceViewRenderer` mounted
/// behind the WebView by the `LiveKitPlugin` (see native `attachLocal` /
/// remote track attach). This Flutter widget is the fallback surface used
/// when native rendering is unavailable (older APKs, iOS, web) — it shows
/// avatar + gradient placeholder and reserves layout space so overlays keep
/// correct anchor positions.
class LiveKitVideoPlayer extends StatelessWidget {
  final String hostName;
  final String? hostAvatarUrl;
  final int hostLevel;
  final bool audioOnly;
  final bool cameraOff;
  final bool connecting;

  const LiveKitVideoPlayer({
    super.key,
    required this.hostName,
    required this.hostLevel,
    this.hostAvatarUrl,
    this.audioOnly = false,
    this.cameraOff = false,
    this.connecting = false,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color(0xFF0F172A),
            Color(0xFF1E1B4B),
            Color(0xFF3B0764),
          ],
        ),
      ),
      child: Stack(
        alignment: Alignment.center,
        children: [
          // subtle radial glow
          Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: RadialGradient(
                  center: const Alignment(0, -0.2),
                  radius: 0.9,
                  colors: [
                    const Color(0xFFEC4899).withOpacity(0.18),
                    Colors.transparent,
                  ],
                ),
              ),
            ),
          ),
          Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                padding: const EdgeInsets.all(4),
                decoration: const BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: LinearGradient(colors: [
                    Color(0xFFF59E0B),
                    Color(0xFFEC4899),
                    Color(0xFF8B5CF6),
                  ]),
                ),
                child: CircleAvatar(
                  radius: 46,
                  backgroundColor: const Color(0xFF1E293B),
                  backgroundImage:
                      (hostAvatarUrl != null && hostAvatarUrl!.isNotEmpty)
                          ? NetworkImage(hostAvatarUrl!)
                          : null,
                  child: (hostAvatarUrl == null || hostAvatarUrl!.isEmpty)
                      ? Text(
                          hostName.isNotEmpty
                              ? hostName.substring(0, 1).toUpperCase()
                              : '?',
                          style: const TextStyle(
                              color: Colors.white,
                              fontSize: 28,
                              fontWeight: FontWeight.w900),
                        )
                      : null,
                ),
              ),
              const SizedBox(height: 12),
              Text(hostName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                      color: Colors.white,
                      fontSize: 16,
                      fontWeight: FontWeight.w800)),
              const SizedBox(height: 4),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(colors: [
                    Color(0xFF3B82F6),
                    Color(0xFF8B5CF6),
                  ]),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text('Lv $hostLevel',
                    style: const TextStyle(
                        color: Colors.white,
                        fontSize: 10,
                        fontWeight: FontWeight.w800)),
              ),
              const SizedBox(height: 10),
              if (connecting) ...[
                const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(
                      strokeWidth: 2, color: Colors.white),
                ),
                const SizedBox(height: 6),
                const Text('Connecting…',
                    style: TextStyle(color: Colors.white70, fontSize: 12)),
              ] else if (audioOnly)
                _pill(
                    Icons.headphones, 'Audio live', const Color(0xFF10B981))
              else if (cameraOff)
                _pill(Icons.videocam_off, 'Camera off',
                    const Color(0xFF64748B)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _pill(IconData i, String label, Color c) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: c.withOpacity(0.85),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(i, color: Colors.white, size: 12),
          const SizedBox(width: 4),
          Text(label,
              style: const TextStyle(
                  color: Colors.white,
                  fontSize: 11,
                  fontWeight: FontWeight.w800)),
        ],
      ),
    );
  }
}
