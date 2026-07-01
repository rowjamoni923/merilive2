import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'dart:ui';
import 'dart:async';
import 'package:livekit_client/livekit_client.dart';
import 'package:provider/provider.dart';
import 'package:animate_do/animate_do.dart';
import '../services/livekit_service.dart';
import '../services/api_service.dart';
import '../services/call_provider.dart';
import '../services/beauty_effect_service.dart';
import '../widgets/beauty_panel.dart';
import '../widgets/call/in_call_chat.dart';

class PremiumPrivateCallScreen extends StatefulWidget {
  final String callId;
  final String remoteUserId;
  final String remoteUserName;
  final String? remoteUserAvatar;
  final int remoteUserLevel;
  final bool isHost;

  const PremiumPrivateCallScreen({
    super.key,
    required this.callId,
    required this.remoteUserId,
    required this.remoteUserName,
    this.remoteUserAvatar,
    this.remoteUserLevel = 1,
    required this.isHost,
  });

  @override
  State<PremiumPrivateCallScreen> createState() => _PremiumPrivateCallScreenState();
}

class _PremiumPrivateCallScreenState extends State<PremiumPrivateCallScreen> {
  final _liveKit = LiveKitService();
  final _api = ApiService();
  
  Timer? _billingTimer;
  Timer? _durationTimer;
  int _secondsElapsed = 0;
  int _currentBalance = 0;
  int _hostEarned = 0;
  int _callRate = 60;
  
  bool _isMuted = false;
  bool _isCameraOff = false;
  bool _isChatOpen = false;
  
  // Beauty States
  String? _activeFilter;
  double _filterIntensity = 0.8;
  String? _activeSticker;

  @override
  void initState() {
    super.initState();
    _initCall();
    _startDurationTimer();
    _fetchInitialData();
  }

  Future<void> _initCall() async {
    await _liveKit.joinRoom(
      roomName: widget.callId,
      participantName: widget.isHost ? "host" : "caller",
      type: LiveKitRoomType.call,
    );
    
    if (!widget.isHost) {
      _startBillingCycle();
    }
  }

  Future<void> _fetchInitialData() async {
    final results = await Future.wait([
      _api.resolveUserBalance(),
      _api.supabase.from('profiles').select('call_rate_per_minute').eq('id', widget.isHost ? _api.currentUserId! : widget.remoteUserId).single(),
    ]);
    
    if (mounted) {
      setState(() {
        _currentBalance = results[0] as int;
        _callRate = results[1]['call_rate_per_minute'] ?? 60;
      });
    }
  }

