-- Drop the old constraint and add a new one that includes 'audio' and 'video'
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_message_type_check;

ALTER TABLE public.messages ADD CONSTRAINT messages_message_type_check 
CHECK (message_type = ANY (ARRAY['text'::text, 'image'::text, 'gift'::text, 'sticker'::text, 'audio'::text, 'video'::text]));