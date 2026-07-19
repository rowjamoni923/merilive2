import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getDetectedCountry } from "@/utils/countryDetectionCache";

interface LocationData {
  country: string;
  countryCode: string;
  countryFlag: string;
  city: string;
  region: string;
  loading: boolean;
  error: string | null;
}

// Country code to flag emoji mapping
export const getCountryFlag = (countryCode: string): string => {
  if (!countryCode || countryCode.length !== 2) return "🌍";
  const codePoints = countryCode
    .toUpperCase()
    .split("")
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
};

/**
 * Region → Country cross-validation map
 * Prevents wrong country_code when city/region clearly belongs to another country
 */
const regionToCountryMap: Record<string, string> = {
  'calabarzon': 'PH', 'national capital region': 'PH', 'metro manila': 'PH',
  'zamboanga peninsula': 'PH', 'western visayas': 'PH', 'northern mindanao': 'PH',
  'central visayas': 'PH', 'eastern visayas': 'PH', 'central luzon': 'PH',
  'davao region': 'PH', 'caraga': 'PH', 'soccsksargen': 'PH',
  'west bengal': 'IN', 'national capital territory of delhi': 'IN',
  'tamil nadu': 'IN', 'karnataka': 'IN', 'maharashtra': 'IN',
  'uttar pradesh': 'IN', 'rajasthan': 'IN', 'gujarat': 'IN',
  'kerala': 'IN', 'punjab': 'IN', 'haryana': 'IN', 'bihar': 'IN',
  'telangana': 'IN', 'andhra pradesh': 'IN',
  'west java': 'ID', 'east java': 'ID', 'central java': 'ID',
  'jakarta': 'ID', 'bali': 'ID', 'north sumatra': 'ID',
  'dhaka division': 'BD', 'chittagong division': 'BD', 'rajshahi division': 'BD',
  'khulna division': 'BD', 'sylhet division': 'BD', 'rangpur division': 'BD',
};

export const crossValidateCountry = (countryCode: string, region: string): string => {
  if (!region) return countryCode;
  const regionLower = region.toLowerCase().trim();
  const inferred = regionToCountryMap[regionLower];
  if (inferred && inferred !== countryCode) {
    console.log(`[Geolocation] ⚠️ CROSS-VALIDATION: ${countryCode} → ${inferred} (region: ${region})`);
    return inferred;
  }
  return countryCode;
};

// Country names in English
export const countryNamesEnglish: Record<string, string> = {
  BD: "Bangladesh",
  IN: "India",
  PK: "Pakistan",
  US: "United States",
  UK: "United Kingdom",
  GB: "United Kingdom",
  AE: "United Arab Emirates",
  SA: "Saudi Arabia",
  MY: "Malaysia",
  SG: "Singapore",
  CA: "Canada",
  AU: "Australia",
  DE: "Germany",
  FR: "France",
  IT: "Italy",
  JP: "Japan",
  CN: "China",
  KR: "South Korea",
  NP: "Nepal",
  LK: "Sri Lanka",
  QA: "Qatar",
  KW: "Kuwait",
  OM: "Oman",
  BH: "Bahrain",
  BE: "Belgium",
  NL: "Netherlands",
  AT: "Austria",
  ES: "Spain",
  PT: "Portugal",
  IE: "Ireland",
  GR: "Greece",
  PL: "Poland",
  CZ: "Czechia",
  HU: "Hungary",
  RO: "Romania",
  SE: "Sweden",
  NO: "Norway",
  DK: "Denmark",
  FI: "Finland",
  CH: "Switzerland",
  RU: "Russia",
  UA: "Ukraine",
  TR: "Turkey",
  EG: "Egypt",
  ZA: "South Africa",
  NG: "Nigeria",
  KE: "Kenya",
  GH: "Ghana",
  TH: "Thailand",
  VN: "Vietnam",
  ID: "Indonesia",
  PH: "Philippines",
  MX: "Mexico",
  BR: "Brazil",
  AR: "Argentina",
  CL: "Chile",
  CO: "Colombia",
  PE: "Peru",
  NZ: "New Zealand",
  MM: "Myanmar",
  KH: "Cambodia",
  LA: "Laos",
  AF: "Afghanistan",
  IQ: "Iraq",
  IR: "Iran",
  JO: "Jordan",
  LB: "Lebanon",
  PS: "Palestine",
  YE: "Yemen",
  LY: "Libya",
  TN: "Tunisia",
  DZ: "Algeria",
  MA: "Morocco",
  SD: "Sudan",
  ET: "Ethiopia",
  TZ: "Tanzania",
  UG: "Uganda",
};

