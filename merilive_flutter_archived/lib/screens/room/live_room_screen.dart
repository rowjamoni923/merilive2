import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'dart:async';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:flutter/services.dart';
import '../../services/api_service.dart';
import '../../services/livekit_service.dart';
import '../../widgets/avatar_with_frame.dart';
import '../../widgets/level_badge.dart';
import '../../widgets/premium_flying_gift.dart';
import '../../widgets/premium_entry_animation.dart';
import '../../widgets/bigo_join_banner.dart';
import '../../widgets/premium_gift_panel.dart';
import '../../services/gifting_service.dart';
import '../../widgets/live_room_task_center.dart';

class LiveRoomScreen extends StatefulWidget {
  final String roomId;
  const LiveRoomScreen({super.key, required this.roomId});

  @override
  State<LiveRoomScreen> createState() => _LiveRoomScreenState();
}

class _LiveRoomScreenState extends State<LiveRoomScreen> {
  final ApiService _api = ApiService();
  final _supabase = Supabase.instance.client;
  
  Map<String, dynamic>? _roomData;
  bool _isLoading = true;
  RealtimeChannel? _syncChannel;

  // Animation Queues
  final List<Map<String, dynamic>> _giftQueue = [];
  final List<Map<String, dynamic>> _entryQueue = [];
  Map<String, dynamic>? _activeGift;
  Map<String, dynamic>? _activeEntry;
  Map<String, dynamic>? _activeJoinBanner;

  @override
  void initState() {
    super.initState();
    _initRoom();
  }

  @override
  void dispose() {
    if (_syncChannel != null) _supabase.removeChannel(_syncChannel!);
    super.dispose();
  }

