// Quick AWS Rekognition health check — verifies AWS keys + region work
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sha256Hex(s: string | Uint8Array): Promise<string> {
  const b = typeof s === "string" ? new TextEncoder().encode(s) : s;
  const h = await crypto.subtle.digest("SHA-256", b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
  return [...new Uint8Array(h)].map(x => x.toString(16).padStart(2, "0")).join("");
}
async function hmacRaw(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const k = key instanceof Uint8Array ? key.buffer.slice(key.byteOffset, key.byteOffset + key.byteLength) as ArrayBuffer : key;
  const ck = await crypto.subtle.importKey("raw", k, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", ck, new TextEncoder().encode(data));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const AK = Deno.env.get("AWS_ACCESS_KEY_ID");
  const SK = Deno.env.get("AWS_SECRET_ACCESS_KEY");
  const REGION = Deno.env.get("AWS_REGION") ?? "us-east-1";
  const status: any = { keys_present: !!AK && !!SK, region: REGION, key_prefix: AK?.slice(0, 8) ?? null };
  if (!AK || !SK) return new Response(JSON.stringify(status), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const host = `rekognition.${REGION}.amazonaws.com`;
    const body = "{}";
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
    const dateStamp = amzDate.slice(0, 8);
    const target = "RekognitionService.ListCollections";
    const canonHeaders = `content-type:application/x-amz-json-1.1\nhost:${host}\nx-amz-date:${amzDate}\nx-amz-target:${target}\n`;
    const signed = "content-type;host;x-amz-date;x-amz-target";
    const payloadHash = await sha256Hex(body);
    const canonReq = ["POST", "/", "", canonHeaders, signed, payloadHash].join("\n");
    const scope = `${dateStamp}/${REGION}/rekognition/aws4_request`;
    const sts = ["AWS4-HMAC-SHA256", amzDate, scope, await sha256Hex(canonReq)].join("\n");
    const kDate = await hmacRaw(new TextEncoder().encode("AWS4" + SK), dateStamp);
    const kRegion = await hmacRaw(kDate, REGION);
    const kService = await hmacRaw(kRegion, "rekognition");
    const kSigning = await hmacRaw(kService, "aws4_request");
    const sig = [...new Uint8Array(await hmacRaw(kSigning, sts))].map(b => b.toString(16).padStart(2, "0")).join("");
    const auth = `AWS4-HMAC-SHA256 Credential=${AK}/${scope}, SignedHeaders=${signed}, Signature=${sig}`;
    const r = await fetch(`https://${host}/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-amz-json-1.1", "X-Amz-Date": amzDate, "X-Amz-Target": target, "Authorization": auth },
      body,
    });
    const txt = await r.text();
    status.aws_status = r.status;
    status.aws_response = r.status === 200 ? JSON.parse(txt) : txt.slice(0, 500);
    status.healthy = r.status === 200;
  } catch (e) {
    status.error = String(e);
  }
  return new Response(JSON.stringify(status, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
