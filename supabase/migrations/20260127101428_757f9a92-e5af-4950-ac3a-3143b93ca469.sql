-- Update গহহ's Agency to A4 (40M income, 10% commission)
UPDATE agencies 
SET level = 'A4', commission_rate = 10, updated_at = now()
WHERE id = '67b2036f-469c-44c7-8007-1c61ab9c3a81';

-- Update 🅡🅙✨Guru✨Agency to A3 (4.5M income, 4% commission)
UPDATE agencies 
SET level = 'A3', commission_rate = 4, updated_at = now()
WHERE id = 'eea6490b-6047-4101-8524-68e71b4d7a4c';