  void _startDurationTimer() {
    _durationTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (mounted) setState(() => _secondsElapsed++);
    });
  }

  void _startBillingCycle() {
    _billingTimer = Timer.periodic(const Duration(minutes: 1), (timer) {
      _performBilling();
    });
  }

  void _performBilling() async {
    if (widget.isHost) return;

    final response = await _api.processCallMinuteBilling(
      hostId: widget.remoteUserId,
      ratePerMinute: _callRate,
      callSessionId: widget.callId,
    );

    if (response['success'] == true) {
      if (mounted) {
        setState(() {
          _currentBalance = response['new_balance'] ?? _currentBalance;
        });
      }
    } else {
      _endCall();
    }
  }

  void _endCall() async {
    await _liveKit.disconnect();
    
    if (mounted) {
      // Capture info for CallEndedModal
      final info = {
        'remoteUserName': widget.remoteUserName,
        'remoteUserAvatar': widget.remoteUserAvatar,
        'remoteUserLevel': widget.remoteUserLevel,
        'duration': _secondsElapsed,
        'hostEarned': widget.isHost ? (_secondsElapsed ~/ 60) * (_callRate * 0.6).toInt() : 0, // Simplified commission logic
        'isHost': widget.isHost,
        'endedBy': 'self',
        'endReason': 'normal',
      };
      
      context.read<CallProvider>().showCallEnded(info);
      Navigator.pop(context);
    }
  }

  @override
  void dispose() {
    _billingTimer?.cancel();
    _durationTimer?.cancel();
    _liveKit.disconnect();
    super.dispose();
  }

  String _formatDuration(int seconds) {
    int mins = seconds ~/ 60;
    int secs = seconds % 60;
    return "${mins.toString().padLeft(2, '0')}:${secs.toString().padLeft(2, '0')}";
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        fit: StackFit.expand,
        children: [
          // 1. Remote Video
          _buildRemoteVideo(),

          // 2. Local Preview
          _buildLocalPreview(),

          // 3. HUD Layer
          _buildHUD(),

          // 4. In-Call Chat
          InCallChat(
            isOpen: _isChatOpen,
            onClose: () => setState(() => _isChatOpen = false),
            callId: widget.callId,
            remoteUserName: widget.remoteUserName,
          ),

          // 5. Controls
          _buildBottomControls(),
        ],
      ),
    );
  }

  Widget _buildRemoteVideo() {
    VideoTrack? remoteTrack = _liveKit.getRemoteVideoTrack();
    if (remoteTrack != null) {
      return VideoTrackRenderer(remoteTrack, fit: RTCVideoBlurContentFit.cover);
    }
    
    return Stack(
      fit: StackFit.expand,
      children: [
        if (widget.remoteUserAvatar != null)
          CachedNetworkImage(imageUrl: widget.remoteUserAvatar!, fit: BoxFit.cover),
        BackdropFilter(filter: ImageFilter.blur(sigmaX: 60, sigmaY: 60), child: Container(color: Colors.black54)),
        Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              AvatarWithFrame(avatarUrl: widget.remoteUserAvatar, size: 100, frameUrl: null),
              const SizedBox(height: 24),
              Text(widget.remoteUserName, style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const SizedBox(width: 12, height: 12, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.pinkAccent)),
                  const SizedBox(width: 12),
                  Text("Waiting for connection...", style: GoogleFonts.outfit(color: Colors.white54, fontSize: 14)),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildLocalPreview() {
    VideoTrack? localTrack = _liveKit.localVideoTrack;
    if (localTrack == null || _isCameraOff) return const SizedBox.shrink();

    return Positioned(
      top: MediaQuery.of(context).padding.top + 80,
      right: 16,
      child: GestureDetector(
        onTap: () {
          // Swap logic if needed
        },
        child: Hero(
          tag: 'local_preview',
          child: Container(
            width: 120,
            height: 180,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: Colors.white24, width: 2),
              boxShadow: [BoxShadow(color: Colors.black54, blurRadius: 20)],
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(18),
              child: VideoTrackRenderer(localTrack, fit: RTCVideoBlurContentFit.cover),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildHUD() {
    return Positioned(
      top: 0, left: 0, right: 0,
      child: Container(
        padding: EdgeInsets.fromLTRB(20, MediaQuery.of(context).padding.top + 10, 20, 20),
        decoration: BoxDecoration(
          gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Colors.black.withOpacity(0.8), Colors.transparent]),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            // User Info
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(2),
                  decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: Colors.greenAccent, width: 1.5)),
                  child: CircleAvatar(radius: 18, backgroundImage: widget.remoteUserAvatar != null ? NetworkImage(widget.remoteUserAvatar!) : null),
                ),
                const SizedBox(width: 10),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(widget.remoteUserName, style: GoogleFonts.outfit(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
                    Row(
                      children: [
                        Pulse(infinite: true, child: Container(width: 6, height: 6, decoration: const BoxDecoration(color: Colors.redAccent, shape: BoxShape.circle))),
                        const SizedBox(width: 6),
                        Text(_formatDuration(_secondsElapsed), style: GoogleFonts.outfit(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.bold)),
                      ],
                    ),
                  ],
                ),
              ],
            ),

            // Balance / Earnings
            _buildBalanceBadge(),
          ],
        ),
      ),
    );
  }

  Widget _buildBalanceBadge() {
    return ClipRRect(
      borderRadius: BorderRadius.circular(20),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(color: Colors.black45, borderRadius: BorderRadius.circular(20), border: Border.all(color: Colors.white10)),
          child: Row(
            children: [
              widget.isHost ? const Beans3DIcon(size: 16) : const Diamond3DIcon(size: 16),
              const SizedBox(width: 8),
              Text(
                widget.isHost ? "+${(_secondsElapsed ~/ 60) * (_callRate * 0.6).toInt()}" : "$_currentBalance",
                style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14),
              ),
              if (!widget.isHost) ...[
                const SizedBox(width: 8),
                Container(width: 1, height: 12, color: Colors.white24),
                const SizedBox(width: 8),
                Text("-$_callRate/min", style: GoogleFonts.outfit(color: Colors.white54, fontSize: 10)),
              ]
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildBottomControls() {
    return Positioned(
      bottom: 0, left: 0, right: 0,
      child: Container(
        padding: const EdgeInsets.only(bottom: 40, top: 20),
        decoration: BoxDecoration(
          gradient: LinearGradient(begin: Alignment.bottomCenter, end: Alignment.topCenter, colors: [Colors.black.withOpacity(0.9), Colors.transparent]),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceEvenly,
          children: [
            _buildActionIcon(
              _isMuted ? LucideIcons.micOff : LucideIcons.mic,
              () {
                setState(() => _isMuted = !_isMuted);
                _liveKit.room?.localParticipant?.setMicrophoneEnabled(!_isMuted);
              },
              active: _isMuted,
            ),
            _buildActionIcon(
              _isCameraOff ? LucideIcons.videoOff : LucideIcons.video,
              () {
                setState(() => _isCameraOff = !_isCameraOff);
                _liveKit.room?.localParticipant?.setCameraEnabled(!_isCameraOff);
              },
              active: _isCameraOff,
            ),
            GestureDetector(
              onTap: _endCall,
              child: Container(
                width: 72, height: 72,
                decoration: const BoxDecoration(
                  gradient: LinearGradient(colors: [Color(0xFFEF4444), Color(0xFFB91C1C)]),
                  shape: BoxShape.circle,
                  boxShadow: [BoxShadow(color: Colors.redAccent, blurRadius: 20, spreadRadius: 2)],
                ),
                child: const Icon(LucideIcons.phoneOff, color: Colors.white, size: 32),
              ),
            ),
            _buildActionIcon(LucideIcons.messageCircle, () => setState(() => _isChatOpen = !_isChatOpen), active: _isChatOpen),
            _buildActionIcon(LucideIcons.sparkles, _showBeautyPanel),
          ],
        ),
      ),
    );
  }

  Widget _buildActionIcon(IconData icon, VoidCallback onTap, {bool active = false}) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 50, height: 50,
        decoration: BoxDecoration(
          color: active ? Colors.white : Colors.white10,
          shape: BoxShape.circle,
          border: Border.all(color: Colors.white10),
        ),
        child: Icon(icon, color: active ? Colors.black : Colors.white, size: 22),
      ),
    );
  }

  void _showBeautyPanel() {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (context) => BeautyPanel(
        onFilterSelected: (f, i) => setState(() {
          _activeFilter = f;
          _filterIntensity = i;
        }),
        onStickerSelected: (s) => setState(() => _activeSticker = s),
        onRetouchChanged: (sm, w, sl) {},
      ),
    );
  }
}
