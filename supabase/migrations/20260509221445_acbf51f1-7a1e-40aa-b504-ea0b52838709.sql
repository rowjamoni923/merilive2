do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'topup_helpers_user_id_fkey') then
    alter table public.topup_helpers
      add constraint topup_helpers_user_id_fkey
      foreign key (user_id) references public.profiles(id) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'helper_applications_user_id_fkey') then
    alter table public.helper_applications
      add constraint helper_applications_user_id_fkey
      foreign key (user_id) references public.profiles(id) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'helper_upgrade_requests_helper_id_fkey') then
    alter table public.helper_upgrade_requests
      add constraint helper_upgrade_requests_helper_id_fkey
      foreign key (helper_id) references public.topup_helpers(id) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'helper_topup_requests_helper_id_fkey') then
    alter table public.helper_topup_requests
      add constraint helper_topup_requests_helper_id_fkey
      foreign key (helper_id) references public.topup_helpers(id) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'helper_orders_user_id_fkey') then
    alter table public.helper_orders
      add constraint helper_orders_user_id_fkey
      foreign key (user_id) references public.profiles(id) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'helper_orders_helper_id_fkey') then
    alter table public.helper_orders
      add constraint helper_orders_helper_id_fkey
      foreign key (helper_id) references public.topup_helpers(id) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'helper_transactions_user_id_fkey') then
    alter table public.helper_transactions
      add constraint helper_transactions_user_id_fkey
      foreign key (user_id) references public.profiles(id) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'helper_transactions_helper_id_fkey') then
    alter table public.helper_transactions
      add constraint helper_transactions_helper_id_fkey
      foreign key (helper_id) references public.topup_helpers(id) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'helper_withdrawal_requests_helper_id_fkey') then
    alter table public.helper_withdrawal_requests
      add constraint helper_withdrawal_requests_helper_id_fkey
      foreign key (helper_id) references public.topup_helpers(id) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'helper_withdrawal_requests_host_id_fkey') then
    alter table public.helper_withdrawal_requests
      add constraint helper_withdrawal_requests_host_id_fkey
      foreign key (host_id) references public.profiles(id) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'helper_country_payment_methods_helper_id_fkey') then
    alter table public.helper_country_payment_methods
      add constraint helper_country_payment_methods_helper_id_fkey
      foreign key (helper_id) references public.topup_helpers(id) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'helper_admin_messages_helper_id_fkey') then
    alter table public.helper_admin_messages
      add constraint helper_admin_messages_helper_id_fkey
      foreign key (helper_id) references public.topup_helpers(id) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'agency_hosts_agency_id_fkey') then
    alter table public.agency_hosts
      add constraint agency_hosts_agency_id_fkey
      foreign key (agency_id) references public.agencies(id) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'agency_hosts_host_id_fkey') then
    alter table public.agency_hosts
      add constraint agency_hosts_host_id_fkey
      foreign key (host_id) references public.profiles(id) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'agencies_owner_id_fkey') then
    alter table public.agencies
      add constraint agencies_owner_id_fkey
      foreign key (owner_id) references public.profiles(id) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'profiles_agency_id_fkey') then
    alter table public.profiles
      add constraint profiles_agency_id_fkey
      foreign key (agency_id) references public.agencies(id) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'agency_withdrawals_agency_id_fkey') then
    alter table public.agency_withdrawals
      add constraint agency_withdrawals_agency_id_fkey
      foreign key (agency_id) references public.agencies(id) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'agency_withdrawals_assigned_helper_id_fkey') then
    alter table public.agency_withdrawals
      add constraint agency_withdrawals_assigned_helper_id_fkey
      foreign key (assigned_helper_id) references public.topup_helpers(id) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'agency_earnings_transfers_agency_id_fkey') then
    alter table public.agency_earnings_transfers
      add constraint agency_earnings_transfers_agency_id_fkey
      foreign key (agency_id) references public.agencies(id) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'agency_earnings_transfers_host_id_fkey') then
    alter table public.agency_earnings_transfers
      add constraint agency_earnings_transfers_host_id_fkey
      foreign key (host_id) references public.profiles(id) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'host_applications_user_id_fkey') then
    alter table public.host_applications
      add constraint host_applications_user_id_fkey
      foreign key (user_id) references public.profiles(id) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'face_verification_submissions_user_id_fkey') then
    alter table public.face_verification_submissions
      add constraint face_verification_submissions_user_id_fkey
      foreign key (user_id) references public.profiles(id) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'live_streams_host_id_fkey') then
    alter table public.live_streams
      add constraint live_streams_host_id_fkey
      foreign key (host_id) references public.profiles(id) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'party_rooms_host_id_fkey') then
    alter table public.party_rooms
      add constraint party_rooms_host_id_fkey
      foreign key (host_id) references public.profiles(id) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'reel_reports_user_id_fkey') then
    alter table public.reel_reports
      add constraint reel_reports_user_id_fkey
      foreign key (user_id) references public.profiles(id) not valid;
  end if;
end $$;

notify pgrst, 'reload schema';