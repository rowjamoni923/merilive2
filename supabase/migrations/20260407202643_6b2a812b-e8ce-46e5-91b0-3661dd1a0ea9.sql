CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  title text NOT NULL,
  message text,
  data jsonb,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.agencies DISABLE TRIGGER trg_admin_notify_new_agency;
ALTER TABLE public.agencies DISABLE TRIGGER trg_sync_agency_commission_rate;
ALTER TABLE public.agencies DISABLE TRIGGER trigger_auto_assign_agency_frame;
ALTER TABLE public.agencies DISABLE TRIGGER trigger_prevent_agency_balance_manipulation;
ALTER TABLE public.agencies DISABLE TRIGGER trigger_prevent_negative_agency_balance;
ALTER TABLE public.agencies DISABLE TRIGGER trigger_update_agency_level;
ALTER TABLE public.agencies DISABLE TRIGGER update_agencies_updated_at;