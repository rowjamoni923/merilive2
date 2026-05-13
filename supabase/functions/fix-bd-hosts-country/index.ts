import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-client-platform, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

// Country code to flag emoji mapping
const countryFlags: Record<string, string> = {
  AF: "🇦🇫", AL: "🇦🇱", DZ: "🇩🇿", AD: "🇦🇩", AO: "🇦🇴", AR: "🇦🇷", AM: "🇦🇲",
  AU: "🇦🇺", AT: "🇦🇹", AZ: "🇦🇿", BH: "🇧🇭", BD: "🇧🇩", BY: "🇧🇾", BE: "🇧🇪",
  BZ: "🇧🇿", BJ: "🇧🇯", BT: "🇧🇹", BO: "🇧🇴", BA: "🇧🇦", BW: "🇧🇼", BR: "🇧🇷",
  BN: "🇧🇳", BG: "🇧🇬", BF: "🇧🇫", BI: "🇧🇮", KH: "🇰🇭", CM: "🇨🇲", CA: "🇨🇦",
  CF: "🇨🇫", TD: "🇹🇩", CL: "🇨🇱", CN: "🇨🇳", CO: "🇨🇴", CD: "🇨🇩", CR: "🇨🇷",
  CI: "🇨🇮", HR: "🇭🇷", CU: "🇨🇺", CY: "🇨🇾", CZ: "🇨🇿", DK: "🇩🇰", DJ: "🇩🇯",
  EC: "🇪🇨", EG: "🇪🇬", SV: "🇸🇻", GQ: "🇬🇶", ER: "🇪🇷", EE: "🇪🇪", ET: "🇪🇹",
  FJ: "🇫🇯", FI: "🇫🇮", FR: "🇫🇷", GA: "🇬🇦", GM: "🇬🇲", GE: "🇬🇪", DE: "🇩🇪",
  GH: "🇬🇭", GR: "🇬🇷", GT: "🇬🇹", GN: "🇬🇳", GY: "🇬🇾", HT: "🇭🇹", HN: "🇭🇳",
  HK: "🇭🇰", HU: "🇭🇺", IS: "🇮🇸", IN: "🇮🇳", ID: "🇮🇩", IR: "🇮🇷", IQ: "🇮🇶",
  IE: "🇮🇪", IL: "🇮🇱", IT: "🇮🇹", JM: "🇯🇲", JP: "🇯🇵", JO: "🇯🇴", KZ: "🇰🇿",
  KE: "🇰🇪", KW: "🇰🇼", KG: "🇰🇬", LA: "🇱🇦", LV: "🇱🇻", LB: "🇱🇧", LS: "🇱🇸",
  LR: "🇱🇷", LY: "🇱🇾", LT: "🇱🇹", LU: "🇱🇺", MG: "🇲🇬", MW: "🇲🇼", MY: "🇲🇾",
  MV: "🇲🇻", ML: "🇲🇱", MT: "🇲🇹", MR: "🇲🇷", MU: "🇲🇺", MX: "🇲🇽", MD: "🇲🇩",
  MN: "🇲🇳", ME: "🇲🇪", MA: "🇲🇦", MZ: "🇲🇿", MM: "🇲🇲", NA: "🇳🇦", NP: "🇳🇵",
  NL: "🇳🇱", NZ: "🇳🇿", NI: "🇳🇮", NE: "🇳🇪", NG: "🇳🇬", KP: "🇰🇵", MK: "🇲🇰",
  NO: "🇳🇴", OM: "🇴🇲", PK: "🇵🇰", PS: "🇵🇸", PA: "🇵🇦", PG: "🇵🇬", PY: "🇵🇾",
  PE: "🇵🇪", PH: "🇵🇭", PL: "🇵🇱", PT: "🇵🇹", QA: "🇶🇦", RO: "🇷🇴", RU: "🇷🇺",
  RW: "🇷🇼", SA: "🇸🇦", SN: "🇸🇳", RS: "🇷🇸", SG: "🇸🇬", SK: "🇸🇰", SI: "🇸🇮",
  SO: "🇸🇴", ZA: "🇿🇦", KR: "🇰🇷", SS: "🇸🇸", ES: "🇪🇸", LK: "🇱🇰", SD: "🇸🇩",
  SE: "🇸🇪", CH: "🇨🇭", SY: "🇸🇾", TW: "🇹🇼", TJ: "🇹🇯", TZ: "🇹🇿", TH: "🇹🇭",
  TG: "🇹🇬", TN: "🇹🇳", TR: "🇹🇷", TM: "🇹🇲", UG: "🇺🇬", UA: "🇺🇦", AE: "🇦🇪",
  GB: "🇬🇧", US: "🇺🇸", UY: "🇺🇾", UZ: "🇺🇿", VE: "🇻🇪", VN: "🇻🇳", YE: "🇾🇪",
  ZM: "🇿🇲", ZW: "🇿🇼",
}

