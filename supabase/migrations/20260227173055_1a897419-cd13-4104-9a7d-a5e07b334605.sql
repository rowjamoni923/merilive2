ALTER TABLE public.profiles DISABLE TRIGGER protect_sensitive_columns_trigger;

UPDATE public.profiles
SET is_host = false,
    is_verified = false,
    gender = 'male',
    host_level = 0,
    host_verified_at = NULL
WHERE id = '92375abf-c7b3-4858-ba46-52c9bcac365b';

ALTER TABLE public.profiles ENABLE TRIGGER protect_sensitive_columns_trigger;