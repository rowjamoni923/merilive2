// Pkg321: Hardened manual-mode auth. Previously, isManual=true only checked
// that an Authorization header existed — never validated the token or checked
// admin status. Any caller with `Authorization: Bearer x` could trigger
// manual weekly transfers.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { requireAdminSession } from "../_shared/adminAuth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-token, x-cron-secret, x-client-platform, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const isManual = body?.manual === true;

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // For non-manual (cron) invocations, validate secret
    if (!isManual) {
      const cronSecret = req.headers.get('x-cron-secret');
      const expectedSecret = Deno.env.get('CRON_SECRET');
      if (expectedSecret && cronSecret !== expectedSecret) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // For manual invocations, verify active admin session (owner or agency section)
    if (isManual) {
      const auth = await requireAdminSession(req, supabase, { sectionKey: "agency-management", requireEdit: true });
      if (!auth.ok) {
        return new Response(
          JSON.stringify({ error: auth.error }),
          { status: auth.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    console.log('Starting weekly agency transfer process...');

    const { data, error } = await supabase.rpc('process_weekly_agency_transfers');

    if (error) {
      console.error('Transfer error:', error);
      throw error;
    }

    console.log('Transfer result:', data);

    return new Response(
      JSON.stringify({ success: true, result: data }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in agency-weekly-transfer:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});