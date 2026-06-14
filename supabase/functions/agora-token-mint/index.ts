// Agora RTC AccessToken v006 — inline Deno/Web-Crypto implementation
// Validates AGORA_APP_ID + AGORA_APP_CERTIFICATE by minting a real token.
// POST { channelName?, uid?, role?, expireSeconds? }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VERSION = "006";

enum Privilege {
  kJoinChannel = 1,
  kPublishAudioStream = 2,
  kPublishVideoStream = 3,
  kPublishDataStream = 4,
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

function concatBytes(...arrs: Uint8Array[]): Uint8Array {
  const total = arrs.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) { out.set(a, off); off += a.length; }
  return out;
}

// little-endian writers
function u16LE(n: number): Uint8Array {
  const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, n, true); return b;
}
function u32LE(n: number): Uint8Array {
  const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n >>> 0, true); return b;
}
function packString(s: string): Uint8Array {
  const enc = new TextEncoder().encode(s);
  return concatBytes(u16LE(enc.length), enc);
}
// map of uint16->uint32 privileges, little-endian
function packPrivileges(map: Map<number, number>): Uint8Array {
  const keys = Array.from(map.keys()).sort((a, b) => a - b);
  const parts: Uint8Array[] = [u16LE(keys.length)];
  for (const k of keys) {
    parts.push(u16LE(k));
    parts.push(u32LE(map.get(k)!));
  }
  return concatBytes(...parts);
}

async function hmacSha256(keyStr: string, data: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(keyStr),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, data);
  return new Uint8Array(sig);
}

// CRC32 (IEEE 802.3) — needed for v006 header
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

async function buildRtcToken(
  appId: string,
  appCert: string,
  channelName: string,
  uid: number,
  role: "publisher" | "subscriber",
  expireTs: number,
): Promise<string> {
  const salt = (Math.random() * 0xffffffff) >>> 0;
  const ts = Math.floor(Date.now() / 1000);

  const privileges = new Map<number, number>();
  privileges.set(Privilege.kJoinChannel, expireTs);
  if (role === "publisher") {
    privileges.set(Privilege.kPublishAudioStream, expireTs);
    privileges.set(Privilege.kPublishVideoStream, expireTs);
    privileges.set(Privilege.kPublishDataStream, expireTs);
  }

  // Message body: salt(u32) | ts(u32) | privileges
  const msg = concatBytes(u32LE(salt), u32LE(ts), packPrivileges(privileges));

  // Sign material: appID | channelName | uidStr | msg
  const uidStr = uid === 0 ? "" : String(uid);
  const toSign = concatBytes(
    new TextEncoder().encode(appId),
    new TextEncoder().encode(channelName),
    new TextEncoder().encode(uidStr),
    msg,
  );
  const signature = await hmacSha256(appCert, toSign);

  // Content: sig(len-prefixed) | crc_channel(u32) | crc_uid(u32) | msg(len-prefixed)
  const crcChannel = crc32(new TextEncoder().encode(channelName));
  const crcUid = crc32(new TextEncoder().encode(uidStr));
  const content = concatBytes(
    u16LE(signature.length), signature,
    u32LE(crcChannel),
    u32LE(crcUid),
    u16LE(msg.length), msg,
  );

  return VERSION + appId + bytesToBase64(content);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const APP_ID = Deno.env.get("AGORA_APP_ID");
    const APP_CERT = Deno.env.get("AGORA_APP_CERTIFICATE");
    if (!APP_ID || !APP_CERT) {
      return new Response(
        JSON.stringify({ error: "AGORA_APP_ID or AGORA_APP_CERTIFICATE not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let body: Record<string, unknown> = {};
    if (req.method === "POST") {
      try { body = await req.json(); } catch { body = {}; }
    }

    const channelName = String(body.channelName ?? "diagnostic-test");
    const uid = Number.isFinite(Number(body.uid)) ? Number(body.uid) : 0;
    const role = body.role === "subscriber" ? "subscriber" : "publisher";
    const expireSeconds = Math.max(60, Math.min(86400, Number(body.expireSeconds ?? 3600)));
    const expireTs = Math.floor(Date.now() / 1000) + expireSeconds;

    const token = await buildRtcToken(
      APP_ID, APP_CERT, channelName, uid, role as any, expireTs,
    );

    return new Response(
      JSON.stringify({
        ok: true,
        appId: APP_ID,
        appIdLength: APP_ID.length,
        certLength: APP_CERT.length,
        channelName,
        uid,
        role,
        token,
        tokenPrefix: token.slice(0, 16),
        expiresAt: new Date(expireTs * 1000).toISOString(),
        note: "App ID/Cert format OK. Real validity = try joining a channel with this token from a client.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String((e as Error)?.message ?? e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