// Country code to English name mapping
const countryNames: Record<string, string> = {
  AF: "Afghanistan", AL: "Albania", DZ: "Algeria", AD: "Andorra", AO: "Angola",
  AR: "Argentina", AM: "Armenia", AU: "Australia", AT: "Austria", AZ: "Azerbaijan",
  BH: "Bahrain", BD: "Bangladesh", BY: "Belarus", BE: "Belgium", BZ: "Belize",
  BJ: "Benin", BT: "Bhutan", BO: "Bolivia", BA: "Bosnia", BW: "Botswana",
  BR: "Brazil", BN: "Brunei", BG: "Bulgaria", BF: "Burkina Faso", BI: "Burundi",
  KH: "Cambodia", CM: "Cameroon", CA: "Canada", CF: "Central African Rep.", TD: "Chad",
  CL: "Chile", CN: "China", CO: "Colombia", CD: "Congo (DRC)", CR: "Costa Rica",
  CI: "Côte d'Ivoire", HR: "Croatia", CU: "Cuba", CY: "Cyprus", CZ: "Czech Republic",
  DK: "Denmark", DJ: "Djibouti", EC: "Ecuador", EG: "Egypt", SV: "El Salvador",
  GQ: "Equatorial Guinea", ER: "Eritrea", EE: "Estonia", ET: "Ethiopia",
  FJ: "Fiji", FI: "Finland", FR: "France", GA: "Gabon", GM: "Gambia",
  GE: "Georgia", DE: "Germany", GH: "Ghana", GR: "Greece", GT: "Guatemala",
  GN: "Guinea", GY: "Guyana", HT: "Haiti", HN: "Honduras", HK: "Hong Kong",
  HU: "Hungary", IS: "Iceland", IN: "India", ID: "Indonesia", IR: "Iran",
  IQ: "Iraq", IE: "Ireland", IL: "Israel", IT: "Italy", JM: "Jamaica",
  JP: "Japan", JO: "Jordan", KZ: "Kazakhstan", KE: "Kenya", KW: "Kuwait",
  KG: "Kyrgyzstan", LA: "Laos", LV: "Latvia", LB: "Lebanon", LS: "Lesotho",
  LR: "Liberia", LY: "Libya", LT: "Lithuania", LU: "Luxembourg", MG: "Madagascar",
  MW: "Malawi", MY: "Malaysia", MV: "Maldives", ML: "Mali", MT: "Malta",
  MR: "Mauritania", MU: "Mauritius", MX: "Mexico", MD: "Moldova", MN: "Mongolia",
  ME: "Montenegro", MA: "Morocco", MZ: "Mozambique", MM: "Myanmar", NA: "Namibia",
  NP: "Nepal", NL: "Netherlands", NZ: "New Zealand", NI: "Nicaragua", NE: "Niger",
  NG: "Nigeria", KP: "North Korea", MK: "North Macedonia", NO: "Norway", OM: "Oman",
  PK: "Pakistan", PS: "Palestine", PA: "Panama", PG: "Papua New Guinea", PY: "Paraguay",
  PE: "Peru", PH: "Philippines", PL: "Poland", PT: "Portugal", QA: "Qatar",
  RO: "Romania", RU: "Russia", RW: "Rwanda", SA: "Saudi Arabia", SN: "Senegal",
  RS: "Serbia", SG: "Singapore", SK: "Slovakia", SI: "Slovenia", SO: "Somalia",
  ZA: "South Africa", KR: "South Korea", SS: "South Sudan", ES: "Spain",
  LK: "Sri Lanka", SD: "Sudan", SE: "Sweden", CH: "Switzerland", SY: "Syria",
  TW: "Taiwan", TJ: "Tajikistan", TZ: "Tanzania", TH: "Thailand", TG: "Togo",
  TN: "Tunisia", TR: "Turkey", TM: "Turkmenistan", UG: "Uganda", UA: "Ukraine",
  AE: "UAE", GB: "United Kingdom", US: "United States", UY: "Uruguay",
  UZ: "Uzbekistan", VE: "Venezuela", VN: "Vietnam", YE: "Yemen",
  ZM: "Zambia", ZW: "Zimbabwe",
}

