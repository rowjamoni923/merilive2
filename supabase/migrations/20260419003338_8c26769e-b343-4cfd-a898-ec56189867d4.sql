-- Add country_codes array column to payment_gateways for country-based filtering
ALTER TABLE public.payment_gateways
  ADD COLUMN IF NOT EXISTS country_codes text[] DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS is_integrated boolean DEFAULT false;

-- Index for fast country lookups
CREATE INDEX IF NOT EXISTS idx_payment_gateways_country_codes
  ON public.payment_gateways USING GIN (country_codes);

CREATE INDEX IF NOT EXISTS idx_payment_gateways_active_integrated
  ON public.payment_gateways (is_active, is_integrated);

-- Map every gateway to its correct country/countries
-- Bangladesh
UPDATE public.payment_gateways SET country_codes = ARRAY['BD'], is_integrated = true WHERE gateway_type IN ('zinipay','sslcommerz','aamarpay');
UPDATE public.payment_gateways SET country_codes = ARRAY['BD'] WHERE gateway_type IN ('bkash','nagad','rocket','upay');

-- India
UPDATE public.payment_gateways SET country_codes = ARRAY['IN'], is_integrated = true WHERE gateway_type IN ('phonepe','paytm','gpay','upi','razorpay','payu_in');
UPDATE public.payment_gateways SET country_codes = ARRAY['IN'] WHERE gateway_type IN ('phonepe','paytm','gpay','upi');

-- Pakistan
UPDATE public.payment_gateways SET country_codes = ARRAY['PK'], is_integrated = true WHERE gateway_type IN ('jazzcash','easypaisa','safepay');
UPDATE public.payment_gateways SET country_codes = ARRAY['PK'] WHERE gateway_type IN ('jazzcash','easypaisa');

-- Nepal
UPDATE public.payment_gateways SET country_codes = ARRAY['NP'], is_integrated = true WHERE gateway_type IN ('esewa','khalti');

-- Philippines
UPDATE public.payment_gateways SET country_codes = ARRAY['PH'], is_integrated = true WHERE gateway_type IN ('gcash','paymaya','paymongo');

-- Indonesia
UPDATE public.payment_gateways SET country_codes = ARRAY['ID'], is_integrated = true WHERE gateway_type IN ('gopay','ovo','dana','midtrans');

-- Vietnam
UPDATE public.payment_gateways SET country_codes = ARRAY['VN'], is_integrated = true WHERE gateway_type IN ('momo','zalopay','vnpay');

-- Thailand
UPDATE public.payment_gateways SET country_codes = ARRAY['TH'], is_integrated = true WHERE gateway_type IN ('promptpay','truemoney','omise');

-- Malaysia
UPDATE public.payment_gateways SET country_codes = ARRAY['MY'], is_integrated = true WHERE gateway_type IN ('boost','grabpay','touchngo','duitnow','billplz');

-- Singapore + SEA
UPDATE public.payment_gateways SET country_codes = ARRAY['SG'], is_integrated = true WHERE gateway_type IN ('paynow');
UPDATE public.payment_gateways SET country_codes = ARRAY['SG','MY','TH','PH','VN','ID'] WHERE gateway_type = 'grabpay';

-- China + HK + TW
UPDATE public.payment_gateways SET country_codes = ARRAY['CN','HK'], is_integrated = true WHERE gateway_type IN ('alipay','wechatpay','wechat');
UPDATE public.payment_gateways SET country_codes = ARRAY['TW'], is_integrated = true WHERE gateway_type = 'jkopay';
UPDATE public.payment_gateways SET country_codes = ARRAY['JP','TW'], is_integrated = true WHERE gateway_type = 'linepay';

-- Japan + Korea
UPDATE public.payment_gateways SET country_codes = ARRAY['JP'], is_integrated = true WHERE gateway_type = 'paypay';
UPDATE public.payment_gateways SET country_codes = ARRAY['KR'], is_integrated = true WHERE gateway_type = 'kakaopay';

-- Myanmar
UPDATE public.payment_gateways SET country_codes = ARRAY['MM'], is_integrated = true WHERE gateway_type = 'kbzpay';

-- Africa
UPDATE public.payment_gateways SET country_codes = ARRAY['KE','TZ','UG','GH'], is_integrated = true WHERE gateway_type IN ('mpesa');
UPDATE public.payment_gateways SET country_codes = ARRAY['KE','UG','TZ','RW','NG','GH','CM','ZM'], is_integrated = true WHERE gateway_type IN ('mtnmomo','airtelmoney');
UPDATE public.payment_gateways SET country_codes = ARRAY['NG'], is_integrated = true WHERE gateway_type IN ('opay','palmpay','paystack','flutterwave');
UPDATE public.payment_gateways SET country_codes = ARRAY['EG'], is_integrated = true WHERE gateway_type = 'fawry';
UPDATE public.payment_gateways SET country_codes = ARRAY['ZA','KE','GH','UG','NG'], is_integrated = true WHERE gateway_type = 'chippercash';

