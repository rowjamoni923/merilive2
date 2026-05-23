INSERT INTO public.live_moderation_settings (setting_key, setting_value, description, is_active)
SELECT
  'ai_moderator_config',
  jsonb_build_object(
    'enabled', false,
    'model', 'google/gemini-3-flash-preview',
    'system_prompt', 'You are a strict but fair chat moderator for a live-streaming app. Classify each chat message into one of: allow, warn, mute, kick. Severity rules: allow = friendly/neutral/normal banter, mild emoji spam; warn = mild profanity, mild flirting, single-letter spam; mute = repeated profanity, harassment, hate speech, sexual solicitation, sharing phone/whatsapp/telegram; kick = explicit threats, doxxing, CSAM hints, scam links, repeated kick-worthy after mute. Output ONLY via the classify_message tool.',
    'mute_duration_sec', 300,
    'max_warns_before_mute', 2,
    'max_mutes_before_kick', 2,
    'languages', jsonb_build_array('en','bn','hi','ur','ar','es','id')
  ),
  'AI Chat Moderator (LiveKit Agent worker) — toggle, prompt, thresholds',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.live_moderation_settings WHERE setting_key = 'ai_moderator_config'
);