-- FK Batch 3: 78 constraints

DO $$ BEGIN
  ALTER TABLE ONLY public.sub_agent_commissions ADD CONSTRAINT sub_agent_commissions_sub_agent_id_fkey FOREIGN KEY (sub_agent_id) REFERENCES public.sub_agents(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.sub_agent_referrals ADD CONSTRAINT sub_agent_referrals_referred_host_id_fkey FOREIGN KEY (referred_host_id) REFERENCES public.profiles(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.sub_agent_referrals ADD CONSTRAINT sub_agent_referrals_sub_agent_id_fkey FOREIGN KEY (sub_agent_id) REFERENCES public.sub_agents(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.sub_agents ADD CONSTRAINT sub_agents_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.sub_agents ADD CONSTRAINT sub_agents_referrer_id_fkey FOREIGN KEY (referrer_id) REFERENCES public.profiles(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.sub_agents ADD CONSTRAINT sub_agents_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.subscription_orders ADD CONSTRAINT subscription_orders_payment_method_id_fkey FOREIGN KEY (payment_method_id) REFERENCES public.payment_methods(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.subscription_orders ADD CONSTRAINT subscription_orders_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.subscription_plans(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.support_messages ADD CONSTRAINT support_messages_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.support_tickets(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.topup_helpers ADD CONSTRAINT topup_helpers_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.profiles(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.topup_helpers ADD CONSTRAINT topup_helpers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.trader_level_purchases ADD CONSTRAINT trader_level_purchases_trader_id_fkey FOREIGN KEY (trader_id) REFERENCES public.topup_helpers(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.user_beans_exchange_history ADD CONSTRAINT user_beans_exchange_history_tier_id_fkey FOREIGN KEY (tier_id) REFERENCES public.user_beans_exchange_tiers(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.user_beans_exchange_history ADD CONSTRAINT user_beans_exchange_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.user_entry_banners ADD CONSTRAINT user_entry_banners_entry_banner_id_fkey FOREIGN KEY (entry_banner_id) REFERENCES public.entry_banners(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.user_entry_banners ADD CONSTRAINT user_entry_banners_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.user_invitations ADD CONSTRAINT user_invitations_invited_user_id_fkey FOREIGN KEY (invited_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.user_invitations ADD CONSTRAINT user_invitations_inviter_id_fkey FOREIGN KEY (inviter_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.user_parcels ADD CONSTRAINT user_parcels_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.parcel_templates(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.user_purchased_backgrounds ADD CONSTRAINT user_purchased_backgrounds_background_id_fkey FOREIGN KEY (background_id) REFERENCES public.party_room_backgrounds(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.user_purchases ADD CONSTRAINT user_purchases_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.shop_items(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.user_purchases ADD CONSTRAINT user_purchases_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.user_reports ADD CONSTRAINT user_reports_reported_user_id_fkey FOREIGN KEY (reported_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.user_reports ADD CONSTRAINT user_reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.user_reports ADD CONSTRAINT user_reports_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.user_role_frames ADD CONSTRAINT user_role_frames_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.profiles(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.user_role_frames ADD CONSTRAINT user_role_frames_frame_id_fkey FOREIGN KEY (frame_id) REFERENCES public.role_frames(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.user_role_frames ADD CONSTRAINT user_role_frames_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.user_subscriptions ADD CONSTRAINT user_subscriptions_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.subscription_orders(id) ON DELETE SET NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.user_subscriptions ADD CONSTRAINT user_subscriptions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.subscription_plans(id) ON DELETE SET NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.user_task_progress ADD CONSTRAINT user_task_progress_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.daily_tasks(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.user_task_progress ADD CONSTRAINT user_task_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.user_vip_subscriptions ADD CONSTRAINT user_vip_subscriptions_tier_id_fkey FOREIGN KEY (tier_id) REFERENCES public.vip_tiers(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.user_vip_subscriptions ADD CONSTRAINT user_vip_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.vip_exclusive_items ADD CONSTRAINT vip_exclusive_items_vip_tier_id_fkey FOREIGN KEY (vip_tier_id) REFERENCES public.vip_tiers(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.vpn_detection_logs ADD CONSTRAINT vpn_detection_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.watchlist ADD CONSTRAINT watchlist_content_id_fkey FOREIGN KEY (content_id) REFERENCES public.site_content(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.admin_invitations ADD CONSTRAINT admin_invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.admin_logs ADD CONSTRAINT admin_logs_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.admin_notices ADD CONSTRAINT admin_notices_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.admin_section_permissions ADD CONSTRAINT admin_section_permissions_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES auth.users(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.admin_users ADD CONSTRAINT admin_users_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.admin_users ADD CONSTRAINT admin_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.agencies ADD CONSTRAINT agencies_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.app_content ADD CONSTRAINT app_content_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.device_tokens ADD CONSTRAINT device_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.face_verification_submissions ADD CONSTRAINT face_verification_submissions_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.host_applications ADD CONSTRAINT host_applications_admin_reviewed_by_fkey FOREIGN KEY (admin_reviewed_by) REFERENCES auth.users(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.ip_logs ADD CONSTRAINT ip_logs_admin_user_id_fkey FOREIGN KEY (admin_user_id) REFERENCES auth.users(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.limited_offer_claims ADD CONSTRAINT limited_offer_claims_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.limited_time_offers ADD CONSTRAINT limited_time_offers_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.live_game_bets ADD CONSTRAINT live_game_bets_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES auth.users(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.live_game_rounds ADD CONSTRAINT live_game_rounds_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES auth.users(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.recharge_history ADD CONSTRAINT recharge_history_credited_by_fkey FOREIGN KEY (credited_by) REFERENCES auth.users(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.recharge_history ADD CONSTRAINT recharge_history_helper_id_fkey FOREIGN KEY (helper_id) REFERENCES auth.users(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.room_treasures ADD CONSTRAINT room_treasures_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.salary_payment_history ADD CONSTRAINT salary_payment_history_processed_by_fkey FOREIGN KEY (processed_by) REFERENCES auth.users(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.special_gifts ADD CONSTRAINT special_gifts_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.subscription_orders ADD CONSTRAINT subscription_orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.support_messages ADD CONSTRAINT support_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES auth.users(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.support_tickets ADD CONSTRAINT support_tickets_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES auth.users(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.support_tickets ADD CONSTRAINT support_tickets_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.user_blocks ADD CONSTRAINT user_blocks_blocked_id_fkey FOREIGN KEY (blocked_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.user_blocks ADD CONSTRAINT user_blocks_blocker_id_fkey FOREIGN KEY (blocker_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.user_parcels ADD CONSTRAINT user_parcels_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES auth.users(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.user_parcels ADD CONSTRAINT user_parcels_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.user_purchased_backgrounds ADD CONSTRAINT user_purchased_backgrounds_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.user_subscriptions ADD CONSTRAINT user_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.watchlist ADD CONSTRAINT watchlist_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;