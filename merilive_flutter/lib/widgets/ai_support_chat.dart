import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:image_picker/image_picker.dart';
import 'package:record/record.dart';
import 'package:audioplayers/audioplayers.dart';
import 'package:path_provider/path_provider.dart';
import 'package:intl/intl.dart';
import '../services/api_service.dart';

class AISupportChat extends StatefulWidget {
  final int userLevel;
  final String userName;
  final VoidCallback onClose;

  const AISupportChat({
    super.key,
    required this.userLevel,
    required this.userName,
    required this.onClose,
  });

  @override
  State<AISupportChat> createState() => _AISupportChatState();
}

class _AISupportChatState extends State<AISupportChat> {
  final ApiService _api = ApiService();
  final TextEditingController _inputController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  final AudioRecorder _recorder = AudioRecorder();
  final AudioPlayer _audioPlayer = AudioPlayer();
  
  List<Map<String, dynamic>> _messages = [];
  bool _isLoading = false;
  String _phase = "category"; // category, describe, ai_chat, live_chat
  String? _selectedCategory;
  String? _ticketId;
  String? _ticketStatus;
  bool _waitingForAdmin = false;
  DateTime? _waitStartTime;
  String _waitElapsed = "00:00";
  Timer? _waitTimer;
  StreamSubscription? _messageSubscription;

  final List<Map<String, dynamic>> _categories = [
    {"icon": "💰", "label": "Diamond / Recharge Issue", "key": "coin_recharge"},
    {"icon": "📤", "label": "Withdrawal Problem", "key": "withdrawal"},
    {"icon": "👤", "label": "Account / Profile Issue", "key": "account"},
    {"icon": "🏢", "label": "Agency Issue", "key": "agency"},
    {"icon": "📺", "label": "Live Stream / Call Issue", "key": "livestream"},
    {"icon": "🎮", "label": "Game Issue", "key": "game"},
    {"icon": "⚠️", "label": "Report a User", "key": "report"},
    {"icon": "❓", "label": "Other Problem", "key": "other"},
  ];

  @override
  void initState() {
    super.initState();
    _addInitialMessage();
  }

  @override
  void dispose() {
    _inputController.dispose();
    _scrollController.dispose();
    _recorder.dispose();
    _audioPlayer.dispose();
    _waitTimer?.cancel();
    _messageSubscription?.cancel();
    super.dispose();
  }

  void _addInitialMessage() {
    _messages.add({
      "role": "assistant",
      "content": "Hello ${widget.userName}! 👋 I'm your MeriLive AI assistant. How can I help you today?",
      "timestamp": DateTime.now(),
    });
  }

  void _scrollToBottom() {
    Future.delayed(const Duration(milliseconds: 100), () {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  void _setupRealtime() {
    if (_ticketId == null) return;
    _messageSubscription?.cancel();
    _messageSubscription = _api.getSupabase()
        .channel('support-chat-$_ticketId')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'support_messages',
          filter: PostgresChangeFilter(type: PostgresChangeFilterType.eq, column: 'ticket_id', value: _ticketId),
          callback: (payload) {
            final newMsg = payload.newRecord;
            if (newMsg['sender_type'] == 'admin') {
              setState(() {
                _waitingForAdmin = false;
                _messages.add({
                  "role": "admin",
                  "content": newMsg['translated_content'] ?? newMsg['content'],
                  "timestamp": DateTime.parse(newMsg['created_at']),
                  "attachmentUrl": newMsg['attachment_url'],
                  "attachmentType": newMsg['attachment_type'],
                });
              });
              _scrollToBottom();
            }
          },
        )
        .subscribe();
  }

  Future<void> _activateLiveChat() async {
    setState(() {
      _phase = "live_chat";
      _waitingForAdmin = true;
      _waitStartTime = DateTime.now();
    });

    _startWaitTimer();

    try {
      final res = await _api.createSupportTicket("Live Chat", _selectedCategory ?? "other");
      if (res['success']) {
        _ticketId = res['data']['id'].toString();
        _setupRealtime();
        
        // Send previous context to DB if needed
        for (var msg in _messages.where((m) => m['role'] == 'user')) {
          await _api.sendSupportMessage(
            ticketId: _ticketId!,
            content: msg['content'],
            attachmentUrl: msg['attachmentUrl'],
            attachmentType: msg['attachmentType'],
          );
        }
      }
    } catch (e) {
      debugPrint("Live chat error: $e");
    }
  }

  void _startWaitTimer() {
    _waitTimer?.cancel();
    _waitTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (_waitStartTime != null) {
        final diff = DateTime.now().difference(_waitStartTime!);
        final mins = diff.inMinutes.toString().padLeft(2, '0');
        final secs = (diff.inSeconds % 60).toString().padLeft(2, '0');
        if (mounted) setState(() => _waitElapsed = "$mins:$secs");
      }
    });
  }

