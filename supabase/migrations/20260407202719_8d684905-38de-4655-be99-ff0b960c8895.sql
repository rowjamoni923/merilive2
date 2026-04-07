ALTER TABLE public.agencies ENABLE TRIGGER trg_admin_notify_new_agency;
ALTER TABLE public.agencies ENABLE TRIGGER trg_sync_agency_commission_rate;
ALTER TABLE public.agencies ENABLE TRIGGER trigger_auto_assign_agency_frame;
ALTER TABLE public.agencies ENABLE TRIGGER trigger_prevent_agency_balance_manipulation;
ALTER TABLE public.agencies ENABLE TRIGGER trigger_prevent_negative_agency_balance;
ALTER TABLE public.agencies ENABLE TRIGGER trigger_update_agency_level;
ALTER TABLE public.agencies ENABLE TRIGGER update_agencies_updated_at;
ALTER TABLE public.agencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agencies ADD CONSTRAINT agencies_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE SET NULL NOT VALID;