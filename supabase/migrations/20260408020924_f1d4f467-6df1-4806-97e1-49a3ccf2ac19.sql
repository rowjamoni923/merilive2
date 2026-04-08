
-- Temporarily disable conflicting triggers
ALTER TABLE public.profiles DISABLE TRIGGER trigger_welcome_bonus;
ALTER TABLE public.profiles DISABLE TRIGGER trigger_prevent_balance_manipulation;

-- Create profiles for existing auth users who don't have one
INSERT INTO public.profiles (id, display_name, app_uid, coins, beans, diamonds, user_level)
SELECT 
  u.id,
  COALESCE(u.raw_user_meta_data->>'display_name', 'User'),
  public.generate_app_uid(),
  0, 0, 0, 1
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

-- Re-enable triggers
ALTER TABLE public.profiles ENABLE TRIGGER trigger_welcome_bonus;
ALTER TABLE public.profiles ENABLE TRIGGER trigger_prevent_balance_manipulation;

-- Update handle_new_user to also bypass the balance trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Temporarily disable balance protection for welcome insert
  ALTER TABLE public.profiles DISABLE TRIGGER trigger_prevent_balance_manipulation;
  
  INSERT INTO public.profiles (id, display_name, app_uid, coins, beans, diamonds, user_level)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', 'User'),
    public.generate_app_uid(),
    0, 0, 0, 1
  )
  ON CONFLICT (id) DO NOTHING;
  
  ALTER TABLE public.profiles ENABLE TRIGGER trigger_prevent_balance_manipulation;
  
  RETURN NEW;
END;
$$;
