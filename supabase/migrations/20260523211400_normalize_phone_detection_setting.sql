-- Normalize phone_detection_enabled value: strip accidental JSON quotes
-- around the boolean string so the edge-function gate accepts it.
UPDATE public.app_settings
   SET setting_value = 'true'
 WHERE setting_key = 'phone_detection_enabled'
   AND setting_value IN ('"true"', '"TRUE"', '"True"');
