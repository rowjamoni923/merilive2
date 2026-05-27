-- Pkg365: Admin Panel buttons audit — grant anon EXECUTE on 28 admin-gated RPCs.
-- Sub-admin sessions use the adminSupabase client (anon JWT + x-admin-token header).
-- Each RPC below is SECURITY DEFINER with internal admin verification (current_admin_id_from_header
-- or is_caller_admin), so granting anon EXECUTE is safe — non-admin callers are rejected inside.
-- Without this grant, every save/delete/plus/minus button that calls one of these RPCs from a
-- sub-admin session returns PostgreSQL ERRCODE 42501 (permission denied).
DO $$
DECLARE
  fn_name text;
  fn_oid oid;
  fn_names text[] := ARRAY[
    'add_beans_to_user','add_coins_to_user','add_diamonds_to_agency','add_diamonds_to_user',
    'admin_add_agency_coins','admin_add_user_coins','admin_adjust_agency_beans',
    'admin_apply_chat_punishment','admin_approve_helper_topup',
    'admin_block_agency','admin_block_user','admin_delete_user',
    'admin_force_verify_and_approve_host','admin_mark_face_submission_under_review',
    'admin_process_helper_withdrawal_request','admin_process_withdrawal',
    'admin_promote_agency_owner_to_payroll_helper','admin_record_helper_transaction_decision',
    'admin_remove_host_from_agency','admin_reset_phone_violation_count',
    'admin_review_host_application','admin_set_agency_active_status',
    'admin_set_host_status','admin_set_topup_helper_active',
    'admin_set_user_verification','admin_upsert_topup_helper',
    'admin_withdrawal_stats','process_helper_order_secure'
  ];
BEGIN
  FOREACH fn_name IN ARRAY fn_names LOOP
    FOR fn_oid IN
      SELECT p.oid FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = fn_name
    LOOP
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO anon',
                     fn_name,
                     pg_get_function_identity_arguments(fn_oid));
    END LOOP;
  END LOOP;
END $$;