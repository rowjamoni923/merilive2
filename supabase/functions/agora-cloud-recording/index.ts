import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// Helper to get Agora credentials from DB first, then env vars
async function getAgoraCredentials(supabase: any): Promise<{ appId: string; appCertificate: string }> {
  let appId = Deno.env.get("AGORA_APP_ID") || "";
  let appCertificate = Deno.env.get("AGORA_APP_CERTIFICATE") || "";

  try {
    const { data: agoraSettings } = await supabase
      .from("app_settings")
      .select("setting_key, setting_value")
      .in("setting_key", ["agora_app_id", "agora_app_certificate"]);

    if (agoraSettings && agoraSettings.length > 0) {
      for (const s of agoraSettings) {
        const val = (typeof s.setting_value === "string" ? s.setting_value : String(s.setting_value || "")).trim();
        if (val) {
          if (s.setting_key === "agora_app_id") appId = val;
          if (s.setting_key === "agora_app_certificate") appCertificate = val;
        }
      }
    }
  } catch (e) {
    console.warn("Failed to read Agora settings from DB, using env vars:", e);
  }

  return { appId, appCertificate };
}

// Agora Cloud Recording API base URL
const AGORA_API_BASE = "https://api.agora.io/v1/apps";

// Generate Agora authorization header (Basic Auth with Customer ID and Secret)
// Note: You need to set AGORA_CUSTOMER_ID and AGORA_CUSTOMER_SECRET in your secrets
const AGORA_CUSTOMER_ID = Deno.env.get("AGORA_CUSTOMER_ID") || "";
const AGORA_CUSTOMER_SECRET = Deno.env.get("AGORA_CUSTOMER_SECRET") || "";

// Backblaze B2 Storage Configuration
const B2_KEY_ID = Deno.env.get("B2_KEY_ID") || "";
const B2_APPLICATION_KEY = Deno.env.get("B2_APPLICATION_KEY") || "";
const B2_BUCKET_NAME = Deno.env.get("B2_BUCKET_NAME") || "";
const B2_ENDPOINT = Deno.env.get("B2_ENDPOINT") || "";

// Map B2 endpoint to Agora region code
function getB2RegionCode(): number {
  // Backblaze B2 uses S3-compatible API (vendor 0 for S3-compatible)
  // Region mapping for Agora:
  // 0: CN_HZ, 1: CN_SH, 2: CN_GZ, 3: CN_BJ
  // 4: US_EAST_1, 5: US_EAST_2, 6: US_WEST_1, 7: US_WEST_2
  // 8: AP_SOUTHEAST_1, 9: AP_SOUTHEAST_2, 10: AP_NORTHEAST_1
  // 11: AP_NORTHEAST_2, 12: EU_WEST_1, 13: EU_WEST_2, 14: EU_CENTRAL_1
  
  if (B2_ENDPOINT.includes("us-west")) return 7; // US West
  if (B2_ENDPOINT.includes("us-east")) return 4; // US East
  if (B2_ENDPOINT.includes("eu-central")) return 14; // EU Central
  return 7; // Default to US West
}

