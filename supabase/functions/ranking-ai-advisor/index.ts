import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-admin-token",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const context: string = (body?.context ?? "").toString().slice(0, 4000);
    const homeCurrent = body?.home_current ?? null;
    const partyCurrent = body?.party_current ?? null;

    if (!context.trim()) {
      return new Response(JSON.stringify({ error: "context is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `You are MeriLive's Ranking Strategy Advisor.
You help an admin choose the best preset combination for two app_settings keys:

1) home_host_feed_ranking — presets: balanced_default | strict_quality | growth_mode
2) party_discovery_ranking — presets: balanced_default | strict_competitive | new_room_friendly

Operational policy guidance:
- Default / steady state -> balanced_default (home) + balanced_default (party)
- Peak campaigns / growth pushes -> growth_mode (home) + new_room_friendly (party)
- Abuse control / quality enforcement -> strict_quality (home) + strict_competitive (party)
- Mixed signals: pick the closest match per surface independently.

Return your recommendation by calling the recommend_ranking tool. Keep rationale short, factual, business-focused (max 2-3 sentences). Never invent preset names. Never propose 0 thresholds.`;

    const userPrompt = `Admin situation:
${context}

Current home_host_feed_ranking active_preset: ${homeCurrent?.active_preset ?? "unknown"}
Current party_discovery_ranking active_preset: ${partyCurrent?.active_preset ?? "unknown"}

Recommend the best preset for each surface and a one-word mode label.`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "recommend_ranking",
              description: "Return the recommended preset combination.",
              parameters: {
                type: "object",
                properties: {
                  home_preset: {
                    type: "string",
                    enum: ["balanced_default", "strict_quality", "growth_mode"],
                  },
                  party_preset: {
                    type: "string",
                    enum: ["balanced_default", "strict_competitive", "new_room_friendly"],
                  },
                  mode: {
                    type: "string",
                    enum: ["default", "peak_campaign", "abuse_control", "custom"],
                  },
                  rationale: { type: "string" },
                },
                required: ["home_preset", "party_preset", "mode", "rationale"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "recommend_ranking" } },
      }),
    });

    if (!aiResp.ok) {
      const text = await aiResp.text();
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add funds in Settings → Workspace → Usage." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.error("AI gateway error:", aiResp.status, text);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await aiResp.json();
    const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
    const argsRaw = toolCall?.function?.arguments;
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = argsRaw ? JSON.parse(argsRaw) : null;
    } catch {
      parsed = null;
    }

    if (!parsed) {
      return new Response(JSON.stringify({ error: "AI did not return a structured recommendation" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ranking-ai-advisor error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