/**
 * Fetch with timeout - prevents hanging on slow mobile networks
 */
const fetchWithTimeout = async (url: string, timeoutMs: number = 5000): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
};

/**
 * Single API fetch helper - returns country data or null
 */
const fetchFromAPI = async (
  name: string,
  url: string,
  extract: (data: any) => { countryCode: string; countryName: string; city: string; region: string; ip: string } | null
): Promise<{ countryCode: string; countryName: string; city: string; region: string; ip: string } | null> => {
  try {
    const response = await fetchWithTimeout(url, 4000);
    if (response.ok) {
      const data = await response.json();
      const result = extract(data);
      if (result) {
        // Cross-validate country against region
        result.countryCode = crossValidateCountry(result.countryCode, result.region);
        console.log(`[Geolocation] ${name} returned:`, result.countryCode, result.city);
        return result;
      }
    }
  } catch (e) {
    console.log(`[Geolocation] ${name} failed`);
  }
  return null;
};

/**
 * CONSENSUS-BASED country detection
 * Queries multiple APIs in PARALLEL and uses MAJORITY VOTE
 * This prevents a single API returning wrong country from corrupting data
 */
export const detectCountryViaIP = async (): Promise<{
  countryCode: string;
  countryName: string;
  city: string;
  region: string;
  ip: string;
} | null> => {
  // Fire ALL APIs simultaneously
  const results = await Promise.allSettled([
    fetchFromAPI("ipapi.co", "https://ipapi.co/json/", (data) => {
      if (!data.error && data.country_code) {
        return { countryCode: data.country_code, countryName: data.country_name || "", city: data.city || "", region: data.region || "", ip: data.ip || "" };
      }
      return null;
    }),
    fetchFromAPI("ipwho.is", "https://ipwho.is/", (data) => {
      if (data.success && data.country_code) {
        return { countryCode: data.country_code, countryName: data.country || "", city: data.city || "", region: data.region || "", ip: data.ip || "" };
      }
      return null;
    }),
    fetchFromAPI("freeipapi.com", "https://freeipapi.com/api/json", (data) => {
      if (data.countryCode) {
        return { countryCode: data.countryCode, countryName: data.countryName || "", city: data.cityName || "", region: data.regionName || "", ip: data.ipAddress || "" };
      }
      return null;
    }),
    fetchFromAPI("ipinfo.io", "https://ipinfo.io/json", (data) => {
      if (data.country) {
        return { countryCode: data.country, countryName: "", city: data.city || "", region: data.region || "", ip: data.ip || "" };
      }
      return null;
    }),
    fetchFromAPI("country.is", "https://api.country.is/", (data) => {
      if (data.country) {
        return { countryCode: data.country, countryName: "", city: "", region: "", ip: data.ip || "" };
      }
      return null;
    }),
  ]);

  // Collect successful results
  const successfulResults = results
    .filter((r): r is PromiseFulfilledResult<NonNullable<Awaited<ReturnType<typeof fetchFromAPI>>>> => 
      r.status === 'fulfilled' && r.value !== null
    )
    .map(r => r.value);

  if (successfulResults.length === 0) {
    console.log('[Geolocation] ALL IP APIs FAILED - no country detected');
    return null;
  }

  // Count votes for each country code
  const countryVotes: Record<string, number> = {};
  for (const result of successfulResults) {
    countryVotes[result.countryCode] = (countryVotes[result.countryCode] || 0) + 1;
  }

  // Find the country with most votes
  const sortedCountries = Object.entries(countryVotes).sort((a, b) => b[1] - a[1]);
  const winningCountry = sortedCountries[0][0];
  const winningVotes = sortedCountries[0][1];

  console.log('[Geolocation] CONSENSUS VOTE:', JSON.stringify(countryVotes), '→ Winner:', winningCountry, `(${winningVotes}/${successfulResults.length} APIs agree)`);

  // CRITICAL FIX: If a result has city+region data, its country_code is more reliable
  // because city-level detection requires actual user IP routing (not proxy/CDN)
  // Prioritize results that have city+region data — their country_code is trustworthy
  const detailedResults = successfulResults.filter(r => r.city && r.city.length > 0 && r.region && r.region.length > 0);
  
  if (detailedResults.length > 0) {
    // Use consensus among DETAILED results (city+region populated)
    const detailedVotes: Record<string, number> = {};
    for (const result of detailedResults) {
      detailedVotes[result.countryCode] = (detailedVotes[result.countryCode] || 0) + 1;
    }
    const detailedSorted = Object.entries(detailedVotes).sort((a, b) => b[1] - a[1]);
    const detailedWinner = detailedSorted[0][0];
    
    // If detailed results disagree with simple consensus, trust detailed results
    if (detailedWinner !== winningCountry) {
      console.log('[Geolocation] ⚠️ DETAILED results override consensus:', winningCountry, '→', detailedWinner, '(city/region-based)');
    }
    
    // Use the most detailed result from the winning detailed country
    const bestResult = detailedResults
      .filter(r => r.countryCode === detailedWinner)
      .sort((a, b) => (b.city.length + b.region.length) - (a.city.length + a.region.length))[0];
    
    return bestResult;
  }

  // Fallback: use consensus winner with most detail
  const winningResult = successfulResults
    .filter(r => r.countryCode === winningCountry)
    .sort((a, b) => (b.city.length + b.region.length) - (a.city.length + a.region.length))[0];

  return winningResult;
};

