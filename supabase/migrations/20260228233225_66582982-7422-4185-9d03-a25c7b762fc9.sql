
-- Insert into Official tab (admin_notices)
INSERT INTO public.admin_notices (title, message, target_audience, priority, is_active, read_by)
VALUES (
  '📢 Important: How Your Payments Work on MeriLive',
  E'Dear MeriLive Member,\n\n🔹 All agency & host payments are processed by your country''s assigned Payroll Helper.\n\n🔹 How it works:\n1️⃣ When an agency withdrawal is approved, your local Payroll Helper will send the payment directly to you.\n2️⃣ After completing the payment, the Payroll Helper receives Diamonds as their reward.\n3️⃣ The Payroll Helper can then sell those Diamonds at the fixed price listed on the Recharge Page.\n4️⃣ The money from Diamond sales covers the withdrawal payments, plus the Helper earns an extra commission.\n\n💎 This system ensures fast, reliable payments for everyone while giving Payroll Helpers a fair earning opportunity.\n\nIf you have any questions, please contact Support.\nThank you for being part of MeriLive! 🎉',
  ARRAY['all'],
  'high',
  true,
  ARRAY[]::uuid[]
);

-- Remove duplicates from regular notifications tab
DELETE FROM public.notifications WHERE title LIKE '%Payroll Payment%';
DELETE FROM public.helper_notifications WHERE title LIKE '%Payroll Payment%';
