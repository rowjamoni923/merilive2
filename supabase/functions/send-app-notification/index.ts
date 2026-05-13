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

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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

    console.log(`Sending notification to user ${userId} with template ${templateKey}`);

    const { data: template, error: templateError } = await supabase
      .from("notification_templates")
      .select("title, body")
      .eq("template_key", templateKey)
      .eq("is_active", true)
      .maybeSingle();

    if (templateError || !template) {
      console.error("Template not found:", templateError);
      throw new Error(`Template '${templateKey}' not found`);
    }

    const title = applyTemplateVariables(template.title, variables ?? {});
    const message = applyTemplateVariables(template.body, variables ?? {});

    const { data: notification, error: insertError } = await supabase
      .from("notifications")
      .insert({
        user_id: userId,
        type,
        title,
        message,
        data: variables ?? {},
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("Failed to insert notification:", insertError);
      throw insertError;
    }

    console.log("Notification sent successfully:", notification.id);

    return new Response(JSON.stringify({ success: true, notificationId: notification.id }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error sending notification:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
