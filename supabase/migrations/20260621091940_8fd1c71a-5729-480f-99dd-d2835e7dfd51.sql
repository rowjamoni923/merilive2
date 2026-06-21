REVOKE INSERT, UPDATE, DELETE ON public.poster_images FROM public;
REVOKE INSERT, UPDATE, DELETE ON public.poster_images FROM anon;

GRANT SELECT ON public.poster_images TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.poster_images TO authenticated;
GRANT ALL ON public.poster_images TO service_role;