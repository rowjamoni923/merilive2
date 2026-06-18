import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-client-platform, x-client-version, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface VpnResult {
  vpn: boolean;
  proxy: boolean;
  tor: boolean;
  relay: boolean;
  country_code: string | null;
  city: string | null;
  isp: string | null;
  ip: string;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour cache to prevent 429
const VPN_API_TIMEOUT_MS = 4000;
const ipResultCache = new Map<string, { result: VpnResult; expiresAt: number }>();

// Rate limit + circuit breaker guards for vpnapi.io
let lastApiCallAt = 0;
const API_COOLDOWN_MS = 300_000; // 5 minutes hard throttle
let apiBackoffUntil = 0;
const API_BACKOFF_MS = 30 * 60 * 1000; // 30 min circuit-breaker after 429

const cleanCache = () => {
  const now = Date.now();
  // Only clean if cache is getting large
  if (ipResultCache.size < 100) return;
  for (const [key, value] of ipResultCache.entries()) {
    if (value.expiresAt <= now) ipResultCache.delete(key);
  }
};

const getClientIp = (req: Request) => {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("x-real-ip")
    || req.headers.get("cf-connecting-ip")
    || "unknown";
};

const extractUserIdFromJwt = (authHeader: string | null): string | null => {
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const token = authHeader.slice(7);
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payload = JSON.parse(atob(parts[1]));
    return typeof payload?.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
};

const fetchVpnData = async (ip: string, vpnapiKey: string) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VPN_API_TIMEOUT_MS);

  try {
    const response = await fetch(`https://vpnapi.io/api/${ip}?key=${vpnapiKey}`, {
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`vpnapi.io HTTP ${response.status}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    cleanCache();

    const vpnapiKey = Deno.env.get("VPNAPI_KEY");
    if (!vpnapiKey) {
      console.error("[detect-vpn] VPNAPI_KEY not configured");
      return new Response(
        JSON.stringify({ vpn: false, proxy: false, tor: false, relay: false, error: "API key not configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ip = getClientIp(req);
    if (ip === "unknown" || ip === "127.0.0.1" || ip === "::1") {
      return new Response(
        JSON.stringify({ vpn: false, proxy: false, tor: false, relay: false, ip, local: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const now = Date.now();
    const cached = ipResultCache.get(ip);
    if (cached && cached.expiresAt > now) {
      return new Response(
        JSON.stringify({ ...cached.result, cached: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Circuit breaker: if vpnapi recently returned 429, skip external calls entirely
    if (now < apiBackoffUntil) {
      const safeResult: VpnResult = { vpn: false, proxy: false, tor: false, relay: false, country_code: null, city: null, isp: null, ip };
      return new Response(
        JSON.stringify({ ...safeResult, throttled: true, circuit_breaker: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Rate limit guard: prevent 429 from vpnapi.io
    if (now - lastApiCallAt < API_COOLDOWN_MS) {
      const safeResult: VpnResult = { vpn: false, proxy: false, tor: false, relay: false, country_code: null, city: null, isp: null, ip };
      return new Response(
        JSON.stringify({ ...safeResult, throttled: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    lastApiCallAt = now;
    let vpnData: any;
    try {
      vpnData = await fetchVpnData(ip, vpnapiKey);
    } catch (err: any) {
      const msg = String(err?.message || err || '');
      if (msg.includes('HTTP 429')) {
        apiBackoffUntil = Date.now() + API_BACKOFF_MS;
        const safeResult: VpnResult = { vpn: false, proxy: false, tor: false, relay: false, country_code: null, city: null, isp: null, ip };
        return new Response(
          JSON.stringify({ ...safeResult, throttled: true, circuit_breaker: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw err;
    }
    const security = vpnData?.security || {};
    const location = vpnData?.location || {};
    const network = vpnData?.network || {};

    const result: VpnResult = {
      vpn: security.vpn === true,
      proxy: security.proxy === true,
      tor: security.tor === true,
      relay: security.relay === true,
      country_code: location.country_code || null,
      city: location.city || null,
      isp: network.autonomous_system_organization || null,
      ip,
    };

    ipResultCache.set(ip, {
      result,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    const isAnyDetected = result.vpn || result.proxy || result.tor || result.relay;

    // Only write to DB for suspicious traffic to reduce database load
    if (isAnyDetected) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      const userId = extractUserIdFromJwt(req.headers.get("authorization"));

      try {
        await supabase.from("vpn_detection_logs").insert({
          user_id: userId,
          ip_address: ip,
          is_vpn: result.vpn,
          is_proxy: result.proxy,
          is_tor: result.tor,
          is_relay: result.relay,
          country_code: result.country_code,
          city: result.city,
          isp: result.isp,
          raw_response: vpnData,
        });
      } catch (logErr) {
        console.error("[detect-vpn] Failed to log:", logErr);
      }

      if (userId) {
        try {
          const detectionTypes = [
            result.vpn && "VPN",
            result.proxy && "Proxy",
            result.tor && "Tor",
            result.relay && "Relay",
          ].filter(Boolean).join(", ");

          await supabase.from("admin_notices").insert({
            title: `🛡️ VPN/Proxy Detected`,
            message: `User ID: ${userId}\nIP: ${ip}\nType: ${detectionTypes}\nISP: ${result.isp || "Unknown"}\nLocation: ${result.city || "?"}, ${result.country_code || "?"}`,
            priority: "high",
            target_audience: ["owner", "admin"],
            is_active: true,
          });
        } catch (notifErr) {
          console.error("[detect-vpn] Failed to notify admin:", notifErr);
        }
      }
    }

    console.log(`[detect-vpn] IP: ${ip}, VPN: ${result.vpn}, Proxy: ${result.proxy}, Tor: ${result.tor}`);

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    // Never fail hard on VPN service issues; return safe neutral response quickly
    console.error("[detect-vpn] Error:", error);
    return new Response(
      JSON.stringify({ vpn: false, proxy: false, tor: false, relay: false, error: "vpn_check_unavailable" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
