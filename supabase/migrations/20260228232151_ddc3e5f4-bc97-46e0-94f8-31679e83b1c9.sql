
-- Send platform-wide announcement to ALL active users about the payment system
INSERT INTO notifications (user_id, type, title, message, data, is_read)
SELECT 
  p.id,
  'system',
  '📢 Important: How Your Payments Work on MeriLive',
  'Dear MeriLive Member,' || chr(10) || chr(10) ||
  '🔹 All agency & host payments are processed by your country''s assigned Payroll Helper.' || chr(10) || chr(10) ||
  '🔹 How it works:' || chr(10) ||
  '1️⃣ When an agency withdrawal is approved, your local Payroll Helper will send the payment directly to you.' || chr(10) ||
  '2️⃣ After completing the payment, the Payroll Helper receives Diamonds as their reward.' || chr(10) ||
  '3️⃣ The Payroll Helper can then sell those Diamonds at the fixed price listed on the Recharge Page.' || chr(10) ||
  '4️⃣ The money from Diamond sales covers the withdrawal payments, plus the Helper earns an extra commission.' || chr(10) || chr(10) ||
  '💎 This system ensures fast, reliable payments for everyone while giving Payroll Helpers a fair earning opportunity.' || chr(10) || chr(10) ||
  'If you have any questions, please contact Support. Thank you for being part of MeriLive! 🎉',
  '{"priority": "normal", "broadcast": true}'::jsonb,
  false
FROM profiles p
WHERE p.is_deleted IS NOT TRUE
  AND p.id != 'ab155d31-96d4-4a42-855d-b2c090ba0339'
  AND p.id != '6888e618-ae45-4bbb-bbd2-6834fc0f9ff9';
