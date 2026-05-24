import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-admin-token, x-client-info, apikey, content-type, x-client-platform, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

// In-memory buffer for accumulating parts (simple solution for serverless)
// Note: In production, consider using external storage for very large files
const partBuffers = new Map<string, { data: Uint8Array[], totalSize: number }>();

// Allowed MIME types for upload
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp',
  'video/mp4', 'video/webm', 'video/quicktime',
  'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/webm',
  'application/octet-stream', // SVGA and binary assets
  'application/json',
  'model/gltf-binary', 'model/gltf+json',
]);

const MAX_FILE_SIZE = 150 * 1024 * 1024; // 150MB max

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
    // Authentication check: app users via JWT, admin panel via x-admin-token.
    const authHeader = req.headers.get('Authorization');
    const adminToken = req.headers.get('x-admin-token');
    let principal: UploadPrincipal | null = null;

    const serviceClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

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
      const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } });
      const { data: { user }, error: authError } = await authClient.auth.getUser();
      if (!authError && user) principal = { id: user.id, kind: 'user' };
    }

    if (!principal) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const R2_ACCESS_KEY_ID = Deno.env.get('R2_ACCESS_KEY_ID');
    const R2_SECRET_ACCESS_KEY = Deno.env.get('R2_SECRET_ACCESS_KEY');
    const R2_ACCOUNT_ID = Deno.env.get('R2_ACCOUNT_ID');
    const R2_BUCKET_NAME = Deno.env.get('R2_BUCKET_NAME');
    const R2_PUBLIC_URL = Deno.env.get('R2_PUBLIC_URL') || 'https://pub-cf8f2b50360c40fd88f5f6a6842f86f3.r2.dev';

    if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_ACCOUNT_ID || !R2_BUCKET_NAME) {
      console.error('Missing R2 configuration');
      return new Response(
        JSON.stringify({ error: 'R2 configuration missing' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const contentType = req.headers.get('content-type') || '';
    
    // Handle JSON actions for multipart upload
    if (contentType.includes('application/json')) {
      const body = await req.json();
      const { action, folder, fileName, fileType, fileSize, partNumber, uploadId, key, parts, partData, totalParts, isLastPart } = body;
      
      // === ACTION: Initialize multipart upload ===
      if (action === 'init-multipart') {
        // Validate file type
        if (fileType && !isAllowedFileType(fileType)) {
          return new Response(
            JSON.stringify({ error: `File type not allowed: ${fileType}` }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        // Validate file size
        if (fileSize && !isAllowedFileSize(fileSize)) {
          return new Response(
            JSON.stringify({ error: `File size exceeds maximum allowed (${MAX_FILE_SIZE / (1024*1024)}MB)` }),
            { status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        const generatedKey = scopedKey(principal, folder, fileName || 'file');
        
        const newUploadId = await initiateMultipartUpload(
          generatedKey,
          fileType || 'application/octet-stream',
          R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ACCOUNT_ID, R2_BUCKET_NAME
        );
        
        console.log(`[Multipart] Initiated: ${generatedKey} (uploadId: ${newUploadId.substring(0, 20)}..., fileSize: ${fileSize})`);
        
        return new Response(
          JSON.stringify({ success: true, uploadId: newUploadId, key: generatedKey }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // === ACTION: Upload a single part (PROXY - edge function uploads to R2) ===
      if (action === 'upload-part') {
        if (!uploadId || !key || !partNumber || !partData) {
          return new Response(
            JSON.stringify({ error: 'Missing uploadId, key, partNumber, or partData' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (!keyBelongsToPrincipal(key, principal)) {
          return new Response(
            JSON.stringify({ error: 'Invalid upload key' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        // Decode base64 data
        const binaryString = atob(partData);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        
        const partSizeMB = (bytes.length / (1024 * 1024)).toFixed(2);
        console.log(`[Multipart] Received part ${partNumber}/${totalParts || '?'} (${partSizeMB}MB, isLast: ${isLastPart})`);
        
        // Upload the part directly to R2
        const etag = await uploadPart(
          key, uploadId, partNumber, bytes,
          R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ACCOUNT_ID, R2_BUCKET_NAME
        );
        
        console.log(`[Multipart] Part ${partNumber} uploaded for: ${key} (ETag: ${etag})`);
        
        return new Response(
          JSON.stringify({ success: true, etag, partNumber }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // === ACTION: Complete multipart upload ===
      if (action === 'complete-multipart') {
        if (!uploadId || !key || !parts || !Array.isArray(parts)) {
          return new Response(
            JSON.stringify({ error: 'Missing uploadId, key, or parts array' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (!keyBelongsToPrincipal(key, principal)) {
          return new Response(
            JSON.stringify({ error: 'Invalid upload key' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        console.log(`[Multipart] Completing upload with ${parts.length} parts for: ${key}`);
        
        await completeMultipartUpload(
          key, uploadId, parts,
          R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ACCOUNT_ID, R2_BUCKET_NAME
        );
        
        const publicUrl = `${R2_PUBLIC_URL}/${key}`;
        console.log(`[Multipart] Complete: ${publicUrl}`);
        
        return new Response(
          JSON.stringify({ success: true, url: publicUrl }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: 'Unknown action' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Handle direct multipart upload (for smaller files < 50MB)
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File;
      const folder = formData.get('folder') as string || 'uploads';

      if (!file) {
        return new Response(
          JSON.stringify({ error: 'No file provided' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Validate file type
      if (!isAllowedFileType(file.type)) {
        return new Response(
          JSON.stringify({ error: `File type not allowed: ${file.type}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Validate file size
      if (!isAllowedFileSize(file.size)) {
        return new Response(
          JSON.stringify({ error: `File size exceeds maximum allowed (${MAX_FILE_SIZE / (1024*1024)}MB)` }),
          { status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (file.size > 50 * 1024 * 1024) {
        return new Response(
          JSON.stringify({ 
            error: 'File too large for direct upload. Use multipart upload method.',
            useMultipart: true
          }),
          { status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`[Direct] Uploading: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`);

      const key = scopedKey(principal, folder, file.name);

      const fileBuffer = await file.arrayBuffer();
      const fileBytes = new Uint8Array(fileBuffer);
      
      const publicUrlResult = await uploadToR2Direct(
        fileBytes, key,
        file.type || 'application/octet-stream',
        R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ACCOUNT_ID, R2_BUCKET_NAME, R2_PUBLIC_URL
      );

      console.log(`[Direct] Success: ${publicUrlResult}`);

      return new Response(
        JSON.stringify({ 
          success: true, 
          url: publicUrlResult,
          key: key,
          size: file.size,
          type: file.type
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid request format. Use multipart/form-data or application/json.' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in r2-upload:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ============= S3 Multipart Upload Functions =============

async function initiateMultipartUpload(
  key: string,
  contentType: string,
  accessKeyId: string,
  secretAccessKey: string,
  accountId: string,
  bucketName: string
): Promise<string> {
  const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
  const url = `${endpoint}/${bucketName}/${key}?uploads`;
  
  const headers = await signRequest('POST', `/${bucketName}/${key}`, 'uploads=', {
    'content-type': contentType,
  }, accessKeyId, secretAccessKey, accountId);
  
  const response = await fetch(url, { method: 'POST', headers });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('InitiateMultipartUpload failed:', errorText);
    throw new Error(`Failed to initiate multipart upload: ${response.status}`);
  }
  
  const xmlText = await response.text();
  const uploadIdMatch = xmlText.match(/<UploadId>([^<]+)<\/UploadId>/);
  if (!uploadIdMatch) {
    throw new Error('Could not parse UploadId from response');
  }
  
  return uploadIdMatch[1];
}

// Upload a single part (server-side proxy to avoid CORS issues)
async function uploadPart(
  key: string,
  uploadId: string,
  partNumber: number,
  data: Uint8Array,
  accessKeyId: string,
  secretAccessKey: string,
  accountId: string,
  bucketName: string
): Promise<string> {
  const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
  const queryString = `partNumber=${partNumber}&uploadId=${encodeURIComponent(uploadId)}`;
  const url = `${endpoint}/${bucketName}/${key}?${queryString}`;
  
  const contentHash = await sha256Bytes(data);
  
  const headers = await signRequest('PUT', `/${bucketName}/${key}`, queryString, {
    'content-length': data.length.toString(),
  }, accessKeyId, secretAccessKey, accountId, contentHash);
  
  const response = await fetch(url, { 
    method: 'PUT', 
    headers, 
    body: data.buffer as ArrayBuffer 
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`UploadPart ${partNumber} failed:`, errorText);
    throw new Error(`Failed to upload part ${partNumber}: ${response.status}`);
  }
  
  const etag = response.headers.get('ETag') || `"part-${partNumber}"`;
  return etag;
}

async function completeMultipartUpload(
  key: string,
  uploadId: string,
  parts: { PartNumber: number; ETag: string }[],
  accessKeyId: string,
  secretAccessKey: string,
  accountId: string,
  bucketName: string
): Promise<void> {
  const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
  const url = `${endpoint}/${bucketName}/${key}?uploadId=${encodeURIComponent(uploadId)}`;
  
  // Sort parts by PartNumber
  const sortedParts = parts.sort((a, b) => a.PartNumber - b.PartNumber);
  
  const partsXml = sortedParts.map(p => 
    `<Part><PartNumber>${p.PartNumber}</PartNumber><ETag>${p.ETag}</ETag></Part>`
  ).join('');
  const body = `<CompleteMultipartUpload>${partsXml}</CompleteMultipartUpload>`;
  
  const bodyBytes = new TextEncoder().encode(body);
  const contentHash = await sha256Bytes(bodyBytes);
  
  const headers = await signRequest('POST', `/${bucketName}/${key}`, `uploadId=${encodeURIComponent(uploadId)}`, {
    'content-type': 'application/xml',
    'content-length': bodyBytes.length.toString(),
  }, accessKeyId, secretAccessKey, accountId, contentHash);
  
  const response = await fetch(url, { method: 'POST', headers, body });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('CompleteMultipartUpload failed:', errorText);
    throw new Error(`Failed to complete multipart upload: ${response.status}`);
  }
}

// Direct upload for small files
async function uploadToR2Direct(
  fileBytes: Uint8Array,
  key: string,
  contentType: string,
  accessKeyId: string,
  secretAccessKey: string,
  accountId: string,
  bucketName: string,
  publicBaseUrl: string
): Promise<string> {
  const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
  const url = `${endpoint}/${bucketName}/${key}`;
  
  const contentHash = await sha256Bytes(fileBytes);
  
  const headers = await signRequest('PUT', `/${bucketName}/${key}`, '', {
    'content-type': contentType,
    'content-length': fileBytes.length.toString(),
  }, accessKeyId, secretAccessKey, accountId, contentHash);
  
  const response = await fetch(url, { method: 'PUT', headers, body: fileBytes.buffer as ArrayBuffer });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('Direct upload failed:', errorText);
    throw new Error(`Upload failed: ${response.status}`);
  }
  
  return `${publicBaseUrl}/${key}`;
}

// ============= AWS Signature V4 Helpers =============

async function signRequest(
  method: string,
  canonicalUri: string,
  queryString: string,
  extraHeaders: Record<string, string>,
  accessKeyId: string,
  secretAccessKey: string,
  accountId: string,
  contentHash?: string
): Promise<Record<string, string>> {
  const date = new Date();
  const dateString = date.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 8);
  const dateTimeString = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const region = 'auto';
  const service = 's3';
  
  const payloadHash = contentHash || 'UNSIGNED-PAYLOAD';
  
  const headers: Record<string, string> = {
    'host': `${accountId}.r2.cloudflarestorage.com`,
    'x-amz-date': dateTimeString,
    'x-amz-content-sha256': payloadHash,
    ...extraHeaders,
  };
  
  const signedHeaders = Object.keys(headers).sort().join(';');
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map(k => `${k}:${headers[k]}`)
    .join('\n') + '\n';
  
  const canonicalRequest = [
    method,
    canonicalUri,
    queryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');
  
  const canonicalRequestHash = await sha256(canonicalRequest);
  const credentialScope = `${dateString}/${region}/${service}/aws4_request`;
  
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    dateTimeString,
    credentialScope,
    canonicalRequestHash,
  ].join('\n');
  
  const signingKey = await getSignatureKey(secretAccessKey, dateString, region, service);
  const signature = await hmacHex(signingKey, stringToSign);
  
  return {
    ...headers,
    'Authorization': `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes.buffer as ArrayBuffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hmac(key: ArrayBuffer | string, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    typeof key === 'string' ? new TextEncoder().encode(key) : key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data));
}

async function hmacHex(key: ArrayBuffer, data: string): Promise<string> {
  const result = await hmac(key, data);
  return Array.from(new Uint8Array(result))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function getSignatureKey(
  key: string,
  dateStamp: string,
  regionName: string,
  serviceName: string
): Promise<ArrayBuffer> {
  const kDate = await hmac(`AWS4${key}`, dateStamp);
  const kRegion = await hmac(kDate, regionName);
  const kService = await hmac(kRegion, serviceName);
  const kSigning = await hmac(kService, 'aws4_request');
  return kSigning;
}
