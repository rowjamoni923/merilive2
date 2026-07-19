// Pkg236 — Play Integrity API verification edge function
// Accepts a Play Integrity token from the Android client, calls Google's
// Play Integrity API using the service-account JSON, and returns the
// decoded verdict (device/app/account integrity).
//
// Secrets required:
//   GOOGLE_PLAY_INTEGRITY_SA_JSON — full service-account JSON for
//     play-verification@merilive-913fc.iam.gserviceaccount.com

import { createClient as createSbClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PACKAGE_NAME = "com.merilive.app";

interface SaJson {
  client_email: string;
  private_key: string;
  token_uri: string;
}

// ---------- JWT signing for Google OAuth2 ----------
function base64UrlEncode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

async function getAccessToken(sa: SaJson): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/playintegrity",
    aud: sa.token_uri,
    exp: now + 3600,
    iat: now,
  };
  const enc = new TextEncoder();
  const signingInput =
    base64UrlEncode(enc.encode(JSON.stringify(header))) +
    "." +
    base64UrlEncode(enc.encode(JSON.stringify(claim)));

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    enc.encode(signingInput),
  );
  const jwt = signingInput + "." + base64UrlEncode(sig);

  const res = await fetch(sa.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:
      "grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=" + jwt,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`OAuth token exchange failed: ${res.status} ${t}`);
  }
  const json = await res.json();
  return json.access_token as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const integrityToken: string | undefined = body?.integrityToken;
    const nonce: string | undefined = body?.nonce;
    if (!integrityToken || typeof integrityToken !== "string") {
      return new Response(
        JSON.stringify({ error: "integrityToken required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const saRaw = Deno.env.get("GOOGLE_PLAY_INTEGRITY_SA_JSON");
    if (!saRaw) {
      console.error("GOOGLE_PLAY_INTEGRITY_SA_JSON missing");
      return new Response(
        JSON.stringify({ error: "Server not configured" }),
        {
        },
      );
    }
    let sa: SaJson;
    try {
      sa = JSON.parse(saRaw);
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid SA JSON" }),
        {
        },
      );
    }

    const accessToken = await getAccessToken(sa);

    const url =
      `https://playintegrity.googleapis.com/v1/${encodeURIComponent(
        PACKAGE_NAME,
      )}:decodeIntegrityToken`;
    const decRes = await fetch(url, {
      method: "POST",
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ integrityToken }),
    });
    if (!decRes.ok) {
      const t = await decRes.text();
      console.error("decodeIntegrityToken failed", decRes.status, t);
      return new Response(
        JSON.stringify({ error: "Integrity decode failed", detail: t }),
        {
        },
      );
    }
    const verdict = await decRes.json();
    const payload = verdict?.tokenPayloadExternal ?? {};

    // ---- Evaluate verdict ----
    const appRecognized =
      payload?.appIntegrity?.appRecognitionVerdict;
    const deviceVerdicts: string[] =
      payload?.deviceIntegrity?.deviceRecognitionVerdict ?? [];
    const accountVerdict =
      payload?.accountDetails?.appLicensingVerdict;
    const requestNonce = payload?.requestDetails?.nonce;
    const requestPackage = payload?.requestDetails?.requestPackageName;

    const nonceOk = !nonce || nonce === requestNonce;
    const packageOk = requestPackage === PACKAGE_NAME;
    const appOk =
      appRecognized === "PLAY_RECOGNIZED" ||
      appRecognized === "UNRECOGNIZED_VERSION"; // dev/internal builds
    const deviceOk = deviceVerdicts.includes("MEETS_DEVICE_INTEGRITY") ||
      deviceVerdicts.includes("MEETS_BASIC_INTEGRITY") ||
      deviceVerdicts.includes("MEETS_STRONG_INTEGRITY") ||
      deviceVerdicts.includes("MEETS_VIRTUAL_INTEGRITY");
    const passed = nonceOk && packageOk && appOk && deviceOk;

    // ---- Optional: log verdict for the calling user ----
    try {
      const authHeader = req.headers.get("Authorization") ?? "";
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (authHeader && supabaseUrl && serviceKey) {
        const userClient = createSbClient(supabaseUrl, serviceKey, {
          global: { headers: { Authorization: authHeader } },
        });
        const { data: u } = await userClient.auth.getUser();
        if (u?.user?.id) {
          await createSbClient(supabaseUrl, serviceKey)
            .from("play_integrity_verdicts")
            .insert({
              user_id: u.user.id,
              passed,
              app_verdict: appRecognized ?? null,
              device_verdicts: deviceVerdicts,
              account_verdict: accountVerdict ?? null,
              package_name: requestPackage ?? null,
              nonce_ok: nonceOk,
            })
            .then(() => {})
            .catch(() => {});
        }
      }
    } catch (e) {
      console.warn("verdict log skipped", e);
    }

    return new Response(
      JSON.stringify({
        passed,
        appVerdict: appRecognized,
        deviceVerdicts,
        accountVerdict,
        nonceOk,
        packageOk,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("verify-play-integrity error", e);
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Unknown error",
      }),
      {
      },
    );
  }
});
