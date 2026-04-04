-- Update feature_level_requirements to English
UPDATE public.feature_level_requirements SET
  feature_name = 'Go Live',
  feature_description = 'Minimum level required to start live streaming'
WHERE feature_key = 'go_live';

UPDATE public.feature_level_requirements SET
  feature_description = 'Minimum level required to create a new party room'
WHERE feature_key = 'create_party';

UPDATE public.feature_level_requirements SET
  feature_description = 'Minimum level required to join party rooms'
WHERE feature_key = 'join_party';

UPDATE public.feature_level_requirements SET
  feature_description = 'Minimum level required to make private calls'
WHERE feature_key = 'private_call';

UPDATE public.feature_level_requirements SET
  feature_description = 'Minimum level required to send gifts'
WHERE feature_key = 'send_gift';

UPDATE public.feature_level_requirements SET
  feature_description = 'Minimum level required to chat in live streams'
WHERE feature_key = 'chat_message';