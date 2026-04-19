-- Helper accepted payment methods (tick-mark which gateways a Level 1-4 helper accepts)
CREATE TABLE IF NOT EXISTS public.helper_accepted_payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  helper_id UUID NOT NULL REFERENCES public.topup_helpers(id) ON DELETE CASCADE,
  gateway_id UUID NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(helper_id, gateway_id)
);

CREATE INDEX IF NOT EXISTS idx_helper_accepted_pm_helper ON public.helper_accepted_payment_methods(helper_id);
CREATE INDEX IF NOT EXISTS idx_helper_accepted_pm_gateway ON public.helper_accepted_payment_methods(gateway_id);

ALTER TABLE public.helper_accepted_payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view helper accepted methods"
ON public.helper_accepted_payment_methods
FOR SELECT
USING (true);

CREATE POLICY "Helpers can add their own accepted methods"
ON public.helper_accepted_payment_methods
FOR INSERT
WITH CHECK (
  EXISTS (SELECT 1 FROM public.topup_helpers th WHERE th.id = helper_accepted_payment_methods.helper_id AND th.user_id = auth.uid())
);

CREATE POLICY "Helpers can update their own accepted methods"
ON public.helper_accepted_payment_methods
FOR UPDATE
USING (
  EXISTS (SELECT 1 FROM public.topup_helpers th WHERE th.id = helper_accepted_payment_methods.helper_id AND th.user_id = auth.uid())
);

CREATE POLICY "Helpers can delete their own accepted methods"
ON public.helper_accepted_payment_methods
FOR DELETE
USING (
  EXISTS (SELECT 1 FROM public.topup_helpers th WHERE th.id = helper_accepted_payment_methods.helper_id AND th.user_id = auth.uid())
);

CREATE POLICY "Admins manage all helper accepted methods"
ON public.helper_accepted_payment_methods
FOR ALL
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER helper_accepted_pm_updated_at
BEFORE UPDATE ON public.helper_accepted_payment_methods
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.helper_accepted_payment_methods;
ALTER TABLE public.helper_accepted_payment_methods REPLICA IDENTITY FULL;