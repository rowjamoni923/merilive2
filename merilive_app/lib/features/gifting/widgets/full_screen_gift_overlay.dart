import 'dart:async';
import 'dart:collection';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';

/// Full-screen gift animation payload. Mirrors the web
/// `GlobalGiftAnimationLayer` contract so Flutter surfaces render the same
/// spectacle for high-value gifts.
///
/// Rendering priority per item:
///   1. VAP / MP4 (`videoUrl`) — silent loop-free playback via video_player.
///   2. Static image (`imageUrl`) — animated fade + scale hero.
///
/// SVGA/Lottie assets should route through the native Android
/// `NativeGiftAnimationPlugin` (Pkg438) once the Flutter Android host adopts
/// the MethodChannel bridge; the Dart layer here is the safe fallback so a
/// gift never plays nothing.
class FullScreenGiftPayload {
  const FullScreenGiftPayload({
    required this.id,
    required this.giftName,
    required this.senderName,
    required this.receiverName,
    required this.quantity,
    this.imageUrl,
    this.videoUrl,
    this.durationMs = 3500,
  });

  final String id;
  final String giftName;
  final String senderName;
  final String receiverName;
  final int quantity;
  final String? imageUrl;
  final String? videoUrl;
  final int durationMs;
}

/// FIFO singleton queue. Call [enqueue] from anywhere — a single mounted
/// [GlobalGiftOverlay] host drains it.
class FullScreenGiftQueue {
  FullScreenGiftQueue._();
  static final FullScreenGiftQueue instance = FullScreenGiftQueue._();

  static const int _maxQueue = 32;
  final Queue<FullScreenGiftPayload> _queue = Queue();
  final StreamController<FullScreenGiftPayload> _out =
      StreamController<FullScreenGiftPayload>.broadcast();
  bool _busy = false;

  Stream<FullScreenGiftPayload> get stream => _out.stream;

  void enqueue(FullScreenGiftPayload p) {
    if (_queue.length >= _maxQueue) return; // drop overflow
    _queue.add(p);
    _drain();
  }

  void _drain() {
    if (_busy || _queue.isEmpty) return;
    _busy = true;
    final next = _queue.removeFirst();
    _out.add(next);
    Future.delayed(Duration(milliseconds: next.durationMs), () {
      _busy = false;
      _drain();
    });
  }
}

/// Mount ONCE near the root (e.g. inside `MaterialApp.builder`) so it sits
/// above every route, sheet, and overlay.
class GlobalGiftOverlay extends StatefulWidget {
  const GlobalGiftOverlay({super.key, required this.child});
  final Widget child;

  @override
  State<GlobalGiftOverlay> createState() => _GlobalGiftOverlayState();
}

class _GlobalGiftOverlayState extends State<GlobalGiftOverlay> {
  FullScreenGiftPayload? _current;
  StreamSubscription<FullScreenGiftPayload>? _sub;

  @override
  void initState() {
    super.initState();
    _sub = FullScreenGiftQueue.instance.stream.listen((p) {
      setState(() => _current = p);
      Future.delayed(Duration(milliseconds: p.durationMs), () {
        if (!mounted) return;
        if (_current?.id == p.id) setState(() => _current = null);
      });
    });
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        widget.child,
        if (_current != null)
          Positioned.fill(
            child: IgnorePointer(
              child: _FullScreenGiftView(
                key: ValueKey(_current!.id),
                payload: _current!,
              ),
            ),
          ),
      ],
    );
  }
}

class _FullScreenGiftView extends StatefulWidget {
  const _FullScreenGiftView({super.key, required this.payload});
  final FullScreenGiftPayload payload;

  @override
  State<_FullScreenGiftView> createState() => _FullScreenGiftViewState();
}

class _FullScreenGiftViewState extends State<_FullScreenGiftView>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c;
  VideoPlayerController? _video;
  bool _videoReady = false;

  @override
  void initState() {
    super.initState();
    _c = AnimationController(
      vsync: this,
      duration: Duration(milliseconds: widget.payload.durationMs),
    )..forward();
    final vurl = widget.payload.videoUrl;
    if (vurl != null && vurl.isNotEmpty) {
      _video = VideoPlayerController.networkUrl(Uri.parse(vurl))
        ..setVolume(0)
        ..initialize().then((_) {
          if (!mounted) return;
          setState(() => _videoReady = true);
          _video!.play();
        }).catchError((_) {/* fallback to image */});
    }
  }

  @override
  void dispose() {
    _c.dispose();
    _video?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.payload;
    final fade = CurvedAnimation(parent: _c, curve: Curves.easeOut);
    final scale = Tween<double>(begin: 0.6, end: 1.0)
        .animate(CurvedAnimation(parent: _c, curve: Curves.easeOutBack));
    return FadeTransition(
      opacity: fade,
      child: Container(
        color: Colors.black.withValues(alpha: 0.55),
        child: Stack(
          alignment: Alignment.center,
          children: [
            if (_videoReady && _video != null)
              AspectRatio(
                aspectRatio: _video!.value.aspectRatio,
                child: VideoPlayer(_video!),
              )
            else if (p.imageUrl != null && p.imageUrl!.isNotEmpty)
              ScaleTransition(
                scale: scale,
                child: CachedNetworkImage(
                  imageUrl: p.imageUrl!,
                  width: 260,
                  height: 260,
                  fit: BoxFit.contain,
                ),
              ),
            Positioned(
              bottom: 80,
              left: 24,
              right: 24,
              child: Column(
                children: [
                  Text(
                    '${p.senderName} → ${p.receiverName}',
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                      fontSize: 16,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '${p.giftName} × ${p.quantity}',
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      color: Color(0xFFF59E0B),
                      fontWeight: FontWeight.w800,
                      fontSize: 22,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