function getAgoraAuthHeader(): string {
  const credentials = btoa(`${AGORA_CUSTOMER_ID}:${AGORA_CUSTOMER_SECRET}`);
  return `Basic ${credentials}`;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const url = new URL(req.url);
    const path = url.pathname.split("/").pop();
    const body = req.method === "POST" ? await req.json() : {};

    // Get Agora credentials from DB (admin panel) first, then env vars
    const { appId: AGORA_APP_ID } = await getAgoraCredentials(supabase);

    if (!AGORA_APP_ID) {
      return new Response(
        JSON.stringify({ error: "Agora App ID not configured. Please set it in Admin Panel → Agora Settings." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    switch (path) {
      case "start": {
        // Start cloud recording for a live stream
        const { streamId, channelName, hostUid, token } = body;

        if (!streamId || !channelName) {
          return new Response(
            JSON.stringify({ error: "Missing required parameters" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Get host info from profiles
        const { data: stream } = await supabase
          .from("live_streams")
          .select("host_id, title, profiles:host_id(display_name, app_uid)")
          .eq("id", streamId)
          .single();

        const hostInfo = stream?.profiles as any;

        // Step 1: Acquire resource
        const acquireRes = await fetch(
          `${AGORA_API_BASE}/${AGORA_APP_ID}/cloud_recording/acquire`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: getAgoraAuthHeader(),
            },
            body: JSON.stringify({
              cname: channelName,
              uid: hostUid || "999999",
              clientRequest: {
                resourceExpiredHour: 24,
                scene: 0, // Real-time communication scene
              },
            }),
          }
        );

        const acquireData = await acquireRes.json();
        
        if (!acquireData.resourceId) {
          console.error("Failed to acquire resource:", acquireData);
          return new Response(
            JSON.stringify({ error: "Failed to acquire recording resource", details: acquireData }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const resourceId = acquireData.resourceId;

        // Step 2: Start recording
        const startRes = await fetch(
          `${AGORA_API_BASE}/${AGORA_APP_ID}/cloud_recording/resourceid/${resourceId}/mode/mix/start`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: getAgoraAuthHeader(),
            },
            body: JSON.stringify({
              cname: channelName,
              uid: hostUid || "999999",
              clientRequest: {
                token: token || "",
                recordingConfig: {
                  maxIdleTime: 120, // Stop recording if idle for 2 minutes
                  streamTypes: 2, // Audio and video
                  channelType: 1, // Live broadcast
                  videoStreamType: 0, // High-quality stream
                  transcodingConfig: {
                    height: 720,
                    width: 1280,
                    bitrate: 2000,
                    fps: 30,
                    mixedVideoLayout: 1, // Floating layout
                    backgroundColor: "#000000",
                  },
                  subscribeVideoUids: ["#allstream#"],
                  subscribeAudioUids: ["#allstream#"],
                },
                recordingFileConfig: {
                  avFileType: ["hls", "mp4"],
                },
                storageConfig: {
                  vendor: 0, // S3-compatible storage (Backblaze B2)
                  region: getB2RegionCode(),
                  bucket: B2_BUCKET_NAME,
                  accessKey: B2_KEY_ID,
                  secretKey: B2_APPLICATION_KEY,
                  fileNamePrefix: ["recordings", channelName],
                  extensionParams: {
                    sse: "none",
                    tag: "merilive-recording",
                  },
                },
              },
            }),
          }
        );

        const startData = await startRes.json();

        if (!startData.sid) {
          console.error("Failed to start recording:", startData);
          return new Response(
            JSON.stringify({ error: "Failed to start recording", details: startData }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Save recording metadata to database
        const { data: recording, error: insertError } = await supabase
          .from("stream_recordings")
          .insert({
            stream_id: streamId,
            host_id: stream?.host_id,
            host_uid: hostInfo?.app_uid,
            host_name: hostInfo?.display_name,
            recording_sid: startData.sid,
            resource_id: resourceId,
            channel_name: channelName,
            status: "recording",
            started_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (insertError) {
          console.error("Failed to save recording metadata:", insertError);
        }

        return new Response(
          JSON.stringify({
            success: true,
            recordingId: recording?.id,
            sid: startData.sid,
            resourceId,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "stop": {
        // Stop cloud recording
        const { recordingId, resourceId, sid, channelName, hostUid } = body;

        if (!resourceId || !sid || !channelName) {
          return new Response(
            JSON.stringify({ error: "Missing required parameters" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Stop the recording
        const stopRes = await fetch(
          `${AGORA_API_BASE}/${AGORA_APP_ID}/cloud_recording/resourceid/${resourceId}/sid/${sid}/mode/mix/stop`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: getAgoraAuthHeader(),
            },
            body: JSON.stringify({
              cname: channelName,
              uid: hostUid || "999999",
              clientRequest: {},
            }),
          }
        );

        const stopData = await stopRes.json();

        // Get stream stats
        const { data: stream } = await supabase
          .from("live_streams")
          .select("viewer_count, total_gifts, total_coins_earned")
          .eq("id", recordingId ? (await supabase.from("stream_recordings").select("stream_id").eq("id", recordingId).single()).data?.stream_id : "")
          .single();

        // Update recording in database
        if (recordingId) {
          const recordingUrl = stopData.serverResponse?.fileList?.[0]?.fileName || null;
          
          await supabase
            .from("stream_recordings")
            .update({
              status: "processing",
              ended_at: new Date().toISOString(),
              recording_url: recordingUrl,
              total_viewers: stream?.viewer_count || 0,
              total_gifts: stream?.total_gifts || 0,
              total_coins: stream?.total_coins_earned || 0,
              metadata: stopData.serverResponse || {},
            })
            .eq("id", recordingId);

          // After processing, update status to ready
          setTimeout(async () => {
            await supabase
              .from("stream_recordings")
              .update({ status: "ready" })
              .eq("id", recordingId);
          }, 5000);
        }

        return new Response(
          JSON.stringify({
            success: true,
            recordingUrl: stopData.serverResponse?.fileList?.[0]?.fileName,
            serverResponse: stopData.serverResponse,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "query": {
        // Query recording status
        const { resourceId, sid } = body;

        if (!resourceId || !sid) {
          return new Response(
            JSON.stringify({ error: "Missing required parameters" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const queryRes = await fetch(
          `${AGORA_API_BASE}/${AGORA_APP_ID}/cloud_recording/resourceid/${resourceId}/sid/${sid}/mode/mix/query`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              Authorization: getAgoraAuthHeader(),
            },
          }
        );

        const queryData = await queryRes.json();

        return new Response(
          JSON.stringify(queryData),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "list": {
        // List recordings for admin
        const hostUid = url.searchParams.get("hostUid");
        const status = url.searchParams.get("status");
        const limit = parseInt(url.searchParams.get("limit") || "50");
        const offset = parseInt(url.searchParams.get("offset") || "0");

        let query = supabase
          .from("stream_recordings")
          .select(`
            *,
            host:profiles!stream_recordings_host_id_fkey(
              id, display_name, avatar_url, app_uid, is_verified
            )
          `)
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1);

        if (hostUid) {
          query = query.eq("host_uid", hostUid);
        }

        if (status && status !== "all") {
          query = query.eq("status", status);
        }

        // Only show non-expired recordings (15 days)
        query = query.gte("expires_at", new Date().toISOString());

        const { data: recordings, error, count } = await query;

        if (error) {
          return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ recordings, total: count }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: "Unknown action" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (error: unknown) {
    console.error("Cloud recording error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
