import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:url_launcher/url_launcher.dart';
import '../services/api_service.dart';

class DynamicBanner extends StatefulWidget {
  final String position;
  final double height;
  final double borderRadius;
  final EdgeInsetsGeometry margin;

  const DynamicBanner({
    super.key,
    required this.position,
    this.height = 120.0,
    this.borderRadius = 24.0,
    this.margin = const EdgeInsets.symmetric(horizontal: 16.0, vertical: 12.0),
  });

  @override
  State<DynamicBanner> createState() => _DynamicBannerState();
}

class _DynamicBannerState extends State<DynamicBanner> {
  late PageController _controller;

  @override
  void initState() {
    super.initState();
    _controller = PageController(viewportFraction: 1.0);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _handleBannerClick(String? link) async {
    if (link == null || link.isEmpty) return;
    try {
      final url = Uri.parse(link);
      if (await canLaunchUrl(url)) {
        await launchUrl(url, mode: LaunchMode.externalApplication);
      }
    } catch (e) {
      debugPrint("Error launching banner URL: $e");
    }
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<Map<String, dynamic>>>(
      future: ApiService().getBanners(widget.position),
      builder: (context, snapshot) {
        if (!snapshot.hasData || snapshot.data!.isEmpty) {
          return const SizedBox.shrink(); // Hide seamlessly if no banner
        }

        final banners = snapshot.data!;

        return Container(
          height: widget.height,
          margin: widget.margin,
          child: PageView.builder(
            controller: _controller,
            itemCount: banners.length,
            itemBuilder: (context, index) {
              final banner = banners[index];
              return AnimatedBuilder(
                animation: _controller,
                builder: (context, child) {
                  return Center(child: child);
                },
                child: GestureDetector(
                  onTap: () => _handleBannerClick(banner['link_url']),
                  child: Container(
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(widget.borderRadius),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withOpacity(0.3),
                          blurRadius: 15,
                          offset: const Offset(0, 10),
                        )
                      ],
                      image: DecorationImage(
                        image: CachedNetworkImageProvider(banner['image_url']),
                        fit: BoxFit.cover,
                      ),
                    ),
                  ),
                ),
              );
            },
          ),
        );
      },
    );
  }
}


