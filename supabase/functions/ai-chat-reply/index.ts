import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Map country codes to language instructions
const countryLanguageMap: Record<string, { language: string; instruction: string }> = {
  BD: { language: "Bengali", instruction: "Reply in Bengali (বাংলা). Use Bengali script." },
  IN: { language: "Hindi", instruction: "Reply in Hindi (हिन्दी). Use Devanagari script." },
  PK: { language: "Urdu", instruction: "Reply in Urdu (اردو). Use Urdu script." },
  NP: { language: "Nepali", instruction: "Reply in Nepali (नेपाली). Use Devanagari script." },
  PH: { language: "Filipino/Tagalog", instruction: "Reply in Filipino/Tagalog." },
  ID: { language: "Indonesian", instruction: "Reply in Bahasa Indonesia." },
  MY: { language: "Malay", instruction: "Reply in Bahasa Melayu." },
  TH: { language: "Thai", instruction: "Reply in Thai (ไทย). Use Thai script." },
  VN: { language: "Vietnamese", instruction: "Reply in Vietnamese (Tiếng Việt)." },
  MM: { language: "Burmese", instruction: "Reply in Burmese (မြန်မာ). Use Myanmar script." },
  KH: { language: "Khmer", instruction: "Reply in Khmer (ខ្មែរ). Use Khmer script." },
  LK: { language: "Sinhala", instruction: "Reply in Sinhala (සිංහල). Use Sinhala script." },
  SA: { language: "Arabic", instruction: "Reply in Arabic (العربية). Use Arabic script." },
  AE: { language: "Arabic", instruction: "Reply in Arabic (العربية). Use Arabic script." },
  QA: { language: "Arabic", instruction: "Reply in Arabic (العربية). Use Arabic script." },
  KW: { language: "Arabic", instruction: "Reply in Arabic (العربية). Use Arabic script." },
  OM: { language: "Arabic", instruction: "Reply in Arabic (العربية). Use Arabic script." },
  BH: { language: "Arabic", instruction: "Reply in Arabic (العربية). Use Arabic script." },
  EG: { language: "Arabic", instruction: "Reply in Egyptian Arabic (مصرى)." },
  IQ: { language: "Arabic", instruction: "Reply in Arabic (العربية). Use Arabic script." },
  TR: { language: "Turkish", instruction: "Reply in Turkish (Türkçe)." },
  IR: { language: "Persian", instruction: "Reply in Persian/Farsi (فارسی). Use Persian script." },
  AF: { language: "Dari/Pashto", instruction: "Reply in Dari or Pashto based on context." },
  JP: { language: "Japanese", instruction: "Reply in Japanese (日本語)." },
  KR: { language: "Korean", instruction: "Reply in Korean (한국어)." },
  CN: { language: "Chinese", instruction: "Reply in Simplified Chinese (中文)." },
  TW: { language: "Chinese", instruction: "Reply in Traditional Chinese (繁體中文)." },
  BR: { language: "Portuguese", instruction: "Reply in Brazilian Portuguese (Português)." },
  PT: { language: "Portuguese", instruction: "Reply in Portuguese (Português)." },
  ES: { language: "Spanish", instruction: "Reply in Spanish (Español)." },
  MX: { language: "Spanish", instruction: "Reply in Mexican Spanish (Español)." },
  FR: { language: "French", instruction: "Reply in French (Français)." },
  DE: { language: "German", instruction: "Reply in German (Deutsch)." },
  IT: { language: "Italian", instruction: "Reply in Italian (Italiano)." },
  RU: { language: "Russian", instruction: "Reply in Russian (Русский). Use Cyrillic script." },
  UA: { language: "Ukrainian", instruction: "Reply in Ukrainian (Українська). Use Cyrillic script." },
};

