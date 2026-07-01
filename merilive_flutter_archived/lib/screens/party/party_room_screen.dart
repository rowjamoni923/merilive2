import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../services/party_service.dart';
import '../../services/live_service.dart';
import '../../services/livekit_service.dart';
import '../../theme/app_theme.dart';
import '../live/components/flying_gift_overlay.dart';
import '../live/components/bigo_join_banner.dart';
import '../live/components/premium_gift_panel.dart';
import 'components/game_selector_panel.dart';
import 'dart:ui';
import 'dart:async';

class PartyRoomScreen extends StatefulWidget {
  const PartyRoomScreen({super.key});

  @override
  State<PartyRoomScreen> createState() => _PartyRoomScreenState();
}

class _PartyRoomScreenState extends State<PartyRoomScreen> {
  final List<Map<String, dynamic>> _activeGifts = [];
  final List<Map<String, dynamic>> _activeJoins = [];
  StreamSubscription? _eventSub;

  @override
  void initState() {
    super.initState();
    // Listen for real-time events (Parity with LiveStream)
    _eventSub = context.read<LiveService>().eventStream.listen((event) {
      if (event['type'] == 'gift') {
        setState(() => _activeGifts.add(event['data']));
      } else if (event['type'] == 'join') {
        setState(() => _activeJoins.add(event['data']));
      }
    });
  }

  @override
  void dispose() {
    _eventSub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final partyService = context.watch<PartyService>();
    final liveKit = context.watch<LiveKitService>();
    final room = partyService.currentRoom;

    if (room == null) {
      return const Scaffold(backgroundColor: Colors.black, body: Center(child: CircularProgressIndicator(color: AppTheme.primaryPink)));
    }

    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        fit: StackFit.expand,
        children: [
          // 1. Dynamic Background (100% Parity)
          _buildBackground(room['background_url']),

          // 2. Room Header
          _buildHeader(room, partyService),

          // 3. Seat Grid (Chamet Style - 12 Seats)
          _buildSeatGrid(partyService),

          // 4. Interactive Overlays (Gifts & Joins)
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

          // 5. Bottom Action Bar (Games, Gifts, Mic)
          _buildBottomBar(partyService),
        ],
      ),
    );
  }

  Widget _buildBackground(String? url) {
    return Container(
      decoration: BoxDecoration(
        image: url != null ? DecorationImage(image: NetworkImage(url), fit: BoxFit.cover) : null,
        gradient: url == null ? const LinearGradient(colors: [Color(0xFF1A1A2E), Color(0xFF16213E)], begin: Alignment.topLeft, end: Alignment.bottomRight) : null,
      ),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
        child: Container(color: Colors.black.withOpacity(0.4)),
      ),
    );
  }

  Widget _buildHeader(Map<String, dynamic> room, PartyService service) {
    final host = room['host'] ?? {};
    return Positioned(
      top: MediaQuery.of(context).padding.top + 10,
      left: 15,
      right: 15,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              CircleAvatar(radius: 20, backgroundImage: NetworkImage(host['avatar_url'] ?? '')),
              const SizedBox(width: 10),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(room['name'] ?? 'Party Room', style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.bold)),
                  Text("ID: ${room['room_code']}", style: const TextStyle(color: Colors.white70, fontSize: 10)),
                ],
              ),
            ],
          ),
          Row(
            children: [
              _buildHeaderPill(Icons.people, "${service.participants.length}"),
              const SizedBox(width: 8),
              IconButton(
                icon: const Icon(Icons.close, color: Colors.white, size: 28),
                onPressed: () {
                  service.leaveRoom();
                  Navigator.pop(context);
                },
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildHeaderPill(IconData icon, String label) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(color: Colors.black38, borderRadius: BorderRadius.circular(20), border: Border.all(color: Colors.white10)),
      child: Row(
        children: [
          Icon(icon, color: Colors.white70, size: 14),
          const SizedBox(width: 5),
          Text(label, style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }

  Widget _buildSeatGrid(PartyService service) {
    return Positioned(
      top: 150,
      left: 20,
      right: 20,
      bottom: 200,
      child: GridView.builder(
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 4,
          mainAxisSpacing: 20,
          crossAxisSpacing: 20,
          childAspectRatio: 0.7,
        ),
        itemCount: 12, // 12 Seats (Chamet Style)
        itemBuilder: (context, index) {
          final participant = service.participants.firstWhere((p) => p['position'] == index, orElse: () => {});
          final isOccupied = participant.isNotEmpty;

          return Column(
            children: [
              GestureDetector(
                onTap: () {
                  if (!isOccupied) service.requestSeat(index);
                },
                child: Container(
                  width: 60,
                  height: 60,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(color: isOccupied ? AppTheme.primaryPink : Colors.white24, width: 2),
                    boxShadow: isOccupied ? [BoxShadow(color: AppTheme.primaryPink.withOpacity(0.3), blurRadius: 10)] : null,
                  ),
                  child: CircleAvatar(
                    backgroundColor: Colors.white10,
                    backgroundImage: isOccupied ? NetworkImage(participant['user']?['avatar_url'] ?? '') : null,
                    child: !isOccupied ? const Icon(Icons.add, color: Colors.white24) : null,
                  ),
                ),
              ),
              const SizedBox(height: 5),
              Text(
                isOccupied ? (participant['user']?['display_name'] ?? 'User') : "Seat ${index + 1}",
                style: TextStyle(color: isOccupied ? Colors.white : Colors.white38, fontSize: 10),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _buildBottomBar(PartyService service) {
    return Positioned(
      bottom: MediaQuery.of(context).padding.bottom + 10,
      left: 15,
      right: 15,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              _buildActionCircle(Icons.chat_bubble_outline, Colors.black45, () {}),
              const SizedBox(width: 10),
              _buildActionCircle(Icons.mic_none, Colors.black45, () {}),
            ],
          ),
          Row(
            children: [
              _buildActionCircle(Icons.gamepad_outlined, Colors.amber.withOpacity(0.2), () {
                _showGameSelector();
              }),
              const SizedBox(width: 10),
              _buildActionCircle(Icons.card_giftcard, AppTheme.primaryPink, () {
                _showGiftPanel(context, service);
              }),
            ],
          ),
        ],
      ),
    );
  }

  void _showGameSelector() {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (context) => const GameSelectorPanel(),
    );
  }

  Widget _buildActionCircle(IconData icon, Color bgColor, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: bgColor, shape: BoxShape.circle, border: Border.all(color: Colors.white10)),
        child: Icon(icon, color: Colors.white, size: 24),
      ),
    );
  }

  void _showGiftPanel(BuildContext context, PartyService service) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (context) => PremiumGiftPanel(
        onSend: (gift, count) {
          // Trigger Gift animation via LiveService (Unified)
          // Implement actual send logic
          Navigator.pop(context);
        },
      ),
    );
  }
}