  Future<void> _initRoom() async {
    setState(() => _isLoading = true);
    try {
      // 1. Fetch Room Data
      final res = await _supabase.from('live_streams').select('*, host:profiles(*)').eq('id', widget.roomId).single();
      _roomData = Map<String, dynamic>.from(res);
      
      // 2. Setup Realtime Sync
      _setupRealtime();

      // 3. Broadcast Join
      final myProfile = await _api.getMyProfile();
      _broadcastJoin(myProfile);

    } catch (e) {
      debugPrint("Error: $e");
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  void _setupRealtime() {
    _syncChannel = _supabase.channel('live-room-${widget.roomId}');

    _syncChannel!
      .onBroadcast(event: 'gift_sent', callback: (payload) => _queueGift(payload))
      .onBroadcast(event: 'join_event', callback: (payload) {
        _triggerJoinBanner(payload);
        _queueEntryAnimation(payload);
      })
      .onBroadcast(event: 'room_closed', callback: (payload) {
        if (mounted) Navigator.pop(context);
      })
      .subscribe();
  }

  void _broadcastJoin(Map<String, dynamic>? profile) {
    if (profile == null || _syncChannel == null) return;
    _syncChannel!.sendBroadcastMessage(event: 'join_event', payload: {
      'user_id': profile['id'],
      'display_name': profile['display_name'],
      'avatar_url': profile['avatar_url'],
      'user_level': profile['user_level'] ?? 1,
      'equipped_entrance_url': profile['equipped_entrance_url'],
      'equipped_entrance_type': profile['equipped_entrance_type'],
    });
  }

  void _queueGift(Map<String, dynamic> giftData) {
    setState(() => _giftQueue.add(giftData));
    _processGiftQueue();
  }

  void _processGiftQueue() {
    if (_activeGift != null || _giftQueue.isEmpty) return;
    setState(() => _activeGift = _giftQueue.removeAt(0));
  }

  void _queueEntryAnimation(Map<String, dynamic> userData) {
    if (userData['equipped_entrance_url'] == null) return;
    setState(() => _entryQueue.add(userData));
    _processEntryQueue();
  }

  void _processEntryQueue() {
    if (_activeEntry != null || _entryQueue.isEmpty) return;
    setState(() => _activeEntry = _entryQueue.removeAt(0));
  }

  void _triggerJoinBanner(Map<String, dynamic> userData) {
    setState(() => _activeJoinBanner = userData);
    Future.delayed(const Duration(seconds: 3), () {
      if (mounted) setState(() => _activeJoinBanner = null);
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Scaffold(backgroundColor: Colors.black, body: Center(child: CircularProgressIndicator(color: Color(0xFFD946EF))));
    }

    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        fit: StackFit.expand,
        children: [
          _buildBackground(),
          
          SafeArea(
            child: Column(
              children: [
                _buildTopHeader(),
                
                // New Host Live Bonus Task Center
                if (_roomData != null)
                  LiveRoomTaskCenter(
                    hostId: _roomData!['host_id'],
                    isHost: _roomData!['host_id'] == _supabase.auth.currentUser?.id,
                  ),

                const Spacer(),
                _buildChatList(),
                _buildBottomControls(),
              ],
            ),
          ),

          // OVERLAYS
          if (_activeJoinBanner != null)
             Positioned(top: 100, left: 16, child: BigoJoinBanner(userData: _activeJoinBanner!, onComplete: () {})),

          if (_activeEntry != null)
            PremiumEntryAnimation(
              userData: _activeEntry!,
              onComplete: () {
                setState(() => _activeEntry = null);
                _processEntryQueue();
              },
            ),

          if (_activeGift != null)
            PremiumFlyingGift(
              giftData: _activeGift!,
              onComplete: () {
                setState(() => _activeGift = null);
                _processGiftQueue();
              },
            ),
        ],
      ),
    );
  }

  Widget _buildBackground() {
    return Container(
      decoration: BoxDecoration(
        image: _roomData?['host']?['avatar_url'] != null
            ? DecorationImage(image: NetworkImage(_roomData!['host']['avatar_url']), fit: BoxFit.cover, colorFilter: ColorFilter.mode(Colors.black.withOpacity(0.7), BlendMode.darken))
            : const DecorationImage(image: AssetImage('assets/images/nebula_bg.png'), fit: BoxFit.cover, colorFilter: ColorFilter.mode(Colors.black54, BlendMode.darken)),
      ),
    );
  }

  Widget _buildTopHeader() {
    final host = _roomData?['host'];
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(4),
            decoration: BoxDecoration(color: Colors.black45, borderRadius: BorderRadius.circular(40), border: Border.all(color: Colors.white10)),
            child: Row(
              children: [
                AvatarWithFrame(
                  userId: host?['id'] ?? "",
                  name: host?['display_name'] ?? "",
                  src: host?['avatar_url'],
                  level: host?['user_level'] ?? 1,
                  isHost: true,
                  size: 32,
                ),
                const SizedBox(width: 8),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(host?['display_name'] ?? 'Host', style: GoogleFonts.outfit(color: Colors.white, fontSize: 13, fontWeight: FontWeight.bold)),
                    Row(
                      children: [
                        const Icon(LucideIcons.zap, color: Colors.amber, size: 10),
                        const SizedBox(width: 2),
                        Text("${_roomData?['beans_total'] ?? 0}", style: GoogleFonts.outfit(color: Colors.amber, fontSize: 10, fontWeight: FontWeight.bold)),
                      ],
                    ),
                  ],
                ),
                const SizedBox(width: 12),
                GestureDetector(
                  onTap: () async {
                    HapticFeedback.lightImpact();
                    try {
                      await _supabase.from('followers').insert({
                        'follower_id': _supabase.auth.currentUser?.id,
                        'following_id': host?['id'],
                      });
                      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Following!")));
                    } catch (_) {}
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(gradient: const LinearGradient(colors: [Color(0xFF6366F1), Color(0xFFD946EF)]), borderRadius: BorderRadius.circular(20)),
                    child: const Icon(LucideIcons.plus, color: Colors.white, size: 14),
                  ),
                ),
              ],
            ),
          ),
          const Spacer(),
          _buildViewerCount(),
          const SizedBox(width: 8),
          _buildExitButton(),
        ],
      ),
    );
  }

  Widget _buildViewerCount() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(color: Colors.black38, borderRadius: BorderRadius.circular(12)),
      child: Row(
        children: [
          const Icon(LucideIcons.eye, color: Colors.white, size: 12),
          const SizedBox(width: 4),
          Text("${_roomData?['viewer_count'] ?? 0}", style: GoogleFonts.outfit(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }

  Widget _buildExitButton() {
    final isHost = _roomData?['host_id'] == _supabase.auth.currentUser?.id;
    return GestureDetector(
      onTap: () async {
        HapticFeedback.heavyImpact();
        if (isHost) {
          final confirm = await showDialog<bool>(
            context: context,
            builder: (ctx) => AlertDialog(
              backgroundColor: const Color(0xFF1E1B4B),
              title: const Text("End Stream?", style: TextStyle(color: Colors.white)),
              content: const Text("Are you sure you want to end your live stream?", style: TextStyle(color: Colors.white70)),
              actions: [
                TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text("Cancel")),
                TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text("End", style: TextStyle(color: Colors.redAccent))),
              ],
            ),
          );
          if (confirm == true && mounted) {
             // Broadcast room_closed before popping
             _syncChannel?.sendBroadcastMessage(event: 'room_closed', payload: {});
             Navigator.pop(context);
          }
        } else {
          Navigator.pop(context);
        }
      },
      child: Container(
        padding: const EdgeInsets.all(6),
        decoration: const BoxDecoration(color: Colors.black26, shape: BoxShape.circle),
        child: Icon(isHost ? LucideIcons.x : LucideIcons.logOut, color: Colors.white, size: 18),
      ),
    );
  }

  Widget _buildChatList() {
     return Container(height: 200); // Placeholder for chat parity
  }

  Widget _buildBottomControls() {
    return Container(
      padding: const EdgeInsets.all(16),
      child: Row(
        children: [
          Expanded(child: _buildInputPlaceholder()),
          const SizedBox(width: 12),
          _buildCircleAction(LucideIcons.mic, () => HapticFeedback.mediumImpact()),
          const SizedBox(width: 12),
          _buildCircleAction(LucideIcons.share2, () => HapticFeedback.lightImpact()),
          const SizedBox(width: 12),
          _buildGiftButton(),
        ],
      ),
    );
  }

  Widget _buildInputPlaceholder() {
    return Container(
      height: 44,
      padding: const EdgeInsets.symmetric(horizontal: 16),
      decoration: BoxDecoration(color: Colors.black45, borderRadius: BorderRadius.circular(22), border: Border.all(color: Colors.white10)),
      child: Row(
        children: [
          const Icon(LucideIcons.messageSquare, color: Colors.white54, size: 18),
          const SizedBox(width: 8),
          Text("Say something...", style: GoogleFonts.outfit(color: Colors.white30, fontSize: 14)),
        ],
      ),
    );
  }

  Widget _buildCircleAction(IconData icon, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 44, height: 44,
        decoration: BoxDecoration(color: Colors.black45, shape: BoxShape.circle, border: Border.all(color: Colors.white10)),
        child: Icon(icon, color: Colors.white, size: 20),
      ),
    );
  }

  Widget _buildGiftButton() {
    return GestureDetector(
      onTap: _showGiftPanel,
      child: Container(
        width: 44, height: 44,
        decoration: const BoxDecoration(
          gradient: LinearGradient(colors: [Color(0xFF8B5CF6), Color(0xFFD946EF)]),
          shape: BoxShape.circle,
        ),
        child: const Icon(LucideIcons.gift, color: Colors.white, size: 20),
      ),
    );
  }

  void _showGiftPanel() async {
    final balance = await _api.resolveUserBalance();
    if (!mounted) return;
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (context) => PremiumGiftPanel(
        userCoins: balance,
        onGiftSelected: (gift) async {
          final success = await GiftingService().sendGift(roomId: widget.roomId, hostId: _roomData?['host_id'], gift: gift);
          if (success) {
            _queueGift({
              'gift_id': gift.id, 'gift_name': gift.name, 'gift_icon': gift.iconUrl,
              'animation_url': gift.animationUrl, 'animation_type': gift.animationType,
              'coin_value': gift.coinValue, 'sound_url': gift.soundUrl,
              'sender_id': _supabase.auth.currentUser?.id, 'sender_name': 'Me', 'count': 1,
            });
            HapticFeedback.mediumImpact();
          }
        },
      ),
    );
  }
}