// City → Country fallback for hosts with no IP but with city/region data
const cityToCountry: Record<string, string> = {
  'samsun': 'TR', 'istanbul': 'TR', 'ankara': 'TR', 'izmir': 'TR', 'mahmutbey': 'TR', 'tekirdağ': 'TR',
  'manila': 'PH', 'quezon city': 'PH', 'cebu': 'PH', 'davao': 'PH', 'makati': 'PH',
  'lagos': 'NG', 'abuja': 'NG', 'ibadan': 'NG', 'kano': 'NG',
  'accra': 'GH', 'kumasi': 'GH', 'tamale': 'GH',
  'nairobi': 'KE', 'mombasa': 'KE',
  'rome': 'IT', 'milan': 'IT', 'naples': 'IT',
  'tokyo': 'JP', 'osaka': 'JP', 'kyoto': 'JP',
  'london': 'GB', 'manchester': 'GB', 'birmingham': 'GB',
  'new delhi': 'IN', 'mumbai': 'IN', 'kolkata': 'IN', 'bengaluru': 'IN', 'chennai': 'IN',
  'karachi': 'PK', 'lahore': 'PK', 'islamabad': 'PK', 'rawalpindi': 'PK',
  'kathmandu': 'NP', 'pokhara': 'NP',
  'jakarta': 'ID', 'surabaya': 'ID', 'bandung': 'ID', 'yogyakarta': 'ID',
  'dubai': 'AE', 'abu dhabi': 'AE', 'sharjah': 'AE',
  'riyadh': 'SA', 'jeddah': 'SA', 'mecca': 'SA', 'dammam': 'SA',
  'são paulo': 'BR', 'rio de janeiro': 'BR',
  'paris': 'FR', 'marseille': 'FR', 'lyon': 'FR',
  'frankfurt am main': 'DE', 'berlin': 'DE', 'munich': 'DE', 'nuremberg': 'DE',
  'bucharest': 'RO',
  'amman': 'JO',
  'cairo': 'EG',
  'addis ababa': 'ET',
}

// Region → Country fallback
const regionToCountry: Record<string, string> = {
  'samsun': 'TR', 'istanbul': 'TR', 'ankara': 'TR',
  'calabarzon': 'PH', 'national capital region': 'PH', 'metro manila': 'PH',
  'western visayas': 'PH', 'central visayas': 'PH', 'davao region': 'PH',
  'central luzon': 'PH', 'eastern visayas': 'PH',
  'west bengal': 'IN', 'tamil nadu': 'IN', 'karnataka': 'IN', 'maharashtra': 'IN',
  'uttar pradesh': 'IN', 'rajasthan': 'IN', 'kerala': 'IN', 'telangana': 'IN',
  'west java': 'ID', 'east java': 'ID', 'central java': 'ID', 'bali': 'ID',
  'sindh': 'PK', 'punjab': 'PK', 'khyber pakhtunkhwa': 'PK',
  'lagos': 'NG', 'ogun': 'NG', 'rivers': 'NG',
  'greater accra': 'GH', 'ashanti': 'GH',
  'lazio': 'IT', 'lombardy': 'IT',
  'île-de-france': 'FR',
  'england': 'GB', 'scotland': 'GB',
}

