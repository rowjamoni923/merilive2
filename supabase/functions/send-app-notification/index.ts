import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-token, x-client-platform, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface NotificationRequest {
  userId: string;
  templateKey: string;
  variables: Record<string, string>;
  type?: string;
}

interface NotificationTemplateRow {
  title_template?: string;
  message_template?: string;
  title?: string;
  body?: string;
  icon_emoji?: string;
  image_url?: string;
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const RESTRICTED_USER_NOTIFICATION_TYPES = new Set([
  "incoming_call", "call_received", "call_missed",
  "admin_message", "admin_message_reply", "admin_notice", "admin_warning",
  "system", "security", "report_resolved",
  "topup_approved", "topup_rejected", "withdrawal_approved", "withdrawal_rejected",
  "level_upgrade_approved", "level_upgrade_rejected", "helper_approved", "helper_rejected",
  "payroll_approved", "payroll_rejected", "host_approved", "host_rejected",
  "gift_received", "gift", "diamonds_added", "diamonds_received", "diamond_purchase_helper",
  "diamond_purchase_direct", "diamonds_credited", "payment_completed", "beans_exchanged",
  "agency_approved", "agency_verification", "agency_withdrawal_approved", "agency_diamond_received",
  "app_sync",
]);

const isRestrictedUserNotificationType = (value: string) => {
  const normalized = String(value || "").trim();
  return RESTRICTED_USER_NOTIFICATION_TYPES.has(normalized) || normalized.startsWith("pk_");
};

const applyTemplateVariables = (template: string, variables: Record<string, string>) => {
  let result = template;

  for (const [key, value] of Object.entries(variables)) {
    const placeholder = `{{${key}}}`;
    result = result.replace(new RegExp(escapeRegExp(placeholder), "g"), String(value));
  }

  return result;
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { userId, templateKey, variables, type = "general" }: NotificationRequest = await req.json();

    if (!userId || !templateKey) {
      return new Response(JSON.stringify({ success: false, error: "userId and templateKey are required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // ── Pkg308 deep-audit: authorize caller ─────────────────────────────────
    // Previously: any authenticated client (anon-key holder) could insert a
    // notification row for ANY other user, complete with arbitrary `type` →
    // impersonation of admin/system/call notifications + push spam (since the
    // notifications-row trigger fans out to FCM).
    // Now: service-role OR admin-session required for cross-user; self-only
    // allowed for ordinary authenticated callers.
    const authHeader = req.headers.get("authorization") || "";
    const bearer = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7) : "";
    const isServiceRoleCall = !!bearer && bearer === supabaseServiceKey;

    let callerUserId: string | null = null;
    if (!isServiceRoleCall && bearer) {
      try {
        const userClient = createClient(supabaseUrl, supabaseServiceKey, {
          global: { headers: { Authorization: `Bearer ${bearer}` } },
        });
        const { data: u } = await userClient.auth.getUser();
        callerUserId = u?.user?.id ?? null;
      } catch (e) {
        console.warn("[send-app-notification] auth.getUser failed:", e);
      }
    }

    let isAdmin = false;
    const adminToken = req.headers.get("x-admin-token");
    if (!isServiceRoleCall && adminToken) {
      const { data: sessionRow } = await supabase
        .from("admin_sessions")
        .select("admin_user_id, expires_at")
        .eq("session_token", adminToken)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();
      if (sessionRow?.admin_user_id) {
        const { data: adminUser } = await supabase
          .from("admin_users")
          .select("id, is_active")
          .eq("id", sessionRow.admin_user_id)
          .maybeSingle();
        isAdmin = !!adminUser?.is_active;
      }
    }

    if (!isServiceRoleCall && !isAdmin && userId !== callerUserId) {
      console.warn("[send-app-notification] Unauthorized cross-user notification attempt", {
        callerUserId, userId, templateKey, type,
      });
      return new Response(JSON.stringify({ success: false, error: "Not authorized to send notifications to other users" }), {
      });
    }
    if (!isServiceRoleCall && !isAdmin && !callerUserId) {
      return new Response(JSON.stringify({ success: false, error: "Authentication required" }), {
      });
    }

    if (!isServiceRoleCall && !isAdmin && isRestrictedUserNotificationType(type)) {
      console.warn("[send-app-notification] Restricted notification type rejected", {
        callerUserId, userId, templateKey, type,
      });
      return new Response(JSON.stringify({ success: false, error: "Restricted notification type" }), {
      });
    }
    // ────────────────────────────────────────────────────────────────────────

    console.log(`Sending notification to user ${userId} with template ${templateKey}`);

    const { data: template, error: templateError } = await supabase
      .from("notification_templates")
      .select("title,title_template,body,message_template,icon_emoji,image_url")
      .eq("template_key", templateKey)
      .eq("is_active", true)
      .maybeSingle();

    if (templateError || !template) {
      console.error("Template not found:", templateError);
      throw new Error(`Template '${templateKey}' not found`);
    }

    const row = template as NotificationTemplateRow;
    const title = applyTemplateVariables(row.title_template || row.title || "", variables ?? {});
    const message = applyTemplateVariables(row.message_template || row.body || "", variables ?? {});

    const { data: notification, error: insertError } = await supabase
      .from("notifications")
      .insert({
        user_id: userId,
        type,
        title,
        message,
        data: { ...(variables ?? {}), icon_emoji: row.icon_emoji || "", image_url: row.image_url || "" },
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("Failed to insert notification:", insertError);
      throw insertError;
    }

    console.log("Notification sent successfully:", notification.id);

    return new Response(JSON.stringify({ success: true, notificationId: notification.id }), {
    });
  } catch (error: any) {
    console.error("Error sending notification:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
    });
  }
};

serve(handler);
