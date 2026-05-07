DROP FUNCTION IF EXISTS public.approve_host_request(uuid, uuid, uuid);

CREATE TABLE IF NOT EXISTS public.agency_host_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies (id) ON DELETE CASCADE,
  host_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'::text
    CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'declined'::text])),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agency_host_requests_agency
  ON public.agency_host_requests (agency_id);

CREATE UNIQUE INDEX IF NOT EXISTS agency_host_requests_one_pending_per_pair
  ON public.agency_host_requests (agency_id, host_id)
  WHERE (status = 'pending'::text);

DROP TRIGGER IF EXISTS trg_agency_host_requests_updated_at ON public.agency_host_requests;
CREATE TRIGGER trg_agency_host_requests_updated_at
  BEFORE UPDATE ON public.agency_host_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.agency_host_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agency owners read host requests" ON public.agency_host_requests;
CREATE POLICY "Agency owners read host requests"
  ON public.agency_host_requests FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.agencies a WHERE a.id = agency_host_requests.agency_id AND a.owner_id = auth.uid()));

DROP POLICY IF EXISTS "Hosts read own join requests" ON public.agency_host_requests;
CREATE POLICY "Hosts read own join requests"
  ON public.agency_host_requests FOR SELECT TO authenticated
  USING (host_id = auth.uid());

DROP POLICY IF EXISTS "Agency owners update host requests" ON public.agency_host_requests;
CREATE POLICY "Agency owners update host requests"
  ON public.agency_host_requests FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.agencies a WHERE a.id = agency_host_requests.agency_id AND a.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.agencies a WHERE a.id = agency_host_requests.agency_id AND a.owner_id = auth.uid()));

REVOKE ALL ON public.agency_host_requests FROM PUBLIC;
GRANT SELECT, UPDATE ON public.agency_host_requests TO authenticated;

INSERT INTO public.agency_host_requests (agency_id, host_id, status, created_at)
SELECT ah.agency_id, ah.host_id, 'pending'::text, COALESCE(ah.joined_at, now())
FROM public.agency_hosts ah
WHERE ah.status = 'pending'::text
  AND NOT EXISTS (
    SELECT 1 FROM public.agency_host_requests r
    WHERE r.agency_id = ah.agency_id AND r.host_id = ah.host_id AND r.status = 'pending'::text
  );

