
CREATE OR REPLACE FUNCTION public.check_financial_update_security()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    _is_authorized BOOLEAN := false;
    _bypass_profile TEXT;
    _bypass_agency  TEXT;
BEGIN
    _bypass_profile := current_setting('app.bypass_profile_protection', true);
    _bypass_agency  := current_setting('app.bypass_agency_economy_guard', true);

    IF _bypass_profile = 'true' THEN
        _is_authorized := true;
    ELSIF TG_TABLE_NAME = 'agencies' AND _bypass_agency = 'true' THEN
        -- Agency-specific bypass set by admin_adjust_balance() and other
        -- admin-only RPCs that legitimately mutate agency wallets.
        _is_authorized := true;
    ELSIF current_user IN ('service_role', 'supabase_admin') THEN
        _is_authorized := true;
    ELSIF auth.uid() IS NOT NULL AND public.is_admin_v2(auth.uid()) THEN
        _is_authorized := true;
    END IF;

    IF NOT _is_authorized THEN
        IF TG_TABLE_NAME = 'profiles' THEN
            IF (NEW.coins IS DISTINCT FROM OLD.coins OR
                NEW.beans IS DISTINCT FROM OLD.beans OR
                NEW.diamond_balance IS DISTINCT FROM OLD.diamond_balance OR
                NEW.wallet_balance IS DISTINCT FROM OLD.wallet_balance) THEN
                RAISE EXCEPTION 'Unauthorized financial update on profiles. Access Denied.';
            END IF;
        END IF;

        IF TG_TABLE_NAME = 'agencies' THEN
            IF (NEW.diamond_balance IS DISTINCT FROM OLD.diamond_balance OR
                NEW.beans_balance  IS DISTINCT FROM OLD.beans_balance OR
                NEW.wallet_balance IS DISTINCT FROM OLD.wallet_balance) THEN
                RAISE EXCEPTION 'Unauthorized financial update on agencies. Access Denied.';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;
