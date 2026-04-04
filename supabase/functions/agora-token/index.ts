import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============= CONSTANTS =============
const VERSION = "006";

const Privileges = {
  kJoinChannel: 1,
  kPublishAudioStream: 2,
  kPublishVideoStream: 3,
  kPublishDataStream: 4,
};

// ============= CRC32 Implementation =============
const CRC32_TABLE = new Int32Array(256);
(function() {
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
    }
    CRC32_TABLE[n] = c;
  }
})();

function crc32(str: string): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < str.length; i++) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ str.charCodeAt(i)) & 0xFF];
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ============= ByteBuf =============
class ByteBuf {
  buffer: Uint8Array;
  view: DataView;
  position: number;

  constructor(size: number = 1024) {
    this.buffer = new Uint8Array(size);
    this.view = new DataView(this.buffer.buffer);
    this.position = 0;
  }

  private ensureCapacity(size: number) {
    if (this.position + size > this.buffer.length) {
      const newSize = Math.max(this.buffer.length * 2, this.position + size);
      const newBuffer = new Uint8Array(newSize);
      newBuffer.set(this.buffer);
      this.buffer = newBuffer;
      this.view = new DataView(this.buffer.buffer);
    }
  }

  putUint16(v: number): ByteBuf {
    this.ensureCapacity(2);
    this.view.setUint16(this.position, v, true);
    this.position += 2;
    return this;
  }

  putUint32(v: number): ByteBuf {
    this.ensureCapacity(4);
    this.view.setUint32(this.position, v, true);
    this.position += 4;
    return this;
  }

  putBytes(bytes: Uint8Array): ByteBuf {
    this.ensureCapacity(2 + bytes.length);
    this.putUint16(bytes.length);
    this.buffer.set(bytes, this.position);
    this.position += bytes.length;
    return this;
  }

  putString(str: string): ByteBuf {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    return this.putBytes(bytes);
  }

  putRawBytes(bytes: Uint8Array): ByteBuf {
    this.ensureCapacity(bytes.length);
    this.buffer.set(bytes, this.position);
    this.position += bytes.length;
    return this;
  }

  putTreeMapUInt32(map: Record<number, number>): ByteBuf {
    const keys = Object.keys(map);
    this.putUint16(keys.length);
    for (const key of keys) {
      this.putUint16(parseInt(key));
      this.putUint32(map[parseInt(key)]);
    }
    return this;
  }

  pack(): Uint8Array {
    return this.buffer.slice(0, this.position);
  }
}

// ============= HMAC-SHA256 =============
async function encodeHMac(key: string, message: Uint8Array): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(key);
  
  const keyArrayBuffer = new ArrayBuffer(keyData.length);
  new Uint8Array(keyArrayBuffer).set(keyData);
  
  const messageArrayBuffer = new ArrayBuffer(message.length);
  new Uint8Array(messageArrayBuffer).set(message);
  
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, messageArrayBuffer);
  return new Uint8Array(signature);
}

// ============= AccessToken =============
class AccessToken {
  appID: string;
  appCertificate: string;
  channelName: string;
  uid: string;
  messages: Record<number, number>;
  salt: number;
  ts: number;

  constructor(appID: string, appCertificate: string, channelName: string, uid: number) {
    this.appID = appID;
    this.appCertificate = appCertificate;
    this.channelName = channelName;
    this.messages = {};
    this.salt = Math.floor(Math.random() * 0xFFFFFFFF);
    this.ts = Math.floor(Date.now() / 1000) + (24 * 3600);
    this.uid = uid === 0 ? "" : `${uid}`;
  }

  addPrivilege(privilege: number, expireTimestamp: number) {
    this.messages[privilege] = expireTimestamp;
  }

  async build(): Promise<string> {
    const messageBuf = new ByteBuf();
    messageBuf.putUint32(this.salt);
    messageBuf.putUint32(this.ts);
    messageBuf.putTreeMapUInt32(this.messages);
    const m = messageBuf.pack();

    const encoder = new TextEncoder();
    const appIdBytes = encoder.encode(this.appID);
    const channelNameBytes = encoder.encode(this.channelName);
    const uidBytes = encoder.encode(this.uid);
    
    const toSign = new Uint8Array(appIdBytes.length + channelNameBytes.length + uidBytes.length + m.length);
    let offset = 0;
    toSign.set(appIdBytes, offset); offset += appIdBytes.length;
    toSign.set(channelNameBytes, offset); offset += channelNameBytes.length;
    toSign.set(uidBytes, offset); offset += uidBytes.length;
    toSign.set(m, offset);

    const signature = await encodeHMac(this.appCertificate, toSign);
    const crcChannel = crc32(this.channelName) >>> 0;
    const crcUid = crc32(this.uid) >>> 0;

    const contentBuf = new ByteBuf();
    contentBuf.putBytes(signature);
    contentBuf.putUint32(crcChannel);
    contentBuf.putUint32(crcUid);
    contentBuf.putBytes(m);
    const content = contentBuf.pack();

    let binary = '';
    for (let i = 0; i < content.length; i++) {
      binary += String.fromCharCode(content[i]);
    }
    return VERSION + this.appID + btoa(binary);
  }
}

