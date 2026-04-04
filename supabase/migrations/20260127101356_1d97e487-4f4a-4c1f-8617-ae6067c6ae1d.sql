-- Manually update agencies to correct levels based on their income
-- Agency with 40M income should be A4 (25M-500M range, 10% commission)

UPDATE agencies a
SET level = 'A4', commission_rate = 10, updated_at = now()
WHERE id IN (
  SELECT DISTINCT ap.agency_id
  FROM agency_performance ap
  WHERE ap.period_type = 'weekly'
    AND ap.period_start >= date_trunc('week', now()) - interval '7 days'
  GROUP BY ap.agency_id
  HAVING COALESCE(MAX(ap.total_income), 0) >= 25000000 
    AND COALESCE(MAX(ap.total_income), 0) < 500000000
);

UPDATE agencies a
SET level = 'A3', commission_rate = 4, updated_at = now()
WHERE id IN (
  SELECT DISTINCT ap.agency_id
  FROM agency_performance ap
  WHERE ap.period_type = 'weekly'
    AND ap.period_start >= date_trunc('week', now()) - interval '7 days'
  GROUP BY ap.agency_id
  HAVING COALESCE(MAX(ap.total_income), 0) >= 1000000 
    AND COALESCE(MAX(ap.total_income), 0) < 25000000
);

UPDATE agencies a
SET level = 'A2', commission_rate = 3, updated_at = now()
WHERE id IN (
  SELECT DISTINCT ap.agency_id
  FROM agency_performance ap
  WHERE ap.period_type = 'weekly'
    AND ap.period_start >= date_trunc('week', now()) - interval '7 days'
  GROUP BY ap.agency_id
  HAVING COALESCE(MAX(ap.total_income), 0) >= 500000 
    AND COALESCE(MAX(ap.total_income), 0) < 1000000
);