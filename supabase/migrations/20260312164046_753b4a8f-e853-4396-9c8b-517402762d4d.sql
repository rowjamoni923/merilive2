
-- Add delivery status columns to messages table
ALTER TABLE public.messages 
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'sent',
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS read_at timestamptz;

-- Add index for efficient status queries
CREATE INDEX IF NOT EXISTS idx_messages_status ON public.messages (conversation_id, status) WHERE status != 'read';

-- Update existing messages: set read ones to 'read' status, others to 'sent'
UPDATE public.messages SET status = 'read', read_at = created_at WHERE is_read = true AND status = 'sent';

-- Create function to auto-update read_at when is_read changes (backward compatibility)
CREATE OR REPLACE FUNCTION public.sync_message_read_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.is_read = true AND OLD.is_read = false THEN
    NEW.status := 'read';
    NEW.read_at := COALESCE(NEW.read_at, now());
  END IF;
  RETURN NEW;
END;
$$;

-- Attach trigger
DROP TRIGGER IF EXISTS trg_sync_message_read_status ON public.messages;
CREATE TRIGGER trg_sync_message_read_status
  BEFORE UPDATE ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_message_read_status();

-- RPC to batch mark messages as delivered (called when recipient opens conversation)
CREATE OR REPLACE FUNCTION public.mark_messages_delivered(
  p_conversation_id uuid,
  p_recipient_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  affected_count integer;
BEGIN
  UPDATE public.messages
  SET 
    status = 'delivered',
    delivered_at = now()
  WHERE 
    conversation_id = p_conversation_id
    AND sender_id != p_recipient_id
    AND status = 'sent';
  
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  RETURN affected_count;
END;
$$;

-- RPC to batch mark messages as read (called when messages are visible on screen)
CREATE OR REPLACE FUNCTION public.mark_messages_read_batch(
  p_conversation_id uuid,
  p_recipient_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  affected_count integer;
BEGIN
  UPDATE public.messages
  SET 
    status = 'read',
    is_read = true,
    read_at = now(),
    delivered_at = COALESCE(delivered_at, now())
  WHERE 
    conversation_id = p_conversation_id
    AND sender_id != p_recipient_id
    AND status IN ('sent', 'delivered');
  
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  RETURN affected_count;
END;
$$;
