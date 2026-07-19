import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.12";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface BulkEmailRequest {
  subject: string;
  htmlContent: string;
  targetAudience: 'all' | 'active' | 'hosts' | 'custom';
  customEmails?: string[];
}

// Gmail SMTP — single shared transporter per cold start
let cachedTransporter: any = null;
function getTransporter() {
  if (cachedTransporter) return cachedTransporter;
  const gmailUser = (Deno.env.get("GMAIL_USER") ?? "").trim();
  const gmailPass = (Deno.env.get("GMAIL_APP_PASSWORD") ?? "").replace(/\s+/g, "");
  if (!gmailUser || !gmailPass) return null;
  cachedTransporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: gmailUser, pass: gmailPass },
    pool: true,
    maxConnections: 3,
    maxMessages: 100,
  });
  return cachedTransporter;
}

async function sendWithResend(to: string, subject: string, html: string): Promise<{ success: boolean; error?: string }> {
  const transporter = getTransporter();
  if (!transporter) return { success: false, error: "GMAIL credentials not configured" };
  const gmailUser = (Deno.env.get("GMAIL_USER") ?? "").trim();
  try {
    await transporter.sendMail({
      from: `"MeriLive" <${gmailUser}>`,
      to,
      subject,
      html,
    });
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || String(e) };
  }
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

    // Verify admin + section permission (user-management with edit right)
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: adminUser } = await adminClient
      .from('admin_users')
      .select('id, role')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();

    if (!adminUser) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (adminUser.role !== 'owner') {
      const { data: section } = await adminClient
        .from('admin_sections')
        .select('id')
        .eq('section_key', 'user-management')
        .eq('is_active', true)
        .maybeSingle();
      if (section?.id) {
        const { data: perm } = await adminClient
          .from('admin_section_permissions')
          .select('can_edit')
          .eq('admin_user_id', adminUser.id)
          .eq('section_id', section.id)
          .maybeSingle();
        if (!perm?.can_edit) {
          return new Response(JSON.stringify({ error: 'Insufficient permission for user-management' }), {
            status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }
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
