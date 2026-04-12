-- gift_transactions missing columns
ALTER TABLE public.gift_transactions ADD COLUMN IF NOT EXISTS call_id uuid;
ALTER TABLE public.gift_transactions ADD COLUMN IF NOT EXISTS party_room_id uuid;

-- gifts missing column
ALTER TABLE public.gifts ADD COLUMN IF NOT EXISTS coin_price integer;

-- messages missing columns
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS encryption_version integer;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS is_ai_reply boolean DEFAULT false;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS read_at timestamptz;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS status text DEFAULT 'sent';

-- recharge_transactions missing columns
ALTER TABLE public.recharge_transactions ADD COLUMN IF NOT EXISTS agency_id uuid;
ALTER TABLE public.recharge_transactions ADD COLUMN IF NOT EXISTS agency_name text;
ALTER TABLE public.recharge_transactions ADD COLUMN IF NOT EXISTS agent_id uuid;
ALTER TABLE public.recharge_transactions ADD COLUMN IF NOT EXISTS agent_name text;
ALTER TABLE public.recharge_transactions ADD COLUMN IF NOT EXISTS coins_received integer;
ALTER TABLE public.recharge_transactions ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE public.recharge_transactions ADD COLUMN IF NOT EXISTS currency_code text;
ALTER TABLE public.recharge_transactions ADD COLUMN IF NOT EXISTS device_info jsonb;
ALTER TABLE public.recharge_transactions ADD COLUMN IF NOT EXISTS google_order_id text;
ALTER TABLE public.recharge_transactions ADD COLUMN IF NOT EXISTS google_product_id text;
ALTER TABLE public.recharge_transactions ADD COLUMN IF NOT EXISTS ip_address text;
ALTER TABLE public.recharge_transactions ADD COLUMN IF NOT EXISTS local_currency_amount numeric;
ALTER TABLE public.recharge_transactions ADD COLUMN IF NOT EXISTS local_payment_number text;
ALTER TABLE public.recharge_transactions ADD COLUMN IF NOT EXISTS local_payment_provider text;
ALTER TABLE public.recharge_transactions ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.recharge_transactions ADD COLUMN IF NOT EXISTS purchase_source text;
ALTER TABLE public.recharge_transactions ADD COLUMN IF NOT EXISTS transaction_id text;