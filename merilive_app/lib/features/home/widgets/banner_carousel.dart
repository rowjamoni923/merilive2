import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../core/theme/design_tokens.dart';
import '../data/banner.dart';
import '../data/thumbnail.dart';

/// Bigo/Chamet-style horizontal-snap banner rail — 1:1 with web
/// `BannerCarousel` in `DynamicBanner.tsx`.
///
/// * Single banner → renders inline, no dots.
/// * 2+ banners   → snap-scroll, 4s auto-advance, dots pinned at bottom.
/// * Auto-advance pauses on touch and resumes shortly after release.
class BannerCarousel extends StatefulWidget {
  const BannerCarousel({
    super.key,
    required this.banners,
    required this.onTap,
    this.aspectRatio = 16 / 7,
  });

  final List<HomeBanner> banners;
  final ValueChanged<HomeBanner> onTap;
  final double aspectRatio;

  @override
  State<BannerCarousel> createState() => _BannerCarouselState();
}

class _BannerCarouselState extends State<BannerCarousel> {
  final _controller = PageController();
  int _active = 0;
  Timer? _timer;
  bool _userDragging = false;

  @override
  void initState() {
    super.initState();
    _armTimer();
  }

  void _armTimer() {
    _timer?.cancel();
    if (widget.banners.length <= 1) return;
    _timer = Timer.periodic(const Duration(seconds: 4), (_) {
      if (_userDragging || !mounted || !_controller.hasClients) return;
      final next = (_active + 1) % widget.banners.length;
      _controller.animateToPage(
        next,
        duration: const Duration(milliseconds: 420),
        curve: Curves.easeOutCubic,
      );
    });
  }

  @override
  void didUpdateWidget(covariant BannerCarousel old) {
    super.didUpdateWidget(old);
    if (old.banners.length != widget.banners.length) {
      _active = 0;
      if (_controller.hasClients) _controller.jumpToPage(0);
      _armTimer();
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final list = widget.banners;
    if (list.isEmpty) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
      child: AspectRatio(
        aspectRatio: widget.aspectRatio,
        child: Stack(
          children: [
            Listener(
              onPointerDown: (_) => _userDragging = true,
              onPointerUp: (_) {
                Future.delayed(const Duration(milliseconds: 500), () {
                  if (mounted) _userDragging = false;
                });
              },
              child: PageView.builder(
                controller: _controller,
                itemCount: list.length,
                onPageChanged: (i) => setState(() => _active = i),
                itemBuilder: (_, i) => _BannerSlide(
                  banner: list[i],
                  onTap: () {
                    HapticFeedback.selectionClick();
                    widget.onTap(list[i]);
                  },
                ),
              ),
            ),
            if (list.length > 1)
              Positioned(
                left: 0,
                right: 0,
                bottom: 8,
                child: _Dots(count: list.length, active: _active),
              ),
          ],
        ),
      ),
    );
  }
}

class _BannerSlide extends StatelessWidget {
  const _BannerSlide({required this.banner, required this.onTap});
  final HomeBanner banner;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final url = enhanceThumbnail(banner.imageUrl, width: 900, quality: 78);
    return GestureDetector(
      onTap: banner.linkUrl == null ? null : onTap,
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 4),
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(18),
          color: DT.homeHeaderCard,
          boxShadow: const [
            BoxShadow(
              color: Color(0x1A0F172A),
              blurRadius: 14,
              offset: Offset(0, 6),
            ),
          ],
        ),
        child: url == null
            ? _FallbackTitle(title: banner.title)
            : CachedNetworkImage(
                imageUrl: url,
                fit: BoxFit.cover,
                width: double.infinity,
                height: double.infinity,
                placeholder: (_, __) =>
                    const ColoredBox(color: Color(0xFFEEF2F7)),
                errorWidget: (_, __, ___) =>
                    _FallbackTitle(title: banner.title),
              ),
      ),
    );
  }
}

class _FallbackTitle extends StatelessWidget {
  const _FallbackTitle({required this.title});
  final String title;
  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Text(
            title,
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: DT.homeHeading,
              fontWeight: FontWeight.w700,
              fontSize: 14,
            ),
          ),
        ),
      );
}

class _Dots extends StatelessWidget {
  const _Dots({required this.count, required this.active});
  final int count;
  final int active;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: List.generate(count, (i) {
        final on = i == active;
        return AnimatedContainer(
          duration: const Duration(milliseconds: 220),
          margin: const EdgeInsets.symmetric(horizontal: 3),
          width: on ? 16 : 6,
          height: 6,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(3),
            color: on ? Colors.white : Colors.white.withOpacity(0.55),
            boxShadow: const [
              BoxShadow(
                color: Color(0x33000000),
                blurRadius: 4,
                offset: Offset(0, 1),
              ),
            ],
          ),
        );
      }),
    );
  }
}
