import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-client-platform, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const LIVEKIT_URL = Deno.env.get('LIVEKIT_URL') || '';
const LIVEKIT_API_KEY = Deno.env.get('LIVEKIT_API_KEY') || '';
const LIVEKIT_API_SECRET = Deno.env.get('LIVEKIT_API_SECRET') || '';

const R2_ACCESS_KEY_ID = Deno.env.get('R2_ACCESS_KEY_ID') || '';
const R2_SECRET_ACCESS_KEY = Deno.env.get('R2_SECRET_ACCESS_KEY') || '';
const R2_ACCOUNT_ID = Deno.env.get('R2_ACCOUNT_ID') || '';
const R2_BUCKET_NAME = Deno.env.get('R2_BUCKET_NAME') || '';
const R2_PUBLIC_URL = Deno.env.get('R2_PUBLIC_URL') || '';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

// LiveKit API helper - uses LiveKit's REST API for Egress
async function livekitApiRequest(endpoint: string, body: Record<string, unknown>) {
  // Generate LiveKit API JWT
  const token = await generateLiveKitApiToken();
  
  // LiveKit HTTP API base URL (derived from WSS URL)
  const httpUrl = LIVEKIT_URL.replace('wss://', 'https://');
  
  const response = await fetch(`${httpUrl}/twirp/livekit.Egress/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`LiveKit API error (${endpoint}):`, errorText);
    throw new Error(`LiveKit API error: ${response.status} - ${errorText}`);
  }

  return await response.json();
}

// Generate a LiveKit API access token (video grant with egress permissions)
async function generateLiveKitApiToken(): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: LIVEKIT_API_KEY,
    sub: LIVEKIT_API_KEY,
    iat: now,
    nbf: now,
    exp: now + 600, // 10 min
    video: {
      roomCreate: true,
      roomList: true,
      roomRecord: true,
      roomAdmin: true,
      ingressAdmin: true,
    },
    sip: { admin: true },
  };

  const enc = (obj: unknown) => btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const headerB64 = enc(header);
  const payloadB64 = enc(payload);
  const data = `${headerB64}.${payloadB64}`;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(LIVEKIT_API_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  return `${data}.${sigB64}`;
}

// Delete a file from R2 using S3-compatible API
async function deleteFromR2(key: string): Promise<void> {
  const endpoint = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const url = `${endpoint}/${R2_BUCKET_NAME}/${key}`;
  
  const date = new Date();
  const dateString = date.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 8);
  const dateTimeString = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const region = 'auto';
  const service = 's3';
  const payloadHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'; // empty body SHA256

  const headers: Record<string, string> = {
    'host': `${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    'x-amz-date': dateTimeString,
    'x-amz-content-sha256': payloadHash,
  };

  const signedHeaders = Object.keys(headers).sort().join(';');
  const canonicalHeaders = Object.keys(headers).sort().map(k => `${k}:${headers[k]}`).join('\n') + '\n';
  const canonicalUri = `/${R2_BUCKET_NAME}/${key}`;
  const canonicalRequest = `DELETE\n${canonicalUri}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

  const enc = new TextEncoder();
  const crHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(canonicalRequest)))).map(b => b.toString(16).padStart(2, '0')).join('');
  const scope = `${dateString}/${region}/${service}/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${dateTimeString}\n${scope}\n${crHash}`;

  const getSignatureKey = async (key: string, dateStamp: string, regionName: string, serviceName: string) => {
    const kDate = await crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw', enc.encode('AWS4' + key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), enc.encode(dateStamp));
    const kRegion = await crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw', kDate, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), enc.encode(regionName));
    const kService = await crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw', kRegion, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), enc.encode(serviceName));
    return await crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw', kService, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), enc.encode('aws4_request'));
  };

  const sigKey = await getSignatureKey(R2_SECRET_ACCESS_KEY, dateString, region, service);
  const signature = Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw', sigKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), enc.encode(stringToSign)))).map(b => b.toString(16).padStart(2, '0')).join('');

  headers['Authorization'] = `AWS4-HMAC-SHA256 Credential=${R2_ACCESS_KEY_ID}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(url, { method: 'DELETE', headers });
  if (!response.ok && response.status !== 404) {
    console.error('R2 delete failed:', response.status, await response.text());
  } else {
    console.log('R2 file deleted:', key);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const path = url.pathname.split('/').pop();

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    switch (path) {
      case 'start-recording': {
        const { streamId, roomName, hostId } = await req.json();
        
        if (!streamId || !roomName) {
          return new Response(JSON.stringify({ error: 'streamId and roomName required' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Check if room exists first using ListRooms API
        const checkRoomExists = async (): Promise<boolean> => {
          try {
            const token = await generateLiveKitApiToken();
            const httpUrl = LIVEKIT_URL.replace('wss://', 'https://');
            const res = await fetch(`${httpUrl}/twirp/livekit.RoomService/ListRooms`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
              },
              body: JSON.stringify({ names: [roomName] }),
            });
            if (!res.ok) return false;
            const data = await res.json();
            return (data.rooms && data.rooms.length > 0);
          } catch {
            return false;
          }
        };

        // Retry up to 5 times with increasing delays (5s, 8s, 12s, 15s, 20s)
        const delays = [5000, 8000, 12000, 15000, 20000];
        let roomReady = false;
        for (let i = 0; i < delays.length; i++) {
          roomReady = await checkRoomExists();
          if (roomReady) {
            console.log(`Room ${roomName} found after attempt ${i + 1}`);
            break;
          }
          console.log(`Room ${roomName} not ready, waiting ${delays[i]}ms (attempt ${i + 1}/${delays.length})`);
          await new Promise(r => setTimeout(r, delays[i]));
        }

        if (!roomReady) {
          console.warn(`Room ${roomName} never became ready, skipping recording`);
          return new Response(JSON.stringify({ success: false, error: 'Room not ready, recording skipped' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const recordingKey = `recordings/${streamId}/${Date.now()}.mp4`;

        // R2 S3-compatible endpoint for LiveKit Egress
        const s3Config = {
          access_key: R2_ACCESS_KEY_ID,
          secret: R2_SECRET_ACCESS_KEY,
          bucket: R2_BUCKET_NAME,
          endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
          region: 'auto',
          force_path_style: true,
        };

        // Start Room Composite Egress via LiveKit API
        const egressResult = await livekitApiRequest('StartRoomCompositeEgress', {
          room_name: roomName,
          file: {
            file_type: 'MP4',
            filepath: recordingKey,
            s3: s3Config,
          },
          audio_only: false,
        });

        console.log('Egress started:', egressResult.egress_id);

        // Save recording metadata
        const { error: dbError } = await supabase.from('stream_recordings').insert({
          stream_id: streamId,
          host_id: hostId,
          recording_sid: egressResult.egress_id,
          recording_url: R2_PUBLIC_URL ? `${R2_PUBLIC_URL}/${recordingKey}` : recordingKey,
          channel_name: roomName,
          status: 'recording',
          started_at: new Date().toISOString(),
          metadata: { egress_id: egressResult.egress_id, r2_key: recordingKey },
        });

        if (dbError) console.error('DB insert error:', dbError);

        return new Response(JSON.stringify({ 
          success: true, 
          egressId: egressResult.egress_id,
          recordingKey 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'stop-recording': {
        const { egressId, streamId } = await req.json();

        if (!egressId) {
          return new Response(JSON.stringify({ error: 'egressId required' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Stop the egress
        const stopResult = await livekitApiRequest('StopEgress', {
          egress_id: egressId,
        });

        console.log('Egress stopped:', stopResult);

        // Update recording status in DB
        const { error: dbError } = await supabase
          .from('stream_recordings')
          .update({
            status: 'completed',
            ended_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('recording_sid', egressId);

        if (dbError) console.error('DB update error:', dbError);

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'list-recordings': {
        const { streamId, limit = 50, offset = 0 } = await req.json();

        let query = supabase
          .from('stream_recordings')
          .select('*')
          .order('started_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (streamId) {
          query = query.eq('stream_id', streamId);
        }

        // Only show non-expired recordings
        query = query.gt('expires_at', new Date().toISOString());

        const { data, error } = await query;

        if (error) throw error;

        return new Response(JSON.stringify({ recordings: data || [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'list-egresses': {
        // List active egresses from LiveKit
        const result = await livekitApiRequest('ListEgress', {});

        return new Response(JSON.stringify({ egresses: result.items || [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'cleanup-expired': {
        // Get expired recordings with their R2 keys
        const { data: expired, error: fetchErr } = await supabase
          .from('stream_recordings')
          .select('id, metadata, recording_url')
          .lt('expires_at', new Date().toISOString());

        if (fetchErr) throw fetchErr;

        let deletedFromR2 = 0;

        // Delete files from R2
        for (const rec of expired || []) {
          try {
            const r2Key = (rec.metadata as any)?.r2_key;
            if (r2Key) {
              await deleteFromR2(r2Key);
              deletedFromR2++;
            }
          } catch (r2Err) {
            console.error('R2 delete failed for', rec.id, r2Err);
          }
        }

        // Delete from DB
        const { error: delErr } = await supabase
          .from('stream_recordings')
          .delete()
          .lt('expires_at', new Date().toISOString());

        if (delErr) throw delErr;

        return new Response(JSON.stringify({ 
          success: true, 
          deletedCount: expired?.length || 0,
          deletedFromR2,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      default:
        return new Response(JSON.stringify({ error: 'Unknown endpoint' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
  } catch (error) {
    console.error('Egress function error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
