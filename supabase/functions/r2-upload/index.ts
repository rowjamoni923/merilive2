import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-admin-token, x-client-info, apikey, content-type, x-client-platform, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

// Allowed MIME types for upload
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp',
  'video/mp4', 'video/webm', 'video/quicktime',
  'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/webm',
  'application/octet-stream', // SVGA and binary assets
  'application/json',
  'model/gltf-binary', 'model/gltf+json',
]);

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB max per user request
const SUPABASE_FALLBACK_BUCKET = 'gifts'; // Use the main gifts bucket as fallback

type UploadPrincipal = {
  id: string;
  kind: 'user' | 'admin';
};

function isAllowedFileType(mimeType: string): boolean {
  if (!mimeType) return false;
  return ALLOWED_MIME_TYPES.has(mimeType.toLowerCase().split(';')[0].trim());
}

function isAllowedFileSize(size: number): boolean {
  return size > 0 && size <= MAX_FILE_SIZE;
}

function safeSegment(value: unknown, fallback = 'uploads'): string {
  const clean = String(value || fallback)
    .replace(/\\/g, '/')
    .split('/')
    .map((part) => part.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+$/, '').slice(0, 80))
    .filter(Boolean)
    .join('/');
  return clean && !clean.includes('..') ? clean : fallback;
}

function scopedKey(principal: UploadPrincipal, folder: unknown, fileName: unknown): string {
  const timestamp = Date.now();
  const cleanFolder = safeSegment(folder, 'uploads');
  const cleanFileName = safeSegment(fileName, 'file').split('/').pop() || 'file';
  const prefix = principal.kind === 'admin' ? `admin/${principal.id}` : principal.id;
  return `${prefix}/${cleanFolder}/${timestamp}_${cleanFileName}`;
}

