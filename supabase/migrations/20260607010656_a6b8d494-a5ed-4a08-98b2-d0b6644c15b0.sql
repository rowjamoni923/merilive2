-- J2: message-push dedup
CREATE TABLE IF NOT EXISTS public.message_push_dispatches (
  message_id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.message_push_dispatches TO service_role;

ALTER TABLE public.message_push_dispatches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only"
ON public.message_push_dispatches
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Auto-prune rows older than 24h (best-effort, runs on insert)
CREATE OR REPLACE FUNCTION public.prune_old_message_push_dispatches()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF random() < 0.01 THEN
    DELETE FROM public.message_push_dispatches WHERE created_at < now() - interval '24 hours';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prune_message_push_dispatches
AFTER INSERT ON public.message_push_dispatches
FOR EACH ROW EXECUTE FUNCTION public.prune_old_message_push_dispatches();