-- Middle East
UPDATE public.payment_gateways SET country_codes = ARRAY['AE'], is_integrated = true WHERE gateway_type IN ('careempay','payit');
UPDATE public.payment_gateways SET country_codes = ARRAY['SA'], is_integrated = true WHERE gateway_type IN ('mada','stcpay');
UPDATE public.payment_gateways SET country_codes = ARRAY['TR'], is_integrated = true WHERE gateway_type IN ('papara','ininal','iyzico');

-- Europe
UPDATE public.payment_gateways SET country_codes = ARRAY['NL'], is_integrated = true WHERE gateway_type = 'ideal';
UPDATE public.payment_gateways SET country_codes = ARRAY['BE'], is_integrated = true WHERE gateway_type = 'bancontact';
UPDATE public.payment_gateways SET country_codes = ARRAY['ES'], is_integrated = true WHERE gateway_type = 'bizum';
UPDATE public.payment_gateways SET country_codes = ARRAY['PL'], is_integrated = true WHERE gateway_type IN ('blik','przelewy24');
UPDATE public.payment_gateways SET country_codes = ARRAY['PT'], is_integrated = true WHERE gateway_type = 'mbway';
UPDATE public.payment_gateways SET country_codes = ARRAY['IT'], is_integrated = true WHERE gateway_type IN ('postepay','satispay');
UPDATE public.payment_gateways SET country_codes = ARRAY['DK','FI'], is_integrated = true WHERE gateway_type = 'mobilepay';
UPDATE public.payment_gateways SET country_codes = ARRAY['SE','NO','DE','AT','FI','UK','GB','US'], is_integrated = true WHERE gateway_type = 'klarna';
UPDATE public.payment_gateways SET country_codes = ARRAY['GB','UK','EU','DE','FR','ES','IT','NL'], is_integrated = true WHERE gateway_type = 'revolut';

-- Russia + CIS
UPDATE public.payment_gateways SET country_codes = ARRAY['RU'], is_integrated = true WHERE gateway_type IN ('yoomoney','sbp');
UPDATE public.payment_gateways SET country_codes = ARRAY['KZ'], is_integrated = true WHERE gateway_type = 'kaspi';
UPDATE public.payment_gateways SET country_codes = ARRAY['UZ'], is_integrated = true WHERE gateway_type IN ('click_uz','payme_uz');

-- Latin America
UPDATE public.payment_gateways SET country_codes = ARRAY['BR'], is_integrated = true WHERE gateway_type IN ('pix','picpay','mercadopago');
UPDATE public.payment_gateways SET country_codes = ARRAY['AR'], is_integrated = true WHERE gateway_type IN ('modo','mercadopago');
UPDATE public.payment_gateways SET country_codes = ARRAY['MX'], is_integrated = true WHERE gateway_type IN ('oxxo','mercadopago');
UPDATE public.payment_gateways SET country_codes = ARRAY['CL'], is_integrated = true WHERE gateway_type IN ('mach','fpay');
UPDATE public.payment_gateways SET country_codes = ARRAY['CO'], is_integrated = true WHERE gateway_type IN ('nequi','daviplata');
UPDATE public.payment_gateways SET country_codes = ARRAY['PE'], is_integrated = true WHERE gateway_type = 'plin';

-- North America + Oceania
UPDATE public.payment_gateways SET country_codes = ARRAY['US'], is_integrated = true WHERE gateway_type IN ('cashapp','venmo','zelle');
UPDATE public.payment_gateways SET country_codes = ARRAY['CA'], is_integrated = true WHERE gateway_type IN ('interac','koho');
UPDATE public.payment_gateways SET country_codes = ARRAY['AU'], is_integrated = true WHERE gateway_type IN ('payid_au','afterpay');
UPDATE public.payment_gateways SET country_codes = ARRAY['AU','NZ'], is_integrated = true WHERE gateway_type = 'poli';

-- Global / Multi-region
UPDATE public.payment_gateways SET country_codes = ARRAY['GLOBAL'], is_integrated = true WHERE gateway_type IN ('wise','paypal','skrill','payoneer','stripe','binance','crypto');

-- Anything still uncategorized: mark with empty array (admin will assign)
UPDATE public.payment_gateways SET country_codes = ARRAY[]::text[] WHERE country_codes IS NULL;