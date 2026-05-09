WITH ranked AS (
  SELECT id, row_number() OVER (ORDER BY min_spend NULLS LAST, min_consumption NULLS LAST, created_at NULLS LAST, id) AS rn
  FROM public.consumption_return_config
)
UPDATE public.consumption_return_config c
SET display_order = ranked.rn
FROM ranked
WHERE c.id = ranked.id
  AND COALESCE(c.display_order, 0) = 0;