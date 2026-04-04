-- Block the fraudulent user using security definer approach
DO $$
BEGIN
  -- Temporarily disable the trigger
  ALTER TABLE public.profiles DISABLE TRIGGER protect_sensitive_columns_trigger;
  
  UPDATE public.profiles 
  SET is_blocked = true, 
      blocked_at = now(), 
      blocked_reason = 'Fraudulent Google Play purchase - no matching record in Play Console'
  WHERE id = 'b65b1ddd-9bac-40f2-bead-979917bbd981';
  
  -- Re-enable the trigger
  ALTER TABLE public.profiles ENABLE TRIGGER protect_sensitive_columns_trigger;
END $$;