// SlotsLaunch Games Sync Edge Function
// - GET: Lists games from SlotsLaunch API (proxied to bypass CORS + inject token)
// - POST {action:"sync", names:[...]}: Matches names → fetches game data → upserts into game_settings

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SLOTSLAUNCH_BASE = "https://slotslaunch.com/api";

interface SlotsLaunchGame {
  id: number;
  name: string;
  thumb?: string;
  url?: string;
  provider?: string | { name?: string };
  type?: string;
  published?: number | boolean;
}

async function fetchAllGames(token: string, origin: string): Promise<SlotsLaunchGame[]> {
  const all: SlotsLaunchGame[] = [];
  let page = 1;
  const perPage = 100;
  const maxPages = 30; // safety

  while (page <= maxPages) {
    const url = `${SLOTSLAUNCH_BASE}/games?token=${encodeURIComponent(token)}&per_page=${perPage}&page=${page}&published=1`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        Origin: origin,
      },
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[SlotsLaunch] page ${page} failed:`, res.status, text);
      throw new Error(`SlotsLaunch API error ${res.status}: ${text.slice(0, 200)}`);
    }

    const json = await res.json();
    const items: SlotsLaunchGame[] = json?.data || json?.games || (Array.isArray(json) ? json : []);
    if (!items.length) break;
    all.push(...items);
    if (items.length < perPage) break;
    page += 1;
  }
  return all;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const token = Deno.env.get("SLOTSLAUNCH_API_TOKEN");
    if (!token) {
      return new Response(JSON.stringify({ error: "SLOTSLAUNCH_API_TOKEN not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Origin must match the domain registered on SlotsLaunch (merilive.com)
    const origin = "https://merilive.com";

    if (req.method === "GET") {
      const url = new URL(req.url);
      const search = url.searchParams.get("q") || "";
      const games = await fetchAllGames(token, origin);
      const filtered = search
        ? games.filter(g => normalize(g.name).includes(normalize(search)))
        : games;
      return new Response(JSON.stringify({ success: true, total: filtered.length, games: filtered.slice(0, 50) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST – sync selected games into game_settings
    const body = await req.json().catch(() => ({}));
    const action = body.action || "sync";
    const wantedNames: string[] = Array.isArray(body.names) ? body.names : [];

    if (action !== "sync" || wantedNames.length === 0) {
      return new Response(JSON.stringify({ error: "Provide action='sync' and names:[]" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const allGames = await fetchAllGames(token, origin);
    console.log(`[SlotsLaunch] Fetched ${allGames.length} games from API`);

    const matched: { wanted: string; game: SlotsLaunchGame | null }[] = wantedNames.map((name) => {
      const target = normalize(name);
      const found = allGames.find(g => normalize(g.name) === target)
        || allGames.find(g => normalize(g.name).includes(target))
        || allGames.find(g => target.includes(normalize(g.name)));
      return { wanted: name, game: found || null };
    });

    const inserts = matched.filter(m => m.game).map((m, i) => {
      const g = m.game!;
      const providerName = typeof g.provider === "string" ? g.provider : (g.provider?.name || "SlotsLaunch");
      const gameId = `slotslaunch_${g.id}`;
      // Build iframe URL — SlotsLaunch typically returns a direct URL or expects /iframe/{id}?token=...
      const iframeUrl = g.url
        ? `${g.url}${g.url.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`
        : `https://slotslaunch.com/iframe/${g.id}?token=${encodeURIComponent(token)}`;

      return {
        setting_key: gameId,
        game_id: gameId,
        game_name: m.wanted,
        game_emoji: "🎰",
        game_color: "from-purple-500 to-pink-500",
        description: `${m.wanted} by ${providerName}`,
        game_type: "iframe",
        game_url: iframeUrl,
        logo_url: g.thumb || null,
        provider_game_code: String(g.id),
        category: "slots",
        min_bet: 100,
        max_bet: 50000,
        is_active: true,
        is_featured: i < 5,
        display_order: 100 + i,
        iframe_width: 1280,
        iframe_height: 720,
        rules: { source: "slotslaunch", provider: providerName, raw_id: g.id },
      };
    });

    const notFound = matched.filter(m => !m.game).map(m => m.wanted);

    if (inserts.length > 0) {
      const { error } = await supabase
        .from("game_settings")
        .upsert(inserts, { onConflict: "setting_key" });
      if (error) throw error;
    }

    return new Response(JSON.stringify({
      success: true,
      inserted: inserts.length,
      notFound,
      matched: matched.map(m => ({ wanted: m.wanted, found: m.game?.name || null, id: m.game?.id || null })),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: any) {
    console.error("[slotslaunch-games] Error:", err);
    return new Response(JSON.stringify({ error: err?.message || String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
