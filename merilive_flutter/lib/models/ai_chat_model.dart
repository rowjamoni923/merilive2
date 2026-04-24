/// AI assistant chat message used by the in-app AI helper.
/// Persisted in `public.messages` with `is_ai_reply = true` and a dedicated
/// system conversation OR ephemeral if the project chooses not to persist.
class AiChatMessage {
  final String role; // user | assistant | system
  final String content;
  final DateTime timestamp;

  AiChatMessage({
    required this.role,
    required this.content,
    DateTime? timestamp,
  }) : timestamp = timestamp ?? DateTime.now();

  Map<String, dynamic> toJson() => {
        'role': role,
        'content': content,
        'timestamp': timestamp.toIso8601String(),
      };

  factory AiChatMessage.fromJson(Map<String, dynamic> json) {
    return AiChatMessage(
      role: json['role'] ?? 'user',
      content: json['content'] ?? '',
      timestamp: json['timestamp'] != null
          ? DateTime.tryParse(json['timestamp']) ?? DateTime.now()
          : DateTime.now(),
    );
  }
}

/// Request body for the AI gateway edge function.
class AiChatRequest {
  final List<AiChatMessage> messages;
  final String? systemPrompt;
  final String model; // e.g. "google/gemini-2.5-flash"

  AiChatRequest({
    required this.messages,
    this.systemPrompt,
    this.model = 'google/gemini-2.5-flash',
  });

  Map<String, dynamic> toJson() => {
        'messages': [
          if (systemPrompt != null) {'role': 'system', 'content': systemPrompt},
          ...messages.map((m) => {'role': m.role, 'content': m.content}),
        ],
        'model': model,
      };
}
