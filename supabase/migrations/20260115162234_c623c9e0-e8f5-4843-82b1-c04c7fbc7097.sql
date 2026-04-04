-- Fix RLS policies for gifts table to allow admin operations

-- Drop the existing SELECT policy if it exists
DROP POLICY IF EXISTS "Anyone can view gifts" ON public.gifts;

-- Create policy to allow everyone to view active gifts, and admins to view all
CREATE POLICY "Anyone can view active gifts" 
ON public.gifts 
FOR SELECT 
USING (
  is_active = true 
  OR is_admin(auth.uid())
);

-- Create policy for admins to insert gifts
CREATE POLICY "Admins can insert gifts" 
ON public.gifts 
FOR INSERT 
WITH CHECK (is_admin(auth.uid()));

-- Create policy for admins to update gifts
CREATE POLICY "Admins can update gifts" 
ON public.gifts 
FOR UPDATE 
USING (is_admin(auth.uid()));

-- Create policy for admins to delete gifts
CREATE POLICY "Admins can delete gifts" 
ON public.gifts 
FOR DELETE 
USING (is_admin(auth.uid()));