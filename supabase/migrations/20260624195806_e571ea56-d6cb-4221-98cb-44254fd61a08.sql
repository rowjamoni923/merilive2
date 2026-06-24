-- Security-definer helper: return an agency's WhatsApp number ONLY to its
-- active host(s), owner, or sub-agent. Anyone else gets NULL (no leak).
CREATE OR REPLACE FUNCTION public.get_my_agency_contact(_agency_id uuid)
RETURNS TABLE (whatsapp_number text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _allowed boolean := false;
BEGIN
  IF _uid IS NULL OR _agency_id IS NULL THEN
    RETURN;
  END IF;

  -- Active host of this agency?
  SELECT EXISTS (
    SELECT 1 FROM public.agency_hosts ah
    WHERE ah.agency_id = _agency_id
      AND ah.host_id = _uid
      AND ah.status = 'active'
  ) INTO _allowed;

  -- Owner?
  IF NOT _allowed THEN
    SELECT EXISTS (
      SELECT 1 FROM public.agencies a
      WHERE a.id = _agency_id AND a.owner_id = _uid
    ) INTO _allowed;
  END IF;

  -- Sub-agent?
  IF NOT _allowed THEN
    SELECT EXISTS (
      SELECT 1 FROM public.sub_agents sa
      WHERE sa.agency_id = _agency_id AND sa.user_id = _uid
    ) INTO _allowed;
  END IF;

  IF NOT _allowed THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT a.whatsapp_number::text
    FROM public.agencies a
    WHERE a.id = _agency_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_agency_contact(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_agency_contact(uuid) TO authenticated;