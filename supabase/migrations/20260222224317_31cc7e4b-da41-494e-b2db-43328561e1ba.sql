
INSERT INTO public.app_content (page_key, title, content, is_active)
VALUES (
  'google_library_order_rules',
  'Google Library Order — Rules & Guidelines',
  '## Google Library Order Rules

### 📋 General Rules
1. All orders must be placed through the official app
2. Orders are processed within 24-48 hours
3. Minimum order amount applies

### ⚠️ Important Notes
- Follow all guidelines carefully
- Contact support for any issues

### 📞 Support
For help, contact our support team through the app.',
  true
)
ON CONFLICT (page_key) DO NOTHING;
