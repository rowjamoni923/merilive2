import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAdminSession } from "../_shared/adminAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-token, x-client-platform, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const adminAuth = await requireAdminSession(req, supabase, { sectionKey: "moderation-hub", requireEdit: true });
    if (!adminAuth.ok) {
      return new Response(JSON.stringify({ success: false, error: adminAuth.error }), {
        status: adminAuth.status,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { ticketId, replyContent } = await req.json();
    if (!ticketId || !replyContent) {
      return new Response(JSON.stringify({ success: false, error: "Missing ticketId or replyContent" }), {
        status: 400, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { data: ticket, error: ticketError } = await supabase
      .from("support_tickets")
      .select("ticket_number, subject, user_email, user_id")
      .eq("id", ticketId)
      .single();

    if (ticketError || !ticket) {
      return new Response(JSON.stringify({ success: false, error: "Ticket not found" }), {
        status: 404, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    let userEmail = ticket.user_email;
    if (!userEmail) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", ticket.user_id)
        .single();
      userEmail = profile?.email;
    }

    if (!userEmail || userEmail.endsWith("@meri.local")) {
      return new Response(JSON.stringify({ success: false, error: "User has no valid email address", skipped: true }), {
        status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Route through Lovable's built-in transactional email system
    const { data: invokeData, error: invokeError } = await supabase.functions.invoke('send-transactional-email', {
      body: {
        templateName: 'support-reply',
        recipientEmail: userEmail,
        templateData: {
          ticketNumber: ticket.ticket_number,
          ticketSubject: ticket.subject,
          replyContent,
        },
        idempotencyKey: `support-reply-${ticketId}-${Date.now()}`,
      },
    });

    if (invokeError) {
      console.error("send-transactional-email failed:", invokeError);
      // Try to extract underlying error body for clearer admin UX
      let underlying = invokeError.message || String(invokeError);
      let senderNotReady = false;
      try {
        const ctx: any = (invokeError as any).context;
        if (ctx && typeof ctx.text === "function") {
          const bodyText = await ctx.text();
          underlying = bodyText || underlying;
          if (/no_matching_sender|EMAIL_SENDER_DOMAIN_NOT_READY|sender domain/i.test(bodyText)) {
            senderNotReady = true;
          }
        }
      } catch (_) { /* ignore */ }

      if (senderNotReady) {
        // Don't surface as 500 — sender domain not configured yet. Reply is still saved in DB by caller.
        return new Response(JSON.stringify({
          success: false,
          skipped: true,
          reason: "sender_domain_not_verified",
          error: "Email sender domain is not yet verified. The reply was saved in the ticket but the email was not delivered. Please verify your email domain in the Lovable / DNS settings.",
        }), {
          status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      return new Response(JSON.stringify({ success: false, error: underlying }), {
        status: 502, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    console.log(`✅ Support reply enqueued for ${userEmail} ticket ${ticket.ticket_number}`);
    return new Response(JSON.stringify({ success: true, sentTo: userEmail, result: invokeData }), {
      status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  } catch (error: any) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
