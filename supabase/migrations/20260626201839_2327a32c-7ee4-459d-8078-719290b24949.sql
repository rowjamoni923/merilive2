-- Stop direct messages from polluting the in-app Notifications tab.
-- DMs already render in the chat thread and fire a push, per user spec.
DROP TRIGGER IF EXISTS trigger_notify_direct_message_to_receiver ON public.messages;

-- Clean up existing DM rows that were inserted by the now-removed trigger
DELETE FROM public.notifications WHERE type = 'message';