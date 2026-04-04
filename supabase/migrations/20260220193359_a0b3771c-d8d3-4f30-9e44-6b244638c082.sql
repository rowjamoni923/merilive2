INSERT INTO public.topup_helpers (user_id, is_active, is_verified, payroll_enabled, payroll_status, trader_level, approved_at)
VALUES ('7acd387f-77e5-425e-badb-afae78869123', true, true, true, 'approved', 1, now())
ON CONFLICT (user_id) DO UPDATE SET payroll_enabled = true, payroll_status = 'approved', is_active = true;