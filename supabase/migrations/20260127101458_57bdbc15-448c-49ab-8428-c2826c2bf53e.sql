-- Force update agency levels and commission rates
UPDATE agencies SET level = 'A4', commission_rate = 10.00, updated_at = now()
WHERE name = 'গহহ''s Agency';

UPDATE agencies SET level = 'A3', commission_rate = 4.00, updated_at = now()
WHERE name LIKE '%Guru%Agency%' AND name LIKE '%🅡🅙%';