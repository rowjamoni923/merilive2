import 'package:flutter/material.dart';
import 'package:flutter_svga/flutter_svga.dart';
import 'package:provider/provider.dart';
import '../services/dynamic_assets_service.dart';
import 'network_svga_player.dart';
import 'dynamic_avatar.dart';
import 'network_asset_loader.dart';

class AvatarWithFrame extends StatelessWidget {
  final String userId;
  final String? src;
  final String name;
  final int level;
  final bool isHost;
  final bool isVerified;
  final double size;

  const AvatarWithFrame({
    super.key,
    this.userId = "",
    this.src,
    this.name = "User",
    this.level = 1,
    this.isHost = false,
    this.isVerified = false,
    this.size = 110,
    this.frameId,
  });

  final String? frameId;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      child: Stack(
        alignment: Alignment.center,
        children: [
          // 1. Dynamic Avatar Base
          DynamicAvatar(
            avatarUrl: src,
            level: level,
            isHost: isHost,
            isVerified: isVerified,
            size: size * 0.9,
            showFrame: false, // We handle frame here for SVGA support
          ),

          // 2. Premium SVGA/Animated Frame Layer
          _buildFrameLayer(context),
        ],
      ),
    );
  }

  Widget _buildFrameLayer(BuildContext context) {
    final assetService = Provider.of<DynamicAssetsService>(context, listen: false);

    return FutureBuilder<FrameData?>(
      future: frameId != null 
          ? assetService.getFrameById(frameId!) 
          : assetService.getFrameByLevel(level, isHost),
      builder: (context, snapshot) {
        if (!snapshot.hasData || snapshot.data == null) return const SizedBox();
        
        final frame = snapshot.data!;
        
        return Positioned.fill(
          child: NetworkAssetLoader(
            url: frame.frameUrl,
            bucket: 'avatar_frames',
            fit: BoxFit.contain,
          ),
        );
      },
    );
  }
}
