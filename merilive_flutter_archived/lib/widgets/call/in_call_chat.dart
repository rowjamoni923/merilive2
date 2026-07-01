import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:animate_do/animate_do.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../services/api_service.dart';

class InCallChat extends StatefulWidget {
  final bool isOpen;
  final VoidCallback onClose;
  final String callId;
  final String remoteUserName;
  final String? userName;

  const InCallChat({
    super.key,
    required this.isOpen,
    required this.onClose,
    required this.callId,
    required this.remoteUserName,
    this.userName,
  });

  @override
  State<InCallChat> createState() => _InCallChatState();
}

class _InCallChatState extends State<InCallChat> {
  final _api = ApiService();
  final _messageController = TextEditingController();
  final _scrollController = ScrollController();
  final List<Map<String, dynamic>> _messages = [];
  RealtimeChannel? _channel;

  @override
  void initState() {
    super.initState();
    _initChat();
  }

  void _initChat() {
    _channel = _api.supabase.channel('call-chat-${widget.callId}');
    _channel?.onBroadcast(
      event: 'call-message',
      callback: (payload) {
        if (mounted) {
          setState(() {
            _messages.add(payload);
          });
          _scrollToBottom();
        }
      },
    ).subscribe();
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

  void _sendMessage() {
    final text = _messageController.text.trim();
    if (text.isEmpty) return;

    final msg = {
      'senderId': _api.currentUserId,
      'senderName': widget.userName ?? 'User',
      'message': text,
      'timestamp': DateTime.now().millisecondsSinceEpoch,
    };

    setState(() {
      _messages.add(msg);
    });
    _messageController.clear();
    _scrollToBottom();

    _channel?.sendBroadcastEvent(event: 'call-message', payload: msg);
  }

  @override
  void dispose() {
    _channel?.unsubscribe();
    _messageController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.isOpen) return const SizedBox.shrink();

    return Positioned(
      bottom: 200, // Position above call controls
      left: 16,
      right: 16,
      child: FadeInUp(
        duration: const Duration(milliseconds: 400),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(24),
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
            child: Container(
              height: 300,
              decoration: BoxDecoration(
                color: Colors.black.withOpacity(0.6),
                border: Border.all(color: Colors.white.withOpacity(0.15)),
                borderRadius: BorderRadius.circular(24),
              ),
              child: Column(
                children: [
                  // Header
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          "Chat with ${widget.remoteUserName}",
                          style: GoogleFonts.outfit(color: Colors.white.withOpacity(0.9), fontSize: 13, fontWeight: FontWeight.bold),
                        ),
                        IconButton(
                          onPressed: widget.onClose,
                          icon: const Icon(LucideIcons.x, color: Colors.white38, size: 18),
                          constraints: const BoxConstraints(),
                          padding: EdgeInsets.zero,
                        ),
                      ],
                    ),
                  ),
                  const Divider(height: 1, color: Colors.white12),

                  // Messages
                  Expanded(
                    child: ListView.builder(
                      controller: _scrollController,
                      padding: const EdgeInsets.all(12),
                      itemCount: _messages.length,
                      itemBuilder: (context, index) {
                        final msg = _messages[index];
                        final isMe = msg['senderId'] == _api.currentUserId;

                        return Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: Align(
                            alignment: isMe ? Alignment.centerRight : Alignment.centerLeft,
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                              decoration: BoxDecoration(
                                gradient: isMe 
                                    ? const LinearGradient(colors: [Color(0xFF8B5CF6), Color(0xFFEC4899)])
                                    : null,
                                color: isMe ? null : Colors.white.withOpacity(0.15),
                                borderRadius: BorderRadius.circular(16).copyWith(
                                  bottomRight: isMe ? const Radius.circular(0) : const Radius.circular(16),
                                  bottomLeft: !isMe ? const Radius.circular(0) : const Radius.circular(16),
                                ),
                              ),
                              child: Column(
                                crossAxisAlignment: isMe ? CrossAxisAlignment.end : CrossAxisAlignment.start,
                                children: [
                                  if (!isMe)
                                    Padding(
                                      padding: const EdgeInsets.only(bottom: 2),
                                      child: Text(
                                        msg['senderName'],
                                        style: GoogleFonts.outfit(color: Colors.pinkAccent, fontSize: 10, fontWeight: FontWeight.bold),
                                      ),
                                    ),
                                  Text(
                                    msg['message'],
                                    style: GoogleFonts.outfit(color: Colors.white, fontSize: 13),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        );
                      },
                    ),
                  ),

                  // Input
                  Padding(
                    padding: const EdgeInsets.all(12),
                    child: Row(
                      children: [
                        Expanded(
                          child: Container(
                            height: 40,
                            decoration: BoxDecoration(
                              color: Colors.white.withOpacity(0.1),
                              borderRadius: BorderRadius.circular(20),
                              border: Border.all(color: Colors.white.withOpacity(0.1)),
                            ),
                            child: TextField(
                              controller: _messageController,
                              style: const TextStyle(color: Colors.white, fontSize: 13),
                              decoration: InputDecoration(
                                hintText: "Type a message...",
                                hintStyle: const TextStyle(color: Colors.white24, fontSize: 13),
                                contentPadding: const EdgeInsets.symmetric(horizontal: 16),
                                border: InputBorder.none,
                              ),
                              onSubmitted: (_) => _sendMessage(),
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        GestureDetector(
                          onTap: _sendMessage,
                          child: Container(
                            width: 40,
                            height: 40,
                            decoration: const BoxDecoration(
                              gradient: LinearGradient(colors: [Color(0xFF8B5CF6), Color(0xFFEC4899)]),
                              shape: BoxShape.circle,
                            ),
                            child: const Icon(LucideIcons.send, color: Colors.white, size: 18),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
