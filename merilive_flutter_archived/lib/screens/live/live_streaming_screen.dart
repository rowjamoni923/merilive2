import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:livekit_client/livekit_client.dart';
import '../../services/live_service.dart';
import '../../services/livekit_service.dart';
import '../../theme/app_theme.dart';
import './components/flying_gift_overlay.dart';
import './components/bigo_join_banner.dart';
import '../../widgets/professional_header.dart';
import 'dart:ui';
import 'dart:async';

class LiveStreamingScreen extends StatefulWidget {
  const LiveStreamingScreen({super.key});

  @override
  State<LiveStreamingScreen> createState() => _LiveStreamingScreenState();
}

class _LiveStreamingScreenState extends State<LiveStreamingScreen> {
  final TextEditingController _chatController = TextEditingController();
  final List<Map<String, dynamic>> _activeGifts = [];
  final List<Map<String, dynamic>> _activeJoins = [];
  StreamSubscription? _eventSub;

  @override
  void initState() {
    super.initState();
    final liveService = context.read<LiveService>();
    
    // ⚡ Listen for sub-100ms events (Parity with Web Broadcast)
    _eventSub = liveService.eventStream.listen((event) {
      if (event['type'] == 'gift') {
        setState(() => _activeGifts.add(event['data']));
      } else if (event['type'] == 'join') {
        setState(() => _activeJoins.add(event['data']));
      } else if (event['type'] == 'close') {
        _showStreamEndedModal(event['data']?['hostName'] ?? "Host");
      }
    });
  }

  @override
  void dispose() {
    _eventSub?.cancel();
    _chatController.dispose();
    super.dispose();
  }

