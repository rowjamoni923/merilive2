-- ============================================================
-- CRITICAL SECURITY FIX: Patch RLS policies for sensitive tables
-- ============================================================

-- 1. Fix is_admin() function - Remove email-based OR clause (privilege escalation)
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = _user_id
      AND is_active = true
  )
$$;

-- 2. Fix OTP tables - restrict to own records only
DROP POLICY IF EXISTS "a_read_email_otps" ON public.email_otps;
CREATE POLICY "email_otps_own_read" ON public.email_otps
  FOR SELECT TO authenticated
  USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "a_read_phone_otps" ON public.phone_otps;
CREATE POLICY "phone_otps_own_read" ON public.phone_otps
  FOR SELECT TO authenticated
  USING (phone_number = (SELECT phone FROM auth.users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "a_read_password_otps" ON public.password_reset_otps;
CREATE POLICY "password_otps_own_read" ON public.password_reset_otps
  FOR SELECT TO authenticated
  USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "a_read_admin_otp" ON public.admin_login_otps;
CREATE POLICY "admin_otps_admin_only" ON public.admin_login_otps
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

-- 3. Fix recovery_tokens - restrict to own tokens
DROP POLICY IF EXISTS "a_read_recovery" ON public.recovery_tokens;
CREATE POLICY "recovery_own_read" ON public.recovery_tokens
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 4. Fix admin_allowed_devices - admin only
DROP POLICY IF EXISTS "a_read_admin_dev" ON public.admin_allowed_devices;
DROP POLICY IF EXISTS "a_ins_admin_dev" ON public.admin_allowed_devices;
DROP POLICY IF EXISTS "a_upd_admin_dev" ON public.admin_allowed_devices;
CREATE POLICY "admin_devices_read" ON public.admin_allowed_devices
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "admin_devices_insert" ON public.admin_allowed_devices
  FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "admin_devices_update" ON public.admin_allowed_devices
  FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));

-- 5. Fix admin_invitations - admin only
DROP POLICY IF EXISTS "a_read_admin_inv" ON public.admin_invitations;
CREATE POLICY "admin_inv_read" ON public.admin_invitations
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

-- 6. Fix parcel_templates - admin only write
DROP POLICY IF EXISTS "Admin full access to parcel templates" ON public.parcel_templates;
CREATE POLICY "parcel_templates_admin_write" ON public.parcel_templates
  FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- 7. Fix subscription_orders - own orders only
DROP POLICY IF EXISTS "Users can view their own orders by email" ON public.subscription_orders;
CREATE POLICY "subscription_orders_own_read" ON public.subscription_orders
  FOR SELECT TO authenticated
  USING (customer_email = (SELECT email FROM auth.users WHERE id = auth.uid()) OR public.is_admin(auth.uid()));

-- 8. Fix conversation_encryption_keys - participants only
DROP POLICY IF EXISTS "a_read_conv_keys" ON public.conversation_encryption_keys;
CREATE POLICY "conv_keys_participants" ON public.conversation_encryption_keys
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND (c.participant1_id = auth.uid() OR c.participant2_id = auth.uid()))
    OR public.is_admin(auth.uid())
  );

-- 9. Fix admin_notifications - admin only
DROP POLICY IF EXISTS "a_read_admin_notif" ON public.admin_notifications;
DROP POLICY IF EXISTS "a_upd_admin_notif" ON public.admin_notifications;
CREATE POLICY "admin_notif_read" ON public.admin_notifications
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "admin_notif_update" ON public.admin_notifications
  FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));

-- 10. Fix security/audit logs - admin only
DROP POLICY IF EXISTS "a_read_sec_audit" ON public.security_audit_log;
CREATE POLICY "sec_audit_admin" ON public.security_audit_log
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "a_read_sess_sec" ON public.session_security_logs;
CREATE POLICY "sess_sec_admin" ON public.session_security_logs
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "a_read_call_sec" ON public.private_call_security_logs;
CREATE POLICY "call_sec_admin" ON public.private_call_security_logs
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

-- 11. Fix login attempts/lockouts - admin only
DROP POLICY IF EXISTS "a_read_fail_login" ON public.failed_login_attempts;
CREATE POLICY "fail_login_admin" ON public.failed_login_attempts
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "a_read_login_att" ON public.login_attempts;
CREATE POLICY "login_att_admin" ON public.login_attempts
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "a_read_lockouts" ON public.account_lockouts;
CREATE POLICY "lockouts_admin" ON public.account_lockouts
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "a_read_rate_att" ON public.rate_limit_attempts;
CREATE POLICY "rate_att_admin" ON public.rate_limit_attempts
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

-- 12. Fix registration_bonus_claims - own + admin
DROP POLICY IF EXISTS "Anyone can read registration_bonus_claims" ON public.registration_bonus_claims;
CREATE POLICY "bonus_claims_own_read" ON public.registration_bonus_claims
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

-- 13. Fix agency financial data - owner + admin
DROP POLICY IF EXISTS "a_read_agency_comm" ON public.agency_commission_history;
CREATE POLICY "agency_comm_scoped" ON public.agency_commission_history
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.agencies a WHERE a.id = agency_id AND a.owner_id = auth.uid()) OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "a_read_agency_dia" ON public.agency_diamond_transactions;
CREATE POLICY "agency_dia_scoped" ON public.agency_diamond_transactions
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.agencies a WHERE a.id = agency_id AND a.owner_id = auth.uid()) OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "a_read_agency_earn" ON public.agency_earnings_transfers;
CREATE POLICY "agency_earn_scoped" ON public.agency_earnings_transfers
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.agencies a WHERE a.id = agency_id AND a.owner_id = auth.uid()) OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "a_read_agency_perf" ON public.agency_performance;
CREATE POLICY "agency_perf_scoped" ON public.agency_performance
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.agencies a WHERE a.id = agency_id AND a.owner_id = auth.uid()) OR public.is_admin(auth.uid()));

-- 14. Fix sub_agents - own + admin
DROP POLICY IF EXISTS "a_read_sub_agents" ON public.sub_agents;
CREATE POLICY "sub_agents_scoped" ON public.sub_agents
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "a_read_sub_ref" ON public.sub_agent_referrals;
CREATE POLICY "sub_ref_scoped" ON public.sub_agent_referrals
  FOR SELECT TO authenticated
  USING (sub_agent_id IN (SELECT id FROM public.sub_agents WHERE user_id = auth.uid()) OR public.is_admin(auth.uid()));

-- 15. Fix admin_section_permissions - admin only
DROP POLICY IF EXISTS "a_read_admin_perms" ON public.admin_section_permissions;
CREATE POLICY "admin_perms_admin" ON public.admin_section_permissions
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

-- 16. Fix stream_recordings - host + admin
DROP POLICY IF EXISTS "a_read_recordings" ON public.stream_recordings;
CREATE POLICY "recordings_scoped" ON public.stream_recordings
  FOR SELECT TO authenticated
  USING (host_id = auth.uid() OR public.is_admin(auth.uid()));

-- 17. Fix payment_reconciliation_log - admin only
DROP POLICY IF EXISTS "a_read_pay_recon" ON public.payment_reconciliation_log;
CREATE POLICY "pay_recon_admin" ON public.payment_reconciliation_log
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

-- 18. Fix helper_admin_messages - own + admin
DROP POLICY IF EXISTS "a_read_hlp_admin_msg" ON public.helper_admin_messages;
CREATE POLICY "helper_msg_scoped" ON public.helper_admin_messages
  FOR SELECT TO authenticated
  USING (helper_id = auth.uid() OR public.is_admin(auth.uid()));