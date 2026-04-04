
-- Insert popular payment methods for countries worldwide (2 per country)
INSERT INTO payment_gateways (name, gateway_code, description, supported_currencies, logo_url, is_active) VALUES
-- South Asia
('bKash', 'bkash', 'বিকাশ পেমেন্ট গেটওয়ে', ARRAY['BDT'], null, true),
('Nagad', 'nagad', 'নগদ পেমেন্ট গেটওয়ে', ARRAY['BDT'], null, true),
('Paytm', 'paytm', 'India leading digital payment platform', ARRAY['INR'], null, true),
('PhonePe', 'phonepe', 'UPI-based payment app', ARRAY['INR'], null, true),
('JazzCash', 'jazzcash', 'Pakistan mobile wallet', ARRAY['PKR'], null, true),
('EasyPaisa', 'easypaisa', 'Pakistan digital payment', ARRAY['PKR'], null, true),
('eSewa', 'esewa', 'Nepal digital wallet', ARRAY['NPR'], null, true),
('Khalti', 'khalti', 'Nepal payment gateway', ARRAY['NPR'], null, true),

-- Southeast Asia
('GoPay', 'gopay', 'Indonesia e-wallet by Gojek', ARRAY['IDR'], null, true),
('OVO', 'ovo', 'Indonesia digital payment', ARRAY['IDR'], null, true),
('GCash', 'gcash', 'Philippines mobile wallet', ARRAY['PHP'], null, true),
('PayMaya', 'paymaya', 'Philippines digital payment', ARRAY['PHP'], null, true),
('MoMo', 'momo', 'Vietnam e-wallet', ARRAY['VND'], null, true),
('ZaloPay', 'zalopay', 'Vietnam digital payment', ARRAY['VND'], null, true),
('PromptPay', 'promptpay', 'Thailand national payment', ARRAY['THB'], null, true),
('TrueMoney', 'truemoney', 'Thailand e-wallet', ARRAY['THB'], null, true),
('Touch n Go', 'touchngo', 'Malaysia e-wallet', ARRAY['MYR'], null, true),
('Boost', 'boost', 'Malaysia digital payment', ARRAY['MYR'], null, true),
('PayNow', 'paynow', 'Singapore instant transfer', ARRAY['SGD'], null, true),
('GrabPay', 'grabpay', 'Southeast Asia payment', ARRAY['SGD','MYR','PHP','THB','VND','IDR'], null, true),
('Wave', 'wave_mm', 'Myanmar mobile money', ARRAY['MMK'], null, true),
('KBZPay', 'kbzpay', 'Myanmar digital wallet', ARRAY['MMK'], null, true),

-- East Asia
('Alipay', 'alipay', 'China largest payment platform', ARRAY['CNY'], null, true),
('WeChat Pay', 'wechatpay', 'China social payment', ARRAY['CNY'], null, true),
('PayPay', 'paypay', 'Japan mobile payment', ARRAY['JPY'], null, true),
('LINE Pay', 'linepay', 'Japan/Taiwan payment', ARRAY['JPY','TWD'], null, true),
('KakaoPay', 'kakaopay', 'South Korea payment', ARRAY['KRW'], null, true),
('Toss', 'toss', 'South Korea fintech', ARRAY['KRW'], null, true),
('JKOPay', 'jkopay', 'Taiwan mobile payment', ARRAY['TWD'], null, true),
('Taiwan Pay', 'taiwanpay', 'Taiwan national payment', ARRAY['TWD'], null, true),

-- Middle East
('STC Pay', 'stcpay', 'Saudi Arabia payment', ARRAY['SAR'], null, true),
('Mada', 'mada', 'Saudi debit network', ARRAY['SAR'], null, true),
('Fawry', 'fawry', 'Egypt payment network', ARRAY['EGP'], null, true),
('Vodafone Cash', 'vodafonecash', 'Egypt mobile money', ARRAY['EGP'], null, true),
('Careem Pay', 'careempay', 'UAE digital wallet', ARRAY['AED'], null, true),
('Payit', 'payit', 'UAE payment by FAB', ARRAY['AED'], null, true),
('Papara', 'papara', 'Turkey e-wallet', ARRAY['TRY'], null, true),
('Ininal', 'ininal', 'Turkey prepaid card', ARRAY['TRY'], null, true),

-- Africa
('M-Pesa', 'mpesa', 'Kenya/Africa mobile money', ARRAY['KES','TZS','GHS'], null, true),
('Airtel Money', 'airtelmoney', 'Africa mobile payment', ARRAY['KES','UGX','TZS'], null, true),
('OPay', 'opay', 'Nigeria fintech', ARRAY['NGN'], null, true),
('PalmPay', 'palmpay', 'Nigeria digital wallet', ARRAY['NGN'], null, true),
('SnapScan', 'snapscan', 'South Africa QR payment', ARRAY['ZAR'], null, true),
('Zapper', 'zapper', 'South Africa mobile payment', ARRAY['ZAR'], null, true),
('MTN MoMo', 'mtnmomo', 'Africa mobile money', ARRAY['GHS','UGX','RWF'], null, true),
('Chipper Cash', 'chippercash', 'Africa cross-border payment', ARRAY['NGN','GHS','KES','UGX','ZAR'], null, true),

