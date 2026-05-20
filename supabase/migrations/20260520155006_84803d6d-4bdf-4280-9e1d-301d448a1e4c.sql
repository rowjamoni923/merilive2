-- Pkg71: Admin-configurable server-side floor for Swift Pay crypto deposits
INSERT INTO public.app_settings (setting_key, setting_value, description)
VALUES (
  'swift_pay_crypto_min_usd',
  jsonb_build_object('min_usd', 100),
  'Server-side minimum USD amount for swift-pay-create-deposit custom user_diamond deposits (helper-application crypto fee). Edge function rejects anything below this. Mirrors client constant CRYPTO_PAYMENT_MIN_USD but cannot be bypassed by a tampered client.'
)
ON CONFLICT (setting_key) DO NOTHING;