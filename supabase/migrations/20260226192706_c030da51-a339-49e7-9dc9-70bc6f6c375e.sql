
-- Auto-sync country_name and country_flag when country_code changes
CREATE OR REPLACE FUNCTION public.sync_country_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_country_name TEXT;
  v_country_flag TEXT;
  v_code TEXT;
BEGIN
  v_code := UPPER(COALESCE(NEW.country_code, ''));
  
  -- Only act if country_code actually changed
  IF v_code = UPPER(COALESCE(OLD.country_code, '')) AND TG_OP = 'UPDATE' THEN
    RETURN NEW;
  END IF;
  
  IF v_code = '' THEN
    RETURN NEW;
  END IF;

  -- Master English country name mapping
  v_country_name := CASE v_code
    WHEN 'AF' THEN 'Afghanistan'
    WHEN 'AL' THEN 'Albania'
    WHEN 'DZ' THEN 'Algeria'
    WHEN 'AR' THEN 'Argentina'
    WHEN 'AM' THEN 'Armenia'
    WHEN 'AU' THEN 'Australia'
    WHEN 'AT' THEN 'Austria'
    WHEN 'AZ' THEN 'Azerbaijan'
    WHEN 'BH' THEN 'Bahrain'
    WHEN 'BD' THEN 'Bangladesh'
    WHEN 'BY' THEN 'Belarus'
    WHEN 'BE' THEN 'Belgium'
    WHEN 'BJ' THEN 'Benin'
    WHEN 'BT' THEN 'Bhutan'
    WHEN 'BO' THEN 'Bolivia'
    WHEN 'BA' THEN 'Bosnia and Herzegovina'
    WHEN 'BR' THEN 'Brazil'
    WHEN 'BN' THEN 'Brunei'
    WHEN 'BG' THEN 'Bulgaria'
    WHEN 'BF' THEN 'Burkina Faso'
    WHEN 'KH' THEN 'Cambodia'
    WHEN 'CM' THEN 'Cameroon'
    WHEN 'CA' THEN 'Canada'
    WHEN 'CF' THEN 'Central African Republic'
    WHEN 'TD' THEN 'Chad'
    WHEN 'CL' THEN 'Chile'
    WHEN 'CN' THEN 'China'
    WHEN 'CO' THEN 'Colombia'
    WHEN 'CD' THEN 'Congo'
    WHEN 'CR' THEN 'Costa Rica'
    WHEN 'HR' THEN 'Croatia'
    WHEN 'CU' THEN 'Cuba'
    WHEN 'CY' THEN 'Cyprus'
    WHEN 'CZ' THEN 'Czech Republic'
    WHEN 'DK' THEN 'Denmark'
    WHEN 'DJ' THEN 'Djibouti'
    WHEN 'DO' THEN 'Dominican Republic'
    WHEN 'EC' THEN 'Ecuador'
    WHEN 'EG' THEN 'Egypt'
    WHEN 'SV' THEN 'El Salvador'
    WHEN 'GQ' THEN 'Equatorial Guinea'
    WHEN 'ER' THEN 'Eritrea'
    WHEN 'EE' THEN 'Estonia'
    WHEN 'ET' THEN 'Ethiopia'
    WHEN 'FI' THEN 'Finland'
    WHEN 'FR' THEN 'France'
    WHEN 'GA' THEN 'Gabon'
    WHEN 'GM' THEN 'Gambia'
    WHEN 'GE' THEN 'Georgia'
    WHEN 'DE' THEN 'Germany'
    WHEN 'GH' THEN 'Ghana'
    WHEN 'GR' THEN 'Greece'
    WHEN 'GT' THEN 'Guatemala'
    WHEN 'GN' THEN 'Guinea'
    WHEN 'HT' THEN 'Haiti'
    WHEN 'HN' THEN 'Honduras'
    WHEN 'HK' THEN 'Hong Kong'
    WHEN 'HU' THEN 'Hungary'
    WHEN 'IS' THEN 'Iceland'
    WHEN 'IN' THEN 'India'
    WHEN 'ID' THEN 'Indonesia'
    WHEN 'IR' THEN 'Iran'
    WHEN 'IQ' THEN 'Iraq'
    WHEN 'IE' THEN 'Ireland'
    WHEN 'IL' THEN 'Israel'
    WHEN 'IT' THEN 'Italy'
    WHEN 'CI' THEN 'Ivory Coast'
    WHEN 'JM' THEN 'Jamaica'
    WHEN 'JP' THEN 'Japan'
    WHEN 'JO' THEN 'Jordan'
    WHEN 'KZ' THEN 'Kazakhstan'
    WHEN 'KE' THEN 'Kenya'
    WHEN 'KW' THEN 'Kuwait'
    WHEN 'KG' THEN 'Kyrgyzstan'
    WHEN 'LA' THEN 'Laos'
    WHEN 'LV' THEN 'Latvia'
    WHEN 'LB' THEN 'Lebanon'
    WHEN 'LR' THEN 'Liberia'
    WHEN 'LY' THEN 'Libya'
    WHEN 'LT' THEN 'Lithuania'
    WHEN 'LU' THEN 'Luxembourg'
    WHEN 'MO' THEN 'Macau'
    WHEN 'MG' THEN 'Madagascar'
    WHEN 'MW' THEN 'Malawi'
    WHEN 'MY' THEN 'Malaysia'
    WHEN 'MV' THEN 'Maldives'
    WHEN 'ML' THEN 'Mali'
    WHEN 'MT' THEN 'Malta'
    WHEN 'MR' THEN 'Mauritania'
    WHEN 'MU' THEN 'Mauritius'
    WHEN 'MX' THEN 'Mexico'
    WHEN 'MD' THEN 'Moldova'
    WHEN 'MN' THEN 'Mongolia'
    WHEN 'ME' THEN 'Montenegro'
    WHEN 'MA' THEN 'Morocco'
    WHEN 'MZ' THEN 'Mozambique'
    WHEN 'MM' THEN 'Myanmar'
    WHEN 'NA' THEN 'Namibia'
    WHEN 'NP' THEN 'Nepal'
    WHEN 'NL' THEN 'Netherlands'
    WHEN 'NZ' THEN 'New Zealand'
    WHEN 'NI' THEN 'Nicaragua'
    WHEN 'NE' THEN 'Niger'
    WHEN 'NG' THEN 'Nigeria'
    WHEN 'KP' THEN 'North Korea'
    WHEN 'MK' THEN 'North Macedonia'
    WHEN 'NO' THEN 'Norway'
    WHEN 'OM' THEN 'Oman'
    WHEN 'PK' THEN 'Pakistan'
    WHEN 'PS' THEN 'Palestine'
    WHEN 'PA' THEN 'Panama'
    WHEN 'PG' THEN 'Papua New Guinea'
    WHEN 'PY' THEN 'Paraguay'
    WHEN 'PE' THEN 'Peru'
    WHEN 'PH' THEN 'Philippines'
    WHEN 'PL' THEN 'Poland'
    WHEN 'PT' THEN 'Portugal'
    WHEN 'QA' THEN 'Qatar'
    WHEN 'RO' THEN 'Romania'
    WHEN 'RU' THEN 'Russia'
    WHEN 'RW' THEN 'Rwanda'
    WHEN 'SA' THEN 'Saudi Arabia'
    WHEN 'SN' THEN 'Senegal'
    WHEN 'RS' THEN 'Serbia'
    WHEN 'SL' THEN 'Sierra Leone'
    WHEN 'SG' THEN 'Singapore'
    WHEN 'SK' THEN 'Slovakia'
    WHEN 'SI' THEN 'Slovenia'
    WHEN 'SO' THEN 'Somalia'
    WHEN 'ZA' THEN 'South Africa'
    WHEN 'KR' THEN 'South Korea'
    WHEN 'SS' THEN 'South Sudan'
    WHEN 'ES' THEN 'Spain'
    WHEN 'LK' THEN 'Sri Lanka'
    WHEN 'SD' THEN 'Sudan'
    WHEN 'SR' THEN 'Suriname'
    WHEN 'SE' THEN 'Sweden'
    WHEN 'CH' THEN 'Switzerland'
    WHEN 'SY' THEN 'Syria'
    WHEN 'TW' THEN 'Taiwan'
    WHEN 'TJ' THEN 'Tajikistan'
    WHEN 'TZ' THEN 'Tanzania'
    WHEN 'TH' THEN 'Thailand'
    WHEN 'TG' THEN 'Togo'
    WHEN 'TN' THEN 'Tunisia'
    WHEN 'TR' THEN 'Turkey'
    WHEN 'TM' THEN 'Turkmenistan'
    WHEN 'UG' THEN 'Uganda'
    WHEN 'UA' THEN 'Ukraine'
    WHEN 'AE' THEN 'United Arab Emirates'
    WHEN 'GB' THEN 'United Kingdom'
    WHEN 'US' THEN 'United States'
    WHEN 'UY' THEN 'Uruguay'
    WHEN 'UZ' THEN 'Uzbekistan'
    WHEN 'VE' THEN 'Venezuela'
    WHEN 'VN' THEN 'Vietnam'
    WHEN 'YE' THEN 'Yemen'
    WHEN 'ZM' THEN 'Zambia'
    WHEN 'ZW' THEN 'Zimbabwe'
    ELSE v_code
  END;

  -- Generate flag emoji from country code
  v_country_flag := chr(127397 + ascii(substring(v_code from 1 for 1))) || chr(127397 + ascii(substring(v_code from 2 for 1)));

  NEW.country_name := v_country_name;
  NEW.country_flag := v_country_flag;
  
  RETURN NEW;
END;
$$;

-- Drop existing trigger if any
DROP TRIGGER IF EXISTS trigger_sync_country_fields ON profiles;

-- Create trigger on INSERT and UPDATE
CREATE TRIGGER trigger_sync_country_fields
  BEFORE INSERT OR UPDATE OF country_code ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION sync_country_fields();
