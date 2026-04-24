alter table public.rating_reward_claims
  add column if not exists screenshot_url text,
  add column if not exists reward_type text not null default 'coins',
  add column if not exists reward_amount integer not null default 0,
  add column if not exists reviewed_by uuid,
  add column if not exists reviewed_at timestamp with time zone,
  add column if not exists rejection_reason text,
  add column if not exists created_at timestamp with time zone not null default now();

alter table public.rating_reward_claims alter column claimed_at set default now();

create index if not exists idx_rating_reward_claims_status_created_at
  on public.rating_reward_claims(status, created_at desc);

create index if not exists idx_trader_level_tiers_active_level
  on public.trader_level_tiers(is_active, level_number);

alter table public.trader_level_tiers enable row level security;

drop policy if exists "Anyone can view active trader levels" on public.trader_level_tiers;
create policy "Anyone can view active trader levels"
on public.trader_level_tiers
for select
to anon, authenticated
using (is_active = true);

drop policy if exists "Admins can manage trader levels" on public.trader_level_tiers;
create policy "Admins can manage trader levels"
on public.trader_level_tiers
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

alter table public.rating_reward_claims enable row level security;

drop policy if exists "Users can view own rating claims" on public.rating_reward_claims;
create policy "Users can view own rating claims"
on public.rating_reward_claims
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can create own rating claims" on public.rating_reward_claims;
create policy "Users can create own rating claims"
on public.rating_reward_claims
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Admins can review all rating claims" on public.rating_reward_claims;
create policy "Admins can review all rating claims"
on public.rating_reward_claims
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));