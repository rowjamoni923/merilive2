-- Fix all verified Level 5 payroll helpers whose agencies are stuck at A1/3%
-- They should be A5/12% as per business rules
UPDATE agencies
SET level = 'A5', commission_rate = 12.00
WHERE owner_id IN (
  SELECT user_id FROM topup_helpers 
  WHERE is_verified = true 
  AND payroll_enabled = true 
  AND trader_level = 5
)
AND (level != 'A5' OR commission_rate != 12.00);
