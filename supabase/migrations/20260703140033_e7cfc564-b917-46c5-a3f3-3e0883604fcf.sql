GRANT EXECUTE ON FUNCTION public.compute_payouts_for_range(timestamp with time zone, timestamp with time zone) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.compute_helper_diamond_payouts(timestamp with time zone, timestamp with time zone, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.compute_payouts_timeline(timestamp with time zone, timestamp with time zone) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.compute_company_health(timestamp with time zone, timestamp with time zone) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.compute_profit_for_range(timestamp with time zone, timestamp with time zone) TO anon, authenticated, service_role;