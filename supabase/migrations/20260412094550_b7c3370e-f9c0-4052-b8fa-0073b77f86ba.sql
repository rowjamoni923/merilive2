-- pk_battles: add columns code expects
ALTER TABLE public.pk_battles
  ADD COLUMN IF NOT EXISTS challenger_id uuid,
  ADD COLUMN IF NOT EXISTS opponent_id uuid,
  ADD COLUMN IF NOT EXISTS challenger_score integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opponent_score integer DEFAULT 0;

-- Copy existing data
UPDATE public.pk_battles 
SET challenger_id = host1_id, opponent_id = host2_id, 
    challenger_score = host1_score, opponent_score = host2_score
WHERE challenger_id IS NULL AND host1_id IS NOT NULL;

-- gift_transactions: add missing columns
ALTER TABLE public.gift_transactions
  ADD COLUMN IF NOT EXISTS diamond_cost integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coin_value integer DEFAULT 0;

-- Copy existing data
UPDATE public.gift_transactions 
SET diamond_cost = COALESCE(coin_amount, 0), coin_value = COALESCE(coin_amount, 0)
WHERE diamond_cost = 0;

-- payment_transactions: add missing columns
ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS transaction_ref text,
  ADD COLUMN IF NOT EXISTS amount_usd numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS diamonds_amount integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS gateway_response jsonb,
  ADD COLUMN IF NOT EXISTS notes text;