-- North America
('Venmo', 'venmo', 'US peer-to-peer payment', ARRAY['USD'], null, true),
('Cash App', 'cashapp', 'US mobile payment by Block', ARRAY['USD'], null, true),
('Zelle', 'zelle', 'US bank transfer network', ARRAY['USD'], null, true),
('PayPal', 'paypal', 'Global online payment', ARRAY['USD','EUR','GBP','CAD','AUD'], null, true),
('Interac', 'interac', 'Canada payment network', ARRAY['CAD'], null, true),
('KOHO', 'koho', 'Canada fintech', ARRAY['CAD'], null, true),

-- Latin America
('PIX', 'pix', 'Brazil instant payment', ARRAY['BRL'], null, true),
('PicPay', 'picpay', 'Brazil digital wallet', ARRAY['BRL'], null, true),
('Mercado Pago', 'mercadopago', 'Latin America payment', ARRAY['ARS','BRL','MXN','CLP','COP','PEN'], null, true),
('OXXO', 'oxxo', 'Mexico cash payment', ARRAY['MXN'], null, true),
('Nequi', 'nequi', 'Colombia digital wallet', ARRAY['COP'], null, true),
('Daviplata', 'daviplata', 'Colombia mobile payment', ARRAY['COP'], null, true),
('Uala', 'uala', 'Argentina fintech', ARRAY['ARS'], null, true),
('Modo', 'modo', 'Argentina digital wallet', ARRAY['ARS'], null, true),
('Yape', 'yape', 'Peru mobile payment', ARRAY['PEN'], null, true),
('Plin', 'plin', 'Peru digital wallet', ARRAY['PEN'], null, true),
('Mach', 'mach', 'Chile prepaid card', ARRAY['CLP'], null, true),
('Fpay', 'fpay', 'Chile digital wallet', ARRAY['CLP'], null, true),

-- Europe
('Revolut', 'revolut', 'Europe digital bank', ARRAY['EUR','GBP','USD'], null, true),
('Wise', 'wise', 'International transfer', ARRAY['EUR','GBP','USD'], null, true),
('Klarna', 'klarna', 'Europe buy now pay later', ARRAY['EUR','SEK','NOK','DKK'], null, true),
('iDEAL', 'ideal', 'Netherlands bank payment', ARRAY['EUR'], null, true),
('Bancontact', 'bancontact', 'Belgium payment', ARRAY['EUR'], null, true),
('Swish', 'swish', 'Sweden mobile payment', ARRAY['SEK'], null, true),
('Vipps', 'vipps', 'Norway mobile payment', ARRAY['NOK'], null, true),
('MobilePay', 'mobilepay', 'Denmark/Finland payment', ARRAY['DKK','EUR'], null, true),
('Bizum', 'bizum', 'Spain instant payment', ARRAY['EUR'], null, true),
('MB Way', 'mbway', 'Portugal mobile payment', ARRAY['EUR'], null, true),
('Satispay', 'satispay', 'Italy mobile payment', ARRAY['EUR'], null, true),
('Postepay', 'postepay', 'Italy prepaid card', ARRAY['EUR'], null, true),
('Twint', 'twint', 'Switzerland mobile payment', ARRAY['CHF'], null, true),
('BLIK', 'blik', 'Poland mobile payment', ARRAY['PLN'], null, true),
('Przelewy24', 'przelewy24', 'Poland online payment', ARRAY['PLN'], null, true),

-- Oceania
('PayID', 'payid_au', 'Australia instant transfer', ARRAY['AUD'], null, true),
('Afterpay', 'afterpay', 'Australia buy now pay later', ARRAY['AUD','NZD'], null, true),
('POLi', 'poli', 'Australia/NZ bank payment', ARRAY['AUD','NZD'], null, true),

-- Russia/CIS
('YooMoney', 'yoomoney', 'Russia digital wallet', ARRAY['RUB'], null, true),
('SBP', 'sbp', 'Russia instant payment', ARRAY['RUB'], null, true),
('Kaspi', 'kaspi', 'Kazakhstan super app', ARRAY['KZT'], null, true),
('Click', 'click_uz', 'Uzbekistan payment', ARRAY['UZS'], null, true),
('Payme', 'payme_uz', 'Uzbekistan mobile payment', ARRAY['UZS'], null, true)

ON CONFLICT (gateway_code) DO NOTHING;
