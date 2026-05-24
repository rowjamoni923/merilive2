CREATE TABLE IF NOT EXISTS public.notification_push_dispatches (
  notification_id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_push_dispatches ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.notification_push_dispatches FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.notification_push_dispatches TO service_role;