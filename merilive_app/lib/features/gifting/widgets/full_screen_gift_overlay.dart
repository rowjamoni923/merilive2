import 'dart:async';
import 'dart:collection';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:lottie/lottie.dart' as lottie_pkg;
import 'package:svgaplayer_flutter/svgaplayer_flutter.dart';
import 'package:video_player/video_player.dart';

/// G8 — 100% parity with web `GlobalGiftAnimationLayer` +
/// native `NativeGiftAnimationPlugin`.
///
/// Renderer priority (auto-detected from URL extension or explicit `type`):
///   1. SVGA  → `svgaplayer_flutter` (SVGAImage widget)
///   2. Lottie → `lottie` (Lottie.network)
///   3. VAP / MP4 / MOV → `video_player`
///   4. Static image (png/jpg/webp/gif) → `CachedNetworkImage` hero
///
/// FIFO priority queue with 32 cap; a single mounted [GlobalGiftOverlay]
/// drains it above every route, sheet, and native surface.
enum GiftAnimationKind { svga, lottie, video, image }

GiftAnimationKind _detectKind(String? explicit, String? url) {
  final e = (explicit ?? '').toLowerCase();
  if (e == 'svga') return GiftAnimationKind.svga;
  if (e == 'lottie' || e == 'json') return GiftAnimationKind.lottie;
  if (e == 'vap' || e == 'mp4' || e == 'video' || e == 'mov') return GiftAnimationKind.video;
  if (e == 'image' || e == 'png' || e == 'jpg' || e == 'webp' || e == 'gif') {
    return GiftAnimationKind.image;
  }
  final u = (url ?? '').toLowerCase().split('?').first;
  if (u.endsWith('.svga')) return GiftAnimationKind.svga;
  if (u.endsWith('.json') || u.endsWith('.lottie')) return GiftAnimationKind.lottie;
  if (u.endsWith('.mp4') || u.endsWith('.mov') || u.endsWith('.webm')) {
    return GiftAnimationKind.video;
  }
  return GiftAnimationKind.image;
}

class FullScreenGiftPayload {
  const FullScreenGiftPayload({
    required this.id,
    required this.giftName,
    required this.senderName,
    required this.receiverName,
    required this.quantity,
    this.imageUrl,
    this.animationUrl,
    this.animationType, // svga | lottie | vap | mp4 | image
    this.durationMs = 3500,
  });

  final String id;
  final String giftName;
  final String senderName;
  final String receiverName;
  final int quantity;
  final String? imageUrl;
  final String? animationUrl;
  final String? animationType;
  final int durationMs;
}

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
    if (_queue.length >= _maxQueue) return;
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
  SVGAAnimationController? _svgaCtrl;

  GiftAnimationKind get _kind => _detectKind(
        widget.payload.animationType,
        widget.payload.animationUrl ?? widget.payload.imageUrl,
      );

  String? get _assetUrl =>
      widget.payload.animationUrl ?? widget.payload.imageUrl;

  @override
  void initState() {
    super.initState();
    _c = AnimationController(
      vsync: this,
      duration: Duration(milliseconds: widget.payload.durationMs),
    )..forward();

    if (_kind == GiftAnimationKind.video) {
      final url = _assetUrl;
      if (url != null && url.isNotEmpty) {
        _video = VideoPlayerController.networkUrl(Uri.parse(url))
          ..setVolume(0)
          ..initialize().then((_) {
            if (!mounted) return;
            setState(() => _videoReady = true);
            _video!.play();
          }).catchError((_) {/* fall through to image */});
      }
    } else if (_kind == GiftAnimationKind.svga) {
      _svgaCtrl = SVGAAnimationController(vsync: this);
      final url = _assetUrl;
      if (url != null && url.isNotEmpty) {
        SVGAParser.shareParser().decodeFromURL(url).then((item) {
          if (!mounted) return;
          _svgaCtrl!
            ..videoItem = item
            ..repeat(count: 1).whenComplete(() {/* overlay auto-clears */});
        }).catchError((_) {/* silent */});
      }
    }
  }

  @override
  void dispose() {
    _c.dispose();
    _video?.dispose();
    _svgaCtrl?.dispose();
    super.dispose();
  }

  Widget _buildRenderer() {
    final p = widget.payload;
    final url = _assetUrl;
    switch (_kind) {
      case GiftAnimationKind.svga:
        if (_svgaCtrl == null) return const SizedBox.shrink();
        return SVGAImage(_svgaCtrl!);
      case GiftAnimationKind.lottie:
        if (url == null || url.isEmpty) return const SizedBox.shrink();
        return lottie_pkg.Lottie.network(
          url,
          fit: BoxFit.contain,
          repeat: false,
          errorBuilder: (_, __, ___) => const SizedBox.shrink(),
        );
      case GiftAnimationKind.video:
        if (_videoReady && _video != null) {
          return AspectRatio(
            aspectRatio: _video!.value.aspectRatio,
            child: VideoPlayer(_video!),
          );
        }
        return const SizedBox.shrink();
      case GiftAnimationKind.image:
        final img = p.imageUrl ?? url;
        if (img == null || img.isEmpty) return const SizedBox.shrink();
        final scale = Tween<double>(begin: 0.6, end: 1.0)
            .animate(CurvedAnimation(parent: _c, curve: Curves.easeOutBack));
        return ScaleTransition(
          scale: scale,
          child: CachedNetworkImage(
            imageUrl: img,
            width: 260,
            height: 260,
            fit: BoxFit.contain,
          ),
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.payload;
    final fade = CurvedAnimation(parent: _c, curve: Curves.easeOut);
    return FadeTransition(
      opacity: fade,
      child: Container(
        color: Colors.black.withValues(alpha: 0.55),
        child: Stack(
          alignment: Alignment.center,
          children: [
            Positioned.fill(child: Center(child: _buildRenderer())),
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
