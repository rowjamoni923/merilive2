// Debug function to test SlotsLaunch API connectivity
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const token = Deno.env.get("SLOTSLAUNCH_API_TOKEN");
  if (!token) {
    return new Response(JSON.stringify({ error: "No token configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Test multiple variations
  const tests: any[] = [];

  // Test 1: With merilive.com origin
  try {
    const url1 = `https://slotslaunch.com/api/games?token=${encodeURIComponent(token)}&per_page=10&page=1`;
    const r1 = await fetch(url1, { headers: { Accept: "application/json", Origin: "https://merilive.com" } });
    const text1 = await r1.text();
    let parsed1: any = null;
    try { parsed1 = JSON.parse(text1); } catch {}
    tests.push({
      test: "merilive.com origin",
      status: r1.status,
      headers: Object.fromEntries(r1.headers.entries()),
      body_preview: text1.slice(0, 500),
      total_in_response: parsed1?.meta?.total ?? parsed1?.total ?? (Array.isArray(parsed1?.data) ? parsed1.data.length : 'n/a'),
      data_count: Array.isArray(parsed1?.data) ? parsed1.data.length : 0,
      sample_game: parsed1?.data?.[0] || null,
    });
  } catch (e: any) { tests.push({ test: "merilive origin", error: e.message }); }

  // Test 2: Without origin
  try {
    const url2 = `https://slotslaunch.com/api/games?token=${encodeURIComponent(token)}&per_page=10`;
    const r2 = await fetch(url2, { headers: { Accept: "application/json" } });
    const text2 = await r2.text();
    tests.push({ test: "no origin", status: r2.status, body_preview: text2.slice(0, 300) });
  } catch (e: any) { tests.push({ test: "no origin", error: e.message }); }

  // Test 3: Account info / token validation
  try {
    const url3 = `https://slotslaunch.com/api/account?token=${encodeURIComponent(token)}`;
    const r3 = await fetch(url3, { headers: { Accept: "application/json", Origin: "https://merilive.com" } });
    const text3 = await r3.text();
    tests.push({ test: "account check", status: r3.status, body_preview: text3.slice(0, 400) });
  } catch (e: any) { tests.push({ test: "account", error: e.message }); }

  return new Response(JSON.stringify({ token_length: token.length, tests }, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
