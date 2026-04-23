import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'dart:ui';
import 'package:animate_do/animate_do.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import 'package:record/record.dart';
import 'package:path_provider/path_provider.dart';
import 'package:audioplayers/audioplayers.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../widgets/network_asset_loader.dart';
import 'package:path/path.dart' as p;
import '../services/api_service.dart';
import '../widgets/level_badge.dart';
import '../widgets/dynamic_avatar.dart';

class DirectChatScreen extends StatefulWidget {
  final String conversationId;
  final Map<String, dynamic> otherUser;

  const DirectChatScreen({
    super.key,
    required this.conversationId,
    required this.otherUser,
  });

  @override
  State<DirectChatScreen> createState() => _DirectChatScreenState();
}

class _DirectChatScreenState extends State<DirectChatScreen> with TickerProviderStateMixin {
  final ApiService _apiService = ApiService();
  final TextEditingController _messageController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  final AudioRecorder _recorder = AudioRecorder();
  final AudioPlayer _audioPlayer = AudioPlayer();
  
  bool _isRecording = false;
  bool _isOtherTyping = false;
  Timer? _typingTimer;
  RealtimeChannel? _typingChannel;
  Map<String, dynamic>? _myProfile;
  late AnimationController _pulseController;
  late AnimationController _waveController;

  // Parity Features
  bool _isInlineTranslateEnabled = false;
  bool _isMediaMenuOpen = false;
  String _inlineTranslation = "";
  bool _isInlineTranslating = false;
  String _inlineTargetLang = "English";

  final List<Map<String, String>> _languages = [
    {'code': 'English', 'flag': '🇺🇸', 'name': 'English'},
    {'code': 'Bengali', 'flag': '🇧🇩', 'name': 'Bengali'},
    {'code': 'Hindi', 'flag': '🇮🇳', 'name': 'Hindi'},
    {'code': 'Arabic', 'flag': '🇸🇦', 'name': 'Arabic'},
    {'code': 'Spanish', 'flag': '🇪🇸', 'name': 'Spanish'},
  ];

  @override
  void initState() {
    super.initState();
    _loadInitialData();
    _setupRealtime();
    _markMessagesAsRead();
    _pulseController = AnimationController(vsync: this, duration: const Duration(seconds: 2))..repeat();
    _waveController = AnimationController(vsync: this, duration: const Duration(milliseconds: 500))..repeat(reverse: true);
  }

  Future<void> _loadInitialData() async {
    final my = await _apiService.getMyProfile();
    if (mounted) setState(() => _myProfile = my);
  }

  void _markMessagesAsRead() async {
    await _apiService.markMessagesAsRead(widget.conversationId);
  }

  void _setupRealtime() {
    final myId = Supabase.instance.client.auth.currentUser?.id;
    if (myId == null) return;

    _typingChannel = Supabase.instance.client.channel('typing-${widget.conversationId}');
    _typingChannel!.on(RealtimeListenTypes.broadcast, ChannelFilter(event: 'typing'), (payload, [ref]) {
      if (payload['userId'] != myId) {
        if (mounted) setState(() => _isOtherTyping = true);
        _typingTimer?.cancel();
        _typingTimer = Timer(const Duration(seconds: 3), () {
          if (mounted) setState(() => _isOtherTyping = false);
        });
      }
    }).subscribe();
  }

  void _broadcastTyping() {
    final myId = Supabase.instance.client.auth.currentUser?.id;
    _typingChannel?.send(type: RealtimeListenTypes.broadcast, event: 'typing', payload: {'userId': myId});
  }

  Future<void> _translateInline(String text) async {
    if (text.trim().isEmpty) {
      setState(() => _inlineTranslation = "");
      return;
    }
    setState(() => _isInlineTranslating = true);
    try {
      final res = await Supabase.instance.client.functions.invoke('translate', body: {
        'text': text,
        'targetLanguage': _inlineTargetLang,
      });
      if (mounted) setState(() => _inlineTranslation = res.data?['translatedText'] ?? "");
    } catch (e) {
      debugPrint("Translation Error: $e");
    } finally {
      if (mounted) setState(() => _isInlineTranslating = false);
    }
  }

