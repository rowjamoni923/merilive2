-- Create table for user purchased party backgrounds
CREATE TABLE IF NOT EXISTS public.user_purchased_backgrounds (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  background_id UUID NOT NULL REFERENCES public.party_room_backgrounds(id) ON DELETE CASCADE,
  price_paid INTEGER NOT NULL DEFAULT 0,
  purchased_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(user_id, background_id)
);

-- Enable RLS
ALTER TABLE public.user_purchased_backgrounds ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own purchased backgrounds" 
ON public.user_purchased_backgrounds 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own purchased backgrounds" 
ON public.user_purchased_backgrounds 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX idx_user_purchased_backgrounds_user_id ON public.user_purchased_backgrounds(user_id);
CREATE INDEX idx_user_purchased_backgrounds_background_id ON public.user_purchased_backgrounds(background_id);