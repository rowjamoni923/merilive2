import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-client-platform, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
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
      return new Response(
        JSON.stringify({ error: 'userId and detectedContent are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is a host
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('id, is_host, display_name, app_uid')
      .eq('id', userId)
      .maybeSingle();

    const isHost = userProfile?.is_host === true;
    if (!userProfile) {
      console.log(`[AdminPhoneAlert] User ${userId} not found`);
      return new Response(
        JSON.stringify({ success: false, reason: 'User not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
      // Fallback: insert directly
      await supabase.from('host_contact_violations').insert({
        host_id: userId,
        violation_number: 1,
        violation_type: 'contact_sharing',
        detected_content: detectedContent,
        detected_pattern: 'phone_number',
        source_type: sourceType,
        source_id: callId || null,
        beans_deducted: 0,
        is_auto_detected: true,
      });
      console.log('[AdminPhoneAlert] Fallback insert done');
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
      type: 'broadcast',
      event: 'phone_detection',
      payload: {
        userId,
        detectedContent,
        contextType: sourceType,
        callId,
        callerName: callerName || userProfile.display_name,
        userUid: userProfile.app_uid,
        timestamp: new Date().toISOString(),
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
