-- Add beans_balance column to agencies table for agency's own beans
ALTER TABLE public.agencies 
ADD COLUMN IF NOT EXISTS beans_balance integer DEFAULT 0;

-- Add comment to clarify the columns
COMMENT ON COLUMN public.agencies.beans_balance IS 'Agency own beans balance that can be exchanged to diamonds';
COMMENT ON COLUMN public.agencies.wallet_balance IS 'Agency diamond wallet balance received from traders';
COMMENT ON COLUMN public.agencies.diamond_balance IS 'Agency diamond balance from exchanges';