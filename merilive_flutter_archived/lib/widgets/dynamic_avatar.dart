import 'package:flutter/material.dart';
import 'package:lottie/lottie.dart';
import 'package:provider/provider.dart';
import '../services/dynamic_assets_service.dart';
import 'network_asset_loader.dart';

class DynamicAvatar extends StatelessWidget {
  final String? avatarUrl;
  final String? frameId;
  final int level;
  final bool isHost;
  final bool isVerified;
  final double size;
  final bool showFrame;
  final String? userId; // For deterministic random placeholders

  const DynamicAvatar({
    super.key,
    this.avatarUrl,
    this.frameId,
    this.level = 1,
    this.isHost = false,
    this.isVerified = false,
    this.size = 50,
    this.showFrame = true,
    this.userId,
  });

  @override
  Widget build(BuildContext context) {
    final assetService = Provider.of<DynamicAssetsService>(context, listen: false);

    return SizedBox(
      width: size,
      height: size,
      child: Stack(
        alignment: Alignment.center,
        children: [
          // 1. Base Avatar
          ClipOval(
            child: NetworkAssetLoader(
              url: avatarUrl,
              bucket: 'avatars',
              width: size * 0.85,
              height: size * 0.85,
              fit: BoxFit.cover,
              errorWidget: _buildFallback(),
            ),
          ),

          // 2. Verified Badge Layer (Premium Web Parity)
          if (isVerified)
            Positioned(
              bottom: size * 0.05,
              right: size * 0.05,
              child: Container(
                width: size * 0.32,
                height: size * 0.32,
                decoration: const BoxDecoration(
                  image: DecorationImage(
                    image: NetworkImage('https://ayjdlvuurscxucatbbah.supabase.co/storage/v1/object/public/system_assets/verified_badge_premium.png'),
                    fit: BoxFit.contain,
                  ),
                ),
              ),
            ),

          // 3. Dynamic Frame Layer
          if (showFrame)
            FutureBuilder<FrameData?>(
              future: frameId != null 
                ? assetService.getFrameById(frameId!)
                : assetService.getFrameByLevel(level, isHost),
              builder: (context, snapshot) {
                if (!snapshot.hasData || snapshot.data == null) return const SizedBox();
                
                final frame = snapshot.data!;
                return Positioned.fill(
                  child: _buildFrameContent(frame),
                );
              },
            ),
        ],
      ),
    );
  }

  Widget _buildFallback() {
    if (isHost) {
      // Audio 7 Requirement: Random hot-type female placeholders for missing host avatars
      final List<String> placeholders = [
        'https://ayjdlvuurscxucatbbah.supabase.co/storage/v1/object/public/system_assets/placeholders/host_1.jpg',
        'https://ayjdlvuurscxucatbbah.supabase.co/storage/v1/object/public/system_assets/placeholders/host_2.jpg',
        'https://ayjdlvuurscxucatbbah.supabase.co/storage/v1/object/public/system_assets/placeholders/host_3.jpg',
        'https://ayjdlvuurscxucatbbah.supabase.co/storage/v1/object/public/system_assets/placeholders/host_4.jpg',
        'https://ayjdlvuurscxucatbbah.supabase.co/storage/v1/object/public/system_assets/placeholders/host_5.jpg',
      ];
      
      // Deterministic based on userId if available
      final int index = userId != null ? (userId.hashCode.abs() % placeholders.length) : 0;
      
      return Image.network(
        placeholders[index],
        fit: BoxFit.cover,
        width: size * 0.85,
        height: size * 0.85,
      );
    }

    return Container(
      width: size * 0.85,
      height: size * 0.85,
      decoration: const BoxDecoration(
        color: Color(0xFF1E293B),
        shape: BoxShape.circle,
      ),
      child: Icon(Icons.person, color: Colors.white24, size: size * 0.5),
    );
  }

  Widget _buildFrameContent(FrameData frame) {
    return NetworkAssetLoader(
      url: frame.frameUrl,
      bucket: 'avatar_frames',
      fit: BoxFit.contain,
    );
  }
}


