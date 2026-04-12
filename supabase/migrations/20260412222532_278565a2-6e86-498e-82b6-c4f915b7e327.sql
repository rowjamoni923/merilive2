-- First, clean up any duplicate rows keeping only the latest
DELETE FROM public.user_login_streaks a
USING public.user_login_streaks b
WHERE a.ctid < b.ctid AND a.user_id = b.user_id;

-- Add the unique constraint that the RPC needs for ON CONFLICT
ALTER TABLE public.user_login_streaks
ADD CONSTRAINT user_login_streaks_user_id_key UNIQUE (user_id);