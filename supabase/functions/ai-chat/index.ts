import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-token, x-client-platform, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const fallbackSupportSuggestions = JSON.stringify([
  "Thanks for contacting support. We understand your concern and are checking it now.",
  "Please share any screenshot, app ID, and the exact steps where the issue happens so we can investigate quickly.",
  "We will review the details and get back to you with the best solution as soon as possible."
]);

const supportReplyFallback = (reason: string) => new Response(JSON.stringify({
  result: fallbackSupportSuggestions,
  fallback: true,
  reason,
}), {
  status: 200,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Authentication check — accept either an end-user JWT (Authorization)
    // or the admin panel's custom session token (x-admin-token).
    const authHeader = req.headers.get('Authorization');
    const adminToken = req.headers.get('x-admin-token');
    let authorized = false;

    if (adminToken) {
      const svc = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const { data: rows } = await svc.rpc('get_admin_by_session_token', { _token: adminToken });
      if (Array.isArray(rows) && rows.length > 0 && rows[0].is_active) authorized = true;
    }

    if (!authorized && authHeader) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: { user } } = await supabase.auth.getUser();
      if (user) authorized = true;
    }

    if (!authorized) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { messages, mode } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      if (mode === "support_reply") return supportReplyFallback("ai_key_missing");
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Different system prompts based on mode
    const systemPrompts: Record<string, string> = {
      chat: `You are MeriLive AI Assistant. You help users with questions about the MeriLive app - a social live streaming platform.
You can help with:
- How to use the app (calls, live streams, gifts, games)
- Account settings, levels, VIP features
- Coin purchases and diamond balance
- Agency information
- Reporting issues
Keep answers concise, friendly, and in the user's language (Bengali, Hindi, English, etc.).
Never share personal data or admin information.`,
      
      moderate: `You are a content moderation AI. Analyze the given text and return a JSON response:
{"safe": true/false, "reason": "explanation", "severity": "low/medium/high/critical", "category": "spam/harassment/contact_sharing/inappropriate/clean"}
Only respond with valid JSON, nothing else.`,
      
      recommend: `You are a recommendation engine for MeriLive. Based on user preferences and activity, suggest hosts or content.
Return recommendations as JSON: {"recommendations": [{"type": "host/content", "reason": "why recommended", "priority": 1-5}]}
Only respond with valid JSON.`,
      
      admin: `You are an AI admin assistant for MeriLive. You help with:
- Analyzing user reports and suggesting actions
- Generating activity summaries
- Identifying suspicious patterns
- Suggesting moderation actions
Be precise, data-driven, and follow platform policies strictly.`,

      support_reply: `You are an AI assistant for MeriLive admin support team. Based on the user's support ticket message, generate exactly 3 short, helpful reply suggestions that an admin can send to the user.

Rules:
- Each reply should be concise (1-2 sentences max)
- Replies should be professional, friendly, and helpful
- Reply in the SAME language as the user's message (if Bengali, reply in Bengali; if English, reply in English; if Hindi, reply in Hindi, etc.)
- Cover different approaches: one empathetic acknowledgment, one solution-oriented, one asking for more details
- Return ONLY valid JSON array of 3 strings, nothing else

Example format: ["Reply 1", "Reply 2", "Reply 3"]`
    };

    const systemPrompt = systemPrompts[mode] || systemPrompts.chat;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: mode === "chat" || mode === "admin",
        ...(mode === "support_reply" ? { temperature: 0.7 } : {}),
      }),
    });

    if (!response.ok) {
      if (mode === "support_reply") {
        const t = await response.text().catch(() => "");
        console.error("AI gateway support_reply fallback:", response.status, t);
        return supportReplyFallback(`ai_gateway_${response.status}`);
      }
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // For streaming modes, pass through the stream
    if (mode === "chat" || mode === "admin") {
      return new Response(response.body, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    // For non-streaming modes (moderate, recommend), return JSON
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    
    return new Response(JSON.stringify({ result: content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("ai-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