function keyBelongsToPrincipal(key: unknown, principal: UploadPrincipal): key is string {
  if (typeof key !== 'string' || !key || key.includes('..') || key.startsWith('/')) return false;
  const prefix = principal.kind === 'admin' ? `admin/${principal.id}/` : `${principal.id}/`;
  return key.startsWith(prefix);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authentication check
    const authHeader = req.headers.get('Authorization');
    const adminToken = req.headers.get('x-admin-token');
    let principal: UploadPrincipal | null = null;

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    if (adminToken && adminToken.length >= 16) {
      const { data: sessionRow } = await serviceClient
        .from('admin_sessions')
        .select('admin_user_id')
        .eq('session_token', adminToken)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();
      if (sessionRow?.admin_user_id) {
        const { data: adminUser } = await serviceClient
          .from('admin_users')
          .select('id')
          .eq('id', sessionRow.admin_user_id)
          .eq('is_active', true)
          .maybeSingle();
        if (adminUser?.id) principal = { id: adminUser.id, kind: 'admin' };
      }
    }

    if (!principal && authHeader) {
      const authClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } });
      const { data: { user }, error: authError } = await authClient.auth.getUser();
      if (!authError && user) principal = { id: user.id, kind: 'user' };
    }

    if (!principal) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // R2 Configuration with trimming for reliability
    const R2_ACCESS_KEY_ID = Deno.env.get('R2_ACCESS_KEY_ID')?.trim();
    const R2_SECRET_ACCESS_KEY = Deno.env.get('R2_SECRET_ACCESS_KEY')?.trim();
    const R2_ACCOUNT_ID = Deno.env.get('R2_ACCOUNT_ID')?.trim();
    const R2_BUCKET_NAME = Deno.env.get('R2_BUCKET_NAME')?.trim();
    const R2_PUBLIC_URL = Deno.env.get('R2_PUBLIC_URL')?.trim() || 'https://pub-cf8f2b50360c40fd88f5f6a6842f86f3.r2.dev';

    if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_ACCOUNT_ID || !R2_BUCKET_NAME) {
      console.error('Missing R2 configuration');
      return new Response(
        JSON.stringify({ error: 'R2 configuration missing. Please set R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ACCOUNT_ID, and R2_BUCKET_NAME.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const contentType = req.headers.get('content-type') || '';
    const urlObj = new URL(req.url);
    const queryAction = urlObj.searchParams.get('action');

    // === ACTION: Upload part (Binary) ===
    if (queryAction === 'upload-part') {
      const uploadId = urlObj.searchParams.get('uploadId');
      const key = urlObj.searchParams.get('key');
      const partNumber = parseInt(urlObj.searchParams.get('partNumber') || '0');

      if (!uploadId || !key || !partNumber) {
        return new Response(JSON.stringify({ error: 'Missing uploadId, key, or partNumber in query' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (!keyBelongsToPrincipal(key, principal)) {
        return new Response(JSON.stringify({ error: 'Invalid upload key' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const bytes = new Uint8Array(await req.arrayBuffer());
      if (bytes.length === 0) {
        return new Response(JSON.stringify({ error: 'Empty body' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const etag = await uploadPart(
        key, uploadId, partNumber, bytes,
        R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ACCOUNT_ID, R2_BUCKET_NAME
      );
      
      return new Response(
        JSON.stringify({ success: true, etag, partNumber }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // === JSON Actions ===
    if (contentType.includes('application/json')) {
      const body = await req.json();
      const { action, folder, fileName, fileType, fileSize, partNumber, uploadId, key, parts } = body;
      
      if (action === 'init-multipart') {
        if (fileType && !isAllowedFileType(fileType)) {
          return new Response(JSON.stringify({ error: `File type not allowed: ${fileType}` }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        
        const generatedKey = scopedKey(principal, folder, fileName || 'file');
        
        try {
          const newUploadId = await initiateMultipartUpload(
            generatedKey,
            fileType || 'application/octet-stream',
            R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ACCOUNT_ID, R2_BUCKET_NAME
          );
          return new Response(
            JSON.stringify({ success: true, uploadId: newUploadId, key: generatedKey }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } catch (err: any) {
          console.error('R2 init failed, checking if it is HandshakeFailure:', err);
          if (err.message?.includes('HandshakeFailure') || err.message?.includes('Connect')) {
             return new Response(
               JSON.stringify({ error: 'Cloudflare R2 SSL Handshake Failure. Your R2 account might be suspended or misconfigured. Falling back to Supabase...', isHandshakeError: true }),
               { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
             );
          }
          throw err;
        }
      }
      
      if (action === 'complete-multipart') {
        if (!uploadId || !key || !parts || !Array.isArray(parts)) {
          return new Response(JSON.stringify({ error: 'Missing uploadId, key, or parts array' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        
        await completeMultipartUpload(
          key, uploadId, parts,
          R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ACCOUNT_ID, R2_BUCKET_NAME
        );
        
        const publicUrl = `${R2_PUBLIC_URL}/${key}`;
        return new Response(
          JSON.stringify({ success: true, url: publicUrl }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Direct upload
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File;
      const folder = formData.get('folder') as string || 'uploads';

      if (!file) {
        return new Response(JSON.stringify({ error: 'No file provided' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const key = scopedKey(principal, folder, file.name);
      const fileBuffer = await file.arrayBuffer();
      const fileBytes = new Uint8Array(fileBuffer);
      
      let publicUrlResult: string;
      try {
        publicUrlResult = await uploadToR2Direct(
          fileBytes, key,
          file.type || 'application/octet-stream',
          R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ACCOUNT_ID, R2_BUCKET_NAME, R2_PUBLIC_URL
        );
      } catch (r2Error: any) {
        console.warn('R2 direct upload failed, falling back to Supabase Storage:', r2Error);
        publicUrlResult = await uploadToSupabaseFallback(
          serviceClient,
          fileBytes,
          key,
          file.type || 'application/octet-stream'
        );
      }

      return new Response(
        JSON.stringify({ success: true, url: publicUrlResult, key }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify({ error: 'Unsupported request' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    console.error('Critical error in r2-upload:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal Server Error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// === S3 API Implementation ===

async function initiateMultipartUpload(key: string, contentType: string, accessKeyId: string, secretAccessKey: string, accountId: string, bucketName: string): Promise<string> {
  const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
  const url = `${endpoint}/${bucketName}/${key}?uploads`;
  const headers = await signRequest('POST', `/${bucketName}/${key}`, 'uploads=', { 'content-type': contentType }, accessKeyId, secretAccessKey, accountId);
  const response = await fetch(url, { method: 'POST', headers });
  if (!response.ok) throw new Error(`R2 Initiate failed: ${response.status} ${await response.text()}`);
  const xml = await response.text();
  return xml.match(/<UploadId>([^<]+)<\/UploadId>/)?.[1] || '';
}

async function uploadPart(key: string, uploadId: string, partNumber: number, data: Uint8Array, accessKeyId: string, secretAccessKey: string, accountId: string, bucketName: string): Promise<string> {
  const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
  const qs = `partNumber=${partNumber}&uploadId=${encodeURIComponent(uploadId)}`;
  const url = `${endpoint}/${bucketName}/${key}?${qs}`;
  const contentHash = await sha256Bytes(data);
  const headers = await signRequest('PUT', `/${bucketName}/${key}`, qs, { 'content-length': data.length.toString() }, accessKeyId, secretAccessKey, accountId, contentHash);
  const response = await fetch(url, { method: 'PUT', headers, body: data.buffer as ArrayBuffer });
  if (!response.ok) throw new Error(`R2 UploadPart ${partNumber} failed: ${response.status}`);
  return response.headers.get('ETag') || '';
}

async function completeMultipartUpload(key: string, uploadId: string, parts: { PartNumber: number; ETag: string }[], accessKeyId: string, secretAccessKey: string, accountId: string, bucketName: string): Promise<void> {
  const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
  const url = `${endpoint}/${bucketName}/${key}?uploadId=${encodeURIComponent(uploadId)}`;
  const sortedParts = parts.sort((a, b) => a.PartNumber - b.PartNumber);
  const body = `<CompleteMultipartUpload>${sortedParts.map(p => `<Part><PartNumber>${p.PartNumber}</PartNumber><ETag>${p.ETag}</ETag></Part>`).join('')}</CompleteMultipartUpload>`;
  const bodyBytes = new TextEncoder().encode(body);
  const contentHash = await sha256Bytes(bodyBytes);
  const headers = await signRequest('POST', `/${bucketName}/${key}`, `uploadId=${encodeURIComponent(uploadId)}`, { 'content-type': 'application/xml', 'content-length': bodyBytes.length.toString() }, accessKeyId, secretAccessKey, accountId, contentHash);
  const response = await fetch(url, { method: 'POST', headers, body });
  if (!response.ok) throw new Error(`R2 Complete failed: ${response.status}`);
}

async function uploadToR2Direct(fileBytes: Uint8Array, key: string, contentType: string, accessKeyId: string, secretAccessKey: string, accountId: string, bucketName: string, publicBaseUrl: string): Promise<string> {
  const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
  const url = `${endpoint}/${bucketName}/${key}`;
  const contentHash = await sha256Bytes(fileBytes);
  const headers = await signRequest('PUT', `/${bucketName}/${key}`, '', { 'content-type': contentType, 'content-length': fileBytes.length.toString() }, accessKeyId, secretAccessKey, accountId, contentHash);
  const response = await fetch(url, { method: 'PUT', headers, body: fileBytes.buffer as ArrayBuffer });
  if (!response.ok) throw new Error(`R2 Direct failed: ${response.status}`);
  return `${publicBaseUrl}/${key}`;
}

async function uploadToSupabaseFallback(serviceClient: any, fileBytes: Uint8Array, key: string, contentType: string): Promise<string> {
  const { data, error } = await serviceClient.storage.from(SUPABASE_FALLBACK_BUCKET).upload(key, fileBytes, { contentType, upsert: true });
  if (error) throw error;
  const { data: { publicUrl } } = serviceClient.storage.from(SUPABASE_FALLBACK_BUCKET).getPublicUrl(data.path);
  return publicUrl;
}

// === Auth Helpers ===

async function signRequest(method: string, uri: string, qs: string, extra: Record<string, string>, ak: string, sk: string, account: string, hash?: string): Promise<Record<string, string>> {
  const date = new Date();
  const dateStr = date.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 8);
  const dateTimeStr = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const region = 'auto', service = 's3', payloadHash = hash || 'UNSIGNED-PAYLOAD';
  const headers: Record<string, string> = { 'host': `${account}.r2.cloudflarestorage.com`, 'x-amz-date': dateTimeStr, 'x-amz-content-sha256': payloadHash, ...extra };
  const sortedKeys = Object.keys(headers).sort();
  const signedHeaders = sortedKeys.join(';');
  const canonicalHeaders = sortedKeys.map(k => `${k}:${headers[k]}`).join('\n') + '\n';
  const canonicalRequest = [method, uri, qs, canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const credentialScope = `${dateStr}/${region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', dateTimeStr, credentialScope, await sha256(canonicalRequest)].join('\n');
  const signingKey = await getSignatureKey(sk, dateStr, region, service);
  const signature = await hmacHex(signingKey, stringToSign);
  return { ...headers, 'Authorization': `AWS4-HMAC-SHA256 Credential=${ak}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}` };
}

async function sha256(m: string): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(m)))).map(b => b.toString(16).padStart(2, '0')).join('');
}
async function sha256Bytes(b: Uint8Array): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', b))).map(b => b.toString(16).padStart(2, '0')).join('');
}
async function getSignatureKey(k: string, d: string, r: string, s: string): Promise<ArrayBuffer> {
  const h = async (key: any, data: string) => {
    const ck = await crypto.subtle.importKey('raw', typeof key === 'string' ? new TextEncoder().encode(key) : key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return await crypto.subtle.sign('HMAC', ck, new TextEncoder().encode(data));
  };
  return await h(await h(await h(await h(`AWS4${k}`, d), r), s), 'aws4_request');
}
async function hmacHex(k: ArrayBuffer, d: string): Promise<string> {
  const ck = await crypto.subtle.importKey('raw', k, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', ck, new TextEncoder().encode(d)))).map(b => b.toString(16).padStart(2, '0')).join('');
}
