import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-token, x-client-platform, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

serve(async (req) => {
  try {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const isManual = body?.manual === true;

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

    // For manual invocations, verify the user is an admin
    if (isManual) {
      const authHeader = req.headers.get('authorization')?.replace('Bearer ', '');
      if (!authHeader) {
        return new Response(
          JSON.stringify({ error: 'Missing authorization' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Use service role for admin operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Starting weekly agency transfer process...');

    // Call the database function to process transfers
    const { data, error } = await supabase.rpc('process_weekly_agency_transfers');

    if (error) {
      console.error('Transfer error:', error);
      throw error;
    }

    console.log('Transfer result:', data);

    return new Response(
      JSON.stringify({
        success: true,
        result: data
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in agency-weekly-transfer:', errorMessage);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});