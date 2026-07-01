import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:flutter_svga/flutter_svga.dart';
import 'package:lottie/lottie.dart';
import 'package:shimmer/shimmer.dart';
import '../services/api_service.dart';
import 'network_svga_player.dart';

class NetworkAssetLoader extends StatelessWidget {
  final String? url;
  final String bucket;
  final double? width;
  final double? height;
  final BoxFit fit;
  final Color? color;
  final Widget? placeholder;
  final Widget? errorWidget;

  const NetworkAssetLoader({
    super.key,
    required this.url,
    this.bucket = 'banners',
    this.width,
    this.height,
    this.fit = BoxFit.contain,
    this.color,
    this.placeholder,
    this.errorWidget,
  });

  @override
  Widget build(BuildContext context) {
    if (url == null || url!.isEmpty) return _buildError();

    final resolvedUrl = ApiService().resolveAssetUrl(url, bucket: bucket);
    if (resolvedUrl.isEmpty) return _buildError();

    final lowerUrl = resolvedUrl.toLowerCase();

    if (lowerUrl.endsWith('.svga')) {
      return SizedBox(
        width: width,
        height: height,
        child: NetworkSvgaPlayer(resUrl: resolvedUrl, fit: fit),
      );
    }

    if (lowerUrl.endsWith('.json')) {
      return Lottie.network(
        resolvedUrl,
        width: width,
        height: height,
        fit: fit,
        errorBuilder: (_, __, ___) => _buildError(),
      );
    }

    if (lowerUrl.endsWith('.svg')) {
      return SvgPicture.network(
        resolvedUrl,
        width: width,
        height: height,
        fit: fit,
        colorFilter: color != null ? ColorFilter.mode(color!, BlendMode.srcIn) : null,
        placeholderBuilder: (_) => _buildPlaceholder(),
      );
    }

    // Standard Image (PNG, JPG, WebP, GIF)
    return Image.network(
      resolvedUrl,
      width: width,
      height: height,
      fit: fit,
      color: color,
      loadingBuilder: (context, child, loadingProgress) {
        if (loadingProgress == null) return child;
        return _buildPlaceholder();
      },
      errorBuilder: (_, __, ___) => _buildError(),
    );
  }

  Widget _buildPlaceholder() {
    if (placeholder != null) return placeholder!;
    return Shimmer.fromColors(
      baseColor: Colors.white.withOpacity(0.05),
      highlightColor: Colors.white.withOpacity(0.1),
      child: Container(
        width: width ?? 50,
        height: height ?? 50,
        decoration: BoxDecoration(
          color: Colors.white10,
          borderRadius: BorderRadius.circular(8),
        ),
      ),
    );
  }

  Widget _buildError() {
    if (errorWidget != null) return errorWidget!;
    return Container(
      width: width,
      height: height,
      color: Colors.transparent,
      child: Center(
        child: Icon(Icons.broken_image_outlined, color: Colors.white10, size: (width ?? 24) * 0.5),
      ),
    );
  }
}
