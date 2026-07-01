import 'package:flutter/material.dart';
import 'package:flutter_svga/flutter_svga.dart';

class NetworkSvgaPlayer extends StatefulWidget {
  final String resUrl;
  final BoxFit fit;

  const NetworkSvgaPlayer({
    super.key,
    required this.resUrl,
    this.fit = BoxFit.contain,
  });

  @override
  State<NetworkSvgaPlayer> createState() => _NetworkSvgaPlayerState();
}

class _NetworkSvgaPlayerState extends State<NetworkSvgaPlayer> with SingleTickerProviderStateMixin {
  SVGAAnimationController? _controller;
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _controller = SVGAAnimationController(vsync: this);
    _loadAnimation();
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  Future<void> _loadAnimation() async {
    try {
      final parser = SVGAParser();
      final videoItem = await parser.decodeFromURL(widget.resUrl);
      if (mounted) {
        setState(() {
          _controller?.videoItem = videoItem;
          _controller?.repeat();
          _isLoading = false;
        });
      }
    } catch (e) {
      debugPrint('Error loading SVGA: $e');
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading || _controller?.videoItem == null) {
      return const SizedBox.shrink();
    }
    return SVGAImage(_controller!);
  }
}
