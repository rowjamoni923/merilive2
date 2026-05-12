-- Enable AWS Rekognition auto-approve for face verification
INSERT INTO public.app_settings (setting_key, setting_value)
VALUES ('face_verification_auto_approve_enabled', 'true')
ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value;