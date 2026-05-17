GRANT EXECUTE ON FUNCTION public.admin_list_face_verification_paginated(text,text,integer,integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.face_verification_status_bucket(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.face_verification_is_auto_reviewed(text,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.face_verification_is_auto_reviewed(text,text,text) TO anon, authenticated;