-- Clean up old read notifications (older than 7 days)
DELETE FROM public.notifications 
WHERE is_read = true 
AND created_at < NOW() - INTERVAL '7 days';

-- Clean up old read helper notifications (older than 7 days)
DELETE FROM public.helper_notifications 
WHERE is_read = true 
AND created_at < NOW() - INTERVAL '7 days';

-- Auto-close support tickets that have been open/pending for more than 3 days with no recent user messages
UPDATE public.support_tickets 
SET status = 'closed', 
    updated_at = NOW()
WHERE status IN ('open', 'pending')
AND category = 'live_chat'
AND id NOT IN (
  SELECT DISTINCT ticket_id 
  FROM support_messages 
  WHERE sender_type = 'user' 
  AND created_at > NOW() - INTERVAL '3 days'
)
AND created_at < NOW() - INTERVAL '3 days';