
-- Step 1: For duplicate device_ids, keep the OLDEST account and NULL the device_id on newer ones
-- Duplicate 1: device_1rtvgyi7wgafd7 - keep f4b723e9 (older), null c5771a65 (newer)
UPDATE public.profiles SET device_id = NULL 
WHERE id = 'c5771a65-88dc-432b-b941-b7c7859a74f9';

-- Duplicate 2: device_c932165e130fadf5 - keep 5ca665be (older), null 0293c7d8 (newer)
UPDATE public.profiles SET device_id = NULL 
WHERE id = '0293c7d8-3480-4524-9906-a6b4c39d17c0';

-- Step 2: Now create the unique partial index
CREATE UNIQUE INDEX idx_profiles_unique_device_id 
ON public.profiles (device_id) 
WHERE device_id IS NOT NULL AND is_deleted = false;
