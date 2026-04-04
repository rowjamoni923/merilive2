-- Insert agency approved notification template
INSERT INTO notification_templates (template_key, title_template, message_template, description)
VALUES (
  'agency_approved',
  '🎉 এজেন্সি তৈরি হয়েছে!',
  'অভিনন্দন! আপনার এজেন্সি "{{agency_name}}" সফলভাবে তৈরি হয়েছে।

এজেন্সি কোড: {{agency_code}}

এখন আপনি হোস্টদের আমন্ত্রণ জানাতে পারবেন এবং কমিশন আয় করতে পারবেন।',
  'এজেন্সি তৈরি সফল হলে পাঠানো নোটিফিকেশন'
)
ON CONFLICT (template_key) DO NOTHING;