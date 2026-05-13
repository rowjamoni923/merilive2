import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-client-platform, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const fileUrl = url.searchParams.get('url');

    if (!fileUrl) {
      return new Response(
        JSON.stringify({ error: 'URL parameter is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Validate it's a valid URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(fileUrl);
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid URL format' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Extract the key from R2 URL (everything after the domain)
    const isR2Url = fileUrl.includes('.r2.dev') || fileUrl.includes('r2.cloudflarestorage.com');
    
    if (isR2Url) {
      // Use authenticated S3 access for R2 files
      const R2_ACCESS_KEY_ID = Deno.env.get('R2_ACCESS_KEY_ID');
      const R2_SECRET_ACCESS_KEY = Deno.env.get('R2_SECRET_ACCESS_KEY');
      const R2_ACCOUNT_ID = Deno.env.get('R2_ACCOUNT_ID');
      const R2_BUCKET_NAME = Deno.env.get('R2_BUCKET_NAME');

      if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_ACCOUNT_ID || !R2_BUCKET_NAME) {
        console.error('Missing R2 credentials for authenticated access');
        return new Response(
          JSON.stringify({ error: 'R2 credentials not configured' }),
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      // Extract key from URL - handle both public URL and S3 URL formats
      let key = '';
      if (fileUrl.includes('.r2.dev/')) {
        // Public URL format: https://pub-xxx.r2.dev/folder/file.svga
        key = fileUrl.split('.r2.dev/')[1];
      } else if (fileUrl.includes('r2.cloudflarestorage.com/')) {
        // S3 URL format: https://accountid.r2.cloudflarestorage.com/bucket/folder/file.svga
        const parts = fileUrl.split('r2.cloudflarestorage.com/')[1];
        // Remove bucket name prefix if present
        key = parts.startsWith(R2_BUCKET_NAME + '/') 
          ? parts.substring(R2_BUCKET_NAME.length + 1) 
          : parts;
      }

      if (!key) {
        console.error('Could not extract key from URL:', fileUrl);
        return new Response(
          JSON.stringify({ error: 'Could not parse R2 file path' }),
          { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      console.log('Fetching R2 file via authenticated S3 API:', key.split('/').pop());

      // Use authenticated S3 API to get the file
      const response = await fetchFromR2Authenticated(
        key,
        R2_ACCESS_KEY_ID,
        R2_SECRET_ACCESS_KEY,
        R2_ACCOUNT_ID,
        R2_BUCKET_NAME
      );

      if (!response.ok) {
        console.error('R2 fetch failed:', response.status, await response.text());
        return new Response(
          JSON.stringify({ error: `R2 fetch failed: ${response.status}` }),
          { 
            status: response.status, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      const contentType = response.headers.get('Content-Type') || 'application/octet-stream';
      const contentLength = response.headers.get('Content-Length');

      console.log('Streaming R2 file, type:', contentType, 'size:', contentLength || 'unknown');

      const responseHeaders: Record<string, string> = {
        ...corsHeaders,
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=604800', // Cache for 7 days
      };

      if (contentLength) {
        responseHeaders['Content-Length'] = contentLength;
      }

      return new Response(response.body, {
        status: 200,
        headers: responseHeaders,
      });
    }

    // For non-R2 URLs, use simple fetch (fallback)
    console.log('Proxying non-R2 file:', fileUrl.split('/').pop());

    const response = await fetch(fileUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MeriLive/1.0)',
      },
    });

    if (!response.ok) {
      console.error('Failed to fetch file:', response.status, response.statusText);
      return new Response(
        JSON.stringify({ error: `Failed to fetch file: ${response.status}` }),
        { 
          status: response.status, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const contentType = response.headers.get('Content-Type') || 'application/octet-stream';
    const contentLength = response.headers.get('Content-Length');

    const responseHeaders: Record<string, string> = {
      ...corsHeaders,
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=604800',
    };

    if (contentLength) {
      responseHeaders['Content-Length'] = contentLength;
    }

    return new Response(response.body, {
      status: 200,
      headers: responseHeaders,
    });
  } catch (error: unknown) {
    console.error('Proxy error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Proxy failed';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

// ============= Authenticated R2 Fetch using AWS Signature V4 =============

async function fetchFromR2Authenticated(
  key: string,
  accessKeyId: string,
  secretAccessKey: string,
  accountId: string,
  bucketName: string
): Promise<Response> {
  const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
  const url = `${endpoint}/${bucketName}/${key}`;
  
  const headers = await signRequest(
    'GET',
    `/${bucketName}/${key}`,
    '',
    {},
    accessKeyId,
    secretAccessKey,
    accountId
  );
  
  return await fetch(url, { method: 'GET', headers });
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
