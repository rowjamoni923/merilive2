
-- Drop legacy 5-arg bill_pk_gift (gift-service only calls 6-arg)
DROP FUNCTION IF EXISTS public.bill_pk_gift(uuid, uuid, uuid, uuid, bigint);

-- Drop unused pk_match_queue_* RPCs (table never existed in current schema)
DROP FUNCTION IF EXISTS public.pk_match_queue_join(uuid);
DROP FUNCTION IF EXISTS public.pk_match_queue_join(text);
DROP FUNCTION IF EXISTS public.pk_match_queue_leave();
DROP FUNCTION IF EXISTS public.pk_match_queue_poll();
