// R2 — Reel card placeholder.
//
// Renders the thumbnail + gradient scrim + minimal caption strip so the R2
// skeleton feels alive before R3 wires the video player. R3 will drop in the
// actual player widget; the surrounding chrome (rails, info bar) will be
// layered on top by R4/R5 without touching this file's structural shell.

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../data/reels_models.dart';

class ReelCardPlaceholder extends StatelessWidget {
  const ReelCardPlaceholder({super.key, required this.reel});

  final Reel reel;

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        // Thumbnail (network) with fallback.
        if (reel.thumbnailUrl != null && reel.thumbnailUrl!.isNotEmpty)
          CachedNetworkImage(
            imageUrl: reel.thumbnailUrl!,
            fit: BoxFit.cover,
            fadeInDuration: const Duration(milliseconds: 200),
            placeholder: (_, __) => Container(color: const Color(0xFF0B0B12)),
            errorWidget: (_, __, ___) =>
                Container(color: const Color(0xFF0B0B12)),
          )
        else
          Container(color: const Color(0xFF0B0B12)),

        // Bottom gradient scrim so R5 caption/info reads on any thumbnail.
        const _BottomScrim(),

        // Skeleton play badge (R3 will remove this and mount the player).
        const Center(
          child: Icon(
            Icons.play_arrow_rounded,
            color: Colors.white70,
            size: 72,
          ),
        ),

        // Provisional caption preview (R5 replaces with the full info bar).
        if ((reel.caption ?? '').isNotEmpty)
          Positioned(
            left: 16,
            right: 96,
            bottom: 96,
            child: Text(
              reel.caption!,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 14,
                fontWeight: FontWeight.w600,
                shadows: [
                  Shadow(color: Colors.black54, blurRadius: 6),
                ],
              ),
            ),
          ),
      ],
    );
  }
}

class _BottomScrim extends StatelessWidget {
  const _BottomScrim();

  @override
  Widget build(BuildContext context) {
    return const IgnorePointer(
      child: DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              Colors.transparent,
              Colors.transparent,
              Color(0x66000000),
              Color(0xCC000000),
            ],
            stops: [0.0, 0.55, 0.8, 1.0],
          ),
        ),
      ),
    );
  }
}
