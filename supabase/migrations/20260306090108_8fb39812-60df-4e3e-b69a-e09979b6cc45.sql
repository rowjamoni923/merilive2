-- Update commission_rate to 12% for all payroll-enabled agencies
UPDATE agencies a
SET commission_rate = 12
FROM topup_helpers th
WHERE th.user_id = a.owner_id
  AND th.is_verified = true
  AND th.trader_level = 5
  AND th.payroll_enabled = true
  AND a.commission_rate < 12;