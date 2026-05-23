-- V2 AI Moderator: seed config row (disabled by default for safety)
INSERT INTO public.live_moderation_settings (setting_key, setting_value, is_active, description)
SELECT
  'ai_moderator_config',
  jsonb_build_object(
    'enabled', false,
    'model', 'google/gemini-2.5-flash',
    'mute_duration_sec', 300,
    'system_prompt', 'You are a strict but fair live-stream chat moderator for a Bangla/English social app. Classify the chat message and return action+severity+reason+categories.

Actions:
- allow: clean, normal social chat (greetings, banter, emojis)
- warn: mild profanity or borderline content (no enforcement, just logged)
- mute: profanity, harassment, sexual content, contact info sharing (phone/email/whatsapp/telegram), solicitation, scam links -> mute mic 5 min
- kick: hate speech, threats, doxxing, CSAM hints, repeated severe violations -> remove from room

Severity: 0 (clean) to 100 (extreme). Be context-aware — Bangla slang is not always profanity. Sharing of personal contact info (phone, social handles) in public live = mute.
Reason: max 140 chars, plain text, no markdown.'
  ),
  true,
  'AI Chat Moderator config — toggle enabled=true to turn on. Edit system_prompt to tune behavior without redeploy.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.live_moderation_settings WHERE setting_key = 'ai_moderator_config'
);