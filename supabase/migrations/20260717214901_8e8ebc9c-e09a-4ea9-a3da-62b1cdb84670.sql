GRANT EXECUTE ON FUNCTION public.admin_face_verification_stats(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_face_verification_stats() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_face_verification_paginated(text,text,integer,integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.face_verification_is_retry_required(text,text,jsonb,text,text,text,text,text,text[]) TO anon, authenticated, service_role;