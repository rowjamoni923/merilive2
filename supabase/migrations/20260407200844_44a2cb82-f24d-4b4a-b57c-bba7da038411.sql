-- Re-enable all triggers
ALTER TABLE public.profiles ENABLE TRIGGER ALL;

-- Re-enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
