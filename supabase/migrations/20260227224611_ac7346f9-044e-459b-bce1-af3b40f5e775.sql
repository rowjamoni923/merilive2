-- Fix existing bonus notifications that are missing the Payroll Helper Guide link
UPDATE public.notifications 
SET message = message || E'\n\n📖 Payroll Helper Guide: /payroll-helper-guide',
    data = jsonb_build_object('amount', 500000, 'action_url', '/payroll-helper-guide')
WHERE type = 'reward' 
AND title = '🎉 Trader Diamond Bonus!' 
AND message NOT LIKE '%payroll-helper-guide%';