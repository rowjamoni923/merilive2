-- Step 1: Add party_room_id column
ALTER TABLE public.gift_transactions 
ADD COLUMN IF NOT EXISTS party_room_id UUID REFERENCES public.party_rooms(id) ON DELETE SET NULL;

-- Step 2: Make stream_id nullable
ALTER TABLE public.gift_transactions 
ALTER COLUMN stream_id DROP NOT NULL;

-- Step 3: Drop problematic foreign key constraint
ALTER TABLE public.gift_transactions 
DROP CONSTRAINT IF EXISTS gift_transactions_stream_id_fkey;

-- Step 4: Create index for party room gift queries
CREATE INDEX IF NOT EXISTS idx_gift_transactions_party_room_id 
ON public.gift_transactions(party_room_id) 
WHERE party_room_id IS NOT NULL;