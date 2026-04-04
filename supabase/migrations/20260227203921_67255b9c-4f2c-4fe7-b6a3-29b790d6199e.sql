
-- Add sender_sector column to support_tickets
ALTER TABLE public.support_tickets 
ADD COLUMN IF NOT EXISTS sender_sector text DEFAULT 'user';

-- Backfill existing tickets based on user type
-- 1. Mark helpers
UPDATE public.support_tickets st
SET sender_sector = 'helper'
FROM public.topup_helpers th
WHERE th.user_id = st.user_id;

-- 2. Mark agency owners
UPDATE public.support_tickets st
SET sender_sector = 'agency'
FROM public.agencies a
WHERE a.owner_id = st.user_id
AND st.sender_sector = 'user';

-- 3. Mark hosts
UPDATE public.support_tickets st
SET sender_sector = 'host'
FROM public.profiles p
WHERE p.id = st.user_id
AND p.is_host = true
AND st.sender_sector = 'user';
