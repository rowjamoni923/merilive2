import 'package:flutter/material.dart';

import 'party_number_warning_dialog.dart';


/// A8 — Glass composer for Party Room chat with quick-emoji row,
/// mirroring `ChametStyleChatPanel`'s input treatment.
class PartyChatComposer extends StatefulWidget {
  const PartyChatComposer({super.key, required this.onSend});
  final Future<void> Function(String text) onSend;

  @override
  State<PartyChatComposer> createState() => _PartyChatComposerState();
}

class _PartyChatComposerState extends State<PartyChatComposer> {
  static const _quickEmojis = ['😊', '🥰', '😍', '🤩', '🥳', '😭', '🔥', '❤️', '👏'];

  final _controller = TextEditingController();
  bool _sending = false;

  Future<void> _submit() async {
    final t = _controller.text.trim();
    if (t.isEmpty || _sending) return;
    setState(() => _sending = true);
    _controller.clear();
    try {
      await widget.onSend(t);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Message failed to send')),
        );
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  void _addEmoji(String e) {
    final text = _controller.text + e;
    _controller.value = TextEditingValue(
      text: text,
      selection: TextSelection.collapsed(offset: text.length),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        SizedBox(
          height: 34,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 4),
            itemCount: _quickEmojis.length,
            separatorBuilder: (_, __) => const SizedBox(width: 6),
            itemBuilder: (_, i) => InkResponse(
              radius: 20,
              onTap: () => _addEmoji(_quickEmojis[i]),
              child: Container(
                width: 30,
                height: 30,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.08),
                  shape: BoxShape.circle,
                  border: Border.all(color: Colors.white24),
                ),
                child: Text(_quickEmojis[i],
                    style: const TextStyle(fontSize: 15)),
              ),
            ),
          ),
        ),
        const SizedBox(height: 6),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
          decoration: BoxDecoration(
            color: Colors.black.withValues(alpha: 0.55),
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: Colors.white24),
          ),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _controller,
                  maxLength: 200,
                  minLines: 1,
                  maxLines: 3,
                  textInputAction: TextInputAction.send,
                  onSubmitted: (_) => _submit(),
                  style: const TextStyle(color: Colors.white, fontSize: 13.5),
                  decoration: const InputDecoration(
                    counterText: '',
                    isCollapsed: true,
                    border: InputBorder.none,
                    hintText: 'Say something…',
                    hintStyle:
                        TextStyle(color: Colors.white54, fontSize: 13.5),
                  ),
                ),
              ),
              const SizedBox(width: 6),
              InkResponse(
                radius: 22,
                onTap: _sending ? null : _submit,
                child: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: const BoxDecoration(
                    gradient: LinearGradient(colors: [
                      Color(0xFFEC4899),
                      Color(0xFF8B5CF6),
                    ]),
                    shape: BoxShape.circle,
                  ),
                  child: _sending
                      ? const SizedBox(
                          width: 14,
                          height: 14,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: Colors.white),
                        )
                      : const Icon(Icons.send_rounded,
                          color: Colors.white, size: 16),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
