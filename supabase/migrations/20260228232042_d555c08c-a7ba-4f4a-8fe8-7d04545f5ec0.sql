
-- Send urgent notification to 5 payroll helpers who misused diamonds as gifts
INSERT INTO notifications (user_id, type, title, message, data, is_read)
VALUES
('c8eeeaf8-0361-4e31-8c76-736d18de17b9', 'system', '⚠️ Urgent: Payroll Helper Responsibility Notice', 
 'Dear Payroll Helper, please be informed that you are responsible for processing ALL agency withdrawal requests from your assigned country. After completing each withdrawal payment, you will receive diamonds as your reward. You can then sell those diamonds in your local currency through the Reseller Panel. However, if you misuse your diamonds (e.g., sending them as gifts instead of selling), the loss is entirely your responsibility. Your primary duty is to fulfill withdrawal payments — diamonds are your compensation for that service. Please act responsibly.',
 '{"priority": "urgent"}'::jsonb, false),

('3a5ff8c4-154a-455a-89b0-dd8fbb02bf12', 'system', '⚠️ Urgent: Payroll Helper Responsibility Notice',
 'Dear Payroll Helper, please be informed that you are responsible for processing ALL agency withdrawal requests from your assigned country. After completing each withdrawal payment, you will receive diamonds as your reward. You can then sell those diamonds in your local currency through the Reseller Panel. However, if you misuse your diamonds (e.g., sending them as gifts instead of selling), the loss is entirely your responsibility. Your primary duty is to fulfill withdrawal payments — diamonds are your compensation for that service. Please act responsibly.',
 '{"priority": "urgent"}'::jsonb, false),

('0a66301f-585a-48a5-913d-872650b9ef30', 'system', '⚠️ Urgent: Payroll Helper Responsibility Notice',
 'Dear Payroll Helper, please be informed that you are responsible for processing ALL agency withdrawal requests from your assigned country. After completing each withdrawal payment, you will receive diamonds as your reward. You can then sell those diamonds in your local currency through the Reseller Panel. However, if you misuse your diamonds (e.g., sending them as gifts instead of selling), the loss is entirely your responsibility. Your primary duty is to fulfill withdrawal payments — diamonds are your compensation for that service. Please act responsibly.',
 '{"priority": "urgent"}'::jsonb, false),

('8abc308e-81a1-4ebe-81fe-ee0cb68fd9d0', 'system', '⚠️ Urgent: Payroll Helper Responsibility Notice',
 'Dear Payroll Helper, please be informed that you are responsible for processing ALL agency withdrawal requests from your assigned country. After completing each withdrawal payment, you will receive diamonds as your reward. You can then sell those diamonds in your local currency through the Reseller Panel. However, if you misuse your diamonds (e.g., sending them as gifts instead of selling), the loss is entirely your responsibility. Your primary duty is to fulfill withdrawal payments — diamonds are your compensation for that service. Please act responsibly.',
 '{"priority": "urgent"}'::jsonb, false),

('39c6675e-ad02-4f00-a5c4-5f040e1a8929', 'system', '⚠️ Urgent: Payroll Helper Responsibility Notice',
 'Dear Payroll Helper, please be informed that you are responsible for processing ALL agency withdrawal requests from your assigned country. After completing each withdrawal payment, you will receive diamonds as your reward. You can then sell those diamonds in your local currency through the Reseller Panel. However, if you misuse your diamonds (e.g., sending them as gifts instead of selling), the loss is entirely your responsibility. Your primary duty is to fulfill withdrawal payments — diamonds are your compensation for that service. Please act responsibly.',
 '{"priority": "urgent"}'::jsonb, false);
