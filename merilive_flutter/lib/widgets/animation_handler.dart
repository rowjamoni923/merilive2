import 'package:flutter/material.dart';
import 'package:flutter_svga/flutter_svga.dart';
import 'package:lottie/lottie.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'network_svga_player.dart';

enum AnimationType { svga, lottie, svg, image }

class AnimationHandler extends StatelessWidget {
  final String src;
  final AnimationType? type;
  final double? width;
  final double? height;
  final BoxFit fit;
  final bool repeat;
  final Color? color;

  const AnimationHandler({
    super.key,
    required this.src,
    this.type,
    this.width,
    this.height,
    this.fit = BoxFit.contain,
    this.repeat = true,
    this.color,
  });

  AnimationType _determineType() {
    if (type != null) return type!;
    final lowerSrc = src.toLowerCase();
    if (lowerSrc.endsWith('.svga')) return AnimationType.svga;
    if (lowerSrc.endsWith('.json') || lowerSrc.contains('lottiefiles')) return AnimationType.lottie;
    if (lowerSrc.endsWith('.svg')) return AnimationType.svg;
    return AnimationType.image;
  }

  @override
  Widget build(BuildContext context) {
    final determinedType = _determineType();

    switch (determinedType) {
      case AnimationType.svga:
        return SizedBox(
          width: width,
          height: height,
          child: NetworkSvgaPlayer(
            resUrl: src,
            fit: fit,
          ),
        );
      case AnimationType.lottie:
        if (src.startsWith('http')) {
          return Lottie.network(
            src,
            width: width,
            height: height,
            fit: fit,
            repeat: repeat,
          );
        }
        return Lottie.asset(
          src,
          width: width,
          height: height,
          fit: fit,
          repeat: repeat,
        );
      case AnimationType.svg:
        if (src.startsWith('http')) {
          return SvgPicture.network(
            src,
            width: width,
            height: height,
            fit: fit,
            colorFilter: color != null ? ColorFilter.mode(color!, BlendMode.srcIn) : null,
          );
        }
        return SvgPicture.asset(
          src,
          width: width,
          height: height,
          fit: fit,
          colorFilter: color != null ? ColorFilter.mode(color!, BlendMode.srcIn) : null,
        );
      case AnimationType.image:
        if (src.startsWith('http')) {
          return CachedNetworkImage(
            imageUrl: src,
            width: width,
            height: height,
            fit: fit,
            placeholder: (context, url) => const SizedBox.shrink(),
            errorWidget: (context, url, error) => const Icon(Icons.error),
          );
        }
        return Image.asset(
          src,
          width: width,
          height: height,
          fit: fit,
        );
    }
  }
}