const MAX_AI_REPLIES_PER_CONVERSATION = 3;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { conversationId, userMessage, hostId, senderId } = await req.json();

    if (!conversationId || !userMessage || !hostId) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check how many AI replies already sent in this conversation
    const { count: aiReplyCount } = await supabase
      .from("messages")
      .select("*", { count: "exact", head: true })
      .eq("conversation_id", conversationId)
      .eq("sender_id", hostId)
      .eq("is_ai_reply", true);

    if ((aiReplyCount || 0) >= MAX_AI_REPLIES_PER_CONVERSATION) {
      console.log(`AI reply limit reached (${aiReplyCount}/${MAX_AI_REPLIES_PER_CONVERSATION}) for conversation ${conversationId}. Skipping.`);
      return new Response(
        JSON.stringify({ success: false, reason: "ai_reply_limit_reached", count: aiReplyCount }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch host profile and sender profile in parallel
    const [hostResult, senderResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("display_name, bio, country_code, host_level")
        .eq("id", hostId)
        .single(),
      senderId
        ? supabase
            .from("profiles")
            .select("display_name, country_code, country_flag")
            .eq("id", senderId)
            .single()
        : Promise.resolve({ data: null }),
    ]);

    const hostProfile = hostResult.data;
    const senderProfile = senderResult.data;
    const hostName = hostProfile?.display_name || "Host";
    const senderName = senderProfile?.display_name || "there";
    const senderCountry = senderProfile?.country_code || null;

    // Determine language based on sender's country
    const langConfig = senderCountry
      ? countryLanguageMap[senderCountry.toUpperCase()]
      : null;

    const languageInstruction = langConfig
      ? `CRITICAL: ${langConfig.instruction} The user is from ${senderCountry}. You MUST reply in ${langConfig.language} language only. Do NOT reply in English unless the user writes in English.`
      : "Reply in the SAME language the user writes in. If you can't detect the language, reply in English.";

    // Get recent conversation history for context (last 10 messages)
    const { data: recentMessages } = await supabase
      .from("messages")
      .select("sender_id, content, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(10);

    const conversationHistory = (recentMessages || [])
      .reverse()
      .map((m) => ({
        role: m.sender_id === hostId ? "assistant" : "user",
        content: m.content,
      }));

    // Generate AI reply
    const aiResponse = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            {

${languageInstruction}

Rules:
- Keep messages short (1-3 sentences max)
- Be sweet, playful, and engaging
- Use cute emojis naturally (💕 😘 🥰 😊 💋 ✨ 🌹)
- Subtly encourage them to call you for a more personal conversation
- Never be vulgar or explicit - stay classy and charming
- Vary your responses - don't repeat the same phrases
- If user says hi/hello, be extra warm and welcoming
- Act natural like a real person chatting, not a robot
- Sometimes ask questions to keep conversation going
- Reference video calling as something fun and exciting

${hostProfile?.bio ? `Your bio: ${hostProfile.bio}` : ""}
The user's name is: ${senderName}`,
            },
            ...conversationHistory,
            { role: "user", content: userMessage },
          ],
          max_tokens: 150,
          temperature: 0.9,
        }),
      }
    );

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limited, try again later" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errorText);
      throw new Error(`AI gateway error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const replyContent =
      aiData.choices?.[0]?.message?.content?.trim() || "Hey! 💕 Call me sometime! 😘";

    // Add a small random delay (2-8 seconds) to make it feel natural
    const delay = Math.floor(Math.random() * 6000) + 2000;
    await new Promise((resolve) => setTimeout(resolve, delay));

    // Insert the AI reply as a message from the host, marked as AI reply
    const { error: insertError } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender_id: hostId,
      message_type: "text",
      is_ai_reply: true,
    });

    if (insertError) {
      console.error("Failed to insert AI reply:", insertError);
      throw insertError;
    }

    // Update conversation last_message_at
    await supabase
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversationId);

    return new Response(
      JSON.stringify({ success: true, reply: replyContent, aiReplyCount: (aiReplyCount || 0) + 1 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("AI chat reply error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
