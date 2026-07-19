// Shared FCM v1 helper for high-priority data-only pushes (call ringing).
// Designed for fan-out scenarios (random call broadcast). All errors are swallowed
// per-token; caller receives per-token success flags.

interface ServiceAccountCredentials {
  private_key: string;
  client_email: string;
  project_id: string;
}

let cachedToken: { value: string; exp: number } | null = null;

function b64url(input: string): string {
  return btoa(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function mintAccessToken(creds: ServiceAccountCredentials): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.value;

  const header = { alg: "RS256", typ: "JWT" };
  const exp = now + 3600;
  const payload = {
    iss: creds.client_email,
    sub: creds.client_email,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
  };
  const headerB64 = b64url(JSON.stringify(header));
  const payloadB64 = b64url(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;

  const pem = creds.private_key
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const binKey = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    binKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput),
  );
  const sigB64 = b64url(String.fromCharCode(...new Uint8Array(sig)));
  const jwt = `${signingInput}.${sigB64}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`fcm_token_failed: ${json.error_description || json.error}`);
  cachedToken = { value: json.access_token as string, exp };
  return cachedToken.value;
}

export interface FcmDispatchResult {
  token: string;
  success: boolean;
  invalid?: boolean;
  error?: string;
}

export async function dispatchHighPriorityData(
  tokens: { token: string; platform?: string | null }[],
  data: Record<string, string>,
  ttlSeconds: number,
): Promise<FcmDispatchResult[]> {
  const sa = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON");
  if (!sa || tokens.length === 0) {
    return tokens.map((t) => ({ token: t.token, success: false, error: "fcm_not_configured" }));
  }
  let creds: ServiceAccountCredentials;
  try {
    creds = JSON.parse(sa);
  } catch (_e) {
    return tokens.map((t) => ({ token: t.token, success: false, error: "fcm_bad_credentials" }));
  }
  let accessToken: string;
  try {
    accessToken = await mintAccessToken(creds);
  } catch (e) {
    return tokens.map((t) => ({ token: t.token, success: false, error: String(e) }));
  }

  return Promise.all(
    tokens.map(async (t) => {
      try {
        const msg = {
          message: {
            token: t.token,
            data,
            android: { priority: "high", ttl: `${ttlSeconds}s` },
            apns: {
              headers: { "apns-priority": "10", "apns-push-type": "background" },
              payload: { aps: { "content-available": 1 } },
            },
          },
        };
        const r = await fetch(
          `https://fcm.googleapis.com/v1/projects/${creds.project_id}/messages:send`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify(msg),
          },
        );
        const j = await r.json();
        if (!r.ok) {
          const invalid = j.error?.details?.some(
            (d: { errorCode?: string }) =>
              d.errorCode === "UNREGISTERED" || d.errorCode === "INVALID_ARGUMENT",
          );
          return { token: t.token, success: false, invalid: !!invalid, error: j.error?.message ?? "fcm_error" };
        }
        return { token: t.token, success: true };
      } catch (e) {
        return { token: t.token, success: false, error: String(e) };
      }
    }),
  );
}