async function detectCountryFromIP(ip: string): Promise<{ code: string; name: string; flag: string } | null> {
  // Skip invalid IPs
  if (!ip || ip === '127.0.0.1') return null;

  const isIPv6 = ip.includes(':');

  // APIs that support both IPv4 and IPv6
  const apis = [
    {
      url: `https://ipapi.co/${ip}/json/`,
      parse: (d: any) => !d.error ? d.country_code : null,
    },
    {
      url: `https://ipwho.is/${ip}`,
      parse: (d: any) => d.success ? d.country_code : null,
    },
    // ip-api.com only works with IPv4
    ...(!isIPv6 ? [{
      url: `http://ip-api.com/json/${ip}?fields=countryCode,country,city`,
      parse: (d: any) => d.countryCode || null,
    }] : []),
    {
      url: `https://freeipapi.com/api/json/${ip}`,
      parse: (d: any) => d.countryCode || null,
    },
  ];

  // Query all APIs in parallel for speed
  const results = await Promise.allSettled(
    apis.map(async (api) => {
      try {
        const resp = await fetch(api.url, { signal: AbortSignal.timeout(6000) });
        if (resp.ok) {
          const data = await resp.json();
          const code = api.parse(data);
          if (code && code.length === 2) return code;
        }
      } catch { /* skip */ }
      return null;
    })
  );

  // Majority vote
  const votes: Record<string, number> = {};
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) {
      votes[r.value] = (votes[r.value] || 0) + 1;
    }
  }

  const sorted = Object.entries(votes).sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) return null;

  const code = sorted[0][0];
  return {
    code,
    name: countryNames[code] || code,
    flag: countryFlags[code] || '',
  };
}

function detectCountryFromCityRegion(city: string | null, region: string | null): { code: string; name: string; flag: string } | null {
  // Try city first
  if (city) {
    const cityLower = city.toLowerCase().trim();
    const code = cityToCountry[cityLower];
    if (code && code !== 'BD') {
      return { code, name: countryNames[code] || code, flag: countryFlags[code] || '' };
    }
  }
  // Try region
  if (region) {
    const regionLower = region.toLowerCase().trim();
    const code = regionToCountry[regionLower];
    if (code && code !== 'BD') {
      return { code, name: countryNames[code] || code, flag: countryFlags[code] || '' };
    }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get all BD hosts
    const { data: bdHosts, error } = await supabase
      .from('profiles')
      .select('id, display_name, country_code, country_name, last_login_ip, registration_ip, city, region')
      .eq('is_host', true)
      .eq('country_code', 'BD');

    if (error) throw error;

    const results: any[] = [];
    let updated = 0;
    let skipped = 0;

    for (const host of (bdHosts || [])) {
      const ip = host.last_login_ip || host.registration_ip;
      
      let detected: { code: string; name: string; flag: string } | null = null;

      // Strategy 1: Use IP (supports both IPv4 and IPv6)
      if (ip) {
        detected = await detectCountryFromIP(ip);
        // If IP says BD, this person is actually in BD — skip
        if (detected && detected.code === 'BD') {
          skipped++;
          results.push({ id: host.id, name: host.display_name, ip, status: 'actually_BD' });
          continue;
        }
      }

      // Strategy 2: If IP detection failed or no IP, try city/region fallback
      if (!detected) {
        detected = detectCountryFromCityRegion(host.city, host.region);
      }

      // If still no detection, skip
      if (!detected) {
        skipped++;
        results.push({ id: host.id, name: host.display_name, ip: ip || null, city: host.city, region: host.region, status: ip ? 'detect_failed' : 'no_ip_no_city' });
        continue;
      }

      // Update the host's country
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          country_code: detected.code,
          country_name: detected.name,
          country_flag: detected.flag,
        })
        .eq('id', host.id);

      if (updateError) {
        results.push({ id: host.id, name: host.display_name, ip, status: 'update_error', error: updateError.message });
      } else {
        updated++;
        results.push({ id: host.id, name: host.display_name, ip, city: host.city, region: host.region, status: 'fixed', from: 'BD', to: detected.code, flag: detected.flag, method: ip ? 'ip' : 'city_region' });
      }

      // Rate limit: 300ms between API calls
      await new Promise(r => setTimeout(r, 300));
    }

    return new Response(JSON.stringify({
      total: bdHosts?.length || 0,
      updated,
      skipped,
      results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