CREATE OR REPLACE FUNCTION public.sync_agency_host_request_from_membership()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'pending'::text THEN
    INSERT INTO public.agency_host_requests (agency_id, host_id, status)
    SELECT NEW.agency_id, NEW.host_id, 'pending'::text
    WHERE NOT EXISTS (
      SELECT 1 FROM public.agency_host_requests r
      WHERE r.agency_id = NEW.agency_id AND r.host_id = NEW.host_id AND r.status = 'pending'::text
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agency_hosts_sync_host_request ON public.agency_hosts;
CREATE TRIGGER trg_agency_hosts_sync_host_request
  AFTER INSERT ON public.agency_hosts
  FOR EACH ROW EXECUTE FUNCTION public.sync_agency_host_request_from_membership();

CREATE OR REPLACE FUNCTION public.agency_host_management_stats(p_agency_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _owner uuid; _total int; _active7 int; _pending int;
BEGIN
  IF p_agency_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'agency_id required');
  END IF;
  SELECT a.owner_id INTO _owner FROM public.agencies a
  WHERE a.id = p_agency_id AND COALESCE(a.is_blocked, false) = false;
  IF _owner IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agency not found');
  END IF;
  IF _owner IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  SELECT count(*)::int INTO _total FROM public.agency_hosts ah
  WHERE ah.agency_id = p_agency_id AND ah.status = 'active'::text;
  SELECT count(*)::int INTO _active7
  FROM public.agency_hosts ah
  JOIN public.profiles p ON p.id = ah.host_id
  WHERE ah.agency_id = p_agency_id AND ah.status = 'active'::text
    AND COALESCE(p.last_active_at, p.last_seen_at, p.last_seen::timestamptz) >= (now() - interval '7 days');
  SELECT count(*)::int INTO _pending FROM public.agency_host_requests r
  WHERE r.agency_id = p_agency_id AND r.status = 'pending'::text;
  RETURN jsonb_build_object('success', true, 'total_hosts', COALESCE(_total, 0),
    'active_7d', COALESCE(_active7, 0), 'pending_requests', COALESCE(_pending, 0));
END;
$$;

GRANT EXECUTE ON FUNCTION public.agency_host_management_stats(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_host_request(p_request_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _rid uuid; _agency_id uuid; _host_id uuid; _agency_owner_id uuid;
  _agency_name text; _referral_code_used text;
BEGIN
  SELECT r.id, r.agency_id, r.host_id INTO _rid, _agency_id, _host_id
  FROM public.agency_host_requests r
  WHERE r.id = p_request_id AND r.status = 'pending'::text FOR UPDATE;
  IF _rid IS NULL THEN RETURN false; END IF;
  SELECT a.owner_id, a.name INTO _agency_owner_id, _agency_name
  FROM public.agencies a WHERE a.id = _agency_id;
  IF _agency_owner_id IS DISTINCT FROM auth.uid() THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.agency_hosts ah
    WHERE ah.agency_id = _agency_id AND ah.host_id = _host_id AND ah.status = 'pending'::text) THEN
    RETURN false;
  END IF;
  UPDATE public.agency_host_requests SET status = 'approved'::text, updated_at = now() WHERE id = _rid;
  SELECT ah.referral_code INTO _referral_code_used FROM public.agency_hosts ah
  WHERE ah.agency_id = _agency_id AND ah.host_id = _host_id AND ah.status = 'pending'::text LIMIT 1;
  UPDATE public.agency_hosts ah SET status = 'active'::text, joined_at = COALESCE(ah.joined_at, now())
  WHERE ah.agency_id = _agency_id AND ah.host_id = _host_id AND ah.status = 'pending'::text;
  UPDATE public.profiles SET agency_id = _agency_id WHERE id = _host_id;
  UPDATE public.agencies SET total_hosts = COALESCE(total_hosts, 0) + 1 WHERE id = _agency_id;
  IF _referral_code_used IS NOT NULL AND btrim(_referral_code_used) <> ''::text THEN
    UPDATE public.sub_agents sa SET total_referrals = COALESCE(sa.total_referrals, 0) + 1
    WHERE sa.referral_code = _referral_code_used AND sa.agency_id = _agency_id AND sa.status = 'active'::text;
  END IF;
  INSERT INTO public.notifications (user_id, type, title, message, data, is_read)
  VALUES (_host_id, 'agency_joined', '🎉 Agency Request Approved!',
    'You have been approved to join ' || COALESCE(_agency_name, 'the agency') || '. Welcome!',
    jsonb_build_object('agency_id', _agency_id, 'agency_name', _agency_name, 'action_url', '/agency'), false);
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_host_request(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_host_request(_agency_id uuid, _host_id uuid, _approver_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _agency_owner_id uuid; _agency_name text; _referral_code_used text;
BEGIN
  SELECT owner_id, name INTO _agency_owner_id, _agency_name FROM public.agencies WHERE id = _agency_id;
  IF _agency_owner_id IS DISTINCT FROM _approver_id THEN RETURN false; END IF;
  SELECT referral_code INTO _referral_code_used FROM public.agency_hosts
  WHERE agency_id = _agency_id AND host_id = _host_id AND status = 'pending'::text;
  UPDATE public.agency_hosts SET status = 'active'::text, joined_at = now()
  WHERE agency_id = _agency_id AND host_id = _host_id AND status = 'pending'::text;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE public.agency_host_requests SET status = 'approved'::text, updated_at = now()
  WHERE agency_id = _agency_id AND host_id = _host_id AND status = 'pending'::text;
  UPDATE public.profiles SET agency_id = _agency_id WHERE id = _host_id;
  UPDATE public.agencies SET total_hosts = COALESCE(total_hosts, 0) + 1 WHERE id = _agency_id;
  IF _referral_code_used IS NOT NULL AND btrim(_referral_code_used) <> ''::text THEN
    UPDATE public.sub_agents SET total_referrals = COALESCE(total_referrals, 0) + 1
    WHERE referral_code = _referral_code_used AND agency_id = _agency_id AND status = 'active'::text;
  END IF;
  INSERT INTO public.notifications (user_id, type, title, message, data, is_read)
  VALUES (_host_id, 'agency_joined', '🎉 Agency Request Approved!',
    'You have been approved to join ' || COALESCE(_agency_name, 'the agency') || '. Welcome!',
    jsonb_build_object('agency_id', _agency_id, 'agency_name', _agency_name, 'action_url', '/agency'), false);
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_host_request(uuid, uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.decline_host_request(p_request_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _rid uuid; _agency_id uuid; _host_id uuid; _agency_owner_id uuid;
BEGIN
  SELECT r.id, r.agency_id, r.host_id INTO _rid, _agency_id, _host_id
  FROM public.agency_host_requests r
  WHERE r.id = p_request_id AND r.status = 'pending'::text FOR UPDATE;
  IF _rid IS NULL THEN RETURN false; END IF;
  SELECT a.owner_id INTO _agency_owner_id FROM public.agencies a WHERE a.id = _agency_id;
  IF _agency_owner_id IS DISTINCT FROM auth.uid() THEN RETURN false; END IF;
  UPDATE public.agency_host_requests SET status = 'declined'::text, updated_at = now() WHERE id = _rid;
  UPDATE public.agency_hosts ah SET status = 'rejected'::text, left_at = now()
  WHERE ah.agency_id = _agency_id AND ah.host_id = _host_id AND ah.status = 'pending'::text;
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.decline_host_request(uuid) TO authenticated;

DO $pub$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.agency_host_requests;
EXCEPTION WHEN duplicate_object THEN NULL;
END $pub$;