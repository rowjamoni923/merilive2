ALTER VIEW public.gift_items SET (security_invoker = on);
ALTER VIEW public.recharge_packages SET (security_invoker = on);
ALTER VIEW public.vip_plans SET (security_invoker = on);
GRANT SELECT ON public.gift_items TO anon, authenticated;
GRANT SELECT ON public.recharge_packages TO anon, authenticated;
GRANT SELECT ON public.vip_plans TO anon, authenticated;