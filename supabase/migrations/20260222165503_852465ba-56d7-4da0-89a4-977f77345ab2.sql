-- Fix all non-English country names to English using our country code mapping
-- This ensures consistency across the entire database

-- Bangladesh (Bengali name)
UPDATE profiles SET country_name = 'Bangladesh' WHERE country_code = 'BD' AND country_name != 'Bangladesh';

-- Also fix any other non-English country names that might exist
UPDATE profiles SET country_name = 'India' WHERE country_code = 'IN' AND country_name NOT IN ('India', '');
UPDATE profiles SET country_name = 'Pakistan' WHERE country_code = 'PK' AND country_name NOT IN ('Pakistan', '');
UPDATE profiles SET country_name = 'United States' WHERE country_code = 'US' AND country_name NOT IN ('United States', '');
UPDATE profiles SET country_name = 'United Kingdom' WHERE country_code IN ('UK', 'GB') AND country_name NOT IN ('United Kingdom', '');
UPDATE profiles SET country_name = 'United Arab Emirates' WHERE country_code = 'AE' AND country_name NOT IN ('United Arab Emirates', '');
UPDATE profiles SET country_name = 'Saudi Arabia' WHERE country_code = 'SA' AND country_name NOT IN ('Saudi Arabia', '');
UPDATE profiles SET country_name = 'Nepal' WHERE country_code = 'NP' AND country_name NOT IN ('Nepal', '');
UPDATE profiles SET country_name = 'Sri Lanka' WHERE country_code = 'LK' AND country_name NOT IN ('Sri Lanka', '');
UPDATE profiles SET country_name = 'Malaysia' WHERE country_code = 'MY' AND country_name NOT IN ('Malaysia', '');
UPDATE profiles SET country_name = 'Singapore' WHERE country_code = 'SG' AND country_name NOT IN ('Singapore', '');
UPDATE profiles SET country_name = 'Indonesia' WHERE country_code = 'ID' AND country_name NOT IN ('Indonesia', '');
UPDATE profiles SET country_name = 'Philippines' WHERE country_code = 'PH' AND country_name NOT IN ('Philippines', '');
UPDATE profiles SET country_name = 'Thailand' WHERE country_code = 'TH' AND country_name NOT IN ('Thailand', '');
UPDATE profiles SET country_name = 'Vietnam' WHERE country_code = 'VN' AND country_name NOT IN ('Vietnam', '');
UPDATE profiles SET country_name = 'Myanmar' WHERE country_code = 'MM' AND country_name NOT IN ('Myanmar', '');
UPDATE profiles SET country_name = 'South Korea' WHERE country_code = 'KR' AND country_name NOT IN ('South Korea', '');
UPDATE profiles SET country_name = 'Japan' WHERE country_code = 'JP' AND country_name NOT IN ('Japan', '');
UPDATE profiles SET country_name = 'China' WHERE country_code = 'CN' AND country_name NOT IN ('China', '');
UPDATE profiles SET country_name = 'Russia' WHERE country_code = 'RU' AND country_name NOT IN ('Russia', '');
UPDATE profiles SET country_name = 'Turkey' WHERE country_code = 'TR' AND country_name NOT IN ('Turkey', '');
UPDATE profiles SET country_name = 'Egypt' WHERE country_code = 'EG' AND country_name NOT IN ('Egypt', '');
UPDATE profiles SET country_name = 'Nigeria' WHERE country_code = 'NG' AND country_name NOT IN ('Nigeria', '');
UPDATE profiles SET country_name = 'Kenya' WHERE country_code = 'KE' AND country_name NOT IN ('Kenya', '');
UPDATE profiles SET country_name = 'South Africa' WHERE country_code = 'ZA' AND country_name NOT IN ('South Africa', '');
UPDATE profiles SET country_name = 'Brazil' WHERE country_code = 'BR' AND country_name NOT IN ('Brazil', '');
UPDATE profiles SET country_name = 'Mexico' WHERE country_code = 'MX' AND country_name NOT IN ('Mexico', '');
UPDATE profiles SET country_name = 'Qatar' WHERE country_code = 'QA' AND country_name NOT IN ('Qatar', '');
UPDATE profiles SET country_name = 'Kuwait' WHERE country_code = 'KW' AND country_name NOT IN ('Kuwait', '');
UPDATE profiles SET country_name = 'Oman' WHERE country_code = 'OM' AND country_name NOT IN ('Oman', '');
UPDATE profiles SET country_name = 'Bahrain' WHERE country_code = 'BH' AND country_name NOT IN ('Bahrain', '');
UPDATE profiles SET country_name = 'Iraq' WHERE country_code = 'IQ' AND country_name NOT IN ('Iraq', '');
UPDATE profiles SET country_name = 'Iran' WHERE country_code = 'IR' AND country_name NOT IN ('Iran', '');
UPDATE profiles SET country_name = 'Afghanistan' WHERE country_code = 'AF' AND country_name NOT IN ('Afghanistan', '');
UPDATE profiles SET country_name = 'Cambodia' WHERE country_code = 'KH' AND country_name NOT IN ('Cambodia', '');
