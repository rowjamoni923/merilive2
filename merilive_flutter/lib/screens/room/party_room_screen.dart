import 'dart:async';
import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:flutter_svga/flutter_svga.dart';
import 'package:livekit_client/livekit_client.dart';
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
import '../../widgets/network_asset_loader.dart';


class PartyRoomScreen extends StatefulWidget {
  final Map<String, dynamic> room;
  const PartyRoomScreen({super.key, required this.room});

  @override
  State<PartyRoomScreen> createState() => _PartyRoomScreenState();
}

class _PartyRoomScreenState extends State<PartyRoomScreen> with TickerProviderStateMixin {
  final ApiService _api = ApiService();
  final LiveKitService _liveKit = LiveKitService();
  final _supabase = Supabase.instance.client;
  
  bool _isLoading = true;
  List<Map<String, dynamic>> _seats = [];
  int _totalBeans = 0;
  List<Map<String, dynamic>> _participants = [];
  List<Map<String, dynamic>> _seatRequests = [];
  
  String? _bgImageUrl;
  SVGAAnimationController? _bgSvgaController;
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
    _bgSvgaController = SVGAAnimationController(vsync: this);
    _initRoom();
  }

  Future<void> _initRoom() async {
    setState(() => _isLoading = true);
    try {
      final myProfile = await _api.getMyProfile();
      
      // 1. Join LiveKit Room
      await _liveKit.joinRoom(
        roomName: widget.room['id'].toString(),
        participantName: myProfile?['display_name'] ?? "User",
        type: LiveKitRoomType.party,
      );

      // 2. Initial Data Load
      _participants = await _api.getPartyParticipants(widget.room['id'].toString());
      _seats = _initializeSeats(widget.room['room_type'] ?? 'audio');
      _totalBeans = await _api.getPartyRoomBeans(widget.room['id'].toString());
      
      // 3. Setup Realtime Sync
      _setupRealtime();

      // 4. Sync Background
      _bgImageUrl = widget.room['background_url'];
      if (widget.room['background_svga'] != null) {
        final parser = SVGAParser();
        final videoItem = await parser.decodeFromURL(widget.room['background_svga']);
        _bgSvgaController?.videoItem = videoItem;
        _bgSvgaController?.repeat();
      }

      // 5. Broadcast Join Event (Instant Sync)
      _broadcastJoin(myProfile);

      if (mounted) setState(() => _isLoading = false);
    } catch (e) {
      debugPrint("Error joining room: $e");
      if (mounted) Navigator.pop(context);
    }
  }

  void _setupRealtime() {
    final roomId = widget.room['id'].toString();
    _syncChannel = _supabase.channel('party-room-$roomId');

    _syncChannel!
      // A. INSTANT BROADCAST LISTENERS (Sub-100ms)
      .onBroadcast(event: 'gift_sent', callback: (payload) {
        debugPrint("🎁 Broadcast Gift: $payload");
        _queueGift(payload);
      })
      .onBroadcast(event: 'join_event', callback: (payload) {
        debugPrint("👤 Broadcast Join: $payload");
        _triggerJoinBanner(payload);
        _queueEntryAnimation(payload);
      })
      .onBroadcast(event: 'room_closed', callback: (payload) {
        if (mounted) {
          Navigator.pop(context);
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Room closed by host")));
        }
      })
      
      // B. PERSISTENT DB CHANGES
      .onPostgresChanges(
        event: PostgresChangeEvent.all,
        schema: 'public',
        table: 'party_room_participants',
        filter: PostgresChangeFilter(type: PostgresChangeFilterType.eq, column: 'room_id', value: roomId),
        callback: (payload) async {
          final updatedParticipants = await _api.getPartyParticipants(roomId);
          if (mounted) setState(() => _participants = updatedParticipants);
        },
      )
      .onPostgresChanges(
        event: PostgresChangeEvent.all,
        schema: 'public',
        table: 'party_room_requests',
        filter: PostgresChangeFilter(type: PostgresChangeFilterType.eq, column: 'room_id', value: roomId),
        callback: (payload) async {
          // If host, update requests list
          if (widget.room['host_id'] == _supabase.auth.currentUser?.id) {
             // Fetch pending requests logic...
          }
        },
      )
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

  List<Map<String, dynamic>> _initializeSeats(String type) {
    int count = type == 'audio' ? 12 : 4;
    return List.generate(count, (index) => {
      'index': index,
      'user': index == 0 ? widget.room['host'] : null,
      'is_muted': false,
      'is_locked': false,
    });
  }

  @override
  void dispose() {
    _liveKit.disconnect();
    _bgSvgaController?.dispose();
    if (_syncChannel != null) _supabase.removeChannel(_syncChannel!);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Scaffold(
        backgroundColor: Color(0xFF0F172A),
        body: Center(child: CircularProgressIndicator(color: Color(0xFFD946EF))),
      );
    }

    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          // 1. Background Layer
          _buildBackground(),

          // 2. UI Content Layer
          SafeArea(
            child: Column(
              children: [
                _buildChametHeader(),
                Expanded(
                  child: Column(
                    children: [
                      const Spacer(flex: 1),
                      _buildSeatGrid(),
                      const Spacer(flex: 2),
                    ],
                  ),
                ),
                _buildBottomBar(),
              ],
            ),
          ),
          
          // 2b. Request Management FAB (Host Only)
          if (widget.room['host_id'] == _supabase.auth.currentUser?.id)
            Positioned(
              bottom: 100,
              right: 16,
              child: FloatingActionButton(
                backgroundColor: const Color(0xFFD946EF).withOpacity(0.8),
                onPressed: _showRequestManagement,
                child: Badge(
                  label: Text("${_seatRequests.length}"),
                  child: const Icon(LucideIcons.userPlus),
                ),
              ),
            ),
          
          // 3. Animation Overlays
          if (_activeJoinBanner != null)
             Positioned(
               top: 100, left: 16,
               child: BigoJoinBanner(userData: _activeJoinBanner!, onComplete: () {
                 setState(() => _activeJoinBanner = null);
               }),
             ),

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
    return Stack(
      fit: StackFit.expand,
      children: [
        if (_bgImageUrl != null)
          NetworkAssetLoader(url: _bgImageUrl, bucket: 'banners', fit: BoxFit.cover)
        else
          Container(
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [Color(0xFF1E1B4B), Color(0xFF0F172A)],
              ),
            ),
          ),
        
        if (_bgSvgaController?.videoItem != null)
          SVGAImage(_bgSvgaController!),
        
        Container(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Colors.black.withOpacity(0.4), Colors.transparent, Colors.black.withOpacity(0.6)],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildChametHeader() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(4),
            decoration: BoxDecoration(color: Colors.black38, borderRadius: BorderRadius.circular(20), border: Border.all(color: Colors.white10)),
            child: Row(
              children: [
                AvatarWithFrame(
                  userId: widget.room['host']?['id'] ?? "",
                  name: widget.room['host']?['display_name'] ?? "H",
                  src: widget.room['host']?['avatar_url'],
                  level: widget.room['host']?['user_level'] ?? 1,
                  isHost: true,
                  size: 28,
                ),
                const SizedBox(width: 8),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(widget.room['host']?['display_name'] ?? 'Host', style: GoogleFonts.outfit(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold)),
                    _buildBeanCounter(),
                  ],
                ),
                const SizedBox(width: 12),
                GestureDetector(
                  onTap: () { HapticFeedback.lightImpact(); },
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(colors: [Color(0xFF6366F1), Color(0xFFD946EF)]),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text("FOLLOW", style: GoogleFonts.outfit(color: Colors.white, fontSize: 8, fontWeight: FontWeight.bold)),
                  ),
                ),
              ],
            ),
          ),
          const Spacer(),
          _buildParticipantScroller(),
          const SizedBox(width: 8),
          _buildCloseButton(),
        ],
      ),
    );
  }

  Widget _buildBeanCounter() {
    return Row(
      children: [
        const Icon(LucideIcons.zap, color: Colors.amber, size: 8),
        const SizedBox(width: 2),
        AnimatedSwitcher(
          duration: const Duration(milliseconds: 300),
          transitionBuilder: (Widget child, Animation<double> animation) {
            return FadeTransition(opacity: animation, child: SlideTransition(
              position: Tween<Offset>(begin: const Offset(0, 0.5), end: Offset.zero).animate(animation),
              child: child,
            ));
          },
          child: Text(
            "$_totalBeans",
            key: ValueKey<int>(_totalBeans),
            style: GoogleFonts.outfit(color: Colors.amber, fontSize: 8, fontWeight: FontWeight.bold),
          ),
        ),
      ],
    );
  }

  Widget _buildParticipantScroller() {
    return Row(
      children: [
        SizedBox(
          height: 24,
          width: 80,
          child: Stack(
            children: List.generate(_participants.take(4).length, (index) {
              return Positioned(
                left: index * 16.0,
                child: ClipOval(
                  child: NetworkAssetLoader(
                    url: _participants[index]['user']?['avatar_url'],
                    bucket: 'avatars',
                    width: 12,
                    height: 12,
                    fit: BoxFit.cover,
                  ),
                ),
              );
            }),
          ),
        ),
        const SizedBox(width: 4),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
          decoration: BoxDecoration(color: Colors.black45, borderRadius: BorderRadius.circular(10)),
          child: Text("${_participants.length}", style: GoogleFonts.outfit(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold)),
        ),
      ],
    );
  }

  Widget _buildCloseButton() {
    final myId = _supabase.auth.currentUser?.id;
    final isHost = widget.room['host_id'] == myId;

    return GestureDetector(
      onTap: () {
        HapticFeedback.heavyImpact();
        if (isHost) {
          // Show close confirmation dialog for host
          showDialog(
            context: context,
            builder: (ctx) => AlertDialog(
              backgroundColor: const Color(0xFF1E1B4B),
              title: const Text("Close Party?", style: TextStyle(color: Colors.white)),
              content: const Text("This will end the session for all participants.", style: TextStyle(color: Colors.white70)),
              actions: [
                TextButton(onPressed: () => Navigator.pop(ctx), child: const Text("Cancel")),
                TextButton(
                  onPressed: () {
                    Navigator.pop(ctx);
                    Navigator.pop(context);
                  },
                  child: const Text("End", style: TextStyle(color: Colors.redAccent)),
                ),
              ],
            ),
          );
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

  Widget _buildSeatGrid() {
    final type = widget.room['room_type'] ?? 'audio';
    return type == 'audio' ? _buildAudioSeats() : _buildVideoSeats();
  }

  Widget _buildAudioSeats() {
    return Column(
      children: [
        Row(mainAxisAlignment: MainAxisAlignment.spaceEvenly, children: List.generate(4, (i) => _buildSeat(i))),
        const SizedBox(height: 24),
        Row(mainAxisAlignment: MainAxisAlignment.spaceEvenly, children: List.generate(4, (i) => _buildSeat(i + 4))),
        const SizedBox(height: 24),
        Row(mainAxisAlignment: MainAxisAlignment.spaceEvenly, children: List.generate(4, (i) => _buildSeat(i + 8))),
      ],
    );
  }

  Widget _buildVideoSeats() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: GridView.builder(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 2, mainAxisSpacing: 16, crossAxisSpacing: 16, childAspectRatio: 1.0),
        itemCount: 4,
        itemBuilder: (context, i) => _buildVideoSeat(i),
      ),
    );
  }

  Widget _buildSeat(int i) {
    final seat = _seats[i];
    final user = seat['user'];
    return GestureDetector(
      onTap: () {
        HapticFeedback.selectionClick();
        _handleSeatInteraction(i);
      },
      child: Column(
        children: [
          Stack(
            alignment: Alignment.center,
            children: [
              if (user == null)
                Container(
                  width: 60, height: 60,
                  decoration: BoxDecoration(color: Colors.white.withOpacity(0.1), shape: BoxShape.circle, border: Border.all(color: Colors.white10)),
                  child: const Icon(LucideIcons.plus, color: Colors.white24, size: 24),
                )
              else
                AvatarWithFrame(
                  userId: user['id'] ?? "",
                  name: user['display_name'] ?? "",
                  src: user['avatar_url'],
                  level: user['user_level'] ?? 1,
                  isHost: i == 0,
                  size: 60,
                ),
              // Speaking Pulse Effect
              if (user != null)
                 _buildSpeakingIndicator(user['id']),
            ],
          ),
          const SizedBox(height: 4),
          Text(user?['display_name'] ?? 'Seat ${i+1}', style: GoogleFonts.outfit(color: Colors.white70, fontSize: 10)),
        ],
      ),
    );
  }

  Widget _buildSpeakingIndicator(String userId) {
     // Check if LiveKit track is active for this user...
     return const SizedBox(); 
  }

  Widget _buildVideoSeat(int i) {
    final user = _seats[i]['user'];
    return Container(
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(20), border: Border.all(color: Colors.white10)),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        fit: StackFit.expand,
        children: [
          if (user != null) 
            NetworkAssetLoader(url: user['avatar_url'], bucket: 'avatars', fit: BoxFit.cover)
          else Center(child: Icon(LucideIcons.video, color: Colors.white.withOpacity(0.1), size: 40)),
          Positioned(bottom: 8, left: 8, child: Text(user?['display_name'] ?? 'Empty', style: GoogleFonts.outfit(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold))),
        ],
      ),
    );
  }

  void _handleSeatInteraction(int index) {
    final seat = _seats[index];
    final user = seat['user'];
    final myId = _supabase.auth.currentUser?.id;
    final isHost = widget.room['host_id'] == myId;

    if (user == null) {
      if (isHost) {
        // Host tapping empty seat: Lock/Unlock or Invite?
        _showSeatSettings(index);
      } else {
        // Viewer tapping empty seat: Request it
        _requestSeat(index);
      }
    } else {
      if (isHost && index != 0) {
        // Host tapping participant: Mute/Kick/Move
        _showParticipantAction(index);
      } else {
        // Viewer tapping participant: Show Profile
        // showProfile(user['id']);
      }
    }
  }

  Future<void> _requestSeat(int index) async {
    HapticFeedback.mediumImpact();
    try {
      await _api.sendSeatRequest(widget.room['id'].toString(), index);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Seat request sent for Seat ${index + 1}!")));
    } catch (e) {
      debugPrint("Error requesting seat: $e");
    }
  }

  void _showSeatSettings(int index) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (context) => Container(
        decoration: const BoxDecoration(
          color: Color(0xFF1E1B4B),
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(LucideIcons.lock, color: Colors.white),
              title: const Text("Lock Seat", style: TextStyle(color: Colors.white)),
              onTap: () => Navigator.pop(context),
            ),
            ListTile(
              leading: const Icon(LucideIcons.userPlus, color: Colors.white),
              title: const Text("Invite Member", style: TextStyle(color: Colors.white)),
              onTap: () => Navigator.pop(context),
            ),
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }

  void _showParticipantAction(int index) {
    final user = _seats[index]['user'];
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (context) => Container(
        decoration: const BoxDecoration(color: Color(0xFF1E1B4B), borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(LucideIcons.micOff, color: Colors.red),
              title: Text("Mute ${user['display_name']}", style: const TextStyle(color: Colors.white)),
              onTap: () => Navigator.pop(context),
            ),
            ListTile(
              leading: const Icon(LucideIcons.logOut, color: Colors.red),
              title: Text("Remove from Seat", style: const TextStyle(color: Colors.white)),
              onTap: () => Navigator.pop(context),
            ),
            const SizedBox(height: 20),
          ],
        ),
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
          final success = await GiftingService().sendGift(
            roomId: widget.room['id'].toString(),
            hostId: widget.room['host_id'],
            gift: gift,
          );
          if (success) {
            _queueGift({
              'gift_id': gift.id,
              'gift_name': gift.name,
              'gift_icon': gift.iconUrl,
              'gift_image_url': gift.animationUrl,
              'animation_url': gift.animationUrl,
              'animation_type': gift.animationType,
              'coin_value': gift.coinValue,
              'sound_url': gift.soundUrl,
              'sender_id': _supabase.auth.currentUser?.id,
              'sender_name': 'Me',
              'sender_avatar': null, 
              'count': 1,
            });
            HapticFeedback.mediumImpact();
          }
        },
      ),
    );
  }

  Widget _buildGiftButton() {
    return GestureDetector(
      onTap: _showGiftPanel,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
        decoration: BoxDecoration(
          gradient: const LinearGradient(colors: [Color(0xFF8B5CF6), Color(0xFFD946EF)]),
          borderRadius: BorderRadius.circular(25),
          boxShadow: [BoxShadow(color: const Color(0xFFD946EF).withOpacity(0.3), blurRadius: 10)],
        ),
        child: Row(
          children: [
            const Icon(LucideIcons.gift, color: Colors.white, size: 20),
            const SizedBox(width: 8),
            Text("GIFT", style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold)),
          ],
        ),
      ),
    );
  }

  Widget _buildBottomBar() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: [
          _buildBottomAction(LucideIcons.messageSquare, () => {}),
          const SizedBox(width: 12),
          _buildBottomAction(LucideIcons.mic, () => {}),
          const Spacer(),
          _buildGiftButton(),
          const SizedBox(width: 12),
          _buildBottomAction(LucideIcons.moreHorizontal, _showRoomSettings),
        ],
      ),
    );
  }

  Widget _buildBottomAction(IconData icon, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 44, height: 44,
        decoration: BoxDecoration(color: Colors.black45, shape: BoxShape.circle, border: Border.all(color: Colors.white10)),
        child: Icon(icon, color: Colors.white, size: 20),
      ),
    );
  }

  void _showRequestManagement() {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (context) => Container(
        height: 400,
        decoration: const BoxDecoration(color: Color(0xFF0F172A), borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
        child: Column(
          children: [
            const Padding(
              padding: EdgeInsets.all(20),
              child: Text("Seat Requests", style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
            ),
            if (_seatRequests.isEmpty)
              const Expanded(child: Center(child: Text("No pending requests", style: TextStyle(color: Colors.white54))))
            else
              Expanded(
                child: ListView.builder(
                  itemCount: _seatRequests.length,
                  itemBuilder: (context, idx) {
                    final req = _seatRequests[idx];
                    return ListTile(
                      leading: NetworkAssetLoader(url: req['user']?['avatar_url'], bucket: 'avatars', width: 40, height: 40, fit: BoxFit.cover),
                      title: Text(req['user']?['display_name'] ?? "User", style: const TextStyle(color: Colors.white)),
                      subtitle: Text("Level ${req['user']?['user_level'] ?? 1}", style: const TextStyle(color: Colors.white54, fontSize: 10)),
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          IconButton(
                            icon: const Icon(LucideIcons.check, color: Colors.green),
                            onPressed: () async {
                              await _api.manageSeatRequest(req['id'], 'approved');
                              HapticFeedback.mediumImpact();
                              Navigator.pop(context);
                            },
                          ),
                          IconButton(
                            icon: const Icon(LucideIcons.x, color: Colors.red),
                            onPressed: () async {
                              await _api.manageSeatRequest(req['id'], 'rejected');
                              Navigator.pop(context);
                            },
                          ),
                        ],
                      ),
                    );
                  },
                ),
              ),
          ],
        ),
      ),
    );
  }

  void _showRoomSettings() {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (context) => Container(
        decoration: const BoxDecoration(color: Color(0xFF1E293B), borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(LucideIcons.settings, color: Colors.white),
              title: const Text("Room Settings", style: TextStyle(color: Colors.white)),
              onTap: () => Navigator.pop(context),
            ),
            ListTile(
              leading: const Icon(LucideIcons.logOut, color: Colors.redAccent),
              title: const Text("Exit Room", style: TextStyle(color: Colors.redAccent)),
              onTap: () => Navigator.pop(context),
            ),
          ],
        ),
      ),
    );
  }
}


