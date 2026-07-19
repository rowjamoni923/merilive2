import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-client-platform, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const supabaseUser = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: authData, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !authData?.user?.id) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { 
      userId, 
      detectedContent, 
      contextType = 'call',
      callId,
      hostId,
      callerName,
      hostName
    } = await req.json();

    if (!userId || !detectedContent) {
      return jsonResponse({ error: 'userId and detectedContent are required' }, 400);
    }

    const callerId = authData.user.id;
    if (userId !== callerId && !await supabase.rpc('is_admin', { _user_id: callerId }).then(({ data }) => data === true).catch(() => false)) {
      return jsonResponse({ error: 'Forbidden userId' }, 403);
    }

    // Check if user is a real restricted host
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('id, is_host, is_agency_owner, display_name, app_uid')
      .eq('id', userId)
      .maybeSingle();

    const { data: helperProfile } = await supabase
      .from('topup_helpers')
      .select('id')
      .eq('user_id', userId)
      .eq('is_active', true)
      .eq('is_verified', true)
      .maybeSingle();

    const isHost = userProfile?.is_host === true && userProfile?.is_agency_owner !== true && !helperProfile;
    if (!userProfile) {
      console.log(`[AdminPhoneAlert] User ${userId} not found`);
      return new Response(
        JSON.stringify({ success: false, reason: 'User not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!isHost) {
      return jsonResponse({ success: true, skipped: true, reason: userProfile.is_agency_owner === true ? 'sender_is_agency_owner' : helperProfile ? 'sender_is_helper' : 'sender_not_host' });
    }

    console.log(`[AdminPhoneAlert] Phone detected from ${isHost ? 'HOST' : 'USER'} ${userId} (${userProfile.display_name}): ${detectedContent}`);

    // Map context type to source_type for the RPC
    const sourceType = contextType === 'video_call' ? 'private_call' 
                     : contextType === 'private_message' ? 'private_message'
                     : contextType === 'live_stream' ? 'live_stream'
                     : contextType === 'party_chat' ? 'chat'
                     : contextType || 'unknown';

    // Call process_contact_violation RPC — handles penalties, violation records & moderation logs
    const { data: rpcResult, error: rpcError } = await supabase.rpc('process_contact_violation', {
      p_host_id: userId,
      p_detected_content: detectedContent,
      p_detected_pattern: 'phone_number',
      p_source_type: sourceType,
      p_source_id: callId || null,
    });

    if (rpcError) {
      console.error('[AdminPhoneAlert] RPC error:', rpcError);
      return jsonResponse({ error: rpcError.message }, 500);
    } else {
      console.log('[AdminPhoneAlert] RPC result:', rpcResult);
    }

    const violationResult = rpcResult || { success: true, beans_deducted: 0 };

    // Create admin notification
    const { data: admins } = await supabase
      .from('admin_users')
      .select('user_id')
      .eq('is_active', true);

    if (admins && admins.length > 0) {
      const notifications = admins
        .filter(a => a.user_id)
        .map(admin => ({
          user_id: admin.user_id,
          type: 'phone_detection_alert',
          title: '🚨 Host Shared Phone Number!',
          message: `${callerName || userProfile.display_name} (UID: ${userProfile.app_uid}) shared phone number in ${sourceType}.`,
          data: {
            violator_id: userId,
            detected_content: detectedContent,
            context_type: contextType,
            call_id: callId,
            violation_result: violationResult,
            timestamp: new Date().toISOString()
          },
          is_read: false
        }));

      if (notifications.length > 0) {
        await supabase.from('notifications').insert(notifications);
        console.log(`[AdminPhoneAlert] Sent ${notifications.length} admin notifications`);
      }
    }

    // Broadcast real-time for admin dashboard
    const channel = supabase.channel('admin-alerts');
    await channel.send({
      event: 'phone_detection',
      payload: {
        userId,
        detectedContent,
        contextType: sourceType,
        callId,
        callerName: callerName || userProfile.display_name,
        userUid: userProfile.app_uid,
        violationResult,
      }
    });

    return new Response(
      JSON.stringify({ success: true, violationResult }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[AdminPhoneAlert] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
