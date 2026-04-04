
-- Add encryption metadata to messages table
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS is_encrypted boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS encryption_version smallint DEFAULT 1;

-- Add encryption metadata to group_messages table
ALTER TABLE public.group_messages 
ADD COLUMN IF NOT EXISTS is_encrypted boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS encryption_version smallint DEFAULT 1;

-- Create conversation encryption keys table for key exchange
CREATE TABLE IF NOT EXISTS public.conversation_encryption_keys (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id uuid NOT NULL,
  user_id uuid NOT NULL,
  encrypted_key text NOT NULL,
  key_version smallint DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(conversation_id, user_id)
);

-- Enable RLS
ALTER TABLE public.conversation_encryption_keys ENABLE ROW LEVEL SECURITY;

-- Users can only access their own encryption keys
CREATE POLICY "Users can view own encryption keys"
ON public.conversation_encryption_keys
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own encryption keys"
ON public.conversation_encryption_keys
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own encryption keys"
ON public.conversation_encryption_keys
FOR UPDATE USING (auth.uid() = user_id);

-- Index for fast key lookup
CREATE INDEX IF NOT EXISTS idx_conv_encryption_keys_lookup 
ON public.conversation_encryption_keys (conversation_id, user_id);

-- Add index on is_encrypted for filtering
CREATE INDEX IF NOT EXISTS idx_messages_encrypted ON public.messages (is_encrypted) WHERE is_encrypted = true;
CREATE INDEX IF NOT EXISTS idx_group_messages_encrypted ON public.group_messages (is_encrypted) WHERE is_encrypted = true;
