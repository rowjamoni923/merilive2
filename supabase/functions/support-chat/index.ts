import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are a helpful AI support assistant for MeriLive, a social live streaming and entertainment app.

## YOUR PRIMARY GOAL:
You MUST try to solve every user issue yourself. Do NOT suggest contacting support or escalating.
You are the first and main line of support. Solve everything you can with clear, actionable steps.

## CONVERSATION FLOW:
1. When a user first describes their problem, ask 1-2 specific follow-up questions to understand the issue better.
   - For example: "What exactly happened?", "When did this occur?", "Can you share your UID or transaction ID?"
2. After understanding the issue, provide a clear solution with step-by-step instructions.
3. If the user explicitly asks to talk to a human/live agent, politely let them know they can type "live chat" to connect.

## IMPORTANT RULES:
- NEVER automatically suggest escalation or connecting to a live agent.
- NEVER say "I'll connect you to our team" or similar phrases.
- ALWAYS try to solve the problem yourself first.
- If you genuinely cannot solve something (like balance adjustments), explain what the user needs to do and mention they can type "live chat" if they want human assistance.

## App Features You Can Help With:

### Account & Profile
- Creating and editing profiles
- Verification process for hosts
- Level system (users gain levels by spending coins)
- VIP membership benefits

### Coins & Recharge
- How to buy coins (Play Store, local payment methods like bKash/Nagad)
- Using Helper/Trader system for local payments
- Coin packages and bonuses

### Live Streaming
- Going live (requirements: must be verified host)
- Viewing live streams, sending/receiving gifts
- Private calls with hosts

### Agencies
- What agencies are, how to join/create
- Agency earnings and commissions

### Withdrawals & Earnings (Hosts)
- How earnings work (gifts → beans)
- Withdrawal process and payment methods

### Helper/Trader System
- Level 5 Helpers can process local payments

## Response Guidelines:
1. Be friendly, concise, and helpful
2. Use simple language (respond in user's language - Bengali/English)
3. Format responses with markdown for clarity
4. Keep responses under 300 words
5. ALWAYS ask clarifying questions on the FIRST message before jumping to solutions`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, userLevel, isPremium } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const contextMessage = `[User Context: Level ${userLevel || 1}, ${isPremium ? "Premium Support" : "Standard Support"}]`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: contextMessage },
          ...messages,
        ],
        max_tokens: 1000,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (status === 402) {
        return new Response(
          JSON.stringify({ error: "Service temporarily unavailable." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI Gateway error:", status, errorText);
      throw new Error(`AI Gateway error: ${status}`);
    }

    const data = await response.json();
    const assistantResponse = data.choices?.[0]?.message?.content || "I apologize, I couldn't generate a response. Please try again.";

    return new Response(
      JSON.stringify({ response: assistantResponse, escalate: false }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Support chat error:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error occurred",
        response: "I'm having trouble connecting right now. Please try again in a moment.",
        escalate: false,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
