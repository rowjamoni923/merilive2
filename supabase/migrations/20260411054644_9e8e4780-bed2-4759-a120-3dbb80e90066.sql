-- Add missing columns to level_privileges for admin visual asset pages
ALTER TABLE public.level_privileges
  ADD COLUMN IF NOT EXISTS privilege_type text DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS unlock_level integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS animation_url text,
  ADD COLUMN IF NOT EXISTS preview_url text,
  ADD COLUMN IF NOT EXISTS sound_url text,
  ADD COLUMN IF NOT EXISTS display_order integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duration_ms integer DEFAULT 3500;

-- Backfill name from privilege_name for existing rows
UPDATE public.level_privileges SET name = privilege_name WHERE name IS NULL AND privilege_name IS NOT NULL;

-- Backfill unlock_level from level for existing rows
UPDATE public.level_privileges SET unlock_level = level WHERE unlock_level = 1 AND level IS NOT NULL AND level != 1;

-- Backfill privilege_type from privilege_key for existing rows
UPDATE public.level_privileges SET privilege_type = privilege_key WHERE privilege_type = 'general' AND privilege_key IS NOT NULL;