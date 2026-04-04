import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface BulkEmailRequest {
  subject: string;
  htmlContent: string;
  targetAudience: 'all' | 'active' | 'hosts' | 'custom';
  customEmails?: string[];
}

// Resend email sender
async function sendWithResend(to: string, subject: string, html: string): Promise<{ success: boolean; error?: string }> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return { success: false, error: "RESEND_API_KEY not configured" };
  try {
    const resend = new Resend(apiKey);
    const response = await resend.emails.send({ from: "MeriLive <noreply@merilive.com>", to: [to], subject, html });
    if (response.error) return { success: false, error: response.error.message };
    return { success: true };
  } catch (e: any) { return { success: false, error: e.message }; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Verify admin
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: adminUser } = await adminClient
      .from('admin_users')
      .select('role')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();

    if (!adminUser) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { subject, htmlContent, targetAudience, customEmails } = await req.json() as BulkEmailRequest;

    if (!subject || !htmlContent) {
      return new Response(JSON.stringify({ error: 'Subject and content required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get target emails
    let emails: string[] = [];

    if (targetAudience === 'custom' && customEmails?.length) {
      emails = customEmails;
    } else {
      let query = adminClient.from('profiles').select('email').not('email', 'is', null);
      
      if (targetAudience === 'active') {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        query = query.gte('last_seen', sevenDaysAgo);
      } else if (targetAudience === 'hosts') {
        query = query.eq('is_host', true);
      }

      const { data: profiles, error: profileError } = await query.limit(5000);
      if (profileError) throw profileError;
      emails = (profiles || []).map(p => p.email).filter(Boolean) as string[];
    }

    if (emails.length === 0) {
      return new Response(JSON.stringify({ error: 'No emails found for target audience' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Send emails in batches (14 per second = SES limit)
    let sent = 0;
    let failed = 0;
    const errors: string[] = [];
    const BATCH_SIZE = 14;

    for (let i = 0; i < emails.length; i += BATCH_SIZE) {
      const batch = emails.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(email => sendWithResend(email, subject, htmlContent))
      );

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value.success) {
          sent++;
        } else {
          failed++;
          if (result.status === 'fulfilled' && result.value.error) {
            errors.push(result.value.error);
          }
        }
      }

      // Wait 1 second between batches to respect SES rate limit
      if (i + BATCH_SIZE < emails.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Log admin action
    await adminClient.from('admin_logs').insert({
      admin_id: user.id,
      action_type: 'email_broadcast',
      target_type: 'bulk_email',
      details: {
        subject,
        target_audience: targetAudience,
        total_emails: emails.length,
        sent,
        failed,
      },
    });

    console.log(`✅ Email broadcast complete: ${sent} sent, ${failed} failed out of ${emails.length}`);

    return new Response(JSON.stringify({
      success: true,
      totalEmails: emails.length,
      sent,
      failed,
      errors: errors.slice(0, 5),
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error('send-bulk-email error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
