-- Resend platform-wide payment policy message to all active users
INSERT INTO public.notifications (user_id, type, title, message, data, is_read)
SELECT
  p.id,
  'admin_message',
  '📢 Important: Payroll Payment & Diamond Policy',
  'Dear MeriLive Member,\n\nAll agency and host payments are processed by your country''s assigned Payroll Helper.\n\nHow it works:\n1) When an agency withdrawal is approved, your local Payroll Helper sends the payment to you.\n2) After successful payment completion, the Payroll Helper receives Diamonds as reward.\n3) Helpers can sell those Diamonds at the fixed price shown on the Recharge Page.\n4) Diamond sale proceeds are used to cover withdrawal payouts, and Helpers can earn additional commission income.\n\nThis policy ensures fast, reliable payments for all users and sustainable earnings for Payroll Helpers.\n\nThank you for being part of MeriLive.',
  jsonb_build_object('priority', 'high', 'broadcast', true, 'source', 'payment_policy_resend'),
  false
FROM public.profiles p
WHERE COALESCE(p.is_deleted, false) = false;

-- Also send to helper inbox (Level 5 Helper dashboard)
INSERT INTO public.helper_notifications (helper_id, type, title, message, data, is_read)
SELECT
  th.id,
  'admin_message',
  '📢 Important: Payroll Payment & Diamond Policy',
  'All agency and host payments in your country must be processed by Payroll Helpers. After you complete each payment, you receive Diamonds and may sell them at the fixed Recharge Page rate. Those proceeds cover payout obligations and support your commission income. Please follow this policy strictly.',
  jsonb_build_object('priority', 'high', 'source', 'helper_messaging', 'broadcast', true),
  false
FROM public.topup_helpers th
WHERE th.is_verified = true
  AND COALESCE(th.is_active, true) = true;