  void _showStreamEndedModal(String hostName) {
    if (!mounted) return;
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 15, sigmaY: 15),
        child: AlertDialog(
          backgroundColor: Colors.black87,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(25), border: Border.all(color: Colors.white10)),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.videocam_off, color: AppTheme.primaryPink, size: 60),
              const SizedBox(height: 20),
              Text("$hostName has ended the live stream", style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold), textAlign: TextAlign.center),
              const SizedBox(height: 30),
              ElevatedButton(
                style: ElevatedButton.styleFrom(backgroundColor: AppTheme.primaryPink, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20))),
                onPressed: () => Navigator.popUntil(context, (route) => route.isFirst),
                child: const Padding(padding: EdgeInsets.symmetric(horizontal: 30), child: Text("Back to Home", style: TextStyle(color: Colors.white))),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final liveService = context.watch<LiveService>();
    final liveKit = context.watch<LiveKitService>();
    final currentStream = liveService.currentStream;
    final isHost = liveService.currentRole == LiveRole.host;

    final videoTrack = isHost ? liveKit.localVideoTrack : liveKit.getRemoteVideoTrack();

    if (currentStream == null) {
      return const Scaffold(backgroundColor: Colors.black, body: Center(child: CircularProgressIndicator(color: AppTheme.primaryPink)));
    }

    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        fit: StackFit.expand,
        children: [
          // 1. Full Screen Video (Professional Quality)
          if (videoTrack != null)
            VideoTrackRenderer(videoTrack, fit: RTCVideoBlurBorder.cover)
          else
            _buildLoadingBackground(currentStream),

          // 2. Interactive Overlays
          _buildTopHeader(currentStream, liveService),
          
          // 3. Animation Layers (Flying Gifts & Joins)
          ..._activeGifts.map((gift) => FlyingGiftOverlay(
            key: ValueKey(gift.hashCode),
            giftData: gift,
            onComplete: () => setState(() => _activeGifts.remove(gift)),
          )),
          ..._activeJoins.map((join) => BigoJoinBanner(
            key: ValueKey(join.hashCode),
            userData: join,
            onComplete: () => setState(() => _activeJoins.remove(join)),
          )),

          // 4. Chat & Actions
          _buildBottomArea(isHost, liveService),
        ],
      ),
    );
  }

  Widget _buildLoadingBackground(Map<String, dynamic> stream) {
    return Container(
      decoration: BoxDecoration(
        image: DecorationImage(
          image: NetworkImage(stream['thumbnail_url'] ?? ''),
          fit: BoxFit.cover,
        ),
      ),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 30, sigmaY: 30),
        child: Container(color: Colors.black54),
      ),
    );
  }

  Widget _buildTopHeader(Map<String, dynamic> stream, LiveService service) {
    final host = Map<String, dynamic>.from(stream['host'] ?? {});
    final hostData = {
      'id': host['id'] ?? stream['host_id'],
      'app_uid': host['app_uid'],
      'display_name': host['display_name'] ?? 'Host',
      'avatar_url': host['avatar_url'] ?? stream['thumbnail_url'],
      'user_level': host['user_level'] ?? 1,
      'host_level': host['host_level'] ?? host['user_level'] ?? 1,
      'frame_id': host['frame_id'],
      'equipped_frame_id': host['equipped_frame_id'],
      'is_verified': host['is_verified'] == true || host['is_face_verified'] == true,
      'is_self': service.currentRole == LiveRole.host,
    };
    return Positioned(
      top: MediaQuery.of(context).padding.top + 10,
      left: 10,
      right: 10,
      child: ProfessionalHeader(
        hostData: hostData,
        viewerCount: service.viewerCount,
        sessionBeans: service.totalBeans.toInt(),
        onFollow: () {},
        onClose: () => _confirmExit(service),
      ),
    );
  }

  Widget _buildBottomArea(bool isHost, LiveService service) {
    return Positioned(
      bottom: MediaQuery.of(context).padding.bottom + 10,
      left: 16,
      right: 16,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Chat Area (Simplified for now)
          SizedBox(
            height: 200,
            width: MediaQuery.of(context).size.width * 0.7,
            child: ListView.builder(
              reverse: true,
              itemCount: 0, // Will integrate real chat later
              itemBuilder: (context, index) => const SizedBox(),
            ),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(25),
                  child: BackdropFilter(
                    filter: ImageFilter.blur(sigmaX: 5, sigmaY: 5),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      color: Colors.white10,
                      child: TextField(
                        controller: _chatController,
                        style: const TextStyle(color: Colors.white, fontSize: 14),
                        decoration: const InputDecoration(hintText: "Say something...", hintStyle: TextStyle(color: Colors.white54), border: InputBorder.none),
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              if (!isHost)
                _buildActionCircle(Icons.card_giftcard, AppTheme.primaryPink, () {
                  _showGiftPanel(context, service);
                }),
              const SizedBox(width: 10),
              _buildActionCircle(Icons.grid_view_rounded, Colors.black45, () {
                _showViewerList(context, service);
              }),
            ],
          ),
        ],
      ),
    );
  }

  void _showGiftPanel(BuildContext context, LiveService service) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (context) => PremiumGiftPanel(
        userCoins: context.read<WalletService>().balance,
        onSend: (gift) {
          service.sendGift(
            receiverId: service.currentStream!['host_id'],
            gift: gift,
          );
          Navigator.pop(context);
        },
      ),
    );
  }

  void _showViewerList(BuildContext context, LiveService service) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (context) => UnifiedViewerPanel(
        streamId: service.currentStream!['id'].toString(),
      ),
    );
  }

  Widget _buildActionCircle(IconData icon, Color bgColor, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: bgColor, shape: BoxShape.circle),
        child: Icon(icon, color: Colors.white, size: 24),
      ),
    );
  }

  void _confirmExit(LiveService service) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: Colors.grey[900],
        title: const Text("End Stream?", style: TextStyle(color: Colors.white)),
        content: const Text("Are you sure you want to exit?", style: TextStyle(color: Colors.white70)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text("Cancel")),
          TextButton(
            onPressed: () {
              service.endStream();
              Navigator.pop(context);
              Navigator.pop(context);
            },
            child: const Text("End", style: TextStyle(color: AppTheme.primaryPink)),
          ),
        ],
      ),
    );
  }
}