  @override
  void dispose() {
    _pulseController.dispose();
    _waveController.dispose();
    _typingChannel?.unsubscribe();
    _recorder.dispose();
    _audioPlayer.dispose();
    _typingTimer?.cancel();
    _messageController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0D0618),
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFF0D0618), Color(0xFF0A0A14), Color(0xFF0D0618)],
            stops: [0.0, 0.3, 1.0],
          ),
        ),
        child: SafeArea(
          child: Column(
            children: [
              _buildAppBar(),
              Expanded(child: _buildMessageList()),
              if (_isInlineTranslateEnabled) _buildInlineTranslateBar(),
              _buildQuickReplies(),
              _buildInputArea(),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildAppBar() {
    final bool isOnline = widget.otherUser['is_online'] ?? false;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [const Color(0xFF140832).withOpacity(0.98), const Color(0xFF280F41).withOpacity(0.95)],
        ),
        border: Border(bottom: BorderSide(color: Colors.white.withOpacity(0.08))),
      ),
      child: Row(
        children: [
          IconButton(icon: const Icon(LucideIcons.arrowLeft, color: Colors.white), onPressed: () => Navigator.pop(context)),
          AvatarWithFrame(
            userId: widget.otherUser['id'] ?? "",
            src: widget.otherUser['avatar_url'],
            size: 44,
            level: widget.otherUser['user_level'] ?? 1,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(child: Text(widget.otherUser['display_name'] ?? "User", style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16), overflow: TextOverflow.ellipsis)),
                    const SizedBox(width: 8),
                    LevelBadge(level: widget.otherUser['user_level'] ?? 1, size: 'sm'),
                    const SizedBox(width: 4),
                    Text(widget.otherUser['country_flag'] ?? "🌍", style: const TextStyle(fontSize: 12)),
                  ],
                ),
                const SizedBox(height: 2),
                Row(
                  children: [
                    if (isOnline && !_isOtherTyping)
                      ScaleTransition(
                        scale: Tween(begin: 0.8, end: 1.2).animate(CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut)),
                        child: Container(
                          width: 8, height: 8,
                          margin: const EdgeInsets.only(right: 6),
                          decoration: BoxDecoration(color: const Color(0xFF10B981), shape: BoxShape.circle, boxShadow: [BoxShadow(color: const Color(0xFF10B981).withOpacity(0.5), blurRadius: 4)]),
                        ),
                      ),
                    if (_isOtherTyping)
                      _buildTypingIndicator()
                    else
                      Text(
                        isOnline ? "Online" : "Last seen 5 min ago", 
                        style: GoogleFonts.outfit(color: isOnline ? const Color(0xFF10B981) : Colors.white38, fontSize: 11, fontWeight: FontWeight.medium)
                      ),
                  ],
                ),
              ],
            ),
          ),
          IconButton(icon: const Icon(LucideIcons.phone, color: Colors.white70, size: 20), onPressed: () {}),
          IconButton(icon: const Icon(LucideIcons.moreVertical, color: Colors.white70, size: 20), onPressed: () {}),
        ],
      ),
    );
  }

  Widget _buildTypingIndicator() {
    return Row(
      children: [
        Text("typing", style: GoogleFonts.outfit(color: Colors.pinkAccent, fontSize: 11, fontWeight: FontWeight.w500)),
        const SizedBox(width: 2),
        ...List.generate(3, (i) => FadeIn(
          delay: Duration(milliseconds: i * 200),
          child: Text(".", style: GoogleFonts.outfit(color: Colors.pinkAccent, fontSize: 11, fontWeight: FontWeight.w900)),
        )),
      ],
    );
  }

  Widget _buildMessageList() {
    return StreamBuilder<List<Map<String, dynamic>>>(
      stream: _apiService.getMessagesStream(widget.conversationId),
      builder: (context, snapshot) {
        if (!snapshot.hasData) return const Center(child: CircularProgressIndicator(color: Colors.purple, strokeWidth: 2));
        final messages = snapshot.data!;
        return ListView.builder(
          controller: _scrollController,
          padding: const EdgeInsets.all(16),
          reverse: true,
          itemCount: messages.length,
          itemBuilder: (context, index) => _buildMessageBubble(messages[index]),
        );
      },
    );
  }

  Widget _buildMessageBubble(Map<String, dynamic> msg) {
    final bool isMine = msg['sender_id'] == Supabase.instance.client.auth.currentUser?.id;
    final String type = msg['message_type'] ?? 'text';
    final bool isSending = msg['status'] == 'sending';

    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Row(
        mainAxisAlignment: isMine ? MainAxisAlignment.end : MainAxisAlignment.start,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          if (!isMine) ...[
            AvatarWithFrame(userId: widget.otherUser['id'] ?? "", src: widget.otherUser['avatar_url'], size: 32, level: widget.otherUser['user_level'] ?? 1),
            const SizedBox(width: 8),
          ],
          Flexible(child: _buildBubbleWithTail(msg, isMine, type, isSending)),
          if (isMine) ...[
            const SizedBox(width: 8),
            AvatarWithFrame(userId: _myProfile?['id'] ?? "", src: _myProfile?['avatar_url'], size: 32, level: _myProfile?['user_level'] ?? 1),
          ],
        ],
      ),
    );
  }

  Widget _buildBubbleWithTail(Map<String, dynamic> msg, bool isMine, String type, bool isSending) {
    if (type == 'gift') return _buildGiftBubble(msg, isMine);
    return Stack(
      clipBehavior: Clip.none,
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            gradient: isMine 
              ? const LinearGradient(colors: [Color(0xFFC026D3), Color(0xFF9333EA), Color(0xFF6D28D9)])
              : LinearGradient(colors: [Colors.white.withOpacity(0.08), Colors.white.withOpacity(0.04)]),
            borderRadius: BorderRadius.only(
              topLeft: const Radius.circular(18),
              topRight: const Radius.circular(18),
              bottomLeft: Radius.circular(isMine ? 18 : 0),
              bottomRight: Radius.circular(isMine ? 0 : 18),
            ),
            boxShadow: isMine ? [BoxShadow(color: const Color(0xFF9333EA).withOpacity(0.15), blurRadius: 10, offset: const Offset(0, 4))] : null,
            border: isMine ? null : Border.all(color: Colors.white.withOpacity(0.08)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(msg['content'] ?? '', style: GoogleFonts.outfit(color: Colors.white, fontSize: 14, height: 1.4)),
              const SizedBox(height: 6),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(_formatTime(msg['created_at']), style: TextStyle(color: Colors.white.withOpacity(isMine ? 0.4 : 0.25), fontSize: 9)),
                  if (isMine) ...[
                    const SizedBox(width: 4),
                    if (isSending)
                      const Icon(LucideIcons.clock, color: Colors.white24, size: 10)
                    else
                      Icon(msg['is_read'] == true ? LucideIcons.checkCheck : LucideIcons.check, color: msg['is_read'] == true ? const Color(0xFF22D3EE) : Colors.white24, size: 10),
                  ],
                ],
              ),
            ],
          ),
        ),
        Positioned(
          bottom: 0,
          right: isMine ? -6 : null,
          left: isMine ? null : -6,
          child: CustomPaint(
            size: const Size(10, 10),
            painter: BubbleTailPainter(isMine: isMine, color: isMine ? const Color(0xFF6D28D9) : Colors.white.withOpacity(0.08)),
          ),
        ),
      ],
    );
  }

  Widget _buildGiftBubble(Map<String, dynamic> msg, bool isMine) {
    final content = msg['content'] as String;
    final clean = content.replaceAll('[Gift: ', '').replaceAll(']', '');
    final parts = clean.split('|');
    final String? url = parts.length > 1 ? parts[0] : null;
    final String details = parts.length > 1 ? parts[1] : parts[0];
    final beansMatch = RegExp(r'\+(\d+)\s+beans').firstMatch(details);
    final String? beans = beansMatch?.group(1);

    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: const Color(0xFF1E1B4B).withOpacity(0.85),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.amber.withOpacity(0.3)),
        backdropFilter: ImageFilter.blur(sigmaX: 8, sigmaY: 8),
      ),
      child: Column(
        children: [
          if (url != null) 
            CachedNetworkImage(imageUrl: url, width: 44, height: 44, fit: BoxFit.contain)
          else 
            const Icon(LucideIcons.gift, color: Colors.amber, size: 32),
          if (beans != null)
            Container(
              margin: const EdgeInsets.only(top: 8),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
              decoration: BoxDecoration(
                gradient: const LinearGradient(colors: [Color(0xFFFBBF24), Color(0xFFF59E0B)]), 
                borderRadius: BorderRadius.circular(12),
                boxShadow: [BoxShadow(color: Colors.amber.withOpacity(0.2), blurRadius: 6)],
              ),
              child: Text("+$beans beans", style: const TextStyle(color: Color(0xFF451A03), fontSize: 10, fontWeight: FontWeight.w900)),
            ),
          const SizedBox(height: 6),
          Text(_formatTime(msg['created_at']), style: const TextStyle(color: Colors.white24, fontSize: 8)),
        ],
      ),
    );
  }

  Widget _buildInlineTranslateBar() {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.purple.withOpacity(0.12), 
        border: Border(top: BorderSide(color: Colors.white.withOpacity(0.08)))
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Text("Auto-translate to:", style: TextStyle(color: Colors.white54, fontSize: 11, fontWeight: FontWeight.bold)),
              const SizedBox(width: 10),
              Expanded(
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: _languages.map((lang) => GestureDetector(
                      onTap: () {
                        setState(() => _inlineTargetLang = lang['code']!);
                        if (_messageController.text.isNotEmpty) _translateInline(_messageController.text);
                      },
                      child: Container(
                        margin: const EdgeInsets.only(right: 8),
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                        decoration: BoxDecoration(
                          color: _inlineTargetLang == lang['code'] ? Colors.purple.withOpacity(0.4) : Colors.white.withOpacity(0.06),
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: _inlineTargetLang == lang['code'] ? Colors.purple.withOpacity(0.5) : Colors.transparent),
                        ),
                        child: Row(children: [Text(lang['flag']!, style: const TextStyle(fontSize: 11)), const SizedBox(width: 6), Text(lang['name']!, style: TextStyle(color: _inlineTargetLang == lang['code'] ? Colors.white : Colors.white54, fontSize: 11))]),
                      ),
                    )).toList(),
                  ),
                ),
              ),
              IconButton(icon: const Icon(LucideIcons.x, color: Colors.white30, size: 16), onPressed: () => setState(() => _isInlineTranslateEnabled = false)),
            ],
          ),
          if (_inlineTranslation.isNotEmpty || _isInlineTranslating)
            Container(
              margin: const EdgeInsets.only(top: 10),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: Colors.purple.withOpacity(0.08), borderRadius: BorderRadius.circular(14), border: Border.all(color: Colors.purple.withOpacity(0.15))),
              child: Row(
                children: [
                  Expanded(child: Text(_isInlineTranslating ? "Translating..." : _inlineTranslation, style: GoogleFonts.outfit(color: const Color(0xFFF3E8FF), fontSize: 14))),
                  if (_isInlineTranslating) const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.purple)),
                ],
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildQuickReplies() {
    if (_messageController.text.isNotEmpty) return const SizedBox.shrink();
    final replies = (widget.otherUser['is_host'] == true) 
      ? ["Hi! How are you? 😊", "You look beautiful! 💕", "Can we video call? 📹", "Miss you! 💗"]
      : ["Hey! What's up? 👋", "How are you doing? 😊", "Nice to meet you! 🤝", "Good morning! ☀️"];

    return Container(
      height: 40,
      margin: const EdgeInsets.only(bottom: 10),
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: replies.length,
        itemBuilder: (context, index) => GestureDetector(
          onTap: () => _sendMessage(replies[index]),
          child: Container(
            margin: const EdgeInsets.only(right: 10),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.06), 
              borderRadius: BorderRadius.circular(22), 
              border: Border.all(color: Colors.white.withOpacity(0.1)),
              boxShadow: [BoxShadow(color: Colors.black12, blurRadius: 4)],
            ),
            child: Text(replies[index], style: GoogleFonts.outfit(color: Colors.white.withOpacity(0.8), fontSize: 12)),
          ),
        ),
      ),
    );
  }

  Widget _buildInputArea() {
    return Column(
      children: [
        if (_isMediaMenuOpen) _buildMediaMenu(),
        if (_isRecording) _buildVoiceVisualizer(),
        Container(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 14),
          decoration: BoxDecoration(color: const Color(0xFF0D0618).withOpacity(0.98), border: Border(top: BorderSide(color: Colors.white.withOpacity(0.06)))),
          child: Row(
            children: [
              _buildCircularIcon(LucideIcons.plus, Colors.white24, () => setState(() => _isMediaMenuOpen = !_isMediaMenuOpen), active: _isMediaMenuOpen),
              const SizedBox(width: 10),
              Expanded(
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  decoration: BoxDecoration(color: Colors.white.withOpacity(0.08), borderRadius: BorderRadius.circular(26), border: Border.all(color: Colors.white.withOpacity(0.1))),
                  child: Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _messageController,
                          style: GoogleFonts.outfit(color: Colors.white, fontSize: 15),
                          decoration: const InputDecoration(hintText: "Type message...", hintStyle: TextStyle(color: Colors.white24), border: InputBorder.none),
                          onChanged: (val) {
                            _broadcastTyping();
                            if (_isInlineTranslateEnabled) _translateInline(val);
                          },
                        ),
                      ),
                      IconButton(icon: const Icon(LucideIcons.smile, color: Colors.white24, size: 20), onPressed: () {}),
                      IconButton(icon: const Icon(LucideIcons.mic, color: _isRecording ? Colors.red : Colors.white24, size: 20), onPressed: () => setState(() => _isRecording = !_isRecording)),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 10),
              _buildActionButtons(),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildVoiceVisualizer() {
    return Container(
      height: 40,
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: List.generate(20, (i) => AnimatedBuilder(
          animation: _waveController,
          builder: (context, child) => Container(
            width: 3,
            height: 10 + (20 * _waveController.value * (i % 2 == 0 ? 1 : 0.5)),
            margin: const EdgeInsets.symmetric(horizontal: 2),
            decoration: BoxDecoration(color: Colors.redAccent.withOpacity(0.8), borderRadius: BorderRadius.circular(2)),
          ),
        )),
      ),
    );
  }

  Widget _buildMediaMenu() {
    return FadeInUp(
      duration: const Duration(milliseconds: 200),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 20),
        decoration: BoxDecoration(color: Colors.white.withOpacity(0.03), border: Border(top: BorderSide(color: Colors.white.withOpacity(0.05)))),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceAround,
          children: [
            _buildMediaItem(LucideIcons.image, "Gallery", Colors.blueAccent, () {}),
            _buildMediaItem(LucideIcons.camera, "Camera", Colors.greenAccent, () {}),
            _buildMediaItem(LucideIcons.video, "Video", Colors.redAccent, () {}),
            _buildMediaItem(LucideIcons.gamepad2, "Games", Colors.orangeAccent, () {}),
          ],
        ),
      ),
    );
  }

  Widget _buildMediaItem(IconData icon, String label, Color color, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Column(
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: color.withOpacity(0.15), shape: BoxShape.circle),
            child: Icon(icon, color: color, size: 22),
          ),
          const SizedBox(height: 8),
          Text(label, style: const TextStyle(color: Colors.white38, fontSize: 11)),
        ],
      ),
    );
  }

  Widget _buildActionButtons() {
    if (_messageController.text.trim().isNotEmpty) {
      return GestureDetector(
        onTap: () => _sendMessage(_messageController.text),
        child: Container(width: 44, height: 44, decoration: const BoxDecoration(shape: BoxShape.circle, gradient: LinearGradient(colors: [Color(0xFFC026D3), Color(0xFF7C3AED)])), child: const Icon(LucideIcons.send, color: Colors.white, size: 18)),
      );
    }
    return Row(
      children: [
        _buildCircularIcon(LucideIcons.languages, Colors.purple, () => setState(() => _isInlineTranslateEnabled = !_isInlineTranslateEnabled), active: _isInlineTranslateEnabled),
        const SizedBox(width: 10),
        _buildCircularIcon(LucideIcons.gift, Colors.pink, () => _showGiftPanel()),
      ],
    );
  }

  Widget _buildCircularIcon(IconData icon, Color color, VoidCallback onTap, {bool active = false}) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 42, height: 42,
        decoration: BoxDecoration(
          color: active ? color.withOpacity(0.3) : Colors.white.withOpacity(0.08),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: active ? color.withOpacity(0.6) : Colors.white.withOpacity(0.1)),
        ),
        child: Icon(icon, color: active ? Colors.white : Colors.white54, size: 20),
      ),
    );
  }

  void _sendMessage(String text) async {
    if (text.trim().isEmpty) return;
    final content = text.trim();
    _messageController.clear();
    setState(() {
      _inlineTranslation = "";
      _isMediaMenuOpen = false;
    });
    HapticFeedback.lightImpact();
    await _apiService.sendMessage(widget.conversationId, content);
  }

  void _showGiftPanel() async {
    final gifts = await _apiService.getChatGifts();
    if (!mounted) return;
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (context) => GiftPanel(
        isOpen: true,
        onClose: () => Navigator.pop(context),
        onSendGift: (g, count) async {
          Navigator.pop(context);
          HapticFeedback.mediumImpact();
          await _apiService.sendChatGift(conversationId: widget.conversationId, giftId: g['id'].toString(), receiverId: widget.otherUser['id']);
        },
        userCoins: 0,
      ),
    );
  }

  String _formatTime(dynamic timestamp) {
    if (timestamp == null) return "";
    final date = DateTime.parse(timestamp.toString()).toLocal();
    return "${date.hour}:${date.minute.toString().padLeft(2, '0')}";
  }
}

class BubbleTailPainter extends CustomPainter {
  final bool isMine;
  final Color color;
  BubbleTailPainter({required this.isMine, required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = color;
    final path = Path();
    if (isMine) {
      path.moveTo(0, 0);
      path.lineTo(size.width, 0);
      path.lineTo(0, size.height);
    } else {
      path.moveTo(size.width, 0);
      path.lineTo(0, 0);
      path.lineTo(size.width, size.height);
    }
    path.close();
    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
