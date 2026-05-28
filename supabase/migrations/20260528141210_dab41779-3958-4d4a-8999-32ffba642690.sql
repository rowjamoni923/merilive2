DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.user_beans_exchange_tiers'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE public.user_beans_exchange_tiers
    ADD CONSTRAINT user_beans_exchange_tiers_pkey PRIMARY KEY (id);
  END IF;
END;
$$;

GRANT SELECT ON public.user_beans_exchange_tiers TO anon, authenticated;
GRANT ALL ON public.user_beans_exchange_tiers TO service_role;
GRANT SELECT ON public.user_beans_exchange_history TO authenticated;
GRANT ALL ON public.user_beans_exchange_history TO service_role;

CREATE TABLE IF NOT EXISTS public.user_beans_exchanges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  beans_amount integer NOT NULL CHECK (beans_amount > 0),
  diamonds_reward integer NOT NULL CHECK (diamonds_reward > 0),
  exchange_rate numeric NOT NULL CHECK (exchange_rate > 0),
  tier_id uuid NULL REFERENCES public.user_beans_exchange_tiers(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','failed','reversed')),
  destination_type text NULL,
  completed_at timestamptz NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.user_beans_exchanges TO authenticated;
GRANT ALL ON public.user_beans_exchanges TO service_role;

ALTER TABLE public.user_beans_exchanges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own beans exchanges" ON public.user_beans_exchanges;
CREATE POLICY "Users can view own beans exchanges"
ON public.user_beans_exchanges
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view beans exchanges" ON public.user_beans_exchanges;
CREATE POLICY "Admins can view beans exchanges"
ON public.user_beans_exchanges
FOR SELECT
TO authenticated
USING (
  public.is_admin(auth.uid())
  OR public.current_admin_id_from_header() IS NOT NULL
);

DROP POLICY IF EXISTS "No direct beans exchange writes" ON public.user_beans_exchanges;
CREATE POLICY "No direct beans exchange writes"
ON public.user_beans_exchanges
FOR INSERT
TO authenticated
WITH CHECK (false);

CREATE INDEX IF NOT EXISTS idx_user_beans_exchanges_user_created
ON public.user_beans_exchanges(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_beans_exchanges_completed_at
ON public.user_beans_exchanges(completed_at DESC);

INSERT INTO public.user_beans_exchanges (
  user_id,
  beans_amount,
  diamonds_reward,
  exchange_rate,
  tier_id,
  status,
  completed_at,
  created_at,
  destination_type
)
SELECT
  h.user_id,
  h.beans_amount,
  h.diamonds_received,
  h.exchange_rate,
  h.tier_id,
  'completed',
  h.created_at,
  h.created_at,
  h.destination_type
FROM public.user_beans_exchange_history h
WHERE NOT EXISTS (
  SELECT 1
  FROM public.user_beans_exchanges e
  WHERE e.user_id = h.user_id
    AND e.beans_amount = h.beans_amount
    AND e.diamonds_reward = h.diamonds_received
    AND e.created_at = h.created_at
);