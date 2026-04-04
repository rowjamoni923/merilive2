-- Add diamond_balance column to agencies table for tracking agency diamonds
ALTER TABLE public.agencies 
ADD COLUMN IF NOT EXISTS diamond_balance INTEGER NOT NULL DEFAULT 0;

-- Create agency_diamond_transactions table to track diamond exchanges
CREATE TABLE IF NOT EXISTS public.agency_diamond_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  transaction_type VARCHAR(20) NOT NULL, -- 'exchange' (beans to diamonds), 'sell' (diamonds to user)
  beans_amount INTEGER NOT NULL DEFAULT 0,
  diamond_amount INTEGER NOT NULL DEFAULT 0,
  fee_amount INTEGER NOT NULL DEFAULT 0,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL, -- only for sell transactions
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.agency_diamond_transactions ENABLE ROW LEVEL SECURITY;

-- RLS policies for agency_diamond_transactions
CREATE POLICY "Agency owners can view their transactions"
  ON public.agency_diamond_transactions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM agencies 
      WHERE agencies.id = agency_diamond_transactions.agency_id 
      AND agencies.owner_id = auth.uid()
    )
  );

CREATE POLICY "Agency owners can insert transactions"
  ON public.agency_diamond_transactions
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM agencies 
      WHERE agencies.id = agency_diamond_transactions.agency_id 
      AND agencies.owner_id = auth.uid()
    )
  );

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_agency_diamond_transactions_agency_id 
  ON public.agency_diamond_transactions(agency_id);

CREATE INDEX IF NOT EXISTS idx_agency_diamond_transactions_created_at 
  ON public.agency_diamond_transactions(created_at DESC);