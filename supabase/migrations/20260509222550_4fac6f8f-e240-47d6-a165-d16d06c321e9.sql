do $$
begin
  if not exists (
    select 1 from pg_constraint
    where connamespace = 'public'::regnamespace
      and conrelid = 'public.role_frames'::regclass
      and contype = 'p'
  ) then
    alter table public.role_frames
      add constraint role_frames_pkey primary key (id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where connamespace = 'public'::regnamespace
      and conname = 'reel_reports_reel_id_fkey'
  ) then
    alter table public.reel_reports
      add constraint reel_reports_reel_id_fkey
      foreign key (reel_id) references public.reels(id) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where connamespace = 'public'::regnamespace
      and conname = 'user_role_frames_frame_id_fkey'
  ) then
    alter table public.user_role_frames
      add constraint user_role_frames_frame_id_fkey
      foreign key (frame_id) references public.role_frames(id) not valid;
  end if;
end $$;

notify pgrst, 'reload schema';