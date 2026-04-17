
-- 1) Backfill missing country_code with 'BD' default for the 2 affected profiles
UPDATE public.profiles
SET country_code = 'BD'
WHERE country_code IS NULL OR country_code = '';

-- 2) Remove orphan admin_users row (auth user deleted)
DELETE FROM public.admin_users
WHERE user_id IS NULL AND email = 'sazzadshifa776@gmail.com';

-- 3) Mark the orphan agency as inactive (no owner = cannot operate)
UPDATE public.agencies
SET is_active = false,
    is_blocked = true,
    blocked_reason = COALESCE(blocked_reason, 'Orphaned: no owner_id'),
    blocked_at = COALESCE(blocked_at, now())
WHERE owner_id IS NULL;