/**
 * useGeolocation - Location is LOCKED to registration country
 * 
 * POLICY: The country is set ONLY ONCE when the account is first created.
 * After that, the saved country from the profile is always used.
 * VPN usage will NEVER change the user's country.
 * 
 * Flow:
 * 1. Check if profile already has country_code saved
 * 2. If YES → use saved data, never detect again
 * 3. If NO → detect via IP (first registration), save it permanently
 * 
 * Mobile reliability: Uses 5 different IP APIs with 4s timeouts each,
 * plus browser geolocation as final fallback.
 */
export const useGeolocation = (userId: string | null, autoUpdate: boolean = true) => {
  const [location, setLocation] = useState<LocationData>({
    country: "",
    countryCode: "",
    countryFlag: "",
    city: "",
    region: "",
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!userId || !autoUpdate) {
      setLocation(prev => ({ ...prev, loading: false }));
      return;
    }

    let isMounted = true;

    const loadOrDetectLocation = async () => {
      try {
        // STEP 1: Always check saved profile location first
        const { data: profile } = await supabase
          .from("profiles")
          .select("country_code, country_name, country_flag, city, region, registration_ip, registration_user_agent, registration_device_info")
          .eq("id", userId)
          .maybeSingle();

        if (!isMounted) return;

        // If profile already has a country_code, USE IT and NEVER update location
        // EXCEPTION: BD (Bangladesh) profiles are auto-corrected if real IP shows foreign country
        if (profile?.country_code) {
          const countryCode = profile.country_code;
          
          // Special "NONE" marker = no country should be shown or detected
          if (countryCode === 'NONE') {
            setLocation({
              country: "",
              countryCode: "",
              countryFlag: "",
              city: "",
              region: "",
              loading: false,
              error: null,
            });
            console.log('[Geolocation] Account marked as NONE - no country displayed');
            return;
          }
          
          const countryFlag = profile.country_flag || getCountryFlag(countryCode);
          const countryName = profile.country_name || countryNamesEnglish[countryCode] || "Unknown";

          setLocation({
            country: countryName,
            countryCode,
            countryFlag,
            city: profile.city || "",
            region: profile.region || "",
            loading: false,
            error: null,
          });

          // Update last login IP & device info (non-blocking) + backfill registration data if missing
          // ALSO: If country is BD, auto-detect real country and correct it
          // IMPORTANT: Run this heavy audit sync only once per browser session per user
          const loginAuditSyncKey = `geo_login_audit_synced_${userId}`;
          let shouldRunLoginAuditSync = true;

          try {
            shouldRunLoginAuditSync = sessionStorage.getItem(loginAuditSyncKey) !== '1';
            if (shouldRunLoginAuditSync) {
              sessionStorage.setItem(loginAuditSyncKey, '1');
            }
          } catch {
            // If storage is unavailable, continue once for current render
          }

          if (shouldRunLoginAuditSync) {
            (async () => {
              try {
                let ipData: { ip?: string; city?: string; region?: string; countryCode?: string } | null = null;
                
                // Try server-side first
                try {
                  const serverResult = await getDetectedCountry();
                  if (serverResult?.ip) {
                    ipData = { ip: serverResult.ip, city: serverResult.city, region: serverResult.region, countryCode: serverResult.countryCode };
                  }
                } catch (e) {
                  console.log('[Geolocation] Server-side IP detection failed, trying client-side');
                }
                
                // Fallback to client-side
                if (!ipData) {
                  const clientResult = await detectCountryViaIP();
                  if (clientResult) {
                    ipData = { ip: clientResult.ip, city: clientResult.city, region: clientResult.region, countryCode: clientResult.countryCode };
                  }
                }

                const deviceInfo = {
                  userAgent: navigator.userAgent,
                  platform: navigator.platform || '',
                  language: navigator.language || '',
                  screenWidth: window.screen?.width || 0,
                  screenHeight: window.screen?.height || 0,
                  deviceMemory: (navigator as any).deviceMemory || null,
                  hardwareConcurrency: navigator.hardwareConcurrency || null,
                };

                const updateData: Record<string, any> = {
                  last_login_ip: ipData?.ip || null,
                  last_login_device_info: deviceInfo,
                  last_login_device: navigator.userAgent,
                  last_login_at: new Date().toISOString(),
                };

                // Backfill registration data if missing
                if (!profile?.registration_ip && ipData?.ip) {
                  updateData.registration_ip = ipData.ip;
                }
                if (!profile?.registration_user_agent) {
                  updateData.registration_user_agent = navigator.userAgent;
                }
                if (!profile?.registration_device_info) {
                  updateData.registration_device_info = deviceInfo;
                }
                if (!profile?.city && ipData?.city) {
                  updateData.city = ipData.city;
                }
                if (!profile?.region && ipData?.region) {
                  updateData.region = ipData.region;
                }

                // POLICY: Country is LOCKED to registration country forever.
                // VPN/IP changes must NEVER alter country_code, country_name, or country_flag.
                // No auto-correction here — the DB trigger also blocks any such update.

                await supabase
                  .from("profiles")
                  .update(updateData)
                  .eq("id", userId);
              } catch (err) {
                console.log('[Geolocation] Last login update failed:', err);
              }
            })();
          }

          console.log('[Geolocation] Using LOCKED registration country:', countryCode);
          return; // DO NOT detect or update - country is permanent (except BD auto-correct above)
        }

        // STEP 2: No country saved yet = first registration, detect via IP
        console.log('[Geolocation] First registration - detecting country via IP...');
        await detectAndSaveInitialLocation(userId, isMounted);

      } catch (error: any) {
        console.log('[Geolocation] Error:', error.message);
        if (isMounted) {
          setLocation(prev => ({
            ...prev,
            loading: false,
            error: "Could not load location",
          }));
        }
      }
    };

    loadOrDetectLocation();

    return () => {
      isMounted = false;
    };
  }, [userId, autoUpdate]);

  /**
   * Detect location via IP (multiple APIs) and save it PERMANENTLY to the profile.
   * This runs ONLY ONCE during first account creation.
   */
  const detectAndSaveInitialLocation = async (uid: string, isMounted: boolean) => {
    // Collect device info
    const deviceInfo = {
      userAgent: navigator.userAgent,
      platform: navigator.platform || '',
      language: navigator.language || '',
      screenWidth: window.screen?.width || 0,
      screenHeight: window.screen?.height || 0,
      deviceMemory: (navigator as any).deviceMemory || null,
      hardwareConcurrency: navigator.hardwareConcurrency || null,
    };

    // Try server-side detection first (accurate real IP, not proxy)
    let ipResult: { countryCode: string; countryName: string; city: string; region: string; ip: string } | null = null;
    
    try {
      const serverResult = await getDetectedCountry();
      if (serverResult?.countryCode) {
        ipResult = {
          countryCode: serverResult.countryCode,
          countryName: '',
          city: serverResult.city || '',
          region: serverResult.region || '',
          ip: serverResult.ip || '',
        };
        console.log('[Geolocation] Server-side initial detection:', ipResult.countryCode, ipResult.city);
      }
    } catch (e) {
      console.log('[Geolocation] Server-side detection failed, trying client-side fallback');
    }

    // Fallback to client-side
    if (!ipResult) {
      ipResult = await detectCountryViaIP();
    }

    if (ipResult) {
      const countryCode = ipResult.countryCode;
      const countryFlag = getCountryFlag(countryCode);
      const countryName = countryNamesEnglish[countryCode] || "Unknown";
      const city = ipResult.city;
      const region = ipResult.region;

      if (isMounted) {
        setLocation({
          country: countryName,
          countryCode,
          countryFlag,
          city,
          region,
          loading: false,
          error: null,
        });
      }

      // Save permanently to profile - this is the ONLY time we write location
      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          country_code: countryCode,
          country_name: countryName,
          country_flag: countryFlag,
          city: city,
          region: region,
          registration_ip: ipResult.ip || null,
          last_login_ip: ipResult.ip || null,
          registration_device_info: deviceInfo,
          last_login_device_info: deviceInfo,
          registration_user_agent: navigator.userAgent,
          last_login_device: navigator.userAgent,
        })
        .eq("id", uid);

      if (updateError) {
        console.log("Initial location save skipped:", updateError.message);
      } else {
        console.log('[Geolocation] Registration country LOCKED:', countryCode, countryName, 'IP:', ipResult.ip);
      }
      return;
    }

    // All IP APIs failed - try browser geolocation as last resort
    console.log('[Geolocation] All IP APIs failed, trying browser geolocation...');

    if ("geolocation" in navigator) {
      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            timeout: 8000,
            enableHighAccuracy: false,
            maximumAge: 300000, // Accept cached position up to 5 min old
          });
        });

        const { latitude, longitude } = position.coords;
        
        // Try reverse geocoding
        try {
          const geoResponse = await fetchWithTimeout(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`,
            5000
          );
          const geoData = await geoResponse.json();

          const countryCode = geoData.countryCode;
          if (!countryCode) {
            console.log('[Geolocation] Reverse geocoding returned no country code');
            throw new Error('No country code from reverse geocoding');
          }
          const countryFlag = getCountryFlag(countryCode);
          const countryName = countryNamesEnglish[countryCode] || geoData.countryName || "Unknown";

          if (isMounted) {
            setLocation({
              country: countryName,
              countryCode,
              countryFlag,
              city: geoData.city || geoData.locality || "",
              region: geoData.principalSubdivision || "",
              loading: false,
              error: null,
            });
          }

          // Save permanently
          await supabase
            .from("profiles")
            .update({
              country_code: countryCode,
              country_name: countryName,
              country_flag: countryFlag,
              city: geoData.city || geoData.locality || "",
              region: geoData.principalSubdivision || "",
            })
            .eq("id", uid);

          console.log('[Geolocation] Registration country LOCKED (browser):', countryCode);
          return;
        } catch (geoError) {
          console.log('[Geolocation] Reverse geocoding failed');
        }
      } catch (navError) {
        console.log('[Geolocation] Browser geolocation denied/failed');
      }
    }

    // Everything failed - set default
    await setDefaultLocation(uid, isMounted);
  };

  /**
   * When all detection fails, DON'T save any country - leave it null
   * so detection will be retried on next login
   */
  const setDefaultLocation = async (uid: string, isMounted: boolean = true) => {
    if (isMounted) {
      setLocation({
        country: "",
        countryCode: "",
        countryFlag: "🌍",
        city: "",
        region: "",
        loading: false,
        error: "Location detection failed - will retry on next login",
      });
    }

    // DO NOT save BD as default - leave country_code null so it retries next login
    console.log('[Geolocation] All detection failed - NOT saving default country. Will retry next login.');
  };

  return location;
};

export default useGeolocation;
