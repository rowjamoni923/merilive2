import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const email = typeof payload?.email === "string" ? payload.email.trim().toLowerCase() : "";
    const otpVerified = payload?.otp_verified === true;

    if (!email || !otpVerified) {
      return new Response(
        JSON.stringify({ error: "Email and OTP verification required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const buildSuccessResponse = (user: any, session: any) => {
      return new Response(
        JSON.stringify({
          success: true,
          exists: true,
          access_token: session?.access_token,
          refresh_token: session?.refresh_token,
          token_type: session?.token_type ?? "bearer",
          expires_in: session?.expires_in,
          user: {
            id: user?.id,
            email: user?.email,
          },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    };

    let { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });

    if (linkError && (linkError.message?.includes("not found") || linkError.message?.includes("User not found"))) {
      // Fallback: paginate through users to avoid false "not found" cases
      const perPage = 200;
      let page = 1;
      let matchedEmail: string | null = null;

      while (true) {
        const { data: listData, error: listError } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
        if (listError) {
          console.error("listUsers error:", listError);
          break;
        }

        const users = listData?.users ?? [];
        const matchedUser = users.find((u) => u.email?.toLowerCase() === email);

        if (matchedUser?.email) {
          matchedEmail = matchedUser.email;
          break;
        }

        if (users.length < perPage) break;
        page += 1;
      }

      if (!matchedEmail) {
        return new Response(
          JSON.stringify({ success: false, exists: false, error: "User not found" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const retry = await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email: matchedEmail,
      });

      linkData = retry.data;
      linkError = retry.error;
    }

    if (linkError) {
      console.error("generateLink error:", linkError);
      throw linkError;
    }

    // Extract raw token from the action link URL
    const actionLink = linkData?.properties?.action_link;
    const tokenHash = linkData?.properties?.hashed_token;
    
    // Try method 1: Extract token from action_link query params
    let verifiedData: any = null;
    
    if (actionLink) {
      try {
        const url = new URL(actionLink);
        const rawToken = url.searchParams.get("token");
        const type = url.searchParams.get("type") || "magiclink";
        
        if (rawToken) {
          const { data, error } = await supabaseAdmin.auth.verifyOtp({
            type: type as any,
            token_hash: rawToken,
          });
          if (!error && data?.session) {
            verifiedData = data;
          }
        }
      } catch (e) {
        console.warn("action_link parse failed:", e);
      }
    }
    
    // Try method 2: Use hashed_token directly
    if (!verifiedData && tokenHash) {
      const { data, error } = await supabaseAdmin.auth.verifyOtp({
        type: "magiclink",
        token_hash: tokenHash,
      });
      if (!error && data?.session) {
        verifiedData = data;
      } else {
        console.warn("hashed_token verify failed:", error?.message);
      }
    }
    
    // Try method 3: Use admin API to create session directly
    if (!verifiedData) {
      // Find user by email
      const { data: usersData } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1 });
      const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
      const user = users?.find(u => u.email?.toLowerCase() === email);
      
      if (user) {
        // Generate a fresh session using admin API
        const { data: sessionData, error: sessionError } = await supabaseAdmin.auth.admin.generateLink({
          type: "magiclink",
          email: user.email!,
          options: { redirectTo: Deno.env.get("SUPABASE_URL") },
        });
        
        if (!sessionError && sessionData?.properties?.hashed_token) {
          const { data: retryData, error: retryError } = await supabaseAdmin.auth.verifyOtp({
            type: "magiclink",
            token_hash: sessionData.properties.hashed_token,
          });
          if (!retryError) verifiedData = retryData;
        }
      }
    }
    
    if (!verifiedData?.session) {
      throw new Error("Failed to create session after all attempts");
    }

    return buildSuccessResponse(verifiedData?.user, verifiedData?.session);
  } catch (error: any) {
    console.error("OTP direct sign-in error:", error);
    return new Response(
      JSON.stringify({ error: error?.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
