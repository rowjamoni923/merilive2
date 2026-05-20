-- Pkg62: add admin broadcast trigger for live_face_violations so AdminFaceViolations
-- updates instantly sync across all admin sessions + web + native via the broadcast bus.
DROP TRIGGER IF EXISTS tg_admin_broadcast_live_face_violations ON public.live_face_violations;
CREATE TRIGGER tg_admin_broadcast_live_face_violations
AFTER INSERT OR UPDATE OR DELETE ON public.live_face_violations
FOR EACH ROW EXECUTE FUNCTION public.tg_admin_broadcast_bump('live_face_violations');