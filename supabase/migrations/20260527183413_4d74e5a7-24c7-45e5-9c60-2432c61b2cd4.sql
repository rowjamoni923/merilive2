
-- Pkg379: Grant anon + authenticated EXECUTE on 13 admin RPCs missed by Pkg365.
-- Safe: each RPC has internal admin-header verification (current_admin_id_from_header /
-- is_caller_admin / requireAdminSession), so anon grant only unblocks the admin panel
-- which calls via supabase.rpc() under the anon JWT but passes x-admin-token header.

DO $$
DECLARE
  rpc_name text;
  rpc_oid oid;
  rpc_args text;
  rpc_names text[] := ARRAY[
    'admin_approve_helper',
    'admin_check_live_ban',
    'admin_credit_beans',
    'admin_list_live_face_warnings_paginated',
    'admin_live_face_warnings_stats',
    'admin_pin_reset_with_otp',
    'admin_process_helper_transaction',
    'admin_process_host_application',
    'admin_rekognition_shard_stats',
    'admin_save_host_bonus_settings',
    'admin_update_agency_level',
    'admin_update_helper_application',
    'admin_update_reel_status'
  ];
BEGIN
  FOREACH rpc_name IN ARRAY rpc_names LOOP
    FOR rpc_oid, rpc_args IN
      SELECT p.oid, pg_get_function_identity_arguments(p.oid)
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = rpc_name
    LOOP
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO anon, authenticated',
                     rpc_name, rpc_args);
    END LOOP;
  END LOOP;
END $$;
