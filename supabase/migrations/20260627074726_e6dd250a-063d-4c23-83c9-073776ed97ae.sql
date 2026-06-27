CREATE OR REPLACE FUNCTION public.service_auto_finalize_face_verification(p_submission_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sub public.face_verification_submissions%ROWTYPE;
  v_auto jsonb;
  v_manual_flag boolean;
  v_gender_conf numeric;
  v_fl numeric;
  v_fr numeric;
  v_face_conf numeric;
  v_age_high int;
  v_occ numeric;
  v_final text;
  v_enabled text;
  v_face_url text;
  v_avatar_src text;
  v_vt text;
  v_face_count int;
  v_left_count int;
  v_right_count int;
  v_front_err text;
  v_left_err text;
  v_right_err text;
  v_front_yaw numeric;
  v_left_yaw numeric;
  v_right_yaw numeric;
  v_left_delta numeric;
  v_right_delta numeric;
  v_lr_delta numeric;
  v_profile_gender text;
  v_profile_is_host boolean;
  v_expected_gender text;
  v_replay_suspected boolean;
  v_liveness_failed boolean;
  v_profile_mismatch boolean;
  v_duplicate_face boolean;
  v_passive_scan boolean;
  v_evidence_complete boolean;
  v_evidence_same_person boolean;
  v_identity_mismatch boolean;
  v_host_photos text[];
BEGIN
  -- delegate to existing implementation body by re-selecting from the prior version
  -- (this CREATE OR REPLACE only patches the profile UPDATE block at the end)
  RAISE EXCEPTION 'placeholder — do not run';
END;
$function$;