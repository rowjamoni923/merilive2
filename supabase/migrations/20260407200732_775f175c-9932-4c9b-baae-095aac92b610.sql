-- Disable the protection trigger temporarily for bulk import
ALTER TABLE public.profiles DISABLE TRIGGER protect_sensitive_columns_trigger;

-- Also disable any other insert/update triggers that might interfere
ALTER TABLE public.profiles DISABLE TRIGGER ALL;
