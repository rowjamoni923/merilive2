-- Add notification template for agency host added
INSERT INTO notification_templates (template_key, title_template, message_template, description)
VALUES (
  'agency_host_added',
  '🎉 এজেন্সিতে যোগ হয়েছে!',
  'অভিনন্দন! আপনি "{{agency_name}}" এজেন্সিতে হোস্ট হিসেবে যোগ দিয়েছেন। এখন লাইভ স্ট্রিমিং শুরু করুন এবং আয় করুন!',
  'যখন কোনো হোস্ট এজেন্সিতে যোগ দেয়'
)
ON CONFLICT (template_key) DO NOTHING;