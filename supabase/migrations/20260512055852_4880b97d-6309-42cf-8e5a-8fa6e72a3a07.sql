CREATE OR REPLACE FUNCTION public.notify_on_gift_received()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- All gift contexts (live, party, call, reel, DM) render their own UI:
  -- - live/party/call → in-room scrolling gift feed + animation
  -- - DM → gift is delivered as a chat message ([Gift: ...])
  -- - reel → reel gift overlay
  -- Inserting a global notification row here causes duplicate top banners
  -- and repeating push notifications. Suppress entirely.
  RETURN NEW;
END;
$function$;