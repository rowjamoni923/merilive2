import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { errorMessage, errorStack, pagePath, componentName, browserInfo } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = `You are an expert React/TypeScript developer and debugger. Your task is to analyze error logs from a React application and provide:

1. **Root Cause Analysis**: Explain what caused this error in simple terms
2. **Potential Fix**: Provide a clear, actionable solution
3. **Prevention Tips**: How to avoid this error in the future

Keep your response concise and in Bangla (Bengali) language. Format your response clearly with sections.

If it's a common error like "Geolocation error", "Network error", or "Permission denied", provide specific guidance for handling these cases in a mobile/web app context.`;

    const userPrompt = `Analyze this error:

**Error Message**: ${errorMessage}

**Page/Route**: ${pagePath || 'Unknown'}

**Component**: ${componentName || 'Unknown'}

**Stack Trace**: 
${errorStack || 'Not available'}

**Browser/Device Info**:
${browserInfo ? JSON.stringify(browserInfo, null, 2) : 'Not available'}

Please provide analysis and fix suggestions.`;

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
          { role: "user", content: userPrompt },
        ],
        stream: false,
        max_tokens: 1500,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "AI rate limit exceeded. Please try again shortly." }), 
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits in Lovable." }), 
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const aiResponse = data.choices?.[0]?.message?.content || "Analysis could not be completed.";

    return new Response(
      JSON.stringify({ 
        success: true, 
        analysis: aiResponse 
      }), 
      { 
      }
    );

  } catch (error) {
    console.error("analyze-error function error:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error occurred" 
      }), 
      { 
        status: 500, 
      }
    );
  }
});