  Future<void> _sendMessage(String text) async {
    if (text.trim().isEmpty) return;
    
    final bool isLiveChatKeyword = ["live chat", "admin", "agent", "human"].any((kw) => text.toLowerCase().contains(kw));
    
    setState(() {
      _messages.add({
        "role": "user",
        "content": text.trim(),
        "timestamp": DateTime.now(),
      });
      _inputController.clear();
      if (_phase == "describe") _phase = "ai_chat";
    });
    _scrollToBottom();

    if (isLiveChatKeyword && _phase != "live_chat") {
      await _activateLiveChat();
      return;
    }

    if (_phase == "live_chat" && _ticketId != null) {
      await _api.sendSupportMessage(ticketId: _ticketId!, content: text.trim());
      return;
    }

    // AI Logic (Simulation for now or use edge function if available)
    setState(() => _isLoading = true);
    await Future.delayed(const Duration(seconds: 1)); // Simulate
    
    setState(() {
      _messages.add({
        "role": "assistant",
        "content": "I've noted your issue regarding **${_selectedCategory ?? 'General'}**. If you'd like to speak with a human agent, just type 'Live Chat'.",
        "timestamp": DateTime.now(),
      });
      _isLoading = false;
    });
    _scrollToBottom();
  }

  Future<void> _pickImage() async {
    final picker = ImagePicker();
    final image = await picker.pickImage(source: ImageSource.gallery);
    if (image == null) return;

    // In a real app, upload to Supabase storage here
    setState(() {
      _messages.add({
        "role": "user",
        "content": "📷 Sent an image",
        "timestamp": DateTime.now(),
        "attachmentUrl": image.path, // Local path for preview
        "attachmentType": "image",
      });
    });
    _scrollToBottom();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        backgroundColor: _phase == "live_chat" ? Colors.green.withOpacity(0.1) : Colors.transparent,
        elevation: 0,
        leading: IconButton(icon: const Icon(LucideIcons.arrowLeft, color: Colors.white), onPressed: widget.onClose),
        title: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(color: _phase == "live_chat" ? Colors.green : Colors.blue, shape: BoxShape.circle),
              child: Icon(_phase == "live_chat" ? LucideIcons.headphones : LucideIcons.bot, color: Colors.white, size: 16),
            ),
            const SizedBox(width: 12),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(_phase == "live_chat" ? "Live Agent" : "AI Support", style: GoogleFonts.outfit(color: Colors.white, fontSize: 14, fontWeight: FontWeight.bold)),
                Text(_phase == "live_chat" ? "Connecting..." : "Online", style: GoogleFonts.outfit(color: Colors.green, fontSize: 10, fontWeight: FontWeight.bold)),
              ],
            ),
          ],
        ),
      ),
      body: Column(
        children: [
          if (_phase == "live_chat" && _waitingForAdmin) _buildWaitTimer(),
          Expanded(
            child: _phase == "category" ? _buildCategoryGrid() : _buildMessageList(),
          ),
          if (_phase != "category") _buildInputArea(),
        ],
      ),
    );
  }

  Widget _buildWaitTimer() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 12),
      color: Colors.amber.withOpacity(0.1),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(LucideIcons.clock, color: Colors.amber, size: 14),
          const SizedBox(width: 8),
          Text("Wait Time: $_waitElapsed (Connecting to human agent)", style: GoogleFonts.outfit(color: Colors.amber, fontSize: 11, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }

  Widget _buildCategoryGrid() {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text("SELECT A CATEGORY", style: GoogleFonts.outfit(color: Colors.white38, fontSize: 11, fontWeight: FontWeight.w900, letterSpacing: 1)),
          const SizedBox(height: 20),
          Expanded(
            child: GridView.builder(
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 2, crossAxisSpacing: 16, mainAxisSpacing: 16, childAspectRatio: 1.5),
              itemCount: _categories.length,
              itemBuilder: (context, index) {
                final cat = _categories[index];
                return FadeInUp(
                  delay: Duration(milliseconds: index * 50),
                  child: GestureDetector(
                    onTap: () {
                      setState(() {
                        _selectedCategory = cat['key'];
                        _phase = "describe";
                        _messages.add({
                          "role": "assistant",
                          "content": "You selected **${cat['label']}**. Please describe your issue in detail so I can help you better.",
                          "timestamp": DateTime.now(),
                        });
                      });
                    },
                    child: Container(
                      decoration: BoxDecoration(color: Colors.white.withOpacity(0.03), borderRadius: BorderRadius.circular(20), border: Border.all(color: Colors.white.withOpacity(0.05))),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text(cat['icon'], style: const TextStyle(fontSize: 24)),
                          const SizedBox(height: 8),
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 10),
                            child: Text(cat['label'], textAlign: TextAlign.center, style: GoogleFonts.outfit(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold)),
                          ),
                        ],
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMessageList() {
    return ListView.builder(
      controller: _scrollController,
      padding: const EdgeInsets.all(20),
      itemCount: _messages.length + (_isLoading ? 1 : 0),
      itemBuilder: (context, index) {
        if (index == _messages.length) return _buildTypingIndicator();
        final msg = _messages[index];
        final bool isUser = msg['role'] == 'user';
        return _buildChatBubble(msg, isUser);
      },
    );
  }

  Widget _buildChatBubble(Map<String, dynamic> msg, bool isUser) {
    return FadeInUp(
      duration: const Duration(milliseconds: 300),
      child: Container(
        margin: const EdgeInsets.only(bottom: 20),
        alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
        child: Row(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (!isUser) _avatar(msg['role']),
            if (!isUser) const SizedBox(width: 12),
            Flexible(
              child: Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: isUser ? Colors.blue : Colors.white.withOpacity(0.05),
                  borderRadius: BorderRadius.only(
                    topLeft: const Radius.circular(20),
                    topRight: const Radius.circular(20),
                    bottomLeft: Radius.circular(isUser ? 20 : 0),
                    bottomRight: Radius.circular(isUser ? 0 : 20),
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (msg['attachmentUrl'] != null && msg['attachmentType'] == 'image')
                      ClipRRect(
                        borderRadius: BorderRadius.circular(12),
                        child: Image.file(File(msg['attachmentUrl']), width: 200, fit: BoxFit.cover),
                      ),
                    if (msg['attachmentUrl'] != null && msg['attachmentType'] == 'image') const SizedBox(height: 10),
                    Text(msg['content'], style: GoogleFonts.outfit(color: Colors.white, fontSize: 13, height: 1.5)),
                    const SizedBox(height: 4),
                    Text(DateFormat('hh:mm a').format(msg['timestamp']), style: TextStyle(color: Colors.white38, fontSize: 9)),
                  ],
                ),
              ),
            ),
            if (isUser) const SizedBox(width: 12),
            if (isUser) _avatar('user'),
          ],
        ),
      ),
    );
  }

  Widget _avatar(String role) {
    IconData icon = LucideIcons.user;
    Color color = Colors.grey;
    if (role == 'assistant') { icon = LucideIcons.bot; color = Colors.blue; }
    if (role == 'admin') { icon = LucideIcons.headphones; color = Colors.green; }
    
    return Container(
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(color: color.withOpacity(0.1), shape: BoxShape.circle),
      child: Icon(icon, color: color, size: 16),
    );
  }

  Widget _buildTypingIndicator() {
    return Padding(
      padding: const EdgeInsets.only(bottom: 20),
      child: Row(
        children: [
          _avatar('assistant'),
          const SizedBox(width: 12),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(20)),
            child: const Text("...", style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
  }

  Widget _buildInputArea() {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(color: const Color(0xFF1E293B), border: Border(top: BorderSide(color: Colors.white.withOpacity(0.05)))),
      child: SafeArea(
        child: Row(
          children: [
            IconButton(icon: const Icon(LucideIcons.image, color: Colors.white38, size: 20), onPressed: _pickImage),
            IconButton(icon: const Icon(LucideIcons.mic, color: Colors.white38, size: 20), onPressed: () {}),
            const SizedBox(width: 8),
            Expanded(
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                decoration: BoxDecoration(color: Colors.black.withOpacity(0.3), borderRadius: BorderRadius.circular(24)),
                child: TextField(
                  controller: _inputController,
                  style: const TextStyle(color: Colors.white, fontSize: 13),
                  decoration: const InputDecoration(border: InputBorder.none, hintText: "Describe your issue...", hintStyle: TextStyle(color: Colors.white24, fontSize: 13)),
                  onSubmitted: _sendMessage,
                ),
              ),
            ),
            const SizedBox(width: 8),
            IconButton(
              icon: const Icon(LucideIcons.send, color: Colors.blue, size: 24),
              onPressed: () => _sendMessage(_inputController.text),
            ),
          ],
        ),
      ),
    );
  }
}