// ============= RtcTokenBuilder =============
class RtcTokenBuilder {
  static async buildTokenWithUid(
    appID: string,
    appCertificate: string,
    channelName: string,
    uid: number,
    role: 'publisher' | 'subscriber',
    privilegeExpiredTs: number
  ): Promise<string> {
    const token = new AccessToken(appID, appCertificate, channelName, uid);
    token.addPrivilege(Privileges.kJoinChannel, privilegeExpiredTs);
    if (role === 'publisher') {
      token.addPrivilege(Privileges.kPublishAudioStream, privilegeExpiredTs);
      token.addPrivilege(Privileges.kPublishVideoStream, privilegeExpiredTs);
      token.addPrivilege(Privileges.kPublishDataStream, privilegeExpiredTs);
    }
    return token.build();
  }
}

// ============= FAST JWT DECODE (no network call) =============
function decodeJwtPayload(token: string): { sub: string; exp: number } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    // Base64url decode
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const decoded = atob(payload);
    const parsed = JSON.parse(decoded);
    if (!parsed.sub || !parsed.exp) return null;
    // Check expiry
    if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return { sub: parsed.sub, exp: parsed.exp };
  } catch {
    return null;
  }
}

// Pre-create supabase client at module level for reuse
let _supabase: any = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
  }
  return _supabase;
}

// ============= MAIN HANDLER - ULTRA-OPTIMIZED FOR SPEED =============
serve(async (req) => {
  // Handle CORS preflight - respond immediately
  if (req.method === 'OPTIONS') {
    return new Response(null, { 
      headers: {
        ...corsHeaders,
        'Cache-Control': 'public, max-age=86400',
      }
    });
  }

  const startTime = performance.now();

  try {
    // ===== FAST AUTH: JWT decode (0ms) instead of getUser() (200-500ms) =====
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const jwtToken = authHeader.replace('Bearer ', '');
    const jwtPayload = decodeJwtPayload(jwtToken);
    
    if (!jwtPayload) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = jwtPayload.sub;

    // Get credentials: DB first (admin panel), then fallback to env vars
    let appId = Deno.env.get('AGORA_APP_ID') || '';
    let appCertificate = Deno.env.get('AGORA_APP_CERTIFICATE') || '';

    try {
      const supabaseAdmin = getSupabase();
      const { data: agoraSettings } = await supabaseAdmin
        .from('app_settings')
        .select('setting_key, setting_value')
        .in('setting_key', ['agora_app_id', 'agora_app_certificate']);

      if (agoraSettings && agoraSettings.length > 0) {
        for (const s of agoraSettings) {
          const val = (typeof s.setting_value === 'string' ? s.setting_value : String(s.setting_value || '')).trim();
          if (val) {
            if (s.setting_key === 'agora_app_id') appId = val;
            if (s.setting_key === 'agora_app_certificate') appCertificate = val;
          }
        }
      }
    } catch (e) {
      console.warn('Failed to read Agora settings from DB, using env vars:', e);
    }

    if (!appId) {
      return new Response(
        JSON.stringify({ error: 'Agora App ID not configured. Please set it in Admin Panel → Agora Settings.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { channelName, uid, role } = await req.json();

    if (!channelName) {
      return new Response(
        JSON.stringify({ error: 'Channel name is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ===== CHANNEL ACCESS VALIDATION (only for restricted channels) =====
    // For live_ channels: no extra DB query needed (public access for viewers)
    // For call_ and party_ channels: validate access
    if (channelName.startsWith('call_')) {
      const supabase = getSupabase();
      const callId = channelName.replace('call_', '');
      const { data: call } = await supabase
        .from('private_calls')
        .select('caller_id, host_id, status')
        .eq('id', callId)
        .maybeSingle();

      if (!call) {
        return new Response(
          JSON.stringify({ error: 'Call not found' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (userId !== call.caller_id && userId !== call.host_id) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized to join this call' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else if (channelName.startsWith('party_')) {
      const supabase = getSupabase();
      const roomId = channelName.replace('party_', '');
      const { data: participant } = await supabase
        .from('party_room_participants')
        .select('id')
        .eq('room_id', roomId)
        .eq('user_id', userId)
        .is('left_at', null)
        .maybeSingle();

      if (!participant) {
        return new Response(
          JSON.stringify({ error: 'Not a participant of this room' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else if (channelName.startsWith('stream_')) {
      // Only validate publisher role for stream channels
      if (role === 'publisher') {
        const supabase = getSupabase();
        const streamId = channelName.replace('stream_', '');
        const { data: stream } = await supabase
          .from('live_streams')
          .select('host_id')
          .eq('id', streamId)
          .eq('is_active', true)
          .maybeSingle();

        if (!stream || userId !== stream.host_id) {
          return new Response(
            JSON.stringify({ error: 'Only the host can publish' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
      // Subscribers (viewers) can join any active stream - no DB query needed
    }
    // live_ channels: NO DB query at all - fastest path for live streaming

    const userRole = role === 'publisher' ? 'publisher' : 'subscriber';
    const userUid = uid || 0;
    const currentTs = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTs + 86400;

    let token: string | null = null;

    if (appCertificate && appCertificate.length > 0) {
      token = await RtcTokenBuilder.buildTokenWithUid(
        appId,
        appCertificate,
        channelName,
        userUid,
        userRole,
        privilegeExpiredTs
      );
    }

    const elapsed = performance.now() - startTime;
    console.log(`⚡ Token generated in ${elapsed.toFixed(0)}ms for ${channelName} (user: ${userId.substring(0, 8)})`);

    return new Response(
      JSON.stringify({
        token,
        appId,
        channel: channelName,
        uid: userUid,
        mode: token ? 'secured' : 'testing',
      }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json',
          'Cache-Control': 'private, max-age=3600',
        } 
      }
    );
  } catch (error: unknown) {
    console.error('Error in agora-token function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Failed to process request', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
