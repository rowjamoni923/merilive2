INSERT INTO public.topup_helpers (user_id, is_active, payroll_enabled, payroll_status, trader_level, country_code, wallet_balance)
VALUES ('7acd387f-77e5-425e-badb-afae78869123', true, true, 'approved', 5, 'BD', 0)
ON CONFLICT (user_id) DO UPDATE SET
  is_active = true,
  payroll_enabled = true,
  payroll_status = 'approved',
  trader_level = 5,
  country_code = 'BD',
  wallet_balance = COALESCE(topup_helpers.wallet_balance, 0);