create table if not exists public.user_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  message text not null check (char_length(message) between 3 and 4000),
  category text not null default 'general' check (category in ('general','bug','idea','complaint')),
  app_version text,
  platform text,
  route text,
  user_agent text,
  device_info jsonb,
  status text not null default 'new' check (status in ('new','triaged','resolved','dismissed')),
  created_at timestamptz not null default now()
);

alter table public.user_feedback enable row level security;

create policy "users insert own feedback"
  on public.user_feedback for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "users read own feedback"
  on public.user_feedback for select
  to authenticated
  using (auth.uid() = user_id);

create policy "admins read all feedback"
  on public.user_feedback for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

create policy "admins update feedback"
  on public.user_feedback for update
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

create index if not exists user_feedback_user_idx on public.user_feedback(user_id, created_at desc);
create index if not exists user_feedback_status_idx on public.user_feedback(status, created_at desc);