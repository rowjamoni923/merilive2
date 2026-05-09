do $$
begin
  if exists (
    select 1
    from pg_constraint
    where connamespace = 'public'::regnamespace
      and conname = 'agencies_owner_id_fkey'
      and confrelid = 'auth.users'::regclass
  ) then
    alter table public.agencies drop constraint agencies_owner_id_fkey;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where connamespace = 'public'::regnamespace
      and conname = 'agencies_owner_id_fkey'
      and confrelid = 'public.profiles'::regclass
  ) then
    alter table public.agencies
      add constraint agencies_owner_id_fkey
      foreign key (owner_id) references public.profiles(id) not valid;
  end if;
end $$;

notify pgrst, 'reload schema';