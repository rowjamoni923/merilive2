
-- Add attachment and translation columns to support_messages
ALTER TABLE public.support_messages 
  ADD COLUMN IF NOT EXISTS attachment_url TEXT,
  ADD COLUMN IF NOT EXISTS attachment_type TEXT, -- 'image', 'voice', 'file'
  ADD COLUMN IF NOT EXISTS translated_content TEXT, -- Auto-translated content
  ADD COLUMN IF NOT EXISTS original_language TEXT, -- Detected source language code
  ADD COLUMN IF NOT EXISTS voice_transcript TEXT; -- Voice message transcription
