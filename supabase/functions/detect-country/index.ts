import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-client-platform, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

/**
 * Region → Country mapping for CROSS-VALIDATION
 * If an API returns wrong country but correct city/region, this catches it
 */
const regionToCountry: Record<string, string> = {
  // Philippines
  'calabarzon': 'PH', 'national capital region': 'PH', 'metro manila': 'PH',
  'zamboanga peninsula': 'PH', 'western visayas': 'PH', 'northern mindanao': 'PH',
  'central visayas': 'PH', 'eastern visayas': 'PH', 'ilocos region': 'PH',
  'cagayan valley': 'PH', 'central luzon': 'PH', 'mimaropa': 'PH',
  'bicol region': 'PH', 'caraga': 'PH', 'davao region': 'PH',
  'soccsksargen': 'PH', 'cordillera': 'PH', 'bangsamoro': 'PH',
  // India
  'west bengal': 'IN', 'national capital territory of delhi': 'IN',
  'tamil nadu': 'IN', 'karnataka': 'IN', 'maharashtra': 'IN',
  'uttar pradesh': 'IN', 'rajasthan': 'IN', 'gujarat': 'IN',
  'madhya pradesh': 'IN', 'andhra pradesh': 'IN', 'telangana': 'IN',
  'kerala': 'IN', 'punjab': 'IN', 'haryana': 'IN', 'bihar': 'IN',
  'odisha': 'IN', 'jharkhand': 'IN', 'assam': 'IN', 'chhattisgarh': 'IN',
  // Indonesia
  'west java': 'ID', 'east java': 'ID', 'central java': 'ID',
  'jakarta': 'ID', 'bali': 'ID', 'north sumatra': 'ID',
  'south sulawesi': 'ID', 'yogyakarta': 'ID',
  // Bangladesh (real)
  'dhaka division': 'BD', 'chittagong division': 'BD', 'rajshahi division': 'BD',
  'khulna division': 'BD', 'sylhet division': 'BD', 'rangpur division': 'BD',
  'barisal division': 'BD', 'mymensingh division': 'BD',
  // Pakistan
  'sindh': 'PK', 'punjab (pakistan)': 'PK', 'khyber pakhtunkhwa': 'PK',
  'balochistan': 'PK', 'islamabad capital territory': 'PK',
  // Kenya
  'nairobi': 'KE', 'mombasa': 'KE',
};

/**
 * Cross-validate: if region clearly belongs to a different country, override
 */
function crossValidateCountry(
  countryCode: string,
  city: string,
  region: string
): string {
  if (!region) return countryCode;
  
  const regionLower = region.toLowerCase().trim();
  const inferredCountry = regionToCountry[regionLower];
  
  if (inferredCountry && inferredCountry !== countryCode) {
    console.log(`[detect-country] ⚠️ CROSS-VALIDATION OVERRIDE: ${countryCode} → ${inferredCountry} (region: ${region})`);
    return inferredCountry;
  }
  
  return countryCode;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const realIP = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() 
      || req.headers.get('x-real-ip') 
      || req.headers.get('cf-connecting-ip')
      || '';

    console.log('[detect-country] Real user IP:', realIP);

    if (!realIP || realIP === '127.0.0.1') {
      return new Response(JSON.stringify({ error: 'Could not determine IP' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apis = [
      {
        name: 'ipapi.co',
        url: `https://ipapi.co/${realIP}/json/`,
        extract: (d: any) => d.country_code && !d.error ? { countryCode: d.country_code, city: d.city || '', region: d.region || '' } : null,
      },
      {
      },
      {
      },
      {
      },
    ];

    const results = await Promise.allSettled(
      apis.map(async (api) => {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 4000);
          const res = await fetch(api.url, { signal: controller.signal });
          clearTimeout(timeout);
          if (res.ok) {
            const data = await res.json();
            const result = api.extract(data);
            if (result) {
              // Cross-validate each individual result
              result.countryCode = crossValidateCountry(result.countryCode, result.city, result.region);
              console.log(`[detect-country] ${api.name} → ${result.countryCode} (${result.city})`);
              return result;
            }
          }
        } catch (e) {
          console.log(`[detect-country] ${api.name} failed`);
        }
        return null;
      })
    );

    const successful = results
      .filter((r): r is PromiseFulfilledResult<{ countryCode: string; city: string; region: string }> => 
        r.status === 'fulfilled' && r.value !== null
      )
      .map(r => r.value);

    if (successful.length === 0) {
      return new Response(JSON.stringify({ error: 'All IP APIs failed', ip: realIP }), {
      });
    }

    // Majority vote (after cross-validation)
    const votes: Record<string, number> = {};
    for (const r of successful) {
      votes[r.countryCode] = (votes[r.countryCode] || 0) + 1;
    }

    const sorted = Object.entries(votes).sort((a, b) => b[1] - a[1]);
    const winnerCode = sorted[0][0];

    const detailedResults = successful.filter(r => r.countryCode === winnerCode && r.city);
    const best = detailedResults.length > 0 ? detailedResults[0] : successful.find(r => r.countryCode === winnerCode)!;

    console.log(`[detect-country] CONSENSUS: ${winnerCode} (${sorted[0][1]}/${successful.length} agree)`);

    return new Response(JSON.stringify({
      countryCode: best.countryCode,
      city: best.city,
      region: best.region,
      ip: realIP,
    }), {
    });

  } catch (error) {
    console.error('[detect-country] Error:', error);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
    });
  }
});
