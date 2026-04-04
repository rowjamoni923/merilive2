-- Add missing updated_at column to private_calls table
ALTER TABLE public.private_calls ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- Set existing rows
UPDATE public.private_calls SET updated_at = COALESCE(ended_at, connected_at, created_at, now()) WHERE updated_at IS NULL;