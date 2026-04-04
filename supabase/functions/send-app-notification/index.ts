import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotificationRequest {
  userId: string;
  templateKey: string;
  variables: Record<string, string>;
  type?: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { userId, templateKey, variables, type = 'general' }: NotificationRequest = await req.json();

    console.log(`Sending notification to user ${userId} with template ${templateKey}`);

    // Get the template
    const { data: template, error: templateError } = await supabase
      .from("notification_templates")
      .select("title_template, message_template")
      .eq("template_key", templateKey)
      .single();

    if (templateError || !template) {
      console.error("Template not found:", templateError);
      throw new Error(`Template '${templateKey}' not found`);
    }

    // Replace variables in template
    let title = template.title_template;
    let message = template.message_template;

    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{{${key}}}`;
      title = title.replace(new RegExp(placeholder, 'g'), value);
      message = message.replace(new RegExp(placeholder, 'g'), value);
    }

    // Insert notification
    const { data: notification, error: insertError } = await supabase
      .from("notifications")
      .insert({
        user_id: userId,
        type: type,
        title: title,
        message: message,
        data: variables
      })
      .select()
      .single();

    if (insertError) {
      console.error("Failed to insert notification:", insertError);
      throw insertError;
    }

    console.log("Notification sent successfully:", notification.id);

    return new Response(
      JSON.stringify({ success: true, notificationId: notification.id }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error sending notification:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
