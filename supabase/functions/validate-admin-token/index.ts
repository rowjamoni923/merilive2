import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { token } = await req.json();

    if (!token || typeof token !== 'string') {
      return new Response(
        JSON.stringify({ valid: false, role: null }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const OWNER_TOKEN = Deno.env.get('ADMIN_OWNER_TOKEN');
    const SUBADMIN_TOKEN = Deno.env.get('ADMIN_SUBADMIN_TOKEN');

    let role: string | null = null;

    if (token === OWNER_TOKEN) {
      role = 'owner';
    } else if (token === SUBADMIN_TOKEN) {
      role = 'sub_admin';
    }

    return new Response(
      JSON.stringify({ valid: !!role, role }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('validate-admin-token error:', err);
    return new Response(
      JSON.stringify({ valid: false, role: null }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
