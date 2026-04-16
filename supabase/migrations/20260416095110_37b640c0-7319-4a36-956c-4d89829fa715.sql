
-- Fix owner account registration country to BD (was incorrectly US)
UPDATE public.profiles 
SET registration_country_code = 'BD'
WHERE id = '33fd2efe-ff62-489b-80f4-c497599dd893';
