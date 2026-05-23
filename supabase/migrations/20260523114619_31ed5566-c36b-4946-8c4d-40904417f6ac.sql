
create or replace function public.get_background_unread_total()
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  msg_count int := 0;
  notif_count int := 0;
begin
  if uid is null then
    return 0;
  end if;

  select count(*) into msg_count
  from public.messages m
  join public.conversations c on c.id = m.conversation_id
  where (c.participant1_id = uid or c.participant2_id = uid)
    and m.sender_id <> uid
    and m.is_read = false;

  select count(*) into notif_count
  from public.notifications
  where user_id = uid
    and is_read = false
    and type not in ('verification','host_application','support','helper_application','helper_upgrade','helper_topup','admin_alert');

  return coalesce(msg_count,0) + coalesce(notif_count,0);
end;
$$;

grant execute on function public.get_background_unread_total() to authenticated;
