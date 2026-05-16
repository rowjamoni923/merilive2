import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DENIED_BUCKETS = new Set(["system", "vault"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const adminToken = req.headers.get("x-admin-token");
    if (!adminToken || adminToken.length < 16) {
      return new Response(JSON.stringify({ success: false, error: "Admin session required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: sessionRow } = await supabase
      .from("admin_sessions")
      .select("admin_user_id")
      .eq("session_token", adminToken)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (!sessionRow?.admin_user_id) {
      return new Response(JSON.stringify({ success: false, error: "Invalid admin session" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: adminUser } = await supabase
      .from("admin_users")
      .select("id")
      .eq("id", sessionRow.admin_user_id)
      .eq("is_active", true)
      .maybeSingle();

    if (!adminUser) {
      return new Response(JSON.stringify({ success: false, error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const bucket = String(body.bucket || "").trim();
    const path = String(body.path || "").replace(/^\/+/, "");
    const expiresIn = Math.min(Math.max(Number(body.expiresIn || 3600), 60), 3600);

    if (!bucket || DENIED_BUCKETS.has(bucket) || !path || path.includes("..")) {
      return new Response(JSON.stringify({ success: false, error: "Invalid storage path" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: bucketRow } = await supabase
      .schema("storage")
      .from("buckets")
      .select("id")
      .eq("id", bucket)
      .maybeSingle();

    if (!bucketRow) {
      return new Response(JSON.stringify({ success: false, error: "Bucket not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
    if (error || !data?.signedUrl) {
      return new Response(JSON.stringify({ success: false, error: error?.message || "Failed to sign URL" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, signedUrl: data.signedUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
